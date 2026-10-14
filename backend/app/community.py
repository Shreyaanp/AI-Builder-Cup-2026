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
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from typing import Any, Literal, Protocol
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

MAX_FOLLOWS = 100
MAX_SEARCHES = 10
MAX_THREADS = 50
DAY = 86_400


# --- Storage: one tiny document store with SQLite (local) and Firestore (hosted) adapters. ---


class Documents(Protocol):
    def get(self, kind: str, key: str) -> dict[str, Any] | None: ...
    def put(
        self, kind: str, key: str, scope: str, created: float, data: dict[str, Any]
    ) -> None: ...
    def delete(self, kind: str, key: str) -> None: ...
    def scoped(self, kind: str, scope: str, limit: int = 200) -> list[dict[str, Any]]: ...


class SqliteDocuments:
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

    def delete(self, kind: str, key: str) -> None:
        with self.connect() as db:
            db.execute("DELETE FROM community WHERE kind=? AND key=?", (kind, key))

    def scoped(self, kind: str, scope: str, limit: int = 200) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT fields FROM community WHERE kind=? AND scope=? "
                "ORDER BY created DESC LIMIT ?",
                (kind, scope, limit),
            ).fetchall()
        return [json.loads(row[0]) for row in rows]


class FirestoreDocuments:
    """Keys are hashed into document IDs, so customer IDs and text never name a path."""

    def __init__(self, client: Any, namespace: str) -> None:
        self.root = client.collection(namespace).document("community")

    def ref(self, kind: str, key: str) -> Any:
        return self.root.collection(kind).document(hashlib.sha256(key.encode()).hexdigest())

    def get(self, kind: str, key: str) -> dict[str, Any] | None:
        snapshot = self.ref(kind, key).get()
        return (snapshot.to_dict() or {}).get("data") if snapshot.exists else None

    def put(self, kind: str, key: str, scope: str, created: float, data: dict[str, Any]) -> None:
        self.ref(kind, key).set({"scope": scope, "created": created, "data": data})

    def delete(self, kind: str, key: str) -> None:
        self.ref(kind, key).delete()

    def scoped(self, kind: str, scope: str, limit: int = 200) -> list[dict[str, Any]]:
        # Equality only (no composite index); sorted here. Scopes are small per customer/shop.
        rows = [
            s.to_dict() or {}
            for s in self.root.collection(kind).where("scope", "==", scope).limit(500).stream()
        ]
        rows.sort(key=lambda r: -float(r.get("created", 0)))
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


class Update(BaseModel):
    id: str
    shop_id: str
    kind: Literal["price_change", "back_in_stock", "new_item", "menu_confirmed"]
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


def thread_key(uid: str, iid: str) -> str:
    return f"{uid}\0{iid}"


class Community:
    def __init__(self, documents: Documents) -> None:
        self.docs = documents
        self.lock = Lock()

    # Profile, follows, preferences and searches.

    def profile(self, uid: str) -> Profile:
        data = self.docs.get("profile", uid)
        return Profile.model_validate(data) if data else Profile()

    def save_profile(self, uid: str, profile: Profile) -> Profile:
        self.docs.put("profile", uid, uid, time.time(), profile.model_dump())
        return profile

    def touch(self, uid: str, name: str) -> Profile:
        with self.lock:
            profile = self.profile(uid)
            if name and profile.name != name:
                profile.name = name[:100]
                self.save_profile(uid, profile)
            return profile

    def follow(self, uid: str, bid: str, on: bool) -> Profile:
        with self.lock:
            profile = self.profile(uid)
            follows = [b for b in profile.follows if b != bid]
            if on:
                if len(follows) >= MAX_FOLLOWS:
                    raise HTTPException(409, "You follow the maximum number of shops.")
                follows.insert(0, bid)
            profile.follows = follows
            return self.save_profile(uid, profile)

    def set_preferences(self, uid: str, changes: dict[str, Any]) -> Profile:
        with self.lock:
            profile = self.profile(uid)
            profile.preferences = Preferences.model_validate(
                {**profile.preferences.model_dump(), **changes}
            )
            return self.save_profile(uid, profile)

    def remember_search(self, uid: str, q: str) -> Profile:
        with self.lock:
            profile = self.profile(uid)
            searches = [s for s in profile.searches if s.q.casefold() != q.casefold()]
            profile.searches = [Search(q=q[:300], at=time.time()), *searches][:MAX_SEARCHES]
            return self.save_profile(uid, profile)

    def clear_personal(self, uid: str) -> Profile:
        """Clears preferences and searches; follows stay until unfollowed."""
        with self.lock:
            profile = self.profile(uid)
            profile.preferences = Preferences()
            profile.searches = []
            return self.save_profile(uid, profile)

    # Owned threads: the index proves which signed-in customer owns which shop thread.

    def add_thread(self, uid: str, bid: str, iid: str, token: str, seen: str) -> None:
        if len(self.docs.scoped("thread", uid, MAX_THREADS + 1)) >= MAX_THREADS:
            raise HTTPException(409, "Too many conversations. Delete an old one first.")
        self.docs.put(
            "thread",
            thread_key(uid, iid),
            uid,
            time.time(),
            {"bid": bid, "iid": iid, "token": token, "seen": seen, "created": time.time()},
        )

    def thread(self, uid: str, bid: str, iid: str) -> dict[str, Any]:
        data = self.docs.get("thread", thread_key(uid, iid))
        if not data or data.get("bid") != bid:
            raise HTTPException(404, "Conversation not found.")
        return data

    def threads(self, uid: str) -> list[dict[str, Any]]:
        return self.docs.scoped("thread", uid, MAX_THREADS)

    def mark_seen(self, uid: str, bid: str, iid: str, mid: str) -> None:
        data = self.thread(uid, bid, iid)
        self.docs.put("thread", thread_key(uid, iid), uid, data["created"], {**data, "seen": mid})

    def drop_thread(self, uid: str, iid: str) -> None:
        self.docs.delete("thread", thread_key(uid, iid))

    def thread_for_shop(self, uid: str, bid: str) -> dict[str, Any] | None:
        return next((t for t in self.threads(uid) if t["bid"] == bid), None)

    # Updates feed: derived from real public shop data by comparing snapshots.

    def observe(self, bid: str, shop: dict[str, Any]) -> list[Update]:
        """Records what changed since the last look; the first look is only a baseline."""
        products = {
            p["name"]: {"price": p["price"], "available": p["available"], "unit": p["unit"]}
            for p in shop.get("products", [])
        }
        current = {"products": products, "last_confirmed": shop.get("last_confirmed") or ""}
        with self.lock:
            previous = self.docs.get("snapshot", bid)
            self.docs.put("snapshot", bid, bid, time.time(), current)
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

        old = previous.get("products", {})
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
            self.docs.put("update", update.id, bid, update.created, update.model_dump())
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
        currency = shop.get("currency", "")
        first = products[0]
        newest = products[-1]
        available = next((p for p in products[1:] if p["available"]), first)
        seeds = [
            Update(
                id=str(uuid4()),
                shop_id=bid,
                kind="menu_confirmed",
                created=now - 1800,
                currency=currency,
                demo=True,
            ),
            Update(
                id=str(uuid4()),
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
                id=str(uuid4()),
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
                id=str(uuid4()),
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
            self.docs.put("update", update.id, bid, update.created, update.model_dump())

    def updates(self, bids: list[str], limit: int = 40) -> list[Update]:
        rows = [
            Update.model_validate(u) for bid in bids for u in self.docs.scoped("update", bid, 20)
        ]
        rows.sort(key=lambda u: -u.created)
        return rows[:limit]

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
            rows.append(Tip.model_validate({**data, "mine": bool(uid) and owner == uid}))
        return rows

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
        return tip

    def delete_tip(self, uid: str, bid: str) -> None:
        self.docs.delete("tip", f"{bid}\0{uid}")


def community_service(settings: Any) -> Community:
    if settings.merchant_backend == "sqlite":
        path = Path(settings.merchant_database)
        return Community(SqliteDocuments(str(path.with_name(path.stem + "-community.sqlite3"))))
    from google.cloud import firestore

    client = firestore.Client(
        project=settings.google_cloud_project, database=settings.firestore_database
    )
    return Community(FirestoreDocuments(client, settings.firestore_namespace))
