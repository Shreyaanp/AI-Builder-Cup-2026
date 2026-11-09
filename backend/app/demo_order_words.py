"""Ordering stock by chat in the offline /demo coach (OB-268, S2-1).

"Reorder milk" and "दूध मँगाना है" become a milk order to check, or one short question when how
much is unknown: never directions to a screen. An item the shop makes is never bought, and being
out of something is never an order by itself (OB-261). Model-free, on the demo's own suppliers.
"""

from __future__ import annotations

from typing import Any

from .app_guide import by_ask, next_line, next_line_hi
from .contracts import StreamEvent
from .demo_coach_words import _clause, _offer, _reply, bare, menu_item, speaks_hindi
from .demo_item_names import HINDI_UNITS, hindi_item
from .owner_order_words import OrderAsk, known_supply, order_asked

DRAFT_QUANTITY = 10
HINDI_AMOUNT_UNITS = {"लीटर": "l", "किलो": "kg", "ग्राम": "g", "पैक": "pack", "पैकेट": "pack"}


def _source(item: dict[str, Any], category: str) -> str:
    from .product_source import source_of

    return str(source_of(item, category))


def _supplies(ctx: Any) -> list[dict[str, Any]]:
    """What the shop has ordered before, newest order first: Milk and Sugar are on its orders,
    not its menu."""
    from . import supply_chain

    orders = supply_chain.orders(ctx.store, ctx.uid, ctx.business_id)
    newest_first = sorted(orders, key=lambda order: order.get("created") or 0, reverse=True)
    return [line for order in newest_first for line in order.get("lines") or []]


async def draft_order(
    ctx: Any,
    item: str,
    question: str,
    amount: tuple[float, str] | None = None,
    made: str = "",
    teach: str | None = "suppliers",
    as_last_time: bool = False,
) -> list[StreamEvent] | None:
    """The suppliers for one item, then the order card to the nearest: the real coach's
    find_suppliers and prepare_order, on the sandbox's demo suppliers. Nothing goes until the
    visitor taps Send."""
    from .agent import ui_language
    from .coordinator import find_suppliers, prepare_order
    from .money import to_minor
    from .sourcing import OrderItem, convert, money_text

    found = await (
        find_suppliers(item, amount[0], HINDI_AMOUNT_UNITS.get(amount[1], amount[1]))
        if amount
        else find_suppliers(item)
    )
    if found.get("status") != "found":
        return None
    suppliers = found["suppliers"]
    first = suppliers[0]
    unit = first["item"]["unit"]
    quantity: float = DRAFT_QUANTITY
    if amount:
        converted = convert(amount[0], HINDI_AMOUNT_UNITS.get(amount[1], amount[1]), unit)
        if converted and 0 < converted <= 10_000:
            quantity = round(converted, 2)
    line = OrderItem(name=first["item"]["name"], quantity=quantity, unit=unit)
    hindi = speaks_hindi(question)
    # A Hindi question gets a card whose supplier answers in Hindi.
    token = ui_language.set("hi" if hindi else ui_language.get())
    try:
        drafted = prepare_order(first["id"], [line])
    finally:
        ui_language.reset(token)
    if drafted.get("status") != "needs_owner_tap":
        return None
    currency = found["currency"]
    if hindi:
        names = "; ".join(
            f"{rank}. {row['name']}, {row['distance_km']:g} किमी, "
            f"{money_text(to_minor(row['item']['price'], currency), currency)} प्रति "
            f"{HINDI_UNITS.get(row['item']['unit'], row['item']['unit'])}"
            for rank, row in enumerate(suppliers[:3], 1)
        )
        item_hi = hindi_item(item)
        lead = f"{hindi_item(made)} आप ख़ुद बनाते हैं, इसलिए ये {item_hi} के लिए हैं। " if made else ""
        lead += "मात्रा आपके पिछले ऑर्डर जितनी है। " if as_last_time else ""
        text = (
            f"{lead}{item_hi} के लिए पास के डेमो सप्लायर: {names}। {first['name']} से "
            f"{quantity:g} {HINDI_UNITS.get(unit, unit)} {item_hi} का ऑर्डर नीचे तैयार है। "
            "आपके भेजे बिना कुछ नहीं जाता, और यह सिर्फ़ डेमो है।"
        )
        text += f" {next_line_hi(teach)}" if teach else ""
    else:
        names = "; ".join(
            f"{rank}. {row['name']}, {row['distance_km']:g} km, "
            f"{money_text(to_minor(row['item']['price'], currency), currency)} "
            f"a {row['item']['unit']}"
            for rank, row in enumerate(suppliers[:3], 1)
        )
        lead = f"You make {made} yourself, so these are for {item}. " if made else ""
        lead += "The same amount as your last order. " if as_last_time else ""
        text = (
            f"{lead}Demo suppliers near you for {item}: {names}. I drafted "
            f"{quantity:g} {unit} from {first['name']} below. "
            + (
                "It goes only when you tap Send, and only in the demo."
                if teach
                else "Next, check it and tap Send. It goes only then, and only in the demo."
            )
        )
        text += f" {next_line(teach)}" if teach else ""
    return [
        StreamEvent(kind="suppliers", data=ctx.cards[found["card_id"]][1]),
        StreamEvent(kind="order", data=ctx.cards[drafted["card_id"]][1]),
        StreamEvent(kind="reply", text=text),
    ]


def _on_menu(ctx: Any, said: str) -> dict[str, Any] | None:
    inventory = ctx.store.inventory(ctx.uid, ctx.business_id)
    return menu_item(said, inventory, {}) or menu_item(hindi_item(said), inventory, {})


def _how_much(item: str, unit: str, hindi: bool) -> list[StreamEvent]:
    """One short question, with the answers as taps: this turn cannot see the last one."""
    if hindi:
        hi, unit_hi = hindi_item(item), HINDI_UNITS.get(unit, unit)
        return [_reply(f"कितना {hi} चाहिए?", [f"{n} {unit_hi} {hi} मँगाओ" for n in (5, 10, 20)])]
    return [
        _reply(
            f"How much {item.lower()}?",
            [f"Reorder {n} {unit} {item.lower()}" for n in (5, 10, 20)],
        )
    ]


async def reorder(ctx: Any, question: str) -> list[StreamEvent] | None:
    """An order the owner asks for: drafted with the amount said, or the amount last ordered;
    one short question when neither is known."""
    ask: OrderAsk | None = order_asked(question)
    if not ask:
        return None
    from .coordinator import find_suppliers

    hindi = speaks_hindi(question)
    # A phrase a screen tells the owner to say still names that screen, after the draft.
    shown = by_ask(question)
    product = _on_menu(ctx, ask.item)
    fields = ctx.store.context(ctx.uid, ctx.business_id)["business"]["fields"]
    category = str(fields.get("category") or "")
    made = bool(product and _source(product, category) == "made")
    if ask.needs_known_supply and made:
        return None  # "Samosa chahiye" is not an order for samosa.
    if not (ask.outright or product or known_supply(ask.item)):
        return None
    name = str(product["name"]) if product else ask.item
    if ask.declined:
        if hindi:
            return [_reply(f"ठीक है, {hindi_item(name)} का ऑर्डर नहीं बनाया।")]
        return [_reply(f"Okay, I won't order {name.lower()}. Nothing was drafted.")]
    if made:
        if hindi:
            return [
                _reply(f"{hindi_item(name)} आप ख़ुद बनाते हैं, इसे मँगाना नहीं पड़ता। कितना बनाना है, देखें?"),
                _offer("plan", True, ctx.business_id),
            ]
        return [
            _reply(
                f"You make {name} yourself, so there is nothing to order. See how much to make?"
            ),
            _offer("plan", False, ctx.business_id),
        ]
    amount: tuple[float, str] | None = (ask.quantity, ask.unit) if ask.quantity else None
    if amount is None:
        last = next(
            (
                line
                for line in _supplies(ctx)
                if bare(str(line.get("item") or "")) == bare(name) and line.get("quantity")
            ),
            None,
        )
        if last:
            amount = (float(last["quantity"]), str(last.get("unit") or ""))
    as_last_time = amount is not None and not ask.quantity
    if amount is None:
        found = await find_suppliers(name)
        if found.get("status") != "found":
            return None
        return _how_much(name, found["suppliers"][0]["item"]["unit"], hindi)
    return await draft_order(
        ctx, name, question, amount, teach=shown.id if shown else None, as_last_time=as_last_time
    )


def out_of_supply(ctx: Any, question: str) -> list[StreamEvent] | None:
    """ "Doodh khatam ho gaya": out of something the shop buys and does not sell. Being out is
    not an order (OB-261), so one short question, as for a bought item on the menu."""
    text = bare(question)
    if "?" in question:
        return None
    found = _clause(text)
    if not found or found[0] != "sold" or _on_menu(ctx, found[1]):
        return None
    name = known_supply(found[1])
    if not name:
        return None
    if speaks_hindi(question):
        hi = hindi_item(name)
        return [_reply(f"{hi} आप ख़रीदते हैं। क्या मैं इसके सप्लायर ढूँढूँ?", [f"{hi} मँगाओ"])]
    return [
        _reply(f"{name} is something you buy. Shall I find suppliers for it?", [f"Order {name}"])
    ]


def low_on_made(ctx: Any, question: str, made: str) -> list[StreamEvent]:
    """ "Samosa khatam hone wala hai": the shop makes it, so nothing is bought unasked (OB-261)."""
    if speaks_hindi(question):
        return [
            _reply(f"{hindi_item(made)} आप ख़ुद बनाते हैं। कितना और बनाना है, देखें?"),
            _offer("plan", True, ctx.business_id),
        ]
    return [
        _reply(f"You make {made} yourself. See how many more to make?"),
        _offer("plan", False, ctx.business_id),
    ]
