"""Instant path: common owner requests answered before any model call (sub-100 ms server side).

Rules first (sold out, back in stock, price change, closed/open today, opening a screen,
"am I open?", "any messages?", "how do I…?"), then, optionally, cached embeddings of known
intent phrasings for paraphrases. Writes still go through the same tools, so every change is
only a prepared review the owner confirms. Embedding matches only ever route to read-only or
navigation intents, never to a write. Anything unsure returns None and the coach model answers.
"""

import math
import re
from collections import OrderedDict
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import timedelta
from typing import TYPE_CHECKING, Any, Literal

import anyio
from google.adk.events import Event

from .app_guide import guide_reply, where_line
from .close_reward import close_reward, reward_text
from .contracts import StreamEvent
from .coordinator import MerchantContext, propose_products
from .day_total import with_day_totals
from .demo_coach_words import HI_PRICE_CUE, HINDI, bare, speaks_hindi
from .demo_coach_words import PRICE_CUE as OWNER_PRICE_CUE
from .demo_item_names import hindi_item
from .discover import open_now
from .instant_supply import order_from_list, supplier_search
from .money import to_minor
from .owner_order_words import order_asked
from .region import shop_currency, shop_zone
from .rescue import local_now
from .sourcing import money_text
from .voice_tools import SCREENS, get_customer_messages, open_screen, set_open_today

if TYPE_CHECKING:
    from .expenses import ChatExpense
    from .owner_promise import Promise

Embedder = Callable[[str], list[float]]

# Plain-Latin messages take the whole instant path, as the templates reply in English. Hindi sold
# outs and prices (OB-261, OB-262) are the one exception; the model handles everything else.
LATIN = re.compile(r"^[\x00-\x7f₹$€£¥]*$")

SCREEN_RULES: tuple[tuple[str, str], ...] = (
    (r"^(?:open|show|go to)\s+(?:my\s+)?today(?:\s+page)?[.!?]?$", "today"),
    (r"^(?:open|show|go to)\s+(?:my\s+)?shop(?:\s+tab)?[.!?]?$", "shop"),
    (r"^(?:open|show|go to)\s+grow(?:\s+tab)?[.!?]?$", "grow"),
    (r"^(?:open|show|go to)\s+(?:you|settings)(?:\s+tab)?[.!?]?$", "you"),
    (r"^(?:open|show)\s+(?:my\s+)?(?:trust|verification)(?:\s+status)?[.!?]?$", "trust"),
    (r"^(?:open|show)\s+(?:customer\s+)?(?:games|perks)[.!?]?$", "games"),
    (r"^(?:open|show)\s+(?:my\s+)?payments?(?:\s+(?:&|and)\s+rides)?[.!?]?$", "payments"),
    (r"^(?:open|show)\s+(?:my\s+)?purchase\s+orders[.!?]?$", "supply"),
    # A payment or UPI link is the payment tool's job, not the customer page.
    (
        r"\b(?:share|send)\b(?!.*\b(?:payment|pay|upi)\b).*\b(?:my\s+)?(?:page|link|shop)\b"
        r"|\b(?:show|print|get)\b(?!.*\b(?:payment|pay|upi)\b).*\bqr\b",
        "share",
    ),
    (
        r"\bclose\s+(?:the|my)\s+day\b|\bday\s*end\b|\bend\s+of\s+(?:the\s+)?day\b"
        r"|\baaj\s+ka\s+hisaa?b\b",
        "close_day",
    ),
    (r"\b(?:get|put|list)\b.*\bon\s+google\b|\bgoogle\s+(?:step|listing|profile)\b", "google"),
    (r"\b(?:delete|erase|remove|download|export)\s+(?:all\s+)?my\s+(?:data|account)\b", "privacy"),
    (r"\bconnect\b.*\b(?:pos|billing|tally|petpooja)\b|\bimport\b.*\bsales\b", "import"),
    (r"\bplan\s+tomorrow\b", "plan"),
    (r"\b(?:open|show)\b.*\bmessages?\b", "messages"),
    (r"\b(?:stamp\s*card|loyalty\s+card)\b", "stamps"),
    # Screens with no tool of their own: the chat opens them.
    (
        r"\bnearby\s+demand\b|\basked\s+nearby\b"
        r"|\bpeople\s+(?:nearby|near\s+(?:me|here|my\s+shop))\b.*\b(?:ask|want|look)\w*\b",
        "radar",
    ),
    (r"\b(?:send|call|book|get)\s+(?:me\s+)?(?:a\s+)?(?:rider|courier)\b", "rider"),
    (
        r"^remind\s+me\b|\b(?:turn|switch|set)\s+(?:on|up)\s+(?:my\s+|the\s+)?reminders?\b",
        "reminders",
    ),
)
CLOSED_TODAY = re.compile(
    r"^(?:we(?:'re|\s+are)|i(?:'m|\s+am)|the\s+shop\s+is|shop\s+is|shop)?\s*closed\s+today\b"
    r"|^(?:mark|set)\s+(?:the\s+)?shop\s+closed\s+(?:for\s+)?today\b",
    re.I,
)
OPEN_TODAY = re.compile(
    r"^(?:we(?:'re|\s+are)|i(?:'m|\s+am)|the\s+shop\s+is|shop\s+is)\s+open\s+(?:again\s+)?today\b"
    r"|^(?:re-?open|open)\s+(?:the\s+)?shop\s+(?:again\s+)?today\b",
    re.I,
)
AM_I_OPEN = re.compile(r"^(?:am\s+i|are\s+we|is\s+(?:my|the)\s+shop)\s+open\b", re.I)
MY_HOURS = re.compile(r"^what\s+are\s+(?:my|our|the\s+shop'?s?)\s+(?:opening\s+)?hours\b", re.I)
MESSAGES = re.compile(
    r"^(?:any\s+|do\s+i\s+have\s+(?:any\s+)?|are\s+there\s+(?:any\s+)?)"
    r"(?:new\s+)?(?:customer\s+)?(?:messages|questions)\b",
    re.I,
)
# "How did today go?": the close screen's facts in the chat (HABIT change 3, two paths).
HOW_TODAY = re.compile(
    r"^(?:how\s+(?:did|was)\s+(?:today|my\s+day)(?:\s+go)?|how(?:'s|\s+is)\s+today\s+going"
    r"|aaj\s+(?:ka\s+din\s+)?kaisa\s+(?:raha|tha|gaya))\b",
    re.I,
)
# "How much to make?" opens the make list in every script the router knows (OB-328). The owner
# asks about now: in English a question naming an item is the coach's forecast answer, and a
# question naming tomorrow is the coach's too, and so is the Make list's own "Ask
# the coach" sentence. Past tense ("did I make", बनाया) is about what happened, not the list, and
# a "don't" is never a request to open anything.
MAKE_LIST = re.compile(
    r"^(?!.*\b(?:tomorrow|tmrw|kal|did|made|don'?t|dont|mat|nahi|nahin)\b)"
    r"(?!.*(?:^|\s)(?:कल|मत|नहीं)(?:\s|$)).*(?:"
    r"\bhow\s+(?:much|many)\s+(?:(?:should|do|can|shall)\s+(?:i|we)\s+|to\s+)?"
    r"(?:make|prep|prepare|bake|cook)(?:\s+(?:today|now))?$"
    r"|\bkit(?:na|ne|ni)\b.*\bbana(?:na|ne|ni|u|un|oon|ye|yen)\b"
    r"|कित(?:ना|ने|नी)\s.*(?:बना(?:ना|ने|नी|ऊँ|ऊं|उँ|उं|एँ|एं|ओ)(?:\s|$)"
    r"|तैयार(?:ी)?\s*कर(?:ना|ने|नी|ूँ|ूं|ें)(?:\s|$))"
    r"|(?:मांग|माँग)\s.*अनुमान"
    r")",
    re.I,
)
SOLD_OUT_LIST = re.compile(
    r"^(?:what(?:'s|\s+is)|which\s+(?:items?|things)\s+(?:are|is))\s+sold\s+out\b", re.I
)
# Tomorrow's promise by chat (HABIT change 4): "remind me to order milk tomorrow (morning)",
# "tomorrow remind me to call Ganesh", "kal subah doodh yaad dilana". Only with "tomorrow" or
# "kal": "remind me every morning" stays the Remind me screen.
TOMORROW = r"(?:tomorrow|tmrw|kal)(?:\s+(?:morning|subah))?"
# "Remind (me)" in Hindi, when it comes before the thing: याद दिलाना / दिलाओ / दिला देना …
REMIND_HI = r"(?:दिला|करा)(?:ना|ओ|\s*देना|\s*दो|\s*दीजिए|इए|इये|एँ|एं)"
PROMISE = (
    re.compile(
        rf"^(?:{TOMORROW}\s+)?(?:please\s+)?remind\s+me\s+(?:{TOMORROW}\s+)?(?:to|about)\s+"
        rf"(?P<what>.+?)\s+{TOMORROW}$"
        rf"|^(?:{TOMORROW}\s+)(?:please\s+)?remind\s+me\s+(?:to|about)\s+(?P<before>.+)$"
        rf"|^(?:please\s+)?remind\s+me\s+{TOMORROW}\s+(?:to|about)\s+(?P<after>.+)$",
        re.I,
    ),
    re.compile(
        rf"^{TOMORROW}\s+(?P<what>.+?)\s+(?:yaad|yad)\s+(?:dila|dilaa)(?:na|o|dena|iye|ana)$",
        re.I,
    ),
    # The same in Devanagari: Hindi typing and Hindi voice ("कल सुबह दूध मँगाना याद दिलाना",
    # the close screen's own Hindi hint).
    re.compile(
        r"^(?:मुझे\s+)?कल(?:\s+सुबह)?\s+(?:मुझे\s+)?(?P<what>.+?)\s+(?:की\s+)?याद\s+"
        r"(?:दिला|करा)(?:ना|ओ|\s*देना|\s*दो|\s*दीजिए|इए|इये|एँ|एं|ना\s+है)$"
    ),
    # "Remind me" first: "कल मुझे याद दिलाना कि दूध मंगाना है", "याद दिलाना कल दूध मंगाना".
    re.compile(
        rf"^(?:मुझे\s+)?कल(?:\s+सुबह)?\s+(?:मुझे\s+)?याद\s+{REMIND_HI}\s+(?:कि\s+)?"
        r"(?P<that>.+?)(?:\s+है)?$"
    ),
    re.compile(
        rf"^(?:मुझे\s+)?याद\s+{REMIND_HI}\s+(?:कि\s+)?कल(?:\s+सुबह)?\s+"
        r"(?P<later>.+?)(?:\s+है)?$"
    ),
)
# Where the promise is in the Hindi UI (tabsCopy navGrow, closeday translations title).
PROMISE_WHERE_HI = "बढ़ाएँ → दिन बंद करें"
# "kal subah yaad dilana" names no thing to write down: just tomorrow's words (or "me", as in
# "कल मुझे याद दिलाना").
WHEN_ONLY = re.compile(rf"{TOMORROW}|morning|subah|सुबह|कल(?:\s+सुबह)?|मुझे", re.I)
ORDER_WORDS = re.compile(r"^(?:re-?order|order|buy|get)\s+(?:more\s+|some\s+)?(?P<item>.+)$", re.I)
MAKE_WORDS = re.compile(r"^(?:make|prep|prepare)\s+(?:more\s+|some\s+)?(?P<item>.+)$", re.I)

# Known phrasings of read-only and navigation intents, for embedding matches.
EXEMPLARS: dict[str, tuple[str, ...]] = {
    "am_i_open": ("is my shop showing as open right now", "do customers see me open"),
    "messages": ("did any customer write to me", "check if customers sent questions"),
    "sold_out_list": ("which items are marked unavailable", "list what has run out"),
    **{f"screen:{key}": (f"take me to {label.lower()}",) for key, label in SCREENS.items()},
}
EMBED_THRESHOLD = 0.86
# A bare "samosa 20" may be a sales count; a price change needs a price word.
PRICE_CUE = re.compile(
    r"\b(?:now|price|prices|costs?|is|are|at|to|rs|dollars?|rupees?|bucks?)\b|[₹$€£¥=]", re.I
)


@dataclass
class SavedTool:
    """A tool the instant path ran, kept in the conversation like one the model called."""

    name: str
    args: dict[str, Any]
    response: dict[str, Any]


@dataclass
class InstantResult:
    intent: str
    reply: str
    events: list[StreamEvent] = field(default_factory=list)
    tool: SavedTool | None = None


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


class IntentIndex:
    """Embeddings of the exemplar phrasings, computed once; query vectors cached (LRU)."""

    def __init__(self, embed: Embedder, size: int = 512) -> None:
        self.embed = embed
        self.size = size
        self.exemplars: list[tuple[str, list[float]]] | None = None
        self.cache: OrderedDict[str, list[float]] = OrderedDict()

    async def vector(self, text: str) -> list[float]:
        key = text.casefold().strip()
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        value = await anyio.to_thread.run_sync(self.embed, key)
        self.cache[key] = value
        if len(self.cache) > self.size:
            self.cache.popitem(last=False)
        return value

    async def match(self, text: str) -> tuple[str, float] | None:
        if self.exemplars is None:
            self.exemplars = [
                (intent, await self.vector(phrase))
                for intent, phrases in EXEMPLARS.items()
                for phrase in phrases
            ]
        query = await self.vector(text)
        best = max(
            ((intent, _cosine(query, vector)) for intent, vector in self.exemplars),
            key=lambda pair: pair[1],
            default=None,
        )
        return best if best and best[1] >= EMBED_THRESHOLD else None


def _shop(ctx: MerchantContext) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    data = ctx.store.context(ctx.uid, ctx.business_id)
    return (data["business"] or {}).get("fields", {}), data["inventory"]


def _proposal_events(ctx: MerchantContext, result: dict[str, Any]) -> list[StreamEvent]:
    proposal = ctx.proposals.get(str(result.get("proposal_id")))
    return [StreamEvent(kind="proposal", data=proposal)] if proposal else []


def _screen(ctx: MerchantContext, target: str, reply: str) -> InstantResult | None:
    result = open_screen(target)  # type: ignore[arg-type]
    card = ctx.cards.get(str(result.get("card_id")))
    if not card:
        return None
    return InstantResult(f"screen:{target}", reply, [StreamEvent(kind="action", data=card[1])])


SCREEN_REPLIES = {
    "today": "Here is what needs you today.",
    "shop": "Here is your shop page.",
    "grow": "Here are your shop tools.",
    "you": "Here are your settings.",
    "trust": "Here is your account page.",
    "games": "Choose your stamp rewards and perks here. Customer games live in the passport.",
    "share": "Here is your customer page. Share the link or show the QR code at your counter.",
    "close_day": "Let's close the day. Take a photo of today's sales book and I'll read it.",
    "google": "Here is your Get on Google checklist. You finish each step on Google's own pages.",
    "privacy": "Here is your data page. Nothing is deleted unless you confirm there.",
    "import": (
        "Pick your billing app or Excel sales file and I'll map the columns for you to confirm."
    ),
    "plan": "Here is tomorrow's plan.",
    "messages": "Here are your customer messages.",
    "stamps": "Here is your stamp card. Tell me the reward, like free chai after 8 visits.",
    "sold_out": "Here is your sold out list.",
    "menu": "Here is your menu.",
    "details": "Here are your shop details.",
    "photo": "Tap Add a photo to pick one.",
    "payments": "Here are payments and rides. You share the link; I never handle the money.",
    "supply": "Here are your purchase orders. Nothing is sent until you confirm.",
    "radar": "Here is what people nearby asked for. An idea shows once 5 different people ask.",
    "rider": "Here is Send a rider. Type the customer's address and pick a ride app; "
    "I never book or pay the rider.",
    "reminders": "Here is Remind me. Turn it on for a short nudge in the morning and evening, "
    "only when something needs you.",
}
# The same screen in the shared map (app_guide.py), so each reply also teaches the screen path.
SCREEN_FEATURE = {
    "share": "share",
    "close_day": "close_day",
    "google": "google",
    "privacy": "privacy",
    "import": "import_sales",
    "messages": "messages",
    "stamps": "stamps",
    "sold_out": "sold_out",
    "menu": "price_change",
    "details": "details",
    "payments": "payments",
    "supply": "supply",
    "games": "games",
    "playbook": "playbook",
    "connect": "connect",
    "radar": "radar",
    "rider": "rider",
    "reminders": "reminders",
}


def make_list(ctx: MerchantContext, text: str) -> InstantResult | None:
    """The make list for "how much to make?", the same in the demo, offline and live (OB-328)."""
    message = " ".join(text.split()).rstrip(" .!?।")
    if not MAKE_LIST.search(message):
        return None
    reply = "Here is how much to make." if LATIN.match(message) else "यह रहा कितना बनाना है।"
    return _screen(ctx, "make", reply)


def _read_intent(ctx: MerchantContext, intent: str) -> InstantResult | None:
    fields, inventory = _shop(ctx)
    if intent == "am_i_open":
        state = open_now(
            fields.get("hours", ""),
            shop_zone(fields),
            weekly_hours=fields.get("weekly_hours"),
            closed_on=fields.get("closed_on"),
        )
        if state is None:
            return None
        return InstantResult(
            intent,
            "Yes, customers see you as open right now."
            if state
            else "Customers see you as closed right now.",
        )
    if intent == "messages":
        found = get_customer_messages()
        waiting = [t for t in found.get("threads", []) if t["waiting_for_you"]]
        if not waiting:
            return InstantResult(intent, "No customer is waiting for a reply right now.")
        first = waiting[0]
        more = f" and {len(waiting) - 1} more" if len(waiting) > 1 else ""
        return InstantResult(
            intent,
            f'{first["customer"]} asked: "{first["last_message"]}"{more}. '
            "Tell me what to reply and I'll prepare it.",
        )
    if intent == "sold_out_list":
        gone = [p["name"] for p in inventory if not p.get("available", True)]
        return InstantResult(
            intent,
            "Sold out right now: " + ", ".join(gone) + "."
            if gone
            else "Nothing is marked sold out right now.",
        )
    if intent == "how_today":
        bid = ctx.business_id or ""
        sales = with_day_totals(ctx.store, bid, ctx.store.sales_history(ctx.uid, bid))
        reward = close_reward(sales, local_now(fields).date(), shop_currency(fields))
        return InstantResult(intent, reward_text(reward))
    if intent.startswith("screen:"):
        target = intent.split(":", 1)[1]
        reply = SCREEN_REPLIES.get(target, "Here it is.")
        if target in SCREEN_FEATURE:
            reply += " " + where_line(SCREEN_FEATURE[target])
        return _screen(ctx, target, reply)
    return None


def promise_words(lowered: str) -> str | None:
    """What to remind the owner of tomorrow, from a chat message; None when it is not one."""
    for pattern in PROMISE:
        found = pattern.match(lowered)
        if found:
            what = next(v for v in found.groupdict().values() if v)
            # "remind me tomorrow" alone has nothing to write down: the coach asks what.
            if what.strip() and not WHEN_ONLY.fullmatch(what.strip()):
                return what.strip()
    return None


def save_promise(ctx: MerchantContext, what: str) -> "Promise":
    """Write tomorrow's promise, as said. "order milk" with a Milk item on the menu gets an
    Order button tomorrow morning; the demo coach writes it the same way (S2-9)."""
    from .owner_promise import NewPromise, set_promise

    fields, inventory = _shop(ctx)
    kind: Literal["order", "make", "note"] = "note"
    item: str | None = None
    for pattern, named in ((ORDER_WORDS, "order"), (MAKE_WORDS, "make")):
        found = pattern.match(what)
        if found:
            wanted = found["item"].casefold()
            item = next(
                (str(p["name"]) for p in inventory if str(p.get("name", "")).casefold() == wanted),
                None,
            )
            if item:
                kind = "order" if named == "order" else "make"
            break
    return set_promise(
        ctx.store,
        ctx.business_id or "",
        fields,
        NewPromise(text=what, kind=kind, item=item),
        uid=ctx.uid,
    )


def _promise(ctx: MerchantContext, what: str, hindi: bool = False) -> InstantResult:
    """Write tomorrow's promise and say where it will be. The owner's words are kept as said;
    "order milk" with a Milk item on the menu gets an Order button tomorrow morning."""
    from .owner_promise import consent_current

    fields, _ = _shop(ctx)
    # Like the close screen's route (428 there): nothing is written before the current terms.
    if not fields.get("demo") and not consent_current(ctx.store, ctx.uid):
        return InstantResult(
            "promise",
            "पहले नई शर्तें स्वीकार करें। फिर मैं इसे कल के लिए लिख लूँगा।"
            if hindi
            else "Please accept the updated terms first. Then I can write this down for tomorrow.",
        )
    promise = save_promise(ctx, what)
    if hindi:
        return InstantResult(
            "promise",
            f"कल सुबह के लिए लिख लिया: “{promise.text}”। यह कोच में सबसे ऊपर दिखेगा। "
            # The Hindi UI's own labels: the कोच tab, and Grow's "Close the day" tile.
            f"यह {PROMISE_WHERE_HI} में भी है।",
        )
    return InstantResult(
        "promise",
        f'Written down for tomorrow morning: "{promise.text}". It will be at the top of Coach. '
        + where_line("promise"),
    )


def save_expense(ctx: MerchantContext, words: "ChatExpense") -> InstantResult | None:
    """ "doodh 300 ka kharcha", "paid rent 5000": written through the close screen's own
    endpoint function, and said back with where to change it. None when the amount is unclear
    (the coach asks)."""
    from fastapi import HTTPException

    from .agent import ui_language
    from .demo_coach_words import JOB_LABELS
    from .expenses import ExpenseInput, add_expense, chat_reply, shop_day
    from .owner_promise import consent_current

    fields, _ = _shop(ctx)
    hindi = not LATIN.match(words.said) or ui_language.get().split("-")[0] == "hi"
    if not fields.get("demo") and not consent_current(ctx.store, ctx.uid):
        return InstantResult(
            "expense",
            "पहले नई शर्तें स्वीकार करें। फिर मैं यह खर्चा लिख लूँगा।"
            if hindi
            else "Please accept the updated terms first. Then I can note this expense.",
        )
    day = shop_day(fields) - timedelta(days=1) if words.yesterday else None
    try:
        expense = add_expense(
            ctx.store,
            ctx.business_id or "",
            fields,
            ExpenseInput(
                amount=words.amount,
                category=words.category,
                note=words.note,
                method=words.method,
                date=day,
            ),
            source="chat",
        )
    except HTTPException:
        return None
    offer = StreamEvent(
        kind="action",
        data={
            "target": "close_day",
            "label": JOB_LABELS["close_day"][1 if hindi else 0],
            "business_id": ctx.business_id,
            "offer": True,
        },
    )
    return InstantResult(
        "expense",
        chat_reply(expense, shop_currency(fields), hindi, words.yesterday),
        [offer],
    )


def _upkeep(ctx: MerchantContext, text: str) -> InstantResult | None:
    from .agent import upkeep_call

    call = upkeep_call(text, ctx)
    if call is None:
        return None
    if not call.function_call:
        # A price said in another currency: the one question, never a card.
        return InstantResult("upkeep", call.text) if call.text else None
    items = (call.function_call.args or {})["items"]
    words = bare(text)
    if any("price" in item for item in items) and not (
        PRICE_CUE.search(text) or OWNER_PRICE_CUE.search(words) or HI_PRICE_CUE.search(words)
    ):
        return None
    result = propose_products(items)
    if result.get("status") != "needs_review":
        return None  # let the model repair or ask
    if not result.get("changes"):
        return None  # Nothing would change: "prepared: no change" helps nobody.
    if speaks_hindi(text):
        currency = shop_currency(ctx.store.context(ctx.uid, ctx.business_id)["business"])
        lines = "; ".join(
            f"{hindi_item(item['name'])} {money_text(to_minor(item['price'], currency), currency)}"
            if "price" in item
            else f"{hindi_item(item['name'])} "
            + ("फिर से उपलब्ध" if item.get("available") else "आज के लिए ख़त्म")
            for item in items
        )
        return InstantResult(
            "upkeep",
            f"मैंने यह आपके जाँचने के लिए तैयार किया है: {lines}। स्क्रीन पर पक्का करें।",
            _proposal_events(ctx, result),
        )
    changes = "; ".join(result["changes"]) or "no change"
    reply = f"I've prepared this for you to check: {changes}. Confirm it on screen."
    if result.get("warnings"):
        reply += " " + str(result["warnings"][0])
    return InstantResult("upkeep", reply, _proposal_events(ctx, result))


def _hours_reply(fields: dict[str, Any]) -> str | None:
    days = fields.get("weekly_hours") or []
    if days:
        parts = [
            f"{d['day'].title()} closed"
            if d.get("closed")
            else f"{d['day'].title()} {d['open']}-{d['close']}"
            for d in days
        ]
        return "Your hours: " + ", ".join(parts) + "."
    if fields.get("hours"):
        return f"Your hours: {fields['hours']}."
    return None


async def route(
    text: str,
    ctx: MerchantContext | None,
    index: IntentIndex | None = None,
    history: Sequence[Event] = (),
) -> InstantResult | None:
    """The instant answer for this owner message, or None to use the coach model."""
    message = " ".join(text.split())
    if not ctx or not ctx.business_id or ctx.new_shop or not message or len(message) > 200:
        return None
    # Tomorrow's promise in any script the router knows (the close screen's Hindi hint is
    # Devanagari). The owner's words keep their own case: they are shown back as written.
    promised = promise_words(message.rstrip(" .!।"))
    if promised:
        return _promise(ctx, promised, hindi=not LATIN.match(message))
    supplied = await supplier_search(ctx, message) or order_from_list(ctx, message, history)
    if supplied:
        return supplied
    made = make_list(ctx, message)
    if made:
        return made
    # An expense, said in any script: "doodh 300 ka kharcha", "किराया 5000 दिया".
    from .expenses import expense_words  # lazy: expenses imports the routes

    spent = expense_words(message)
    if spent:
        return save_expense(ctx, spent)
    if not LATIN.match(message):
        from .agent import ui_language

        # Devanagari is Hindi only when the app is not set to Marathi or another language.
        hindi = HINDI.search(message) and ui_language.get().split("-")[0] in {"en", "hi"}
        return _upkeep(ctx, message) if hindi else None
    lowered = message.casefold().rstrip(" .!")
    if CLOSED_TODAY.search(lowered) or OPEN_TODAY.search(lowered):
        result = set_open_today(open_today=bool(OPEN_TODAY.search(lowered)))
        if result.get("status") == "no_change":
            return InstantResult(
                "open_today",
                "You're already marked closed today."
                if result["closed_today"]
                else "You're already open today.",
            )
        if result.get("status") != "needs_review":
            return None
        return InstantResult(
            "open_today",
            f"I've prepared this for you to check: {result['changes'][0]}. Confirm it on screen.",
            _proposal_events(ctx, result),
        )
    upkeep = _upkeep(ctx, message)
    if upkeep:
        return upkeep
    for pattern, target in SCREEN_RULES:
        if re.search(pattern, lowered):
            return _read_intent(ctx, f"screen:{target}")
    if AM_I_OPEN.search(lowered):
        return _read_intent(ctx, "am_i_open")
    if MY_HOURS.search(lowered):
        fields, _ = _shop(ctx)
        reply = _hours_reply(fields)
        return InstantResult("hours", reply) if reply else None
    if MESSAGES.search(lowered):
        return _read_intent(ctx, "messages")
    if SOLD_OUT_LIST.search(lowered):
        return _read_intent(ctx, "sold_out_list")
    if HOW_TODAY.search(lowered):
        return _read_intent(ctx, "how_today")
    guide = guide_reply(message)
    if guide:
        return InstantResult("app_guide", guide)
    if order_asked(message):
        return None  # "Reorder milk" drafts the order: never a guess at a screen (OB-268).
    if index is not None and "?" not in message[:-1]:
        try:
            matched = await index.match(message)
        except Exception:  # noqa: BLE001 - the model path is the fallback
            return None
        if matched:
            return _read_intent(ctx, matched[0])
    return None
