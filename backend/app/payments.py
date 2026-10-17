"""UPI handoffs only: no payment execution, customer contact or payment status."""

import re
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import anyio

from .coordinator import current


async def prepare_payment_link(amount: str, note: str = "") -> dict[str, Any]:
    """Prepare a UPI payment card for the owner to share. Amount is INR in major units,
    e.g. '240.50'. Never send it to a customer or claim payment was received.
    Use only the saved shop UPI ID; ask the owner to configure it if missing.
    """
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    context = await anyio.to_thread.run_sync(ctx.store.context, ctx.uid, ctx.business_id)
    fields = context["business"]["fields"]
    if fields.get("currency", "SGD") != "INR":
        return {"status": "inr_only"}
    if not fields.get("upi_id"):
        return {"status": "add_upi_id"}
    if len(amount) > 16:
        return {"status": "invalid"}
    try:
        value = Decimal(amount)
        valid = (
            bool(re.fullmatch(r"[0-9]+(?:\.[0-9]{1,2})?", amount))
            and value.is_finite()
            and Decimal("0") < value <= Decimal("10000000")
        )
    except InvalidOperation:
        valid = False
    if not valid or len(note) > 80 or any(ord(char) < 32 for char in note):
        return {
            "status": "invalid",
            "instruction": "Use a positive INR amount with up to two decimals and a short note.",
        }
    normalized = f"{value:.2f}"
    params = {
        "pa": fields["upi_id"],
        "pn": fields["name"],
        "am": normalized,
        "cu": "INR",
        "tn": note.strip(),
    }
    card = {
        "amount": normalized,
        "note": note.strip(),
        "payee": fields["name"],
        "upi_id": fields["upi_id"],
        "url": "upi://pay?" + urlencode(params),
    }
    card_id = str(uuid4())
    ctx.cards[card_id] = ("payment_link", card)
    return {
        "status": "prepared",
        "card_id": card_id,
        "payment": card,
        "instruction": "The owner can share the card. Nothing was sent or paid.",
    }
