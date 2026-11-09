"""OB-261, OB-262, OB-268: what the owner said is what the coach does, as one table.

Each row is a sentence in English, Hinglish or Hindi and the one action it must lead to: an
availability statement is a sold-out card and never a purchase, two-in-one sentences are one
card, "reorder milk" is a milk order or one question, and a "don't" does nothing. The public demo
and the real coach's own tools read the same table. Offline: this says nothing of how well a live
model understands owners; coach-evals and the model instructions cover that.
"""

import asyncio
from collections.abc import Iterator

import pytest

from app.agent import ui_language, upkeep_call
from app.demo_coach import FALLBACK
from app.demo_coach_words import FALLBACK_HI, _money, read_changes
from app.instant import route
from app.merchant import BusinessFields, ProductFields, ProposalRequest
from app.owner_order_words import known_supply, order_asked
from app.supply_offline import supply_call
from tests.test_coach_owner_words import demo, no_purchase, reply_of  # noqa: F401
from tests.test_photos import app  # noqa: F401
from tests.test_voice_everything import ctx, shop  # noqa: F401

SOLD_OUT = [
    # English
    ("samosa sold out", "en"),
    ("Samosa is sold out", "en"),
    ("samosas are sold out", "en"),
    ("samosa is finished", "en"),
    ("samosa out of stock", "en"),
    ("no samosa today", "en"),
    ("we have run out of samosa", "en"),
    # Hinglish, as it is typed
    ("samosa khatam ho gaya", "en"),
    ("samosa khatam ho gaya", "hi"),
    ("samosa khatam", "en"),
    ("samosa khatm ho gya", "en"),
    ("samosa khatam hogaya", "en"),
    ("samosa khatam ho gya hai", "en"),
    ("samose khatam ho gaye", "en"),
    ("samosa bik gaya", "en"),
    ("samose bik gaye", "en"),
    ("samosa nahi bacha", "en"),
    ("samosa sold out ho gaya", "en"),
    ("samosa khatam kar do na", "en"),  # A closing "na" is please, not no.
    ("samosa sold out hai", "en"),
    ("aaj samosa khatam hai", "en"),
    # Hindi, with every spelling of the same words
    ("समोसा खत्म हो गया", "hi"),
    ("समोसा ख़त्म हो गया", "hi"),
    ("समोसे ख़त्म हो गए", "hi"),
    ("समोसे खत्म हो गये", "hi"),
    ("समोसा खतम हो गया", "hi"),
    ("समोसा बिक गया", "hi"),
    ("समोसे बिक गए", "hi"),
    ("समोसे बिक गये", "hi"),
    ("समोसा बिक गई", "hi"),
    ("समोसा नहीं बचा", "hi"),
    ("समोसा सोल्ड आउट", "hi"),
    ("समोसा सोल्ड आउट हो गया", "hi"),
    ("समोसा खत्म कर दो ना", "hi"),
]

# Masala chai is ₹20 on the demo shop, so ₹18 is a real change.
TWO_IN_ONE = [
    ("Chai is 18 rupees now, samosa sold out", "en"),
    ("Chai is 18 rupees now and samosa is sold out", "en"),
    ("masala chai 18 rupees, samosa sold out", "en"),
    ("Masala chai is 18 and samosa khatam", "en"),
    ("chai 18 rupaye kar do, samosa khatam", "en"),
    ("chai ab 18 ka hai aur samosa khatam ho gaya", "en"),
    ("chai ka daam 18 kar do aur samosa khatam", "en"),
    ("samosa khatam, chai 18 ki", "en"),
    ("chai ab 18 ka hai aur samosa khatam ho gaya", "hi"),
    ("चाय अब 18 रुपये की है, समोसा खत्म हो गया", "hi"),
    ("चाय 18 रुपये कर दो और समोसे ख़त्म", "hi"),
    ("चाय का दाम 18 कर दो, समोसा खत्म", "hi"),
    ("समोसा खत्म और चाय 18 रुपये", "hi"),
    ("chai 18 rupaye kar do na, samosa khatam", "en"),
    ("चाय 18 रुपये कर दो ना, समोसा खत्म", "hi"),
]

# (sentence, app language, the amount the order must be for). 30 is the demo's last milk order.
MILK_ORDERS = [
    ("Reorder milk", "en", 30),
    ("reorder milk please", "en", 30),
    ("Reorder milk for tomorrow", "en", 30),  # The app guide's own example.
    ("Order milk", "en", 30),
    ("I need more milk", "en", 30),
    ("can you reorder milk?", "en", 30),
    ("Reorder 20 litres of milk", "en", 20),
    ("order 20 l milk", "en", 20),
    ("milk order karo", "en", 30),
    ("milk order kar do", "en", 30),
    ("milk mangao", "en", 30),
    ("doodh mangao na", "en", 30),  # The review's three: a closing "na" is please.
    ("milk order karo na", "en", 30),
    ("दूध मँगाओ ना", "hi", 30),
    ("doodh mangao na please", "en", 30),
    ("doodh ka order karo na", "en", 30),
    ("milk mangwa do", "en", 30),
    ("doodh mangao", "en", 30),
    ("doodh mangana hai", "en", 30),
    ("doodh order karo", "en", 30),
    ("doodh chahiye", "en", 30),
    ("doodh order karo", "hi", 30),
    ("20 litre doodh mangao", "en", 20),
    ("doodh 20 litre mangao", "en", 20),
    ("दूध मँगाना है", "hi", 30),
    ("दूध मंगाना है", "hi", 30),
    ("दूध मँगाओ", "hi", 30),
    ("दूध मंगवा दो", "hi", 30),
    ("दूध का ऑर्डर करो", "hi", 30),
    ("दूध ऑर्डर करो", "hi", 30),
    ("दूध चाहिए", "hi", 30),
    ("20 लीटर दूध मँगाओ", "hi", 20),
    ("दूध फिर से मँगाओ", "hi", 30),
    ("doodh phir se mangao", "en", 30),
    ("doodh dobara mangao", "en", 30),
]

DONT_ORDER = [
    ("Don't reorder milk", "en", "Okay, I won't order milk."),
    ("do not reorder milk", "en", "Okay, I won't order milk."),
    ("never reorder milk", "en", "Okay, I won't order milk."),
    ("milk order mat karo", "en", "Okay, I won't order milk."),
    ("doodh mat mangao", "en", "Okay, I won't order milk."),
    ("doodh nahi mangana", "en", "Okay, I won't order milk."),
    ("doodh na mangao", "en", "Okay, I won't order milk."),  # "Na" before the verb is a no.
    ("doodh mat mangao na", "en", "Okay, I won't order milk."),
    ("दूध मत मँगाओ", "hi", "दूध का ऑर्डर नहीं बनाया"),
    ("दूध नहीं मँगाना", "hi", "दूध का ऑर्डर नहीं बनाया"),
    ("दूध मत मंगाओ", "hi", "दूध का ऑर्डर नहीं बनाया"),
    ("दूध ना मँगाओ", "hi", "दूध का ऑर्डर नहीं बनाया"),
]

DONT_CHANGE = [
    ("samosa khatam nahi hua", "en"),
    ("samosa khatam mat karo", "en"),
    ("samosa sold out mat karo", "en"),
    ("don't mark samosa sold out", "en"),
    ("समोसा खत्म नहीं हुआ", "hi"),
    ("क्या समोसा खत्म है?", "hi"),
    ("kya samosa khatam hai?", "en"),
    ("samosa khatam hai na", "en"),  # After "hai", "na" asks: "it's finished, right?"
    ("समोसा खत्म है ना", "hi"),
    ("is samosa sold out?", "en"),
]


def order_card(events: list[dict]) -> dict:
    [card] = [e["data"] for e in events if e["kind"] == "order"]
    return card


def nothing_prepared(events: list[dict]) -> None:
    no_purchase(events)
    assert not [e for e in events if e["kind"] == "proposal"], events


def test_the_table_is_big_enough() -> None:
    rows = SOLD_OUT + TWO_IN_ONE + MILK_ORDERS + DONT_ORDER + DONT_CHANGE
    assert len(rows) >= 30
    # Every language an owner uses, not just English.
    assert sum(1 for row in rows if any("ऀ" <= ch <= "ॿ" for ch in row[0])) >= 15
    assert sum(1 for row in rows if "khatam" in row[0] or "mangao" in row[0]) >= 10


@pytest.mark.parametrize(("message", "language"), SOLD_OUT)
def test_OB_261_availability_is_a_sold_out_card_never_a_purchase(  # noqa: N802
    demo,  # noqa: F811
    message,
    language,
):
    events = demo(message, language)
    no_purchase(events)
    [card] = [e["data"]["snapshot"] for e in events if e["kind"] == "proposal"]
    assert [(p["name"], p["available"]) for p in card["products"]] == [("Samosa", False)]


@pytest.mark.parametrize(("message", "language"), TWO_IN_ONE)
def test_OB_262_two_in_one_is_one_card_with_both(demo, message, language):  # noqa: N802, F811
    events = demo(message, language)
    no_purchase(events)
    [card] = [e["data"]["snapshot"] for e in events if e["kind"] == "proposal"]
    assert {p["name"]: (p["price"], p["available"]) for p in card["products"]} == {
        "Masala chai": (1800, True),
        "Samosa": (2000, False),
    }
    assert reply_of(events) not in {FALLBACK, FALLBACK_HI}


@pytest.mark.parametrize(("message", "language", "quantity"), MILK_ORDERS)
def test_OB_268_ordering_milk_drafts_a_milk_order(  # noqa: N802
    demo,  # noqa: F811
    message,
    language,
    quantity,
):
    events = demo(message, language)
    [line] = order_card(events)["lines"]
    assert (line["name"], line["quantity"]) == ("Milk", quantity), events
    assert order_card(events)["status"] == "draft"  # Nothing goes until the owner taps Send.
    reply = reply_of(events)
    assert "Grow" not in reply and "→" not in reply, reply  # Never directions to a screen.
    assert ("पिछले ऑर्डर" in reply or "last order" in reply) == (quantity == 30), reply
    assert ("डेमो सप्लायर" in reply) == (language == "hi"), reply


@pytest.mark.parametrize(
    ("message", "language", "question", "tap"),
    [
        ("Reorder paneer", "en", "How much paneer?", "Reorder 5 "),
        ("पनीर मँगाओ", "hi", "कितना पनीर चाहिए?", "5 "),
        ("paneer mangao", "hi", "कितना पनीर चाहिए?", "5 "),
    ],
)
def test_OB_268_an_unknown_amount_is_one_short_question(  # noqa: N802
    demo,  # noqa: F811
    message,
    language,
    question,
    tap,
):
    """Never ordered before: how much is the one thing to ask, with the answers as taps."""
    events = demo(message, language)
    no_purchase(events)
    assert reply_of(events) == question
    offered = next(e for e in events if e["kind"] == "reply")["data"]["suggestions"]
    assert len(offered) == 3 and offered[0].startswith(tap)
    # A tapped answer is an order for that amount.
    assert order_card(demo(offered[0], language))["lines"][0]["quantity"] == 5


@pytest.mark.parametrize(("message", "language", "words"), DONT_ORDER)
def test_a_dont_never_orders(demo, message, language, words):  # noqa: F811
    events = demo(message, language)
    nothing_prepared(events)
    assert words in reply_of(events), events


@pytest.mark.parametrize(("message", "language"), DONT_CHANGE)
def test_a_dont_or_a_question_changes_nothing(demo, message, language):  # noqa: F811
    nothing_prepared(demo(message, language))


@pytest.mark.parametrize(
    ("message", "language", "words"),
    [
        ("samosa khatam hone wala hai", "en", "You make Samosa yourself."),
        ("Samosa is running low", "en", "You make Samosa yourself."),
        ("समोसा खत्म होने वाला है", "hi", "समोसा आप ख़ुद बनाते हैं।"),
        ("समोसे ख़त्म हो रहे हैं", "hi", "समोसा आप ख़ुद बनाते हैं।"),
        ("samose khatam ho rahe hain", "en", "You make Samosa yourself."),
        ("Reorder samosa", "en", "You make Samosa yourself"),
        ("समोसा मँगाओ", "hi", "समोसा आप ख़ुद बनाते हैं"),
    ],
)
def test_OB_261_something_the_shop_makes_is_never_bought(  # noqa: N802
    demo,  # noqa: F811
    message,
    language,
    words,
):
    """The tea-dust order came from here: running low on samosa is about making more."""
    events = demo(message, language)
    nothing_prepared(events)
    assert words in reply_of(events), events
    [button] = [e["data"] for e in events if e["kind"] == "action"]
    assert button["target"] == "plan" and button["offer"] is True


@pytest.mark.parametrize(
    ("message", "language", "question"),
    [
        ("दूध खत्म हो गया", "hi", "क्या मैं इसके सप्लायर ढूँढूँ?"),
        ("दूध ख़त्म", "hi", "क्या मैं इसके सप्लायर ढूँढूँ?"),
        ("doodh khatam ho gaya", "en", "Shall I find suppliers for it?"),
        ("Milk is sold out", "en", "Shall I find suppliers for it?"),
    ],
)
def test_OB_261_out_of_a_supply_is_one_question_not_an_order(  # noqa: N802
    demo,  # noqa: F811
    message,
    language,
    question,
):
    events = demo(message, language)
    nothing_prepared(events)
    assert reply_of(events).endswith(question)


@pytest.mark.parametrize(
    ("message", "language", "path"),
    [
        ("Reorder tea dust", "en", "Next, open Grow → Buy stock → To do."),
        ("चायपत्ती फिर से मँगाओ", "hi", "अब बढ़ाएँ →"),
    ],
)
def test_OB_268_a_screens_own_phrase_drafts_and_still_names_the_screen(  # noqa: N802
    demo,  # noqa: F811
    message,
    language,
    path,
):
    """The Grow screen tells owners to say these: the order, then where it lives."""
    events = demo(message, language)
    assert order_card(events)["lines"][0]["name"] == "Tea dust"
    assert path in reply_of(events), events


def test_OB_268_a_request_about_suppliers_still_finds_them(demo):  # noqa: N802, F811
    """Asking for suppliers outright still gets what it asks for, made here or not."""
    events = demo("My masala chai is running low. Find suppliers.", "en")
    assert {e["kind"] for e in events} >= {"suppliers", "order"}


@pytest.mark.parametrize(
    "message",
    ["what should I order", "order status", "I need help", "order ahead", "orders", "samosa"],
)
def test_order_words_that_are_not_an_order_for_something(message):
    asked = order_asked(message)
    assert asked is None or not (asked.outright or known_supply(asked.item))


@pytest.mark.parametrize(
    ("message", "item", "quantity", "unit"),
    [
        ("Reorder milk", "Milk", None, ""),
        ("reorder 5 kg of sugar", "Sugar", 5, "kg"),
        ("doodh 20 litre mangao", "Milk", 20, "litre"),
        ("20 लीटर दूध मँगाओ", "Milk", 20, "लीटर"),
        ("चाय पत्ती मंगवा दो", "Tea dust", None, ""),
        ("chai patti mangao", "Tea dust", None, ""),
    ],
)
def test_order_asked_reads_the_item_and_the_amount(message, item, quantity, unit):
    asked = order_asked(message)
    assert asked and (asked.item, asked.quantity, asked.unit) == (item, quantity, unit)
    assert not asked.declined


# --- The real coach's own path: the instant router and the coach's tool choice -----------------


@pytest.fixture
def hindi_app() -> Iterator[None]:
    token = ui_language.set("hi")
    yield
    ui_language.reset(token)


def run(text: str, shop_ctx) -> object:
    return asyncio.run(route(text, shop_ctx))


def snapshot(result) -> dict[str, tuple[int, bool]]:
    [card] = [e.data["snapshot"] for e in result.events if e.kind == "proposal"]
    return {p["name"]: (p["price"], p["available"]) for p in card["products"]}


@pytest.mark.parametrize(("message", "language"), SOLD_OUT)
def test_OB_261_live_sold_out_is_a_review_card_never_a_purchase(  # noqa: N802
    shop,  # noqa: F811
    message,
    language,
):
    call = upkeep_call(message, shop)
    assert call and call.function_call and call.function_call.name == "propose_products", message
    assert call.function_call.args == {"items": [{"name": "Samosa", "available": False}]}
    assert supply_call(message, shop, []) is None


@pytest.mark.parametrize(
    "message",
    [
        "समोसा खत्म हो गया",
        "samosa khatam ho gaya",
        "समोसे ख़त्म हो गए",
        "समोसे बिक गये",
    ],
)
def test_OB_261_live_hindi_owner_gets_the_card_and_a_hindi_reply(  # noqa: N802
    shop,  # noqa: F811
    hindi_app,
    message,
):
    result = run(message, shop)
    assert result.intent == "upkeep"
    assert snapshot(result) == {"Samosa": (2000, False)}
    assert result.reply.startswith("मैंने यह आपके जाँचने के लिए तैयार किया है: समोसा आज के लिए ख़त्म")


@pytest.mark.parametrize(
    "message",
    [
        "Chai is 18 rupees now, samosa sold out",
        "chai ab 18 ka hai aur samosa khatam ho gaya",
        "चाय अब 18 रुपये की है, समोसा खत्म हो गया",
        "चाय का दाम 18 कर दो, समोसा खत्म",
    ],
)
def test_OB_262_live_two_in_one_is_one_review(shop, message):  # noqa: N802, F811
    assert snapshot(run(message, shop)) == {"Masala chai": (1800, True), "Samosa": (2000, False)}


def test_OB_262_live_never_guesses_between_two_chais(shop):  # noqa: N802, F811
    """The demo uses its best seller; a real shop's "chai" with two chais is for the model to
    ask, and a card for only the samosa would silently drop the price."""
    products = shop.store.inventory(shop.uid, shop.business_id)
    products = [*products, {**products[0], "name": "Cutting chai"}]
    shop.store.inventory = lambda uid, bid: products
    real = shop.store.context

    def context(uid, bid):
        return {**real(uid, bid), "inventory": products}

    shop.store.context = context
    assert upkeep_call("Chai is 18 rupees now, samosa sold out", shop) is None


def test_devanagari_in_another_app_language_is_left_to_the_model(shop):  # noqa: F811
    token = ui_language.set("mr")
    try:
        assert run("समोसा खत्म हो गया", shop) is None
    finally:
        ui_language.reset(token)


@pytest.mark.parametrize(("message", "language", "quantity"), MILK_ORDERS)
def test_OB_268_live_ordering_milk_calls_draft_reorder(  # noqa: N802
    shop,  # noqa: F811
    message,
    language,
    quantity,
):
    assert run(message, shop) is None  # Never answered from a template or a guessed screen.
    call = supply_call(message, shop, [])
    assert call and call.function_call and call.function_call.name == "draft_reorder", message
    args = dict(call.function_call.args or {})
    assert args["item"].casefold() == "milk"
    assert args.get("quantity") == (quantity if quantity != 30 else None)


@pytest.mark.parametrize(("message", "language", "words"), DONT_ORDER)
def test_a_live_dont_calls_nothing(shop, message, language, words):  # noqa: F811
    part = supply_call(message, shop, [])
    assert part and not part.function_call and part.text, message


@pytest.mark.parametrize(("message", "language"), DONT_CHANGE)
def test_a_live_dont_or_question_prepares_nothing(shop, message, language):  # noqa: F811
    assert upkeep_call(message, shop) is None
    assert supply_call(message, shop, []) is None


def test_the_coach_is_told_out_of_stock_is_never_a_purchase():
    from app.agent import INSTRUCTION

    assert "is never a purchase: propose_products" in INSTRUCTION
    assert "available=false." in INSTRUCTION
    assert "running low, finished or needed" not in INSTRUCTION
    assert "दूध मँगाना है" in INSTRUCTION and "Never screen directions." in INSTRUCTION
    assert "Put every item the owner mentioned in one propose_products call." in INSTRUCTION


MONEY = [
    ("masala chai 1,000 rupees, samosa sold out", 100_000),
    ("masala chai 1,00,000 rupees, samosa khatam", 10_000_000),
    ("masala chai 1000.50 rupees, samosa sold out", 100_050),
    ("मसाला चाय 1,000 रुपये, समोसा खत्म", 100_000),
    ("मसाला चाय 1000.50 रुपये, समोसा खत्म", 100_050),
]


@pytest.mark.parametrize(("message", "minor"), MONEY)
def test_a_two_in_one_price_is_the_amount_said(demo, message, minor):  # noqa: F811
    [card] = [e["data"]["snapshot"] for e in demo(message, "en") if e["kind"] == "proposal"]
    assert {p["name"]: p["price"] for p in card["products"]} == {
        "Masala chai": minor,
        "Samosa": 2000,
    }


@pytest.mark.parametrize(("message", "minor"), MONEY)
def test_a_live_two_in_one_price_is_the_amount_said(shop, message, minor):  # noqa: F811
    call = upkeep_call(message, shop)
    assert call and call.function_call
    assert call.function_call.args == {
        "items": [
            {"name": "Masala chai", "price": minor / 100},
            {"name": "Samosa", "available": False},
        ]
    }


@pytest.mark.parametrize(
    ("message", "currency", "understood"),
    [
        ("Samosa is 20 rupees now", "SGD", False),
        ("samosa 20 rupaye kar do", "SGD", False),
        ("समोसा अब 20 रुपये का है", "SGD", False),
        ("Samosa is 2 dollars now, samosa sold out", "INR", False),
        ("Samosa is 20 rupees now", "INR", True),
        ("समोसा अब 20 रुपये का है", "INR", True),
        ("Samosa is 2 now", "SGD", True),
    ],
)
def test_a_price_in_another_currency_is_never_read(message, currency, understood):
    """Never converted or guessed, on the demo or the live coach, in any language."""
    items = [{"name": "Samosa", "price": 2000, "unit": "piece"}]
    assert bool(read_changes(message, items, {}, currency)) is understood


# --- Second review: another currency is asked about, replies use the shop's own -----------------


@pytest.fixture
def sgd_shop(ctx):  # noqa: F811
    proposal = ctx.store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ah Huat Kopi",
                category="Tea stall",
                location="Tiong Bahru",
                hours="7am-9pm",
                currency="SGD",
                timezone="Asia/Singapore",
            ),
            products=[
                ProductFields(name="Kopi", price=180, unit="cup"),
                ProductFields(name="Samosa", price=250, unit="piece"),
            ],
        ),
    )
    ctx.business_id = ctx.store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    return ctx


@pytest.mark.parametrize(
    "message",
    [
        "Kopi is 20 rupees now",
        "Kopi is ₹20 now",
        "Kopi is 20 rupees now, samosa sold out",  # Never a card that drops the price.
        "kopi 20 rupaye kar do",
        "samosa 20 rupaye kar do na",
    ],
)
def test_a_price_in_rupees_in_a_singapore_shop_is_asked_about(sgd_shop, message):
    result = run(message, sgd_shop)
    assert result and not result.events, message
    assert result.reply == "Your prices are in S$. What price should I set, in S$?"


def test_a_hindi_owner_is_asked_in_hindi_in_the_shops_currency(sgd_shop):
    result = run("समोसा अब 20 रुपये का है", sgd_shop)
    assert result and not result.events
    assert result.reply == "आपकी दुकान के दाम S$ में हैं। नया दाम S$ में कितना रखूँ?"


def test_a_dollar_price_in_a_rupee_shop_is_asked_about(shop):  # noqa: F811
    for message in ("Samosa is 2 dollars now", "Samosa is $2 now", "samosa two dollars"):
        result = run(message, shop)
        assert result and not result.events, message
        assert result.reply == "Your prices are in ₹. What price should I set, in ₹?"


def test_a_question_about_another_currency_changes_nothing_and_asks_nothing(sgd_shop):
    assert upkeep_call("How much is kopi in 20 rupees?", sgd_shop) is None
    assert upkeep_call("don't make kopi 20 rupees", sgd_shop) is None


def test_the_hindi_reply_uses_the_shops_own_currency(sgd_shop):
    token = ui_language.set("hi")
    try:
        result = run("समोसा अब 3 का है", sgd_shop)
    finally:
        ui_language.reset(token)
    assert result and "S$3" in result.reply and "₹" not in result.reply
    assert snapshot(result) == {"Samosa": (300, True)}


def test_the_demos_replies_use_the_shops_own_currency():
    assert _money(1000.5, "INR") == "₹1,000.50"
    assert _money(100000, "INR") == "₹100,000"
    assert _money(12.5, "SGD") == "S$12.50"


def test_a_live_hinglish_dont_is_answered_in_the_hindi_app(shop, hindi_app):  # noqa: F811
    part = supply_call("milk order mat karo", shop, [])
    assert part and part.text == "ठीक है, कुछ नहीं मँगाया।"


def test_nothing_to_change_is_not_a_card_that_says_no_change(shop):  # noqa: F811
    assert run("samosa 20 rupaye", shop) is None  # Samosa is already ₹20.


def test_half_a_sentence_is_never_prepared(shop):  # noqa: F811
    """ "Chai" is not a saved name here: the price's item is unclear, so the model asks."""
    assert run("chai aur samosa 25 rupaye", shop) is None


def test_one_verb_covers_the_shops_one_chai_too(shop):  # noqa: F811
    assert snapshot(run("chai aur samosa khatam", shop)) == {
        "Masala chai": (1500, False),
        "Samosa": (2000, False),
    }


@pytest.mark.parametrize(
    "message", ["cheeni ki order karo", "ande ke order kar do", "doodh ka order karo"]
)
def test_hinglish_order_takes_every_gender_of_ka(message):
    asked = order_asked(message)
    assert asked and known_supply(asked.item) and not asked.declined
