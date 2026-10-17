"""Payment handoffs only: no payment execution, customer contact or payment status.

The shop's region picks the rail (region.py): UPI links in India, PayNow QR codes (SGQR, the
EMVCo merchant-presented format every Singapore bank app scans) in Singapore. Elsewhere the
coach says there is no payment link for the shop's country.
"""

import re
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import anyio

from .coordinator import current
from .region import shop_currency, shop_region

RAILS = {"upi": ("INR", "upi_id", "add_upi_id"), "paynow": ("SGD", "paynow_id", "add_paynow_id")}


def _tlv(tag: str, value: str) -> str:
    return f"{tag}{len(value):02d}{value}"


def _crc16(data: str) -> str:
    """CRC-16/CCITT-FALSE, as EMVCo QR codes end with."""
    crc = 0xFFFF
    for byte in data.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else crc << 1
            crc &= 0xFFFF
    return f"{crc:04X}"


def _plain(text: str, limit: int) -> str:
    """SGQR text fields are ASCII; anything else is left out rather than garbled."""
    return re.sub(r"[^ -~]", "", text).strip()[:limit] or "-"


def paynow_payload(proxy: str, payee: str, amount: str, note: str = "") -> str:
    """The SGQR / PayNow payload for a fixed amount to a +65 mobile number or a UEN."""
    mobile = proxy.startswith("+65")
    account = (
        _tlv("00", "SG.PAYNOW")
        + _tlv("01", "0" if mobile else "2")
        + _tlv("02", proxy)
        + _tlv("03", "0")  # the amount cannot be edited by the payer
    )
    body = (
        _tlv("00", "01")
        + _tlv("01", "12")  # dynamic: one amount
        + _tlv("26", account)
        + _tlv("52", "0000")
        + _tlv("53", "702")  # SGD
        + _tlv("54", amount)
        + _tlv("58", "SG")
        + _tlv("59", _plain(payee, 25))
        + _tlv("60", "Singapore")
        + (_tlv("62", _tlv("01", _plain(note, 25))) if note.strip() else "")
        + "6304"
    )
    return body + _crc16(body)


def upi_url(upi_id: str, payee: str, amount: str, note: str) -> str:
    params = {"pa": upi_id, "pn": payee, "am": amount, "cu": "INR", "tn": note}
    return "upi://pay?" + urlencode(params)


async def prepare_payment_link(amount: str, note: str = "") -> dict[str, Any]:
    """Prepare a payment card (UPI in India, PayNow QR in Singapore) for the owner to share.
    Amount is in the shop's currency, major units, e.g. '240.50'. Never send it to a customer
    or claim payment was received. Use only the saved shop UPI ID / PayNow ID; ask the owner to
    configure it if missing.
    """
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    context = await anyio.to_thread.run_sync(ctx.store.context, ctx.uid, ctx.business_id)
    fields = context["business"]["fields"]
    rail = shop_region(fields).payment_rail
    currency, id_key, missing = RAILS.get(rail, ("", "", ""))
    if not rail or shop_currency(fields) != currency:
        return {"status": "no_payment_link"}
    if not fields.get(id_key):
        return {"status": missing}
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
            "instruction": f"Use a positive {currency} amount with up to two decimals and a "
            "short note.",
        }
    normalized = f"{value:.2f}"
    payee, text = fields["name"], note.strip()
    card: dict[str, Any] = {
        "rail": rail,
        "currency": currency,
        "amount": normalized,
        "note": text,
        "payee": payee,
    }
    if rail == "upi":
        card |= {
            "upi_id": fields["upi_id"],
            "url": upi_url(fields["upi_id"], payee, normalized, text),
        }
    else:
        card |= {
            "paynow_id": fields["paynow_id"],
            "payload": paynow_payload(fields["paynow_id"], payee, normalized, text),
        }
    card_id = str(uuid4())
    ctx.cards[card_id] = ("payment_link", card)
    return {
        "status": "prepared",
        "card_id": card_id,
        "payment": card,
        "instruction": "The owner can share the card. Nothing was sent or paid.",
    }
