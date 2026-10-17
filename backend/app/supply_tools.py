"""Coach tools for the supply chain: supplier rules and forecast-drafted purchase orders.

Like every coach tool they only read and prepare: a rule change and a purchase order each wait
for the owner's tap on their card (supply_chain.py does the work).
"""

from collections.abc import Callable
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError

from . import coordinator
from .coordinator import DEMO_OWNER_UID, MerchantContext, _card, _generator, _invalid, current


def _supplier_row(ctx: MerchantContext, supplier: str) -> dict[str, Any] | None:
    """A relationship by id, by name ("Shree Ganesh"), or the only one there is."""
    from . import supply_chain

    rows = supply_chain.relationships(ctx.store, ctx.uid, ctx.business_id or "")
    wanted = (supplier or "").strip().casefold()
    if not wanted and len(rows) == 1:
        return rows[0]
    for row in rows:
        if row["supplier"]["id"] == supplier or (
            wanted and wanted in row["supplier"]["name"].casefold()
        ):
            return row
    return None


def get_supplier_rules(supplier: str = "") -> dict[str, Any]:
    """The business rules agreed with each supplier: credit terms (cash, 7 or 30 days) and
    credit limit, the approval limit, auto-send, the supplier's system format, and per item the
    MOQ, pack size, lead time, price tiers, allowed substitutes, partial deliveries and
    back-orders. supplier: a name or id to see one supplier; empty for all."""
    from . import supply_chain

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    if supplier:
        row = _supplier_row(ctx, supplier)
        if not row:
            return {"status": "unknown_supplier", "instruction": "Ask which supplier they mean."}
        return {"suppliers": [supply_chain.rules_summary(row)]}
    rows = supply_chain.relationships(ctx.store, ctx.uid, ctx.business_id)
    if not rows:
        return {
            "status": "no_suppliers",
            "instruction": "No supplier is set up yet. Offer to draft a reorder (draft_reorder), "
            "which finds suppliers and sets up starting rules the owner can change.",
        }
    return {"suppliers": [supply_chain.rules_summary(row) for row in rows]}


def set_supplier_rules(
    supplier: str,
    credit_days: int | None = None,
    credit_limit: float | None = None,
    approval_over: float | None = None,
    auto_send: bool | None = None,
    system_format: str = "",
    item: str = "",
    moq: float | None = None,
    pack: float | None = None,
    lead_days: int | None = None,
    tier_quantity: float | None = None,
    tier_price: float | None = None,
    substitutes: list[str] | None = None,
    partial_ok: bool | None = None,
    backorder_ok: bool | None = None,
) -> dict[str, Any]:
    """Prepare a change to the rules with one supplier, for the owner to confirm with a tap.
    Pass only what the owner said. supplier: name or id from get_supplier_rules. credit_days: 0
    (cash), 7 or 30. credit_limit and approval_over: amounts in the shop currency ("orders
    above 2000 need my OK"). auto_send: send orders under the approval limit by themselves.
    Item rules need item: moq (minimum order quantity), pack (sold in multiples of), lead_days,
    a price tier (tier_quantity + tier_price per unit: "50 kg or more at 58"), substitutes
    (allowed replacements), partial_ok (accept part deliveries), backorder_ok (accept the rest
    later). system_format: idoc (SAP), csv, text or json."""
    from . import supply_chain
    from .supply_rules import RuleChange

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    row = _supplier_row(ctx, supplier)
    if not row:
        return {
            "status": "unknown_supplier",
            "instruction": "Call get_supplier_rules and ask which supplier they mean.",
        }
    values = {
        "terms_days": credit_days,
        "credit_limit": credit_limit,
        "approval_over": approval_over,
        "auto_send": auto_send,
        "system_format": system_format or None,
        "item": item,
        "moq": moq,
        "pack": pack,
        "lead_days": lead_days,
        "tier_quantity": tier_quantity,
        "tier_price": tier_price,
        "substitutes": substitutes,
        "partial_ok": partial_ok,
        "backorder_ok": backorder_ok,
    }
    try:
        change = RuleChange.model_validate({k: v for k, v in values.items() if v is not None})
        saved = supply_chain.propose_rules(
            ctx.store, ctx.uid, ctx.business_id, row["supplier"]["id"], change
        )
    except (ValidationError, ValueError) as error:
        return _invalid(error, ctx)
    return {
        "status": "needs_owner_tap",
        "card_id": _card(ctx, "supply_rules", saved),
        "supplier": row["supplier"]["name"],
        "change": change.model_dump(exclude_none=True, exclude_defaults=True),
        "instruction": "Say what will change in one line and ask them to confirm on the card.",
    }


async def draft_reorder(item: str = "", quantity: float | None = None) -> dict[str, Any]:
    """Draft a purchase order from the forecast, stock and the supplier rules: how much to
    order (covering demand until delivery plus a week, rounded to the MOQ and packs), from the
    best supplier (price tier, arrives before the shop runs out, credit left). Use it for
    "reorder flour", "what should I order?", "plan my purchase order" or when a forecast shows
    an item running out. item: only if the owner named one (else the item that runs out
    first); quantity only if they said it. Nothing is sent: the owner approves the card.
    Explain the choice in one line from reason (stock, runs_out, supplier, price tier, arrival,
    credit) and name any broken rule. If the supplier is demo, say it is a simulated supplier."""
    from . import supply_chain
    from .forecast import ForecastService

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    service = coordinator.forecaster
    if service is None:
        from .settings import Settings

        service = ForecastService(Settings(_env_file=None))  # type: ignore[call-arg]
    try:
        result = await supply_chain.draft_reorder(
            ctx.store,
            ctx.uid,
            ctx.business_id,
            (item or "").strip()[:80],
            quantity if quantity and quantity > 0 else None,
            service,
            _generator(),
            DEMO_OWNER_UID,
        )
    except HTTPException as error:
        return _invalid(error, ctx)
    if result["status"] == "needs_item":
        return {
            "status": "needs_item",
            "instruction": "No stocked item is forecast to run out. Ask which item to reorder.",
        }
    if result["status"] == "no_supplier":
        return {
            "status": "no_supplier",
            "instruction": "Say no supplier near them stocks this item; ask for another name.",
        }
    order = result["order"]
    return {
        **supply_chain.summary(order),
        "card_id": _card(ctx, "purchase_order", order),
        "status": "sent_automatically" if order.get("auto_sent") else "needs_owner_tap",
    }


def get_purchase_orders() -> dict[str, Any]:
    """The shop's purchase orders, newest first, with their documents so far (ORDERS sent,
    ORDRSP confirmation, DESADV dispatch, INVOIC invoice), status, back-orders and fields
    waiting for the owner's check (open_flags). Use it for "where is my flour order?", "did
    they confirm?" or "has the invoice come?"."""
    from . import supply_chain

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    found = supply_chain.orders(ctx.store, ctx.uid, ctx.business_id)
    return {"orders": [supply_chain.summary(po) for po in found[:8]]}


SUPPLY_TOOLS: list[Callable[..., Any]] = [
    get_supplier_rules,
    set_supplier_rules,
    draft_reorder,
    get_purchase_orders,
]
SUPPLY_CARD_TOOLS = {"set_supplier_rules", "draft_reorder"}
