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
