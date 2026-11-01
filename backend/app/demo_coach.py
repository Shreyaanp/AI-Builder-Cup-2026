"""Offline answers for the public /demo coach, read from the seeded demo shop (no model calls)."""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Any, cast

from .contracts import StreamEvent
from .demo_food_words import FOOD_UNITS, NUMBER_WORDS, is_food, singular

FALLBACK = (
    "I can help with these in the demo: change your hours, add an item, mark something sold "
    "out, visits this week, best sellers or tomorrow’s prep. Tap one to try it."
)
# Tappable examples under the fallback (O-2); each one has a deterministic demo answer.
SUGGESTIONS = (
    "Change my closing time to 10pm",
    "Add cutting chai for 15 rupees",
    "Samosa sold out",
    "How many visits this week?",
    "What are my best sellers?",
    "What should I prep tomorrow?",
)
DEMO_NOTE = "This is the demo shop, so nothing reaches real customers."
# The offline coach is conservative: a review card only for a short request that is all one of
# the patterns below. Anything more (a reason, a day, a "not") gets the examples instead, since
# a wrong card is worse than none.
CLOCK = r"(?P<hour>\d{1,2})(?:[:.](?P<minute>\d{2}))?\s*(?P<suffix>a\.?m\.?|p\.?m\.?)?"
DAILY = r"(?:\s+(?:every\s*day|daily))?"
HOURS = (
    re.compile(
        rf"(?:please\s+)?(?:change|set|move|make)\s+(?:my|the|our)\s+(?P<which>closing|opening)"
        rf"\s+time\s+to\s+{CLOCK}",
        re.I,
    ),
    re.compile(rf"(?:(?:we|i)\s+(?:will\s+)?)?(?P<which>close|open)\s+at\s+{CLOCK}{DAILY}", re.I),
    # "Open until 10pm" (or "till") is when the shop closes.
    re.compile(
        rf"(?:(?:we|i)\s+(?:are|am)\s+|we're\s+|i'm\s+)?(?:open|stay\s+open)\s+(?P<till>until|till)"
        rf"\s+{CLOCK}{DAILY}",
        re.I,
    ),
)
NAME = r"[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,3}"
PRICE = r"(?:rs\.?\s*|₹\s*|inr\s*)?(?P<price>\d+(?:\.\d{1,2})?)(?:\s*(?:rupees?|rs\.?|inr))?"
ADD_ITEM = re.compile(
    r"(?:please\s+)?add\s+(?:a\s+|an\s+|one\s+|the\s+)?(?:new\s+)?(?:item\s+)?"
    rf"(?:(?:called|named)\s+)?(?P<name>{NAME})\s+(?:for|at|@)\s+{PRICE}"
    r"(?:\s+(?:per|a|an)\s+(?P<unit>[a-z]+)|\s+each)?",
    re.I,
)
SOLD_OUT = re.compile(
    rf"(?:please\s+)?(?:mark\s+)?(?P<name>{NAME}?)\s+(?:(?:is|are|as)\s+)?"
    r"(?:sold\s+out|out\s+of\s+stock)",
    re.I,
)
BACK = re.compile(
    rf"(?:please\s+)?(?:mark\s+)?(?P<name>{NAME}?)\s+(?:(?:is|are|as)\s+)?"
    r"(?:back\s+in\s+stock|available\s+again)",
    re.I,
)
NEW_PRICE = re.compile(
    rf"(?:(?:please\s+)?(?:change|set|make)\s+(?:the\s+)?(?:price\s+of\s+(?P<of>{NAME})"
    rf"|(?P<own>{NAME})(?:'s)?\s+price)\s+to|(?P<name>{NAME})\s+price\s+(?:is\s+)?(?:now\s+)?)"
    rf"\s*{PRICE}",
    re.I,
)
NEGATION = re.compile(
    r"\b(?:not|no|never|don't|dont|do\s+not|doesn't|isn't|aren't|won't|can't|cannot|no\s+longer)\b",
    re.I,
)
CHANGE_CUE = re.compile(
    r"\b(?:clos\w*|open\w*|add|sold\s+out|stock|price|mark|change|set|hours)\b", re.I
)
QUESTION = re.compile(r"(?:is|are|do|does|did|what|when|which|how|can|should|will)\b", re.I)
# A question never builds a change card ("close at 10pm?", "can we close at 10pm"); it may still
# get an answer such as visits or best sellers.
ASKED = re.compile(
    r"(?:what|how|why|can|could|should|is|are|do|does|did|will|would|kya|kaise)\b", re.I
)
BEST_SELLERS = re.compile(
    r"(?:(?:what\s+(?:are|were|is)|what's|show(?:\s+me)?|which\s+are)\s+)?(?:my\s+|the\s+)?"
    r"(?:best[\s-]*sell(?:ers?|ing\s+items?)|top[\s-]*sell(?:ers?|ing\s+items?)"
    r"|most\s+popular\s+items?|top\s+items?)(?:\s+(?:this|last)\s+week)?"
    r"|what\s+sells\s+(?:the\s+)?(?:best|most)(?:\s+(?:this|last)\s+week)?",
    re.I,
)
# Shop visits and page views, not the owner's own trips ("visit the wholesaler").
WHEN = r"(?:\s+(?:this|last)\s+week|\s+today|\s+in\s+the\s+last\s+7\s+days)?"
VISITS = re.compile(
    r"(?:(?:how\s+many|what\s+(?:are|were|was|is))\s+)?(?:my\s+|the\s+)?(?:shop\s+|page\s+)?"
    r"(?:visits|visitors|page\s+views|footfall)(?:\s+(?:to|on)\s+my\s+(?:shop|store|page))?"
    r"(?:\s+(?:did|has|have)\s+(?:i|we|my\s+(?:shop|store|page))\s+(?:get|got|had))?"
    rf"{WHEN}"
    r"|how\s+many\s+(?:people|customers)\s+visited\s+(?:my|the)\s+(?:shop|store|page)"
    rf"{WHEN}",
    re.I,
)


def _is_demo(ctx: Any) -> bool:
    if not ctx or not ctx.business_id or not ctx.uid.startswith("public-demo-"):
        return False
    business = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    return bool(business and business["fields"].get("demo"))


def _proposed(ctx: Any, result: dict[str, Any]) -> list[StreamEvent] | None:
    """The review card and reply for a prepared change, or None when nothing would change."""
    if result.get("status") != "needs_review" or not result.get("changes"):
        return None
    proposal = ctx.proposals.get(str(result.get("proposal_id")))
    if not proposal:
        return None
    changes = "; ".join(result["changes"])
    return [
        StreamEvent(kind="proposal", data=proposal),
        StreamEvent(
            kind="reply",
            text=f"I've prepared this for you to check: {changes}. Confirm it on screen. "
            + DEMO_NOTE,
        ),
    ]


def _plain(question: str) -> str:
    """One line, curly apostrophes made straight, without the closing "?", "!" or "."."""
    return re.sub(r"[\s.!?]+$", "", " ".join(question.replace("’", "'").split()))


def _same_item(said: str, saved: str) -> bool:
    """One menu item, ignoring case and plurals ("samosas" is the saved "Samosa")."""
    return [singular(w) for w in said.casefold().split()] == [
        singular(w) for w in saved.casefold().split()
    ]


def _clock(hour: str, minute: str | None, suffix: str | None, closing: bool) -> str | None:
    h, m = int(hour), int(minute or 0)
    marker = (suffix or "").replace(".", "").casefold()
    if marker:
        if not 1 <= h <= 12:
            return None
        h = h % 12 + (12 if marker == "pm" else 0)
    elif closing and h == 12:
        return None  # "close at 12" could be noon or midnight
    elif closing and 1 <= h <= 11:
        h += 12  # "close at 10" means 10 in the evening
    if h > 23 or m > 59:
        return None
    return f"{h:02d}:{m:02d}"


def _hours_change(ctx: Any, text: str) -> list[StreamEvent] | None:
    """A weekly-hours proposal ("Change my closing time to 10pm"), as the real coach prepares."""
    match = next((m for pattern in HOURS if (m := pattern.fullmatch(text))), None)
    if not match:
        return None
    from .coordinator import propose_business
    from .merchant import DayHours

    groups = match.groupdict()
    closing = bool(groups.get("till")) or str(groups.get("which")).casefold().startswith("clos")
    time = _clock(match["hour"], match["minute"], match["suffix"], closing)
    if time is None:
        return None
    fields = ctx.store.context(ctx.uid, ctx.business_id)["business"]["fields"]
    key = "close" if closing else "open"
    days, before = [], set()
    for day in fields.get("weekly_hours") or []:
        if not day.get("closed"):
            before.add(day.get(key))
            day = {**day, key: time}
            if not day.get("open") or not day.get("close") or day["open"] >= day["close"]:
                return None  # never a day that opens at or after it closes
        days.append(DayHours(**day))
    if not days or before == {time}:
        return None
    # The one-line hours customers read follow the new times (when every open day is the same).
    spans = {(day.open, day.close) for day in days if not day.closed}
    hours = f"{next(iter(spans))[0]}–{next(iter(spans))[1]}" if len(spans) == 1 else ""
    result = propose_business(name="", hours=hours, weekly_hours=days)
    if result.get("status") == "needs_review":
        label = "Closing time" if closing else "Opening time"
        result["changes"] = [f"{label} {' / '.join(sorted(before))} → {time} on every open day"]
    return _proposed(ctx, result)


def _priced(ctx: Any, items: list[Any]) -> list[StreamEvent] | None:
    """The product review card, with amounts in the shop's currency ("₹25 per item")."""
    from .coordinator import propose_products, shop_currency
    from .region import symbol

    currency = shop_currency(ctx.store.context(ctx.uid, ctx.business_id)["business"])
    sign = symbol(currency) or f"{currency} "
    result = propose_products(items)
    result["changes"] = [
        re.sub(r"(?<![\w.])(\d+(?:\.\d+)?)(?= per | →)", lambda m: sign + m[1], change)
        for change in result.get("changes") or []
    ]
    return _proposed(ctx, result)


def _add_item(ctx: Any, text: str) -> list[StreamEvent] | None:
    """A new item or a price change for review ("Add masala chai for 20 rupees")."""
    match = ADD_ITEM.fullmatch(text)
    if not match:
        return None
    from .coordinator import ProductInput, shop_currency
    from .money import to_major
    from .product_units import known_unit
    from .region import symbol

    name = " ".join(match["name"].split())
    price = float(match["price"])
    # Only food units: "per hour" or "per service" is not a menu item.
    unit = known_unit(match["unit"]) if match["unit"] else "item"
    if not 0 < price <= 100_000 or unit not in {"item", *FOOD_UNITS}:
        return None
    # "add five samosas for 100" is a pack price, never a new item called "Five samosas".
    if NUMBER_WORDS & set(name.casefold().split()):
        return None
    context = ctx.store.context(ctx.uid, ctx.business_id)
    currency = shop_currency(context["business"])
    sign = symbol(currency) or f"{currency} "
    known = next((p for p in context["inventory"] if _same_item(name, p["name"])), None)
    # A new item must name a food or drink: "add rent for 5000" is a cost, not a menu item.
    if not known and not is_food(name):
        return None
    # "add samosa for 25 per plate" prices a plate, not the saved per-piece Samosa: no card.
    if known and match["unit"] and unit != known["unit"]:
        return None
    if known and to_major(known["price"], currency) == price:
        return [
            StreamEvent(
                kind="reply",
                text=f"{known['name']} is already on your demo menu at {sign}{price:g} per "
                f"{known['unit']}. Open Shop → Menu next to see it.",
            )
        ]
    item: dict[str, Any] = {"name": known["name"] if known else name[0].upper() + name[1:]}
    item["price"] = price
    if not known:
        item["unit"] = unit
    return _priced(ctx, [ProductInput(**item)])


def _upkeep(ctx: Any, text: str) -> list[StreamEvent] | None:
    """Sold out, back in stock or a new price for one saved item ("Samosa sold out")."""
    from .coordinator import ProductInput

    found = SOLD_OUT.fullmatch(text) or BACK.fullmatch(text) or NEW_PRICE.fullmatch(text)
    if not found:
        return None
    said = next(found[group] for group in ("name", "of", "own") if found.groupdict().get(group))
    inventory = ctx.store.context(ctx.uid, ctx.business_id)["inventory"]
    known = next((p for p in inventory if _same_item(said, p["name"])), None)
    if not known:
        return None
    item = ProductInput(name=known["name"], unit=known["unit"])
    if found.re is NEW_PRICE:
        item.price = float(found["price"])
        if not 0 < item.price <= 100_000:
            return None
    else:
        item.available = found.re is BACK
    events = _priced(ctx, [item])
    if events:
        return events
    if found.re is NEW_PRICE:
        state = "already has that price"
    else:
        state = "is already available" if item.available else "is already sold out"
    return [
        StreamEvent(
            kind="reply",
            text=f"{known['name']} {state} on your demo menu. Open Shop → Menu next to see it.",
        )
    ]


def _unclear_change(question: str, text: str) -> bool:
    """A change request that is not exactly one the demo can prepare ("don't close at 10pm",
    "close at 2pm for lunch"): it gets the examples, never a guessed card."""
    if NEGATION.search(text) and CHANGE_CUE.search(text):
        return True
    if re.search(r"\d", text) and (
        re.search(r"\b(?:clos\w*|open\w*)\b", text, re.I)
        or re.match(r"(?:please\s+)?(?:(?:can|could|will|would)\s+you\s+)?add\b", text, re.I)
    ):
        return True
    upkeep = re.search(r"\b(?:sold\s+out|out\s+of\s+stock|back\s+in\s+stock)\b", text, re.I)
    return bool(upkeep) and "?" not in question and not QUESTION.match(text)


def _last_week(result: dict[str, Any]) -> dict[str, Any]:
    """The same answer for last week. On a Monday this week has no closed day yet (OB-248)."""
    from .coordinator import current, local_now, recap_facts, shop_zone, time, to_major

    ctx = current.get()
    assert ctx is not None and ctx.business_id
    shop = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    today = local_now(shop_zone(shop["fields"]), time.time()).date()
    year, week, _ = (today - timedelta(days=7)).isocalendar()
    facts = recap_facts(
        f"{year}-W{week:02d}",
        ctx.store.sales_history(ctx.uid, ctx.business_id),
        ctx.store.recap_signals(ctx.uid, ctx.business_id),
    )
    currency = facts["currency"]
    for key in ("revenue", "previous_revenue", "revenue_change"):
        facts[key] = to_major(int(facts[key]), currency)
    for group in ("top_sellers", "slow_movers"):
        facts[group] = [
            {**row, "revenue": to_major(int(row["revenue"]), currency)} for row in facts[group]
        ]
    return {**result, **facts}


def _best_sellers() -> list[StreamEvent]:
    from .charts import insights_card
    from .coordinator import get_insights

    result = get_insights()
    period = "This week's"
    if not result.get("top_sellers"):
        result = _last_week(result)
        period = "Last week's"
    top = result.get("top_sellers") or []
    if not top:
        return [StreamEvent(kind="reply", text="The demo shop has no sales saved yet.")]
    names = ", ".join(f"{row['item']} ({row['quantity']:g} sold)" for row in top[:3])
    card = insights_card(result)
    return [
        *([StreamEvent(kind="chart", data=card)] if card else []),
        StreamEvent(
            kind="reply",
            text=f"{period} demo best sellers: {names}. "
            "In your real shop, these come from your saved sales; open Grow → Insights next.",
        ),
    ]


def _visits(ctx: Any) -> list[StreamEvent]:
    from .analytics import counters_for
    from .sales import today_for

    fields = ctx.store.context(ctx.uid, ctx.business_id)["business"]["fields"]
    today = today_for(fields)
    week = [today - timedelta(days=offset) for offset in range(7)]
    counters = counters_for(ctx.store, ctx.business_id, week).values()
    views = sum(int(day.get("views") or 0) for day in counters)
    stamps = sum(int(day.get("stamps") or 0) for day in counters)
    returning = sum(int(day.get("returning") or 0) for day in counters)
    return [
        StreamEvent(
            kind="reply",
            text=f"In the last 7 days the demo shop page was opened {views} times and customers "
            f"collected {stamps} stamps at the counter ({returning} returning visits). "
            "In your real shop, these count real page opens and QR scans; open Grow → Insights "
            "next.",
        )
    ]


async def public_demo_turn(ctx: Any, question: str) -> list[StreamEvent] | None:
    """A whole offline demo turn: the proposal and chart cards the real coach would show, then
    the reply. Deterministic and model-free, so the public demo never calls a paid model."""
    if not _is_demo(ctx):
        return None
    text = _plain(question)
    reply: str | None = None
    if not re.search(r"[ऀ-ॿ]", question):
        asked = "?" in question or ASKED.match(text)
        if not NEGATION.search(text):
            for intent in () if asked else (_hours_change, _add_item, _upkeep):
                events = intent(ctx, text)
                if events:
                    return events
            if BEST_SELLERS.fullmatch(text):
                return _best_sellers()
            if VISITS.fullmatch(text):
                return _visits(ctx)
        if _unclear_change(question, text):
            reply = FALLBACK
    reply = reply or public_demo_reply(ctx, question)
    if reply is None:
        return None
    if reply == FALLBACK:
        return [StreamEvent(kind="reply", text=reply, data={"suggestions": list(SUGGESTIONS)})]
    events = [StreamEvent(kind="reply", text=reply)]
    if reply.startswith("The demo forecast"):
        from .charts import forecast_card
        from .coordinator import get_forecast

        card = forecast_card(await get_forecast())
        if card:
            events.insert(0, StreamEvent(kind="chart", data=card))
    return events


def public_demo_reply(ctx: Any, question: str) -> str | None:
    """Answer public demo questions from seeded records, without tools or providers."""
    if not ctx.business_id or not ctx.uid.startswith("public-demo-"):
        return None
    from . import supply_chain
    from .coordinator import shop_currency
    from .forecast import weekday_average
    from .money import to_major
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
    stock = product.get("stock") or 0  # a saved item may have no stock count
    # Saved prices are minor units (paise); the reply shows rupees.
    price = to_major(cast(int, product.get("price", 0)), shop_currency(business))
    quantity = sum(row["quantity"] for row in history if row["item"] == name)
    if re.search(r"[\u0900-\u097f]", question):
        # This offline demo has no translation model. Keep its answers in the language of a
        # Devanagari question, with the same seeded facts used by the English replies.
        if any(term in words for term in ("आज", "बिक्री", "कमाई")):
            rows = [row for row in history if row["date"] == today.isoformat()]
            sold = sum(row["quantity"] for row in rows)
            revenue = sum(row.get("revenue", row.get("amount", 0)) for row in rows)
            return f"आज डेमो में {sold:g} चीज़ें बिकीं और बिक्री ₹{revenue:g} रही।"
        if any(term in words for term in ("स्टॉक", "बचा", "उपलब्ध", "खत्म", "कम")):
            return f"डेमो में {name} का स्टॉक {stock:g} {product.get('unit', 'चीज़ें')} है।"
        if any(term in words for term in ("कीमत", "दाम", "भाव")):
            return f"डेमो में {name} की कीमत ₹{price:g} है।"
        if any(term in words for term in ("ऑर्डर", "सप्लायर", "मंगाऊँ", "खरीद")):
            orders = supply_chain.orders(store, uid, bid)
            po = next((order for order in orders if order.get("supplier")), None)
            supplier = po["supplier"]["name"] if po else "डेमो सप्लायर"
            return f"डेमो सप्लायर {supplier} है। {name} का स्टॉक {stock:g} है।"
        if any(term in words for term in ("कल", "तैयार", "बनाऊँ")):
            return f"कल {name} की तैयारी के लिए डेमो बिक्री का औसत देखें।"
        if any(term in words for term in ("समय", "खुला", "खुलती", "बंद")):
            return f"डेमो दुकान का समय {fields.get('hours', 'दिया नहीं गया')} है।"
        if any(term in words for term in ("ग्राहक", "सवाल", "जवाब", "संदेश")):
            return f"डेमो दुकान में {len(inquiries)} ग्राहक सवाल हैं।"
        return "मैं आज की बिक्री, कल की तैयारी या स्टॉक के बारे में बता सकती हूँ।"
    # Only a short hello is a greeting; "Hi, reorder milk" is an order.
    greeting = (
        re.search(r"\b(?:hello|hi|hey)\b", words) or "\u0928\u092e\u0938\u094d\u0924\u0947" in words
    )
    if greeting and len(words.split()) <= 3:
        shop = str(fields.get("name") or "This demo shop")
        return (
            f"{shop} has {len(inventory)} menu items and {len(history)} sales records. "
            "Next, ask about sales, stock, prep or customers."
        )
    if re.search(r"\b(?:hours|open|opening|closed|timing|sunday)\b", words):
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
        re.search(
            r"\b(?:order|reorder|buy more|low|need|suppliers?|supply|supplies|sourc\w*)\b", words
        )
        or "\u0911\u0930\u094d\u0921\u0930" in words
    ):
        orders = supply_chain.orders(store, uid, bid)
        po = next((order for order in orders if order.get("supplier")), None)
        supplier = po["supplier"]["name"] if po else "the demo supplier"
        return (
            f"Demo supply records show {supplier}; {name} has {stock:g} in stock. "
            "In your real shop, this would draft an order for review; open Grow → Supplies next."
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
            f"The demo forecast for {name} tomorrow is {estimate:g} {product.get('unit', 'items')} "
            "(method: weekday average of past sales). "
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
        if product.get("available") is False:
            count = "sold out"
        elif product.get("stock") is None:
            count = "on sale (no stock count saved)"
        else:
            count = f"{stock:g} {product.get('unit', 'items')}"
        return (
            f"Demo stock shows {name}: {count}. "
            "In your real shop, this would update customer availability; open Shop → Sold out next."
        )
    if any(
        term in words for term in ("price", "\u0915\u0940\u092e\u0924", "\u0926\u093e\u092e")
    ) or re.search(r"\b(?:is|now)\s+\d+|\b\d+\s+now\b", words):
        return (
            f"The demo price for {name} is ₹{price:g}. "
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
            " add ",
            "\u0909\u0924\u094d\u092a\u093e\u0926",
            "\u092e\u0947\u0928\u0942",
        )
    ):
        return (
            f"Your demo menu has {len(inventory)} items; {name} costs ₹{price:g}. "  # noqa: E501
            "In your real shop, edits wait for review; open Shop → Menu next."
        )
    if "sales" in words or (
        "business" in words and any(term in words for term in ("how", "week", "going"))
    ):
        return (
            f"The demo has {len(history)} saved sales rows and {quantity:g} {name} sold. "
            "In your real shop, these figures come from saved sales; open Grow → Insights next."
        )
    return FALLBACK


# Products listed in the instruction snapshot; larger menus still use get_business_context.
