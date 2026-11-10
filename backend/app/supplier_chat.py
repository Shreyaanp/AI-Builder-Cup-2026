"""The supplier list, by chat (OB-223, OB-265): compare it, save from it, order from a pick.

The same answer on the coach, the offline coach and the public demo, with no model call, and
through the same functions as the taps. A "don't" does nothing. English and Hindi are answered
here, in the language the owner chose; other languages go to the model, which has the same tools.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import supplier_book
from .contracts import StreamEvent
from .demo_item_names import HINDI_UNITS
from .money import to_minor
from .order_words import read_order
from .sourcing import OrderItem, matches, money_text
from .supplier_compare import in_supplier_unit, pick_supplier

NEGATION = re.compile(r"\b(?:don'?t|do not|never|not|mat|nahi|nahin)\b|मत(?![ऀ-ॿ])|नहीं", re.I)
COMPARE = re.compile(
    r"\b(?:compare|cheapest|cheaper|nearest|closest|sabse sasta|sasta|sasti|sabse paas|nazdeek|"
    r"najdeek)\b|तुलना|सस्ता|सस्ती|नज़दीक|नजदीक|सबसे पास",
    re.I,
)
ORDER = re.compile(r"\b(?:order|mangao|mangwao|bhejo|take|go with)\b|ऑर्डर|मँगा|मंगा", re.I)
SAVE = re.compile(r"\b(?:save|remember)\b|my supplier|mera supplier|सेव|याद रख|मेरा सप्लायर", re.I)
REMOVE = re.compile(r"\b(?:remove|forget|unsave|hatao)\b|हटा", re.I)


@dataclass
class Answer:
    intent: str
    reply: str
    events: list[StreamEvent] = field(default_factory=list)


def _card(search: dict[str, Any], sid: str | None) -> dict[str, Any] | None:
    return next((card for card in search["suppliers"] if card["id"] == sid), None)


def _price(card: dict[str, Any], currency: str, hindi: bool) -> tuple[str, str]:
    shown = card.get("compare") or card["item"]
    unit = str(shown["unit"])
    return (
        money_text(to_minor(float(shown["price"]), currency), currency),
        HINDI_UNITS.get(unit, unit) if hindi else unit,
    )


def compared(search: dict[str, Any], hindi: bool) -> str:
    cards = search["suppliers"]
    currency = str(search["currency"])
    if len(cards) < 2:
        name = cards[0]["name"]
        return (
            f"पास में सिर्फ़ {name} यह बेचते हैं, इसलिए अभी तुलना नहीं हो सकती। ऑर्डर दबाकर आगे बढ़ें।"
            if hindi
            else f"Only {name} sells this nearby, so there is nothing to compare yet. "
            "Tap Order if you want it."
        )
    cheapest, nearest = (
        _card(search, search.get("cheapest_id")),
        _card(search, search.get("nearest_id")),
    )
    parts = []
    if cheapest:
        price, unit = _price(cheapest, currency, hindi)
        parts.append(
            f"सबसे सस्ता: {cheapest['name']}, {price} प्रति {unit}।"
            if hindi
            else f"Cheapest: {cheapest['name']}, {price} a {unit}."
        )
    if nearest:
        parts.append(
            f"सबसे पास: {nearest['name']}, {nearest['distance_km']:g} किमी।"
            if hindi
            else f"Nearest: {nearest['name']}, {nearest['distance_km']:g} km."
        )
    parts.append("जिससे लेना हो, उस पर ऑर्डर दबाएँ।" if hindi else "Tap Order on the one you want.")
    return " ".join(parts)


def _saving(ctx: Any, search: dict[str, Any], card: dict[str, Any], hindi: bool) -> Answer:
    supplier_book.save(ctx.store, ctx.uid, ctx.business_id, card["id"])
    name = card["name"]
    return Answer(
        "save_supplier",
        f"{name} को मेरे सप्लायर में जोड़ दिया।" if hindi else f"{name} is on My suppliers now.",
        [StreamEvent(kind="supplier_saved", data={"supplier_id": card["id"], "saved": True})],
    )


def _removing(ctx: Any, card: dict[str, Any], hindi: bool) -> Answer:
    supplier_book.remove(ctx.store, ctx.uid, ctx.business_id, card["id"])
    name = card["name"]
    return Answer(
        "remove_supplier",
        f"{name} को मेरे सप्लायर से हटा दिया।" if hindi else f"{name} is off My suppliers.",
        [StreamEvent(kind="supplier_saved", data={"supplier_id": card["id"], "saved": False})],
    )


def _ordering(ctx: Any, text: str, search: dict[str, Any], card: dict[str, Any]) -> Answer | None:
    from .coordinator import prepare_order

    said = next((line for line in read_order(text).lines if line.quantity and line.unit), None)
    amount = float(said.quantity or 0) if said else search.get("quantity")
    unit = said.unit if said else search.get("unit") or ""
    demo = bool(card.get("demo"))
    quantity = in_supplier_unit(float(amount), str(unit), card["item"], demo) if amount else None
    items = [
        OrderItem(name=card["item"]["name"], quantity=quantity or 1.0, unit=card["item"]["unit"])
    ]
    note = "" if quantity or not said else text
    drafted = prepare_order(card["id"], items, note)
    built = ctx.cards.get(str(drafted.get("card_id")))
    if drafted.get("status") != "needs_owner_tap" or not built:
        return None
    from .agent import ui_language

    hindi = ui_language.get().split("-")[0] == "hi"
    return Answer(
        "prepare_order",
        f"{card['name']} को भेजने का ऑर्डर नीचे तैयार है। भेजें दबाने तक कुछ नहीं जाएगा।"
        if hindi
        else f"Your order to {card['name']} is ready below. Nothing goes until you tap Send.",
        [StreamEvent(kind="order", data=built[1])],
    )


def _about_this_list(text: str, search: dict[str, Any]) -> bool:
    """An amount of something else ("20 litre sugar" after a milk list) is not about this list."""
    named = [
        re.sub(r"\bfrom\b.*$", "", line.item, flags=re.I).strip()
        for line in read_order(text).lines
        if line.quantity and line.item
    ]
    named = [item for item in named if item]
    return not named or any(matches(str(search.get("item") or ""), item) for item in named)


def answer(ctx: Any, message: str, ordering: bool = False) -> Answer | None:
    """What the owner asked about the last supplier list, or None if it is about something else.
    `ordering`: also draft from a pick, for the demo, which has no coach model behind it."""
    from .agent import ui_language
    from .instant_supply import ORDERS

    text = " ".join(message.split())
    # The vendor list's Order tap has its own path, on the list it was tapped from.
    if not text or NEGATION.search(text) or any(tap.match(text) for tap, _ in ORDERS):
        return None
    wants = {
        "remove": REMOVE.search(text),
        "save": SAVE.search(text),
        "order": ORDER.search(text),
        "compare": COMPARE.search(text),
    }
    if not any(wants.values()):
        return None
    language = ui_language.get().split("-")[0].casefold()
    if language not in {"en", "hi"}:
        return None
    search = supplier_book.last_search(ctx.store, ctx.business_id)
    if not search or not search.get("suppliers") or not _about_this_list(text, search):
        return None
    hindi = language == "hi"
    card = _card(search, pick_supplier(text, search))
    if card and wants["remove"]:
        return _removing(ctx, card, hindi)
    if card and wants["save"]:
        return _saving(ctx, search, card, hindi)
    if card and wants["order"]:
        return _ordering(ctx, text, search, card) if ordering else None
    if wants["compare"] and not wants["order"]:
        return Answer(
            "compare_suppliers",
            compared(search, hindi),
            [StreamEvent(kind="suppliers", data=search)],
        )
    return None
