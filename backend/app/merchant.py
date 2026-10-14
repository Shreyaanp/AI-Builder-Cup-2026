"""Owner-scoped local records. The agent prepares proposals; only the UI commits them."""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Annotated, Any, Literal, Protocol
from uuid import NAMESPACE_URL, uuid4, uuid5
from zoneinfo import ZoneInfoNotFoundError

from fastapi import HTTPException
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    field_validator,
    model_serializer,
    model_validator,
)

from .customer import Inquiry, InquiryInput, InquiryReceipt
from .sales import check_import, prepare_import, sales_days, today_for, validate_capacity
from .shop_time import client_timezone, shop_timezone
from .stock_alerts import (
    ALERT_SECONDS,
    MAX_ALERTS,
    StockAlertInput,
    StockAlertReceipt,
    alert_key,
    check_item,
)
from .threads import change_thread, contact_hash, new_thread

Halal = Literal["yes", "no", "muslim_owned", "not_stated"]
Delivery = Annotated[str, Field(min_length=1, max_length=40)]
Payment = Annotated[str, Field(min_length=1, max_length=40)]
# Optional facts customers ask about. Unset facts are left out of the record entirely, so shops
# saved before these existed (and their sealed digests) are unchanged.
FACT_KEYS = (
    "halal",
    "vegetarian_options",
    "delivery",
    "delivery_note",
    "preorders",
    "preorder_lead_time",
    "payment_methods",
    "busy_hours",
)


class CustomFact(BaseModel):
    """A fact this kind of business's customers ask about (e.g. a salon's walk-in policy)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    key: str = Field(pattern=r"^[a-z0-9_]{1,40}$")
    label: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=200)


class DayHours(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    day: Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    closed: bool = False
    open: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    close: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def valid_range(self) -> DayHours:
        if self.closed:
            self.open = self.close = None
        elif not self.open or not self.close or self.open == self.close:
            raise ValueError("An open day needs distinct opening and closing times.")
        return self


class BusinessFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=180)
    category: str = Field(default="", max_length=180)
    location: str = Field(default="", max_length=300)
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lng: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    place_id: str | None = Field(default=None, max_length=300)
    pin_label: str | None = Field(default=None, max_length=300)
    pin_demo: bool = False
    # A clearly labelled sample shop (seed_demo_shops.py). Set only by the seed script, never by
    # an owner proposal (see merchant_routes.propose and coordinator.propose_business).
    demo: bool = False
    # A wholesaler other shops can order from (sourcing.py): the categories it supplies, its
    # minimum order and delivery terms (delivery_note). Unset on ordinary shops.
    supplier: bool = False
    supplies: list[Annotated[str, Field(min_length=1, max_length=40)]] = Field(
        default_factory=list, max_length=12
    )
    min_order: str = Field(default="", max_length=80)
    timezone: str = Field(default="Asia/Singapore", max_length=100)
    hours: str = Field(default="", max_length=180)
    weekly_hours: list[DayHours] = Field(default_factory=list, max_length=7)
    phone: str = Field(default="", max_length=40)
    reward_text: str = Field(default="", max_length=80)
    stamps_needed: int = Field(default=8, ge=3, le=20, strict=True)
    # ISO 4217; prices of this shop are stored in this currency's minor unit (see money.py).
    currency: str = Field(default="SGD", pattern=r"^[A-Z]{3}$")
    halal: Halal | None = None
    vegetarian_options: bool | None = None
    delivery: Delivery | None = None
    delivery_note: str = Field(default="", max_length=80)
    preorders: bool | None = None
    preorder_lead_time: str = Field(default="", max_length=80)
    payment_methods: list[Payment] = Field(default_factory=list, max_length=8)
    busy_hours: str = Field(default="", max_length=80)
    # Type-specific facts from the question plan; owner-confirmed like every other field.
    custom_facts: list[CustomFact] = Field(default_factory=list, max_length=30)

    @field_validator("weekly_hours")
    @classmethod
    def unique_days(cls, value: list[DayHours]) -> list[DayHours]:
        if len({entry.day for entry in value}) != len(value):
            raise ValueError("Use one hours record per weekday.")
        return value

    @field_validator("payment_methods")
    @classmethod
    def unique_methods(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))

    @field_validator("custom_facts")
    @classmethod
    def one_fact_per_key(cls, value: list[CustomFact]) -> list[CustomFact]:
        # The latest answer for a key wins, keeping the original order.
        latest = {fact.key: fact for fact in value}
        return list(latest.values())

    @model_serializer(mode="wrap")
    def drop_unset_facts(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        data: dict[str, Any] = handler(self)
        # Unset optional facts and an unset map pin are omitted, so older shops keep their shape.
        pin_defaults = {"lat": None, "lng": None, "place_id": None, "pin_label": None}
        return {
            key: value
            for key, value in data.items()
            if (key not in FACT_KEYS or value not in (None, "", []))
            and not (key in pin_defaults and value is None)
            and not (key == "pin_demo" and value is False)
            and not (key == "demo" and value is False)
            and not (key == "supplier" and value is False)
            and not (key == "supplies" and value == [])
            and not (key == "min_order" and value == "")
            and not (key == "timezone" and value == "Asia/Singapore")
            and not (key == "custom_facts" and value == [])
            and not (key == "reward_text" and value == "")
            and not (key == "stamps_needed" and value == 8)
            and not (key == "weekly_hours" and value == [])
        }

    @model_validator(mode="after")
    def validate_location(self) -> BusinessFields:
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Provide both latitude and longitude.")
        try:
            shop_timezone(self.timezone)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Use an IANA timezone.") from error
        return self


def customer_facts(fields: dict[str, Any]) -> dict[str, Any]:
    """The facts a shop has stated, for customers (unset facts are simply absent)."""
    facts = {key: fields[key] for key in FACT_KEYS if fields.get(key) not in (None, "", [])}
    if fields.get("custom_facts"):
        facts["custom"] = [
            {"key": fact["key"], "label": fact["label"], "value": fact["value"]}
            for fact in fields["custom_facts"]
        ]
    return facts


class ProductFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=180)
    category: str = Field(default="", max_length=80)
    price: int = Field(
        ge=0, le=100_000_000, description="Minor units of the shop currency; integer, never a float"
    )
    unit: str = Field(default="item", min_length=1, max_length=40)
    stock: int | None = Field(default=None, ge=0, le=1_000_000)
    available: bool = True
    # Set only when the owner picks a new unit for an item saved under another one: the commit
    # updates that saved item instead of adding a second one. Never stored on the item.
    previous_unit: str | None = Field(default=None, min_length=1, max_length=40)

    @model_serializer(mode="wrap")
    def drop_empty_category(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        data: dict[str, Any] = handler(self)
        if not data["category"]:
            del data["category"]
        if data.get("previous_unit") in (None, data["unit"]):
            data.pop("previous_unit", None)
        return data


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
    # Separate consent to look up a pin; never inferred from approval to save.
    geocode_confirmed: bool = False
    business: BusinessFields | None = None
    products: list[ProductFields] = Field(default_factory=list, max_length=200)


class Approval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    digest: str = Field(min_length=64, max_length=64)


# Fixed IDs of seeded demo shops; the only non-UUID business IDs the stores accept.
DEMO_ID = re.compile(r"^demo-[a-z0-9-]{1,40}$")


def check_demo_seed(bid: str, fields: BusinessFields) -> dict[str, Any]:
    if not DEMO_ID.fullmatch(bid):
        raise ValueError("Demo shop IDs look like demo-katong-kopitiam.")
    if not fields.demo:
        raise ValueError("Seeded shops must be labelled demo.")
    return fields.model_dump()


def demo_product_id(bid: str, product: ProductFields) -> str:
    """Stable product IDs so re-seeding keeps the same rows."""
    return str(uuid5(NAMESPACE_URL, f"chalkboard-demo/{bid}/{product.name}/{product.unit}"))


PROPOSAL_SECONDS = 600
CHALLENGE_SECONDS = 90


class MerchantRepository(Protocol):
    """Owner-scoped merchant records shared by the local SQLite and Firestore adapters."""

    def list_businesses(self, uid: str) -> list[dict[str, Any]]: ...
    def context(self, uid: str, bid: str | None) -> dict[str, Any]: ...
    def inventory(self, uid: str, bid: str) -> list[dict[str, Any]]: ...
    def sales_history(self, uid: str, bid: str) -> list[dict[str, Any]]: ...
    def prepare_sales(self, uid: str, bid: str, rows: list[dict[str, Any]]) -> dict[str, Any]: ...
    def save_sales(self, uid: str, bid: str, iid: str, digest: str) -> dict[str, Any]: ...
    def confirm_menu(self, uid: str, bid: str) -> dict[str, Any]: ...
    def recap_signals(self, uid: str, bid: str) -> dict[str, Any]: ...
    def set_notes(self, uid: str, bid: str, notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Replace the coach's private notes for a shop (owner-only, never public)."""
        ...

    def set_gallery(self, uid: str, bid: str, photos: list[str]) -> list[str]:
        """Replace the shop's gallery (photo IDs the owner chose to show customers)."""
        ...

    def recap_cache(
        self, uid: str, bid: str, key: str, value: dict[str, Any] | None = None
    ) -> dict[str, Any] | None: ...
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

    def shared_shops(self) -> list[dict[str, Any]]: ...
    def seed_demo_shop(
        self, uid: str, bid: str, fields: BusinessFields, products: list[ProductFields]
    ) -> bool:
        """Create or reset one labelled demo shop (shared, owned by uid). Idempotent: returns
        False when the stored shop already matches. Refuses a non-demo ID or someone else's shop."""
        ...

    def subscribe_stock(self, bid: str, body: StockAlertInput) -> StockAlertReceipt: ...
    def stock_alerts(self, bid: str, device_id: str) -> list[dict[str, Any]]: ...

    # Requests to suppliers (sourcing.py); owner-scoped, newest first.
    def supplier_orders(self, uid: str, bid: str) -> list[dict[str, Any]]: ...
    def save_supplier_order(self, uid: str, bid: str, order: dict[str, Any]) -> dict[str, Any]:
        """Create or replace one order; refuses a stale `version` (409)."""
        ...

    def add_inquiry(self, bid: str, body: InquiryInput) -> InquiryReceipt: ...
    def inquiries(self, uid: str, bid: str) -> list[Inquiry]: ...
    def complete_inquiry(self, uid: str, bid: str, iid: str) -> Inquiry: ...
    def thread_action(
        self, uid: str | None, bid: str, iid: str, token: str, action: str, text: str = ""
    ) -> Inquiry: ...


def public_projection(
    bid: str, fields: dict[str, Any], products: list[dict[str, Any]]
) -> dict[str, Any]:
    """Only what a customer should see: no owners, revisions, stock counts or internal status."""
    return {
        "id": bid,
        "name": fields["name"],
        "category": fields.get("category", ""),
        "location": fields.get("location", ""),
        "lat": fields.get("lat"),
        "lng": fields.get("lng"),
        "place_id": fields.get("place_id"),
        "timezone": fields.get("timezone") or "Asia/Singapore",
        **({"pin_demo": True} if fields.get("pin_demo") else {}),
        # Sample shops are always labelled "Demo shop" to customers.
        **({"demo": True} if fields.get("demo") else {}),
        **(
            {
                "supplier": True,
                "supplies": fields.get("supplies") or [],
                "min_order": fields.get("min_order", ""),
            }
            if fields.get("supplier")
            else {}
        ),
        "hours": fields.get("hours", ""),
        **({"weekly_hours": fields["weekly_hours"]} if fields.get("weekly_hours") else {}),
        "phone": fields.get("phone", ""),
        "currency": fields.get("currency") or "SGD",
        **({"reward_text": fields["reward_text"]} if fields.get("reward_text") else {}),
        "stamps_needed": fields.get("stamps_needed", 8),
        # Only facts the owner confirmed; customer Q&A grounds on these too.
        "facts": customer_facts(fields),
        "products": [
            {
                "name": product["name"],
                **({"category": product["category"]} if product.get("category") else {}),
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
    if (
        request.kind == "business"
        and request.business
        and not request.business_id
        and "timezone" not in request.business.model_fields_set
        and (zone := client_timezone.get())
    ):
        # A new shop opens in its owner's own timezone, wherever they are.
        request.business.timezone = zone


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
            CREATE TABLE IF NOT EXISTS stock_alerts(business_id TEXT, id TEXT, device_id TEXT,
              name TEXT, unit TEXT, expires REAL, ready INTEGER,
              PRIMARY KEY(business_id,id));
            CREATE TABLE IF NOT EXISTS google_sim(uid TEXT NOT NULL, business_id TEXT NOT NULL,
                state TEXT NOT NULL, PRIMARY KEY(uid,business_id));
            CREATE TABLE IF NOT EXISTS planning(business_id TEXT, product_id TEXT, fields TEXT,
                PRIMARY KEY(business_id, product_id));
            CREATE TABLE IF NOT EXISTS inquiries(id TEXT PRIMARY KEY, business_id TEXT NOT NULL,
                dedupe TEXT NOT NULL, created REAL NOT NULL, fields TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS inquiry_blocks(business_id TEXT NOT NULL,
                key TEXT NOT NULL, PRIMARY KEY(business_id, key));
            CREATE INDEX IF NOT EXISTS inquiry_lookup ON inquiries(business_id, dedupe, created);
            CREATE TABLE IF NOT EXISTS sales_days(business_id TEXT, day TEXT, fields TEXT,
                PRIMARY KEY(business_id,day));
            CREATE TABLE IF NOT EXISTS sales_imports(id TEXT PRIMARY KEY, uid TEXT,
                business_id TEXT, fields TEXT);
            CREATE TABLE IF NOT EXISTS recaps(business_id TEXT, key TEXT, fields TEXT,
                PRIMARY KEY(business_id,key));
            CREATE TABLE IF NOT EXISTS sold_out_days(business_id TEXT, day TEXT, count INTEGER,
                PRIMARY KEY(business_id,day));
            CREATE TABLE IF NOT EXISTS supplier_orders(id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL, created REAL NOT NULL, fields TEXT NOT NULL);
            """)
            if "last_confirmed" not in {
                row[1] for row in db.execute("PRAGMA table_info(businesses)")
            }:
                db.execute("ALTER TABLE businesses ADD COLUMN last_confirmed TEXT")
            columns = {row[1] for row in db.execute("PRAGMA table_info(businesses)")}
            if "coach_notes" not in columns:
                db.execute("ALTER TABLE businesses ADD COLUMN coach_notes TEXT")
            if "gallery" not in columns:
                db.execute("ALTER TABLE businesses ADD COLUMN gallery TEXT")

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
            "last_confirmed": row["last_confirmed"],
            "coach_notes": json.loads(row["coach_notes"] or "[]"),
            "gallery": json.loads(row["gallery"] or "[]"),
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
                        "INSERT INTO businesses(id,fields,revision,status) VALUES(?,?,1,'draft')",
                        (bid, json.dumps(data["business"])),
                    )
                    db.execute("INSERT INTO memberships VALUES(?,?,'owner')", (uid, bid))
            else:
                db.execute("UPDATE businesses SET revision=revision+1 WHERE id=?", (bid,))
            # Inventory proposals, or a brand-new shop arriving with its menu.
            for product in data["products"]:
                find = (
                    "SELECT id FROM inventory WHERE business_id=? AND "
                    "json_extract(fields,'$.name')=? AND json_extract(fields,'$.unit')=?"
                )
                existing = db.execute(find, (bid, product["name"], product["unit"])).fetchone()
                if previous := product.pop("previous_unit", None):
                    # A new unit for a saved item: that item changes, no second copy.
                    old = db.execute(find, (bid, product["name"], previous)).fetchone()
                    if old and existing:
                        db.execute("DELETE FROM inventory WHERE id=?", (old[0],))
                    existing = existing or old
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
                db.execute("DELETE FROM stock_alerts WHERE business_id=?", (bid,))
                for table in ("sales_days", "sales_imports", "recaps", "sold_out_days"):
                    db.execute(f"DELETE FROM {table} WHERE business_id=?", (bid,))  # noqa: S608
                db.execute("DELETE FROM inquiries WHERE business_id=?", (bid,))
                db.execute("DELETE FROM inquiry_blocks WHERE business_id=?", (bid,))
                db.execute("DELETE FROM planning WHERE business_id=?", (bid,))
                db.execute("DELETE FROM supplier_orders WHERE business_id=?", (bid,))
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
            business = self.owned(db, uid, bid)
            row = db.execute(
                "SELECT fields FROM inventory WHERE id=? AND business_id=?", (product_id, bid)
            ).fetchone()
            if not row:
                raise HTTPException(404, "Product not found.")
            fields = {**json.loads(row[0]), "available": available}
            db.execute("DELETE FROM stock_alerts WHERE expires<=?", (time.time(),))
            if available and not json.loads(row[0]).get("available", True):
                db.execute(
                    "UPDATE stock_alerts SET ready=1 WHERE business_id=? AND name=? AND unit=?",
                    (bid, fields["name"], fields["unit"]),
                )
            if not available and json.loads(row[0]).get("available", True):
                day = today_for(json.loads(business["fields"])).isoformat()
                db.execute(
                    "INSERT INTO sold_out_days VALUES(?,?,1) ON CONFLICT(business_id,day) "
                    "DO UPDATE SET count=count+1",
                    (bid, day),
                )
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

    def shared_shops(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            bids = [row[0] for row in db.execute("SELECT business_id FROM shares").fetchall()]
        return [shop for bid in bids if (shop := self.public_shop(bid)) is not None]

    def seed_demo_shop(
        self, uid: str, bid: str, fields: BusinessFields, products: list[ProductFields]
    ) -> bool:
        record = check_demo_seed(bid, fields)
        items = {demo_product_id(bid, p): p.model_dump() for p in products}
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT fields, revision FROM businesses WHERE id=?", (bid,)
            ).fetchone()
            if row:
                # Never take over a shop someone else owns, even under a demo-looking ID.
                self.owned(db, uid, bid)
                stored = {
                    item[0]: json.loads(item[1])
                    for item in db.execute(
                        "SELECT id, fields FROM inventory WHERE business_id=?", (bid,)
                    )
                }
                shared = db.execute("SELECT 1 FROM shares WHERE business_id=?", (bid,)).fetchone()
                if json.loads(row["fields"]) == record and stored == items and shared:
                    return False
                db.execute(
                    "UPDATE businesses SET fields=?, revision=revision+1 WHERE id=?",
                    (json.dumps(record), bid),
                )
                db.execute("DELETE FROM inventory WHERE business_id=?", (bid,))
            else:
                db.execute(
                    "INSERT INTO people VALUES(?,?) ON CONFLICT DO NOTHING", (uid, "not_enrolled")
                )
                db.execute(
                    "INSERT INTO businesses(id, fields, revision, status) VALUES(?,?,1,'draft')",
                    (bid, json.dumps(record)),
                )
                db.execute("INSERT INTO memberships VALUES(?,?,'owner')", (uid, bid))
            db.executemany(
                "INSERT INTO inventory VALUES(?,?,?)",
                [(pid, bid, json.dumps(item)) for pid, item in items.items()],
            )
            db.execute("INSERT INTO shares VALUES(?) ON CONFLICT DO NOTHING", (bid,))
        return True

    def public_shop(self, bid: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT b.fields,b.last_confirmed,b.gallery FROM businesses b "
                "JOIN shares s ON s.business_id=b.id "
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
        return {
            **public_projection(bid, json.loads(row[0]), products),
            "last_confirmed": row[1],
            "gallery": json.loads(row[2] or "[]"),
        }

    def subscribe_stock(self, bid: str, body: StockAlertInput) -> StockAlertReceipt:
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT b.fields FROM businesses b JOIN shares s ON s.business_id=b.id "
                "WHERE b.id=?",
                (bid,),
            ).fetchone()
            products = [
                json.loads(p[0])
                for p in db.execute("SELECT fields FROM inventory WHERE business_id=?", (bid,))
            ]
            check_item({"products": products} if row else None, body)
            db.execute("DELETE FROM stock_alerts WHERE expires<=?", (now,))
            key = alert_key(body)
            prior = db.execute(
                "SELECT expires FROM stock_alerts WHERE business_id=? AND id=?", (bid, key)
            ).fetchone()
            if prior:
                return StockAlertReceipt(expires=prior[0])
            count = db.execute(
                "SELECT count(*) FROM stock_alerts WHERE business_id=?", (bid,)
            ).fetchone()[0]
            if count >= MAX_ALERTS:
                raise HTTPException(429, "Too many reminders. Try again later.")
            expires = now + ALERT_SECONDS
            db.execute(
                "INSERT INTO stock_alerts VALUES(?,?,?,?,?,?,0)",
                (bid, key, str(body.device_id), body.name, body.unit, expires),
            )
            return StockAlertReceipt(expires=expires)

    def stock_alerts(self, bid: str, device_id: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM shares WHERE business_id=?", (bid,)).fetchone():
                raise HTTPException(404, "Shop not available.")
            db.execute("DELETE FROM stock_alerts WHERE expires<=?", (time.time(),))
            return [
                {"name": row[0], "unit": row[1], "expires": row[2], "ready": bool(row[3])}
                for row in db.execute(
                    "SELECT name,unit,expires,ready FROM stock_alerts "
                    "WHERE business_id=? AND device_id=?",
                    (bid, device_id),
                )
            ]

    def sales_history(self, uid: str, bid: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            self.owned(db, uid, bid)
            return [
                sale
                for row in db.execute(
                    "SELECT fields FROM sales_days WHERE business_id=? ORDER BY day", (bid,)
                )
                for sale in json.loads(row[0])
            ]

    def prepare_sales(self, uid: str, bid: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            business = self.owned(db, uid, bid)
            proposal = prepare_import(
                {
                    "id": bid,
                    "revision": business["revision"],
                    "fields": json.loads(business["fields"]),
                },
                rows,
            )
            db.execute("DELETE FROM sales_imports WHERE uid=? AND business_id=?", (uid, bid))
            db.execute(
                "INSERT INTO sales_imports VALUES(?,?,?,?)",
                (proposal["id"], uid, bid, json.dumps(proposal)),
            )
            return proposal

    def save_sales(self, uid: str, bid: str, iid: str, digest: str) -> dict[str, Any]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            business = self.owned(db, uid, bid)
            row = db.execute(
                "SELECT fields FROM sales_imports WHERE id=? AND uid=? AND business_id=?",
                (iid, uid, bid),
            ).fetchone()
            if not row:
                raise HTTPException(404, "Sales import not found.")
            proposal = json.loads(row[0])
            check_import(proposal, digest, business["revision"])
            if proposal.get("receipt"):
                return dict(proposal["receipt"])
            incoming = sales_days(proposal["snapshot"]["sales"])
            retained = [
                sale
                for r in db.execute("SELECT day,fields FROM sales_days WHERE business_id=?", (bid,))
                if r[0] not in incoming
                for sale in json.loads(r[1])
            ]
            validate_capacity(retained + proposal["snapshot"]["sales"])
            for day, sales in incoming.items():
                db.execute(
                    "INSERT INTO sales_days VALUES(?,?,?) ON CONFLICT(business_id,day) "
                    "DO UPDATE SET fields=excluded.fields",
                    (bid, day, json.dumps(sales)),
                )
            db.execute("UPDATE businesses SET revision=revision+1 WHERE id=?", (bid,))
            receipt = {"business_id": bid, "import_id": iid, "saved": True, "days": len(incoming)}
            proposal["receipt"] = receipt
            db.execute("UPDATE sales_imports SET fields=? WHERE id=?", (json.dumps(proposal), iid))
            return receipt

    def confirm_menu(self, uid: str, bid: str) -> dict[str, Any]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            business = self.owned(db, uid, bid)
            day = today_for(json.loads(business["fields"])).isoformat()
            db.execute("UPDATE businesses SET last_confirmed=? WHERE id=?", (day, bid))
            return {"business_id": bid, "last_confirmed": day}

    def set_notes(self, uid: str, bid: str, notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.owned(db, uid, bid)
            db.execute("UPDATE businesses SET coach_notes=? WHERE id=?", (json.dumps(notes), bid))
            return notes

    def set_gallery(self, uid: str, bid: str, photos: list[str]) -> list[str]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.owned(db, uid, bid)
            db.execute("UPDATE businesses SET gallery=? WHERE id=?", (json.dumps(photos), bid))
            return photos

    def recap_signals(self, uid: str, bid: str) -> dict[str, Any]:
        with self.connect() as db:
            business = self.owned(db, uid, bid)
            return {
                "fields": json.loads(business["fields"]),
                "sold_out": {
                    r[0]: r[1]
                    for r in db.execute(
                        "SELECT day,count FROM sold_out_days WHERE business_id=?", (bid,)
                    )
                },
                "questions": [
                    json.loads(r[0])
                    for r in db.execute("SELECT fields FROM inquiries WHERE business_id=?", (bid,))
                ],
            }

    def recap_cache(
        self, uid: str, bid: str, key: str, value: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.owned(db, uid, bid)
            if value is not None:
                db.execute(
                    "INSERT INTO recaps VALUES(?,?,?) ON CONFLICT(business_id,key) "
                    "DO UPDATE SET fields=excluded.fields",
                    (bid, key, json.dumps(value)),
                )
                return value
            row = db.execute(
                "SELECT fields FROM recaps WHERE business_id=? AND key=?", (bid, key)
            ).fetchone()
            return json.loads(row[0]) if row else None

    def supplier_orders(self, uid: str, bid: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            self.owned(db, uid, bid)
            return [
                json.loads(row[0])
                for row in db.execute(
                    "SELECT fields FROM supplier_orders WHERE business_id=? "
                    "ORDER BY created DESC LIMIT 100",
                    (bid,),
                )
            ]

    def save_supplier_order(self, uid: str, bid: str, order: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.owned(db, uid, bid)
            row = db.execute(
                "SELECT fields FROM supplier_orders WHERE business_id=? AND id=?",
                (bid, order["id"]),
            ).fetchone()
            stored = json.loads(row[0])["version"] if row else 0
            if order["version"] != stored + 1:
                raise HTTPException(409, "This order changed. Reload it.")
            db.execute(
                "INSERT INTO supplier_orders VALUES(?,?,?,?) ON CONFLICT(id) "
                "DO UPDATE SET fields=excluded.fields",
                (order["id"], bid, order["created"], json.dumps(order)),
            )
        return order

    # Private planning records do not change catalog revisions or public projections.
    def add_inquiry(self, bid: str, body: InquiryInput) -> InquiryReceipt:
        data, token = new_thread(body)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM shares WHERE business_id=?", (bid,)).fetchone():
                raise HTTPException(404, "This shop page is not available.")
            if db.execute(
                "SELECT 1 FROM inquiry_blocks WHERE business_id=? AND key=?",
                (bid, contact_hash(body.contact)),
            ).fetchone():
                raise HTTPException(409, "This conversation is closed.")
            db.execute(
                "INSERT INTO inquiries VALUES(?,?,?,?,?)",
                (data["id"], bid, "", data["created"], json.dumps(data)),
            )
        return InquiryReceipt(id=data["id"], token=token)

    def inquiries(self, uid: str, bid: str) -> list[Inquiry]:
        with self.connect() as db:
            self.owned(db, uid, bid)
            records = [
                Inquiry.model_validate_json(row[0])
                for row in db.execute(
                    "SELECT fields FROM inquiries WHERE business_id=? ORDER BY created DESC", (bid,)
                )
            ]
        return sorted(
            records,
            key=lambda r: (
                not (r.unread and not r.done),
                -r.messages[-1].created if r.messages else -r.created,
            ),
        )[:100]

    def complete_inquiry(self, uid: str, bid: str, iid: str) -> Inquiry:
        return self.thread_action(uid, bid, iid, "", "close")

    def thread_action(
        self, uid: str | None, bid: str, iid: str, token: str, action: str, text: str = ""
    ) -> Inquiry:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if uid is not None:
                self.owned(db, uid, bid)
            row = db.execute(
                "SELECT fields FROM inquiries WHERE business_id=? AND id=?", (bid, iid)
            ).fetchone()
            if not row:
                raise HTTPException(404, "Conversation not found.")
            data = json.loads(row[0])
            blocked = bool(
                db.execute(
                    "SELECT 1 FROM inquiry_blocks WHERE business_id=? AND key=?",
                    (bid, contact_hash(data["contact"])),
                ).fetchone()
            )
            record = change_thread(data, uid, token, action, text, blocked)
            if action == "delete":
                db.execute("DELETE FROM inquiries WHERE business_id=? AND id=?", (bid, iid))
            elif action != "get":
                db.execute(
                    "UPDATE inquiries SET fields=? WHERE business_id=? AND id=?",
                    (json.dumps({**data, **record.model_dump()}), bid, iid),
                )
                if action == "block":
                    for key in (contact_hash(record.contact), data.get("token_hash", "")):
                        db.execute("INSERT OR IGNORE INTO inquiry_blocks VALUES(?,?)", (bid, key))
            return record

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
