"""Optional "Verify it's you" face check, the owner's trust status, and the review queue."""

import asyncio
import time
from typing import Any, Literal

import anyio
import httpx
import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from . import fraud, trust
from .face_transport import worker_headers
from .merchant_routes import consented_owner, owner, store

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1")

PRINT_KIND = "photo_print"  # key: "bid/photo", scope: bid
AI_KIND = "fraud_ai"  # key: bid, scope: bid
MAX_PRINTED_PHOTOS = 4
# One scan at a time per instance; a burst of approvals coalesces into the next scan.
scan_lock = asyncio.Lock()


class ChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    business_id: str
    consent: bool
    exclude_prompts: list[str] | None = None


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["cleared", "upheld"]


def vault(request: Request) -> trust.TemplateVault:
    if getattr(request.app.state, "face_vault", None) is None:
        request.app.state.face_vault = trust.TemplateVault(request.app.state.v1_settings)
    return request.app.state.face_vault


def require_docs(request: Request) -> Any:
    docs = trust.docs(request)
    if docs is None:
        raise HTTPException(503, "Trust checks are not enabled.")
    return docs


@router.post("/face/warmup")
@router.get("/face/warmup")
async def face_warmup(request: Request) -> dict[str, Any]:
    """Warm up the private face worker to prevent cold-start latency when the owner scans."""
    uid = await owner(request)
    settings = request.app.state.v1_settings
    if settings.face_mode == "fixture" or not settings.face_worker_token.get_secret_value():
        return {"ready": True, "mode": settings.face_mode}
    started = time.perf_counter()
    try:
        # A cold worker takes about 12 s to load its models; this call is what absorbs it.
        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            resp = await client.get(
                settings.face_worker_url + "/health",
                headers=await worker_headers(settings, uid),
            )
    except Exception as error:
        log.warning("face_warmup_failed", error=type(error).__name__)
        return {"ready": False, "error": "unreachable"}
    log.info(
        "face_warmup",
        http=resp.status_code,
        latency_ms=round((time.perf_counter() - started) * 1000, 1),
    )
    return {"ready": resp.is_success, "status": resp.status_code}


@router.post("/face/challenges")
async def challenge(body: ChallengeRequest, request: Request) -> dict[str, Any]:
    uid = await consented_owner(request)
    if not body.consent:
        raise HTTPException(422, "Camera consent is required for the check. Nothing changed.")
    return await anyio.to_thread.run_sync(
        store(request).challenge, uid, body.business_id, body.exclude_prompts
    )


@router.get("/face/challenges/{challenge_id}")
async def result(challenge_id: str, request: Request) -> dict[str, Any]:
    uid = await owner(request)
    return await anyio.to_thread.run_sync(store(request).result, uid, challenge_id)


@router.post("/face/challenges/{challenge_id}/capture")
async def capture(challenge_id: str, request: Request) -> dict[str, Any]:
    """One short capture: verified, in_review, or retry/unavailable with a reason the app turns
    into a tip. The video stays in memory and is dropped when this request ends."""
    uid = await consented_owner(request)
    service = store(request)
    docs = require_docs(request)
    metadata = await anyio.to_thread.run_sync(service.consume, uid, challenge_id)
    content_type = request.headers.get("content-type", "").split(";")[0]
    if content_type not in {"video/webm", "video/mp4", "application/json", "image/jpeg"}:
        raise HTTPException(415, "Capture must be a browser-recorded video or frame sequence.")
    buffer = bytearray()
    try:
        async with asyncio.timeout(10):
            async for chunk in request.stream():
                if len(buffer) + len(chunk) > 8 * 1024 * 1024:
                    raise HTTPException(413, "Capture exceeds 8 MB.")
                buffer.extend(chunk)
        outcome = await trust.evaluate(
            request, uid, metadata["prompts"], bytes(buffer), content_type
        )
    finally:
        buffer.clear()

    def names(person: str) -> list[str]:
        return [shop["fields"]["name"] for shop in service.list_businesses(person)][:5]

    answer = await anyio.to_thread.run_sync(trust.record, docs, vault(request), uid, outcome, names)
    # The challenge keeps only the owner-facing answer: no template, no scores.
    await anyio.to_thread.run_sync(service.face_result, uid, challenge_id, answer)
    return answer


@router.delete("/face/template")
async def delete_template(request: Request) -> dict[str, str]:
    """Delete the encrypted template, the check result and any review about this owner."""
    uid = await owner(request)
    docs = require_docs(request)
    await anyio.to_thread.run_sync(trust.erase, docs, uid)
    await anyio.to_thread.run_sync(store(request).invalidate_face, uid)
    return {"status": "deleted"}


@router.get("/trust")
async def trust_status(request: Request) -> dict[str, Any]:
    """The owner's check status and open notices; for reviewers, the whole queue."""
    uid = await owner(request)
    docs = trust.docs(request)
    current = await anyio.to_thread.run_sync(trust.status, docs, uid)
    admin = trust.is_admin(request.app.state.v1_settings, uid)
    return {
        "face": current.get("face", "not_started"),
        "checked": current.get("checked"),
        "notices": await anyio.to_thread.run_sync(trust.owner_notices, docs, uid) if docs else [],
        "reviewer": admin,
        **({"queue": await anyio.to_thread.run_sync(review_queue, docs)} if admin else {}),
    }


def review_queue(docs: Any) -> list[dict[str, Any]]:
    """Reviewer view: shop names and reasons, never account IDs."""
    rows = []
    for item in trust.queue(docs):
        row = {k: item[k] for k in ("id", "kind", "status", "created", "updated") if k in item}
        if item["kind"] == "duplicate_owner":
            row["similarity"] = item.get("similarity")
            row["shops"] = [item.get("shops", {}).get(person, []) for person in item["owners"]]
        else:
            row["shop"] = item.get("shop")
            row["business_id"] = item.get("business_id")
            row["reasons"] = [
                {
                    "rule": reason["rule"],
                    "detail": reason["detail"],
                    "source": reason["source"],
                    # For a sentence in the reviewer's language: the item, brand or count, and
                    # the other shop. Older flags have neither; the English detail stays.
                    "owner_detail": reason.get("owner_detail", ""),
                    "other": reason.get("other_name", ""),
                }
                for reason in item.get("reasons", [])
            ]
        rows.append(row)
    return rows


@router.post("/trust/reviews/{review_id}")
async def decide(review_id: str, body: Decision, request: Request) -> dict[str, Any]:
    uid = await owner(request)
    if not trust.is_admin(request.app.state.v1_settings, uid):
        raise HTTPException(403, "Only reviewers can decide reviews.")
    docs = require_docs(request)
    item = await anyio.to_thread.run_sync(trust.decide, docs, review_id, body.decision, uid)
    if item is None:
        raise HTTPException(404, "Review not found.")
    return {"id": review_id, "status": item["status"]}


@router.post("/trust/scan")
async def scan_now(request: Request) -> dict[str, Any]:
    """Reviewers: check every shared shop now (also runs after each approved change)."""
    uid = await owner(request)
    if not trust.is_admin(request.app.state.v1_settings, uid):
        raise HTTPException(403, "Only reviewers can run checks.")
    return {"flagged": await run_scan(request)}


def scan_after_change(request: Request, background: BackgroundTasks, bid: str) -> None:
    """Queue a listing check after an approved change or share; never delays the owner."""
    if trust.docs(request) is not None:
        background.add_task(scan_quietly, request, bid)


async def scan_quietly(request: Request, bid: str) -> None:
    try:
        await run_scan(request, changed=bid)
    except Exception as error:
        log.warning("listing_scan_failed", error=type(error).__name__)


async def run_scan(request: Request, changed: str | None = None) -> int:
    """Rules over all shared shops; Gemini's second look for the changed shop (or all, when a
    reviewer asks). Returns how many shops have an open listing review afterwards."""
    docs = require_docs(request)
    service = store(request)
    reviewer: fraud.FraudReviewer = request.app.state.fraud_reviewer
    async with scan_lock:
        shops = await anyio.to_thread.run_sync(service.shared_shops)
        for shop in shops:
            shop["owners"] = await anyio.to_thread.run_sync(service.owners, shop["id"])
            shop["photo_prints"] = await anyio.to_thread.run_sync(prints, request, docs, shop)
        found = fraud.scan(shops)
        flagged = 0
        for shop in shops:
            if shop.get("demo"):
                continue
            reasons = [{**r, "source": "rules"} for r in found.get(shop["id"], [])]
            reasons += [
                {**r.model_dump(), "source": "gemini"}
                for r in await second_look(docs, reviewer, shop, reasons, changed)
            ]
            key = await anyio.to_thread.run_sync(
                trust.add_flag, docs, shop["id"], shop["owners"], shop["name"], reasons
            )
            flagged += key is not None
        return flagged


async def second_look(
    docs: Any,
    reviewer: fraud.FraudReviewer,
    shop: dict[str, Any],
    found: list[dict[str, Any]],
    changed: str | None,
) -> list[fraud.AiReason]:
    """Gemini's reasons for this listing, cached by its content digest."""
    digest = reviewer.digest(shop)
    cached = await anyio.to_thread.run_sync(docs.get, AI_KIND, shop["id"])
    if cached and cached.get("digest") == digest:
        return [fraud.AiReason.model_validate(r) for r in cached.get("reasons", [])]
    if changed is not None and changed != shop["id"]:
        return []  # Only the changed shop costs a model call on an automatic scan.
    reasons = await reviewer.review(shop, found)
    data = {"digest": digest, "reasons": [r.model_dump() for r in reasons]}
    await anyio.to_thread.run_sync(docs.put, AI_KIND, shop["id"], shop["id"], time.time(), data)
    return reasons


def prints(request: Request, docs: Any, shop: dict[str, Any]) -> list[str]:
    """Difference hashes of the first gallery photos, computed once per photo."""
    photos = request.app.state.photos
    hashes = []
    for photo_id in (shop.get("gallery") or [])[:MAX_PRINTED_PHOTOS]:
        key = f"{shop['id']}/{photo_id}"
        cached = docs.get(PRINT_KIND, key)
        if cached:
            hashes.append(cached["hash"])
            continue
        try:
            image = photos.load_gallery_sync(shop["id"], photo_id) if photos else None
            if not image:
                continue
            value = fraud.dhash(image)
        except Exception:
            continue
        docs.put(PRINT_KIND, key, shop["id"], time.time(), {"hash": value})
        hashes.append(value)
    return hashes
