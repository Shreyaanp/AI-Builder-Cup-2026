"""Supplier prices side by side (OB-265): one unit, and which is cheapest and nearest.

A price per litre next to a price per pack cannot be compared by eye or by `min()`. A pack counts
only when its size is known: from its name ("Milk 500 ml"), or the demo catalogue's own table. A
pack of unknown size is never guessed: it keeps its own unit and is left out of "Cheapest".
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from .sourcing import MASS, VOLUME, convert, unit_of

SIZE = re.compile(r"(\d+(?:\.\d+)?)\s*(kgs?|gms?|grams?|g|litres?|liters?|ltr|l|ml)\b", re.I)
# What the demo shops mean by "a pack of milk"; a real shop's pack says its size in its name.
DEMO_PACKS: dict[str, tuple[float, str]] = {"milk": (500.0, "ml")}


def base_of(unit: str) -> str | None:
    unit = unit_of(unit)
    return "kg" if unit in MASS else "litre" if unit in VOLUME else None


def pack_size(product: dict[str, Any], demo: bool = False) -> tuple[float, str] | None:
    """What one pack holds, when that is known."""
    name = str(product.get("name") or "")
    found = SIZE.search(name)
    if found and float(found.group(1)) > 0:
        return float(found.group(1)), unit_of(found.group(2))
    return DEMO_PACKS.get(name.strip().casefold()) if demo else None


def per_common_unit(product: dict[str, Any], demo: bool = False) -> tuple[float, str]:
    """The price per kg or litre when the size allows it, else per the product's own unit."""
    unit = unit_of(str(product.get("unit") or ""))
    price = float(product["price"])
    base = base_of(unit)
    amount = convert(1.0, unit, base) if base else None
    size = None if base else pack_size(product, demo)
    if size and (base := base_of(size[1])):
        amount = convert(size[0], size[1], base)
    return (round(price / amount, 2), str(base)) if amount else (price, unit)


def in_supplier_unit(
    quantity: float, unit: str, product: dict[str, Any], demo: bool = False
) -> float | None:
    """The owner's amount in what the supplier sells: 10 litres is 20 half-litre packs. Whole
    packs only, rounded up, so the shop is never short. None when it does not convert."""
    theirs = str(product.get("unit") or "")
    direct = convert(quantity, unit or theirs, theirs)
    if direct is not None:
        return direct
    size = pack_size(product, demo)
    held = convert(quantity, unit, size[1]) if size else None
    return float(math.ceil(round(held / size[0], 6))) if held is not None and size else None


def compare_cards(cards: list[dict[str, Any]]) -> dict[str, str | None]:
    """Adds `compare`, `pack` and `tags` to each card; returns the cheapest and nearest ids."""
    priced = [per_common_unit(card["item"], bool(card.get("demo"))) for card in cards]
    common = Counter(unit for _, unit in priced).most_common(1)[0][0] if priced else ""
    for card, (price, unit) in zip(cards, priced, strict=True):
        item = card["item"]
        same = unit == common
        card["compare"] = {"price": price, "unit": unit} if same else None
        own = unit_of(str(item.get("unit") or ""))
        size = pack_size(item, bool(card.get("demo"))) if own != unit else None
        card["pack"] = (
            {"price": item["price"], "unit": own, "size": f"{size[0]:g} {size[1]}"}
            if size and same
            else None
        )
        card["tags"] = []
    comparable = [card for card in cards if card["compare"] and card["item"].get("available", True)]
    cheapest = min(comparable, key=lambda card: card["compare"]["price"], default=None)
    nearest = min(cards, key=lambda card: card["distance_km"], default=None)
    if len(cards) > 1:
        if cheapest and len(comparable) > 1:
            cheapest["tags"].append("cheapest")
        if nearest:
            nearest["tags"].append("nearest")
    return {
        "cheapest_id": cheapest["id"] if cheapest else None,
        "nearest_id": nearest["id"] if nearest else None,
    }


ORDINALS = {
    "first": 1,
    "1st": 1,
    "pehla": 1,
    "pehle": 1,
    "second": 2,
    "2nd": 2,
    "doosra": 2,
    "dusra": 2,
    "doosre": 2,
    "dusre": 2,
    "third": 3,
    "3rd": 3,
    "teesra": 3,
    "teesre": 3,
    "fourth": 4,
    "4th": 4,
}
ORDINALS_HI = {"पहला": 1, "पहले": 1, "दूसरा": 2, "दूसरे": 2, "तीसरा": 3, "तीसरे": 3}
NUMBER_WORDS = {"one": 1, "two": 2, "three": 3}
CHEAP = re.compile(r"cheap|sasta|sasti|सस्त", re.I)
NEAR = re.compile(r"near|closest|nazdeek|najdeek|paas wala|नज़दीक|नजदीक|पास वाला|सबसे पास", re.I)
NUMBER = re.compile(r"(?:\b(?:number|no\.?|#)|नंबर)\s*(\d|one|two|three)\b", re.I)


def _plain_name(name: str) -> str:
    return re.sub(r"\s*\(demo\)\s*$", "", name, flags=re.I).strip().casefold()


def pick_supplier(text: str, found: dict[str, Any]) -> str | None:
    """The supplier the owner's words point to, or None: nobody is picked for them (OB-265)."""
    suppliers = found.get("suppliers") or []
    if not suppliers:
        return None
    lowered = text.casefold()
    named = [s for s in suppliers if _plain_name(str(s.get("name") or "")) in lowered]
    if named:
        return str(max(named, key=lambda s: len(str(s["name"])))["id"])
    for pattern, key in ((CHEAP, "cheapest_id"), (NEAR, "nearest_id")):
        if pattern.search(lowered):
            return str(found[key]) if found.get(key) else None
    number = NUMBER.search(lowered)
    if number:
        said = number.group(1)
        rank = int(said) if said.isdigit() else NUMBER_WORDS[said]
        return str(suppliers[rank - 1]["id"]) if 0 < rank <= len(suppliers) else None
    for word, rank in ORDINALS.items():
        if re.search(rf"\b{word}\b", lowered) and rank <= len(suppliers):
            return str(suppliers[rank - 1]["id"])
    for word, rank in ORDINALS_HI.items():
        if word in text and rank <= len(suppliers):
            return str(suppliers[rank - 1]["id"])
    return None
