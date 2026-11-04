"""OB-303: one-tap reply drafts are grounded in the shop's own data, in the customer's language."""

import asyncio
import re
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app import reply_suggestions
from app.reply_suggestions import customer_language, grounded, suggest, template_replies
from tests.test_customer import app as app
from tests.test_threads import owned_shop

SHOP = {
    "name": "Lantern Chai Corner",
    "category": "Tea stall",
    "location": "Indiranagar",
    "hours": "06:30–21:00",
    "phone": "",
    "currency": "INR",
    "facts": {"payment_methods": ["cash", "upi"]},
    "products": [
        {"name": "Masala chai", "price": 2000, "unit": "cup", "available": True, "source": "made"},
        {"name": "Samosa", "price": 2000, "unit": "piece", "available": True, "source": "made"},
        {"name": "Tea dust", "price": 32000, "unit": "kg", "available": True, "source": "bought"},
        {"name": "Ragi biscuit", "price": 1500, "unit": "piece", "available": False},
    ],
}
PRICES = {"₹20", "₹15", "₹320"}


def offered_prices(replies: list[str]) -> set[str]:
    return set(re.findall(r"₹\d+", " ".join(replies)))


@pytest.mark.parametrize(
    ("text", "language"),
    [
        ("Is Masala chai available this afternoon?", "en"),
        ("क्या आज समोसा मिलेगा?", "hi"),
        ("समोसा मिळेल का? आज आहे?", "mr"),
        ("samosa milega kya?", "hi"),
        ("Ada roti canai tak?", "ms"),
        ("Còn bánh mì không?", "vi"),
        ("还有咖椰吐司吗？", "zh-Hans"),
        ("カヤトーストはありますか", "ja"),
        ("오늘 영업해요?", "ko"),
        ("இன்று திறந்திருக்கிறதா?", "ta"),
        ("Ada roti canai hari ini?", "ms"),
        ("samosa irukka?", "ta"),
        ("சமோசா இருக்கா?", "ta"),
    ],
)
def test_customer_language_by_script_and_words(text: str, language: str) -> None:
    assert customer_language(text) == language


def test_available_item_drafts_use_only_its_own_price_in_the_customer_language() -> None:
    english = template_replies(SHOP, "Is Masala chai available this afternoon?", "en")
    assert len(english) == 3
    assert (
        english[0] == "Yes, Masala chai is available today: ₹20 per cup. Shall I keep one for you?"
    )
    assert "06:30–21:00" in english[1]
    assert offered_prices(english) <= {"₹20"}
    hindi = template_replies(SHOP, "क्या आज समोसा मिलेगा?", "hi")
    assert len(hindi) == 3 and all(re.search(r"[ऀ-ॿ]", r) for r in hindi)
    assert "समोसा" in hindi[0] and "₹20 प्रति पीस" in hindi[0]
    assert not any(re.search(r"\b(?:Yes|Sorry|available)\b", r) for r in hindi)


def test_sold_out_item_is_never_offered_as_available() -> None:
    for question, language in [
        ("Do you have Ragi biscuit today?", "en"),
        ("क्या रागी बिस्कुट है?", "hi"),
    ]:
        replies = template_replies(SHOP, question, language)
        assert len(replies) == 3
        yes = reply_suggestions.COPY[language][reply_suggestions.YES_PRICE].split("{")[0]
        assert not any(r.startswith(yes) for r in replies)
        assert any(("sold out" in r) if language == "en" else ("ख़त्म" in r) for r in replies[:1])
        # The stand-in is something the shop makes and has today, never bought stock (tea dust).
        assert not any("Tea dust" in r or "₹320" in r for r in replies)
        assert offered_prices(replies) <= PRICES - {"₹15"}


def test_no_invented_items_or_prices_when_the_question_names_nothing_listed() -> None:
    replies = template_replies(SHOP, "Do you sell pizza? Is it ₹99?", "en")
    assert len(replies) == 3
    assert offered_prices(replies) == set()
    assert not any("pizza" in r.casefold() for r in replies)
    assert any("06:30–21:00" in r for r in replies)
    assert template_replies(SHOP, "How can I pay?", "en")[0] == "You can pay with cash, UPI."
    assert template_replies(SHOP, "Where are you?", "en")[0] == "You'll find us at Indiranagar."
    bare = {**SHOP, "hours": "", "location": "", "products": []}
    assert template_replies(bare, "Where are you and when do you open?", "en") == [
        "Thank you for your message! I'll reply shortly.",
        "Could you tell me a little more, please?",
    ]


def test_every_template_language_has_every_sentence() -> None:
    from app.reply_language import LANGUAGES

    for locale in LANGUAGES:
        copy = reply_suggestions.COPY[locale]
        assert len(copy) == len(reply_suggestions.COPY["en"]), locale
        for english, local in zip(reply_suggestions.COPY["en"], copy, strict=True):
            assert set(re.findall(r"\{\w+\}", english)) == set(re.findall(r"\{\w+\}", local))


def test_grounding_check_rejects_invented_prices_and_sold_out_offers() -> None:
    assert grounded("Yes, Masala chai is ₹20 a cup today!", SHOP)
    assert not grounded("Yes, Masala chai is ₹18 today!", SHOP)
    assert not grounded("Yes, we open at 5 AM.", SHOP)
    assert not grounded("Yes, Ragi biscuit is ready for you!", SHOP)
    assert grounded("Sorry, Ragi biscuit is sold out right now.", SHOP)


@pytest.mark.parametrize(
    "draft",
    [
        # Invented items.
        "Yes we have Pizza and Butter naan today!",
        "Yes, we have butter naan and pizza.",
        "हाँ, बटर नान मिलेगा!",
        # A sold-out item offered, with a negation that is not the fixed sold-out sentence.
        "Ragi biscuit fresh today — not sold out!",
        "Yes! रागी बिस्कुट मिल जाएगा, कोई बात नहीं",
        "ராகி பிஸ்கட் இன்று கிடைக்கும்!",
        "Ya, biskut ragi ada hari ini!",
        "Yes, ragi-biscuit ready",
        "Yes, ragi  biscuits ready",
        "Sorry, Ragi biscuit is sold out right now. Just kidding, Ragi biscuit is here!",
        # Prices written as words.
        "Masala chai is twenty rupees",
        "मसाला चाय बीस रुपये की है",
    ],
)
def test_grounding_check_rejects_invented_items_sold_out_offers_and_spelled_prices(
    draft: str,
) -> None:
    assert not grounded(draft, SHOP)


def test_grounding_check_keeps_true_drafts_in_every_script() -> None:
    for draft in [
        "Sorry, Ragi biscuit is sold out right now. We do have Samosa (₹20).",
        "माफ़ कीजिए, रागी बिस्कुट अभी ख़त्म हो गया है।",
        "மன்னிக்கவும், ராகி பிஸ்கட் இப்போது தீர்ந்துவிட்டது.",
        "ஆம், சமோசா இருக்கிறது!",
        "Hi Priya, we're open 06:30–21:00. See you soon!",
        "Thank you! I'll reply shortly.",
    ]:
        assert grounded(draft, SHOP, allowed=("Priya",)), draft
    # The customer's own name only when the route passes it.
    assert not grounded("Hi Priya, see you soon!", SHOP)


WEDNESDAY = datetime(2026, 11, 4, 4, tzinfo=UTC)  # 09:30 in Bengaluru
CLOSED = {**SHOP, "timezone": "Asia/Kolkata", "closed_on": "2026-11-04"}


def test_closed_today_drafts_never_say_open_or_available() -> None:
    for question, language in [
        ("Is Masala chai available?", "en"),
        ("aaj shop khuli hai?", "hi"),
        ("क्या आज समोसा मिलेगा?", "hi"),
        ("Do you have Ragi biscuit today?", "en"),
        ("What time do you open?", "en"),
        ("சமோசா இருக்கா?", "ta"),
        ("Ada roti canai hari ini?", "ms"),
    ]:
        replies = template_replies(CLOSED, question, language, WEDNESDAY)
        copy = reply_suggestions.COPY[language]
        assert copy[reply_suggestions.CLOSED_TODAY] in replies, question
        joined = " ".join(replies)
        # Only sorry-closed, tomorrow's hours, sold out, thanks and "tell me more".
        items = [reply_suggestions._name(p, language) for p in SHOP["products"]]
        allowed = {
            copy[reply_suggestions.CLOSED_TODAY],
            copy[reply_suggestions.OPEN_TOMORROW].format(hours="06:30–21:00"),
            copy[reply_suggestions.THANKS],
            copy[reply_suggestions.MORE],
            *(copy[reply_suggestions.SOLD_OUT].format(item=item) for item in items),
            *(copy[reply_suggestions.BACK_SOON].format(item=item) for item in items),
        }
        assert set(replies) <= allowed, (question, replies)
        assert not re.search(
            r"available today|We're open 06:30–21:00\. See|आज मिल रहा|दुकान 06:30–21:00 खुली है",
            joined,
        )
    # The next day it is open as usual.
    thursday = datetime(2026, 11, 5, 4, tzinfo=UTC)
    assert template_replies(CLOSED, "Is Masala chai available?", "en", thursday)[0].startswith(
        "Yes, Masala chai is available today"
    )


def test_every_language_says_sorry_we_are_closed_today() -> None:
    for locale, copy in reply_suggestions.COPY.items():
        sentence = copy[reply_suggestions.CLOSED_TODAY]
        assert sentence and "{" not in sentence, locale
        if locale != "en":
            assert sentence != reply_suggestions.COPY["en"][reply_suggestions.CLOSED_TODAY]
    assert template_replies(CLOSED, "Is it open?", "hi", WEDNESDAY)[0] == (
        "माफ़ कीजिए, आज दुकान बंद है।"
    )


def test_weekly_hours_answer_for_today_and_tomorrow() -> None:
    week = {
        **SHOP,
        "timezone": "Asia/Kolkata",
        "weekly_hours": [
            {"day": "wed", "closed": False, "open": "07:00", "close": "20:00"},
            {"day": "thu", "closed": False, "open": "08:00", "close": "13:00"},
            {"day": "fri", "closed": True, "open": None, "close": None},
        ],
    }
    assert template_replies(week, "What time do you open?", "en", WEDNESDAY)[0] == (
        "We're open 07:00–20:00. See you soon!"
    )
    tomorrow = template_replies(week, "When do you open tomorrow?", "en", WEDNESDAY)
    assert tomorrow[0] == "Tomorrow we're open 08:00–13:00. See you then!"
    assert not any("06:30" in r or "07:00" in r for r in tomorrow)
    assert template_replies(week, "kal dukaan kab khulegi?", "hi", WEDNESDAY)[0] == (
        "कल दुकान 08:00–13:00 खुली रहेगी। तब मिलते हैं!"
    )
    thursday = datetime(2026, 11, 5, 4, tzinfo=UTC)
    assert template_replies(week, "Open tomorrow?", "en", thursday)[0] == (
        "Sorry, we're closed tomorrow."
    )
    # A weekday the shop always closes is a closed day too.
    friday = datetime(2026, 11, 6, 4, tzinfo=UTC)
    closed = template_replies(week, "Is Samosa available?", "en", friday)
    assert closed[0] == "Sorry, we're closed today." and "available today" not in " ".join(closed)


def test_model_gets_closed_day_hours_and_sold_out_and_its_open_drafts_are_rejected() -> None:
    facts = reply_suggestions.model_facts(CLOSED, "en", WEDNESDAY)
    assert facts["closed_on"] == "2026-11-04" and facts["closed_today"] is True
    assert facts["today_hours"] == "" and facts["tomorrow_hours"] == "06:30–21:00"
    assert facts["closed_today_sentence"] == "Sorry, we're closed today."
    assert facts["weekly_hours"] == [] and facts["sold_out"] == ["Ragi biscuit"]
    assert facts["sold_out_sentence"] == "Sorry, {item} is sold out right now."
    open_facts = reply_suggestions.model_facts(SHOP, "en", WEDNESDAY)
    assert open_facts["closed_today"] is False and open_facts["today_hours"] == "06:30–21:00"
    for draft in [
        "Yes, Masala chai is available today: ₹20 per cup.",
        "Yes, Masala chai is ₹20 a cup today!",
        "We're open 06:30–21:00, come by any time!",
        "दुकान 06:30–21:00 खुली है",
        "Sorry, we're closed today. But Samosa is ready if you come by!",
    ]:
        assert not grounded(draft, CLOSED, now=WEDNESDAY), draft
    assert grounded("Sorry, we're closed today.", CLOSED, now=WEDNESDAY)
    assert grounded("Sorry, we're closed today. Masala chai is ₹20.", CLOSED, now=WEDNESDAY)


def test_bought_stock_is_never_offered_and_tamil_names_match_items() -> None:
    replies = template_replies(SHOP, "How much is tea dust?", "en")
    assert not any("Tea dust" in r or "₹320" in r for r in replies)
    tamil = template_replies(SHOP, "மசாலா டீ கிடைக்குமா?", "ta")
    assert tamil[0].startswith("ஆம், மசாலா டீ இன்று கிடைக்கும்: ₹20")
    sold_out = template_replies(SHOP, "ராகி பிஸ்கட் இருக்கா?", "ta")
    assert sold_out[0] == "மன்னிக்கவும், ராகி பிஸ்கட் இப்போது தீர்ந்துவிட்டது."
    assert template_replies(SHOP, "Ada teh masala?", "ms")[0].startswith(
        "Ya, teh masala ada hari ini: ₹20"
    )
    assert template_replies(SHOP, "आप कैसे पेमेंट लेते हैं?", "hi")[0] == ("आप नक़द, UPI से भुगतान कर सकते हैं।")


async def test_demo_and_offline_never_call_the_model() -> None:
    answers = SimpleNamespace(
        settings=SimpleNamespace(coach_mode="gemini"),
        ready=AsyncMock(side_effect=AssertionError("Demo called the model")),
    )
    result = await suggest(answers, SHOP, "Is Masala chai available?", demo=True)
    assert result.mode == "template" and len(result.replies) == 3
    answers.settings.coach_mode = "offline"
    result = await suggest(answers, SHOP, "Is Masala chai available?", demo=False)
    assert result.mode == "template"
    answers.ready.assert_not_awaited()


async def test_model_drafts_are_filtered_and_fall_back_to_templates(monkeypatch) -> None:
    answers = SimpleNamespace(settings=SimpleNamespace(coach_mode="gemini"))

    async def drafted(*_: object, **__: object) -> list[str]:
        return ["Yes, Masala chai is ₹20 a cup.", "Come by, we're open 06:30–21:00!"]

    monkeypatch.setattr(reply_suggestions, "model_replies", drafted)
    result = await suggest(answers, SHOP, "Masala chai?", demo=False)
    assert result.mode == "gemini" and result.replies[0].startswith("Yes, Masala chai is ₹20")

    async def unavailable(*_: object, **__: object) -> list[str]:
        return []

    monkeypatch.setattr(reply_suggestions, "model_replies", unavailable)
    result = await suggest(answers, SHOP, "Masala chai?", demo=False)
    assert result.mode == "template" and len(result.replies) == 3


async def test_one_ungrounded_model_draft_means_templates(monkeypatch) -> None:
    """A model answer with any draft that fails the check is not shown at all."""
    from app import text_model

    answers = SimpleNamespace(
        settings=SimpleNamespace(coach_mode="gemini"),
        ready=AsyncMock(return_value=object()),
        active=asyncio.Semaphore(1),
    )

    async def generate(*_: object, **__: object) -> object:
        return object()

    monkeypatch.setattr(text_model, "generate", generate)
    monkeypatch.setattr(
        "app.gemini_schema.parse_reply",
        lambda *_: reply_suggestions.Drafts(
            replies=[
                "Yes, Masala chai is ₹20 a cup.",
                "Come by, we're open 06:30–21:00!",
                "We also have Pizza today!",
            ]
        ),
    )
    result = await suggest(answers, SHOP, "Masala chai?", demo=False)
    assert result.mode == "template"
    assert result.replies[0].startswith("Yes, Masala chai is available today")


def test_owner_route_drafts_for_a_waiting_customer_only(app, monkeypatch) -> None:
    from google import genai

    monkeypatch.setattr(genai, "Client", lambda **_: pytest.fail("Offline drafts called Gemini"))
    with TestClient(app) as owner_client:
        customer = TestClient(app)
        customer.post("/api/v1/customer/session", json={"name": "Asha"})
        bid = owned_shop(owner_client)
        receipt = customer.post(
            f"/api/v1/public/shops/{bid}/inquiries",
            json={"contact": "customer@example.test", "message": "क्या दुकान अभी खुली है?"},
        ).json()
        path = f"/api/v1/businesses/{bid}/inquiries/{receipt['id']}"
        assert customer.get(path + "/replies").status_code == 401
        drafts = owner_client.get(path + "/replies").json()
        assert drafts["language"] == "hi" and drafts["mode"] == "template"
        assert 2 <= len(drafts["replies"]) <= 3
        assert all(re.search(r"[ऀ-ॿ]", r) for r in drafts["replies"])
        # Nothing is sent by asking for drafts.
        thread = owner_client.get(f"/api/v1/businesses/{bid}/inquiries").json()[0]
        assert [m["author"] for m in thread["messages"]] == ["customer"]
        # Over the suggestion limit the owner still gets the fixed drafts, never an error.
        from fastapi import HTTPException

        from app import customer_routes

        async def limited(*_: object, **__: object) -> None:
            raise HTTPException(429, "RATE_LIMITED")

        enforce = customer_routes.enforce_limits
        monkeypatch.setattr(customer_routes, "enforce_limits", limited)
        busy = owner_client.get(path + "/replies")
        assert busy.status_code == 200 and busy.json()["replies"] == drafts["replies"]
        monkeypatch.setattr(customer_routes, "enforce_limits", enforce)
        owner_client.post(path + "/messages", json={"text": "जी हाँ!"})
        assert owner_client.get(path + "/replies").json()["replies"] == []
