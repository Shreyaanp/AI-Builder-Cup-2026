"""Owner rule, 9 Nov: the app speaks the language the owner chose, everywhere, and nothing else.

A Hindi shop gets Hindi from the coach, its reminders and the reply drafts it sends customers; an
English shop never gets Hindi because one message (or one word) was in Hindi. Changing the
language applies at once: the next coach turn, this phone's reminders and the drafts all follow.
"""

import re
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app import reminders, web_push
from app.main import create_app
from app.merchant import MerchantStore
from app.settings import Settings
from tests.test_coach_owner_words import demo, reply_of  # noqa: F401
from tests.test_photos import app, join  # noqa: F401
from tests.test_reminders import push_settings, seed, valid_body  # noqa: F401

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
# English sentences the demo coach says; none may reach a Hindi shop.
ENGLISH_SENTENCE = re.compile(
    r"\b(?:Sorry|Next, open|I've prepared|Today's demo|Demo supply|has \d+ menu items|"
    r"Your reply to|I drafted|Demo suppliers)\b"
)


@pytest.mark.parametrize(
    "message",
    [
        "समोसा ख़त्म हो गया",
        "आज कितनी बिक्री हुई?",
        "मसाला चाय अब 25 रुपये की है",
        "I need दूध",
        "samosa ख़त्म",
        "नमस्ते",
        "मेरा दूध 20 लीटर कम हो रहा है। सप्लायर खोजें।",
        "प्रिया को जवाब दो: हाँ, समोसा है",
    ],
)
def test_english_shop_never_gets_hindi_from_a_hindi_message(demo, message):  # noqa: F811
    """Typing Hindi (or one Hindi word) in an English shop: the reply is English. What the
    message asked is still done where the coach understood it (a sold-out card, a price)."""
    events = demo(message, "en")
    reply = reply_of(events)
    assert reply and not DEVANAGARI.search(reply), (message, reply)
    # No reply card label in Hindi either, and the app language is not switched.
    labels = " ".join(str((e.get("data") or {}).get("label") or "") for e in events)
    assert not DEVANAGARI.search(labels), (message, labels)
    assert not [e for e in events if (e.get("data") or {}).get("target") == "language"]


def test_english_shop_still_gets_the_change_it_asked_for_in_hindi(demo):  # noqa: F811
    events = demo("समोसा ख़त्म हो गया", "en")
    [card] = [e["data"]["snapshot"] for e in events if e["kind"] == "proposal"]
    assert {p["name"]: p["available"] for p in card["products"]} == {"Samosa": False}
    assert "Samosa: sold out" in reply_of(events)


def test_english_shop_not_understood_in_hindi_is_told_how_to_switch(demo):  # noqa: F811
    reply = reply_of(demo("मुझे एक गाना सुनाओ", "en"))
    assert "I reply in English, the language you chose" in reply
    assert "Change language to Hindi" in reply and not DEVANAGARI.search(reply)


def test_english_shop_asking_for_a_screen_in_hindi_gets_its_guide_in_english(demo):  # noqa: F811
    reply = reply_of(demo("मेरा फ़ोन नंबर बदलो", "en"))
    assert "Shop name, kind and phone" in reply and not DEVANAGARI.search(reply)


@pytest.mark.parametrize(
    "message",
    [
        "what sold today?",
        "samosa sold out",
        "masala chai ka price 25 karo",
        "hello",
        "kal kya banau?",
        "reorder milk",
        "what should I do first?",
        "Reply to Priya: yes we have samosa",
        "close at 10pm",
    ],
)
def test_hindi_shop_gets_hindi_when_it_types_english(demo, message):  # noqa: F811
    """A Hindi shop typing English or Hinglish still hears back in Hindi."""
    events = demo(message, "hi")
    reply = reply_of(events)
    assert DEVANAGARI.search(reply), (message, reply)
    assert not ENGLISH_SENTENCE.search(reply), (message, reply)


def test_hindi_shop_reorder_names_the_item_asked_for(demo):  # noqa: F811
    reply = reply_of(demo("reorder milk", "hi"))
    assert "दूध" in reply and "चाय पत्ती" not in reply, reply


def test_a_language_change_applies_from_the_next_turn(demo):  # noqa: F811
    """ "Change language to Hindi" switches the app (the action), confirms in Hindi, and the next
    turn, sent in the new language, is Hindi; switching back is English at once."""
    events = demo("Change language to Hindi", "en")
    assert [e["data"] for e in events if e["kind"] == "action"] == [
        {"target": "language", "language": "hi"}
    ]
    assert "ग्राहकों को आपके जवाब हिंदी में हैं" in reply_of(events)
    assert DEVANAGARI.search(reply_of(demo("what sold today?", "hi")))
    events = demo("Switch to English", "hi")
    assert "the app language is now English" in reply_of(events)
    assert not DEVANAGARI.search(reply_of(demo("what sold today?", "en")))


def test_supplier_order_message_is_in_the_shops_language(demo):  # noqa: F811
    """The drafted order (what will be sent to the supplier) follows the shop's language, not
    the script the owner typed in."""
    for language, message in (
        ("en", "मेरा दूध 20 लीटर कम हो रहा है। सप्लायर खोजें।"),
        ("hi", "My milk 20 litres is running low. Find suppliers."),
    ):
        events = demo(message, language)
        [order] = [e["data"] for e in events if e["kind"] == "order"]
        sent = " ".join(str(v) for v in order.values() if isinstance(v, str))
        reply = reply_of(events)
        if language == "hi":
            assert DEVANAGARI.search(reply), reply
        else:
            assert not DEVANAGARI.search(reply) and not DEVANAGARI.search(sent), (reply, sent)


# --- Reminders ------------------------------------------------------------------------------------


# --- Understood in any script, answered in the chosen language (#714 review) --------------------

# The review's table: each question in Hindi script, Hinglish and English, with what the
# English shop's answer and the Hindi shop's answer must say (a real answer, never the fallback).
ASKED = {
    "sales": (
        ("आज कितनी बिक्री हुई?", "aaj kitni bikri hui?", "How much did I sell today?"),
        "Today's demo sales",
        "बिक्री",
    ),
    "stock": (
        ("दूध कितना बचा है?", "doodh kitna bacha hai?", "How much milk is left?"),
        "no stock count saved for milk",
        "दूध का स्टॉक",
    ),
    "price": (
        (
            "मसाला चाय का दाम क्या है?",
            "masala chai ka daam kya hai?",
            "What is the price of masala chai?",
        ),
        "The demo price for Masala chai is ₹20",
        "मसाला चाय की कीमत ₹20",
    ),
    "best_sellers": (
        ("सबसे ज़्यादा क्या बिका?", "sabse zyada kya bika?", "What sold the most?"),
        "best sellers: Masala chai",
        "सबसे ज़्यादा बिकने वाले आइटम: मसाला चाय",
    ),
    "tomorrow": (
        ("कल क्या बनाऊँ?", "kal kya banau?", "What should I make tomorrow?"),
        "forecast for Masala chai tomorrow",
        "कल की तैयारी",
    ),
    "customers": (
        ("ग्राहकों ने क्या पूछा?", "grahakon ne kya pucha?", "What did customers ask?"),
        "demo customer questions",
        "ग्राहक",
    ),
}
FALLBACKS = ("Sorry, I didn't catch that", "माफ़ कीजिए, मैं ठीक से समझ नहीं पाई")


@pytest.mark.parametrize(
    ("message", "language", "expected"),
    [
        (message, language, english if language == "en" else hindi)
        for messages, english, hindi in ASKED.values()
        for message in messages
        for language in ("en", "hi")
    ],
)
def test_every_question_is_understood_and_answered_in_the_chosen_language(
    demo,  # noqa: F811
    message,
    language,
    expected,
):
    """An English shop asking in Hindi or Hinglish gets the real answer in English; a Hindi
    shop asking in English or Hinglish gets it in Hindi."""
    reply = reply_of(demo(message, language))
    assert expected in reply, (message, language, reply)
    assert not any(fallback in reply for fallback in FALLBACKS), (message, language, reply)
    if language == "en":
        assert not DEVANAGARI.search(reply), (message, reply)
    else:
        assert not ENGLISH_SENTENCE.search(reply), (message, reply)


@pytest.mark.parametrize(
    ("message", "language", "expected"),
    [
        ("समोसा ख़त्म हो गया", "en", "Samosa: sold out"),
        ("samosa khatam ho gaya", "en", "Samosa: sold out"),
        ("मसाला चाय अब 25 रुपये की है", "en", "Masala chai: price ₹20 → ₹25"),
        ("masala chai ka price 25 karo", "en", "Masala chai: price ₹20 → ₹25"),
        ("दूध का ऑर्डर करो", "en", "Demo suppliers near you for Milk"),
        ("doodh mangao", "en", "Demo suppliers near you for Milk"),
        ("दुकान रात 10 बजे बंद करो", "en", "Demo shop hours are"),
        ("samosa sold out", "hi", "समोसा आज के लिए ख़त्म"),
        ("masala chai ka price 25 karo", "hi", "मसाला चाय ₹20 → ₹25"),
        ("doodh mangao", "hi", "दूध के लिए पास के डेमो सप्लायर"),
        ("दुकान रात 10 बजे बंद करो", "hi", "डेमो दुकान का समय"),
    ],
)
def test_change_requests_are_understood_in_any_script(demo, message, language, expected):  # noqa: F811
    """What worked on main still works: a change or an order asked in Hindi or Hinglish is
    prepared, and said in the shop's language."""
    reply = reply_of(demo(message, language))
    assert expected in reply, (message, language, reply)
    if language == "en":
        assert not DEVANAGARI.search(reply), (message, reply)


def test_only_hindi_or_hinglish_is_read_again_in_english() -> None:
    """Only a Hindi or Hinglish question is read again in English; English stays as it was."""
    from app.demo_coach_en import in_english, item_in

    assert in_english("What sold the most?") is None
    assert in_english("मसाला चाय का दाम क्या है?") == "What is the price of Masala chai?"
    assert in_english("doodh kitna bacha hai?") == "How much Milk is in stock?"
    assert in_english("मेरा फ़ोन नंबर बदलो") is None
    assert item_in("chai patti kitni bachi hai?") == "Tea dust"


def test_the_live_coach_answers_in_the_chosen_language_whatever_script_is_typed() -> None:
    """The live coach reads Hindi itself; its instruction pins the reply to the app language."""
    from app.agent import INSTRUCTION

    assert "Reply in the owner's chosen app language" in INSTRUCTION
    assert "even when the owner mixes in other languages" in " ".join(INSTRUCTION.split())


def test_reminder_language_follows_the_app_at_once(push_settings: Settings, monkeypatch: Any):  # noqa: F811
    """A phone subscribed in English, then the owner switches the app to Hindi: the next
    reminder is Hindi. Only an existing reminder is relabelled; its shop stays."""
    app_ = create_app(push_settings, InMemorySessionService())
    with TestClient(app_) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals", json={"kind": "business", "business": {"name": "Tea"}}
        ).json()
        bid = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()["business_id"]
        value = valid_body(bid, "en")
        assert client.put("/api/v1/reminders", json=value).status_code == 200
        sid = reminders.subscription_id(value["subscription"]["endpoint"])
        changed = client.put(f"/api/v1/reminders/{sid}/locale", json={"locale": "hi"})
        assert changed.status_code == 200 and changed.json()["ok"] is True
        # Unknown phone: nothing is created.
        missing = client.put(f"/api/v1/reminders/{'0' * 64}/locale", json={"locale": "hi"})
        assert missing.status_code == 200 and missing.json()["ok"] is False
        assert client.get("/api/v1/reminders").json()["subscriptions"] == [sid]
        # Not an app language.
        assert (
            client.put(f"/api/v1/reminders/{sid}/locale", json={"locale": "fr"}).status_code == 422
        )
        # Another owner cannot relabel this phone.
        cookies = dict(client.cookies)
        client.cookies.clear()
        join(client)
        other = client.put(f"/api/v1/reminders/{sid}/locale", json={"locale": "ta"})
        assert other.json()["ok"] is False
        client.cookies.clear()
        client.cookies.update(cookies)


@pytest.mark.parametrize(
    ("start", "now_in", "title"),
    [("en", "hi", "1 कामों पर ध्यान दें"), ("hi", "en", "1 things need you")],
)
async def test_relabelled_reminder_is_sent_in_the_new_language(
    start: str,
    now_in: str,
    title: str,
    push_settings: Settings,  # noqa: F811
    monkeypatch: Any,
) -> None:
    repository = MerchantStore(push_settings.merchant_database)
    bid = seed(repository)
    value = reminders.ReminderInput.model_validate(valid_body(bid, start))
    reminders.save(repository.feature_docs, "owner", value)
    sid = reminders.subscription_id(value.subscription.endpoint)
    assert reminders.relabel(repository.feature_docs, "owner", sid, now_in) is True
    entry = repository.feature_docs.get(reminders.KIND, "owner")["entries"][sid]
    assert entry["locale"] == now_in and entry["business_id"] == bid
    sender = AsyncMock(return_value=201)
    monkeypatch.setattr(web_push, "send", sender)
    now = datetime(2026, 10, 12, 3, 30, tzinfo=UTC)
    assert (await reminders.dispatch(repository, push_settings, now)).sent == 1
    assert sender.call_args.args[2]["title"] == title
