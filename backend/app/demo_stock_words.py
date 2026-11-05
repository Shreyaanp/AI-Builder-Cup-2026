"""Stock counts by chat in the offline /demo coach (OB-310): "bun maska 10 more bana diye",
"samosa stock 20", "समोसा स्टॉक 20". One review card the owner confirms, like a sold-out change;
a question or a "not" ("mat banao") never changes anything. Model-free, so the public demo never
calls a paid model.
"""

from __future__ import annotations

import re
from typing import Any

from .app_guide import next_line, next_line_hi
from .contracts import StreamEvent
from .demo_coach_words import (
    ASKED,
    HI_LEAD,
    HI_NAME,
    LEAD,
    NAME,
    NEGATION,
    _reply,
    bare,
    menu_item,
    speaks_hindi,
)
from .demo_item_names import hindi_item

N = r"(?P<n>\d{1,6})"
# "bana diye", "banaye", "ready hain", "made": the owner made them, so stock goes up.
MADE = (
    r"(?:bana(?:\s+(?:diye|diya|di|liye|liya|li|gaye|gaya))?|banaye|banaya|banae|banai|bane"
    r"|ban\s+gaye|ban\s+gaya|ready|taiyar|tayyar|tayar|made|added|baked|cooked|fried)"
    r"(?:\s+(?:hai|hain|ho\s+gaye|gaye|now|ab|already))*"
)
MORE = r"(?:more|aur|extra|zyada|jyada)"
LEFT = r"(?:left|bache|bacha|bachi|remaining|in\s+stock)"
TAIL = r"(?:\s+(?:hai|hain|now|ab|kar\s+do|karo|please|only))*"
ADD = (
    re.compile(rf"{LEAD}(?P<name>{NAME})\s+{N}\s+{MORE}\s+{MADE}", re.I),
    re.compile(rf"{LEAD}{N}\s+{MORE}\s+(?P<name>{NAME})\s+{MADE}", re.I),
    re.compile(
        rf"(?:(?:i|we)\s+(?:have\s+|just\s+)?)?(?:made|baked|cooked|fried|added)\s+{N}\s+"
        rf"(?:more\s+)?(?P<name>{NAME})(?:\s+(?:now|just\s+now|today))?",
        re.I,
    ),
)
SET = (
    re.compile(
        rf"{LEAD}(?P<name>{NAME})\s+(?:ka\s+|ki\s+|ke\s+)?(?:stock|count)\s+"
        rf"(?:(?:is|hai|now|ab|to|=)\s+)*{N}{TAIL}",
        re.I,
    ),
    re.compile(rf"{LEAD}(?P<name>{NAME})\s+{N}\s+{LEFT}{TAIL}", re.I),
    re.compile(rf"(?:only\s+)?{N}\s+(?P<name>{NAME})\s+{LEFT}{TAIL}", re.I),
    re.compile(
        rf"(?:please\s+)?(?:set|change|make)\s+(?:the\s+)?stock\s+(?:of\s+|for\s+)?"
        rf"(?P<name>{NAME})\s+(?:to|=)\s+{N}",
        re.I,
    ),
)
# Hindi, read without the nukta (bare): "ज़्यादा" is "ज्यादा".
HI_MADE = (
    r"(?:बना\s+(?:दिए|दिये|लिए|लिये|दी|ली|दिया|लिया)|बनाए|बनाये|बनाई|बनाया|बन\s+(?:गए|गये|गया|गई)"
    r"|तैयार(?:\s+(?:किए|किये|किया|हो\s+गए|हो\s+गये|हैं|है))?)(?:\s+(?:है|हैं|अब))*"
)
HI_ADD = (
    re.compile(rf"{HI_LEAD}(?P<name>{HI_NAME})\s+{N}\s+(?:और|ज्यादा|एक्स्ट्रा)\s+{HI_MADE}"),
    re.compile(rf"{HI_LEAD}{N}\s+(?:और\s+)(?P<name>{HI_NAME})\s+{HI_MADE}"),
)
HI_SET = (
    re.compile(
        rf"{HI_LEAD}(?P<name>{HI_NAME})\s+(?:का\s+|की\s+|के\s+)?(?:स्टॉक|स्टाक)\s+(?:अब\s+)?{N}"
        r"(?:\s+(?:है|हैं|कर\s+दो|करो|बचे|बचा|बची))*"
    ),
    re.compile(rf"{HI_LEAD}(?P<name>{HI_NAME})\s+(?:अब\s+)?{N}\s+(?:बचे|बचा|बची)(?:\s+(?:हैं|है))?"),
)
MAX_STOCK = 1_000_000


def _said(text: str) -> tuple[str, str, int] | None:
    """("add" or "set", the item as said, the number) for the whole message, or None."""
    hindi = bool(re.search(r"[ऀ-ॿ]", text))
    for kind, patterns in (("add", HI_ADD if hindi else ADD), ("set", HI_SET if hindi else SET)):
        for pattern in patterns:
            if found := pattern.fullmatch(text):
                return kind, found["name"], int(found["n"])
    return None


def stock_change(ctx: Any, question: str) -> list[StreamEvent] | None:
    """A stock count for one saved item, for the owner to confirm (OB-310)."""
    from .coordinator import ProductInput
    from .demo_coach import DEMO_NOTE_HI, _priced, _teach

    text = bare(question)
    if "?" in question or ASKED.match(text) or NEGATION.search(text):
        return None
    said = _said(text)
    if not said:
        return None
    kind, name, number = said
    context = ctx.store.context(ctx.uid, ctx.business_id)
    inventory = context["inventory"]
    sold: dict[str, float] = {}
    for row in ctx.store.sales_history(ctx.uid, ctx.business_id):
        sold[row["item"]] = sold.get(row["item"], 0) + float(row["quantity"])
    item = menu_item(name, inventory, sold)
    if not item or (kind == "add" and number == 0):
        return None
    before = item.get("stock")
    after = min((before or 0) + number if kind == "add" else number, MAX_STOCK)
    hindi = speaks_hindi(question)
    shown = hindi_item(item["name"]) if hindi else item["name"]
    if before == after:
        if hindi:
            return [_reply(f"डेमो में {shown} पहले से {after} बचे हैं। {next_line_hi('price_change')}")]
        return [
            _reply(
                f"{shown} already has {after} left on your demo menu. {next_line('price_change')}"
            )
        ]
    change = ProductInput(
        name=item["name"],
        unit=item["unit"],
        stock=after,
        available=item.get("available") is not False,
    )
    events = _priced(ctx, [change])
    if not events:
        return None
    if hindi:
        was = "गिनती नहीं" if before is None else f"{before} बचे"
        text_hi = (
            f"मैंने यह आपके जाँचने के लिए तैयार किया है: {shown} {was} → {after} बचे। स्क्रीन पर "
            f"पक्का करें। {DEMO_NOTE_HI} {next_line_hi('price_change')}"
        )
        return [*events[:-1], _reply(text_hi)]
    return _teach(events, "price_change")
