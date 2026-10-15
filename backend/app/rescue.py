"""Forecast leftovers and exact, expiring rescue proposals. No payments or stock writes."""

from __future__ import annotations

import hashlib
import json
import math
import re
import secrets
import time
from datetime import datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .community import Update, update_key
from .forecast import Forecast, Prediction
from .merchant import MerchantRepository
from .shop_time import shop_timezone


class RescueItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=180)
    qty: int = Field(ge=1, le=1000, strict=True)


class RescueInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    items: list[RescueItemInput] = Field(min_length=1, max_length=20)
    discount_pct: Literal[20, 30, 50] = 30
    until: str = Field(
        pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$",
        description="Today's pickup deadline in shop-local HH:MM; no overnight deals",
    )
    pickup_note: str = Field(default="", max_length=300)

    @model_validator(mode="after")
    def unique(self) -> RescueInput:
        if len({item.name.casefold() for item in self.items}) != len(self.items):
            raise ValueError("Use one row per item.")
        return self


class RescueItem(BaseModel):
    name: str
    qty: int
    qty_left: int
    price: int
    was: int
    unit: str


class Deal(BaseModel):
    id: str
    shop_id: str
    items: list[RescueItem]
    currency: str
    starts: float
    ends: float
    pickup_note: str
    status: Literal["live", "ended", "expired"]
    demo: bool
    countdown_seconds: int


class RescueProposal(BaseModel):
    status: Literal["needs_review"] = "needs_review"
    id: str
    digest: str
    expires: float
    snapshot: Deal


class RescueSuggestion(BaseModel):
    name: str
    quantity: int
    forecast: float
    prepared: float
    sold: float
    expected_rest: float
    buffer: int
    discount_pct: Literal[20, 30, 50]
    estimate: bool = True


class Suggestions(BaseModel):
    items: list[RescueSuggestion]
    until: str | None
    demo: bool
    method: str
    note: str = (
        "Estimate assumes saved stock is opening prepared quantity; confirm what remains. "
        "Missing sales or closing hours prevents an estimate."
    )


def local_now(fields: dict[str, Any], now: float | None = None) -> datetime:
    return datetime.fromtimestamp(
        time.time() if now is None else now,
        shop_timezone(fields.get("timezone") or "Asia/Singapore"),
    )


def closing(fields: dict[str, Any], now: datetime) -> datetime | None:
    weekly = fields.get("weekly_hours") or []
    day = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[now.weekday()]
    row = next((r for r in weekly if r["day"] == day), None)
    if row and row.get("closed"):
        return None
    values = re.findall(r"(?:[01]\d|2[0-3]):[0-5]\d", fields.get("hours", ""))
    opens, closes = (
        (row.get("open"), row.get("close"))
        if row
        else (values[0], values[-1])
        if len(values) >= 2
        else (None, None)
    )
    if not opens or not closes or closes <= opens:
        return None  # Overnight hours need an explicit future design; never cross midnight.
    hour, minute = map(int, closes.split(":"))
    return now.replace(hour=hour, minute=minute, second=0, microsecond=0)


def buffer_for(prediction: Prediction, method: str, share: float = 1.0) -> int:
    if method == "timesfm" and prediction.upper is not None and prediction.lower is not None:
        sigma = (prediction.upper - prediction.lower) / (2 * 1.645) * share
        return max(1, math.ceil(1.645 * sigma))
    return max(1, math.ceil(0.1 * prediction.quantity))


def suggestions(
    context: dict[str, Any],
    sales: list[dict[str, Any]],
    forecast: Forecast,
    now: float | None = None,
) -> Suggestions:
    fields = context["business"]["fields"]
    current = local_now(fields, now)
    close = closing(fields, current)
    result = Suggestions(
        items=[],
        until=(close - timedelta(minutes=15)).strftime("%H:%M") if close else None,
        demo=bool(fields.get("demo")),
        method=forecast.method,
    )
    if close is None or not 30 <= (close - current).total_seconds() / 60 <= 120:
        return result
    category = fields.get("category", "").casefold()
    share = (
        0.20
        if any(c in category for c in ("bake", "bakery", "cafe", "café", "coffee"))
        else 0.15
        if "hawker" in category
        else 0.25
    )
    predictions = {p.item.casefold(): p for p in forecast.predictions if p.date == current.date()}
    for item in context["inventory"]:
        # Only food categories or an explicit perishable product section qualify.
        perishable = any(
            word in f"{category} {item.get('category', '')}"
            for word in (
                "bake",
                "bakery",
                "cafe",
                "café",
                "food",
                "hawker",
                "perishable",
                "pastr",
                "bread",
            )
        )
        prediction = predictions.get(item["name"].casefold())
        sold_rows = [
            r
            for r in sales
            if r["date"] == current.date().isoformat()
            and r["item"].casefold() == item["name"].casefold()
        ]
        if not perishable or not prediction or not sold_rows or not item.get("available", True):
            continue
        sold = sum(r["quantity"] for r in sold_rows)
        prepared = item.get("stock") if item.get("stock") is not None else prediction.quantity
        expected = prediction.quantity * share
        buffer = buffer_for(prediction, forecast.method, share)
        leftover = max(0, math.floor(prepared - sold - expected - buffer))
        if leftover < 2:
            continue
        ratio = leftover / max(1, prepared)
        discount: Literal[20, 30, 50] = (
            50
            if ratio > 0.35 or (close - current).total_seconds() < 2700
            else 30
            if ratio >= 0.15
            else 20
        )
        result.items.append(
            RescueSuggestion(
                name=item["name"],
                quantity=leftover,
                forecast=prediction.quantity,
                prepared=prepared,
                sold=sold,
                expected_rest=expected,
                buffer=buffer,
                discount_pct=discount,
            )
        )
    return result


def public_deal(data: dict[str, Any], now: float | None = None) -> Deal:
    now = time.time() if now is None else now
    result = {
        key: value
        for key, value in data.items()
        if key not in {"holds", "day", "revision", "fingerprint"}
    }
    result["status"] = (
        "expired" if data["status"] == "live" and data["ends"] <= now else data["status"]
    )
    result["countdown_seconds"] = (
        max(0, math.floor(data["ends"] - now)) if result["status"] == "live" else 0
    )
    items = []
    for item in data["items"]:
        held = sum(h["qty"] for h in data.get("holds", {}).values() if h["name"] == item["name"])
        items.append({**item, "qty_left": max(0, item["qty"] - held)})
    result["items"] = items
    return Deal.model_validate(result)


def fingerprint(context: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(context, sort_keys=True).encode()).hexdigest()


def prepare(
    store: MerchantRepository, uid: str, bid: str, body: RescueInput, now: float | None = None
) -> RescueProposal:
    now = time.time() if now is None else now
    context = store.context(uid, bid)
    fields = context["business"]["fields"]
    current = local_now(fields, now)
    close = closing(fields, current)
    hour, minute = map(int, body.until.split(":"))
    until = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if close is None or not current < until <= close:
        raise HTTPException(
            422,
            "Use a future pickup time today, no later than closing. "
            "Save daytime closing hours first.",
        )
    items = []
    for row in body.items:
        products = [p for p in context["inventory"] if p["name"].casefold() == row.name.casefold()]
        if len(products) != 1 or not products[0].get("available", True):
            raise HTTPException(422, "Choose an available saved item with an unambiguous name.")
        product = products[0]
        if product.get("stock") is not None and row.qty > product["stock"]:
            raise HTTPException(422, "Rescue quantity exceeds saved stock.")
        items.append(
            {
                "name": product["name"],
                "qty": row.qty,
                "was": product["price"],
                "price": (product["price"] * (100 - body.discount_pct) + 50) // 100,
                "unit": product["unit"],
            }
        )
    rid = str(uuid4())
    data: dict[str, Any] = {
        "id": rid,
        "shop_id": bid,
        "items": items,
        "currency": fields.get("currency") or "SGD",
        "starts": now,
        "ends": until.timestamp(),
        "pickup_note": body.pickup_note,
        "status": "live",
        "demo": bool(fields.get("demo")),
        "day": current.date().isoformat(),
        "fingerprint": fingerprint(context),
        "holds": {},
    }
    snapshot = public_deal(data, now)
    digest = hashlib.sha256(
        json.dumps(snapshot.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    proposal = {"id": rid, "digest": digest, "expires": min(now + 600, data["ends"]), "data": data}

    def change(old: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        state = old or {"deals": []}
        state["pending"] = proposal
        return now, state

    store.feature_docs.update("rescue", bid, bid, change)
    return RescueProposal(id=rid, digest=digest, expires=proposal["expires"], snapshot=snapshot)


def approve(
    store: MerchantRepository, uid: str, bid: str, rid: str, digest: str, now: float | None = None
) -> Deal:
    now = time.time() if now is None else now
    context = store.context(uid, bid)
    result: dict[str, Any] = {}

    def change(old: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        state = old or {"deals": []}
        existing = next((d for d in state["deals"] if d["id"] == rid), None)
        pending = state.get("pending", {})
        if existing is not None and secrets.compare_digest(existing.get("digest", ""), digest):
            result.update(existing["data"])
            return now, state
        if (
            pending.get("id") != rid
            or not secrets.compare_digest(pending.get("digest", ""), digest)
            or pending.get("expires", 0) <= now
        ):
            raise HTTPException(409, "Review the current exact rescue proposal.")
        data = pending["data"]
        if data["fingerprint"] != fingerprint(context):
            raise HTTPException(409, "Shop or stock changed. Review rescue again.")
        names = {p["name"].casefold() for p in data["items"]}
        if any(
            d["data"]["day"] == data["day"]
            and names & {p["name"].casefold() for p in d["data"]["items"]}
            for d in state["deals"]
        ):
            raise HTTPException(409, "Only one rescue per item per shop-local day.")
        state["deals"] = [d for d in state["deals"] if d["data"]["starts"] >= now - 30 * 86400]
        state["deals"].append({"digest": digest, "id": rid, "data": data})
        state.pop("pending", None)
        result.update(data)
        return now, state

    store.feature_docs.update("rescue", bid, bid, change)
    publish_update(store, result)
    return public_deal(result, now)


def publish_update(store: MerchantRepository, data: dict[str, Any]) -> None:
    # Deterministic key makes retries repair a failed feed write without duplicate notifications.
    item = data["items"][0]
    update = Update(
        id=data["id"],
        shop_id=data["shop_id"],
        kind="rescue_deal",
        rescue_id=data["id"],
        ends=data["ends"],
        item=item["name"],
        price=item["price"],
        old_price=item["was"],
        unit=item["unit"],
        currency=data["currency"],
        created=data["starts"],
        demo=data["demo"],
    )
    store.feature_docs.put(
        "update",
        update_key(data["shop_id"], data["id"]),
        data["shop_id"],
        data["starts"],
        update.model_dump(),
    )


def deals(store: MerchantRepository, bid: str, now: float | None = None) -> list[Deal]:
    state = store.feature_docs.get("rescue", bid) or {}
    return [public_deal(d["data"], now) for d in state.get("deals", [])]


def end(store: MerchantRepository, uid: str, bid: str, rid: str) -> Deal:
    store.context(uid, bid)
    result: dict[str, Any] = {}

    def change(old: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        state = old or {}
        found = next((d["data"] for d in state.get("deals", []) if d["id"] == rid), None)
        if found is None:
            raise HTTPException(404, "Rescue deal not found.")
        found["status"] = "ended"
        result.update(found)
        return time.time(), state

    store.feature_docs.update("rescue", bid, bid, change)
    return public_deal(result)


class HoldInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    thread_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=180)
    qty: int = Field(ge=1, le=1000, strict=True)


def hold(
    store: MerchantRepository, bid: str, rid: str, body: HoldInput, now: float | None = None
) -> Deal:
    """Called only after checking the customer's owned thread; atomically cap reservations."""
    now = time.time() if now is None else now
    result: dict[str, Any] = {}

    def change(old: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        state = old or {}
        data = next((d["data"] for d in state.get("deals", []) if d["id"] == rid), None)
        if data is None or data["status"] != "live" or not data["starts"] <= now < data["ends"]:
            raise HTTPException(409, "This rescue has ended.")
        item = next(
            (p for p in data["items"] if p["name"].casefold() == body.name.casefold()), None
        )
        if item is None:
            raise HTTPException(422, "Choose an item in this rescue.")
        key = body.thread_id + ":" + item["name"]
        prior = data["holds"].get(key)
        if prior:
            if prior["qty"] != body.qty:
                raise HTTPException(
                    409, "A hold already exists; ask the owner in chat to change it."
                )
        else:
            if len(data["holds"]) >= 200:
                raise HTTPException(409, "This rescue has reached its reservation limit.")
            held = sum(h["qty"] for h in data["holds"].values() if h["name"] == item["name"])
            if held + body.qty > item["qty"]:
                raise HTTPException(409, "Not enough rescue items remain.")
            data["holds"][key] = {
                "name": item["name"],
                "qty": body.qty,
                "thread_id": body.thread_id,
            }
        result.update(data)
        return now, state

    store.feature_docs.update("rescue", bid, bid, change)
    return public_deal(result, now)


def release_hold(store: MerchantRepository, bid: str, rid: str, body: HoldInput) -> None:
    """Compensate a failed chat delivery; never leave an unannounced reservation."""

    def change(old: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        state = old or {}
        data = next((d["data"] for d in state.get("deals", []) if d["id"] == rid), None)
        if data:
            item = next(
                (p for p in data["items"] if p["name"].casefold() == body.name.casefold()), None
            )
            if item:
                data["holds"].pop(body.thread_id + ":" + item["name"], None)
        return time.time(), state

    store.feature_docs.update("rescue", bid, bid, change)


def seed_demo_deals(
    store: MerchantRepository, uid: str, bids: list[str], now: float | None = None
) -> None:
    now = time.time() if now is None else now
    made = 0
    for bid in bids:
        context = store.context(uid, bid)
        if not context["business"]["fields"].get("demo"):
            continue
        if any(d.status == "live" for d in deals(store, bid, now)):
            made += 1
            if made >= 2:
                break
            continue
        current = local_now(context["business"]["fields"], now)
        close = closing(context["business"]["fields"], current)
        if close is None or close.timestamp() - now < 120:
            continue
        item = next((p for p in context["inventory"] if p.get("available", True)), None)
        if not item:
            continue
        until = min(close, current + timedelta(minutes=90)).strftime("%H:%M")
        try:
            proposal = prepare(
                store,
                uid,
                bid,
                RescueInput(items=[RescueItemInput(name=item["name"], qty=6)], until=until),
                now,
            )
            approve(store, uid, bid, proposal.id, proposal.digest, now)
        except HTTPException:
            continue
        made += 1
        if made >= 2:
            break
