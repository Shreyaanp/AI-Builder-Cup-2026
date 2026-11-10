"""Today cards on the owner home (OB-176, #535): dismiss with a reason, and how often.

The owner home shows a few cards from real data (customers waiting, last night's promise, stock
that runs out, a supplier's reply, items with no price, setup steps). Here the owner decides what
stays: X on a card asks "Not now" (back tomorrow, shop time) or "Not useful" (that kind of card
rests for two weeks), and one setting says how often cards come at all: every day, only
important ones, or off (a waiting customer still shows: that is a person, not a suggestion).

Stored per shop on the server, so every phone and the coach see the same choice; erased with the
shop. The reasons are counted (kind, reason) so we see which cards owners find useless.
"""

from __future__ import annotations

import time
from datetime import timedelta
from typing import Any, Literal

import anyio
import structlog
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from .limits import enforce_limits
from .merchant import MerchantRepository
from .merchant_routes import owner, store
from .rescue import local_now

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1/businesses", tags=["today"])

KIND = "today_cards"
REST_DAYS = 14
MAX_HIDDEN = 60
Frequency = Literal["daily", "important", "off"]
Reason = Literal["not_now", "not_useful"]
# A card id is the app's own (supply, reply, low-Milk, step-photo); its kind is the part before
# the first "-" (low-Milk → low), so "Not useful" rests every card of that kind.
# Anything but markup and control characters: product names come in every script.
CARD_ID = r"^[^<>\"\\\x00-\x1f]{1,80}$"


class Dismiss(BaseModel):
    card: str = Field(pattern=CARD_ID)
    reason: Reason


class CardFrequency(BaseModel):
    frequency: Frequency


class SupplierReply(BaseModel):
    order_id: str
    supplier: str
    text: str


class TodayCards(BaseModel):
    """What the owner chose about Today cards, as of now, plus supplier replies waiting."""

    frequency: Frequency = "daily"
    # Card ids hidden until the shop's next day ("Not now").
    hidden: list[str] = []
    # Card kinds resting for two weeks ("Not useful").
    resting: list[str] = []
    # Chat orders whose supplier replied and the owner has not read it yet.
    supplier_replies: list[SupplierReply] = []


def clock() -> float:
    """Now, in one place (tests move the shop's clock here)."""
    return time.time()


def kind_of(card: str) -> str:
    return card.split("-", 1)[0]


def _stored(repository: MerchantRepository, bid: str) -> dict[str, Any]:
    return repository.feature_docs.get(KIND, bid) or {}


def cards_for(
    repository: MerchantRepository, uid: str, bid: str, fields: dict[str, Any]
) -> TodayCards:
    """The owner's choice as of now (expired dismissals dropped), with supplier replies."""
    now = clock()
    data = _stored(repository, bid)
    hidden = [row for row in data.get("dismissed", []) if float(row.get("until", 0)) > now]
    try:
        replies = [
            SupplierReply(
                order_id=str(order["id"]),
                supplier=str(order["supplier"]["name"])[:80],
                text=next(
                    (
                        str(message.get("text", ""))[:200]
                        for message in reversed(order.get("messages", []))
                        if message.get("author") == "supplier"
                    ),
                    "",
                ),
            )
            for order in repository.supplier_orders(uid, bid)
            if order.get("unread") and order.get("status") not in {"replaced", "cancelled"}
        ][:3]
    except Exception:  # noqa: BLE001 - supplier replies are a bonus; Today still loads
        log.warning("today_supplier_replies_unavailable")
        replies = []
    return TodayCards(
        frequency=data.get("frequency", "daily"),
        hidden=sorted({row["card"] for row in hidden if row["reason"] == "not_now"}),
        resting=sorted({kind_of(row["card"]) for row in hidden if row["reason"] == "not_useful"}),
        supplier_replies=replies,
    )


def dismiss(
    repository: MerchantRepository, uid: str, bid: str, fields: dict[str, Any], body: Dismiss
) -> TodayCards:
    now = clock()
    if body.reason == "not_now":
        # Back on the shop's next day (its own time zone, not the phone's or the server's).
        local = local_now(fields, now)
        tomorrow = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        until = tomorrow.timestamp()
    else:
        until = now + REST_DAYS * 86_400
    data = _stored(repository, bid)
    kept = [
        row
        for row in data.get("dismissed", [])
        if float(row.get("until", 0)) > now and row.get("card") != body.card
    ]
    kept.append({"card": body.card, "reason": body.reason, "until": until, "at": now})
    data["dismissed"] = kept[-MAX_HIDDEN:]
    repository.feature_docs.put(KIND, bid, bid, now, data)
    # Counted by kind and reason (no shop data): which cards owners find useless.
    log.info("today_card_dismissed", kind=kind_of(body.card), reason=body.reason)
    return cards_for(repository, uid, bid, fields)


def set_frequency(
    repository: MerchantRepository, uid: str, bid: str, fields: dict[str, Any], frequency: str
) -> TodayCards:
    data = _stored(repository, bid)
    data["frequency"] = frequency
    repository.feature_docs.put(KIND, bid, bid, clock(), data)
    log.info("today_cards_frequency", frequency=frequency)
    return cards_for(repository, uid, bid, fields)


async def _owned(request: Request, business_id: str) -> tuple[str, MerchantRepository, dict]:
    uid = await owner(request)
    service = store(request)
    business = await anyio.to_thread.run_sync(service.owned_business, uid, business_id)
    return uid, service, dict(business.get("fields") or {})


@router.post("/{business_id}/today/cards/dismiss", response_model=TodayCards)
async def dismiss_card(business_id: str, body: Dismiss, request: Request) -> TodayCards:
    uid, service, fields = await _owned(request, business_id)
    await enforce_limits(request, [("owner:write", uid)])
    return await anyio.to_thread.run_sync(dismiss, service, uid, business_id, fields, body)


@router.post("/{business_id}/today/cards/frequency", response_model=TodayCards)
async def card_frequency(business_id: str, body: CardFrequency, request: Request) -> TodayCards:
    uid, service, fields = await _owned(request, business_id)
    await enforce_limits(request, [("owner:write", uid)])
    return await anyio.to_thread.run_sync(
        set_frequency, service, uid, business_id, fields, body.frequency
    )
