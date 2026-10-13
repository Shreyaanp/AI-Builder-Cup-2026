"""Owner-scoped local records. The agent prepares proposals; only the UI commits them."""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any
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


class ProductFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=180)
    price: int = Field(ge=0, le=100_000_000, description="INR paise; integer, never a float")
    unit: str = Field(default="item", min_length=1, max_length=40)
    stock: int | None = Field(default=None, ge=0, le=1_000_000)


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
            """)

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

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

    @staticmethod
    def present(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "fields": json.loads(row["fields"]),
            "revision": row["revision"],
            "registration": row["status"],
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
        if request.kind == "business" and request.business is None:
            raise HTTPException(422, "Business details are required.")
        if request.kind == "inventory" and (not request.business_id or not request.products):
            raise HTTPException(422, "Select a business and add products.")
        with self.connect() as db:
            if request.business_id:
                row = self.owned(db, uid, request.business_id)
                if row["revision"] != request.revision:
                    raise HTTPException(409, "The business changed. Reload before reviewing.")
            elif request.revision != 0:
                raise HTTPException(409, "A new business starts at revision zero.")
            payload = request.model_dump()
            payload["business_id"] = request.business_id or str(uuid4())
            text = json.dumps(payload, sort_keys=True, ensure_ascii=False)
            digest = hashlib.sha256(text.encode()).hexdigest()
            pid = str(uuid4())
            expires = time.time() + 600
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
                db.execute("UPDATE businesses SET revision=revision+1 WHERE id=?", (bid,))
            receipt = {
                "business_id": bid,
                "revision": data["revision"] + 1,
                "receipt_id": str(uuid4()),
                "google_publication": "not_connected",
            }
            db.execute("UPDATE proposals SET receipt=? WHERE id=?", (json.dumps(receipt), pid))
            return receipt

    def challenge(self, uid: str, bid: str) -> dict[str, Any]:
        prompts = secrets.SystemRandom().sample(["turn_left", "turn_right", "look_up"], 2)
        cid = str(uuid4())
        expires = time.time() + 90
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
