"""OB-303: one-tap reply drafts are grounded in the shop's own data, in the customer's language."""

import re
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

    async def drafted(*_: object) -> list[str]:
        return ["Yes, Masala chai is ₹20 a cup.", "Come by, we're open 06:30–21:00!"]

    monkeypatch.setattr(reply_suggestions, "model_replies", drafted)
    result = await suggest(answers, SHOP, "Masala chai?", demo=False)
    assert result.mode == "gemini" and result.replies[0].startswith("Yes, Masala chai is ₹20")

    async def unavailable(*_: object) -> list[str]:
        return []

    monkeypatch.setattr(reply_suggestions, "model_replies", unavailable)
    result = await suggest(answers, SHOP, "Masala chai?", demo=False)
    assert result.mode == "template" and len(result.replies) == 3


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
        owner_client.post(path + "/messages", json={"text": "जी हाँ!"})
        assert owner_client.get(path + "/replies").json()["replies"] == []
