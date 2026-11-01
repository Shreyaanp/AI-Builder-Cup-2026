"""Made or bought: whether an item is stock the shop buys (and so reorders) or something it makes.

Only bought stock is ever reordered. Nothing in a product says which it is, so this infers it
once, on the safe side, from what the app already has (OB-239): the selling unit, the shop's
kind and the raw ingredients it knows. Anything else is "unknown", and the owner answers one
question ("Do you make it or buy it?") that is saved on the product.
"""

import re
from typing import Any, Literal

Source = Literal["made", "bought", "unknown"]

# A cup of chai, a plate of bun maska or a haircut is served or done here, never bought in.
SERVED_UNITS = {"cup", "glass", "plate", "bowl", "portion", "slice", "set", "hour", "service"}

# Shop kinds by their category words. The first match wins.
KINDS: tuple[tuple[str, str], ...] = (
    ("wholesale", r"wholesal|distribut|supplier|cash and carry|cash & carry|mandi"),
    ("tea", r"tea stall|tea shop|chai|kopitiam|kopi"),
    ("bakery", r"baker|patisser|cake shop"),
    ("cafe", r"caf[eé]|coffee"),
    ("sweets", r"sweet|mithai|halwai|confection"),
    ("kitchen", r"restaurant|hawker|kitchen|tiffin|dhaba|eatery|canteen|food stall|snack|diner"),
    (
        "resale",
        r"kirana|grocer|pharmac|chemist|stationer|general store|supermarket|mini ?mart|"
        r"provision|convenience",
    ),
    ("tailor", r"tailor|alteration|dressmak"),
    ("florist", r"florist|flower"),
    ("salon", r"salon|barber|hair|beauty|nail"),
)
# Shops that resell what they buy: everything on the shelf is bought.
RESALE = {"resale", "wholesale"}
# Shops whose items are work done here: a hem, a haircut, an arrangement.
SERVICES = {"tailor", "florist", "salon"}

# Raw ingredients and supplies the shop buys to make things, as the last word of a name.
RAW = {
    "milk",
    "sugar",
    "flour",
    "atta",
    "maida",
    "besan",
    "sooji",
    "rava",
    "oil",
    "ghee",
    "butter",
    "egg",
    "eggs",
    "rice",
    "dal",
    "daal",
    "lentils",
    "salt",
    "yeast",
    "paneer",
    "cream",
    "cheese",
    "jaggery",
    "onions",
    "potatoes",
    "tomatoes",
    "vegetables",
    "chini",
    "doodh",
}
RAW_PHRASES = (
    "tea dust",
    "tea leaves",
    "tea powder",
    "kopi powder",
    "coffee powder",
    "coffee beans",
    "milk powder",
    "cocoa powder",
    "baking powder",
    "paper cup",
    "carry bag",
    "takeaway box",
)
# A word before the ingredient that makes it a dish: "lemon rice", "boiled eggs", "masala milk".
DISH_WORDS = {
    "boiled",
    "soft-boiled",
    "fried",
    "fry",
    "scrambled",
    "poached",
    "steamed",
    "roasted",
    "toasted",
    "masala",
    "lemon",
    "curd",
    "jeera",
    "ghee",
    "tomato",
    "egg",
    "sambal",
    "hot",
    "iced",
    "cold",
    "sweet",
    "spicy",
    "special",
    "badam",
    "kesar",
    "dal",
}


def shop_kind(category: str) -> str:
    """The shop's kind from its category ("Tea stall" → "tea"), or "" when unknown."""
    text = (category or "").casefold()
    return next((kind for kind, pattern in KINDS if re.search(pattern, text)), "")


def raw_ingredient(name: str) -> bool:
    """'Tea dust', 'Amul milk', 'Wheat flour (atta)': a supply, not a dish made from it."""
    text = re.sub(r"\(.*?\)", " ", (name or "").casefold())
    if any(phrase in text for phrase in RAW_PHRASES):
        return True
    words = re.findall(r"[\w-]+", text)
    if not words or words[-1] not in RAW:
        return False
    return not any(word in DISH_WORDS for word in words[:-1])


def source_of(product: dict[str, Any], category: str = "") -> Source:
    """Made, bought or unknown: the owner's answer first, then the safe inference."""
    from .sourcing import unit_of

    saved = product.get("source")
    if saved in {"made", "bought"}:
        return saved
    if unit_of(product.get("unit") or "") in SERVED_UNITS:
        return "made"
    if raw_ingredient(product.get("name") or ""):
        return "bought"
    kind = shop_kind(category)
    if kind in RESALE:
        return "bought"
    if kind in SERVICES:
        return "made"
    return "unknown"


def same_kind(category: str, other: str, other_is_supplier: bool = False) -> bool:
    """A shop of the same kind as this one, never a supplier to it: a bakery does not order
    bread from another bakery, nor a tea stall samosas from another tea stall (OB-239)."""
    if other_is_supplier:
        return False
    mine, theirs = shop_kind(category), shop_kind(other)
    if mine and mine == theirs:
        return mine != "wholesale"
    return bool(category.strip()) and category.strip().casefold() == other.strip().casefold()
