"""Source supplies (Forecast → Source → Sell): find suppliers near the shop, prepare order
requests the owner confirms with one tap, and run the supplier conversation.

Suppliers are shared Chalkboard shops flagged `supplier`, or shared shops selling the item in a
bulk unit. When none stock the item within range of the shop's pin, 3-5 clearly labelled demo
suppliers are generated near that pin (Gemini, or a deterministic fixture offline) and stored
through the demo-shop path, so they persist and are reused by every shop nearby.

Nothing reaches a supplier until the owner taps Send. Demo suppliers answer automatically a few
seconds later; the reply is produced lazily when the order is next read (no background task
that a scaled-to-zero Cloud Run instance could lose) and is always marked as an automatic demo
reply. Real Chalkboard suppliers receive the request in their Messages inbox (an inquiry), and
their replies are mirrored back into the order thread.
"""

from __future__ import annotations

import hashlib
import math
import re
import time
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

import structlog
from fastapi import HTTPException
from pydantic import BaseModel, Field

from .customer import InquiryInput
from .gemini_schema import gemini_schema, parse_reply
from .latin_names import sounds_like
from .merchant import BusinessFields, CustomFact, MerchantRepository, ProductFields
from .money import exponent, to_major, to_minor
from .product_units import UNITS, normalize_unit
from .region import shop_currency
from .search_engine import (
    SOURCING_ITEM_RECALL,
    Components,
    Relevance,
    SearchEngine,
    blend,
    fresh_days,
)
from .settings import Settings
from .shop_time import shop_timezone
from .words import words as words_of

log = structlog.get_logger()

SEARCH_KM = 15.0
RESULTS = 5
DEMO_REPLY_SECONDS = 4.0
MAX_MESSAGES = 200
# Units a wholesaler sells in; an ordinary shop only counts as a supplier for these.
BULK_UNITS = {"kg", "g", "litre", "ml", "pack", "box", "dozen", "bottle"}
OPEN = {"sent", "needs_reply", "confirmed"}


# ---------------------------------------------------------------------------------------------
# Units and item names


MASS = {"kg": 1.0, "g": 0.001}
VOLUME = {"litre": 1.0, "ml": 0.001}


def unit_of(value: str) -> str:
    text = (value or "").strip().casefold()
    if text in {"l", "ltr", "liter", "liters", "litres", "lt"}:
        return "litre"
    if text in {"kgs", "kilo", "kilos", "kilogram", "kilograms"}:
        return "kg"
    if text in {"gm", "gms", "gram", "grams", "gr"}:
        return "g"
    return normalize_unit(text) if text else ""


def convert(quantity: float, source: str, target: str) -> float | None:
    """20 g → 0.02 kg; 500 ml → 0.5 litre; None when the units do not convert."""
    source, target = unit_of(source), unit_of(target)
    if source == target or not source:
        return quantity
    for table in (MASS, VOLUME):
        if source in table and target in table:
            return quantity * table[source] / table[target]
    return None


# Common names for the same supply in the languages owners use (Hindi, Malay, Indonesian…).
SYNONYMS: dict[str, tuple[str, ...]] = {
    "flour": ("flour", "atta", "maida", "tepung", "terigu", "harina", "farine", "mehl", "小麦粉"),
    "sugar": ("sugar", "chini", "cheeni", "shakkar", "gula", "azucar", "sucre", "砂糖"),
    "rice": ("rice", "chawal", "beras", "arroz", "riz", "米"),
    "oil": ("oil", "tel", "minyak", "aceite", "huile", "油"),
    "milk": ("milk", "doodh", "dudh", "susu", "leche", "lait", "牛乳"),
    "butter": ("butter", "makhan", "mentega"),
    "eggs": ("egg", "eggs", "anda", "telur", "huevos"),
    "coffee": ("coffee", "kopi", "kahwa", "cafe", "café", "コーヒー"),
    "tea": ("tea", "chai", "chaa", "teh", "té", "お茶"),
    "onions": ("onion", "onions", "pyaz", "pyaaz", "bawang"),
    "tomatoes": ("tomato", "tomatoes", "tamatar"),
    "potatoes": ("potato", "potatoes", "aloo", "kentang"),
    "vegetables": ("vegetable", "vegetables", "veg", "sabzi", "sayur", "sayuran"),
    "paneer": ("paneer", "cottage cheese"),
    "cups": ("cup", "cups", "paper cup", "paper cups"),
    "containers": ("container", "containers", "takeaway box", "boxes", "packaging"),
    "bags": ("bag", "bags", "carry bag", "carry bags", "plastic bag"),
    "cleaner": ("cleaner", "cleaning", "detergent", "soap", "sabun", "phenyl"),
    "paper": ("paper", "a4", "printer paper", "kertas"),
    "pens": ("pen", "pens", "ballpoint", "pulpen"),
    "notebooks": ("notebook", "notebooks", "exercise book", "buku tulis"),
    "salt": ("salt", "namak", "garam"),
    "lentils": ("lentil", "lentils", "dal", "daal", "dhal"),
}


def words(text: str) -> set[str]:
    return set(words_of(text.casefold()))


def canonical(item: str) -> str | None:
    text = item.casefold().strip()
    found = words(text)
    for key, names in SYNONYMS.items():
        for name in names:
            if " " in name and name in text:
                return key
            if name in found or name.rstrip("s") in found or name + "s" in found:
                return key
    return None


def matches(product_name: str, item: str) -> bool:
    """'Wheat flour (atta)' matches 'flour', 'atta' and 'Atta'; 'Paper cups' matches 'cups'."""
    key = canonical(item)
    if key and canonical(product_name) == key:
        return True
    if key and key in SYNONYMS and words(product_name) & set(SYNONYMS[key]):
        return True
    wanted = words(item) - {"of", "the", "and", "some"}
    # 'atta' also finds a supplier's 'आटा': names in any script by their English sound (OB-170).
    return bool(wanted) and (
        wanted <= words(product_name) or all(sounds_like(w, product_name) for w in wanted)
    )


# ---------------------------------------------------------------------------------------------
# Places, currencies and money


@dataclass(frozen=True)
class Region:
    rate: float  # units of this currency per US dollar (approximate)
    level: float  # local wholesale price level compared with the US
    centre: tuple[float, float]  # fallback pin when the shop has none
    timezone: str
    names: tuple[str, str, str, str]


REGIONS: dict[str, Region] = {
    "INR": Region(
        83,
        0.55,
        (12.9716, 77.5946),
        "Asia/Kolkata",
        (
            "Shree Ganesh Wholesale Traders",
            "Kaveri Fresh & Dairy Supply",
            "Lakshmi Cash & Carry",
            "Malnad Coffee & Tea Traders",
        ),
    ),
    "SGD": Region(
        1.35,
        1.0,
        (1.3521, 103.8198),
        "Asia/Singapore",
        (
            "Ah Huat Provision Wholesale",
            "Lim Brothers Fresh & Dairy",
            "Kallang Cash & Carry",
            "Tanjong Kopi & Tea Supply",
        ),
    ),
    "MYR": Region(
        4.7,
        0.6,
        (3.139, 101.6869),
        "Asia/Kuala_Lumpur",
        (
            "Kedai Borong Sri Maju",
            "Segar Dairy & Fresh Supply",
            "Jalan Ipoh Cash & Carry",
            "Kopi Tiam Supply Co.",
        ),
    ),
    "IDR": Region(
        15800,
        0.5,
        (-6.2088, 106.8456),
        "Asia/Jakarta",
        (
            "Toko Grosir Sumber Rejeki",
            "Segar Jaya Susu & Sayur",
            "Grosir Serba Ada",
            "Kopi Nusantara Supply",
        ),
    ),
    "JPY": Region(
        150,
        1.0,
        (35.6762, 139.6503),
        "Asia/Tokyo",
        (
            "Yamada Shokuhin Wholesale",
            "Hokuto Dairy & Produce",
            "Sakura Cash & Carry",
            "Kissa Coffee & Tea Supply",
        ),
    ),
    "THB": Region(
        36,
        0.6,
        (13.7563, 100.5018),
        "Asia/Bangkok",
        (
            "Chokchai Dry Goods Wholesale",
            "Siam Fresh Dairy Supply",
            "Bang Rak Cash & Carry",
            "Doi Coffee & Tea Traders",
        ),
    ),
}
DEFAULT_REGION = Region(
    1,
    1.0,
    (1.3521, 103.8198),
    "Asia/Singapore",
    (
        "Harbour Wholesale Dry Goods",
        "Green Valley Dairy & Fresh",
        "Corner Cash & Carry",
        "Bean & Leaf Supply Co.",
    ),
)
APPROXIMATE_RATES = {
    "USD": 1,
    "EUR": 0.92,
    "GBP": 0.79,
    "AUD": 1.5,
    "PHP": 56,
    "VND": 25000,
    "KRW": 1350,
    "CNY": 7.2,
    "HKD": 7.8,
    "BDT": 110,
    "PKR": 280,
    "LKR": 300,
    "NPR": 133,
    "AED": 3.67,
}
SYMBOLS = {
    "INR": "₹",
    "SGD": "S$",
    "MYR": "RM",
    "IDR": "Rp",
    "JPY": "¥",
    "THB": "฿",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "PHP": "₱",
    "VND": "₫",
    "KRW": "₩",
    "AUD": "A$",
    "HKD": "HK$",
}


def region(currency: str) -> Region:
    if currency in REGIONS:
        return REGIONS[currency]
    rate = APPROXIMATE_RATES.get(currency, 1)
    return Region(
        rate,
        1.0 if rate < 10 else 0.6,
        DEFAULT_REGION.centre,
        DEFAULT_REGION.timezone,
        DEFAULT_REGION.names,
    )


def area_currency(lat: float, lng: float, fallback: str = "SGD") -> str:
    """Choose a known area's currency from its region profile, not the visitor's device."""
    nearest = min(
        REGIONS.items(),
        key=lambda entry: haversine(lat, lng, *entry[1].centre),
    )
    distance = haversine(lat, lng, *nearest[1].centre)
    return nearest[0] if distance <= 500 else fallback


def money_text(minor: int, currency: str) -> str:
    """₹1,240 / S$12.50 / ¥3,000 for messages written by the server."""
    digits = exponent(currency)
    major = to_major(minor, currency)
    whole = float(major).is_integer()
    number = f"{major:,.0f}" if whole else f"{major:,.{digits}f}"
    symbol = SYMBOLS.get(currency)
    return f"{symbol}{number}" if symbol else f"{number} {currency}"


def nice_price(major: float) -> float:
    if major >= 100:
        return float(round(major))
    if major >= 10:
        return round(major * 2) / 2
    return max(0.05, round(major * 20) / 20)


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(min(1.0, a)))


def offset(lat: float, lng: float, km: float, bearing: float) -> tuple[float, float]:
    rad = math.radians(bearing)
    dlat = km * math.cos(rad) / 111.32
    dlng = km * math.sin(rad) / (111.32 * max(0.2, math.cos(math.radians(lat))))
    return round(lat + dlat, 5), round(max(-180.0, min(180.0, lng + dlng)), 5)


def seed_number(*parts: object) -> int:
    return int(hashlib.sha256("/".join(map(str, parts)).encode()).hexdigest()[:8], 16)


# ---------------------------------------------------------------------------------------------
# Demo supplier generation


class DemoProduct(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    unit: str = Field(description="One of: kg, g, litre, ml, pack, box, dozen, bottle, piece")
    price: float = Field(gt=0, description="Wholesale price per unit, shop currency, major units")


class DemoSupplier(BaseModel):
    name: str = Field(min_length=2, max_length=60, description="Invented local business name")
    supplies: list[str] = Field(max_length=8, description="Categories, e.g. flour, dairy")
    delivery_note: str = Field(max_length=80, description="e.g. Next-day delivery, 9-11am")
    min_order: float = Field(ge=0, description="Minimum order, shop currency, major units")
    lead_days: int = Field(ge=0, le=3, description="0 = same day, 1 = next day")
    delivery_time: str = Field(pattern=r"^\d{2}:\d{2}$", description="Usual delivery time HH:MM")
    products: list[DemoProduct] = Field(min_length=3, max_length=14)


class DemoSuppliers(BaseModel):
    suppliers: list[DemoSupplier] = Field(min_length=3, max_length=5)


# Base wholesale prices in US dollars; scaled by each region's rate and price level.
ROLES: list[dict[str, Any]] = [
    {
        "supplies": ["flour", "sugar", "rice", "oil", "lentils"],
        "delivery_note": "Next-day delivery, 9–11am",
        "lead_days": 1,
        "delivery_time": "09:00",
        "min_order": 15,
        "products": [
            ("Wheat flour", "kg", 1.0),
            ("Sugar", "kg", 0.9),
            ("Rice", "kg", 1.1),
            ("Cooking oil", "litre", 1.8),
            ("Lentils (dal)", "kg", 1.4),
            ("Salt", "kg", 0.4),
            ("Baking powder", "kg", 4.0),
        ],
    },
    {
        "supplies": ["dairy", "eggs", "vegetables"],
        "delivery_note": "Daily delivery before 8am",
        "lead_days": 1,
        "delivery_time": "07:30",
        "min_order": 10,
        "products": [
            ("Milk", "litre", 1.0),
            ("Butter", "kg", 7.0),
            ("Paneer", "kg", 6.0),
            ("Eggs", "dozen", 2.4),
            ("Onions", "kg", 0.8),
            ("Tomatoes", "kg", 1.0),
            ("Potatoes", "kg", 0.6),
        ],
    },
    {
        "supplies": ["packaging", "cleaning supplies", "stationery", "flour", "sugar"],
        "delivery_note": "Same-day delivery within 5 km",
        "lead_days": 0,
        "delivery_time": "16:00",
        "min_order": 20,
        "products": [
            ("Takeaway containers (100)", "pack", 8.0),
            ("Paper cups (100)", "pack", 5.0),
            ("Carry bags (100)", "pack", 3.0),
            ("Dish soap", "litre", 2.5),
            ("Floor cleaner", "litre", 2.0),
            ("A4 printer paper (500 sheets)", "pack", 5.0),
            ("Ballpoint pens (box of 20)", "box", 3.0),
            ("Notebooks (pack of 10)", "pack", 6.0),
            ("Wheat flour", "kg", 1.15),
            ("Sugar", "kg", 1.0),
        ],
    },
    {
        "supplies": ["coffee", "tea", "milk", "sugar"],
        "delivery_note": "Delivery in 2 days, free above minimum",
        "lead_days": 2,
        "delivery_time": "10:00",
        "min_order": 25,
        "products": [
            ("Coffee beans", "kg", 14.0),
            ("Ground coffee", "kg", 10.0),
            ("Tea leaves", "kg", 8.0),
            ("Condensed milk", "pack", 2.2),
            ("Milk", "litre", 1.1),
            ("Sugar", "kg", 0.95),
        ],
    },
]
# Distance (km) and bearing of each generated supplier from the shop's pin.
SPREAD = [(1.4, 35.0), (4.6, 150.0), (2.9, 260.0), (2.2, 320.0)]


def demo_supplier_id(lat: float, lng: float, index: int) -> str:
    """One set per ~2 km cell, so neighbouring shops share (and reuse) the same suppliers."""
    cell = f"{round(lat * 50) / 50:.2f},{round(lng * 50) / 50:.2f}"
    return f"demo-sup-{hashlib.sha256(cell.encode()).hexdigest()[:10]}-{index}"


def fixture_suppliers(item: str, unit: str, currency: str) -> DemoSuppliers:
    """Deterministic demo suppliers (offline mode, tests, and when the model is unavailable)."""
    place = region(currency)
    scale = place.rate * place.level
    # The requested item as the catalogue knows it; an unknown item gets a plain placeholder.
    known = [row for role in ROLES for row in role["products"] if item and matches(row[0], item)]
    wanted = (
        known[0]
        if known
        else (
            item.strip().capitalize()[:60],
            unit_of(unit) if unit_of(unit) in BULK_UNITS else "kg",
            3.0,
        )
    )
    stockists = sum(any(matches(row[0], item) for row in role["products"]) for role in ROLES)
    suppliers = []
    for index, role in enumerate(ROLES):
        # A small per-supplier price spread, so "the cheapest one" means something.
        spread = 0.9 + (seed_number(currency, index) % 21) / 100
        products = [
            DemoProduct(name=name, unit=u, price=nice_price(base * scale * spread))
            for name, u, base in role["products"]
        ]
        if item.strip() and stockists < 3 and not any(matches(p.name, item) for p in products):
            # At least three suppliers carry what the owner asked for.
            stockists += 1
            products.insert(
                0,
                DemoProduct(
                    name=wanted[0], unit=wanted[1], price=nice_price(wanted[2] * scale * spread)
                ),
            )
        suppliers.append(
            DemoSupplier(
                name=place.names[index],
                supplies=role["supplies"],
                delivery_note=role["delivery_note"],
                min_order=nice_price(role["min_order"] * scale),
                lead_days=role["lead_days"],
                delivery_time=role["delivery_time"],
                products=products,
            )
        )
    return DemoSuppliers(suppliers=suppliers)


PROMPT = """You create clearly labelled DEMO wholesale suppliers for a hackathon demo of a
small-business app. Invent 4 plausible local suppliers near the given place: local-sounding,
invented names (never real brands, chains or existing companies), the given currency, realistic
wholesale prices per unit (major units). At least three of them stock the requested item.
Together they also cover common supplies: flour, sugar, cooking oil, rice, dairy, vegetables,
coffee and tea, packaging, stationery and cleaning supplies. 5-10 products each. Units: kg, g,
litre, ml, pack, box, dozen, bottle or piece. English product names, short."""


class SupplierGenerator:
    """Gemini-written demo suppliers; deterministic fixture offline or on any failure."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: Any = None

    async def generate(
        self, item: str, unit: str, currency: str, location: str, shop_category: str
    ) -> tuple[DemoSuppliers, str]:
        if self.settings.coach_mode != "gemini":
            return fixture_suppliers(item, unit, currency), "fixture"
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
            response = await self._client.aio.models.generate_content(
                model=self.settings.google_text_model,
                contents=(
                    f"place: {location or 'unknown'}\ncurrency: {currency}\n"
                    f"requested item: {item} ({unit or 'any unit'})\n"
                    f"the ordering shop: {shop_category or 'small shop'}"
                ),
                config=types.GenerateContentConfig(
                    system_instruction=PROMPT,
                    response_mime_type="application/json",
                    response_json_schema=gemini_schema(DemoSuppliers),
                    temperature=0.4,
                    max_output_tokens=3000,
                ),
            )
            parsed = parse_reply(DemoSuppliers, response)
            if isinstance(parsed, DemoSuppliers) and any(
                matches(p.name, item) for s in parsed.suppliers for p in s.products
            ):
                return parsed, "gemini"
        except Exception:
            log.warning("demo_supplier_generation_failed")
        return fixture_suppliers(item, unit, currency), "fixture"

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aio.aclose()


def demo_records(
    generated: DemoSuppliers,
    lat: float,
    lng: float,
    currency: str,
    timezone: str,
) -> list[tuple[str, BusinessFields, list[ProductFields]]]:
    records = []
    for index, supplier in enumerate(generated.suppliers[: len(SPREAD)]):
        km, bearing = SPREAD[index]
        bearing += seed_number(lat, lng) % 40
        plat, plng = offset(lat, lng, km, bearing)
        products = []
        seen = set()
        for product in supplier.products:
            unit = unit_of(product.unit)
            unit = unit if unit in UNITS else "pack"
            if (product.name.casefold(), unit) in seen:
                continue
            seen.add((product.name.casefold(), unit))
            products.append(
                ProductFields(
                    name=product.name,
                    price=to_minor(product.price, currency),
                    unit=unit,
                    category=(supplier.supplies[0] if supplier.supplies else "Supplies")[:80],
                )
            )
        minimum = (
            "Minimum order " + money_text(to_minor(supplier.min_order, currency), currency)
            if supplier.min_order
            else ""
        )
        fields = BusinessFields(
            name=supplier.name,
            category="Wholesale supplier",
            location=f"{km:.1f} km from your shop (demo)",
            lat=plat,
            lng=plng,
            pin_label="Approximate (demo)",
            demo=True,
            supplier=True,
            supplies=[s[:40] for s in supplier.supplies if s.strip()][:12],
            min_order=minimum,
            delivery_note=supplier.delivery_note[:80],
            timezone=timezone,
            currency=currency,
            custom_facts=[
                CustomFact(
                    key="lead_days", label="Lead time (days)", value=str(supplier.lead_days)
                ),
                CustomFact(
                    key="delivery_time", label="Delivery time", value=supplier.delivery_time
                ),
            ],
        )
        records.append((demo_supplier_id(lat, lng, index), fields, products))
    return records


# ---------------------------------------------------------------------------------------------
# Search


@dataclass
class ShopPin:
    lat: float
    lng: float
    approximate: bool
    currency: str
    timezone: str
    location: str
    category: str
    name: str
    phone: str


def shop_pin(fields: dict[str, Any]) -> ShopPin:
    currency = shop_currency(fields)
    place = region(currency)
    has_pin = fields.get("lat") is not None and fields.get("lng") is not None
    lat, lng = (fields["lat"], fields["lng"]) if has_pin else place.centre
    return ShopPin(
        lat=float(lat),
        lng=float(lng),
        approximate=not has_pin,
        currency=currency,
        timezone=fields.get("timezone") or place.timezone,
        location=fields.get("location", ""),
        category=fields.get("category", ""),
        name=fields.get("name", ""),
        phone=fields.get("phone", ""),
    )


def fact(shop: dict[str, Any], key: str, default: str) -> str:
    for item in (shop.get("facts") or {}).get("custom") or []:
        if item.get("key") == key:
            return str(item.get("value") or default)
    return default


def candidates(
    shops: Iterable[dict[str, Any]],
    own_id: str,
    pin: ShopPin,
    item: str,
    relevance: dict[str, Relevance] | None = None,
) -> list[dict[str, Any]]:
    """Shops within reach that stock the item, by its words or (search engine) its meaning."""
    found = []
    for shop in shops:
        if shop["id"] == own_id or shop.get("lat") is None or shop.get("lng") is None:
            continue
        if (shop_currency(shop)) != pin.currency:
            continue
        km = haversine(pin.lat, pin.lng, shop["lat"], shop["lng"])
        if km > SEARCH_KM:
            continue
        meaning = (relevance or {}).get(shop["id"]) or Relevance()
        products = [p for p in shop.get("products", []) if matches(p["name"], item)] or [
            # No product by name: one close in meaning ("maida" for "all-purpose flour").
            p
            for p in shop.get("products", [])
            if meaning.items.get(p["name"], 0.0) >= SOURCING_ITEM_RECALL
        ]
        if not shop.get("supplier"):
            products = [p for p in products if unit_of(p["unit"]) in BULK_UNITS]
        if products:
            found.append({"shop": shop, "km": km, "products": products, "meaning": meaning})
    return found


def per_unit(product: dict[str, Any], unit: str) -> float:
    """Price of one requested unit (minor), for ranking across kg/g and litre/ml."""
    one = convert(1.0, unit or product["unit"], product["unit"])
    return float(product["price"]) * (one if one is not None else 1.0)


def rank(
    found: list[dict[str, Any]],
    unit: str,
    quantity: float | None,
    currency: str,
    item: str = "",
) -> list[dict[str, Any]]:
    if not found:
        return []
    for entry in found:
        entry["product"] = sorted(
            entry["products"], key=lambda p: (not p.get("available", True), per_unit(p, unit))
        )[0]
    cheapest = min(per_unit(entry["product"], unit) for entry in found) or 1.0

    def score(entry: dict[str, Any]) -> float:
        product = entry["product"]
        meaning = entry.get("meaning") or Relevance()
        components = Components(
            semantic=meaning.items.get(product["name"], 0.0),
            keyword=1.0 if matches(product["name"], item) else 0.0,
            distance_m=entry["km"] * 1000,
            price_fit=cheapest / (per_unit(product, unit) or cheapest),
            fresh_days=fresh_days(entry["shop"].get("last_confirmed")),
        )
        # The same engine and weights as customer search, with the sourcing profile.
        return blend(components, "sourcing") - (0 if product.get("available", True) else 2)

    found.sort(key=lambda e: -score(e))
    cards = []
    for position, entry in enumerate(found[:RESULTS], start=1):
        shop, product = entry["shop"], entry["product"]
        amount = convert(quantity, unit or product["unit"], product["unit"]) if quantity else None
        cards.append(
            {
                "rank": position,
                "id": shop["id"],
                "name": shop["name"],
                "distance_km": round(entry["km"], 1),
                "demo": bool(shop.get("demo")),
                "delivery": (shop.get("facts") or {}).get("delivery_note", ""),
                "min_order": shop.get("min_order", ""),
                "item": {
                    "name": product["name"],
                    "price": to_major(product["price"], currency),
                    "unit": product["unit"],
                    "available": product.get("available", True),
                },
                "estimate": to_major(round(product["price"] * amount), currency)
                if amount is not None
                else None,
                "in_stock": [
                    p["name"]
                    for p in shop.get("products", [])
                    if p.get("available", True) and p["name"] != product["name"]
                ][:4],
            }
        )
    return cards


async def find(
    store: MerchantRepository,
    uid: str,
    bid: str,
    item: str,
    quantity: float | None,
    unit: str,
    generator: SupplierGenerator,
    demo_owner: str,
    engine: SearchEngine | None = None,
) -> dict[str, Any]:
    import anyio

    context = await anyio.to_thread.run_sync(store.context, uid, bid)
    pin = shop_pin(context["business"]["fields"])

    async def search() -> list[dict[str, Any]]:
        shops = await anyio.to_thread.run_sync(store.shared_shops)
        near = [
            s
            for s in shops
            if s.get("lat") is not None
            and s.get("lng") is not None
            and haversine(pin.lat, pin.lng, s["lat"], s["lng"]) <= SEARCH_KM
        ]
        relevance = await anyio.to_thread.run_sync(engine.relevance, item, near) if engine else None
        return candidates(near, bid, pin, item, relevance)

    found = await search()
    generated = False
    source = ""
    if not found:
        demo, source = await generator.generate(
            item, unit, pin.currency, pin.location, pin.category
        )
        records = demo_records(demo, pin.lat, pin.lng, pin.currency, pin.timezone)
        for sid, fields, products in records:
            try:
                await anyio.to_thread.run_sync(
                    store.seed_demo_shop, demo_owner, sid, fields, products
                )
            except HTTPException:
                # A demo ID owned by someone else is never taken over; skip that one.
                log.warning("demo_supplier_seed_skipped", supplier=sid)
        found = await search()
        generated = True
    cards = rank(found, unit_of(unit), quantity, pin.currency, item)
    return {
        "item": item,
        "quantity": quantity,
        "unit": unit_of(unit),
        "currency": pin.currency,
        "suppliers": cards,
        "generated_demo_suppliers": generated,
        "generated_by": source or None,
        "approximate_location": pin.approximate,
        "cheapest_id": min(cards, key=lambda c: c["item"]["price"])["id"] if cards else None,
        "nearest_id": min(cards, key=lambda c: c["distance_km"])["id"] if cards else None,
    }


# ---------------------------------------------------------------------------------------------
# Orders


class OrderItem(BaseModel):
    """One line of an order request, as the owner said it."""

    name: str = Field(min_length=1, max_length=80, description="Item, e.g. flour")
    quantity: float = Field(gt=0, le=100_000, description="How many units, e.g. 20")
    unit: str = Field(default="", max_length=20, description="kg, g, litre, ml, pack, dozen…")


def delivery_slot(shop: dict[str, Any], timezone: str, now: float) -> tuple[str, str]:
    """(ISO local datetime, words) of the supplier's next usual delivery."""
    lead = int(fact(shop, "lead_days", "1") or 1)
    clock = fact(shop, "delivery_time", "09:00")
    zone = shop_timezone(timezone)
    local = datetime.fromtimestamp(now, zone)
    hour, minute = (int(part) for part in clock.split(":")[:2])
    day = local + timedelta(days=lead)
    when = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if lead == 0 and when <= local:
        when += timedelta(days=1)
        lead = 1
    words_ = (
        "today"
        if when.date() == local.date()
        else "tomorrow"
        if when.date() == (local + timedelta(days=1)).date()
        else when.strftime("%A")
    )
    return when.strftime("%Y-%m-%dT%H:%M"), f"{words_} at {when.strftime('%H:%M')}"


def build_lines(
    shop: dict[str, Any], items: list[OrderItem], currency: str
) -> tuple[list[dict[str, Any]], int]:
    lines, total = [], 0
    for item in items:
        products = [p for p in shop.get("products", []) if matches(p["name"], item.name)]
        unit = unit_of(item.unit)
        product = None
        amount = None
        for candidate in sorted(products, key=lambda p: not p.get("available", True)):
            amount = convert(item.quantity, unit or candidate["unit"], candidate["unit"])
            if amount is not None:
                product = candidate
                break
        if product is None or amount is None:
            lines.append(
                {
                    "name": item.name.strip(),
                    "quantity": item.quantity,
                    "unit": unit or "item",
                    "price": None,
                    "total": None,
                    "available": False,
                }
            )
            continue
        line_total = round(product["price"] * amount)
        total += line_total
        lines.append(
            {
                "name": product["name"],
                "quantity": round(amount, 3),
                "unit": product["unit"],
                "price": product["price"],
                "total": line_total,
                "available": product.get("available", True),
            }
        )
    return lines, total


def line_text(line: dict[str, Any]) -> str:
    return f"{line['quantity']:g} {line['unit']} {line['name']}"


def order_text(order: dict[str, Any]) -> str:
    """The structured request as the supplier reads it."""
    items = "; ".join(line_text(line) for line in order["lines"])
    parts = [f"Order request from {order['shop_name'] or 'a Chalkboard shop'}: {items}."]
    parts.append(f"Estimated total {money_text(order['total'], order['currency'])}.")
    parts.append(f"Delivery: {order['delivery']}.")
    if order.get("note"):
        parts.append(f"Note: {order['note']}")
    return " ".join(parts)[:500]


def new_order(
    shop: dict[str, Any],
    own: ShopPin,
    items: list[OrderItem],
    note: str,
    delivery: str,
    distance_km: float | None,
    now: float,
) -> dict[str, Any]:
    lines, total = build_lines(shop, items, own.currency)
    when, words_ = delivery_slot(shop, own.timezone, now)
    return {
        "id": str(uuid4()),
        "version": 1,
        "status": "draft",
        "supplier": {
            "id": shop["id"],
            "name": shop["name"],
            "demo": bool(shop.get("demo")),
            "distance_km": distance_km,
            "delivery": (shop.get("facts") or {}).get("delivery_note", ""),
            "min_order": shop.get("min_order", ""),
        },
        "shop_name": own.name,
        "currency": own.currency,
        "lines": lines,
        "total": total,
        "delivery_at": when,
        "delivery": (delivery or words_).strip()[:80],
        "note": (note or "").strip()[:200],
        "created": now,
        "updated": now,
        "messages": [],
        "pending": None,
        "reply_due": None,
        "unread": False,
    }


def public_order(order: dict[str, Any]) -> dict[str, Any]:
    """What the app shows: never the supplier inbox link token."""
    return {key: value for key, value in order.items() if key != "link"}


def summary(order: dict[str, Any]) -> dict[str, Any]:
    """What the model sees about an order."""
    currency = order["currency"]
    last = order["messages"][-1] if order["messages"] else None
    return {
        "order_id": order["id"],
        "status": order["status"],
        "supplier": order["supplier"]["name"],
        "supplier_id": order["supplier"]["id"],
        "demo_supplier": order["supplier"]["demo"],
        "lines": [
            {
                "item": line["name"],
                "quantity": line["quantity"],
                "unit": line["unit"],
                "estimated_price": to_major(line["total"], currency)
                if line["total"] is not None
                else None,
                **({"not_stocked": True} if line["price"] is None else {}),
            }
            for line in order["lines"]
        ],
        "estimated_total": to_major(order["total"], currency),
        "currency": currency,
        "delivery": order["delivery"],
        **({"last_message": {"from": last["author"], "text": last["text"][:200]}} if last else {}),
        **({"waiting_for_owner_tap": order["pending"]["kind"]} if order.get("pending") else {}),
    }


def message(
    author: str, text: str, now: float, kind: str = "text", auto: bool = False
) -> dict[str, Any]:
    return {
        "id": uuid4().hex[:12],
        "author": author,
        "text": text[:500],
        "created": now,
        "kind": kind,
        **({"auto": True} if auto else {}),
    }


HOUR = re.compile(r"\b(?:by|before|at|around)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", re.I)


def demo_reply(order: dict[str, Any], trigger: dict[str, Any]) -> tuple[str, str]:
    """(reply, new status) of a demo wholesaler: plausible, deterministic, English."""
    currency = order["currency"]
    if trigger["kind"] == "order":
        missing = [line for line in order["lines"] if line["price"] is None]
        out = [
            line for line in order["lines"] if line["price"] is not None and not line["available"]
        ]
        if missing or out:
            names = ", ".join(line["name"] for line in (missing + out)[:2])
            return (
                f"Thanks! We don't have {names} right now. Shall we send the rest of the order "
                f"{order['delivery']}?",
                "needs_reply",
            )
        items = ", ".join(line_text(line) for line in order["lines"])
        return (
            f"Confirmed: {items}, {money_text(order['total'], currency)}. "
            f"Delivering {order['delivery']}.",
            "confirmed",
        )
    if trigger["kind"] == "cancel":
        return ("No problem, the order is cancelled.", "cancelled")
    text = trigger["text"].casefold()
    if "sunday" in text or "रविवार" in text:
        return (
            "Sorry, we don't deliver on Sunday. Monday morning works. Shall we do that?",
            "needs_reply",
        )
    hour = HOUR.search(trigger["text"])
    if hour:
        value = int(hour.group(1)) % 24
        if (hour.group(3) or "").lower() == "pm" and value < 12:
            value += 12
        clock = f"{value}:{hour.group(2) or '00'}"
        if 7 <= value <= 20:
            return (f"Yes, we can deliver by {clock}. See you then.", "confirmed")
        return (f"Our earliest delivery is 7:00. Is that okay instead of {clock}?", "needs_reply")
    if re.search(r"\b(change|make it|instead|update|quantity)\b", text):
        return ("Noted, we've updated your order. Same delivery time.", "confirmed")
    if re.search(r"\b(price|discount|cheaper|rate)\b", text):
        return ("That's already our best wholesale price, sorry.", order["status"])
    if re.search(r"\b(thank|thanks|ok|okay|great)\b", text):
        return (
            "You're welcome!",
            order["status"] if order["status"] != "needs_reply" else "confirmed",
        )
    return ("Noted, we'll take care of it.", "confirmed")


def settle(
    store: MerchantRepository, uid: str, bid: str, order: dict[str, Any], now: float
) -> dict[str, Any]:
    """Bring in replies that are due: a demo supplier's automatic answer, or a real supplier's
    messages from their inbox. Saves and returns the updated order."""
    changed = False
    if order.get("reply_due") and now >= order["reply_due"] and order["supplier"]["demo"]:
        trigger = order["messages"][-1] if order["messages"] else {"kind": "order", "text": ""}
        text, status = demo_reply(order, trigger)
        order["messages"].append(message("supplier", text, order["reply_due"], auto=True))
        order["status"] = status
        order["reply_due"] = None
        order["unread"] = True
        changed = True
    link = order.get("link")
    if link and order["status"] != "cancelled":
        try:
            thread = store.thread_action(
                None, order["supplier"]["id"], link["id"], link["token"], "get"
            )
            seen = {m["id"] for m in order["messages"]}
            for item in thread.messages:
                if item.author == "owner" and item.id not in seen:
                    order["messages"].append(
                        {
                            "id": item.id,
                            "author": "supplier",
                            "text": item.text,
                            "created": item.created,
                            "kind": "text",
                        }
                    )
                    order["status"] = "confirmed"
                    order["unread"] = True
                    changed = True
        except HTTPException:
            pass
    if changed:
        order["version"] += 1
        order["updated"] = now
        store.save_supplier_order(uid, bid, order)
    return order


def orders(
    store: MerchantRepository, uid: str, bid: str, now: float | None = None
) -> list[dict[str, Any]]:
    now = time.time() if now is None else now
    return [
        settle(store, uid, bid, order, now)
        for order in store.supplier_orders(uid, bid)
        if order["status"] != "replaced"
    ]


def get_order(
    store: MerchantRepository, uid: str, bid: str, oid: str, now: float | None = None
) -> dict[str, Any]:
    for order in store.supplier_orders(uid, bid):
        if order["id"] == oid:
            return settle(store, uid, bid, order, time.time() if now is None else now)
    raise HTTPException(404, "Order not found.")


def save(store: MerchantRepository, uid: str, bid: str, order: dict[str, Any], now: float) -> dict:
    order["version"] += 1
    order["updated"] = now
    return store.save_supplier_order(uid, bid, order)


def deliver(
    store: MerchantRepository,
    uid: str,
    bid: str,
    order: dict[str, Any],
    text: str,
    kind: str,
    now: float,
) -> None:
    """Hand one confirmed message to the supplier."""
    if order["supplier"]["demo"]:
        order["reply_due"] = now + DEMO_REPLY_SECONDS
        return
    supplier = order["supplier"]["id"]
    link = order.get("link")
    if link:
        store.thread_action(None, supplier, link["id"], link["token"], "post", text)
        return
    context = store.context(uid, bid)
    phone = context["business"]["fields"].get("phone", "")
    try:
        body = InquiryInput(
            name=f"{order['shop_name']} (order request)"[:100], contact=phone, message=text
        )
    except ValueError as error:
        raise HTTPException(409, "ADD_SHOP_PHONE") from error
    receipt = store.add_inquiry(supplier, body)
    order["link"] = {"id": receipt.id, "token": receipt.token}


def confirm(
    store: MerchantRepository,
    uid: str,
    bid: str,
    oid: str,
    version: int,
    now: float | None = None,
) -> dict[str, Any]:
    """The owner's one tap: send the draft order, or the pending message/cancellation."""
    now = time.time() if now is None else now
    order = get_order(store, uid, bid, oid, now)
    if order["version"] != version:
        raise HTTPException(409, "This order changed. Review it again.")
    if order["status"] == "draft":
        if not order["lines"] or all(line["price"] is None for line in order["lines"]):
            raise HTTPException(409, "Nothing in this order is stocked by the supplier.")
        text = order_text(order)
        deliver(store, uid, bid, order, text, "order", now)
        order["messages"].append(message("owner", text, now, kind="order"))
        order["status"] = "sent"
        if order.get("replaces"):
            for old in store.supplier_orders(uid, bid):
                if old["id"] == order["replaces"] and old["status"] == "draft":
                    old["status"] = "replaced"
                    save(store, uid, bid, old, now)
    elif order.get("pending"):
        pending = order["pending"]
        if order["status"] == "cancelled":
            raise HTTPException(409, "This order is cancelled.")
        deliver(store, uid, bid, order, pending["text"], pending["kind"], now)
        order["messages"].append(message("owner", pending["text"], now, kind=pending["kind"]))
        order["pending"] = None
        if pending["kind"] == "cancel":
            order["status"] = "cancelled"
        else:
            order["status"] = "sent"
    else:
        raise HTTPException(409, "Nothing is waiting to be sent.")
    return public_order(save(store, uid, bid, order, now))


def discard(store: MerchantRepository, uid: str, bid: str, oid: str, version: int) -> dict:
    """The owner dismisses a draft order or a pending message (nothing was sent)."""
    now = time.time()
    order = get_order(store, uid, bid, oid, now)
    if order["version"] != version:
        raise HTTPException(409, "This order changed. Review it again.")
    if order["status"] == "draft":
        order["status"] = "replaced"
    elif order.get("pending"):
        order["pending"] = None
    else:
        raise HTTPException(409, "Nothing is waiting to be sent.")
    return public_order(save(store, uid, bid, order, now))


def owner_message(
    store: MerchantRepository, uid: str, bid: str, oid: str, text: str
) -> dict[str, Any]:
    """The owner typed in the supplier thread themselves: typing and pressing Send is the
    confirmation, so it is delivered at once."""
    now = time.time()
    order = get_order(store, uid, bid, oid, now)
    if order["status"] in {"draft", "replaced", "cancelled"}:
        raise HTTPException(409, "Send the order first.")
    if len(order["messages"]) >= MAX_MESSAGES:
        raise HTTPException(409, "Conversation limit reached.")
    text = " ".join(text.split())[:500]
    deliver(store, uid, bid, order, text, "text", now)
    order["messages"].append(message("owner", text, now))
    order["status"] = "sent"
    return public_order(save(store, uid, bid, order, now))


def mark_read(store: MerchantRepository, uid: str, bid: str, oid: str) -> dict[str, Any]:
    now = time.time()
    order = get_order(store, uid, bid, oid, now)
    if order.get("unread"):
        order["unread"] = False
        order = save(store, uid, bid, order, now)
    return public_order(order)


def receive(
    store: MerchantRepository, uid: str, bid: str, oid: str, version: int
) -> dict[str, Any]:
    """The delivery arrived. Marks the order received and prepares a stock update (added
    quantities, back in stock) for the matching menu items; the owner confirms it in the usual
    review, so the customer page stays accurate. Items not on the menu are left alone."""
    from .merchant import ProposalRequest

    now = time.time()
    order = get_order(store, uid, bid, oid, now)
    if order["version"] != version:
        raise HTTPException(409, "This order changed. Review it again.")
    if order["status"] not in OPEN:
        raise HTTPException(409, "Only a sent or confirmed order can be received.")
    context = store.context(uid, bid)
    changed: dict[str, ProductFields] = {}
    for line in order["lines"]:
        if line["price"] is None:
            continue
        for product in context["inventory"]:
            if not (
                matches(product["name"], line["name"]) or matches(line["name"], product["name"])
            ):
                continue
            amount = convert(line["quantity"], line["unit"], product["unit"])
            if amount is None:
                continue
            key = f"{product['name']}/{product['unit']}"
            base = changed[key].stock if key in changed else product.get("stock")
            changed[key] = ProductFields(
                name=product["name"],
                category=product.get("category", ""),
                price=product["price"],
                unit=product["unit"],
                stock=min(1_000_000, int((base or 0) + round(amount))),
                available=True,
            )
            break
    proposal = None
    if changed:
        proposal = store.propose(
            uid,
            ProposalRequest(
                kind="inventory",
                business_id=bid,
                revision=context["business"]["revision"],
                products=list(changed.values()),
            ),
        )
    order["status"] = "received"
    saved = save(store, uid, bid, order, now)
    return {"order": public_order(saved), "proposal": proposal}
