"""Trust layer: the optional duplicate-owner face check, the verified-owner badge and the review
queue (possible duplicate owners and listing flags).

Nothing here blocks, hides or punishes anyone. A check that passes earns the owner a badge; a
face that looks like another account's opens a review item a person looks at; a capture that
does not work only asks the owner to try again.

Templates (256 numbers from the face model, never the video or a photo) are encrypted with
AES-256-GCM, bound to their owner, and kept in the shared document store so every instance of
the app compares against the same gallery. Erasing face data deletes the template, the status
and every review item about that owner.
"""

import base64
import hashlib
import secrets
import time
from typing import Any

import httpx
import numpy as np
import structlog
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi import Request

from .face_transport import worker_headers
from .settings import Settings

log = structlog.get_logger()

TEMPLATE_KIND = "face_template"  # key: uid, scope GALLERY
STATUS_KIND = "trust_status"  # key: uid, scope: uid
REVIEW_KIND = "trust_review"  # key: review id, scope QUEUE
GALLERY = "gallery"
QUEUE = "queue"
GALLERY_LIMIT = 2000
QUEUE_LIMIT = 500
# Cosine similarity of two templates from face-reidentification-retail-0095. Open Model Zoo's
# face recognition demo treats about 0.4 as the same person; 0.55 is stricter. It is not
# calibrated on our owners, and it only ever opens a review a person decides.
DUPLICATE_SIMILARITY = 0.55
FIXTURE_HEADER = "x-face-fixture"


class TemplateVault:
    """AES-256-GCM for face templates; the owner's UID is bound in as associated data."""

    def __init__(self, settings: Settings) -> None:
        secret = (
            settings.face_template_key.get_secret_value()
            or settings.face_worker_token.get_secret_value()
            or ("local-face-fixture-only" if settings.face_mode == "fixture" else "")
        )
        self.key = (
            HKDF(SHA256(), 32, salt=None, info=b"chalkboard-face-template-v1").derive(
                secret.encode()
            )
            if secret
            else None
        )

    def seal(self, uid: str, vector: np.ndarray) -> str:
        if self.key is None:
            raise RuntimeError("No template key configured")
        nonce = secrets.token_bytes(12)
        data = np.asarray(vector, dtype="<f4").tobytes()
        sealed = nonce + AESGCM(self.key).encrypt(nonce, data, uid.encode())
        return base64.b64encode(sealed).decode()

    def open(self, uid: str, sealed: str) -> np.ndarray:
        if self.key is None:
            raise RuntimeError("No template key configured")
        raw = base64.b64decode(sealed)
        data = AESGCM(self.key).decrypt(raw[:12], raw[12:], uid.encode())
        return np.frombuffer(data, dtype="<f4")


def unit(values: Any) -> np.ndarray:
    vector = np.asarray(values, dtype=np.float32).reshape(-1)
    norm = float(np.linalg.norm(vector))
    if vector.size != 256 or not np.isfinite(vector).all() or norm <= 1e-8:
        raise ValueError("Invalid face template")
    return vector / norm


def fixture_template(name: str) -> np.ndarray:
    """A stable stand-in face per name (local preview and tests): same name, same face."""
    seed = int(hashlib.sha256(name.encode()).hexdigest()[:16], 16)
    return unit(np.random.default_rng(seed).normal(size=256))


def docs(request: Request) -> Any:
    community = getattr(request.app.state, "community", None)
    return getattr(community, "docs", None)


def is_admin(settings: Settings, uid: str) -> bool:
    return "*" in settings.trust_admins or uid in settings.trust_admins


# --- Evaluation ---


async def evaluate(
    request: Request, uid: str, prompts: list[str], capture: bytes, content_type: str
) -> dict[str, Any]:
    """The worker's (or fixture's) answer: status live/retry/unavailable, a reason, and the
    template only when the capture was live. The template never leaves the server."""
    settings: Settings = request.app.state.v1_settings
    if settings.face_mode == "fixture":
        if len(capture) < 1024:
            return {"status": "retry", "reason": "capture_not_usable"}
        name = request.headers.get(FIXTURE_HEADER, "")[:80] or uid
        return {
            "status": "live",
            "reason": "ok",
            "liveness": "fixture",
            "template": fixture_template(name).tolist(),
        }
    if not settings.face_worker_token.get_secret_value():
        return {"status": "unavailable", "reason": "worker_unavailable"}
    try:
        async with httpx.AsyncClient(timeout=70, trust_env=False) as client:
            response = await client.post(
                settings.face_worker_url + "/evaluate",
                # bytes, not a bytearray: httpx treats a bytearray as a sync stream and an
                # AsyncClient then fails every capture with a 500.
                content=bytes(capture),
                headers={
                    **await worker_headers(settings, uid),
                    "Content-Type": content_type,
                    "X-Prompts": ",".join(prompts),
                },
            )
    except httpx.HTTPError as error:
        log.warning("face_worker_unreachable", error=type(error).__name__)
        return {"status": "unavailable", "reason": "worker_unavailable"}
    if response.status_code == 429:
        return {"status": "unavailable", "reason": "busy"}
    if not response.is_success:
        log.warning("face_worker_failed", status=response.status_code)
        return {"status": "unavailable", "reason": "worker_unavailable"}
    try:
        data = response.json()
    except ValueError:
        return {"status": "unavailable", "reason": "worker_unavailable"}
    return {k: data[k] for k in ("status", "reason", "liveness", "template") if k in data}


# --- Recording a result and the review queue ---


def status(store: Any, uid: str) -> dict[str, Any]:
    return (store.get(STATUS_KIND, uid) if store else None) or {"face": "not_started"}


def record(
    store: Any,
    vault: TemplateVault,
    uid: str,
    outcome: dict[str, Any],
    shop_names: Any,
) -> dict[str, Any]:
    """Store a live capture's template and compare it with every other owner's.

    Returns what the owner sees: verified, in_review (looks like another account; a person
    will look), or retry/unavailable with a reason. `shop_names(uid)` names an owner's shops
    for the review item, so a reviewer sees shops, not account IDs.
    """
    now = time.time()
    if outcome.get("status") != "live" or "template" not in outcome:
        return {
            "result": "unavailable" if outcome.get("status") == "unavailable" else "retry",
            "reason": outcome.get("reason", "capture_not_usable"),
        }
    try:
        vector = unit(outcome["template"])
    except ValueError:
        return {"result": "retry", "reason": "capture_not_usable"}
    best_uid, best = None, -1.0
    for entry in store.scoped(TEMPLATE_KIND, GALLERY, GALLERY_LIMIT):
        other = entry.get("uid")
        if not other or other == uid:
            continue
        try:
            score = float(np.dot(vector, unit(vault.open(other, entry["sealed"]))))
        except Exception:
            # A template sealed under an older key cannot be read; it is skipped, not fatal.
            continue
        if score > best:
            best_uid, best = other, score
    store.put(
        TEMPLATE_KIND,
        uid,
        GALLERY,
        now,
        {"uid": uid, "sealed": vault.seal(uid, vector), "created": now},
    )
    face = "verified"
    if best_uid and best >= DUPLICATE_SIMILARITY:
        key = "duplicate:" + ":".join(sorted([uid, best_uid]))
        earlier = store.get(REVIEW_KIND, key)
        if earlier and earlier.get("status") == "cleared":
            face = "verified"  # A person already decided these two are different owners.
        else:
            face = "in_review"
            store.put(
                REVIEW_KIND,
                key,
                QUEUE,
                now,
                {
                    "id": key,
                    "kind": "duplicate_owner",
                    "status": "open",
                    "created": (earlier or {}).get("created", now),
                    "updated": now,
                    "owners": [uid, best_uid],
                    "similarity": round(best, 3),
                    "shops": {uid: shop_names(uid), best_uid: shop_names(best_uid)},
                },
            )
    store.put(STATUS_KIND, uid, uid, now, {"face": face, "checked": now})
    log.info("face_check_recorded", result=face)
    return {"result": face, "reason": "ok", "checked": now}


def add_flag(
    store: Any, bid: str, owners: list[str], shop: str, reasons: list[dict[str, Any]]
) -> str | None:
    """Open (or refresh) one listing review for a shop; returns its key while it is open.

    A flag a person already decided with the same reasons keeps that decision; new reasons
    reopen it. An open flag whose reasons are gone (the owner fixed a price) resolves itself."""
    key = f"listing:{bid}"
    earlier = store.get(REVIEW_KIND, key)
    now = time.time()
    if not reasons:
        if earlier and earlier.get("status") == "open":
            resolved = {**earlier, "status": "resolved", "updated": now}
            store.put(REVIEW_KIND, key, QUEUE, earlier["created"], resolved)
        return None
    signature = sorted(reason["rule"] + ":" + reason.get("detail", "") for reason in reasons)
    if earlier and earlier.get("signature") == signature:
        return key if earlier.get("status") == "open" else None
    store.put(
        REVIEW_KIND,
        key,
        QUEUE,
        now,
        {
            "id": key,
            "kind": "listing",
            "status": "open",
            "created": now,
            "updated": now,
            "business_id": bid,
            "shop": shop,
            "owners": owners,
            "reasons": reasons,
            "signature": signature,
        },
    )
    return key


def queue(store: Any) -> list[dict[str, Any]]:
    items = store.scoped(REVIEW_KIND, QUEUE, QUEUE_LIMIT) if store else []
    return sorted(items, key=lambda item: (item.get("status") != "open", -item.get("updated", 0)))


def decide(store: Any, review_id: str, decision: str, admin: str) -> dict[str, Any] | None:
    """A person's decision. "cleared": nothing wrong (the owner's check counts as verified).
    "upheld": the reviewer agrees something is off; the badge stays off. Neither removes or
    hides a shop: any further step is a human conversation with the owner."""
    item = store.get(REVIEW_KIND, review_id)
    if not item:
        return None
    now = time.time()
    item = {**item, "status": decision, "decided": now, "decided_by": admin, "updated": now}
    store.put(REVIEW_KIND, review_id, QUEUE, item.get("created", now), item)
    if item["kind"] == "duplicate_owner":
        newest = item["owners"][0]
        current = status(store, newest)
        if current.get("face") in {"in_review", "not_verified"}:
            face = "verified" if decision == "cleared" else "not_verified"
            store.put(STATUS_KIND, newest, newest, now, {**current, "face": face})
    return item


def owner_notices(store: Any, uid: str) -> list[dict[str, Any]]:
    """What the owner sees about their own open reviews: calm, specific, no other accounts."""
    notices = []
    for item in queue(store):
        if item.get("status") != "open" or uid not in item.get("owners", []):
            continue
        if item["kind"] == "duplicate_owner" and item["owners"][0] == uid:
            notices.append({"id": item["id"], "kind": "duplicate_owner"})
        elif item["kind"] == "listing":
            notices.append(
                {
                    "id": item["id"],
                    "kind": "listing",
                    "business_id": item["business_id"],
                    "shop": item["shop"],
                    # Only rule names and the owner's own values; never another shop's name.
                    "reasons": [
                        {"rule": reason["rule"], "detail": reason.get("owner_detail", "")}
                        for reason in item["reasons"]
                    ],
                }
            )
    return notices


def erase(store: Any, uid: str) -> None:
    """Delete this owner's template, status and every review item about them."""
    if store is None:
        return
    store.delete(TEMPLATE_KIND, uid)
    store.delete(STATUS_KIND, uid)
    for item in store.scoped(REVIEW_KIND, QUEUE, QUEUE_LIMIT):
        if uid in item.get("owners", []):
            store.delete(REVIEW_KIND, item["id"])


def verified_owner(store: Any, owners: list[str]) -> dict[str, Any] | None:
    """The customer badge: an owner of this shop passed the check and nothing is open."""
    if store is None:
        return None
    for uid in owners:
        current = status(store, uid)
        if current.get("face") == "verified":
            return {"checked": current.get("checked")}
    return None
