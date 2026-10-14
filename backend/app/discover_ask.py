"""Customer AI entry: "cheap vegetarian breakfast near me" → curated, explained nearby results.

Gemini reads the request into a small structured intent (or a keyword parser does, offline). The
intent then drives ordinary, verifiable matching: Chalkboard shops by their actual menu items,
prices, facts and opening hours, plus Google places nearby. The model never invents a shop, item
or price; every result comes from a shop's own data or from Google.
"""

from __future__ import annotations

import re
from typing import Any, Literal

import anyio
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .discover import (
    CATEGORIES,
    DiscoveryPlace,
    MapsService,
    TopItem,
    distance,
    open_now,
)
from .limits import client_ip, enforce_limits
from .merchant import MerchantRepository
from .money import exponent

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1")

GENERIC = {"category": [k for k in CATEGORIES if k not in {"kopi", "hawker", "cafe", "café"}]}
STOP = set(
    "a an the i im i'm me my we want need looking for find some any near nearby around here "
    "please today now open cheap cheapest budget good best place places shop shops store under "
    "below less than with without and or to of in at on get buy something".split()
)


class Intent(BaseModel):
    """What the customer asked for. Prices are in the local currency's major units."""

    summary: str = Field(default="", max_length=160)
    keywords: list[str] = Field(default_factory=list, max_length=8)
    category: str = ""
    max_price: float | None = Field(default=None, ge=0)
    halal: bool = False
    vegetarian: bool = False
    open_now: bool = False
    followups: list[str] = Field(default_factory=list, max_length=3)


class AskRequest(BaseModel):
    q: str = Field(min_length=1, max_length=300)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    radius: int = Field(default=4000, ge=200, le=30000)
    language: str = Field(default="en", max_length=16)


class Pick(DiscoveryPlace):
    matched: list[TopItem] = []
    score: float = 0


class Group(BaseModel):
    id: Literal["best", "open", "more"]
    places: list[Pick]


class AskResponse(BaseModel):
    intent: Intent
    mode: Literal["ai", "keywords"]
    groups: list[Group]


PROMPT = """You turn a customer's request into a search for nearby local shops.
Reply in JSON matching the schema. Rules:
- keywords: 1-6 short product or shop words in English AND in the customer's own words if
  different (e.g. "kopi", "coffee"). Singular nouns. No filler words.
- category: one of {categories} or "".
- max_price: a number only if the customer gave a budget ("under 100", "cheap" → null).
- halal / vegetarian / open_now: true only if asked.
- summary: one short friendly line, in language "{language}", restating what you will look for.
- followups: up to 3 short refinements in language "{language}" (e.g. "Open now", "Under ₹100").
Request: {q}"""


def keyword_intent(q: str) -> Intent:
    """Offline and fallback parsing: deterministic, no model."""
    text = q.casefold()
    budget = re.search(r"(?:under|below|less than|max|<)\s*\D{0,3}(\d+(?:[.,]\d+)?)", text)
    words = [w for w in re.findall(r"[^\W\d_]+", text) if w not in STOP and len(w) > 1]
    category = next(
        (key for key in GENERIC["category"] if any(term in text for term in CATEGORIES[key][1])),
        "",
    )
    return Intent(
        summary=q.strip()[:160],
        keywords=[w for w in words if w not in {"halal", "vegetarian", "veg", "vegan"}][:6],
        category=category,
        max_price=float(budget.group(1).replace(",", ".")) if budget else None,
        halal="halal" in text,
        vegetarian=bool(re.search(r"\b(veg|vegetarian|vegan)\b", text)),
        open_now=bool(re.search(r"\b(open now|right now|now)\b", text)),
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
            response = await client.aio.models.generate_content(
                model=settings.google_text_model,
                contents=PROMPT.format(
                    categories=", ".join(GENERIC["category"]),
                    language=body.language,
                    q=body.q,
                ),
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=Intent,
                    temperature=0,
                    max_output_tokens=400,
                ),
            )
    except Exception:  # noqa: BLE001 - the keyword parser is always a correct fallback
        log.warning("ask_intent_unavailable")
        return None
    parsed = response.parsed
    return parsed if isinstance(parsed, Intent) else None


def item_matches(item: dict[str, Any], words: list[str]) -> bool:
    text = f"{item.get('name', '')} {item.get('category', '')}".casefold()
    return any(word.casefold() in text or text in word.casefold() for word in words if word)


def shop_pick(shop: dict[str, Any], intent: Intent, lat: float, lng: float) -> Pick | None:
    """Score a shared Chalkboard shop against the intent using only its own data."""
    facts = shop.get("facts") or {}
    if intent.halal and facts.get("halal") not in {"yes", "muslim_owned"}:
        return None
    if intent.vegetarian and not facts.get("vegetarian_options"):
        return None
    is_open = open_now(shop["hours"], shop["timezone"], weekly_hours=shop.get("weekly_hours"))
    if intent.open_now and is_open is False:
        return None
    limit = (
        round(intent.max_price * 10 ** exponent(shop["currency"]))
        if intent.max_price is not None
        else None
    )
    words = intent.keywords
    products = [p for p in shop["products"] if p["available"]]
    matched = [p for p in products if item_matches(p, words)] if words else []
    if limit is not None:
        matched = (
            [p for p in matched if p["price"] <= limit]
            if words
            else [p for p in products if p["price"] <= limit]
        )
    shop_text = f"{shop['name']} {shop['category']}".casefold()
    category_hit = bool(intent.category) and any(
        term in shop_text for term in CATEGORIES.get(intent.category, ((), ()))[1]
    )
    name_hit = any(word.casefold() in shop_text for word in words)
    if words and not (matched or name_hit or category_hit):
        return None
    if not words and intent.category and not category_hit:
        return None
    d = distance(lat, lng, shop["lat"], shop["lng"])
    score = float(len(matched) * 3 + (2 if name_hit or category_hit else 0) + (1 if is_open else 0))
    score -= d / 1500
    return Pick(
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
        items=[TopItem(**p) for p in shop["products"][:3]],
        sold_out=[p["name"] for p in shop["products"] if not p["available"]],
        halal=facts.get("halal") in {"yes", "muslim_owned"} if facts.get("halal") else None,
        matched=[TopItem(**p) for p in (matched or [])[:3]],
        score=score,
    )


@router.post("/discover/ask", response_model=AskResponse)
async def ask(body: AskRequest, request: Request) -> AskResponse:
    await enforce_limits(request, [("discover:ask", client_ip(request))], anonymous=True)
    intent = await ai_intent(request, body)
    mode: Literal["ai", "keywords"] = "ai" if intent else "keywords"
    intent = intent or keyword_intent(body.q)
    if intent.category not in CATEGORIES:
        intent.category = ""
    repository: MerchantRepository | None = request.app.state.merchant
    shops = await anyio.to_thread.run_sync(repository.shared_shops) if repository else []
    picks = [
        pick
        for shop in shops
        if shop["lat"] is not None
        and shop["lng"] is not None
        and distance(body.lat, body.lng, shop["lat"], shop["lng"]) <= body.radius
        and (pick := shop_pick(shop, intent, body.lat, body.lng)) is not None
    ]
    picks.sort(key=lambda p: (-p.score, p.distance_m))
    maps: MapsService = request.app.state.maps
    query = " ".join(intent.keywords) or body.q
    try:
        google = await maps.places(body.lat, body.lng, body.radius, query, intent.category)
    except HTTPException:
        google = []
    others: list[Pick] = []
    for row in google:
        point = row["location"]
        d = distance(body.lat, body.lng, point["latitude"], point["longitude"])
        if d > body.radius:
            continue
        is_open = row.get("currentOpeningHours", {}).get("openNow")
        if intent.open_now and is_open is False:
            continue
        photo_url, authors = maps.photos.describe(row)
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
            )
        )
    others.sort(key=lambda p: p.distance_m)
    groups = [
        Group(id="best", places=picks[:8]),
        Group(id="open", places=[p for p in others if p.open_now][:10]),
        Group(id="more", places=[p for p in others if not p.open_now][:10]),
    ]
    return AskResponse(intent=intent, mode=mode, groups=[g for g in groups if g.places])
