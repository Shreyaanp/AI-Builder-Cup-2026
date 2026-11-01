"""What is already on its way, for a reorder (OB-226, #603).

A reorder counts the sent purchase orders and chat orders before it asks a supplier for more,
sizes the draft for what is still wanted, and keeps open drafts honest when an order lands
after they were made.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

from fastapi import HTTPException

from .merchant import MerchantRepository
from .supply_chain import (
    CHECK_DAYS,
    COVER_DAYS,
    _save,
    all_orders,
    need_from_forecast,
    recheck,
    relationship,
    rules_of,
)
from .supply_io import direction_of
from .supply_rules import item_rule, round_quantity

# Ordered but not here yet: a reorder counts it before asking for more (OB-226). An invoice can
# come before the goods, so "invoiced" counts until the order is received. The frontend's
# ON_THE_WAY (ioFormat.ts) is the same list; a pytest keeps the two equal.
ON_ITS_WAY = {"sent", "changed", "confirmed", "dispatched", "invoiced"}
CHAT_ON_ITS_WAY = {"sent", "confirmed"}


def earliest(one: str, other: str) -> str:
    """The sooner of two ISO days; an unknown one does not count."""
    return min(one, other) if one and other else one or other


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
    # Lines in a unit that does not convert (2 pack against a shop counting litres) are still
    # on their way: they are kept apart, never counted as nothing (#603).
    other: dict[str, dict[str, Any]] = {}

    def elsewhere(amount: float, line_unit: str, day: str) -> None:
        row = other.setdefault(line_unit, {"quantity": 0.0, "unit": line_unit, "arrives": ""})
        row["quantity"] = round(row["quantity"] + float(amount), 3)
        row["arrives"] = earliest(row["arrives"], day)

    for po in pos:
        if direction_of(po) != "in":
            continue  # a buyer's order the shop must ship is stock going out, not coming
        if po.get("received"):
            continue  # the goods are on the shelf: stock, not on order, whatever the status
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
            if amount is None:
                elsewhere(line["quantity"], line["unit"], day)
            elif amount:
                quantity += amount
                arrives = earliest(arrives, day)
    for order in chats:
        if order["status"] not in CHAT_ON_ITS_WAY:
            continue
        for line in order["lines"]:
            if line["price"] is None or line.get("available") is False or not same(line["name"]):
                continue
            amount = sourcing.convert(line["quantity"], line["unit"], unit)
            day = str(order.get("delivery_at") or "")[:10]
            if amount is None:
                elsewhere(line["quantity"], line["unit"], day)
            elif amount:
                quantity += amount
                arrives = earliest(arrives, day)
    return {
        "quantity": round(quantity, 3),
        "arrives": arrives,
        "draft": draft,
        "other": list(other.values()),
    }


def still_wanted(need: dict[str, Any], coming: float) -> float:
    """Demand until the delivery lands, plus a week of cover, minus what is on the shelf and
    what is already on its way."""
    return max(0.0, need["daily"] * (COVER_DAYS + 2) - need["stock"] - coming)


def covered(need: dict[str, Any], coming: float) -> bool:
    """What is on its way already meets this need: a reorder has nothing to add."""
    return bool(coming) and (not need["daily"] or not still_wanted(need, coming))


def cover(need: dict[str, Any], coming: dict[str, Any]) -> str:
    """How far what is on its way meets this need: "full" (nothing to add), "units" (some is
    on order in a unit that does not convert, so ask before ordering more), "partly" (some, but
    not enough) or "none". Today, Grow and a reorder all read this one answer (#603)."""
    if covered(need, coming["quantity"]):
        return "full"
    if coming.get("other"):
        return "units"
    return "partly" if coming["quantity"] else "none"


def cannot_meet(named: float, amount: float | None) -> bool:
    """The supplier's amount is not what the owner named: its minimum or packs are far off, or
    its unit does not convert. Rounding up to a nearby pack is still what they asked for."""
    return amount is None or amount > max(named * 1.25, named + 1) or amount < named * 0.8


def sized_line(
    store: MerchantRepository, bid: str, po: dict[str, Any], item: str, unit: str, wanted: float
) -> tuple[dict[str, Any], float | None] | None:
    """The draft's line for this item and the quantity the supplier's rules (MOQ, pack size) make
    of the wanted amount, as a fresh draft would be; None when the units do not convert."""
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
        return None
    row = relationship(store, bid, po["supplier"]["id"])
    rule = item_rule(rules_of(row), line["item"]) if row else None
    amount = convert(wanted, unit, line["unit"]) if wanted else 0.0
    if amount is None:
        return line, None
    quantity = round_quantity(rule, amount) if rule else max(1.0, math.ceil(amount))
    return line, quantity or (rule.moq if rule and rule.moq else 1.0)


def resize(
    store: MerchantRepository, bid: str, po: dict[str, Any], item: str, unit: str, wanted: float
) -> None:
    """Set the draft's line for this item to the wanted quantity, by the supplier's rules."""
    sized = sized_line(store, bid, po, item, unit, wanted)
    if sized and sized[1] is not None:
        sized[0]["quantity"] = sized[1]


def wrong_size(
    po: dict[str, Any],
    inventory: list[dict[str, Any]],
    forecast: dict[str, Any],
    today: date,
) -> str:
    """Why an open draft must not go out: "no_use" when its item has no use of its own on record,
    "too_big" when it is more than a month of that use, else "". The owner's own quantity is
    always fine, and an amount in a unit that does not convert cannot be judged (OB-242)."""
    from .sourcing import convert, matches

    reason = po.get("reason") or {}
    item = str(reason.get("item") or "")
    if (
        po["status"] != "draft"
        or direction_of(po) != "in"
        or not item
        or reason.get("owner_quantity")
    ):
        return ""
    product = next((p for p in inventory if p["name"].casefold() == item.casefold()), None)
    need = need_from_forecast(product, forecast, item, today)
    if not need["daily"]:
        return "no_use"
    unit = (product or {}).get("unit") or reason.get("unit") or "kg"
    amounts = [
        convert(line["quantity"], line["unit"], unit)
        for line in po["lines"]
        if matches(line["item"], item) or matches(item, line["item"])
    ]
    amount = sum(known for known in amounts if known is not None)
    return "too_big" if amount > need["daily"] * CHECK_DAYS else ""


def withdraw(store: MerchantRepository, bid: str, po: dict[str, Any], why: str) -> None:
    """Cancel an unsent draft. Losing a race with the owner's own change leaves it as it is: the
    next reorder, or the check on approving, sees it again."""
    changed = {
        **po,
        "status": "cancelled",
        "reason": {**(po.get("reason") or {}), "withdrawn": why},
    }
    try:
        po.update(_save(store, bid, changed))
    except HTTPException as error:
        if error.status_code != 409:
            raise


def withdraw_wrong_sizes(
    store: MerchantRepository,
    bid: str,
    orders: list[dict[str, Any]],
    inventory: list[dict[str, Any]],
    forecast: dict[str, Any],
    today: date,
    skip: str = "",
) -> None:
    """Withdraw every open draft of a wrong size (wrong_size), except the item named `skip`."""
    for po in orders:
        if str((po.get("reason") or {}).get("item") or "").casefold() == skip.casefold():
            continue
        why = wrong_size(po, inventory, forecast, today)
        if why:
            withdraw(store, bid, po, why)


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
    draft over-ordering, and it must not stay approvable (#603). A draft of a wrong size is
    withdrawn, whatever else runs out (OB-242). The owner's own quantity stays."""
    withdraw_wrong_sizes(store, bid, known[0], inventory, forecast, today, skip)
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
