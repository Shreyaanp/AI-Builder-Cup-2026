"""Offline answers for the public /demo coach, read from the seeded demo shop (no model calls)."""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Any, cast

from .app_guide import Feature, by_ask, next_line, next_line_hi
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
DEMO_NOTE_HI = "यह डेमो दुकान है, इसलिए कुछ भी असली ग्राहकों तक नहीं जाता।"
HINDI = re.compile(r"[ऀ-ॿ]")
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
CLOSED_TODAY = re.compile(
    r"(?:(?:we|i)\s+(?:are|am)\s+|we're\s+|i'm\s+|(?:the\s+|my\s+)?shop\s+is\s+)?"
    r"(?P<state>closed|open\s+again)\s+today",
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
# "ज़्यादा" is written with or without the nukta, precomposed or not.
HINDI_BEST_SELLERS = re.compile(r"सबसे\s+\S*यादा\s+(?:\S+\s+)?बिक|बेस्ट\s*सेलर|टॉप\s*सेलर")
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
                f"{known['unit']}. " + next_line("price_change"),
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
            text=f"{known['name']} {state} on your demo menu. "
            + next_line("price_change" if found.re is NEW_PRICE else "sold_out"),
        )
    ]


def _closed_today(ctx: Any, text: str) -> list[StreamEvent] | None:
    """Closed for today only, or open again ("We are closed today"), as the real coach's
    set_open_today prepares; the weekly hours stay the same."""
    match = CLOSED_TODAY.fullmatch(text)
    if not match:
        return None
    from .voice_tools import set_open_today

    again = match["state"].casefold() != "closed"
    result = set_open_today(again)
    if result.get("status") == "no_change":
        state = "open" if again else "closed"
        return [StreamEvent(kind="reply", text=f"Your demo shop is already {state} today.")]
    return _proposed(ctx, result)


INTENTS = (_hours_change, _add_item, _upkeep, _closed_today)
# The feature each prepared change belongs to, for its "Next, open …" line.
TAUGHT = {"_hours_change": "hours", "_add_item": "add_menu", "_closed_today": "closed_today"}
# Screens with no tool of their own: the demo opens them, as the real coach does.
OPENS = {"radar", "rider", "reminders"}
# Features whose screen phrase the demo answers from its records (public_demo_reply); the
# others get what the feature does. Several share a path (Shop → Shop details), so the path
# alone does not say the answer is about the feature.
RECORDS = {
    "supply",
    "suppliers",
    "price_change",
    "hours",
    "messages",
    "close_day",
    "forecast",
    "insights",
}


def _teach(events: list[StreamEvent], feature_id: str) -> list[StreamEvent]:
    """End the reply with the feature's screen path (one shared map, app_guide.py)."""
    line = next_line(feature_id)
    last = events[-1]
    if last.kind == "reply" and last.text and line not in last.text:
        events[-1] = last.model_copy(update={"text": f"{last.text} {line}"})
    return events


def _guided(ctx: Any, feature: Feature) -> list[StreamEvent]:
    """What the feature does and where it is on screen; the screen-only ones open at once."""
    events = _opened(ctx, feature)
    text = f"{feature.title}: {feature.what} {next_line(feature.id)} {DEMO_NOTE}"
    return [*events, StreamEvent(kind="reply", text=text)]


def _opened(ctx: Any, feature: Feature) -> list[StreamEvent]:
    from .voice_tools import open_screen

    events: list[StreamEvent] = []
    if feature.screen in OPENS:
        card = ctx.cards.get(str(open_screen(feature.screen).get("card_id")))  # type: ignore[arg-type]
        if card:
            events.append(StreamEvent(kind="action", data=card[1]))
    return events


def _hindi(ctx: Any, feature: Feature) -> list[StreamEvent]:
    """A screen's Hindi phrase: the change its English phrase prepares, else what the feature
    does, in Hindi and ending with the same path (this offline demo has no translation model)."""
    text = _plain(feature.ask)
    for intent in INTENTS:
        events = intent(ctx, text) or []
        if events and events[0].kind == "proposal":
            reply = "मैंने यह आपके जाँचने के लिए तैयार किया है; स्क्रीन पर पक्का करें।"
            return [
                events[0],
                StreamEvent(
                    kind="reply", text=f"{reply} {DEMO_NOTE_HI} {next_line_hi(feature.id)}"
                ),
            ]
    text = f"{feature.what_hi} {next_line_hi(feature.id)} {DEMO_NOTE_HI}"
    return [*_opened(ctx, feature), StreamEvent(kind="reply", text=text)]


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


def _best_sellers() -> list[StreamEvent]:
    from .charts import insights_card
    from .coordinator import get_insights

    result = get_insights()
    top = result.get("top_sellers") or []
    if not top:
        return [
            StreamEvent(
                kind="reply", text="The demo shop has no sales saved in the last 7 days yet."
            )
        ]
    names = ", ".join(f"{row['item']} ({row['quantity']:g} sold)" for row in top[:3])
    card = insights_card(result)
    return [
        *([StreamEvent(kind="chart", data=card)] if card else []),
        StreamEvent(
            kind="reply",
            text=f"In the last 7 days, the demo best sellers: {names}. "
            "In your real shop, these come from your saved sales. " + next_line("insights"),
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
            "In your real shop, these count real page opens and QR scans. " + next_line("insights"),
        )
    ]


async def public_demo_turn(ctx: Any, question: str) -> list[StreamEvent] | None:
    """A whole offline demo turn: the proposal and chart cards the real coach would show, then
    the reply. Deterministic and model-free, so the public demo never calls a paid model."""
    if not _is_demo(ctx):
        return None
    text = _plain(question)
    reply: str | None = None
    feature = by_ask(question)
    if feature and HINDI.search(question):
        return _hindi(ctx, feature)
    if not HINDI.search(question):
        asked = "?" in question or ASKED.match(text)
        if not NEGATION.search(text):
            for intent in () if asked else INTENTS:
                events = intent(ctx, text)
                if events:
                    taught = TAUGHT.get(intent.__name__, "sold_out")
                    return _teach(events, "price_change" if NEW_PRICE.fullmatch(text) else taught)
    if not HINDI.search(question):
        # The phrase a screen shows ("Or just ask: …") ends with its own feature's screen path:
        # the demo's records answer when it is about that feature (it names the same path),
        # else what the feature does.
        if feature:
            known = public_demo_reply(ctx, question) if feature.id in RECORDS else None
            if not known or not known.endswith(next_line(feature.id)):
                return _guided(ctx, feature)
            reply = known
        elif not NEGATION.search(text):
            if BEST_SELLERS.fullmatch(text):
                return _best_sellers()
            if VISITS.fullmatch(text):
                return _visits(ctx)
        if not feature and _unclear_change(question, text):
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
    named = next((item for item in inventory if item["name"].casefold() in words), None)
    product = named or next(iter(inventory), {"name": "your menu", "stock": 0, "unit": "items"})
    name = product["name"]
    stock = product.get("stock") or 0  # a saved item may have no stock count
    # Saved prices are minor units (paise); the reply shows rupees.
    price = to_major(cast(int, product.get("price", 0)), shop_currency(business))
    quantity = sum(row["quantity"] for row in history if row["item"] == name)
    if re.search(r"[\u0900-\u097f]", question):
        # This offline demo has no translation model. Keep its answers in the language of a
        # Devanagari question, with the same seeded facts used by the English replies.
        low = re.search(r"मेरा\s+(?P<item>[^।?]{1,40}?)\s+कम\s+हो\s+रहा", words)
        if low:
            return (
                f"असली दुकान में कोच पास के सप्लायर ढूँढकर {low['item']} का ऑर्डर तैयार करता है, "
                "जिसे आप भेजते हैं। " + next_line_hi("suppliers")
            )
        if HINDI_BEST_SELLERS.search(question):
            from .coordinator import get_insights

            top = get_insights().get("top_sellers") or []
            if not top:
                return "डेमो दुकान में पिछले 7 दिनों की कोई बिक्री अभी सेव नहीं है।"
            names = ", ".join(f"{row['item']} ({row['quantity']:g} बिके)" for row in top[:3])
            return f"पिछले 7 दिनों में डेमो के सबसे ज़्यादा बिकने वाले आइटम: {names}। " + next_line_hi(
                "insights"
            )
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
            "In your real shop, an hours change waits for review. " + next_line("hours")
        )
    if "today" in words or "close the day" in words or "\u0906\u091c" in words:
        rows = [row for row in history if row["date"] == today.isoformat()]
        sold = sum(row["quantity"] for row in rows)
        revenue = sum(row.get("revenue", row.get("amount", 0)) for row in rows)
        return (
            f"Today’s demo sales show {sold:g} items and ₹{revenue:g}. "
            "In your real shop, saving would add today’s sales. " + next_line("close_day")
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
        # "My milk is running low" (and Orders → Find a supplier) is about that item's suppliers.
        low = re.search(r"\bmy\s+(?P<item>[^.!?]{1,40}?)\s+(?:is|are)\s+running\s+low\b", words)
        if low:
            return (
                f"In your real shop, the coach finds suppliers near you for {low['item']} and "
                f"prepares an order request for you to send. Demo supply records show {supplier}. "
                + next_line("suppliers")
            )
        # "Reorder milk" names no menu item: never another item's stock.
        wanted = re.search(r"\b(?:reorder|order|buy\s+more)\s+(?P<item>[a-z][a-z ]{0,30})$", words)
        if not named and wanted:
            return (
                f"Demo supply records show {supplier}. In your real shop, this would draft an "
                f"order for {wanted['item']} for review. " + next_line("supply")
            )
        return (
            f"Demo supply records show {supplier}; {name} has {stock:g} in stock. "
            "In your real shop, this would draft an order for review. " + next_line("supply")
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
            "In your real shop, this guides prep only. " + next_line("forecast")
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
            "In your real shop, this would update customer availability. " + next_line("sold_out")
        )
    if any(
        term in words for term in ("price", "\u0915\u0940\u092e\u0924", "\u0926\u093e\u092e")
    ) or re.search(r"\b(?:is|now)\s+\d+|\b\d+\s+now\b", words):
        return (
            f"The demo price for {name} is ₹{price:g}. "
            "In your real shop, a price change waits for review. " + next_line("price_change")
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
            "In your real shop, a reply waits for review. " + next_line("messages")
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
            "In your real shop, this would be shared with customers. " + next_line("rescue")
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
            "In your real shop, edits wait for review. " + next_line("price_change")
        )
    if re.search(r"\bhow\b.*\b(?:this|last)\s+week\b", words):
        week = {(today - timedelta(days=offset)).isoformat() for offset in range(7)}
        rows = [row for row in history if row["date"] in week]
        sold = sum(row["quantity"] for row in rows)
        revenue = sum(row.get("revenue", row.get("amount", 0)) for row in rows)
        rupees = to_major(int(revenue), shop_currency(business))  # saved in paise
        return (
            f"In the last 7 days the demo shop sold {sold:,.0f} items for ₹{rupees:,.0f}. "
            "In your real shop, these figures come from saved sales. " + next_line("insights")
        )
    if "sales" in words or (
        "business" in words and any(term in words for term in ("how", "week", "going"))
    ):
        return (
            f"The demo has {len(history)} saved sales rows and {quantity:g} {name} sold. "
            "In your real shop, these figures come from saved sales. " + next_line("insights")
        )
    return FALLBACK


# Products listed in the instruction snapshot; larger menus still use get_business_context.
