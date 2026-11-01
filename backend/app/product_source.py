"""Made or bought: whether an item is stock the shop buys (and so reorders) or something it makes.

Only bought stock is ever reordered. Nothing in a product says which it is, so this infers it
once, on the safe side, from what the app already has (OB-239): the selling unit, the shop's
kind and the raw ingredients it knows. Anything else is "unknown", and the owner answers one
question ("Do you make it or buy it?") that is saved on the product.
"""

import re
import unicodedata
from typing import Any, Literal

Source = Literal["made", "bought", "unknown"]

# A cup of chai, a plate of bun maska or a haircut is served or done here, never bought in.
SERVED_UNITS = {"cup", "glass", "plate", "bowl", "portion", "slice", "set", "hour", "service"}

# Shop kinds by the whole words of their category, in English, Hinglish and the scripts owners
# write in. The first match wins. Whole words only: "Mandir prasad" is no mandi, "Chair store" no
# chai stall and "Kitchenware store" no kitchen (OB-244).
KINDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("wholesale", (
        r"wholesal(?:e|er|ers|ing)", r"distribut(?:or|ors|ion)", r"suppliers?",
        r"cash (?:and|&) carry", r"mandi", r"thok", "थोक", "मंडी", "वितरक",
    )),
    ("tea", (
        r"teas?", r"chai", r"chai ?wall?a", r"tapri", r"kopitiam", r"kopi", "चाय", "चायवाला",
        "टी स्टॉल", "टी स्टाल", "চা", "চায়ের", "டீக்கடை", "டீ கடை",
    )),
    ("bakery", (
        r"bak(?:er|ers|ery|eries)", r"bake ?house", r"patisser(?:ie|ies)", r"cakes?",
        "बेकरी", "केक", "বেকারি", "பேக்கரி", "బేకరీ", "ಬೇಕರಿ", "ബേക്കറി",
    )),
    ("cafe", (r"caf[eé]s?", r"kafe", r"coffee", "कैफे", "कैफ़े", "कॉफी", "कॉफ़ी")),
    ("sweets", (
        r"sweets?", r"mithai", r"mithai ?wala", r"halwaa?i", r"mis?h?th?ann?",
        r"confection(?:er|ers|ery|ary)", "मिठाई", "मिठाईवाला", "हलवाई", "मिष्ठान", "मिष्ठान्न",
        "মিষ্টি", "মিষ্টির", "মিষ্টান্ন", "இனிப்பு",
    )),
    ("kitchen", (
        r"restaurants?", r"hawkers?", r"kitchens?", r"tiffins?", r"dhabas?", r"eater(?:y|ies)",
        r"canteens?", r"cafeteria", r"food (?:stall|court|truck)s?", r"snacks?", r"diners?",
        r"caterers?", r"catering", r"bhoja?nalaya", r"fast food", r"warung",
        r"(?:kedai|rumah) makan",
        "रेस्टोरेंट", "रेस्टोरेन्ट", "रेस्तरां", "ढाबा", "भोजनालय", "टिफिन", "कैंटीन",
    )),
    ("resale", (
        r"kir(?:a|aa|ya)na", r"grocer(?:s|y|ies)?", r"pharmac(?:y|ies|ist|ists)", r"chemists?",
        r"druggists?", r"medicals?", r"dawaa?i?", r"stationer(?:s|y)?", r"stationary",
        r"general stores?", r"(?:super|hyper)markets?", r"mini ?marts?", r"provisions?",
        r"convenience", r"department(?:al)? stores?", r"parchun", "किराना", "किराने", "परचून",
        "जनरल स्टोर", "दवा", "दवाई", "दवाइयां", "दवाइयाँ", "मेडिकल", "केमिस्ट", "फार्मेसी",
        "स्टेशनरी", "सुपरमार्केट", "মুদি", "மளிகை",
    )),
    ("tailor", (
        r"tailor(?:s|ing)?", r"alterations?", r"dressmak(?:er|ers|ing)", r"dar[zj]i", "दर्जी",
        "टेलर", "सिलाई", "দর্জি",
    )),
    ("florist", (r"florists?", r"flowers?", r"phool", r"phool ?wala", "फूल", "फूलवाला", "ফুল")),
    ("salon", (
        r"salons?", r"saloon", r"barbers?", r"barber ?shop", r"hair ?dress(?:er|ers|ing)",
        r"hair ?cut(?:s|ting)?", r"hair (?:stylist|studio)s?", r"beauty (?:parlou?r|salon|studio)",
        r"beauticians?", r"nail (?:studio|art|bar|spa)", "सैलून", "सलून", "नाई", "ब्यूटी पार्लर",
    )),
)  # fmt: skip
# A letter of any script, with the vowel signs Python's \w leaves out of Indian scripts.
LETTER = r"[\w\u0900-\u0dff]"
PATTERNS = tuple(
    (
        kind,
        re.compile(
            unicodedata.normalize("NFC", rf"(?<!{LETTER})(?:{'|'.join(words)})(?!{LETTER})")
        ),
    )
    for kind, words in KINDS
)
# Shops that resell what they buy: everything on the shelf is bought.
RESALE = {"resale", "wholesale"}
# Shops whose items are work done here: a hem, a haircut, an arrangement.
SERVICES = {"tailor", "florist", "salon"}
# Shops that cook or make what they sell.
FOOD = {"tea", "bakery", "cafe", "sweets", "kitchen"}
# Kinds that sell to the same customers, so never each other's suppliers: a café is a tea stall's
# rival, not where it buys tea dust.
RIVALS = {"cafe": "tea"}
# A DISH_RAW name a food shop sells by these may be the dish ("Dal" by the plate): asked.
DISH_UNITS = {"item", "plate", "bowl"}
# Raw names that are also the dish: "Dal", "Rice" or "Paneer" on a menu.
DISH_RAW = {"dal", "daal", "rice", "paneer"}

# Raw ingredients and supplies the shop buys to make things, as the whole name.
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
    "toned milk",
    "double toned milk",
    "full cream milk",
    "whole milk",
    "fresh milk",
    "fresh cream",
    "double cream",
    "cooking oil",
    "refined oil",
    "sunflower oil",
    "mustard oil",
    "groundnut oil",
    "table salt",
    "iodised salt",
    "iodized salt",
    "dry yeast",
    "active dry yeast",
    "instant yeast",
)
# Words that only say which supply it is (a brand, a grain or a kind of dal), never a dish:
# "Wheat flour", "Amul milk", "Toor dal". Anything else before the raw word may be a dish
# ("Palak paneer", "Rose milk", "Mustard rice"), so the owner is asked (OB-239).
BRANDS = {"amul", "nandini", "mother", "dairy", "aashirvaad", "fortune", "tata"}
SUPPLY_WORDS = BRANDS | {
    "wheat",
    "basmati",
    "sona",
    "masoori",
    "ponni",
    "toor",
    "arhar",
    "moong",
    "urad",
    "masoor",
    "chana",
    "all-purpose",
}
# Work done here (a haircut, an hour of alterations), never stock on a shelf.
SERVICE_UNITS = {"service", "hour"}


def shop_kind(category: str) -> str:
    """The shop's kind from its category ("Tea stall" → "tea"), or "" when unknown."""
    text = unicodedata.normalize("NFC", (category or "").casefold())
    return next((kind for kind, pattern in PATTERNS if pattern.search(text)), "")


def raw_ingredient(name: str) -> bool:
    """'Milk', 'Tea dust', 'Wheat flour (atta)': a bare supply, not a dish made from it. Only the
    raw word or phrase itself, after words that just name the supply, counts (OB-239)."""
    text = re.sub(r"\(.*?\)", " ", (name or "").casefold())
    words = re.findall(r"[\w-]+", text)
    while len(words) > 1 and words[0] in SUPPLY_WORDS:
        words = words[1:]
    return " ".join(words) in RAW_PHRASES or (len(words) == 1 and words[0] in RAW)


def served_raw(name: str) -> bool:
    """'Dal', 'Moong dal', 'Basmati rice', 'Paneer': a supply a kitchen also serves as a dish of the
    same name. A brand ('Fortune basmati rice') is the packet (OB-244)."""
    words = re.findall(r"[\w-]+", re.sub(r"\(.*?\)", " ", (name or "").casefold()))
    return bool(words) and words[0] not in BRANDS and words[-1] in DISH_RAW


def source_of(product: dict[str, Any], category: str = "") -> Source:
    """Made, bought or unknown: the owner's answer first, then the safe inference."""
    from .sourcing import unit_of

    saved = product.get("source")
    if saved in {"made", "bought"}:
        return saved
    kind = shop_kind(category)
    # A kirana's "Soap gift set" or "Steel glass" is on the shelf to resell, never made.
    if kind in RESALE:
        return "bought"
    unit = unit_of(product.get("unit") or "")
    if kind in SERVICES:
        # A haircut or an hour of alterations is work done here; shampoo, roses or thread may
        # be stock the shop buys, so anything else is asked, never "Make more".
        if unit in SERVICE_UNITS:
            return "made"
        return "bought" if raw_ingredient(product.get("name") or "") else "unknown"
    name = product.get("name") or ""
    # "Dal" or "Paneer" by the plate at a restaurant may be the dish or the supply: asked. The
    # same by the kg or pack, or "Milk" by the item, is still bought (OB-244).
    if kind in FOOD and unit in DISH_UNITS and raw_ingredient(name) and served_raw(name):
        return "unknown"
    if unit in SERVED_UNITS:
        return "made"
    if raw_ingredient(name):
        return "bought"
    return "unknown"


def same_kind(category: str, other: str, other_is_supplier: bool = False) -> bool:
    """A shop of the same kind as this one, never a supplier to it: a bakery does not order
    bread from another bakery, nor a tea stall samosas from another tea stall or a café (OB-239,
    OB-244)."""
    if other_is_supplier:
        return False
    mine, theirs = (RIVALS.get(k, k) for k in (shop_kind(category), shop_kind(other)))
    if mine and mine == theirs:
        return mine != "wholesale"
    return bool(category.strip()) and category.strip().casefold() == other.strip().casefold()


def answered_item(
    item: str, inventory: list[dict[str, Any]], source: str
) -> tuple[dict[str, Any] | None, list[str]]:
    """The one item an owner's "I make chai" is about: the exact name, else the only item whose
    name ends with it and fits the answer: "Masala chai" is made, "Amul milk" is bought. Never
    "Milk bread" for "milk", "Tea dust" for "chai" or "Coconut rice" for "I buy rice". Otherwise
    None, and the items they may mean, to ask which (OB-239)."""
    from .sourcing import matches

    def said(name: str) -> list[str]:
        text = re.sub(r"\(.*?\)", " ", name.casefold())
        return [w[:-1] if len(w) > 3 and w.endswith("s") else w for w in re.findall(r"\w+", text)]

    wanted = said(item)
    if not wanted:
        return None, []
    exact = [p for p in inventory if said(p["name"]) == wanted]
    ends = exact or [
        p
        for p in inventory
        if said(p["name"])[-len(wanted) :] == wanted
        and raw_ingredient(p["name"]) == (source == "bought")
    ]
    if len(ends) == 1:
        return ends[0], []
    loose = ends or [p for p in inventory if matches(p["name"], item)]
    return None, [p["name"] for p in loose][:4]
