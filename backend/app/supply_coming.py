"""What is already on its way, for a reorder (OB-226, #603).

A reorder counts the sent purchase orders and chat orders before it asks a supplier for more,
sizes the draft for what is still wanted, and keeps open drafts honest when an order lands
after they were made.
"""

from __future__ import annotations

import math
from collections.abc import Callable
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
    waive_guess,
)
from .supply_io import direction_of
from .supply_rules import item_rule, round_quantity

# Ordered but not here yet: a reorder counts it before asking for more (OB-226). An invoice can
# come before the goods, so "invoiced" counts until the order is received. The frontend's
# ON_THE_WAY (ioFormat.ts) is the same list; a pytest keeps the two equal.
ON_ITS_WAY = {"sent", "changed", "confirmed", "dispatched", "invoiced"}
CHAT_ON_ITS_WAY = {"sent", "confirmed"}
# A withdrawal that keeps losing to the owner's edits stops, and nothing is sent (OB-250).
WITHDRAW_TRIES = 3


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
    # Each delivery on its own day, so the run-out day counts it from then on (OB-263).
    arrivals: list[tuple[str, float]] = []
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
                arrivals.append((day, amount))
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
                arrivals.append((day, amount))
    return {
        "quantity": round(quantity, 3),
        "arrives": arrives,
        "draft": draft,
        "other": list(other.values()),
        "arrivals": sorted(arrivals),
    }


def _alike(name: str, item: str, shelf: set[str]) -> bool:
    """The same stock: not when the name is another thing the shop keeps (Milk, Rose milk)."""
    from . import sourcing

    if name.casefold() == item.casefold():
        return True
    if name.casefold() in shelf:
        return False
    return sourcing.matches(name, item) or sourcing.matches(item, name)


def retire_drafts(
    store: MerchantRepository, uid: str, bid: str, items: list[str], keep: str
) -> list[str]:
    """One live draft per item (persona runs, 8 Nov): a new draft replaces any other draft for the
    same stock, in both order systems, so the old amount can never be sent by mistake. An order
    with other items too only loses this one. Returns the chat orders replaced outright."""
    import time

    from . import sourcing

    names = [item for item in items if item.strip()]
    shelf = {p["name"].casefold() for p in store.inventory(uid, bid)} - {
        n.casefold() for n in names
    }

    def wanted(name: str) -> bool:
        return any(_alike(name, item, shelf) for item in names)

    retired: list[str] = []
    now = time.time()
    today: date | None = None
    for order in sourcing.orders(store, uid, bid, now):
        if order["id"] == keep or order["status"] != "draft":
            continue
        left = [line for line in order["lines"] if not wanted(line["name"])]
        if len(left) == len(order["lines"]):
            continue
        if left:
            order["lines"] = left
            order["total"] = sum(line["total"] or 0 for line in left)
        else:
            order["status"] = "replaced"
            order["replaced_by"] = keep
            retired.append(order["id"])
        sourcing.save(store, uid, bid, order, now)
    for po in all_orders(store, bid):
        if po["id"] == keep or po["status"] != "draft" or po.get("sent"):
            continue
        if direction_of(po) != "in":
            continue
        left = [line for line in po["lines"] if not wanted(line["item"])]
        if len(left) == len(po["lines"]):
            continue
        if not left:
            withdraw(store, bid, po, "replaced")
            continue
        # A draft with other items too (Order again: Sugar and Milk) keeps them; only the line
        # for this item goes.
        po["lines"] = left
        if today is None:
            from .supply_chain import _owned, shop_today

            today = shop_today(_owned(store, uid, bid))
        recheck(store, bid, po, today)
        try:
            _save(store, bid, po)
        except HTTPException as error:
            if error.status_code != 409:
                raise  # changed at the same moment: the owner's own edit stands
    return retired


def _last_order(
    item: str, unit: str, known: tuple[list[dict[str, Any]], list[dict[str, Any]]]
) -> tuple[float | None, str]:
    """How much of this item the shop last ordered, in its unit, and from which supplier."""
    from . import sourcing

    def same(name: str) -> bool:
        return sourcing.matches(name, item) or sourcing.matches(item, name)

    rows: list[tuple[float, float, str, str]] = []
    for po in known[0]:
        if po["status"] not in {"draft", "cancelled"}:
            rows += [
                (
                    float(po.get("created") or 0),
                    float(x["quantity"]),
                    x["unit"],
                    po["supplier"]["id"],
                )
                for x in po["lines"]
                if same(x["item"])
            ]
    for order in known[1]:
        if order["status"] in CHAT_ON_ITS_WAY | {"received"}:
            rows += [
                (float(order.get("created") or 0), float(x["quantity"]), x["unit"], "")
                for x in order["lines"]
                if same(x["name"])
            ]
    if not rows:
        return None, ""
    newest = max(rows)
    return sourcing.convert(newest[1], newest[2], unit), next(
        (row[3] for row in sorted(rows, reverse=True) if row[3]), ""
    )


def usual_supplier(
    item: str, unit: str, known: tuple[list[dict[str, Any]], list[dict[str, Any]]]
) -> str:
    """The supplier this item last came from, so "Order more" goes to the usual one."""
    return _last_order(item, unit, known)[1]


def amount_ask(
    product: dict[str, Any] | None,
    item: str,
    need: dict[str, Any],
    known: tuple[list[dict[str, Any]], list[dict[str, Any]]],
) -> dict[str, Any]:
    """ "How much?" for one item, with an amount to suggest: what was last ordered, else about a
    week and two days of its own use less the shelf, else nothing to go on."""
    unit = (product or {}).get("unit") or ""
    last, _ = _last_order(item, unit, known) if unit else (None, "")
    use = still_wanted(need, 0.0) if need.get("daily") else 0.0
    suggested = last if last else math.ceil(use) if use else None
    sold_out = bool(product) and (
        (product or {}).get("available") is False or (product or {}).get("stock") == 0
    )
    stock = (product or {}).get("stock")
    return {
        "status": "needs_quantity",
        "item": (product or {}).get("name") or item,
        "unit": unit,
        "left": 0 if sold_out else stock,
        "sold_out": sold_out,
        "suggested": round(suggested, 2) if suggested else None,
    }


def to_order(
    store: MerchantRepository,
    uid: str,
    bid: str,
    inventory: list[dict[str, Any]],
    forecast: dict[str, Any],
    today: date,
    category: str,
    known: tuple[list[dict[str, Any]], list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Stock the shop buys that is sold out or low (5 or fewer, the Today rule) with nothing on
    its way and no draft waiting: each gets "Order more", so "nothing to reorder" is never said
    beside a sold-out item (Ahmed, 8 Nov). Sold out comes first."""
    from . import sourcing
    from .supply_chain import bought

    rows = []
    for product in inventory:
        stock = product.get("stock")
        sold_out = product.get("available") is False or stock == 0
        if not bought(product, category) or not (sold_out or (stock is not None and stock <= 5)):
            continue
        coming = on_order(store, uid, bid, product["name"], product.get("unit") or "kg", known)
        drafted = any(
            order["status"] == "draft"
            and any(
                sourcing.matches(line["name"], product["name"])
                or sourcing.matches(product["name"], line["name"])
                for line in order["lines"]
            )
            for order in known[1]
        )
        if coming["quantity"] or coming["other"] or coming["draft"] or drafted:
            continue
        need = need_from_forecast(product, forecast, product["name"], today)
        rows.append(amount_ask(product, product["name"], need, known))
    rows.sort(key=lambda row: (not row["sold_out"], row["left"] or 0, row["item"]))
    return rows


def arrivals_by_item(
    store: MerchantRepository, uid: str, bid: str, inventory: list[dict[str, Any]]
) -> dict[str, list[tuple[str, float]]]:
    """What is on order for each stocked item, by arrival day: the brief and Today count it in
    the run-out day the supply tile shows (OB-263). Orders are read once."""
    known = coming_orders(store, uid, bid)
    if not known[0] and not known[1]:
        return {}
    found = {}
    for product in inventory:
        if product.get("stock") is None:
            continue
        coming = on_order(store, uid, bid, product["name"], product.get("unit") or "kg", known)
        if coming["arrivals"]:
            found[product["name"]] = coming["arrivals"]
    return found


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
    store: MerchantRepository,
    bid: str,
    po: dict[str, Any],
    item: str,
    unit: str,
    wanted: float,
    waived: bool = False,
) -> tuple[dict[str, Any], float | None] | None:
    """The draft's line for this item and the quantity the supplier's rules (MOQ, pack size) make
    of the wanted amount, as a fresh draft would be; None when the units do not convert.
    `waived`: the owner named the amount, so a minimum the app only guessed does not apply."""
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
    rules = rules_of(row) if row else None
    guessed = bool(row and row.get("suggested"))
    if rules and guessed and (waived or (po.get("reason") or {}).get("guess_waived")):
        rules = waive_guess(rules)
    rule = item_rule(rules, line["item"]) if rules else None
    amount = convert(wanted, unit, line["unit"]) if wanted else 0.0
    if amount is None:
        return line, None
    quantity = round_quantity(rule, amount) if rule else max(1.0, math.ceil(amount))
    return line, quantity or (rule.moq if rule and rule.moq else 1.0)


def resize(
    store: MerchantRepository,
    bid: str,
    po: dict[str, Any],
    item: str,
    unit: str,
    wanted: float,
    waived: bool = False,
) -> None:
    """Set the draft's line for this item to the wanted quantity, by the supplier's rules."""
    sized = sized_line(store, bid, po, item, unit, wanted, waived)
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
    return "too_big" if draft_amount(po, item, unit) > need["daily"] * CHECK_DAYS else ""


def draft_amount(po: dict[str, Any], item: str, unit: str) -> float:
    """How much of the item the order asks for, in the shop's unit; lines whose unit does not
    convert are left out."""
    from .sourcing import convert, matches

    amounts = [
        convert(line["quantity"], line["unit"], unit)
        for line in po["lines"]
        if matches(line["item"], item) or matches(item, line["item"])
    ]
    return sum(known for known in amounts if known is not None)


def withdraw(
    store: MerchantRepository,
    bid: str,
    po: dict[str, Any],
    why: str,
    still_wrong: Callable[[dict[str, Any]], str] | None = None,
) -> bool:
    """Cancel an unsent draft; True when it was. Losing a race with the owner's own change keeps
    the owner's: `po` becomes what is saved now, so the caller never drafts a second order beside
    it (OB-250). With `still_wrong`, only an edit that makes the size right keeps it (the owner
    set the amount); any other (Pay cash this time, a note) is withdrawn again at its new
    version. The next reorder, or the check on approving, sees what is left."""
    for _ in range(WITHDRAW_TRIES):
        changed = {
            **po,
            "status": "cancelled",
            "reason": {**(po.get("reason") or {}), "withdrawn": why},
        }
        try:
            po.update(_save(store, bid, changed))
            return True
        except HTTPException as error:
            if error.status_code != 409:
                raise
        _reload(store, bid, po)
        if po["status"] != "draft" or po.get("sent") or not still_wrong:
            return False
        why = still_wrong(po)
        if not why:
            return False
    return False


def _reload(store: MerchantRepository, bid: str, po: dict[str, Any]) -> None:
    """Replace `po` in place with the saved order (someone changed it meanwhile)."""
    from .supply_chain import ORDERS, _key

    saved = store.feature_docs.get(ORDERS, _key(bid, po["id"]))
    if saved:
        po.clear()
        po.update(saved)


def withdraw_wrong_sizes(
    store: MerchantRepository,
    bid: str,
    orders: list[dict[str, Any]],
    inventory: list[dict[str, Any]],
    forecast: dict[str, Any],
    today: date,
    skip: str = "",
) -> None:
    """Withdraw every open draft of a wrong size (wrong_size), except the item named `skip`.
    Only an owner action writes this: reading the orders flags them instead (flag_wrong_sizes)."""
    for po in orders:
        if str((po.get("reason") or {}).get("item") or "").casefold() == skip.casefold():
            continue
        why = wrong_size(po, inventory, forecast, today)
        if why:
            withdraw(store, bid, po, why)


def flag_wrong_sizes(
    store: MerchantRepository,
    bid: str,
    orders: list[dict[str, Any]],
    inventory: list[dict[str, Any]],
    forecast: dict[str, Any],
    today: date,
) -> list[dict[str, Any]]:
    """The orders as shown: an open draft of a wrong size carries a blocking "too_big" check, so
    Send is off, with the amount its real use calls for as the one-tap fix when there is one.
    Nothing is saved: opening Purchase orders never changes data (OB-250). The next reorder
    withdraws it, and approving refuses it until the owner sets the amount."""
    shown = []
    for po in orders:
        if not wrong_size(po, inventory, forecast, today):
            shown.append(po)
            continue
        item = str(po["reason"]["item"])
        product = next((p for p in inventory if p["name"].casefold() == item.casefold()), None)
        need = need_from_forecast(product, forecast, item, today)
        unit = (product or {}).get("unit") or po["reason"].get("unit") or "kg"
        wanted = still_wanted(need, 0.0) if need["daily"] else 0.0
        sized = sized_line(store, bid, po, item, unit, wanted) if wanted else None
        fits = sized and sized[1] is not None and sized[1] < float(sized[0]["quantity"])
        check = {
            "code": "too_big",
            "line": sized[0]["line"] if sized else None,
            "item": item,
            "values": {},
            "fix": (
                {"kind": "quantity", "line": sized[0]["line"], "value": sized[1]}
                if sized and fits
                else None
            ),
            "blocking": True,
        }
        shown.append({**po, "checks": [check, *po.get("checks", [])], "blocked": True})
    return shown


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
        try:
            draft.update(_save(store, bid, draft))
        except HTTPException as error:
            # The owner changed it meanwhile: theirs stays, sized as they left it (OB-250).
            if error.status_code != 409:
                raise
            _reload(store, bid, draft)
