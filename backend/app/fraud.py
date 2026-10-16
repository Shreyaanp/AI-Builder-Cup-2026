"""Listing fraud checks: patterns a person should look at, with plain reasons.

Rules are deterministic and run on shared (customer-visible) shops:
- shared_phone: the same phone number on shops of different owners
- shared_photos: near-identical gallery photos on shops of different owners
- impossible_price: zero/negative prices, an item far off the same item elsewhere (same
  currency, at least three other shops), or an item far off the shop's own price range
- copied_menu: most item names and prices identical to a shop of a different owner
- brand_impersonation: a well-known brand in the shop name (a real franchise is fine; the
  reviewer confirms)

Gemini (when the coach runs on Gemini) reads one shop's listing with the rule results and may
add reasons the rules miss (a misspelt brand, a price impossible for the category). Its reply
is validated; it cannot remove a rule's reason. Flags only open review items: no shop is
hidden, changed or penalised by a check.
"""

import hashlib
import io
import json
import re
import statistics
import unicodedata
from collections.abc import Iterable
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

from .gemini_schema import gemini_schema, parse_reply
from .settings import Settings

log = structlog.get_logger()

RULES = ("shared_phone", "shared_photos", "impossible_price", "copied_menu", "brand_impersonation")
# Same-item comparison: off the median of other shops by this factor either way.
PRICE_FACTOR = 10
# Within one shop: an item this many times the shop's own median.
SHOP_FACTOR = 100
MENU_OVERLAP = 0.8
MENU_MIN_ITEMS = 5
PHOTO_DISTANCE = 6  # bits of a 64-bit difference hash

# Brands commonly copied by small listings (food, retail, phones). Matched on whole words after
# folding case, accents, spacing and common digit-for-letter swaps.
BRANDS = (
    "starbucks",
    "mcdonalds",
    "kfc",
    "dominos",
    "pizza hut",
    "burger king",
    "subway",
    "dunkin",
    "costa coffee",
    "tim hortons",
    "haldirams",
    "chaayos",
    "amul",
    "cafe coffee day",
    "jollibee",
    "ya kun",
    "toast box",
    "old chang kee",
    "mr bean",
    "7 eleven",
    "samsung",
    "nike",
    "adidas",
    "zara",
    "uniqlo",
    "ikea",
    "gucci",
    "louis vuitton",
)
LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a"})


def fold(text: str) -> str:
    """Lowercase ASCII words: accents, apostrophes and punctuation removed."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    plain = re.sub(r"['’`.]", "", plain)
    return re.sub(r"[^a-z0-9]+", " ", plain).strip()


def phone_key(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-9:] if len(digits) >= 7 else ""


def item_key(name: str) -> str:
    return fold(name)


def brand_in(name: str) -> str | None:
    """The brand a shop name uses: whole words, also with digits for letters ("St4rbucks")
    or split across words ("Star Bucks"). A brand inside a longer word does not count."""
    names = {fold(name), fold(name.translate(LEET))}
    # Two or three neighbouring words written together: "star bucks" -> "starbucks".
    for words in list(names):
        parts = words.split()
        for size in (2, 3):
            names |= {
                " ".join(parts[:i] + ["".join(parts[i : i + size])] + parts[i + size :])
                for i in range(len(parts) - size + 1)
            }
    for brand in BRANDS:
        pattern = r"(^| )(" + re.escape(brand) + "|" + re.escape(brand.replace(" ", "")) + r")( |$)"
        if any(re.search(pattern, candidate) for candidate in names):
            return brand
    return None


def dhash(image: bytes) -> str:
    """64-bit difference hash of a photo: survives resizing and recompression."""
    from PIL import Image

    with Image.open(io.BytesIO(image)) as opened:
        small = opened.convert("L").resize((9, 8))
        pixels = list(small.tobytes())
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (pixels[row * 9 + col] > pixels[row * 9 + col + 1])
    return f"{bits:016x}"


def distance(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def money(minor: int, currency: str) -> str:
    return f"{minor / 100:.2f} {currency}"


def strangers(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Shops of different owners (one owner with two shops may reuse their own photos)."""
    return not set(a.get("owners") or []) & set(b.get("owners") or [])


def reason(rule: str, detail: str, owner_detail: str = "", **extra: Any) -> dict[str, Any]:
    return {"rule": rule, "detail": detail, "owner_detail": owner_detail, **extra}


def scan(shops: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Rule reasons per shop ID. A shop: id, name, phone, currency, owners, products
    (name, price in minor units), photo_prints (dhash strings). Demo shops are skipped."""
    real = [shop for shop in shops if not shop.get("demo")]
    found: dict[str, list[dict[str, Any]]] = {shop["id"]: [] for shop in real}
    for index, shop in enumerate(real):
        for other in real[index + 1 :]:
            if not strangers(shop, other):
                continue
            pair = ((shop, other), (other, shop))
            key = phone_key(shop.get("phone", ""))
            if key and key == phone_key(other.get("phone", "")):
                for one, two in pair:
                    found[one["id"]].append(
                        reason(
                            "shared_phone",
                            f"Same phone as {two['name']}",
                            one.get("phone", ""),
                            other_id=two["id"],
                        )
                    )
            if any(
                distance(a, b) <= PHOTO_DISTANCE
                for a in shop.get("photo_prints", [])
                for b in other.get("photo_prints", [])
            ):
                for one, two in pair:
                    found[one["id"]].append(
                        reason("shared_photos", f"Same photo as {two['name']}", other_id=two["id"])
                    )
            mine = {item_key(p["name"]): p["price"] for p in shop.get("products", [])}
            theirs = {item_key(p["name"]): p["price"] for p in other.get("products", [])}
            if min(len(mine), len(theirs)) >= MENU_MIN_ITEMS:
                same = [k for k in mine if k in theirs and mine[k] == theirs[k]]
                if len(same) >= MENU_OVERLAP * min(len(mine), len(theirs)):
                    for one, two in pair:
                        found[one["id"]].append(
                            reason(
                                "copied_menu",
                                f"{len(same)} items and prices identical to {two['name']}",
                                str(len(same)),
                                other_id=two["id"],
                            )
                        )
    for shop in real:
        found[shop["id"]].extend(price_reasons(shop, real))
        brand = brand_in(shop.get("name", ""))
        if brand:
            found[shop["id"]].append(
                reason("brand_impersonation", f"Name uses the brand “{brand}”", brand)
            )
    return {bid: reasons for bid, reasons in found.items() if reasons}


def price_reasons(shop: dict[str, Any], shops: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    currency = shop.get("currency", "")
    products = shop.get("products", [])
    elsewhere: dict[str, list[int]] = {}
    for other in shops:
        if other["id"] == shop["id"] or other.get("currency") != currency:
            continue
        for product in other.get("products", []):
            elsewhere.setdefault(item_key(product["name"]), []).append(product["price"])
    positive = [p["price"] for p in products if p["price"] > 0]
    own_median = statistics.median(positive) if len(positive) >= 4 else None
    reasons = []
    for product in products:
        price = product["price"]
        label = f"{product['name']} at {money(price, currency)}"
        if price <= 0:
            reasons.append(reason("impossible_price", f"{label}: zero or below", label))
            continue
        others = elsewhere.get(item_key(product["name"]), [])
        if len(others) >= 3:
            median = statistics.median(others)
            if price > PRICE_FACTOR * median or price * PRICE_FACTOR < median:
                reasons.append(
                    reason(
                        "impossible_price",
                        f"{label}; usually about {money(int(median), currency)}",
                        label,
                    )
                )
                continue
        if own_median and price > SHOP_FACTOR * own_median:
            reasons.append(
                reason(
                    "impossible_price",
                    f"{label}; the shop's other items are about {money(int(own_median), currency)}",
                    label,
                )
            )
    return reasons


# --- Gemini second look (one shop at a time) ---


class AiReason(BaseModel):
    rule: Literal["impossible_price", "brand_impersonation", "other"]
    detail: str = Field(max_length=200, description="For the reviewer, one plain sentence.")
    owner_detail: str = Field(
        default="", max_length=120, description="The item or brand concerned, as listed."
    )


class AiReview(BaseModel):
    reasons: list[AiReason] = Field(default_factory=list, max_length=5)


PROMPT = """You review one small-shop listing for signs a person should double-check.
Report only clear problems:
- impossible_price: a price impossible for this kind of shop and item (for example a cup of
  tea at the price of a phone, or a meal for almost nothing). Prices are in the currency given.
- brand_impersonation: the shop presents itself as a well-known brand or chain, including a
  misspelling (for example "Starbux"). A generic word ("coffee", "bakery") is not a brand.
- other: anything else a careful reviewer would flag as likely misleading customers.
The rule results already found are listed; do not repeat them. Most listings are fine: return
an empty list when nothing is clearly wrong. Never guess about the owner as a person."""


class FraudReviewer:
    """Gemini's second look, cached per listing digest; offline it adds nothing."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: Any = None

    @staticmethod
    def digest(shop: dict[str, Any]) -> str:
        listing = {
            "name": shop.get("name"),
            "category": shop.get("category"),
            "currency": shop.get("currency"),
            "items": [(p["name"], p["price"], p.get("unit")) for p in shop.get("products", [])],
        }
        return hashlib.sha256(json.dumps(listing, sort_keys=True).encode()).hexdigest()

    async def review(self, shop: dict[str, Any], found: list[dict[str, Any]]) -> list[AiReason]:
        if self.settings.coach_mode != "gemini":
            return []
        try:
            from google import genai
            from google.genai import types

            if self._client is None:
                self._client = (
                    genai.Client(
                        vertexai=True,
                        project=self.settings.google_cloud_project,
                        location=self.settings.google_cloud_location,
                    )
                    if self.settings.gemini_backend == "vertex"
                    else genai.Client(api_key=self.settings.google_api_key.get_secret_value())
                )
            listing = {
                "shop": shop.get("name"),
                "category": shop.get("category"),
                "currency": shop.get("currency"),
                "items": [
                    {"name": p["name"], "price": money(p["price"], shop.get("currency", ""))}
                    for p in shop.get("products", [])[:60]
                ],
                "already_found": [r["detail"] for r in found],
            }
            response = await self._client.aio.models.generate_content(
                model=self.settings.google_text_model,
                contents=json.dumps(listing, ensure_ascii=False),
                config=types.GenerateContentConfig(
                    system_instruction=PROMPT,
                    response_mime_type="application/json",
                    response_json_schema=gemini_schema(AiReview),
                    temperature=0,
                    max_output_tokens=600,
                ),
            )
            reply = parse_reply(AiReview, response)
            return reply.reasons if reply else []
        except Exception:
            # A failed second look never blocks the rules' own results.
            log.warning("fraud_review_failed")
            return []

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aio.aclose()
