"""Owner-scoped local records. The agent prepares proposals; only the UI commits them."""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field


class BusinessFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=180)
    category: str = Field(default="", max_length=180)
    location: str = Field(default="", max_length=300)
    hours: str = Field(default="", max_length=180)
    phone: str = Field(default="", max_length=40)
    # ISO 4217; prices of this shop are stored in this currency's minor unit (see money.py).
    currency: str = Field(default="SGD", pattern=r"^[A-Z]{3}$")


class ProductFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=180)
    price: int = Field(
        ge=0, le=100_000_000, description="Minor units of the shop currency; integer, never a float"
    )
    unit: str = Field(default="item", min_length=1, max_length=40)
    stock: int | None = Field(default=None, ge=0, le=1_000_000)
    available: bool = True


class AvailabilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    available: bool


class ShareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    public: bool


class ProposalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(pattern="^(business|inventory)$")
    business_id: str | None = None
    revision: int = Field(default=0, ge=0)
    business: BusinessFields | None = None
    products: list[ProductFields] = Field(default_factory=list, max_length=30)


class Approval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    digest: str = Field(min_length=64, max_length=64)


PROPOSAL_SECONDS = 600
CHALLENGE_SECONDS = 90


class MerchantRepository(Protocol):
    """Owner-scoped merchant records shared by the local SQLite and Firestore adapters."""

    def list_businesses(self, uid: str) -> list[dict[str, Any]]: ...
    def context(self, uid: str, bid: str | None) -> dict[str, Any]: ...
    def inventory(self, uid: str, bid: str) -> list[dict[str, Any]]: ...
    # Simulator records are isolated from confirmed merchant facts.
    def sim_state(self, uid: str, bid: str) -> dict[str, Any] | None: ...
    def save_sim_state(self, uid: str, bid: str, state: dict[str, Any]) -> None: ...
    def propose(self, uid: str, request: ProposalRequest) -> dict[str, Any]: ...
    def commit(self, uid: str, pid: str, digest: str) -> dict[str, Any]: ...
    def challenge(self, uid: str, bid: str) -> dict[str, Any]: ...
    def consume(self, uid: str, cid: str) -> dict[str, Any]: ...
    def face_result(self, uid: str, cid: str, result: dict[str, Any]) -> None: ...
    def result(self, uid: str, cid: str) -> dict[str, Any]: ...
    def invalidate_face(self, uid: str) -> None: ...
    def consent(self, uid: str) -> dict[str, Any] | None: ...
    def record_consent(self, uid: str, version: str) -> dict[str, Any]: ...
    def erase_owner(self, uid: str) -> list[str]:
        """Delete every record owned by uid; return the deleted business IDs."""
        ...

    def set_availability(
        self, uid: str, bid: str, product_id: str, available: bool
    ) -> dict[str, Any]:
        """Owner's direct sold-out toggle; bumps the revision so pending proposals go stale."""
        ...

    def planning(
        self, uid: str, bid: str, pid: str, action: str, payload: dict[str, Any]
    ) -> dict[str, Any]: ...

    def share(self, uid: str, bid: str, public: bool) -> dict[str, Any]: ...
    def public_shop(self, bid: str) -> dict[str, Any] | None:
        """Customer-facing projection of a shared shop, or None when not shared."""
        ...


def public_projection(
    bid: str, fields: dict[str, Any], products: list[dict[str, Any]]
) -> dict[str, Any]:
    """Only what a customer should see: no owners, revisions, stock counts or internal status."""
    return {
        "id": bid,
        "name": fields["name"],
        "category": fields.get("category", ""),
        "location": fields.get("location", ""),
        "hours": fields.get("hours", ""),
        "phone": fields.get("phone", ""),
        "currency": fields.get("currency") or "SGD",
        "products": [
            {
                "name": product["name"],
                "price": product["price"],
                "unit": product["unit"],
                "available": product.get("available", True),
            }
            for product in products
        ],
    }


class ConsentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    terms: bool
    privacy: bool


def validate_proposal(request: ProposalRequest) -> None:
    if request.kind == "business" and request.business is None:
        raise HTTPException(422, "Business details are required.")
    if request.kind == "inventory" and (not request.business_id or not request.products):
        raise HTTPException(422, "Select a business and add products.")
    if request.kind == "business" and request.business_id and request.products:
        # A new shop may arrive with its menu (one review); edits keep products separate.
        raise HTTPException(422, "Update products separately from business details.")


def seal_proposal(request: ProposalRequest) -> tuple[dict[str, Any], str, str]:
    """Return the canonical snapshot, its JSON text and the digest the owner must approve."""
    payload = request.model_dump()
    payload["business_id"] = request.business_id or str(uuid4())
    text = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return payload, text, hashlib.sha256(text.encode()).hexdigest()


def challenge_prompts() -> list[str]:
    return secrets.SystemRandom().sample(["turn_left", "turn_right", "look_up"], 2)


class MerchantStore:
    def __init__(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS people(uid TEXT PRIMARY KEY, verification TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS businesses(id TEXT PRIMARY KEY, fields TEXT NOT NULL,
                revision INTEGER NOT NULL, status TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS memberships(uid TEXT NOT NULL, business_id TEXT NOT NULL,
                role TEXT NOT NULL, PRIMARY KEY(uid,business_id));
            CREATE TABLE IF NOT EXISTS inventory(id TEXT PRIMARY KEY, business_id TEXT NOT NULL,
                fields TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, uid TEXT NOT NULL,
                payload TEXT NOT NULL, digest TEXT NOT NULL, expires REAL NOT NULL, receipt TEXT);
            CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, uid TEXT NOT NULL,
                business_id TEXT NOT NULL, prompts TEXT NOT NULL, expires REAL NOT NULL,
                consumed INTEGER NOT NULL DEFAULT 0, result TEXT);
            CREATE TABLE IF NOT EXISTS consents(uid TEXT PRIMARY KEY, version TEXT NOT NULL,
                accepted REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS shares(business_id TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS google_sim(uid TEXT NOT NULL, business_id TEXT NOT NULL,
                state TEXT NOT NULL, PRIMARY KEY(uid,business_id));
            CREATE TABLE IF NOT EXISTS planning(business_id TEXT, product_id TEXT, fields TEXT,
                PRIMARY KEY(business_id, product_id));
            """)

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def sim_state(self, uid: str, bid: str) -> dict[str, Any] | None:
        with self.connect() as db:
            self.owned(db, uid, bid)
            row = db.execute(
                "SELECT state FROM google_sim WHERE uid=? AND business_id=?", (uid, bid)
            ).fetchone()
            return json.loads(row[0]) if row else None

    def save_sim_state(self, uid: str, bid: str, state: dict[str, Any]) -> None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.owned(db, uid, bid)
            row = db.execute(
                "SELECT state FROM google_sim WHERE uid=? AND business_id=?", (uid, bid)
            ).fetchone()
            version = json.loads(row[0])["version"] if row else 0
            if state["version"] != version + 1:
                raise HTTPException(409, "Simulator changed. Reload before reviewing.")
            db.execute(
                "INSERT INTO google_sim VALUES(?,?,?) ON CONFLICT(uid,business_id) "
                "DO UPDATE SET state=excluded.state",
                (uid, bid, json.dumps(state)),
            )

    @staticmethod
    def owned(db: sqlite3.Connection, uid: str, bid: str) -> sqlite3.Row:
        row = db.execute(
            """SELECT b.* FROM businesses b JOIN memberships m
            ON b.id=m.business_id WHERE m.uid=? AND b.id=? AND m.role='owner'""",
            (uid, bid),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Business not found.")
        return row

    def list_businesses(self, uid: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            return [
                self.present(row)
                for row in db.execute(
                    """SELECT b.* FROM businesses b
                JOIN memberships m ON b.id=m.business_id WHERE m.uid=? ORDER BY b.rowid""",
                    (uid,),
                ).fetchall()
            ]

    def present(self, row: sqlite3.Row) -> dict[str, Any]:
        with self.connect() as db:
            shared = db.execute("SELECT 1 FROM shares WHERE business_id=?", (row["id"],)).fetchone()
        return {
            "id": row["id"],
            "fields": json.loads(row["fields"]),
            "revision": row["revision"],
            "registration": row["status"],
            "public": bool(shared),
            "google_publication": "not_connected",
        }

    def context(self, uid: str, bid: str | None) -> dict[str, Any]:
        with self.connect() as db:
            person = db.execute("SELECT verification FROM people WHERE uid=?", (uid,)).fetchone()
            business = self.present(self.owned(db, uid, bid)) if bid else None
        return {
            "business": business,
            "inventory": self.inventory(uid, bid) if bid else [],
            "person_verification": person[0] if person else "not_enrolled",
        }

    def inventory(self, uid: str, bid: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            self.owned(db, uid, bid)
            return [
                {"id": row["id"], **json.loads(row["fields"])}
                for row in db.execute(
                    "SELECT * FROM inventory WHERE business_id=? ORDER BY rowid", (bid,)
                )
            ]

    def propose(self, uid: str, request: ProposalRequest) -> dict[str, Any]:
        validate_proposal(request)
        with self.connect() as db:
            if request.business_id:
                row = self.owned(db, uid, request.business_id)
                if row["revision"] != request.revision:
                    raise HTTPException(409, "The business changed. Reload before reviewing.")
            elif request.revision != 0:
                raise HTTPException(409, "A new business starts at revision zero.")
            payload, text, digest = seal_proposal(request)
            pid = str(uuid4())
            expires = time.time() + PROPOSAL_SECONDS
            db.execute(
                "INSERT INTO proposals VALUES(?,?,?,?,?,NULL)", (pid, uid, text, digest, expires)
            )
        return {"id": pid, "digest": digest, "expires": expires, "snapshot": payload}

    def commit(self, uid: str, pid: str, digest: str) -> dict[str, Any]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            proposal = db.execute(
                "SELECT * FROM proposals WHERE id=? AND uid=?", (pid, uid)
            ).fetchone()
            if not proposal:
                raise HTTPException(404, "Proposal not found.")
            if not secrets.compare_digest(proposal["digest"], digest):
                raise HTTPException(409, "Review the exact proposal before saving.")
            if proposal["receipt"]:
                return json.loads(proposal["receipt"])
            if proposal["expires"] < time.time():
                raise HTTPException(409, "Review expired; prepare a new proposal.")
            data = json.loads(proposal["payload"])
            bid = data["business_id"]
            exists = db.execute("SELECT id FROM businesses WHERE id=?", (bid,)).fetchone()
            if exists:
                row = self.owned(db, uid, bid)
                if row["revision"] != data["revision"]:
                    raise HTTPException(409, "The business changed; review again.")
            elif data["kind"] != "business" or data["revision"] != 0:
                raise HTTPException(404, "Business not found.")
            if data["kind"] == "business":
                if exists:
                    db.execute(
                        "UPDATE businesses SET fields=?,revision=revision+1 WHERE id=?",
                        (json.dumps(data["business"]), bid),
                    )
                else:
                    db.execute(
                        "INSERT INTO people VALUES(?,?) ON CONFLICT DO NOTHING",
                        (uid, "not_enrolled"),
                    )
                    db.execute(
                        "INSERT INTO businesses VALUES(?,?,1,'draft')",
                        (bid, json.dumps(data["business"])),
                    )
                    db.execute("INSERT INTO memberships VALUES(?,?,'owner')", (uid, bid))
            else:
                db.execute("UPDATE businesses SET revision=revision+1 WHERE id=?", (bid,))
            # Inventory proposals, or a brand-new shop arriving with its menu.
            for product in data["products"]:
                existing = db.execute(
                    "SELECT id FROM inventory WHERE business_id=? AND "
                    "json_extract(fields,'$.name')=? AND json_extract(fields,'$.unit')=?",
                    (bid, product["name"], product["unit"]),
                ).fetchone()
                if existing:
                    db.execute(
                        "UPDATE inventory SET fields=? WHERE id=?",
                        (json.dumps(product), existing[0]),
                    )
                else:
                    db.execute(
                        "INSERT INTO inventory VALUES(?,?,?)",
                        (str(uuid4()), bid, json.dumps(product)),
                    )
            receipt = {
                "business_id": bid,
                "revision": data["revision"] + 1,
                "receipt_id": str(uuid4()),
                "google_publication": "not_connected",
            }
            db.execute("UPDATE proposals SET receipt=? WHERE id=?", (json.dumps(receipt), pid))
            return receipt

    def challenge(self, uid: str, bid: str) -> dict[str, Any]:
        prompts = challenge_prompts()
        cid = str(uuid4())
        expires = time.time() + CHALLENGE_SECONDS
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.owned(db, uid, bid)
            db.execute(
                "INSERT INTO challenges(id,uid,business_id,prompts,expires) VALUES(?,?,?,?,?)",
                (cid, uid, bid, json.dumps(prompts), expires),
            )
            db.execute("UPDATE businesses SET status='verification_pending' WHERE id=?", (bid,))
        return {
            "id": cid,
            "prompts": prompts,
            "expires": expires,
            "max_seconds": 8,
            "max_bytes": 8 * 1024 * 1024,
        }

    def consume(self, uid: str, cid: str) -> dict[str, Any]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM challenges WHERE id=? AND uid=?", (cid, uid)).fetchone()
            if not row:
                raise HTTPException(404, "Challenge not found.")
            if row["consumed"] or row["expires"] < time.time():
                raise HTTPException(409, "Challenge expired or already used. Retry the scan.")
            self.owned(db, uid, row["business_id"])
            db.execute("UPDATE challenges SET consumed=1 WHERE id=?", (cid,))
            return {"business_id": row["business_id"], "prompts": json.loads(row["prompts"])}

    def face_result(self, uid: str, cid: str, result: dict[str, Any]) -> None:
        with self.connect() as db:
            db.execute(
                "UPDATE challenges SET result=? WHERE id=? AND uid=?",
                (json.dumps(result), cid, uid),
            )
            db.execute(
                "INSERT INTO people VALUES(?,'review_pending') ON CONFLICT(uid) "
                "DO UPDATE SET verification='review_pending'",
                (uid,),
            )

    def result(self, uid: str, cid: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute(
                "SELECT result FROM challenges WHERE id=? AND uid=?", (cid, uid)
            ).fetchone()
        if not row:
            raise HTTPException(404, "Challenge not found.")
        return json.loads(row[0]) if row[0] else {"status": "awaiting_capture"}

    def invalidate_face(self, uid: str) -> None:
        with self.connect() as db:
            db.execute("UPDATE people SET verification='not_enrolled' WHERE uid=?", (uid,))
            db.execute(
                "UPDATE businesses SET status='verification_pending' WHERE id IN "
                "(SELECT business_id FROM memberships WHERE uid=?)",
                (uid,),
            )
            db.execute("DELETE FROM challenges WHERE uid=?", (uid,))

    def consent(self, uid: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT version, accepted FROM consents WHERE uid=?", (uid,)
            ).fetchone()
        return {"version": row[0], "accepted": row[1]} if row else None

    def record_consent(self, uid: str, version: str) -> dict[str, Any]:
        record = {"version": version, "accepted": time.time()}
        with self.connect() as db:
            db.execute(
                "INSERT INTO consents VALUES(?,?,?) ON CONFLICT(uid) "
                "DO UPDATE SET version=excluded.version, accepted=excluded.accepted",
                (uid, version, record["accepted"]),
            )
        return record

    def erase_owner(self, uid: str) -> list[str]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            owned = [
                row[0]
                for row in db.execute(
                    "SELECT business_id FROM memberships WHERE uid=? AND role='owner'", (uid,)
                )
            ]
            for bid in owned:
                db.execute("DELETE FROM planning WHERE business_id=?", (bid,))
                db.execute("DELETE FROM inventory WHERE business_id=?", (bid,))
                db.execute("DELETE FROM memberships WHERE business_id=?", (bid,))
                db.execute("DELETE FROM businesses WHERE id=?", (bid,))
                db.execute("DELETE FROM shares WHERE business_id=?", (bid,))
            for table in ("proposals", "challenges", "consents", "people", "google_sim"):
                db.execute(f"DELETE FROM {table} WHERE uid=?", (uid,))  # noqa: S608 - fixed names
        return owned

    def set_availability(
        self, uid: str, bid: str, product_id: str, available: bool
    ) -> dict[str, Any]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.owned(db, uid, bid)
            row = db.execute(
                "SELECT fields FROM inventory WHERE id=? AND business_id=?", (product_id, bid)
            ).fetchone()
            if not row:
                raise HTTPException(404, "Product not found.")
            fields = {**json.loads(row[0]), "available": available}
            db.execute("UPDATE inventory SET fields=? WHERE id=?", (json.dumps(fields), product_id))
            db.execute("UPDATE businesses SET revision=revision+1 WHERE id=?", (bid,))
            revision = db.execute("SELECT revision FROM businesses WHERE id=?", (bid,)).fetchone()
        return {"id": product_id, **fields, "revision": revision[0]}

    def share(self, uid: str, bid: str, public: bool) -> dict[str, Any]:
        with self.connect() as db:
            self.owned(db, uid, bid)
            if public:
                db.execute("INSERT INTO shares VALUES(?) ON CONFLICT DO NOTHING", (bid,))
            else:
                db.execute("DELETE FROM shares WHERE business_id=?", (bid,))
        return {"business_id": bid, "public": public}

    def public_shop(self, bid: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT b.fields FROM businesses b JOIN shares s ON s.business_id=b.id "
                "WHERE b.id=?",
                (bid,),
            ).fetchone()
            if not row:
                return None
            products = [
                json.loads(item[0])
                for item in db.execute(
                    "SELECT fields FROM inventory WHERE business_id=? ORDER BY rowid", (bid,)
                )
            ]
        return public_projection(bid, json.loads(row[0]), products)

    # Private planning records do not change catalog revisions or public projections.
    def planning(
        self, uid: str, bid: str, pid: str, action: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        from datetime import date

        from .planning import change

        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            business = self.owned(db, uid, bid)
            if not db.execute(
                "SELECT 1 FROM inventory WHERE business_id=? AND id=?", (bid, pid)
            ).fetchone():
                raise HTTPException(404, "Product not found.")
            row = db.execute(
                "SELECT fields FROM planning WHERE business_id=? AND product_id=?", (bid, pid)
            ).fetchone()
            state = json.loads(row[0]) if row else {}
            if action != "read":
                if action == "prepare":
                    payload = {
                        **payload,
                        "business_id": bid,
                        "product_id": pid,
                        "revision": business["revision"],
                    }
                elif (
                    state.get("pending", {}).get("snapshot", {}).get("revision")
                    != business["revision"]
                ):
                    raise HTTPException(409, "Business changed. Review planning again.")
                state = change(state, action, payload, date.today())
                db.execute(
                    "INSERT INTO planning VALUES(?,?,?) ON CONFLICT(business_id,product_id) "
                    "DO UPDATE SET fields=excluded.fields",
                    (bid, pid, json.dumps(state)),
                )
            return state
