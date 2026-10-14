"""Draft category suggestions for extracted items; the owner still reviews the proposal."""

import re


def suggest_category(name: str, stated: str = "") -> str:
    if stated.strip():
        return stated.strip()[:80]
    for category, pattern in (
        (
            "drinks",
            r"\b(kopi|teh|tea|coffee|juice|latte|soda|water|milk|chai)\b|咖啡|茶|ジュース|커피|น้ำ",
        ),
        ("desserts", r"\b(cake|ice cream|dessert|pudding|cookie|pastry)\b|蛋糕|甜点|ケーキ|케이크"),
        (
            "food",
            r"\b(toast|rice|noodle|egg|sandwich|soup|bread|bento|laksa|nasi|mee|puff)\b|饭|麵|面|パン|밥",
        ),
        ("services", r"\b(cut|haircut|repair|massage|lesson|consultation)\b|理发|修理|수리"),
    ):
        if re.search(pattern, name, re.I):
            return category
    return "other"
