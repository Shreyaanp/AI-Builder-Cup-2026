"""Starter items per business type: likely items and units the owner can confirm.

These are SUGGESTIONS only. They carry no prices (the owner says them) and nothing is proposed
until the owner picks items; a menu photo, document or POS import stays the source of truth.
"""

import re
from typing import Any

# (pattern on category + name, business type, [(item, unit, section)])
TEMPLATES: tuple[tuple[str, str, tuple[tuple[str, str, str], ...]], ...] = (
    (
        r"\b(?:tea|chai|chaa|tapri)\b",
        "tea shop",
        (
            ("Masala chai", "cup", "Tea"),
            ("Cutting chai", "cup", "Tea"),
            ("Ginger tea", "cup", "Tea"),
            ("Samosa", "piece", "Snacks"),
            ("Bun maska", "piece", "Snacks"),
            ("Vada pav", "piece", "Snacks"),
            ("Biscuits", "pack", "Snacks"),
        ),
    ),
    (
        r"kopi|kopitiam|hawker",
        "kopitiam",
        (
            ("Kopi", "cup", "Drinks"),
            ("Teh", "cup", "Drinks"),
            ("Kopi C", "cup", "Drinks"),
            ("Kaya toast", "set", "Breakfast"),
            ("Soft-boiled eggs", "set", "Breakfast"),
            ("Mee goreng", "plate", "Mains"),
        ),
    ),
    (
        r"bak(?:e|ery|er)|cake|pastr|patisserie",
        "bakery",
        (
            ("Bread loaf", "piece", "Bread"),
            ("Croissant", "piece", "Pastries"),
            ("Cupcake", "piece", "Cakes"),
            ("Birthday cake", "kg", "Cakes"),
            ("Cookies", "box", "Cookies"),
            ("Puff", "piece", "Snacks"),
        ),
    ),
    (
        r"caf[eé]|coffee|espresso",
        "cafe",
        (
            ("Cappuccino", "cup", "Coffee"),
            ("Latte", "cup", "Coffee"),
            ("Cold coffee", "glass", "Coffee"),
            ("Sandwich", "piece", "Food"),
            ("Brownie", "piece", "Desserts"),
        ),
    ),
    (
        r"tailor|stitch|boutique|alteration",
        "tailor",
        (
            ("Blouse stitching", "service", "Stitching"),
            ("Kurta stitching", "service", "Stitching"),
            ("Trouser alteration", "service", "Alterations"),
            ("Saree fall and pico", "service", "Alterations"),
            ("School uniform", "service", "Stitching"),
        ),
    ),
    (
        r"flor|flower|garland",
        "florist",
        (
            ("Rose bouquet", "piece", "Bouquets"),
            ("Marigold garland", "piece", "Garlands"),
            ("Wedding decoration", "service", "Events"),
            ("Loose roses", "dozen", "Flowers"),
        ),
    ),
    (
        r"salon|barber|hair|beauty|parlou?r",
        "salon",
        (
            ("Haircut", "service", "Hair"),
            ("Beard trim", "service", "Hair"),
            ("Hair colour", "service", "Hair"),
            ("Facial", "service", "Skin"),
            ("Threading", "service", "Skin"),
        ),
    ),
    (
        r"grocer|kirana|provision|general store|mart|supermarket",
        "grocery",
        (
            ("Rice", "kg", "Staples"),
            ("Atta", "kg", "Staples"),
            ("Toor dal", "kg", "Staples"),
            ("Sugar", "kg", "Staples"),
            ("Cooking oil", "litre", "Staples"),
            ("Milk", "litre", "Dairy"),
        ),
    ),
    (
        r"repair|mobile|phone|laptop|electronic",
        "repair shop",
        (
            ("Screen replacement", "service", "Repairs"),
            ("Battery replacement", "service", "Repairs"),
            ("Phone cover", "piece", "Accessories"),
            ("Charger", "piece", "Accessories"),
            ("Diagnosis", "service", "Repairs"),
        ),
    ),
    (
        r"tuition|tutor|class|coaching|academy",
        "tuition centre",
        (
            ("Maths class", "hour", "Classes"),
            ("Science class", "hour", "Classes"),
            ("English class", "hour", "Classes"),
            ("Trial lesson", "service", "Classes"),
        ),
    ),
    (
        r"restaurant|dhaba|biryani|mess|canteen|food|kitchen|tiffin",
        "restaurant",
        (
            ("Veg thali", "plate", "Meals"),
            ("Chicken biryani", "plate", "Mains"),
            ("Paneer butter masala", "plate", "Mains"),
            ("Roti", "piece", "Breads"),
            ("Lassi", "glass", "Drinks"),
        ),
    ),
)


def business_type(category: str, name: str = "") -> str | None:
    text = f"{category} {name}".casefold()
    return next((kind for pattern, kind, _ in TEMPLATES if re.search(pattern, text)), None)


def starter_items(
    category: str, name: str = "", existing: list[str] | None = None, limit: int = 6
) -> dict[str, Any]:
    """Suggested items for this kind of business, without prices, minus what is on the menu."""
    text = f"{category} {name}".casefold()
    have = {item.casefold() for item in existing or []}
    for pattern, kind, items in TEMPLATES:
        if re.search(pattern, text):
            return {
                "business_type": kind,
                "suggestions": [
                    {"name": item, "unit": unit, "category": section}
                    for item, unit, section in items
                    if item.casefold() not in have
                ][:limit],
            }
    return {"business_type": None, "suggestions": []}
