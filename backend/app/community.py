"""Signed-in customer data: profile, owned threads, follows, the updates feed and tips.

Everything here sits beside, never inside, the merchant store. Customer threads are ordinary shop
inquiries; this module only remembers which signed-in customer owns which thread (and its
capability), so the server verifies ownership instead of trusting a token kept on a device.
Shop updates are derived from real public shop data by comparing snapshots; seeded demo updates
and demo tips are always labelled demo.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from typing import Any, Literal, Protocol
from uuid import uuid4

import structlog
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

MAX_FOLLOWS = 100
MAX_SEARCHES = 10
MAX_THREADS = 50
MAX_TIPPED = 500
# A start that died mid-way frees its shop after this long, so the customer can try again.
CLAIM_SECONDS = 30
TRANSACTION_ATTEMPTS = 10
DAY = 86_400

log = structlog.get_logger()


# --- Storage: one tiny document store with SQLite (local) and Firestore (hosted) adapters. ---

# Reads the current data (None when absent) and returns (created, new data), or None to keep it.
# Firestore may call it more than once when a transaction retries, so it must not have effects.
Change = Callable[[dict[str, Any] | None], tuple[float, dict[str, Any]] | None]


class Documents(Protocol):
    def any_positive(self, kind: str, scope: str, field: str) -> bool: ...
    def purge_before(self, kind: str, cutoff: float) -> None: ...
    def get(self, kind: str, key: str) -> dict[str, Any] | None: ...
    def put(
        self, kind: str, key: str, scope: str, created: float, data: dict[str, Any]
    ) -> None: ...
    def update(self, kind: str, key: str, scope: str, change: Change) -> None:
        """Read-modify-write atomically, across processes and Cloud Run instances."""
        ...

    def delete(self, kind: str, key: str) -> None: ...
    def delete_scope(self, kind: str, scope: str) -> None:
        """Delete every document of this kind in the scope (for erasure)."""
        ...

    def scoped(self, kind: str, scope: str, limit: int = 200) -> list[dict[str, Any]]: ...


class SqliteDocuments:
    def any_positive(self, kind: str, scope: str, field: str) -> bool:
        with self.connect() as db:
            return (
                db.execute(
                    "SELECT 1 FROM community WHERE kind=? AND scope=? "
                    "AND json_extract(fields, ?) > 0 LIMIT 1",
                    (kind, scope, f"$.{field}"),
                ).fetchone()
                is not None
            )

    def purge_before(self, kind: str, cutoff: float) -> None:
        with self.connect() as db:
            db.execute("DELETE FROM community WHERE kind=? AND created<?", (kind, cutoff))

    def __init__(self, path: str) -> None:
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS community(kind TEXT NOT NULL, key TEXT NOT NULL,
                    scope TEXT NOT NULL, created REAL NOT NULL, fields TEXT NOT NULL,
                    PRIMARY KEY(kind, key));
                CREATE INDEX IF NOT EXISTS community_scope ON community(kind, scope, created);
                """
            )

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def get(self, kind: str, key: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT fields FROM community WHERE kind=? AND key=?", (kind, key)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, kind: str, key: str, scope: str, created: float, data: dict[str, Any]) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT INTO community VALUES(?,?,?,?,?) ON CONFLICT(kind,key) DO UPDATE SET "
                "scope=excluded.scope, created=excluded.created, fields=excluded.fields",
                (kind, key, scope, created, json.dumps(data, ensure_ascii=False)),
            )

    def update(self, kind: str, key: str, scope: str, change: Change) -> None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")  # Writers queue here, so no update is lost.
            row = db.execute(
                "SELECT fields FROM community WHERE kind=? AND key=?", (kind, key)
            ).fetchone()
            result = change(json.loads(row[0]) if row else None)
            if result is not None:
                created, data = result
                db.execute(
                    "INSERT INTO community VALUES(?,?,?,?,?) ON CONFLICT(kind,key) DO UPDATE SET "
                    "scope=excluded.scope, created=excluded.created, fields=excluded.fields",
                    (kind, key, scope, created, json.dumps(data, ensure_ascii=False)),
                )

    def delete(self, kind: str, key: str) -> None:
        with self.connect() as db:
            db.execute("DELETE FROM community WHERE kind=? AND key=?", (kind, key))

    def delete_scope(self, kind: str, scope: str) -> None:
        with self.connect() as db:
            db.execute("DELETE FROM community WHERE kind=? AND scope=?", (kind, scope))

    def scoped(self, kind: str, scope: str, limit: int = 200) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT fields FROM community WHERE kind=? AND scope=? "
                "ORDER BY created DESC LIMIT ?",
                (kind, scope, limit),
            ).fetchall()
        return [json.loads(row[0]) for row in rows]


class FirestoreDocuments:
    """Keys are hashed into document IDs, so customer IDs and text never name a path.

    Scoped lists need the composite indexes in firestore.indexes.json (scope ASC, created DESC on
    the thread, update and tip collection groups). Until they are built, lists fall back to an
    equality-only query sorted here, which is correct while a scope holds at most 500 documents.
    """

    FALLBACK_LIMIT = 500

    def any_positive(self, kind: str, scope: str, field: str) -> bool:
        from google.cloud.firestore_v1.base_query import FieldFilter

        # Equality-only query needs no new composite index. Project just the aggregate;
        # stop at the first match and bound the RPC time for a shop with a long history.
        rows = (
            self.root.collection(kind)
            .where(filter=FieldFilter("scope", "==", scope))
            .select([f"data.{field}"])
            .stream(timeout=10)
        )
        try:
            return any((row.to_dict() or {}).get("data", {}).get(field, 0) > 0 for row in rows)
        finally:
            rows.close()

    def purge_before(self, kind: str, cutoff: float) -> None:
        from google.cloud.firestore_v1.base_query import FieldFilter

        query = self.root.collection(kind).where(filter=FieldFilter("created", "<", cutoff))
        while True:
            rows = list(query.limit(400).stream())
            if not rows:
                return
            batch = self.client.batch()
            for row in rows:
                batch.delete(row.reference)
            batch.commit()

    def __init__(self, client: Any, namespace: str) -> None:
        self.client = client
        self.root = client.collection(namespace).document("community")

    def ref(self, kind: str, key: str) -> Any:
        return self.root.collection(kind).document(hashlib.sha256(key.encode()).hexdigest())

    def get(self, kind: str, key: str) -> dict[str, Any] | None:
        snapshot = self.ref(kind, key).get()
        return (snapshot.to_dict() or {}).get("data") if snapshot.exists else None

    def put(self, kind: str, key: str, scope: str, created: float, data: dict[str, Any]) -> None:
        self.ref(kind, key).set({"scope": scope, "created": created, "data": data})

    def update(self, kind: str, key: str, scope: str, change: Change) -> None:
        from google.cloud import firestore

        ref = self.ref(kind, key)

        @firestore.transactional
        def run(transaction: Any) -> None:
            snapshot = ref.get(transaction=transaction)
            current = (snapshot.to_dict() or {}).get("data") if snapshot.exists else None
            result = change(current)
            if result is not None:
                created, data = result
                transaction.set(ref, {"scope": scope, "created": created, "data": data})

        # One small document: contention is brief, so retry more than the default five times.
        run(self.client.transaction(max_attempts=TRANSACTION_ATTEMPTS))

    def delete(self, kind: str, key: str) -> None:
        self.ref(kind, key).delete()

    def delete_scope(self, kind: str, scope: str) -> None:
        from google.cloud.firestore_v1.base_query import FieldFilter

        query = self.root.collection(kind).where(filter=FieldFilter("scope", "==", scope))
        while True:
            # Pages of 400 stay under the 500-write batch limit.
            snapshots = list(query.limit(400).stream())
            if not snapshots:
                return
            batch = self.client.batch()
            for snapshot in snapshots:
                batch.delete(snapshot.reference)
            batch.commit()

    def ordered(self, kind: str, scope: str, limit: int) -> list[dict[str, Any]]:
        from google.cloud import firestore
        from google.cloud.firestore_v1.base_query import FieldFilter

        query = (
            self.root.collection(kind)
            .where(filter=FieldFilter("scope", "==", scope))
            .order_by("created", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )
        return [s.to_dict() or {} for s in query.stream()]

    def unordered(self, kind: str, scope: str) -> list[dict[str, Any]]:
        from google.cloud.firestore_v1.base_query import FieldFilter

        query = (
            self.root.collection(kind)
            .where(filter=FieldFilter("scope", "==", scope))
            .limit(self.FALLBACK_LIMIT)
        )
        rows = [s.to_dict() or {} for s in query.stream()]
        rows.sort(key=lambda r: -float(r.get("created", 0)))
        return rows

    def scoped(self, kind: str, scope: str, limit: int = 200) -> list[dict[str, Any]]:
        from google.api_core.exceptions import FailedPrecondition

        try:
            rows = self.ordered(kind, scope, limit)
        except FailedPrecondition:
            log.warning("community_index_missing", kind=kind)
            rows = self.unordered(kind, scope)
        return [r["data"] for r in rows[:limit] if "data" in r]


# --- Contracts ---


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vegetarian: bool = False
    halal: bool = False
    budget: float | None = Field(default=None, ge=0, le=1_000_000)
    language: str = Field(default="", max_length=16)


class Search(BaseModel):
    q: str = Field(max_length=300)
    at: float


class Profile(BaseModel):
    name: str = ""
    follows: list[str] = Field(default_factory=list)
    preferences: Preferences = Field(default_factory=Preferences)
    searches: list[Search] = Field(default_factory=list)


class TipInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=3, max_length=280)
    rating: int | None = Field(default=None, ge=1, le=5)


class Tip(BaseModel):
    id: str
    name: str
    text: str
    rating: int | None = None
    created: float
    demo: bool = False
    mine: bool = False
    helpful: int = 0


class Update(BaseModel):
    id: str
    shop_id: str
    kind: Literal["price_change", "back_in_stock", "new_item", "menu_confirmed", "rescue_deal"]
    rescue_id: str | None = None
    ends: float | None = None
    item: str = ""
    price: int | None = None
    old_price: int | None = None
    unit: str = ""
    currency: str = ""
    created: float
    demo: bool = False


# --- Stated preferences ("I'm vegetarian", "budget under ₹100", "reply in Hindi") ---

LANGUAGES = {
    "english": "en",
    "hindi": "hi",
    "tamil": "ta",
    "telugu": "te",
    "kannada": "kn",
    "malayalam": "ml",
    "bengali": "bn",
    "marathi": "mr",
    "gujarati": "gu",
    "chinese": "zh-Hans",
    "malay": "ms",
    "japanese": "ja",
    "korean": "ko",
    "thai": "th",
    "vietnamese": "vi",
    "indonesian": "id",
    "filipino": "fil",
}


def stated_preferences(q: str) -> dict[str, Any]:
    """Only first-person statements count; a search for "veg biryani" is not a preference."""
    text = q.casefold()
    found: dict[str, Any] = {}
    if re.search(
        r"\b(i'?m|i am|we'?re|we are|i eat only|i only eat)\s+(a\s+)?(vegetarian|vegan|veg)\b", text
    ):
        found["vegetarian"] = True
    if re.search(r"\b(i|we)\s+(only\s+)?eat\s+(only\s+)?halal\b|\bi'?m muslim\b", text):
        found["halal"] = True
    budget = re.search(
        r"\b(?:my|our)\s+budget\s+(?:is\s+)?(?:under|below|around|about|of|max)?\s*\D{0,3}"
        r"(\d+(?:[.,]\d+)?)",
        text,
    ) or re.search(r"\bbudget\s+(?:under|below)\s*\D{0,3}(\d+(?:[.,]\d+)?)", text)
    if budget:
        found["budget"] = float(budget.group(1).replace(",", "."))
    language = re.search(
        r"\b(?:in|speak|reply in|talk in|prefer)\s+(" + "|".join(LANGUAGES) + r")\b", text
    )
    if language:
        found["language"] = LANGUAGES[language.group(1)]
    return found


# --- Moderation: a basic filter always; Gemini safety on top when live. ---

BLOCKED = {
    "fuck",
    "shit",
    "bitch",
    "bastard",
    "idiot",
    "stupid",
    "scam",
    "fraud",
    "kill",
    "chutiya",
    "madarchod",
    "bhenchod",
    "harami",
}


def basic_filter(text: str) -> str | None:
    """Returns a reason when a tip is not suitable to show neighbours."""
    lowered = text.casefold()
    if re.search(r"https?://|www\.|\.(com|in|sg|net|org)\b", lowered):
        return "links"
    if re.search(r"[^\s@]+@[^\s@]+\.[^\s@]+", text) or len(re.sub(r"\D", "", text)) >= 7:
        return "contact"
    if any(re.search(rf"\b{re.escape(word)}", lowered) for word in BLOCKED):
        return "language"
    letters = [c for c in text if c.isalpha()]
    if len(letters) > 12 and sum(c.isupper() for c in letters) / len(letters) > 0.7:
        return "shouting"
    if re.search(r"(.)\1{6,}", text):
        return "spam"
    return None


# --- Demo content (always labelled demo) ---

DEMO_TIPS = [
    ("Neighbour Priya (demo)", "Go before 9 — the morning batch is the freshest.", 5),
    ("Neighbour Wei (demo)", "Friendly owner, and they remember your usual order.", 4),
]


def update_key(bid: str, update_id: str) -> str:
    # Per shop: fixed demo IDs repeat across shops.
    return f"{bid}\0{update_id}"


def thread_key(uid: str, iid: str) -> str:
    return f"{uid}\0{iid}"


class Community:
    def __init__(self, documents: Documents) -> None:
        self.docs = documents
        # Serialises edits within this process; transactions cover other server instances.
        self.lock = Lock()

    # Profile, follows, preferences and searches.

    def profile(self, uid: str) -> Profile:
        data = self.docs.get("profile", uid)
        return Profile.model_validate(data) if data else Profile()

    def edit_profile(self, uid: str, edit: Callable[[Profile], bool]) -> Profile:
        """Atomic, so two devices (or two server instances) never overwrite each other."""
        result = Profile()

        def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
            nonlocal result
            result = Profile.model_validate(data) if data else Profile()
            return (time.time(), result.model_dump()) if edit(result) else None

        with self.lock:
            self.docs.update("profile", uid, uid, change)
        return result

    def touch(self, uid: str, name: str) -> Profile:
        def edit(profile: Profile) -> bool:
            if not name or profile.name == name[:100]:
                return False
            profile.name = name[:100]
            return True

        return self.edit_profile(uid, edit)

    def follow(self, uid: str, bid: str, on: bool) -> Profile:
        def edit(profile: Profile) -> bool:
            follows = [b for b in profile.follows if b != bid]
            if on:
                if len(follows) >= MAX_FOLLOWS:
                    raise HTTPException(409, "You follow the maximum number of shops.")
                follows.insert(0, bid)
            profile.follows = follows
            return True

        return self.edit_profile(uid, edit)

    def set_preferences(self, uid: str, changes: dict[str, Any]) -> Profile:
        def edit(profile: Profile) -> bool:
            profile.preferences = Preferences.model_validate(
                {**profile.preferences.model_dump(), **changes}
            )
            return True

        return self.edit_profile(uid, edit)

    def remember_search(self, uid: str, q: str) -> Profile:
        def edit(profile: Profile) -> bool:
            searches = [s for s in profile.searches if s.q.casefold() != q.casefold()]
            profile.searches = [Search(q=q[:300], at=time.time()), *searches][:MAX_SEARCHES]
            return True

        return self.edit_profile(uid, edit)

    def clear_personal(self, uid: str) -> Profile:
        """Clears preferences and searches; follows stay until unfollowed."""

        def edit(profile: Profile) -> bool:
            profile.preferences = Preferences()
            profile.searches = []
            return True

        return self.edit_profile(uid, edit)

    # Owned threads: the index proves which signed-in customer owns which shop thread.

    # One thread per shop and at most MAX_THREADS: both live in one small per-customer document
    # changed atomically, so two tabs (or two server instances) starting at once never duplicate a
    # shop thread or pass the cap. A slot is {"iid"} once created, {"claim", "at"} meanwhile.

    def reserve_thread(self, uid: str, bid: str) -> tuple[Literal["existing", "mine", "wait"], str]:
        """("existing", iid) to continue it; ("mine", claim) to create it; ("wait", "") while
        another request is creating it."""
        legacy: dict[str, Any] = {}
        if self.docs.get("threadslots", uid) is None:
            # Customers from before slots existed: their current threads fill the first slots.
            legacy = {t["bid"]: {"iid": t["iid"]} for t in self.threads(uid)}
        claim = uuid4().hex
        outcome: tuple[Literal["existing", "mine", "wait"], str] = ("wait", "")

        def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
            nonlocal outcome
            shops = dict((data or {}).get("shops", legacy))
            now = time.time()
            slot = shops.get(bid)
            if slot and "iid" in slot:
                outcome = ("existing", slot["iid"])
                return None
            if slot and now - slot["at"] < CLAIM_SECONDS:
                outcome = ("wait", "")
                return None
            if not slot and len(shops) >= MAX_THREADS:
                raise HTTPException(409, "Too many conversations. Delete an old one first.")
            shops[bid] = {"claim": claim, "at": now}
            outcome = ("mine", claim)
            return now, {"shops": shops}

        with self.lock:
            self.docs.update("threadslots", uid, uid, change)
        return outcome

    def release_thread(self, uid: str, bid: str, claim: str) -> None:
        """A start that failed gives its shop slot back."""
        self.edit_slot(uid, bid, lambda slot: (slot or {}).get("claim") == claim)

    def edit_slot(
        self,
        uid: str,
        bid: str,
        remove: Callable[[dict[str, Any] | None], bool],
        value: dict[str, Any] | None = None,
    ) -> None:
        """Sets the shop's slot to value, or removes it when remove(slot) says so."""

        def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
            if data is None:
                return None
            shops = dict(data.get("shops", {}))
            if value is not None:
                shops[bid] = value
            elif remove(shops.get(bid)):
                shops.pop(bid, None)
            else:
                return None
            return time.time(), {"shops": shops}

        with self.lock:
            self.docs.update("threadslots", uid, uid, change)

    def add_thread(self, uid: str, bid: str, iid: str, token: str, seen: str) -> None:
        """Records ownership, then fills the shop's slot so waiting starts continue this thread."""
        self.docs.put(
            "thread",
            thread_key(uid, iid),
            uid,
            time.time(),
            {"bid": bid, "iid": iid, "token": token, "seen": seen, "created": time.time()},
        )
        self.edit_slot(uid, bid, lambda _: False, {"iid": iid})

    def thread(self, uid: str, bid: str, iid: str) -> dict[str, Any]:
        data = self.docs.get("thread", thread_key(uid, iid))
        if not data or data.get("bid") != bid:
            raise HTTPException(404, "Conversation not found.")
        return data

    def threads(self, uid: str) -> list[dict[str, Any]]:
        return self.docs.scoped("thread", uid, MAX_THREADS)

    def mark_seen(self, uid: str, bid: str, iid: str, mid: str) -> None:
        # Atomic, so marking seen never resurrects a conversation deleted meanwhile.
        def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
            if not data or data.get("bid") != bid:
                raise HTTPException(404, "Conversation not found.")
            return data["created"], {**data, "seen": mid}

        with self.lock:
            self.docs.update("thread", thread_key(uid, iid), uid, change)

    def drop_thread(self, uid: str, bid: str, iid: str) -> None:
        self.docs.delete("thread", thread_key(uid, iid))
        self.edit_slot(uid, bid, lambda slot: (slot or {}).get("iid") == iid)

    # Owner erasure: copies of the shop's public data and what neighbours wrote about it.

    def erase_shop(self, bid: str) -> None:
        self.docs.delete("snapshot", bid)
        self.docs.delete_scope("update", bid)
        self.docs.delete_scope("tip", bid)
        self.docs.delete("perks", bid)

    def thread_for_shop(self, uid: str, bid: str) -> dict[str, Any] | None:
        return next((t for t in self.threads(uid) if t["bid"] == bid), None)

    # Updates feed: derived from real public shop data by comparing snapshots.

    def observe(self, bid: str, shop: dict[str, Any]) -> list[Update]:
        """Records what changed since the last look; the first look is only a baseline."""
        products = {
            p["name"]: {"price": p["price"], "available": p["available"], "unit": p["unit"]}
            for p in shop.get("products", [])
        }
        # Stored as a list: product names are not safe Firestore field names ("__x__").
        current = {
            "products": [{"name": name, **value} for name, value in products.items()],
            "last_confirmed": shop.get("last_confirmed") or "",
        }
        previous: dict[str, Any] | None = None

        def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
            # Atomic swap: concurrent looks never report the same change twice.
            nonlocal previous
            previous = data
            return None if data == current else (time.time(), current)

        with self.lock:
            self.docs.update("snapshot", bid, bid, change)
        if previous is None:
            return []
        now = time.time()
        currency = shop.get("currency", "")
        events: list[Update] = []

        def event(kind: Any, item: str = "", **extra: Any) -> None:
            events.append(
                Update(
                    id=str(uuid4()),
                    shop_id=bid,
                    kind=kind,
                    item=item,
                    currency=currency,
                    created=now,
                    **extra,
                )
            )

        stored = previous.get("products", [])
        # Older snapshots keyed products by name.
        old = stored if isinstance(stored, dict) else {p["name"]: p for p in stored}
        for name, value in products.items():
            before = old.get(name)
            if before is None:
                event("new_item", name, price=value["price"], unit=value["unit"])
                continue
            if before["price"] != value["price"]:
                event(
                    "price_change",
                    name,
                    price=value["price"],
                    old_price=before["price"],
                    unit=value["unit"],
                )
            if not before["available"] and value["available"]:
                event("back_in_stock", name, price=value["price"], unit=value["unit"])
        confirmed = current["last_confirmed"]
        if confirmed and confirmed != previous.get("last_confirmed"):
            event("menu_confirmed")
        for update in events[:10]:
            self.docs.put(
                "update", update_key(bid, update.id), bid, update.created, update.model_dump()
            )
        return events

    def seed_demo_updates(self, bid: str, shop: dict[str, Any]) -> None:
        """Labelled demo updates from the demo shop's actual menu, refreshed weekly."""
        if not shop.get("demo"):
            return
        recent = [u for u in self.docs.scoped("update", bid, 20) if u.get("demo")]
        if recent and recent[0]["created"] > time.time() - 7 * DAY:
            return
        products = shop.get("products", [])
        if not products:
            return
        now = time.time()
        # One set per week with fixed IDs, so concurrent first looks write the same documents.
        week = int(now // (7 * DAY))
        currency = shop.get("currency", "")
        first = products[0]
        newest = products[-1]
        available = next((p for p in products[1:] if p["available"]), first)
        seeds = [
            Update(
                id=f"demo-{week}-0",
                shop_id=bid,
                kind="menu_confirmed",
                created=now - 1800,
                currency=currency,
                demo=True,
            ),
            Update(
                id=f"demo-{week}-1",
                shop_id=bid,
                kind="price_change",
                item=first["name"],
                price=first["price"],
                old_price=first["price"] + max(10, first["price"] // 10),
                unit=first["unit"],
                currency=currency,
                created=now - 3 * 3600,
                demo=True,
            ),
            Update(
                id=f"demo-{week}-2",
                shop_id=bid,
                kind="back_in_stock",
                item=available["name"],
                price=available["price"],
                unit=available["unit"],
                currency=currency,
                created=now - 20 * 3600,
                demo=True,
            ),
            Update(
                id=f"demo-{week}-3",
                shop_id=bid,
                kind="new_item",
                item=newest["name"],
                price=newest["price"],
                unit=newest["unit"],
                currency=currency,
                created=now - 2 * DAY,
                demo=True,
            ),
        ]
        for update in seeds:
            self.docs.put(
                "update", update_key(bid, update.id), bid, update.created, update.model_dump()
            )

    def updates(self, bids: list[str], limit: int = 40) -> list[Update]:
        rows = [
            Update.model_validate(u) for bid in bids for u in self.docs.scoped("update", bid, 20)
        ]
        rows.sort(key=lambda u: -u.created)
        active = []
        for row in rows:
            if row.kind == "rescue_deal":
                state = self.docs.get("rescue", row.shop_id) or {}
                if not any(
                    d["id"] == row.rescue_id
                    and d["data"]["status"] == "live"
                    and d["data"]["ends"] > time.time()
                    for d in state.get("deals", [])
                ):
                    continue
            active.append(row)
        return active[:limit]

    # Neighbour tips.

    def seed_demo_tips(self, bid: str, shop: dict[str, Any]) -> None:
        if not shop.get("demo") or self.docs.get("tip", f"{bid}\0demo-0"):
            return
        now = time.time()
        for index, (name, text, rating) in enumerate(DEMO_TIPS):
            tip = Tip(
                id=f"demo-{index}",
                name=name,
                text=text,
                rating=rating,
                created=now - (index + 1) * 2 * DAY,
                demo=True,
            )
            self.docs.put("tip", f"{bid}\0demo-{index}", bid, tip.created, tip.model_dump())

    def tips(self, bid: str, uid: str | None = None) -> list[Tip]:
        rows = []
        for data in self.docs.scoped("tip", bid, 50):
            owner = data.pop("uid", None)
            voters = data.pop("voters", [])
            rows.append(
                Tip.model_validate(
                    {**data, "mine": bool(uid) and owner == uid, "helpful": len(voters)}
                )
            )
        return rows

    def mark_helpful(self, bid: str, tip_id: str, voter: str) -> tuple[str | None, int]:
        """A signed-in neighbour (not the author) marks a tip helpful, once. Returns the author
        to reward (None for demo tips, repeats and the author's own tip) and the new count."""
        found = next((t for t in self.docs.scoped("tip", bid, 50) if t.get("id") == tip_id), None)
        if found is None:
            raise HTTPException(404, "Tip not found.")
        key = f"{bid}\0{found['uid']}" if found.get("uid") else f"{bid}\0{tip_id}"
        member = hashlib.sha256(voter.encode()).hexdigest()[:16]
        author: str | None = None
        count = 0

        def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
            nonlocal author, count
            if data is None or data.get("id") != tip_id:
                raise HTTPException(404, "Tip not found.")
            voters = list(data.get("voters", []))
            count = len(voters)
            if data.get("uid") == voter:
                raise HTTPException(409, "You can't mark your own tip helpful.")
            if member in voters:
                return None
            voters.append(member)
            count = len(voters)
            author = data.get("uid")
            return data["created"], {**data, "voters": voters[-500:]}

        with self.lock:
            self.docs.update("tip", key, bid, change)
        return author, count

    def add_tip(self, uid: str, name: str, bid: str, body: TipInput) -> Tip:
        # One tip per neighbour per shop; a new one replaces the old.
        tip = Tip(
            id=hashlib.sha256(f"{bid}\0{uid}".encode()).hexdigest()[:24],
            name=(name or "Neighbour").split(" ")[0][:40],
            text=body.text,
            rating=body.rating,
            created=time.time(),
            mine=True,
        )
        self.docs.put("tip", f"{bid}\0{uid}", bid, tip.created, {**tip.model_dump(), "uid": uid})
        self.index_tip(uid, bid, True)
        return tip

    def delete_tip(self, uid: str, bid: str) -> None:
        self.docs.delete("tip", f"{bid}\0{uid}")
        self.index_tip(uid, bid, False)

    # Tips are filed under their shop; this per-customer list is how "Delete my data" finds them.

    def index_tip(self, uid: str, bid: str, on: bool) -> None:
        def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
            shops = [b for b in (data or {}).get("shops", []) if b != bid]
            if on:
                shops.insert(0, bid)
            return time.time(), {"shops": shops[:MAX_TIPPED]}

        with self.lock:
            self.docs.update("tipped", uid, uid, change)

    def tipped(self, uid: str) -> list[str]:
        return list((self.docs.get("tipped", uid) or {}).get("shops", []))

    # Customer erasure ("Delete my data"): what this customer keeps here besides the chats in
    # the shops' inboxes and the passport, which erasure.erase_customer erases first.

    def erase_tips(self, uid: str, bids: list[str]) -> None:
        """This customer's tips: the indexed ones, and any at these shops from before the index."""
        for bid in dict.fromkeys([*self.tipped(uid), *bids]):
            self.docs.delete("tip", f"{bid}\0{uid}")
        self.docs.delete("tipped", uid)

    def erase_customer(self, uid: str) -> None:
        """Profile (name, follows, preferences, searches), chat slots, guest contact, Today."""
        for kind in ("profile", "threadslots", "guest_identity", "today"):
            self.docs.delete(kind, uid)


def community_service(settings: Any) -> Community:
    if settings.merchant_backend == "sqlite":
        path = Path(settings.merchant_database)
        return Community(SqliteDocuments(str(path.with_name(path.stem + "-community.sqlite3"))))
    from google.cloud import firestore

    client = firestore.Client(
        project=settings.google_cloud_project, database=settings.firestore_database
    )
    return Community(FirestoreDocuments(client, settings.firestore_namespace))
