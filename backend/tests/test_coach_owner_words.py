"""OB-261, OB-262, OB-264 and S2-9: the coach understands the owner's own words.

Hindi, Hinglish and two-in-one sentences become one review card; a sold-out statement never
drafts a purchase; "what first?" reads the shop's own list and the time of day; tomorrow's note
and the app language are set by chat; anything unclear gets one short question in the owner's
language. The public demo is offline: none of this calls a model.
"""

import json
import re
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import demo_coach_words
from app.demo_coach import FALLBACK, SUGGESTIONS
from app.demo_coach_words import FALLBACK_HI, SUGGESTIONS_HI
from app.rescue import local_now
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo import open_demo
from tests.test_voice_everything import ctx, run, shop  # noqa: F401

ROOT = Path(__file__).resolve().parents[2]
# An English word in a Hindi reply: a breadcrumb the Hindi owner can't read. Customer names
# (Priya) and brand names are the only Latin words a Hindi reply may carry.
ENGLISH_WORD = re.compile(r"\b(?!Priya\b|Wei\b|Google\b|UPI\b)[A-Za-z]{3,}\b")

Turn = Callable[..., list[dict]]


@pytest.fixture
def demo(app) -> Iterator[Turn]:  # noqa: F811
    """One public demo session; each call is one coach turn in the given app language."""
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]

        def turn(message: str, language: str = "en") -> list[dict]:
            app.state.rate_limiter.counters.clear()
            response = client.post(
                f"/api/v1/demo/sessions/{session}/coach",
                json={"message": message, "language": language},
            )
            assert response.status_code == 200, (message, response.text)
            return [
                json.loads(line[6:])
                for line in response.text.splitlines()
                if line.startswith("data: ")
            ]

        yield turn
        app.state.rate_limiter.counters.clear()


def at(monkeypatch: pytest.MonkeyPatch, hour: int, minute: int = 0) -> None:
    """The demo shop's local time for "what first?"."""
    monkeypatch.setattr(
        demo_coach_words,
        "_now",
        lambda fields: local_now(fields).replace(hour=hour, minute=minute),
    )


def reply_of(events: list[dict]) -> str:
    return " ".join(e.get("text") or "" for e in events if e["kind"] == "reply").strip()


def cards(events: list[dict]) -> list[dict]:
    return [e["data"]["snapshot"] for e in events if e["kind"] == "proposal"]


def products(events: list[dict]) -> dict[str, tuple[int, bool]]:
    [card] = cards(events)
    return {p["name"]: (p["price"], p["available"]) for p in card["products"]}


def no_purchase(events: list[dict]) -> None:
    kinds = {e["kind"] for e in events}
    assert not kinds & {"order", "suppliers", "purchase_order"}, events


@pytest.mark.parametrize(
    ("message", "language"),
    [
        ("समोसा खत्म हो गया", "hi"),
        ("समोसा ख़त्म हो गया", "hi"),
        ("समोसे ख़त्म", "hi"),
        ("आज समोसा खत्म हो गया है।", "hi"),
        ("samosa khatam ho gaya", "en"),
        ("samosa khatam ho gaya", "hi"),
        ("Samosa khatam", "en"),
        ("samosa nahi hai", "en"),
        ("I've run out of samosa", "en"),
        ("आज समोसे सब बिक गए", "hi"),
        ("samose khatam ho gaye", "en"),
    ],
)
def test_OB_261_a_sold_out_statement_marks_the_item_sold_out(demo, message, language):  # noqa: N802
    events = demo(message, language)
    no_purchase(events)
    assert products(events) == {"Samosa": (2000, False)}, events
    reply = reply_of(events)
    if language == "hi":
        assert "समोसा आज के लिए ख़त्म" in reply and "अब दुकान → खत्म खोलें।" in reply, reply
        assert not ENGLISH_WORD.search(reply), reply
    else:
        assert "Samosa: sold out" in reply and "Next, open Shop → Sold out." in reply, reply


@pytest.mark.parametrize(
    ("message", "language", "question"),
    [
        ("चाय पत्ती खत्म हो गई", "hi", "क्या मैं इसके सप्लायर ढूँढूँ?"),
        ("चाय पत्ती ख़त्म", "hi", "क्या मैं इसके सप्लायर ढूँढूँ?"),
        ("tea dust khatam ho gaya", "hi", "क्या मैं इसके सप्लायर ढूँढूँ?"),
        ("Tea dust is sold out", "en", "Shall I find suppliers for it?"),
        ("tea dust khatam", "en", "Shall I find suppliers for it?"),
    ],
)
def test_OB_261_never_drafts_a_purchase_from_a_sold_out_statement(  # noqa: N802
    demo, message, language, question
):
    """Something the shop buys gets one short question in the owner's language, never an order
    card or a sold-out card."""
    events = demo(message, language)
    no_purchase(events)
    assert cards(events) == [], events
    reply = reply_of(events)
    assert reply.endswith(question) and reply.count("?") == 1, reply
    offered = next(e for e in events if e["kind"] == "reply")["data"]["suggestions"]
    # The one tap that does it, if the owner wants it.
    assert len(offered) == 1 and ("सप्लायर" in offered[0] or "suppliers" in offered[0])


def test_OB_261_running_low_still_finds_suppliers(demo):  # noqa: N802
    """ "About to run out" is not "sold out": the screen's own phrase still drafts the order."""
    events = demo("दूध ख़त्म होने वाला है", "hi")
    assert {e["kind"] for e in events} >= {"suppliers", "order"}
    assert cards(events) == []


@pytest.mark.parametrize(
    ("message", "language", "want", "words"),
    [
        # The tour's own example: Masala chai is already ₹20, so only Samosa changes.
        (
            "Chai is 20 rupees now, samosa sold out",
            "en",
            {"Samosa": (2000, False)},
            "The demo price for Masala chai is ₹20.",
        ),
        (
            "Chai is ₹18 now, samosa sold out",
            "en",
            {"Masala chai": (1800, True), "Samosa": (2000, False)},
            "Masala chai: price ₹20 → ₹18 per cup; Samosa: sold out",
        ),
        (
            "chai ab 25 ka hai aur samosa khatam ho gaya",
            "en",
            {"Masala chai": (2500, True), "Samosa": (2000, False)},
            "Masala chai: price ₹20 → ₹25 per cup; Samosa: sold out",
        ),
        (
            "चाय अब 20 रुपये की है, समोसे ख़त्म।",
            "hi",
            {"Samosa": (2000, False)},
            "डेमो में मसाला चाय की कीमत पहले से ₹20 है।",
        ),
        (
            "चाय अब ₹18 की है, समोसा खत्म हो गया",
            "hi",
            {"Masala chai": (1800, True), "Samosa": (2000, False)},
            "मसाला चाय ₹20 → ₹18; समोसा आज के लिए ख़त्म",
        ),
        (
            "ginger chai 30 rupees and bun maska sold out",
            "en",
            {"Ginger chai": (3000, True), "Bun maska": (3500, False)},
            "Ginger chai: price ₹25 → ₹30 per cup; Bun maska: sold out",
        ),
    ],
)
def test_OB_262_two_changes_in_one_sentence_are_one_card(  # noqa: N802
    demo, message, language, want, words
):
    events = demo(message, language)
    no_purchase(events)
    assert len(cards(events)) == 1, events
    assert products(events) == want, events
    reply = reply_of(events)
    assert words in reply, reply
    if language == "hi":
        assert not ENGLISH_WORD.search(reply), reply


def _quoted(path: str, block: str | None = None) -> list[str]:
    """The example sentences a screen shows in quotes, from its copy file (one locale block)."""
    text = (ROOT / path).read_text(encoding="utf-8")
    if block:
        start = text.index(f"  {block}: {{")
        end = text.index("\n  },", start)
        text = text[start:end]
    return re.findall(r"“([^”]+)”", text)


def _bubble(path: str, key: str, nth: int) -> str:
    found = re.findall(rf"{key}: '([^']+)'", (ROOT / path).read_text(encoding="utf-8"))
    return found[nth]


TOUR_EXAMPLES = [
    *((sentence, "en") for sentence in _quoted("src/features/tour/strings.ts")),
    *((sentence, "hi") for sentence in _quoted("src/features/tour/translations.ts", "hi")),
    # First run: the front door's chat bubble and the app's own preview, English and Hindi.
    (_bubble("src/features/frontdoors/strings.ts", "bubbleMe", 0), "en"),
    (_bubble("src/features/frontdoors/strings.ts", "bubbleMe", 1), "hi"),
    (_bubble("src/features/v1/strings.ts", "previewChat", 0), "en"),
]


def test_the_tour_examples_are_found():
    sentences = [sentence for sentence, _ in TOUR_EXAMPLES]
    assert "Chai is 20 rupees now, samosa sold out." in sentences
    assert "चाय अब 20 रुपये की है, समोसे ख़त्म।" in sentences
    assert "चाय अब ₹18 की है, समोसा खत्म हो गया" in sentences
    assert len(TOUR_EXAMPLES) >= 7


@pytest.mark.parametrize(("message", "language"), TOUR_EXAMPLES)
def test_OB_262_every_tour_and_first_run_example_works(demo, message, language):  # noqa: N802
    """Every sentence the tour and first run tell the owner to say does its job: never the
    examples list or a question back, and a sold-out example is a sold-out card."""
    events = demo(message, language)
    reply = reply_of(events)
    assert reply and reply not in {FALLBACK, FALLBACK_HI}, (message, reply)
    assert not any((e.get("data") or {}).get("suggestions") for e in events), (message, events)
    if re.search(r"sold out|ख़?त्म(?!\s+हो\s+रह)", message):
        no_purchase(events)
        assert products(events)["Samosa"][1] is False, (message, events)
    if language == "hi":
        # A supplier's own name ("FreshMart (Demo)") is a name, not an English breadcrumb.
        for card in (e["data"] for e in events if e["kind"] == "suppliers"):
            for supplier in card.get("suppliers") or []:
                reply = reply.replace(supplier["name"], "")
        assert not ENGLISH_WORD.search(reply), (message, reply)


@pytest.mark.parametrize(
    ("message", "language"),
    [
        ("What should I do first today?", "en"),
        ("What should I do today?", "en"),
        ("what do I do first", "en"),
        ("aaj pehle kya karna hai", "en"),
        ("आज सबसे पहले क्या करूँ?", "hi"),
        ("आज क्या करना है?", "hi"),
    ],
)
def test_OB_264_what_first_in_the_morning_reads_the_shops_own_list(  # noqa: N802
    demo, monkeypatch, message, language
):
    at(monkeypatch, 10)
    events = demo(message, language)
    reply = reply_of(events)
    buttons = [e["data"] for e in events if e["kind"] == "action"]
    # The waiting customer leads, then stock and prep; each job has a button that opens it.
    assert buttons and all(b["offer"] is True for b in buttons), events
    assert buttons[0]["target"] == "messages", buttons
    assert "close_day" not in [b["target"] for b in buttons], buttons
    assert "₹0" not in reply
    if language == "hi":
        assert "सबसे पहले: Priya आपके जवाब का इंतज़ार कर रहे हैं।" in reply, reply
        assert "बन मस्का सिर्फ़ 4 बचे हैं" in reply, reply
        assert buttons[0]["label"] == "ग्राहकों के संदेश"
        assert not ENGLISH_WORD.search(reply), reply
    else:
        assert "First today: Priya is waiting for a reply." in reply, reply
        assert "Only 4 Bun maska left: make more." in reply, reply
        assert "Close the day" not in reply, reply
        assert re.search(r"Prep about \d+ cups of Masala chai today\.", reply), reply


def test_OB_264_what_first_in_the_evening_is_close_the_day(demo, monkeypatch):  # noqa: N802
    at(monkeypatch, 20, 30)
    events = demo("What should I do first today?")
    buttons = [e["data"]["target"] for e in events if e["kind"] == "action"]
    assert buttons[0] == "close_day", buttons
    assert "Good evening. First today: Close the day" in reply_of(events)


@pytest.mark.parametrize(
    "message", ["How much did I sell today?", "How did I do today?", "aaj kitna becha"]
)
def test_OB_264_today_sales_answer_sales_never_close_the_day(demo, message):  # noqa: N802
    events = demo(message)
    reply = reply_of(events)
    assert "demo sales" in reply and "Yesterday:" in reply, reply
    assert "Close the day" not in reply and not [e for e in events if e["kind"] == "action"]


def test_OB_264_today_sales_are_rupees_not_paise(demo, monkeypatch):  # noqa: N802
    """Saved sales are paise: 3 samosas are ₹60 in the English and the Hindi answer."""
    from app.merchant import MerchantStore

    saved = MerchantStore.sales_history

    def with_today(self, uid: str, bid: str) -> list[dict]:
        rows = saved(self, uid, bid)
        today = local_now({"timezone": "Asia/Kolkata"}).date().isoformat()
        return [
            *(row for row in rows if row["date"] != today),
            {"date": today, "item": "Samosa", "quantity": 3, "revenue": 6000},
        ]

    monkeypatch.setattr(MerchantStore, "sales_history", with_today)
    assert "3 items for ₹60." in reply_of(demo("How much did I sell today?"))
    assert "3 चीज़ें बिकीं और बिक्री ₹60 रही" in reply_of(demo("आज बिक्री कैसी रही?", "hi"))


@pytest.mark.parametrize(
    ("message", "language", "words"),
    [
        (
            "Remind me to order milk tomorrow",
            "en",
            "Written down for tomorrow morning: “order milk”",
        ),
        ("remind me tomorrow to call Ganesh", "en", "“call Ganesh”"),
        ("कल सुबह दूध मँगाना याद दिलाना", "hi", "कल सुबह के लिए लिख लिया: “दूध मँगाना”"),
        ("Remind me to order milk tomorrow", "hi", "कल सुबह के लिए लिख लिया: “order milk”"),
    ],
)
def test_S2_9_remind_me_tomorrow_writes_tomorrows_note(demo, message, language, words):  # noqa: N802
    reply = reply_of(demo(message, language))
    assert words in reply, reply
    assert "Coach" in reply or "कोच" in reply


@pytest.mark.parametrize(
    ("message", "language", "chosen", "words"),
    [
        ("Change language to Hindi", "en", "hi", "the app language is now Hindi"),
        ("Switch to English", "hi", "en", "अंग्रेज़ी"),
        ("Hindi mein bolo", "en", "hi", "the app language is now Hindi"),
        ("Reply in Tamil", "en", "ta", "the app language is now Tamil"),
        ("हिंदी में जवाब दो", "en", "hi", "अब ऐप और कोच हिंदी में हैं"),
        ("भाषा अंग्रेज़ी करो", "hi", "en", "अब ऐप और कोच अंग्रेज़ी में हैं"),
    ],
)
def test_S2_9_change_language_by_chat(demo, message, language, chosen, words):  # noqa: N802
    events = demo(message, language)
    switch = [e["data"] for e in events if e["kind"] == "action"]
    assert switch == [{"target": "language", "language": chosen}], events
    assert words in reply_of(events), reply_of(events)


def test_S2_9_close_the_day_by_chat_offers_the_screen(demo):  # noqa: N802
    events = demo("Close the day")
    [button] = [e["data"] for e in events if e["kind"] == "action"]
    assert button["target"] == "close_day" and button["offer"] is True
    assert "₹0" not in reply_of(events) and "saves your sales" in reply_of(events)


@pytest.mark.parametrize(
    ("message", "language", "ask", "chips"),
    [
        ("What is my business called?", "en", FALLBACK, SUGGESTIONS),
        ("What is my business called?", "hi", FALLBACK_HI, SUGGESTIONS_HI),
        ("मेरी दुकान का नाम क्या है?", "hi", FALLBACK_HI, SUGGESTIONS_HI),
        (
            "samosa sold out tomorrow",
            "en",
            "What should change for Samosa: its price, or sold out for today?",
            SUGGESTIONS,
        ),
        ("close at 10pm only on Fridays", "en", "Which time should I set", SUGGESTIONS),
    ],
)
def test_S2_9_unsure_asks_one_short_question_in_the_owners_language(  # noqa: N802
    demo, message, language, ask, chips
):
    events = demo(message, language)
    reply = reply_of(events)
    assert reply.startswith(ask) and reply.count("?") == 1, reply
    assert cards(events) == []
    offered = next(e for e in events if e["kind"] == "reply")["data"]["suggestions"]
    assert offered == list(chips)
    if language == "hi":
        assert not ENGLISH_WORD.search(reply), reply


@pytest.mark.parametrize("chip", SUGGESTIONS_HI)
def test_S2_9_every_hindi_example_chip_works(demo, monkeypatch, chip):  # noqa: N802
    at(monkeypatch, 10)
    events = demo(chip, "hi")
    reply = reply_of(events)
    assert reply and reply != FALLBACK_HI and hindi_only(reply), (chip, reply)
    assert not any((e.get("data") or {}).get("suggestions") for e in events), (chip, events)


def hindi_only(reply: str) -> bool:
    return bool(re.search(r"[ऀ-ॿ]", reply)) and not ENGLISH_WORD.search(reply)


# --- The live coach routes the same sentences (instant path, before any model call) ---------


def test_OB_262_live_instant_path_reads_hinglish_sold_out(shop):  # noqa: N802, F811
    for message in ("samosa khatam ho gaya", "Samosa nahi hai", "samosa khatam"):
        result = run(message, shop)
        assert result and result.intent == "upkeep", message
        [event] = result.events
        sold = {p["name"]: p["available"] for p in event.data["snapshot"]["products"]}
        assert sold["Samosa"] is False, message


def test_OB_262_live_instant_path_keeps_two_changes_together(shop):  # noqa: N802, F811
    both = run("Masala chai 18 rupees aur samosa khatam", shop)
    assert both and both.intent == "upkeep"
    [event] = both.events
    changed = {p["name"]: (p["price"], p["available"]) for p in event.data["snapshot"]["products"]}
    assert changed["Masala chai"][0] == 1800 and changed["Samosa"][1] is False
    # "Chai" is not an item here: never a card that silently drops the price; the model reads it.
    assert run("Chai is 20 rupees now, samosa sold out", shop) is None
    # Running low is not sold out.
    assert run("samosa khatam ho rahi hai", shop) is None


def test_OB_262_live_instant_path_never_reads_a_dont_as_sold_out(shop):  # noqa: N802, F811
    for message in (
        "samosa khatam mat karo",
        "samosa khatam nahi hua",
        "masala chai mein cheeni nahi hai",
        "don't mark samosa sold out",
    ):
        assert run(message, shop) is None, message
    # "not available" is itself a sold-out phrase.
    result = run("samosa not available", shop)
    assert result and result.intent == "upkeep"


def test_OB_262_live_instant_path_keeps_both_items_of_one_verb(shop):  # noqa: N802, F811
    for message in (
        "samosa aur masala chai khatam",
        "samosa and masala chai are sold out",
        "samosa and masala chai sold out",
    ):
        result = run(message, shop)
        assert result and result.intent == "upkeep", message
        [event] = result.events
        sold = {p["name"]: p["available"] for p in event.data["snapshot"]["products"]}
        assert len(sold) == 2 and not any(sold.values()), (message, sold)


@pytest.mark.parametrize(
    "message",
    [
        "milk khatam ho raha hai, order karo",
        "milk khatam hone wala hai",
        "दूध ख़त्म हो रहा है, ऑर्डर करो",
    ],
)
def test_OB_262_running_low_drafts_an_order_that_waits_for_send(demo, message):  # noqa: N802
    events = demo(message, "en")
    kinds = {e["kind"] for e in events}
    assert {"suppliers", "order"} <= kinds and not cards(events), events
    assert "for karo" not in reply_of(events).casefold()


def test_OB_262_demo_keeps_both_items_of_one_verb(demo):  # noqa: N802
    for message in ("samosa aur bun maska khatam", "samosa and bun maska are sold out"):
        both = products(demo(message, "en"))
        assert set(both) == {"Samosa", "Bun maska"} and not any(a for _, a in both.values())
