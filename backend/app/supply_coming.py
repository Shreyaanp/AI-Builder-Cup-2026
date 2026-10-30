"""What is already on its way, for a reorder (OB-226, #603).

A reorder counts the sent purchase orders and chat orders before it asks a supplier for more,
sizes the draft for what is still wanted, and keeps open drafts honest when an order lands
after they were made.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

from .merchant import MerchantRepository
from .supply_chain import (
    COVER_DAYS,
    _save,
    all_orders,
    need_from_forecast,
    recheck,
    relationship,
    rules_of,
)
from .supply_rules import item_rule, round_quantity

# Ordered but not here yet: a reorder counts it before asking for more (OB-226).
ON_ITS_WAY = {"sent", "changed", "confirmed", "dispatched"}
CHAT_ON_ITS_WAY = {"sent", "confirmed"}


def coming_orders(
    store: MerchantRepository, uid: str, bid: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Purchase orders and chat orders, read once so a page of needs does not re-read them."""
    from . import sourcing

    return all_orders(store, bid), sourcing.orders(store, uid, bid)


def on_order(
    store: MerchantRepository,
    uid: str,
    bid: str,
    item: str,
    unit: str,
    known: tuple[list[dict[str, Any]], list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    """What is already coming for this item, in the shop's unit: sent purchase orders and chat
    orders the supplier can fill, with the earliest arrival; and an open draft PO for it, if one
    waits. A chat order counts once it is sent or confirmed: lines the supplier does not have,
    and orders waiting on the owner's reply, are not on their way."""
    from . import sourcing

    def same(name: str) -> bool:
        return sourcing.matches(name, item) or sourcing.matches(item, name)

    pos, chats = known or coming_orders(store, uid, bid)
    quantity, arrives, draft = 0.0, "", None
    for po in pos:
        lines = [line for line in po["lines"] if same(line["item"])]
        if not lines and not same(str((po.get("reason") or {}).get("item", ""))):
            continue
        if po["status"] == "draft":
            draft = draft or po
            continue
        if po["status"] not in ON_ITS_WAY:
            continue
        for line in lines:
            amount = sourcing.convert(line["quantity"], line["unit"], unit)
            day = str(po.get("delivery") or "")
            if amount:
                quantity += amount
                arrives = min(arrives, day) if arrives and day else arrives or day
    for order in chats:
        if order["status"] not in CHAT_ON_ITS_WAY:
            continue
        for line in order["lines"]:
            if line["price"] is None or line.get("available") is False or not same(line["name"]):
                continue
            amount = sourcing.convert(line["quantity"], line["unit"], unit)
            if amount:
                quantity += amount
                day = str(order.get("delivery_at") or "")[:10]
                arrives = min(arrives, day) if arrives and day else arrives or day
    return {"quantity": round(quantity, 3), "arrives": arrives, "draft": draft}


def still_wanted(need: dict[str, Any], coming: float) -> float:
    """Demand until the delivery lands, plus a week of cover, minus what is on the shelf and
    what is already on its way."""
    return max(0.0, need["daily"] * (COVER_DAYS + 2) - need["stock"] - coming)


def covered(need: dict[str, Any], coming: float) -> bool:
    """What is on its way already meets this need: a reorder has nothing to add."""
    return bool(coming) and (not need["daily"] or not still_wanted(need, coming))


def resize(
    store: MerchantRepository, bid: str, po: dict[str, Any], item: str, unit: str, wanted: float
) -> None:
    """Set the draft's line for this item to the wanted quantity, rounded to the supplier's
    rules (MOQ, pack size) as a fresh draft would be."""
    from .sourcing import convert, matches

    line = next(
        (
            line
            for line in po["lines"]
            if matches(line["item"], item) or matches(item, line["item"])
        ),
        None,
    )
    if line is None:
        return
    row = relationship(store, bid, po["supplier"]["id"])
    rule = item_rule(rules_of(row), line["item"]) if row else None
    amount = convert(wanted, unit, line["unit"]) if wanted else 0.0
    if amount is None:
        return
    quantity = round_quantity(rule, amount) if rule else max(1.0, math.ceil(amount))
    line["quantity"] = quantity or (rule.moq if rule and rule.moq else 1.0)


def settle_drafts(
    store: MerchantRepository,
    uid: str,
    bid: str,
    inventory: list[dict[str, Any]],
    forecast: dict[str, Any],
    today: date,
    known: tuple[list[dict[str, Any]], list[dict[str, Any]]],
    skip: str,
) -> None:
    """Size again, or withdraw, the unsent drafts of the other items that run out. An order sent
    after a draft was made changes what it should ask for; one that covers the need leaves the
    draft over-ordering, and it must not stay approvable (#603). The owner's own quantity stays."""
    for product in inventory:
        if product["name"] == skip or product.get("stock") is None:
            continue
        need = need_from_forecast(product, forecast, product["name"], today)
        if not need["runs_out"]:
            continue
        unit = product.get("unit") or "kg"
        coming = on_order(store, uid, bid, product["name"], unit, known)
        draft = coming["draft"]
        reason = draft.setdefault("reason", {}) if draft else {}
        if (
            not draft
            or reason.get("owner_quantity")
            or reason.get("on_order") == coming["quantity"]
        ):
            continue
        if covered(need, coming["quantity"]):
            reason["withdrawn"] = "on_order"
            draft["status"] = "cancelled"
        else:
            wanted = still_wanted(need, coming["quantity"])
            resize(store, bid, draft, product["name"], unit, wanted)
            reason["wanted"] = round(wanted, 2)
            reason["on_order"] = coming["quantity"]
            recheck(store, bid, draft, today)
        _save(store, bid, draft)
