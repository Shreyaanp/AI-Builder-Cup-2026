"""Offline answers for the public /demo coach, read from the seeded demo shop (no model calls)."""

from __future__ import annotations

from typing import Any


def public_demo_reply(ctx: Any, question: str) -> str | None:
    """Answer public demo questions from seeded records, without tools or providers."""
    if not ctx.business_id or not ctx.uid.startswith("public-demo-"):
        return None
    import re

    from . import supply_chain
    from .forecast import weekday_average
    from .sales import today_for

    store, uid, bid = ctx.store, ctx.uid, ctx.business_id
    business = store.context(uid, bid)["business"]
    if not business or not business["fields"].get("demo"):
        return None
    fields = business["fields"]
    inventory = store.inventory(uid, bid)
    history = store.sales_history(uid, bid)
    inquiries = store.inquiries(uid, bid)
    words = question.casefold()
    today = today_for(fields)
    product = next((item for item in inventory if item["name"].casefold() in words), None)
    product = product or next(iter(inventory), {"name": "your menu", "stock": 0, "unit": "items"})
    name = product["name"]
    stock = product.get("stock", 0)
    quantity = sum(row["quantity"] for row in history if row["item"] == name)
    if re.search(r"\b(?:hello|hi|hey)\b", words) or "\u0928\u092e\u0938\u094d\u0924\u0947" in words:
        shop = str(fields.get("name") or "This demo shop")
        return (
            f"{shop} has {len(inventory)} menu items and {len(history)} sales records. "
            "Next, ask about sales, stock, prep or customers."
        )
    if any(term in words for term in ("hours", "open", "closed", "timing", "sunday")):
        return (
            f"Demo shop hours are {fields.get('hours', 'not listed')}. "
            "In your real shop, a hours change waits for review; open Shop Details next."
        )
    if "today" in words or "close the day" in words or "\u0906\u091c" in words:
        rows = [row for row in history if row["date"] == today.isoformat()]
        sold = sum(row["quantity"] for row in rows)
        revenue = sum(row.get("revenue", row.get("amount", 0)) for row in rows)
        return (
            f"Today’s demo sales show {sold:g} items and ₹{revenue:g}. "
            "In your real shop, saving would add today’s sales; open Grow → Close the day next."
        )
    if (
        re.search(r"\b(?:order|reorder|buy more|low|need|supplier|supply)\b", words)
        or "\u0911\u0930\u094d\u0921\u0930" in words
    ):
        orders = supply_chain.orders(store, uid, bid)
        po = next((order for order in orders if order.get("supplier")), None)
        supplier = po["supplier"]["name"] if po else "the demo supplier"
        return (
            f"Demo supply records show {supplier}; {name} has {stock:g} in stock. "
            "In your real shop, this would draft an order for review; open Shop → Supplies next."
        )
    if any(
        term in words
        for term in (
            "forecast",
            "prep",
            "tomorrow",
            "\u0915\u0932",
            "\u0924\u0948\u092f\u093e\u0930",
        )
    ):
        tomorrow = today.fromordinal(today.toordinal() + 1)
        prediction = next(
            (
                row
                for row in weekday_average(history, today)
                if row.item == name and row.date == tomorrow
            ),
            None,
        )
        estimate = prediction.quantity if prediction else 0
        return (
            f"The demo forecast for {name} tomorrow is {estimate:g} {product.get('unit', 'items')}. "  # noqa: E501
            "In your real shop, this guides prep only; open Grow → Prep plan next."
        )
    if any(
        term in words
        for term in (
            "sold out",
            "stock",
            "available",
            "\u0916\u0924\u094d\u092e",
            "\u0938\u094d\u091f\u0949\u0915",
        )
    ):
        return (
            f"Demo stock shows {name}: {stock:g} {product.get('unit', 'items')}. "
            "In your real shop, this would update customer availability; open Shop → Sold out next."
        )
    if any(
        term in words for term in ("price", "\u0915\u0940\u092e\u0924", "\u0926\u093e\u092e")
    ) or re.search(r"\b(?:is|now)\s+\d+|\b\d+\s+now\b", words):
        return (
            f"The demo price for {name} is ₹{product.get('price', 0):g}. "
            "In your real shop, a price change waits for review; open Shop → Menu next."
        )
    if any(
        term in words
        for term in (
            "customer",
            "reply",
            "question",
            "message",
            "\u0917\u094d\u0930\u093e\u0939\u0915",
            "\u091c\u0935\u093e\u092c",
        )
    ):
        pending = [
            item
            for item in inquiries
            if not any(message.author == "owner" for message in item.messages)
        ]
        sample = pending[0].message if pending else "No unanswered demo questions"
        return (
            f"There are {len(pending)} demo customer questions; one asks, ‘{sample}’. "
            "In your real shop, a reply waits for review; open Shop → Messages next."
        )
    if any(
        term in words
        for term in ("rescue", "leftover", "deal", "\u092c\u091a\u093e", "\u091b\u0942\u091f")
    ):
        state = store.feature_docs.get("rescue", bid) or {}
        deal = next(
            (
                entry.get("data", entry)
                for entry in state.get("deals", [])
                if entry.get("data", entry).get("status") == "live"
            ),
            None,
        )
        item = deal["items"][0] if deal and deal.get("items") else None
        detail = (
            f"{item['qty_left']} {item['name']} at ₹{item['price']}"
            if item
            else "no live sample deal"
        )
        return (
            f"The demo rescue deal has {detail}. "
            "In your real shop, this would be shared with customers; open Rescue deals next."
        )
    if any(
        term in words
        for term in (
            "product",
            "menu",
            "update",
            "add",
            "\u0909\u0924\u094d\u092a\u093e\u0926",
            "\u092e\u0947\u0928\u0942",
        )
    ):
        return (
            f"Your demo menu has {len(inventory)} items; {name} costs ₹{product.get('price', 0):g}. "  # noqa: E501
            "In your real shop, edits wait for review; open Shop → Menu next."
        )
    if "sales" in words or (
        "business" in words and any(term in words for term in ("how", "week", "going"))
    ):
        return (
            f"The demo has {len(history)} saved sales rows and {quantity:g} {name} sold. "
            "In your real shop, these figures come from saved sales; open Grow → Insights next."
        )
    return "I can help with today’s sales, tomorrow’s prep or stock. Try ‘How did I do today?’, ‘What should I prep tomorrow?’ or ‘Order more Tea dust’."  # noqa: E501


# Products listed in the instruction snapshot; larger menus still use get_business_context.
