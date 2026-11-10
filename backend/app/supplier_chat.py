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


# The words a message about the supplier list is made of, in English, Hinglish and Hindi. A
# message with any other word ("samosa", "menu", "sales", "photo", "customer") is about something
# else and goes to its own path, even right after a list (OB-265 review).
LIST_WORDS = frozenset(
    """
    which one ones is are the a an of them these those it this that and or from with to me my
    show tell who what whose cheapest cheaper cheap lowest price prices rate rates nearest closest
    near compare both all best save remember add remove forget unsave delete order take go
    please ok okay then now supplier suppliers vendor vendors wholesaler wholesalers wholesale
    first second third fourth 1st 2nd 3rd 4th number no list on off as for be will
    wala wale wali waala waale waali karo kar karna do kaun kaunsa konsa kon sa si se sabse
    sasta sasti saste paas nazdeek najdeek hai hain ko mein me mere mera meri lo le lena chahiye
    mangao mangwao manga bhejo hatao hata yaad rakho rakh rakhna tulna ka ki ke aur ya ab bata
    batao dikhao wahi pehla pehle doosra dusra doosre dusre teesra teesre supplier ko
    कौन सा सी से सबसे सस्ता सस्ती सस्ते पास नज़दीक नजदीक है हैं तुलना करो करें कीजिए कर
    वाला वाले वाली सप्लायर सप्लायरों पहला पहले दूसरा दूसरे तीसरा तीसरे को सेव याद रखो रख
    मेरा मेरे मेरी में हटाओ हटा हटाएँ दो ऑर्डर मंगाओ मँगाओ मंगवाओ लो किसका किसके किसकी दाम
    कम का की के और या नंबर बताओ दिखाओ यह ये वो इसे उसे इन लिस्ट
    """.split()
)
UNIT_WORDS = frozenset(
    "l litre litres liter liters ltr kg kgs kilo kilos g gm gram grams packet packets pack "
    "piece pieces pcs dozen box boxes लीटर किलो ग्राम पैकेट पीस दर्जन".split()
)
# Clearly the supplier list, with no earlier turn needed: "the cheapest supplier", "pehla wala".
SUPPLIER_WORD = re.compile(
    r"\b(?:suppliers?|vendors?|wholesalers?|wholesale|wa+la|wa+le|wa+li)\b|सप्लायर|वाला|वाले|वाली",
    re.I,
)
TOKEN = re.compile(r"[^\s.,!?।:;\"'()/-]+")
NUMERAL = re.compile(r"^\d+(?:\.\d+)?[a-z]*$")
# A follow-up to the list just shown is a few words: "which is cheapest?", "save the second one".
FOLLOW_UP_WORDS = 8


def _names(search: dict[str, Any]) -> set[str]:
    from .demo_item_names import hindi_item

    words = set()
    item = str(search.get("item") or "")
    for name in (item, hindi_item(item), hindi_item(item[:1].upper() + item[1:].casefold())):
        words.update(TOKEN.findall((name or "").casefold()))
    for card in search["suppliers"]:
        words.update(TOKEN.findall(str(card.get("name") or "").casefold()))
        words.update(TOKEN.findall(str((card.get("item") or {}).get("name") or "").casefold()))
    return words


def _only_list_words(text: str, search: dict[str, Any]) -> list[str] | None:
    """The message's words when every one belongs to a message about this list, else None."""
    words = [word.removesuffix("'s").removesuffix("’s") for word in TOKEN.findall(text.casefold())]
    known = LIST_WORDS | UNIT_WORDS | _names(search)
    if all(word in known or NUMERAL.match(word) for word in words):
        return words
    return None


def _named_supplier(text: str, search: dict[str, Any]) -> bool:
    from .supplier_compare import _plain_name  # noqa: PLC2701 - the picker's own name match

    lowered = text.casefold()
    return any(_plain_name(str(card.get("name") or "")) in lowered for card in search["suppliers"])


def answer(ctx: Any, message: str, ordering: bool = False) -> Answer | None:
    """What the owner asked about the last supplier list, or None if it is about something else.
    `ordering`: also draft from a pick, for the demo, which has no coach model behind it.

    Only a message clearly about the list is answered: it names a supplier, or says supplier,
    vendor, wholesaler or wala with a pick (first, cheapest, nearest) or "compare", or it is a
    few words right after the list. Every word must belong to such a message, so "samosa sasta
    karo", "compare sales" and "remove the first item from my menu" go to their own paths."""
    from .agent import ui_language
    from .instant_supply import ORDERS

    text = " ".join(message.split())
    if not text or not ctx or not getattr(ctx, "business_id", None):
        return None
    store, bid = ctx.store, ctx.business_id
    follow_up = supplier_book.list_was_last(store, bid)
    said = _answer(ctx, text, ordering, follow_up, ui_language.get(), ORDERS)
    if said is None and follow_up:
        supplier_book.end_follow_up(store, bid)
    return said


def _answer(
    ctx: Any, text: str, ordering: bool, follow_up: bool, ui: str, taps: Any
) -> Answer | None:
    # The vendor list's Order tap has its own path, on the list it was tapped from.
    if NEGATION.search(text) or any(tap.match(text) for tap, _ in taps):
        return None
    wants = {
        "remove": REMOVE.search(text),
        "save": SAVE.search(text),
        "order": ORDER.search(text),
        "compare": COMPARE.search(text),
    }
    if not any(wants.values()):
        return None
    language = ui.split("-")[0].casefold()
    if language not in {"en", "hi"}:
        return None
    search = supplier_book.last_search(ctx.store, ctx.business_id)
    if not search or not search.get("suppliers") or not _about_this_list(text, search):
        return None
    words = _only_list_words(text, search)
    if words is None:
        return None
    picked = pick_supplier(text, search)
    clear = _named_supplier(text, search) or bool(
        SUPPLIER_WORD.search(text) and (picked or wants["compare"])
    )
    if not clear and not (follow_up and len(words) <= FOLLOW_UP_WORDS):
        return None
    hindi = language == "hi"
    card = _card(search, picked)
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
