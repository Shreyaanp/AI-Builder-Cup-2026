"""Offline coach script for sourcing: the same tool calls Gemini makes, chosen by patterns.

Lets the whole Forecast → Source → Sell story run (and be tested) without a model. These are
fixtures, never evidence of how well the live model understands owners.
"""

from __future__ import annotations

import re
from typing import Any

from google.genai import types

from .money import to_minor
from .sourcing import money_text, unit_of

QUANTITY = re.compile(
    r"(\d+(?:\.\d+)?)\s*(kgs?|kilos?|g|gm|grams?|litres?|liters?|l|ml|packs?|packets?|"
    r"dozens?|boxes|box|bottles?)?\s+(?:of\s+)?([^\W\d_]+(?:\s(?!and\b|from\b|by\b|for\b|to\b)"
    r"[^\W\d_]+)?)",
    re.I,
)
LOW = re.compile(
    r"\b(?:running low|low on|out of|run out of|need(?: more)?|restock|find suppliers? for|"
    r"suppliers? for|buy)\s*:?\s*(?:some\s+)?(?:(\d+(?:\.\d+)?)\s*([a-z]+)\s+(?:of\s+)?)?"
    r"([^\W\d_]+(?:\s[^\W\d_]+)?)",
    re.I,
)
LOW_AFTER = re.compile(
    r"(?:my|our|the)?\s*([^\W\d_]+)\s+(?:is|are)\s+(?:running\s+)?(?:low|out|finished|over)",
    re.I,
)
ORDINAL = {
    "first": 1,
    "1st": 1,
    "second": 2,
    "2nd": 2,
    "third": 3,
    "3rd": 3,
    "fourth": 4,
    "4th": 4,
    "one": 1,
    "two": 2,
    "three": 3,
}
FILLER = {"by", "tomorrow", "today", "please", "now", "from", "them", "it"}


def last_response(contents: list[types.Content], name: str) -> dict[str, Any] | None:
    for content in reversed(contents):
        for part in content.parts or []:
            response = part.function_response
            if response and response.name == name:
                return dict(response.response or {})
    return None


def items_in(text: str) -> list[dict[str, Any]]:
    found = []
    for quantity, unit, name in QUANTITY.findall(text):
        name = " ".join(word for word in name.split() if word.casefold() not in FILLER)
        if not name:
            continue
        found.append({"name": name, "quantity": float(quantity), "unit": unit_of(unit)})
    return found


def pick_supplier(text: str, found: dict[str, Any]) -> str | None:
    suppliers = found.get("suppliers") or []
    if not suppliers:
        return None
    lowered = text.casefold()
    if "cheap" in lowered:
        return str(found.get("cheapest_id"))
    if "near" in lowered or "closest" in lowered:
        return str(found.get("nearest_id"))
    for word, rank in ORDINAL.items():
        if re.search(rf"\b{word}\b", lowered) and rank <= len(suppliers):
            return str(suppliers[rank - 1]["id"])
    number = re.search(r"\b(?:number|no\.?|#)\s*(\d)\b", lowered)
    if number and 0 < int(number.group(1)) <= len(suppliers):
        return str(suppliers[int(number.group(1)) - 1]["id"])
    return str(suppliers[0]["id"])


def latest_order(ctx: Any, *, draft: bool | None = None) -> dict[str, Any] | None:
    from . import sourcing

    for order in sourcing.orders(ctx.store, ctx.uid, ctx.business_id):
        if order["status"] in {"replaced", "cancelled"}:
            continue
        if draft is None or (order["status"] == "draft") == draft:
            return order
    return None


def call(name: str, args: dict[str, Any]) -> types.Part:
    return types.Part(function_call=types.FunctionCall(name=name, args=args))


def sourcing_call(question: str, contents: list[types.Content], ctx: Any) -> types.Part | None:
    """The tool call for an owner's sourcing message, or None when it is about something else."""
    text = question.strip()
    lowered = text.casefold()
    if re.search(r"\bcancel\b", lowered):
        order = latest_order(ctx)
        return call("cancel_order", {"order_id": order["id"]}) if order else None
    if re.search(r"\b(ask them|ask if|tell them|can you deliver|deliver by|on sunday)\b", lowered):
        order = latest_order(ctx, draft=False)
        if order:
            message = re.sub(
                r"^(please\s+)?(ask them|tell them)\s*(if|whether|to)?\s*", "", text, flags=re.I
            )
            message = message[:1].upper() + message[1:]
            if re.match(r"(?i)they\b", message):
                message = "Do you" + message[4:]
            return call(
                "message_supplier", {"order_id": order["id"], "text": message.rstrip("?") + "?"}
            )
    change = re.search(r"\bchange\b.*?\bto\s+(\d+(?:\.\d+)?)", lowered)
    if change:
        draft = latest_order(ctx, draft=True)
        if draft:
            lines = [
                {"name": line["name"], "quantity": line["quantity"], "unit": line["unit"]}
                for line in draft["lines"]
            ]
            lines[0]["quantity"] = float(change.group(1))
            return call(
                "prepare_order",
                {
                    "supplier_id": draft["supplier"]["id"],
                    "items": lines,
                    "replaces_order_id": draft["id"],
                },
            )
    if re.search(r"\bsame as last time\b", lowered):
        previous = latest_order(ctx, draft=False)
        if previous:
            return call(
                "prepare_order",
                {
                    "supplier_id": previous["supplier"]["id"],
                    "items": [
                        {"name": line["name"], "quantity": line["quantity"], "unit": line["unit"]}
                        for line in previous["lines"]
                    ],
                },
            )
    found = last_response(contents, "find_suppliers")
    if re.search(r"\b(order|looks good|go with|take)\b", lowered) and found:
        supplier = pick_supplier(text, found)
        items = items_in(text) or (
            [
                {
                    "name": found.get("item", ""),
                    "quantity": found.get("quantity") or 1,
                    "unit": found.get("unit") or "",
                }
            ]
            if found.get("item")
            else []
        )
        if supplier and items:
            return call("prepare_order", {"supplier_id": supplier, "items": items})
    low = LOW.search(text)
    after = LOW_AFTER.search(text)
    if low or after:
        item = low.group(3) if low else after.group(1) if after else ""
        item = " ".join(w for w in item.split() if w.casefold() not in FILLER) or item
        args: dict[str, Any] = {"item": item}
        if low and low.group(1):
            args["quantity"] = float(low.group(1))
            args["unit"] = unit_of(low.group(2))
        return call("find_suppliers", args)
    return None


def sourcing_reply(name: str, result: dict[str, Any]) -> str | None:
    if name == "find_suppliers":
        suppliers = result.get("suppliers") or []
        if not suppliers:
            return "Offline coach: I couldn't find a supplier near you for that item."
        currency = result.get("currency", "SGD")
        best = suppliers[0]
        price = money_text(to_minor(best["item"]["price"], currency), currency)
        demo = (
            " These are demo suppliers I created near your shop, not real businesses."
            if result.get("generated_demo_suppliers") or best.get("demo")
            else ""
        )
        return (
            f"Offline coach: I found {len(suppliers)} suppliers near you. Number 1 is "
            f"{best['name']}, {best['distance_km']:g} km away, {best['item']['name']} at "
            f"{price} per {best['item']['unit']}.{demo} Which one should I order from?"
        )
    if name == "prepare_order":
        if result.get("status") != "needs_owner_tap":
            return "Offline coach: I need the supplier and the quantities to prepare an order."
        currency = result.get("currency", "SGD")
        lines = ", ".join(
            f"{line['quantity']:g} {line['unit']} {line['item']}" for line in result["lines"]
        )
        total = money_text(to_minor(result["estimated_total"], currency), currency)
        return (
            f"Offline coach: I've prepared an order request to {result['supplier']}: {lines}, "
            f"about {total}, delivery {result['delivery']}. Tap Send to confirm it."
        )
    if name == "message_supplier":
        return "Offline coach: I've written the message. Tap Send to deliver it."
    if name == "cancel_order":
        if result.get("status") == "dropped":
            return "Offline coach: I've discarded the draft. Nothing was sent."
        return "Offline coach: I've prepared the cancellation. Tap Send to tell the supplier."
    return None
