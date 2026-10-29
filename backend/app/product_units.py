"""The fixed list of selling units. The coach, photo reads and imports output one of these;
legacy free-text units stay as saved until the owner picks one (the app maps known synonyms
for display)."""

import re

UNITS = (
    "item",
    "piece",
    "cup",
    "glass",
    "bottle",
    "plate",
    "bowl",
    "set",
    "portion",
    "slice",
    "pack",
    "box",
    "dozen",
    "kg",
    "g",
    "litre",
    "ml",
    "hour",
    "service",
)

# Spellings, plurals and abbreviations seen on boards, POS exports and in chat.
SYNONYMS = {
    "each": "item",
    "ea": "item",
    "unit": "item",
    "units": "item",
    "items": "item",
    "pc": "piece",
    "pcs": "piece",
    "pieces": "piece",
    "cups": "cup",
    "mug": "cup",
    "glasses": "glass",
    "bottles": "bottle",
    "btl": "bottle",
    "can": "bottle",
    "cans": "bottle",
    "plates": "plate",
    "bowls": "bowl",
    "sets": "set",
    "combo": "set",
    "meal": "set",
    "portions": "portion",
    "serving": "portion",
    "servings": "portion",
    "serve": "portion",
    "slices": "slice",
    "packs": "pack",
    "packet": "pack",
    "packets": "pack",
    "pkt": "pack",
    "bag": "pack",
    "bags": "pack",
    "boxes": "box",
    "doz": "dozen",
    "kgs": "kg",
    "kilo": "kg",
    "kilos": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "gm": "g",
    "gram": "g",
    "grams": "g",
    "gr": "g",
    "l": "litre",
    "ltr": "litre",
    "liter": "litre",
    "liters": "litre",
    "litres": "litre",
    "millilitre": "ml",
    "milliliter": "ml",
    "hr": "hour",
    "hrs": "hour",
    "hours": "hour",
    "session": "service",
    "services": "service",
    "job": "service",
}


def known_unit(text: str) -> str | None:
    """The canonical unit for a known spelling, else None."""
    key = re.sub(r"^(per|a|an|1)\s+", "", " ".join((text or "").casefold().split())).strip(". ")
    if key in UNITS:
        return key
    return SYNONYMS.get(key)


def normalize_unit(text: str) -> str:
    """One of UNITS for new data; anything unrecognised becomes "item"."""
    return known_unit(text) or "item"


# OB-213: models sometimes read the price tag's "Rs" as the unit and the board's title as a section.
CURRENCY_WORDS = {
    "rs", "inr", "rupee", "rupees", "usd", "sgd", "idr", "rp", "dollar", "dollars", "s", "us",
}  # fmt: skip
EMPTY_WORDS = {"", "null", "none", "n/a", "na", "nil", "-"}  # a missing value the model spelled out
HEADING_NOISE = {
    "menu", "menu card", "our menu", "the menu", "food menu", "price list", "rate list",
    "price", "prices", "rates", "list", "mrp",
}  # fmt: skip


def clean_unit(text: str) -> str:
    """A unit that is only a currency token ("Rs", "₹", "S$", "Rp 20") is really "item"."""
    if (text or "").strip().casefold() in EMPTY_WORDS:
        return "item"
    words = re.findall(r"[^\W\d_]+", (text or "").casefold())
    has_symbol = bool(re.search(r"[$₹€£]", text or ""))
    if (words or has_symbol) and all(word in CURRENCY_WORDS for word in words):
        return "item"
    return text


def clean_category(text: str, shop_name: str = "") -> str:
    """A category that is the menu's title or the shop's own name is not a section: empty."""
    key = " ".join(re.sub(r"[^\w\s]", " ", (text or "").casefold()).split())
    shop = " ".join(re.sub(r"[^\w\s]", " ", (shop_name or "").casefold()).split())
    if key in HEADING_NOISE or key in EMPTY_WORDS or (shop and key == shop):
        return ""
    return text
