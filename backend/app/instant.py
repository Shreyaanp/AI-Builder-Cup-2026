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
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import anyio

from .app_guide import guide_reply, where_line
from .contracts import StreamEvent
from .coordinator import MerchantContext, propose_products
from .discover import open_now
from .region import shop_zone
from .voice_tools import SCREENS, get_customer_messages, open_screen, set_open_today

Embedder = Callable[[str], list[float]]

# Only plain-Latin messages take the instant path: the templates reply in English, and the
# coach model handles every other language and script.
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
    (r"\bclose\s+(?:the|my)\s+day\b|\bday\s*end\b|\bend\s+of\s+(?:the\s+)?day\b", "close_day"),
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
SOLD_OUT_LIST = re.compile(r"^what(?:'s|\s+is)\s+sold\s+out\b", re.I)

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
class InstantResult:
    intent: str
    reply: str
    events: list[StreamEvent] = field(default_factory=list)


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
    "trust": "Here is your optional check. You choose whether to start it.",
    "games": "Choose your stamp rewards and perks here. Customer games live in the passport.",
    "share": "Here is your customer page. Share the link or show the QR code at your counter.",
    "close_day": "Let's close the day. Take a photo of today's sales book and I'll read it.",
    "google": "Here is your Get on Google checklist. You finish each step on Google's own pages.",
    "privacy": "Here is your data page. Nothing is deleted unless you confirm there.",
    "import": "Pick your POS or Excel sales export and I'll map the columns for you to confirm.",
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
    "trust": "face_check",
    "playbook": "playbook",
    "connect": "connect",
    "radar": "radar",
    "rider": "rider",
    "reminders": "reminders",
}


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
    if intent.startswith("screen:"):
        target = intent.split(":", 1)[1]
        reply = SCREEN_REPLIES.get(target, "Here it is.")
        if target in SCREEN_FEATURE:
            reply += " " + where_line(SCREEN_FEATURE[target])
        return _screen(ctx, target, reply)
    return None


def _upkeep(ctx: MerchantContext, text: str) -> InstantResult | None:
    from .agent import upkeep_call

    call = upkeep_call(text, ctx)
    if call is None or not call.function_call:
        return None
    items = (call.function_call.args or {})["items"]
    if any("price" in item for item in items) and not PRICE_CUE.search(text):
        return None
    result = propose_products(items)
    if result.get("status") != "needs_review":
        return None  # let the model repair or ask
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
    text: str, ctx: MerchantContext | None, index: IntentIndex | None = None
) -> InstantResult | None:
    """The instant answer for this owner message, or None to use the coach model."""
    message = " ".join(text.split())
    if not ctx or not ctx.business_id or ctx.new_shop or not message or len(message) > 200:
        return None
    if not LATIN.match(message):
        return None
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
    guide = guide_reply(message)
    if guide:
        return InstantResult("app_guide", guide)
    if index is not None and "?" not in message[:-1]:
        try:
            matched = await index.match(message)
        except Exception:  # noqa: BLE001 - the model path is the fallback
            return None
        if matched:
            return _read_intent(ctx, matched[0])
    return None
