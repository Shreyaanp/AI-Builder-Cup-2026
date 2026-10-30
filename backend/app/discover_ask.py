"""Customer AI entry: "cheap vegetarian breakfast near me" → curated, explained nearby results.

Gemini reads the request into a small structured intent (or a keyword parser does, offline). The
intent then drives ordinary, verifiable matching: Chalkboard shops by their actual menu items,
prices, facts and opening hours, plus Google places nearby. The model never invents a shop, item
or price; every result comes from a shop's own data or from Google.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from collections import Counter
from collections.abc import AsyncIterator, Callable
from datetime import datetime
from typing import Any, Literal

import anyio
import structlog
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, PrivateAttr
from sse_starlette import EventSourceResponse, ServerSentEvent

from .community import Community, Profile, stated_preferences
from .discover import (
    CATEGORIES,
    STATION_MASK,
    DiscoveryPlace,
    MapsService,
    TopItem,
    consumer_shop,
    distance,
    open_now,
)
from .gemini_schema import gemini_schema, parse_reply
from .latin_names import names_any
from .limits import client_ip, enforce_limits
from .maps_grounding import AreaAnswer, AreaGrounding, is_area_question
from .merchant import MerchantRepository
from .money import exponent
from .region import money_text, region_at, region_rule
from .reply_language import written_language
from .rescue_feed import live_rescues
from .search_engine import (
    ITEM_RECALL,
    SHOP_RECALL,
    TASTE_MIN,
    Because,
    Components,
    Relevance,
    SearchEngine,
    Taste,
    blend,
    build_engine,
    fresh_days,
    item_recall,
    popularity,
)
from .shop_time import shop_timezone, valid_timezone
from .text_model import generate, generate_stream
from .words import words as words_of

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1")

GENERIC = {"category": [k for k in CATEGORIES if k not in {"kopi", "hawker", "cafe", "café"}]}
STOP = set(
    "a an the i im i'm me my we want need looking for find some any near nearby around here "
    "please today now open cheap cheapest budget good best place places shop shops store under "
    "below less than with without and or to of in at on get buy something".split()
    # Question and money words: "Where can I get masala chai under 30 rupees?" asks for chai.
    + "where what which who how can could is are there do does sell sells have has "
    "rupee rupees rs inr dollar dollars".split()
    # Hindi filler words (a keyword search, not a translation).
    + "पास में मुझे हमें चाहिए है हैं की का के को से कम कहाँ कोई अभी यहाँ आसपास आस अच्छी "
    "अच्छा अच्छे सस्ती सस्ता सस्ते दुकान दुकानें वाली वाला वाले कुछ और खुली खुला रुपये रुपए "
    "अंदर तक".split()
)


class Intent(BaseModel):
    """What the customer asked for. Prices are in the local currency's major units."""

    summary: str = Field(default="", max_length=160)
    keywords: list[str] = Field(default_factory=list, max_length=8)
    category: str = ""
    max_price: float | None = Field(default=None, ge=0)
    halal: bool = False
    vegetarian: bool = False
    locally_made: bool = False
    open_now: bool = False
    followups: list[str] = Field(default_factory=list, max_length=3)
    # Conversation refinements: "cheaper?" → price, "closer?" → distance, "near the MRT?" →
    # transit, "any deals?" → deals. The model may set them; follow_up() always does.
    sort: Literal["best", "price", "distance"] = "best"
    near: Literal["", "transit"] = ""
    deals: bool = False
    # A question about the area itself ("parking near the market?", "what's open near the
    # metro?", "best filter coffee near me"): answered with Google Maps grounding when on.
    area: bool = False


class AskRequest(BaseModel):
    q: str = Field(min_length=1, max_length=300)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    radius: int = Field(default=4000, ge=200, le=30000)
    language: str = Field(default="en", max_length=16)
    # The previous answer's intent when this message continues the same conversation.
    context: Intent | None = None
    # A tapped follow-up chip says exactly what it refines, whatever the language of its label.
    refine: Literal["price", "distance", "transit", "open", "deals", "local"] | None = None
    # Shops opened on this device (newest first): a personal signal that never leaves the
    # customer's own request.
    opened: list[str] = Field(default_factory=list, max_length=30)


class PickDeal(BaseModel):
    """A live closing-time rescue on this shop (demo rescues are labelled)."""

    item: str
    price: int  # minor units
    was_price: int
    pickup_end: float  # epoch seconds
    demo: bool = False


class Pick(DiscoveryPlace):
    matched: list[TopItem] = []
    score: float = 0
    # Why a signed-in customer sees this "For you": followed, vegetarian, halal, budget.
    reasons: list[str] = []
    deal: PickDeal | None = None
    # The strongest of the customer's own signals behind a personal pick, and (top few, when
    # Gemini runs) the same reason as one written line.
    because: Because | None = None
    why: str | None = None
    _components: Components = PrivateAttr(default_factory=Components)
    # How directly this shop answers the words asked (0: an item named for them; 1: an item close
    # in meaning, or the shop's name or kind; 2: the shop as a whole is close in meaning). Every
    # ordering ranks by it first: "cheapest" and "nearest" never put a weaker match on top.
    _tier: int = PrivateAttr(default=0)
    # Its headline price answers the question (a matched item, or any item when no words).
    _priced: bool = PrivateAttr(default=True)


class Anchor(BaseModel):
    """The station a "near the MRT" follow-up measured from (demo map data offline)."""

    name: str
    lat: float
    lng: float
    demo: bool = False


class Group(BaseModel):
    id: Literal["for_you", "best", "open", "more"]
    places: list[Pick]


class Personal(BaseModel):
    """What the signed-in customer's profile changed: never applied when signed out."""

    applied: list[str] = []
    saved: list[str] = []


class Command(BaseModel):
    """A customer command answered at once, by voice or text: my stamps, directions to a shop,
    follow a shop, ask a shop's owner. Following and asking still happen on the shop's page."""

    kind: Literal["my_stamps", "directions", "follow", "ask_owner"]
    shop_id: str | None = None
    shop_name: str | None = None
    maps_url: str | None = None
    question: str | None = None


class AskResponse(BaseModel):
    intent: Intent
    mode: Literal["ai", "keywords", "command"]
    groups: list[Group]
    personal: Personal | None = None
    anchor: Anchor | None = None
    command: Command | None = None
    # Google's live local answer for an area question (None when the question is not one).
    area: AreaAnswer | None = None
    # Which embeddings ranked by meaning: Vertex AI, or the offline fixture.
    engine: Literal["vertex", "fixture"] = "fixture"


COMMANDS = (
    (
        re.compile(
            r"^(?:show|open|see|check)?\s*(?:me\s+)?my\s+(?:stamps?|passport|rewards?)\b", re.I
        ),
        "my_stamps",
    ),
    (
        re.compile(
            r"^(?:get\s+|give\s+me\s+|show\s+)?(?:directions|the\s+way|route)\s+to\s+(?P<shop>.+)$"
            r"|^(?:take|navigate)\s+(?:me\s+)?to\s+(?P<shop2>.+)$",
            re.I,
        ),
        "directions",
    ),
    (re.compile(r"^follow\s+(?P<shop>.+)$", re.I), "follow"),
    (
        re.compile(
            r"^ask\s+(?:the\s+owner\s+of\s+)?(?P<shop>.+?)\s+"
            r"(?P<question>(?:if|whether|about|for|do|does|are|is|when)\b.+)$",
            re.I,
        ),
        "ask_owner",
    ),
)


def customer_command(
    q: str, shops: list[dict[str, Any]], lat: float, lng: float, radius: int
) -> Command | None:
    """A recognised command with its shop resolved by name (nearest first), else None."""
    text = " ".join(q.split()).rstrip(" ?.!")
    for pattern, kind in COMMANDS:
        found = pattern.search(text)
        if not found:
            continue
        if kind == "my_stamps":
            return Command(kind="my_stamps")
        groups = found.groupdict()
        name = (groups.get("shop") or groups.get("shop2") or "").strip().casefold()
        name = re.sub(r"^(?:the\s+)", "", name)
        nearby = sorted(
            (
                shop
                for shop in shops
                if shop.get("lat") is not None
                and shop.get("lng") is not None
                and distance(lat, lng, shop["lat"], shop["lng"]) <= max(radius, 10_000)
                and name
                and (name in shop["name"].casefold() or shop["name"].casefold() in name)
            ),
            key=lambda shop: distance(lat, lng, shop["lat"], shop["lng"]),
        )
        if not nearby:
            return None
        shop = nearby[0]
        return Command(
            kind=kind,  # type: ignore[arg-type]
            shop_id=shop["id"],
            shop_name=shop["name"],
            maps_url=(
                "https://www.google.com/maps/dir/?api=1&travelmode=walking&destination="
                f"{shop['lat']},{shop['lng']}"
            )
            if kind == "directions"
            else None,
            question=(groups.get("question") or "")[:300] or None,
        )
    return None


def personal_reasons(shop: dict[str, Any], pick: Pick, profile: Profile) -> list[str]:
    prefs = profile.preferences
    facts = shop.get("facts") or {}
    reasons = []
    if shop["id"] in profile.follows:
        reasons.append("followed")
    if prefs.vegetarian and facts.get("vegetarian_options"):
        reasons.append("vegetarian")
    if prefs.halal and facts.get("halal") in {"yes", "muslim_owned"}:
        reasons.append("halal")
    if prefs.budget is not None:
        limit = round(prefs.budget * 10 ** exponent(shop["currency"]))
        if any(p.price <= limit for p in (pick.matched or pick.items)):
            reasons.append("budget")
    return reasons


async def customer_profile(request: Request, q: str) -> tuple[Profile | None, list[str]]:
    """Signed-in customers: save stated preferences and the search, then personalise."""
    community: Community | None = getattr(request.app.state, "community", None)
    if community is None:
        return None, []
    try:
        principal = await request.app.state.services.identity.customer(request)
    except HTTPException:
        principal = None
    if principal is None:
        return None, []
    stated = stated_preferences(q)
    if stated:
        await anyio.to_thread.run_sync(community.set_preferences, principal.uid, stated)
    profile = await anyio.to_thread.run_sync(community.remember_search, principal.uid, q)
    return profile, sorted(stated)


PROMPT = """You turn a customer's request into a search for nearby local shops.
Reply in JSON matching the schema. Rules:
- keywords: 1-6 short product or shop words in English AND in the customer's own words if
  different (e.g. "kopi", "coffee"). Singular nouns. No filler words.
- category: one of {categories} or "".
- max_price: a number only if the customer gave a budget ("under 100", "cheap" → null).
- halal / vegetarian / open_now: true only if asked.
- locally_made: true only if they want home-made, handmade, made in-house or local makers.
- summary: one short friendly line, in {language}, restating what you will look for.
- followups: up to 3 short refinements in {language} (e.g. "Open now", "Under {under}").
- sort: "price" if they want it cheaper, "distance" if closer; near: "transit" if they want it
  near a train/metro/MRT station; deals: true if they ask for deals or discounts.
- area: true if they ask about the area itself (parking, toilets, what is open around, how to
  get somewhere, the best places nearby), not only for a product.
{region}
{context}Request: {q}"""


def ask_region(lat: float, lng: float) -> dict[str, str]:
    """The customer's region for the Ask prompt: its money and examples (never S$ in India)."""
    region = region_at(lat, lng)
    budget = round(region.ask_budget * 10 ** exponent(region.currency))
    return {"region": region_rule(region), "under": money_text(budget, region.currency)}


CONTEXT = """This message continues a conversation. The earlier search was (JSON): {intent}
If the new request only refines it ("cheaper?", "open now?", "near the MRT?"), keep its keywords,
category and filters and add the refinement. If it asks for something new, start a new search but
keep dietary needs (halal, vegetarian).
"""

# Follow-up refinements, in English and the common words of the supported languages.
CHEAPER = re.compile(
    r"\b(cheaper|cheapest|less expensive|lower price|more affordable|budget|cheap)\b"
    r"|सस्ता|सस्ते|सस्ती|更便宜|便宜|murah|より安い|安い|더 싼|ถูกกว่า|rẻ hơn|mas mura|மலிவ"
)
CLOSER = re.compile(
    r"\b(closer|nearer|nearest|closest|walking distance|walkable)\b|पास में|更近|近く|더 가까"
)
# "Coffee near me": nearest first, unless the customer also asked for it cheaper ("cheap
# breakfast near me" stays cheapest first; "near me" there only says where).
NEARBY = re.compile(r"\b(near me|nearby|close by)\b|आसपास")
TRANSIT = re.compile(r"\b(mrt|lrt|bts|mtr|metro|subway|station|train)\b|मेट्रो|地铁|駅|역|สถานี")
OPEN = re.compile(r"\b(open now|open|still open|right now)\b|अभी खुल|营业|buka|営業|영업|เปิด|mở")
DEALS = re.compile(
    r"\b(deals?|discounts?|offers?|rescue|on sale|sale)\b|ऑफ़र|छूट|优惠|割引|할인|ส่วนลด"
)
REFINEMENT_WORDS = {
    *("cheaper", "cheapest", "expensive", "lower", "price", "affordable", "closer", "nearer"),
    *("nearest", "walking", "distance", "walkable", "mrt", "lrt", "bts", "mtr", "metro"),
    *("subway", "station", "train", "still", "deal", "deals", "discount", "discounts", "offer"),
    *("offers", "rescue", "sale", "what", "about", "how", "more", "less", "only", "just", "one"),
    *("ones", "those", "these", "them", "that", "it", "is", "are", "there", "also", "too"),
}


def follow_up(q: str, previous: Intent, parsed: Intent) -> Intent:
    """Merge a follow-up message into the previous search ("cheaper?" keeps "kopi")."""
    text = q.casefold()
    subject = [k for k in parsed.keywords if k.casefold() not in REFINEMENT_WORDS]
    if subject and subject != previous.keywords:
        # Something new ("and bread?"): a new subject, still with the earlier dietary needs.
        merged = parsed.model_copy(update={"keywords": subject})
    else:
        merged = previous.model_copy(
            update={"summary": parsed.summary or previous.summary, "followups": parsed.followups}
        )
        if parsed.max_price is not None:
            merged.max_price = parsed.max_price
        merged.open_now = previous.open_now or parsed.open_now
        merged.locally_made = previous.locally_made or parsed.locally_made
        merged.sort = parsed.sort if parsed.sort != "best" else previous.sort
        merged.near = parsed.near or previous.near
        merged.deals = previous.deals or parsed.deals
    merged.halal = previous.halal or parsed.halal
    merged.vegetarian = previous.vegetarian or parsed.vegetarian
    if OPEN.search(text):
        merged.open_now = True
    return refine(text, merged)


def refine(text: str, intent: Intent) -> Intent:
    """Ordering and place refinements any message can carry ("cheapest coffee near the MRT")."""
    if CHEAPER.search(text):
        intent.sort = "price"
    if CLOSER.search(text):
        intent.sort = "distance"
    elif NEARBY.search(text) and intent.sort == "best":
        intent.sort = "distance"
    if TRANSIT.search(text):
        intent.near = "transit"
    if DEALS.search(text):
        intent.deals = True
    return intent


# Offline station positions (approximate public coordinates) for the demo neighbourhoods; live
# requests ask Google Places for the nearest station instead.
STATIONS = [
    ("Tiong Bahru MRT", 1.28618, 103.82696),
    ("Outram Park MRT", 1.28025, 103.83946),
    ("Orchard MRT", 1.30406, 103.83214),
    ("Tampines MRT", 1.35459, 103.94515),
    ("Jurong East MRT", 1.33315, 103.7422),
    ("Toa Payoh MRT", 1.33256, 103.84731),
    ("Indiranagar Metro", 12.97837, 77.63855),
    ("Hauz Khas Metro", 28.54343, 77.20659),
    ("Bangsar LRT", 3.12765, 101.67907),
]
STATION_TYPES = {"subway_station", "train_station", "transit_station", "light_rail_station"}


async def nearest_station(maps: MapsService, lat: float, lng: float) -> Anchor | None:
    if maps.demo:
        near = min(STATIONS, key=lambda s: distance(lat, lng, s[1], s[2]))
        if distance(lat, lng, near[1], near[2]) > 2500:
            return None
        return Anchor(name=near[0], lat=near[1], lng=near[2], demo=True)
    try:
        rows = await maps.places(lat, lng, 2000, "metro train station", "", STATION_MASK)
    except HTTPException:
        return None
    for row in rows:
        if row.get("primaryType") in STATION_TYPES:
            point = row["location"]
            return Anchor(
                name=row["displayName"]["text"], lat=point["latitude"], lng=point["longitude"]
            )
    return None


PRICE_LEVELS = {
    "PRICE_LEVEL_FREE": 0,
    "PRICE_LEVEL_INEXPENSIVE": 1,
    "PRICE_LEVEL_MODERATE": 2,
    "PRICE_LEVEL_EXPENSIVE": 3,
    "PRICE_LEVEL_VERY_EXPENSIVE": 4,
}


def min_price(pick: Pick) -> int:
    """The card/map headline price; a separate rescue must not change its ordering."""
    return next((p.price for p in (pick.matched or pick.items) if p.available), 1 << 40)


def ranking(intent: Intent, anchor: Anchor | None) -> Callable[[Pick], tuple[float, ...]]:
    """Relevance first, then the best match, unless the conversation asked for cheaper or closer.

    "Cheapest masala chai" orders the shops that sell chai by the chai's price; a shop matched
    only loosely (or without a priced match) never wins on the price of something else."""
    if intent.sort == "price":
        return lambda p: (
            p._tier,
            0 if p._priced else 1,
            min_price(p) if p._priced else 0,
            p.distance_m,
        )
    if intent.sort == "distance" or anchor is not None:
        return lambda p: (p._tier, p.distance_m, -p.score)
    return lambda p: (p._tier, -p.score, p.distance_m)


def asks_for_something(intent: Intent) -> bool:
    """A subject (words or a kind of shop) or a filter to list by ("open now", "deals"). Without
    either (a query that reads as nothing, e.g. "asdkjh qwe"), the honest answer is no match."""
    return bool(
        intent.keywords
        or intent.category
        or intent.max_price is not None
        or intent.open_now
        or intent.deals
        or intent.locally_made
        or intent.vegetarian
        or intent.halal
        or intent.near
        or intent.sort != "best"
    )


def literal_anchor(shops: list[dict[str, Any]], words: list[str]) -> bool:
    """Whether any shop here names what was asked: an available item, or its name or kind.

    Meaning alone ranks loosely (unrelated texts still score well with real embeddings), so a
    search nothing here names keeps the strict meaning thresholds: "pharmacy" never matches salt.
    """
    if not words:
        return False
    for shop in shops:
        shop_text = f"{shop['name']} {shop['category']}".casefold()
        if any(word.casefold() in shop_text for word in words if word):
            return True
        if names_any(words, shop["name"]):
            return True
        if any(p["available"] and item_matches(p, words) for p in shop["products"]):
            return True
    return False


LOCALLY_MADE = re.compile(
    r"\b(locally[ -]made|local makers?|home[ -]?made|hand[ -]?made"
    r"|made (?:here|in[ -]house)|artisan)\b"
)
DIET_AND_ORIGIN_WORDS = {
    *("halal", "vegetarian", "veg", "vegan", "locally", "local", "made", "homemade"),
    *("home", "handmade", "hand", "artisan", "makers", "maker", "house"),
    *("हलाल", "शाकाहारी", "घर", "बना", "बनी", "हाथ"),
}


def keyword_intent(q: str) -> Intent:
    """Offline and fallback parsing: deterministic, no model."""
    text = q.casefold()
    budget = re.search(r"(?:under|below|less than|max|<)\s*\D{0,3}(\d+(?:[.,]\d+)?)", text)
    budget = budget or re.search(r"(\d+(?:[.,]\d+)?)\s*(?:₹|रुपये|रुपए|रु)?\s*(?:से कम|के अंदर|तक)", text)
    # A number is the budget ("under 30"), never a word to match.
    words = [w for w in words_of(text) if w not in STOP and len(w) > 1 and not w.isdigit()]
    if re.search(r"egg[ -]?free|without eggs?|बिना अंडे", text):
        words.insert(0, "eggless")
    category = next(
        (key for key in GENERIC["category"] if any(term in text for term in CATEGORIES[key][1])),
        "",
    )
    return Intent(
        summary=q.strip()[:160],
        keywords=[w for w in words if w not in DIET_AND_ORIGIN_WORDS][:6],
        category=category,
        max_price=float(budget.group(1).replace(",", ".")) if budget else None,
        halal="halal" in text or "हलाल" in text,
        vegetarian=bool(re.search(r"\b(veg|vegetarian|vegan)\b|शाकाहारी", text)),
        locally_made=bool(LOCALLY_MADE.search(text)),
        open_now=bool(re.search(r"\b(open now|right now|now)\b|अभी खुल", text)),
        sort="price" if CHEAPER.search(text) else "best",
    )


async def ai_intent(request: Request, body: AskRequest) -> Intent | None:
    settings = request.app.state.v1_settings
    if settings.coach_mode != "gemini":
        return None
    from google import genai
    from google.genai import types

    client = getattr(request.app.state, "ask_genai", None)
    if client is None:
        client = (
            genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.google_cloud_location,
            )
            if settings.gemini_backend == "vertex"
            else genai.Client(api_key=settings.google_api_key.get_secret_value())
        )
        request.app.state.ask_genai = client
    try:
        with anyio.fail_after(8):
            response = await generate(
                client,
                settings,
                "search",
                contents=PROMPT.format(
                    categories=", ".join(GENERIC["category"]),
                    language=written_language(body.language),
                    **ask_region(body.lat, body.lng),
                    context=(
                        CONTEXT.format(intent=body.context.model_dump_json(exclude={"followups"}))
                        if body.context
                        else ""
                    ),
                    q=body.q,
                ),
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=gemini_schema(Intent),
                    temperature=0,
                    max_output_tokens=800,
                    # Room for Hindi (Indic scripts cost more tokens); no thinking.
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
    except Exception:  # noqa: BLE001 - the keyword parser is always a correct fallback
        log.warning("ask_intent_unavailable")
        return None
    parsed = parse_reply(Intent, response)
    return parsed if isinstance(parsed, Intent) else None


def item_matches(item: dict[str, Any], words: list[str]) -> bool:
    text = f"{item.get('name', '')} {item.get('category', '')}".casefold()
    return any(
        word.casefold() in text or text in word.casefold() for word in words if word
    ) or names_any(words, str(item.get("name") or ""))


def search_engine(request: Request) -> SearchEngine:
    engine: SearchEngine | None = getattr(request.app.state, "search", None)
    if engine is None:
        engine = build_engine(request.app.state.v1_settings, None)
        request.app.state.search = engine
    return engine


def shop_pick(
    shop: dict[str, Any],
    intent: Intent,
    lat: float,
    lng: float,
    meaning: Relevance | None = None,
    recall: float = ITEM_RECALL,
    shop_recall: float = SHOP_RECALL,
) -> Pick | None:
    """Match a shared Chalkboard shop against the intent using only its own data: its words
    first, then (search engine) its meaning. Filters are never relaxed by meaning."""
    facts = shop.get("facts") or {}
    if intent.halal and facts.get("halal") not in {"yes", "muslim_owned"}:
        return None
    if intent.vegetarian and not facts.get("vegetarian_options"):
        return None
    if intent.locally_made and not facts.get("locally_made"):
        return None
    is_open = open_now(
        shop["hours"],
        shop["timezone"],
        weekly_hours=shop.get("weekly_hours"),
        closed_on=shop.get("closed_on"),
    )
    if intent.open_now and is_open is False:
        return None
    limit = (
        round(intent.max_price * 10 ** exponent(shop["currency"]))
        if intent.max_price is not None
        else None
    )
    words = intent.keywords
    meaning = meaning or Relevance()
    products = [p for p in shop["products"] if p["available"]]
    matched = [p for p in products if item_matches(p, words)] if words else []
    by_words = bool(matched)
    if words:
        # Include synonyms even alongside literal matches (bread: loaf AND croissant).
        matched.extend(
            p for p in products if p not in matched and meaning.items.get(p["name"], 0.0) >= recall
        )
    if limit is not None:
        matched = (
            [p for p in matched if p["price"] <= limit]
            if words
            else [p for p in products if p["price"] <= limit]
        )
    # The headline is the cheapest item named for what was asked ("cake": the chocolate cake, never
    # a cheaper cookie close in meaning); else the cheapest close match (bread: the croissant).
    # Chosen before capping the menu.
    named = {p["name"] for p in matched if item_matches({"name": p["name"]}, words)}
    matched.sort(key=lambda p: (p["name"] not in named, p["price"]))
    if intent.sort == "price":
        products.sort(key=lambda p: p["price"])
    shop_text = f"{shop['name']} {shop['category']}".casefold()
    category_hit = bool(intent.category) and any(
        term in shop_text for term in CATEGORIES.get(intent.category, ((), ()))[1]
    )
    # 'chinku jiya' names 'चिंकू जिया': a name in any script is also found by its sound (OB-170).
    name_hit = any(word.casefold() in shop_text for word in words) or names_any(words, shop["name"])
    # A shop close in meaning counts only without a budget (a budget needs a priced item).
    meaning_hit = limit is None and meaning.shop >= shop_recall
    if words and not (matched or name_hit or category_hit or meaning_hit):
        return None
    if not words and intent.category and not category_hit:
        return None
    d = distance(lat, lng, shop["lat"], shop["lng"])
    components = Components(
        semantic=meaning.best,
        keyword=(1.0 if by_words else 0.6 if name_hit or category_hit else 0.0) if words else 0.5,
        distance_m=d,
        open_now=is_open,
        price_fit=1.0 if limit is not None and matched else None,
        fresh_days=fresh_days(shop.get("last_confirmed")),
    )
    pick = Pick(
        id=shop["id"],
        name=shop["name"],
        source="chalkboard",
        demo=bool(shop.get("pin_demo")),
        demo_shop=bool(shop.get("demo")),
        category=shop["category"],
        lat=shop["lat"],
        lng=shop["lng"],
        distance_m=d,
        open_now=is_open,
        currency=shop["currency"],
        photo_url=(
            f"/api/v1/public/shops/{shop['id']}/photos/{shop['gallery'][0]}.jpg"
            if shop.get("gallery")
            else None
        ),
        items=[
            TopItem(**p) for p in (products if intent.sort == "price" else shop["products"])[:3]
        ],
        sold_out=[p["name"] for p in shop["products"] if not p["available"]],
        halal=facts.get("halal") in {"yes", "muslim_owned"} if facts.get("halal") else None,
        locally_made=bool(facts.get("locally_made")),
        matched=[TopItem(**p) for p in (matched or [])[:3]],
        score=blend(components),
    )
    pick._components = components
    pick._tier = 0 if not words or by_words else 1 if matched or name_hit or category_hit else 2
    pick._priced = bool(matched) or not words
    return pick


async def customer_taste(request: Request, body: AskRequest, profile: Profile | None) -> Taste:
    """This customer's own signals: follows (saved), searches, stamps, shops opened here."""
    taste = Taste(opened=[i[:120] for i in body.opened][:30])
    if profile is None:
        return taste
    taste.follows = profile.follows[:200]
    # The current search is not a past one.
    taste.asked = [s.q for s in profile.searches if s.q != body.q][:20]
    try:
        principal = await request.app.state.services.identity.customer(request)
        if principal is not None:
            from .passport_routes import passports

            state = await anyio.to_thread.run_sync(passports(request).get, principal.uid)
            taste.stamped = {bid: max(1, p.visits) for bid, p in state.shops.items()}
    except Exception:  # noqa: BLE001 - stamps only refine ranking
        log.warning("ask_stamps_unavailable")
    return taste


async def ai_intent_stream(request: Request, body: AskRequest) -> AsyncIterator[str | Intent]:
    settings = request.app.state.v1_settings
    if settings.coach_mode != "gemini":
        return
    from google import genai
    from google.genai import types

    client = getattr(request.app.state, "ask_genai", None)
    if client is None:
        client = (
            genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.google_cloud_location,
            )
            if settings.gemini_backend == "vertex"
            else genai.Client(api_key=settings.google_api_key.get_secret_value())
        )
        request.app.state.ask_genai = client
    full_text = ""
    last_word_count = 0
    try:
        with anyio.fail_after(8):
            stream = generate_stream(
                client,
                settings,
                "search",
                contents=PROMPT.format(
                    categories=", ".join(GENERIC["category"]),
                    language=written_language(body.language),
                    **ask_region(body.lat, body.lng),
                    context=(
                        CONTEXT.format(intent=body.context.model_dump_json(exclude={"followups"}))
                        if body.context
                        else ""
                    ),
                    q=body.q,
                ),
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=gemini_schema(Intent),
                    temperature=0,
                    max_output_tokens=800,
                    # Room for Hindi (Indic scripts cost more tokens); no thinking.
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
            async for chunk in stream:
                if chunk.text:
                    full_text += chunk.text
                    match = re.search(r'"summary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)', full_text)
                    if match:
                        summary_text = match.group(1).replace(r"\"", '"').replace(r"\n", " ")
                        words = summary_text.split()
                        if len(words) > last_word_count:
                            for w in words[last_word_count:]:
                                yield w + " "
                            last_word_count = len(words)
    except Exception:
        log.warning("ask_intent_stream_unavailable")
        return
    parsed = parse_reply(Intent, full_text)
    if isinstance(parsed, Intent):
        yield parsed


def resolve_intent_refinements(body: AskRequest, raw_intent: Intent) -> Intent:
    intent = raw_intent
    # A chip says exactly what it refines (body.refine). Its label ("Open now nearby", in any
    # language) is never a new subject and never re-read for other refinements: tapping "Open
    # now nearby" after "cheapest masala chai" keeps cheapest first.
    text = "" if body.refine else body.q
    if body.refine:
        intent = intent.model_copy(
            update={"keywords": [], "category": "", "sort": "best", "near": "", "deals": False}
        )
    intent = (
        follow_up(text, body.context, intent) if body.context else refine(text.casefold(), intent)
    )
    if body.refine in {"price", "distance"}:
        intent.sort = "price" if body.refine == "price" else "distance"
    elif body.refine == "transit":
        intent.near = "transit"
    elif body.refine == "open":
        intent.open_now = True
    elif body.refine == "deals":
        intent.deals = True
    elif body.refine == "local":
        intent.locally_made = True
    if intent.category not in CATEGORIES:
        intent.category = ""
    return intent


async def explain_picks(engine: SearchEngine, for_you: list[Pick], language: str) -> None:
    """The top personal picks' reasons as one written line each (when Gemini runs)."""
    if engine.explainer is None or not any(p.because for p in for_you):
        return
    lines = await engine.explainer.explain(
        [(p.id, p.name, p.because) for p in for_you if p.because], language
    )
    for pick in for_you:
        pick.why = lines.get(pick.id)


def norm_name(name: str) -> str:
    """One shop seeded as both "(Tour)" and "(Demo)" is still one shop."""
    return re.sub(r"\s*\((Tour|Demo)\)$", "", name, flags=re.I).strip().casefold()


async def match_local_shops(
    request: Request,
    body: AskRequest,
    intent: Intent,
    anchor: Anchor | None,
    lat: float,
    lng: float,
    radius: int,
    repository: MerchantRepository | None,
    explain: bool = True,
    shared: list[dict[str, Any]] | None = None,
) -> tuple[list[Pick], list[Pick], Personal | None, list[dict[str, Any]]]:
    """Our shops for this intent, ranked by the search engine. The instant answer skips the
    written "why" lines (a Gemini call) so it is never held up by them."""
    if shared is not None:
        shops = shared
    else:
        shops = await anyio.to_thread.run_sync(repository.shared_shops) if repository else []
    in_sg = 1.15 <= lat <= 1.48 and 103.6 <= lng <= 104.1
    in_india = 6.5 <= lat <= 37.5 and 68.0 <= lng <= 97.5
    reachable: list[dict[str, Any]] = []
    for shop in shops:
        if shop["lat"] is None or shop["lng"] is None:
            continue
        # Wholesalers sell to shops (sourcing), never in a customer's answer.
        if not consumer_shop(shop):
            continue
        # Singapore demo shops only when browsing Singapore
        is_sg_shop = shop.get("demo") and (
            shop.get("city") == "singapore"
            or (
                shop.get("currency") == "SGD"
                and 1.15 <= shop["lat"] <= 1.48
                and 103.6 <= shop["lng"] <= 104.1
            )
        )
        if is_sg_shop and not in_sg:
            continue
        # Results near an Indian location never show SGD
        if in_india and shop.get("currency") == "SGD":
            continue
        # Results near a Singapore location never show INR
        if in_sg and shop.get("currency") == "INR":
            continue
        if distance(lat, lng, shop["lat"], shop["lng"]) > radius:
            continue
        reachable.append(shop)
    if not asks_for_something(intent):
        reachable = []
    engine = search_engine(request)
    wanted = " ".join(intent.keywords) or (body.q if not body.refine else "")
    meaning = await anyio.to_thread.run_sync(engine.relevance, wanted, reachable) if wanted else {}
    # Items a little below the usual bar count only beside a real match nearby (bread: the
    # croissant next to the loaf). With nothing here named for the words, meaning must be strong.
    anchored = literal_anchor(reachable, intent.keywords)
    recall = item_recall(meaning) if anchored else ITEM_RECALL
    shop_recall = SHOP_RECALL if anchored else max(SHOP_RECALL, ITEM_RECALL)
    picks: list[Pick] = []
    seen_pick_names: set[str] = set()
    for shop in reachable:
        pick = shop_pick(shop, intent, lat, lng, meaning.get(shop["id"]), recall, shop_recall)
        if pick is None:
            continue
        base_name = norm_name(pick.name)
        if base_name in seen_pick_names:
            continue
        seen_pick_names.add(base_name)
        picks.append(pick)
    try:
        rescues = await live_rescues(request, shops, lat, lng, time.time())
    except Exception:  # noqa: BLE001 - deals decorate results; they never block them
        log.warning("ask_rescues_unavailable")
        rescues = []
    by_shop = {deal.shop_id: deal for deal in rescues}
    for pick in picks:
        if (deal := by_shop.get(pick.id)) is not None:
            pick.deal = PickDeal(
                item=deal.item,
                price=deal.price,
                was_price=deal.was_price,
                pickup_end=deal.pickup_end,
                demo=deal.demo,
            )
            pick._components.deal = True
    if intent.deals:
        picks = [p for p in picks if p.deal]
    profile, saved = await customer_profile(request, body.q)
    personal: Personal | None = None
    for_you: list[Pick] = []
    by_id = {shop["id"]: shop for shop in shops}
    taste = await customer_taste(request, body, profile)
    affinity = (
        await anyio.to_thread.run_sync(engine.personal, [by_id[p.id] for p in picks], taste, shops)
        if picks and not taste.empty
        else {}
    )
    for pick in picks:
        if profile is not None:
            pick.reasons = personal_reasons(by_id[pick.id], pick, profile)
        value, because = affinity.get(pick.id, (0.0, None))
        if because is not None and value >= TASTE_MIN:
            pick.because = because
            if because.shop_id and not because.shop:
                because.shop = pick.name
        pick._components.personal = max(value, min(1.0, 0.3 * len(pick.reasons)))
        pick.score = blend(pick._components)
    for_you = sorted(
        (p for p in picks if p.reasons or p.because), key=lambda p: (-p.score, p.distance_m)
    )
    if explain:
        await explain_picks(engine, for_you, body.language)
    if profile is not None:
        prefs = profile.preferences
        personal = Personal(
            applied=[
                name
                for name, on in (
                    ("vegetarian", prefs.vegetarian),
                    ("halal", prefs.halal),
                    ("budget", prefs.budget is not None),
                    ("followed", bool(profile.follows)),
                )
                if on
            ],
            saved=saved,
        )
    picks.sort(key=ranking(intent, anchor))
    for_you.sort(key=ranking(intent, anchor))
    if intent.sort == "price":
        # Cheapest first applies to the whole list, including personal picks.
        for_you = []
    return picks, for_you, personal, shops


async def query_google_places(
    maps: MapsService,
    intent: Intent,
    lat: float,
    lng: float,
    radius: int,
    query_text: str,
    anchor: Anchor | None = None,
) -> list[Pick]:
    query = " ".join(intent.keywords) or query_text
    try:
        google = (
            []
            if intent.deals or not asks_for_something(intent)
            else await maps.places(lat, lng, radius, query, intent.category)
        )
    except HTTPException:
        google = []
    others: list[Pick] = []
    for row in google:
        point = row["location"]
        d = distance(lat, lng, point["latitude"], point["longitude"])
        if d > radius:
            continue
        is_open = row.get("currentOpeningHours", {}).get("openNow")
        if intent.open_now and is_open is False:
            continue
        photo_url, authors = maps.photos.describe(row)
        # Google's rating and review count rank live results only; they are never stored.
        google_score = blend(
            Components(
                keyword=0.5,
                distance_m=d,
                open_now=is_open,
                popularity=popularity(row.get("rating"), row.get("userRatingCount")),
            )
        )
        others.append(
            Pick(
                id=row["id"],
                name=row["displayName"]["text"],
                source="google",
                demo=maps.demo,
                items=[],
                sold_out=[],
                category=row.get("primaryType", ""),
                lat=point["latitude"],
                lng=point["longitude"],
                distance_m=d,
                open_now=is_open,
                rating=row.get("rating"),
                user_rating_count=row.get("userRatingCount"),
                price_level=row.get("priceLevel"),
                google_maps_uri=row.get("googleMapsUri"),
                photo_url=photo_url,
                photo_authors=authors,
                score=google_score,
            )
        )
    others.sort(
        key=lambda p: (
            (PRICE_LEVELS.get(p.price_level or "", 9), p.distance_m)
            if intent.sort == "price"
            else (p.distance_m, 0)
            if intent.sort == "distance" or anchor is not None
            else (-p.score, p.distance_m)
        )
    )
    return others


async def localize_picks(
    request: Request, language: str, groups: list[Group], wait: bool
) -> list[Group]:
    """Chalkboard shops' categories in the customer's language: one batch for all of them.

    The instant answer never waits (glossary and cache only); the complete one waits briefly.
    Copies, so the shared picks keep their source words for the next step.
    """
    translator = getattr(request.app.state, "shop_translator", None)
    picks = [p for g in groups for p in g.places if p.source == "chalkboard" and p.category]
    if translator is None or not picks:
        return groups
    found = await translator.translate(
        language, {p.id: [p.category] for p in picks}, **({} if wait else {"wait": 0})
    )

    def local(pick: Pick) -> Pick:
        word = (
            found.get(pick.id, {}).get(pick.category.strip())
            if pick.source == "chalkboard"
            else None
        )
        return pick.model_copy(update={"category": word}) if word else pick

    return [g.model_copy(update={"places": [local(p) for p in g.places]}) for g in groups]


def assemble_groups(for_you: list[Pick], picks: list[Pick], others: list[Pick]) -> list[Group]:
    shown_ids = {p.id for p in for_you[:6]}
    shown_names = {norm_name(p.name) for p in for_you[:6]}
    best: list[Pick] = []
    for p in picks:
        name_key = norm_name(p.name)
        if p.id in shown_ids or name_key in shown_names:
            continue
        best.append(p)
        shown_names.add(name_key)
        if len(best) >= 8:
            break
    groups = [
        Group(id="for_you", places=for_you[:6]),
        Group(id="best", places=best),
        Group(id="open", places=[p for p in others if p.open_now][:10]),
        Group(id="more", places=[p for p in others if not p.open_now][:10]),
    ]
    return [g for g in groups if g.places]


async def area_answer(
    request: Request, body: AskRequest, intent: Intent, maps: MapsService
) -> AreaAnswer | None:
    """Area questions get Google's live local knowledge, once per question (refinements reuse
    the earlier answer on screen). Our shops stay first for products they sell."""
    refinement = body.refine is not None or (
        body.context is not None and intent.keywords == body.context.keywords
    )
    if refinement or not (intent.area or is_area_question(body.q)):
        return None
    intent.area = True
    grounding: AreaGrounding = getattr(request.app.state, "grounding", None) or AreaGrounding(
        request.app.state.v1_settings
    )
    return await grounding.answer(body.q, body.lat, body.lng, body.language, maps)


async def record_demand(
    request: Request,
    repository: MerchantRepository | None,
    maps: MapsService,
    intent: Intent,
    body: AskRequest,
    shops: list[dict[str, Any]],
    others: list[Pick],
) -> None:
    is_owner = False
    if repository is not None:
        try:
            principal = await request.app.state.services.identity.require(request)
            is_owner = bool(
                await anyio.to_thread.run_sync(repository.list_businesses, principal.uid)
            )
        except HTTPException:
            pass
    if repository is not None and not is_owner:
        from .demand import capture
        from .demand_terms import inferred_category, normalise

        timezone = valid_timezone(request.headers.get("x-client-timezone")) or "UTC"
        try:
            for term in normalise(intent.keywords):
                words = " ".join(reversed(term.split("|")))
                # The radar always covers 2 km and the entire menu, independently of the
                # requested discovery radius and the three matches shown on a result card.
                matched = sum(
                    1
                    for shop in shops
                    if not shop.get("demo")
                    and shop.get("lat") is not None
                    and shop.get("lng") is not None
                    and distance(body.lat, body.lng, shop["lat"], shop["lng"]) <= 2000
                    and shop_pick(
                        shop,
                        intent.model_copy(update={"keywords": [], "category": ""}),
                        body.lat,
                        body.lng,
                    )
                    is not None
                    and any(
                        item["available"]
                        and term in normalise([item["name"]])
                        and (
                            intent.max_price is None
                            or item["price"]
                            <= round(intent.max_price * 10 ** exponent(shop["currency"]))
                        )
                        for item in shop["products"]
                    )
                )
                await anyio.to_thread.run_sync(
                    capture,
                    repository.feature_docs,
                    intent.model_copy(
                        update={
                            "keywords": [words],
                            "category": inferred_category([term]) or intent.category,
                        }
                    ),
                    body.lat,
                    body.lng,
                    client_ip(request),
                    matched,
                    None if maps.demo else sum(p.distance_m <= 2000 for p in others),
                    datetime.now(shop_timezone(timezone)),
                )
        except Exception:  # noqa: BLE001 - demand capture must never break discovery
            log.warning("demand_capture_unavailable")


@router.post("/discover/ask", response_model=None, responses={200: {"model": AskResponse}})
async def ask(body: AskRequest, request: Request) -> Any:
    await enforce_limits(request, [("discover:ask", client_ip(request))], anonymous=True)
    repository: MerchantRepository | None = request.app.state.merchant
    maps: MapsService = request.app.state.maps
    is_stream = (
        "text/event-stream" in request.headers.get("accept", "")
        or request.query_params.get("stream") == "1"
    )

    if is_stream:

        async def stream_generator() -> AsyncIterator[ServerSentEvent]:
            # One read of the shared shops serves the command check, the instant answer and the
            # complete one (it was three Firestore sweeps; OB-97).
            shared: list[dict[str, Any]] = (
                await anyio.to_thread.run_sync(repository.shared_shops) if repository else []
            )

            # Step 1: Commands need no model
            if repository is not None:
                command = customer_command(body.q, shared, body.lat, body.lng, body.radius)
                if command is not None:
                    resp = AskResponse(
                        intent=Intent(summary=body.q[:160]),
                        mode="command",
                        groups=[],
                        command=command,
                    )
                    yield ServerSentEvent(data=resp.model_dump_json(), event="complete")
                    return

            # Step 2: Instant keyword path (< 10 ms)
            kw_intent = resolve_intent_refinements(body, keyword_intent(body.q))
            anchor = (
                await nearest_station(maps, body.lat, body.lng)
                if kw_intent.near == "transit"
                else None
            )
            lat, lng = (anchor.lat, anchor.lng) if anchor else (body.lat, body.lng)
            radius = min(body.radius, 1000) if anchor else body.radius

            # The places lookup for the first reading starts now, beside the model call.
            places_task = asyncio.create_task(
                query_google_places(maps, kw_intent, lat, lng, radius, body.q, anchor)
            )

            try:
                picks, for_you, personal, shops = await match_local_shops(
                    request,
                    body,
                    kw_intent,
                    anchor,
                    lat,
                    lng,
                    radius,
                    repository,
                    explain=False,
                    shared=shared,
                )
                instant_groups = await localize_picks(
                    request, body.language, assemble_groups(for_you, picks, []), wait=False
                )
                instant_resp = AskResponse(
                    intent=kw_intent,
                    mode="keywords",
                    groups=instant_groups,
                    personal=personal,
                    anchor=anchor,
                    engine=search_engine(request).mode,
                )
                yield ServerSentEvent(data=instant_resp.model_dump_json(), event="instant")

                # Step 3: Stream Gemini words (if enabled) while the places lookup finishes.
                ai_intent_result: Intent | None = None
                early_others: list[Pick] | None = None
                events: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
                settings = request.app.state.v1_settings

                async def read_model() -> None:
                    try:
                        if settings.coach_mode == "gemini":
                            async for item in ai_intent_stream(request, body):
                                kind = "intent" if isinstance(item, Intent) else "text"
                                await events.put((kind, item))
                    finally:
                        await events.put(("model_done", None))

                async def read_places() -> None:
                    try:
                        await events.put(("places", await places_task))
                    except Exception:  # noqa: BLE001 - the final step asks again
                        await events.put(("places", None))

                watchers = [asyncio.create_task(read_model()), asyncio.create_task(read_places())]
                try:
                    while True:
                        kind, item = await events.get()
                        if kind == "text":
                            yield ServerSentEvent(data=json.dumps({"text": item}), event="delta")
                        elif kind == "intent":
                            ai_intent_result = item
                        elif kind == "places":
                            early_others = item
                            if item:
                                early = await localize_picks(
                                    request,
                                    body.language,
                                    assemble_groups(for_you, picks, item),
                                    wait=False,
                                )
                                yield ServerSentEvent(
                                    data=instant_resp.model_copy(
                                        update={"groups": early}
                                    ).model_dump_json(),
                                    event="instant",
                                )
                        else:
                            break
                finally:
                    for watcher in watchers:
                        watcher.cancel()

                final_intent = resolve_intent_refinements(body, ai_intent_result or kw_intent)
                mode: Literal["ai", "keywords"] = "ai" if ai_intent_result else "keywords"

                # Re-score picks if ai_intent provided different keywords or category
                if ai_intent_result and (
                    ai_intent_result.keywords != kw_intent.keywords
                    or ai_intent_result.category != kw_intent.category
                ):
                    picks, for_you, personal, shops = await match_local_shops(
                        request,
                        body,
                        final_intent,
                        anchor,
                        lat,
                        lng,
                        radius,
                        repository,
                        shared=shared,
                    )
                else:
                    await explain_picks(search_engine(request), for_you, body.language)

                same_search = early_others is not None and all(
                    getattr(final_intent, field) == getattr(kw_intent, field)
                    for field in ("keywords", "category", "deals", "open_now", "sort")
                )
                if same_search:
                    area = await area_answer(request, body, final_intent, maps)
                    others = early_others or []
                else:
                    others, area = await asyncio.gather(
                        query_google_places(maps, final_intent, lat, lng, radius, body.q, anchor),
                        area_answer(request, body, final_intent, maps),
                    )
                await record_demand(request, repository, maps, final_intent, body, shops, others)

                final_groups = await localize_picks(
                    request, body.language, assemble_groups(for_you, picks, others), wait=True
                )
                final_resp = AskResponse(
                    intent=final_intent,
                    mode=mode,
                    groups=final_groups,
                    personal=personal,
                    anchor=anchor,
                    area=area,
                    engine=search_engine(request).mode,
                )
                yield ServerSentEvent(data=final_resp.model_dump_json(), event="complete")
            finally:
                places_task.cancel()

        return EventSourceResponse(
            stream_generator(),
            ping=15,
            headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"},
        )

    # Non-streaming fallback / standard API response (e.g. tests)
    if repository is not None:
        shared = await anyio.to_thread.run_sync(repository.shared_shops)
        command = customer_command(body.q, shared, body.lat, body.lng, body.radius)
        if command is not None:
            return AskResponse(
                intent=Intent(summary=body.q[:160]), mode="command", groups=[], command=command
            )

    ai_intent_result = await ai_intent(request, body)
    mode: Literal["ai", "keywords"] = "ai" if ai_intent_result else "keywords"
    intent = resolve_intent_refinements(body, ai_intent_result or keyword_intent(body.q))

    anchor = await nearest_station(maps, body.lat, body.lng) if intent.near == "transit" else None
    lat, lng = (anchor.lat, anchor.lng) if anchor else (body.lat, body.lng)
    radius = min(body.radius, 1000) if anchor else body.radius

    picks, for_you, personal, shops = await match_local_shops(
        request, body, intent, anchor, lat, lng, radius, repository
    )
    others = await query_google_places(maps, intent, lat, lng, radius, body.q, anchor)
    await record_demand(request, repository, maps, intent, body, shops, others)
    area = await area_answer(request, body, intent, maps)

    groups = await localize_picks(
        request, body.language, assemble_groups(for_you, picks, others), wait=True
    )
    return AskResponse(
        intent=intent,
        mode=mode,
        groups=groups,
        personal=personal,
        anchor=anchor,
        area=area,
        engine=search_engine(request).mode,
    )


class AskSuggestions(BaseModel):
    """What the front door can suggest here, from the area's own shops (never invented)."""

    items: list[str]
    shops: int
    open_now: int
    locally_made: int
    deals: int


@router.get("/discover/suggest", response_model=AskSuggestions)
async def suggest(
    request: Request,
    lat: float = Query(ge=-90, le=90, allow_inf_nan=False),
    lng: float = Query(ge=-180, le=180, allow_inf_nan=False),
) -> AskSuggestions:
    await enforce_limits(request, [("discover:suggest", client_ip(request))], anonymous=True)
    repository: MerchantRepository | None = request.app.state.merchant
    shops = await anyio.to_thread.run_sync(repository.shared_shops) if repository else []
    near = [
        shop
        for shop in shops
        if shop.get("lat") is not None
        and shop.get("lng") is not None
        and consumer_shop(shop)
        and distance(lat, lng, shop["lat"], shop["lng"]) <= 2000
    ]
    # The item names most shops nearby sell today: one vote per shop, short names only.
    votes: Counter[str] = Counter()
    names: dict[str, str] = {}
    for shop in near:
        seen = set()
        for product in shop["products"]:
            name = str(product.get("name") or "").strip()
            key = name.casefold()
            if not product.get("available") or not name or len(name) > 24 or key in seen:
                continue
            seen.add(key)
            votes[key] += 1
            names.setdefault(key, name)
    ranked = [names[key] for key, _ in votes.most_common(4)]
    try:
        rescues = await live_rescues(request, near, lat, lng, time.time())
    except Exception:  # noqa: BLE001 - a missing deals count only hides one chip
        rescues = []
    return AskSuggestions(
        items=ranked,
        shops=len(near),
        open_now=sum(
            1
            for shop in near
            if open_now(shop["hours"], shop["timezone"], weekly_hours=shop.get("weekly_hours"))
        ),
        locally_made=sum(1 for shop in near if (shop.get("facts") or {}).get("locally_made")),
        deals=len(rescues),
    )


class SimilarPlace(BaseModel):
    id: str
    name: str
    category: str
    distance_m: int
    open_now: bool | None
    currency: str
    demo_shop: bool = False
    photo_url: str | None = None
    # Their item closest to the one being viewed (when an item page asked).
    item: TopItem | None = None
    similarity: float


class SimilarResponse(BaseModel):
    places: list[SimilarPlace]
    source: Literal["recommendations", "embeddings"]
    engine: Literal["vertex", "fixture"]


@router.get("/discover/similar", response_model=SimilarResponse)
async def similar(
    request: Request,
    shop: str = Query(min_length=1, max_length=120),
    item: str = Query(default="", max_length=80),
    lat: float | None = Query(default=None, ge=-90, le=90, allow_inf_nan=False),
    lng: float | None = Query(default=None, ge=-180, le=180, allow_inf_nan=False),
    radius: int = Query(default=3000, ge=200, le=20000),
) -> SimilarResponse:
    """ "Similar nearby" on a shop or item page: other shared shops alike in meaning, close by."""
    await enforce_limits(request, [("discover:similar", client_ip(request))], anonymous=True)
    repository: MerchantRepository | None = request.app.state.merchant
    shops = await anyio.to_thread.run_sync(repository.shared_shops) if repository else []
    anchor = next((s for s in shops if s["id"] == shop), None)
    if anchor is None:
        raise HTTPException(404, "SHOP_NOT_FOUND")
    if lat is None or lng is None:
        if anchor.get("lat") is None or anchor.get("lng") is None:
            return SimilarResponse(
                places=[], source="embeddings", engine=search_engine(request).mode
            )
        lat, lng = float(anchor["lat"]), float(anchor["lng"])
    near = [
        s
        for s in shops
        if s.get("lat") is not None
        and s.get("lng") is not None
        and consumer_shop(s)
        and distance(lat, lng, s["lat"], s["lng"]) <= radius
    ]
    engine = search_engine(request)
    found, source = await anyio.to_thread.run_sync(
        engine.similar, anchor, item.strip() or None, near
    )
    places = []
    for other, likeness, name in found:
        d = distance(lat, lng, other["lat"], other["lng"])
        is_open = open_now(
            other["hours"], other["timezone"], weekly_hours=other.get("weekly_hours")
        )
        product = next((p for p in other["products"] if p["name"] == name), None)
        places.append(
            (
                blend(Components(semantic=likeness, distance_m=d), "similar"),
                SimilarPlace(
                    id=other["id"],
                    name=other["name"],
                    category=other["category"],
                    distance_m=d,
                    open_now=is_open,
                    currency=other["currency"],
                    demo_shop=bool(other.get("demo")),
                    photo_url=(
                        f"/api/v1/public/shops/{other['id']}/photos/{other['gallery'][0]}.jpg"
                        if other.get("gallery")
                        else None
                    ),
                    item=TopItem(**product) if product else None,
                    similarity=round(likeness, 3),
                ),
            )
        )
    places.sort(key=lambda pair: -pair[0])
    # One entry per shop: a shop seeded twice (its "(Tour)" and "(Demo)" copies) shows once, as
    # its closest match, and never beside the shop being viewed.
    seen = {norm_name(anchor["name"])}
    unique: list[SimilarPlace] = []
    for _, place in places:
        if (key := norm_name(place.name)) not in seen:
            seen.add(key)
            unique.append(place)
    return SimilarResponse(places=unique, source=source, engine=engine.mode)
