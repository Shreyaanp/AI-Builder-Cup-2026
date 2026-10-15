"""Offline coach script for the supply chain: the tool calls Gemini makes, chosen by patterns.

Fixtures for tests and the offline demo, never evidence of how well the live model understands
owners.
"""

from __future__ import annotations

import re
from typing import Any

from google.genai import types

from .money import to_minor
from .sourcing import money_text

REORDER = re.compile(
    r"\b(?:re-?order|purchase order|draft (?:a |the )?(?:po|order)|what should i order|"
    r"plan (?:my|the) (?:order|purchase|reorder))\b",
    re.I,
)
REORDER_ITEM = re.compile(
    r"\bre-?order\s+(?:(\d+(?:\.\d+)?)\s*(kg|g|litres?|l|packs?|pieces?)?\s+(?:of\s+)?)?"
    r"([^\W\d_]+(?:\s[^\W\d_]+)?)",
    re.I,
)
RULE_WORDS = re.compile(
    r"\b(?:moq|minimum order|credit|approval|approve|auto-?send|lead time|price tier|"
    r"substitut\w*|back-?orders?|partial)\b",
    re.I,
)
RULES_QUESTION = re.compile(
    r"\b(?:supplier rules|my rules|what are the rules|show (?:the )?rules)\b", re.I
)
ORDER_QUESTION = re.compile(
    r"\b(?:where is my|did they confirm|has the invoice|invoice come|po status|"
    r"my purchase orders)\b",
    re.I,
)
SKIP = {"my", "the", "some", "more", "it", "please", "now", "stock"}


def call(name: str, args: dict[str, Any]) -> types.Part:
    return types.Part(function_call=types.FunctionCall(name=name, args=args))


def rule_args(text: str) -> dict[str, Any]:
    """'MOQ for flour is 10 kg, 30 days credit up to 20000, orders above 3000 need my OK'."""
    args: dict[str, Any] = {}
    lowered = text.casefold()
    item = re.search(r"\b(?:for|on)\s+([^\W\d_]+(?:\s[^\W\d_]+)?)", lowered)
    if item and item.group(1).split()[0] not in {"orders", "every", "all"}:
        args["item"] = " ".join(w for w in item.group(1).split() if w not in {"is", "to"})
    moq = re.search(r"(?:moq|minimum order)\D{0,20}(\d+(?:\.\d+)?)", lowered)
    if moq:
        args["moq"] = float(moq.group(1))
    lead = re.search(r"lead time\D{0,12}(\d+)", lowered)
    if lead:
        args["lead_days"] = int(lead.group(1))
    if re.search(r"\bcash\b", lowered):
        args["credit_days"] = 0
    days = re.search(r"\b(7|30)\s*-?\s*days?\b", lowered)
    if days:
        args["credit_days"] = int(days.group(1))
    limit = re.search(r"credit (?:limit|up to)\D{0,8}(\d[\d,]*)", lowered)
    if limit:
        args["credit_limit"] = float(limit.group(1).replace(",", ""))
    approval = re.search(r"(?:above|over)\s*\D{0,4}(\d[\d,]*)", lowered)
    if approval and re.search(r"approv|my ok|need me", lowered):
        args["approval_over"] = float(approval.group(1).replace(",", ""))
    if re.search(r"auto-?send", lowered):
        args["auto_send"] = not re.search(r"\b(?:no|don't|do not|stop|off)\b", lowered)
    tier = re.search(r"(\d+(?:\.\d+)?)\s*\w*\s*or more at\s*\D{0,3}(\d+(?:\.\d+)?)", lowered)
    if tier:
        args["tier_quantity"], args["tier_price"] = float(tier.group(1)), float(tier.group(2))
    sub = re.search(r"substitut\w*\s*(?:is|are|with|:)?\s*([^.;]+)", text, re.I)
    if sub and not re.search(r"\bno substitut", lowered):
        args["substitutes"] = [s.strip() for s in re.split(r",|\bor\b", sub.group(1)) if s.strip()]
    if re.search(r"\bpartial", lowered):
        args["partial_ok"] = not re.search(r"\bno partial|don't accept partial|not accept", lowered)
    if re.search(r"back-?order", lowered):
        args["backorder_ok"] = not re.search(r"\bno back-?order|don't|not accept", lowered)
    return args


def supply_call(question: str, ctx: Any) -> types.Part | None:
    text = question.strip()
    if ORDER_QUESTION.search(text):
        return call("get_purchase_orders", {})
    if RULES_QUESTION.search(text) and not RULE_WORDS.search(text.replace("rules", "")):
        return call("get_supplier_rules", {})
    if RULE_WORDS.search(text) and re.search(
        r"\b(?:set|make|change|is|are|allow|accept|need|needs|give|days?|up to|at)\b", text, re.I
    ):
        args: dict[str, Any] = rule_args(text)
        if args:
            supplier = supplier_named(text, ctx)
            return call("set_supplier_rules", {"supplier": supplier, **args})
    if REORDER.search(text):
        args = {}
        found = REORDER_ITEM.search(text)
        if found:
            name = " ".join(w for w in found.group(3).split() if w.casefold() not in SKIP)
            if name and name.casefold() not in {"for", "from"}:
                args["item"] = name
            if found.group(1):
                args["quantity"] = float(found.group(1))
        return call("draft_reorder", args)
    return None


def supplier_named(text: str, ctx: Any) -> str:
    from . import supply_chain

    try:
        rows = supply_chain.relationships(ctx.store, ctx.uid, ctx.business_id)
    except Exception:
        return ""
    lowered = text.casefold()
    for row in rows:
        first = row["supplier"]["name"].casefold().split()[0]
        if first in lowered or row["supplier"]["name"].casefold() in lowered:
            return str(row["supplier"]["name"])
    # The supplier of the latest order, else the first relationship.
    try:
        latest = supply_chain.orders(ctx.store, ctx.uid, ctx.business_id)
    except Exception:
        latest = []
    if latest:
        return str(latest[0]["supplier"]["name"])
    return str(rows[0]["supplier"]["name"]) if rows else ""


def supply_reply(name: str, result: dict[str, Any]) -> str | None:
    if name == "draft_reorder":
        if result.get("status") not in {"needs_owner_tap", "sent_automatically"}:
            return "Offline coach: tell me which item to reorder and I'll draft the order."
        currency = result.get("currency", "SGD")
        line = result["lines"][0]
        reason = result.get("reason") or {}
        total = money_text(to_minor(result["total"] or 0, currency), currency)
        why = (
            f" You have {reason['stock']:g} {reason['unit']} and run out {reason['runs_out']}."
            if reason.get("runs_out")
            else ""
        )
        demo = " This is a simulated demo supplier." if result.get("demo_supplier") else ""
        broken = " Some rules need a fix first; see the card." if result.get("broken_rules") else ""
        tail = (
            " It went out automatically under your approval limit."
            if result["status"] == "sent_automatically"
            else " Tap Approve to send it."
        )
        return (
            f"Offline coach: I've drafted PO {result['po_number']}: {line['quantity']:g} "
            f"{line['unit']} {line['item']} from {result['supplier']}, {total}, deliver "
            f"{result['deliver_on']}.{why}{demo}{broken}{tail}"
        )
    if name == "set_supplier_rules":
        if result.get("status") != "needs_owner_tap":
            return "Offline coach: which supplier and which rule should I change?"
        return (
            f"Offline coach: I've prepared the rule change for {result['supplier']}. "
            "Confirm it on the card."
        )
    if name == "get_supplier_rules":
        rows = result.get("suppliers") or []
        if not rows:
            return "Offline coach: no supplier is set up yet. Say “reorder” and I'll find one."
        row = rows[0]
        terms = "cash" if row["credit_days"] == 0 else f"{row['credit_days']} days credit"
        return (
            f"Offline coach: {row['supplier']}: {terms}, orders above {row['approval_over']:g} "
            f"need your OK. {len(row['items'])} item rules."
        )
    if name == "get_purchase_orders":
        rows = result.get("orders") or []
        if not rows:
            return "Offline coach: no purchase orders yet."
        latest = rows[0]
        return (
            f"Offline coach: PO {latest['po_number']} to {latest['supplier']} is "
            f"{latest['status']}; documents so far: {', '.join(latest['documents']) or 'none'}."
        )
    return None
