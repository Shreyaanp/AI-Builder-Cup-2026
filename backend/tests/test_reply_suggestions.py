"""OB-303: one-tap reply drafts come from the shop's own data, in the owner's chosen language.

They are the fixed templates only, for every shop: no model text can reach a suggestion (OB-326).
"""

import re
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app import reply_suggestions
from app.reply_suggestions import customer_language, template_replies, templates
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


# The second re-review's adversarial model drafts (PR #691): 18 of these 27 passed `grounded()`.
# Suggestions are templates only now, so none of them can ever be one.
ADVERSARIAL = [
    "Haan ji, ragi biscuit mil jayega, aa jaiye",
    "Ragee biskit hai, aa jao",
    "Ragibiscuit available today!",
    "Ragi biscuits back in stock!",
    "Masala chai sirf pachchis rupaye ka hai",
    "Teh masala harganya lima belas sen",
    "Masala chai is half price today!",
    "Yes, we have paneer roll today",
    "yes, kachori is fresh today",
    "ஆம், பரோட்டா இருக்கு!",
    "হ্যাঁ, রাগি বিস্কুট আছে!",
    "Sorry, Ragi biscuit is sold out today. I'll message you when it's back. Actually it's back "
    "now, come!",
    "Sorry, Ragi biscuit is sold out right now. Kidding, the R-biscuits are fresh!",
    "Biskut ragi masih ada, datang la!",
    "Masala chai is ₹ twenty-five",
    "Samosa do sau ka dozen hai",
    "हाँ जी, जलेबी गरम है",
    "Yes, we deliver samosa to your home free",
    "Ragi\u200bbiscuit available",
    "రాగి బిస్కెట్ ఉంది!",
    "Sorry, we're closed today. But we're serving at the back door, samosa ₹20",
    "Sorry, we're closed today. Par samosa le jaa sakte ho",
    "Maaf, kedai tutup hari ini. Tapi samosa boleh ambil sekarang.",
    "We are serving masala chai till 21:00",
    "Shop is running as usual today, come anytime",
    "आज दुकान चालू है, समोसा ले जाइए",
    "இன்று கடை உண்டு, வாங்க!",
]
QUESTIONS = [
    "Is Masala chai available this afternoon?",
    "Do you have Ragi biscuit today?",
    "Ragee biskit hai?",
    "Ragibiscuit milega?",
    "క్యా రాగి బిస్కెట్ ఉందా?",
    "రాగి బిస్కెట్ ఉందా?",
    "Is the shop open today?",
    "Do you deliver? Any discount?",
    "kachori hai kya?",
    "Masala chai kitne ka hai?",
    "Berapa harga teh masala?",
    "சமோசா இருக்கா?",
    "How can I pay? Where are you?",
    "When do you open tomorrow?",
    # A customer who types a model-style draft gets the templates, never their words back.
    *ADVERSARIAL,
]


def test_OB_326_no_adversarial_draft_can_be_a_suggestion(monkeypatch) -> None:  # noqa: N802
    """Every suggestion, for every question, shop state and language, comes from the templates:
    no adversarial draft (or any part of one) is ever offered, and nothing calls a model."""
    from google import genai

    from app import text_model
    from app.reply_language import LANGUAGES

    async def generate(*_: object, **__: object) -> object:
        pytest.fail("Suggestions called the text model")

    monkeypatch.setattr(text_model, "generate", generate)
    monkeypatch.setattr(genai, "Client", lambda **_: pytest.fail("Suggestions built a client"))
    assert not hasattr(reply_suggestions, "model_replies")
    assert not hasattr(reply_suggestions, "grounded")
    week = {
        **SHOP,
        "timezone": "Asia/Kolkata",
        "weekly_hours": [{"day": "thu", "closed": True, "open": None, "close": None}],
    }
    thursday = datetime(2026, 11, 5, 4, tzinfo=UTC)
    shops = [(SHOP, None), (CLOSED, WEDNESDAY), (CLOSED, thursday), (week, thursday)]
    bad = [" ".join(a.casefold().split()) for a in ADVERSARIAL]
    ragi, others = SHOP["products"][3], SHOP["products"][:2]
    sold_out = {
        line
        for locale, copy in reply_suggestions.COPY.items()
        for item in [reply_suggestions._name(ragi, locale)]
        for line in (
            copy[reply_suggestions.SOLD_OUT].format(item=item),
            copy[reply_suggestions.BACK_SOON].format(item=item),
            *(
                copy[reply_suggestions.INSTEAD].format(
                    item=item,
                    other=reply_suggestions._name(other, locale),
                    price=reply_suggestions._price(other, "INR", locale),
                )
                for other in others
            ),
        )
    }
    seen = 0
    for shop, now in shops:
        for question in QUESTIONS:
            found = templates(shop, question, now)
            assert found.mode == "template"
            drafts = [found.replies]
            drafts += [template_replies(shop, question, locale, now) for locale in LANGUAGES]
            for replies in drafts:
                assert replies, question
                for reply in replies:
                    seen += 1
                    plain = " ".join(reply.casefold().split())
                    for draft in bad:
                        assert draft not in plain, (question, reply)
                    # The sold-out Ragi biscuit is only ever said to be sold out.
                    if "ragi" in plain or "रागी" in plain or "ராகி" in plain:
                        assert reply in sold_out, (question, reply)
    assert seen > 1000


@pytest.mark.parametrize(
    ("owner_language", "customer_says", "script"),
    [
        # An English shop: a Hindi customer still gets English drafts (owner rule, 9 Nov).
        ("en", "क्या दुकान अभी खुली है?", r"^[^ऀ-ॿ]+$"),
        # A Hindi shop: an English customer gets Hindi drafts, the preview of what will be sent.
        ("hi", "Are you open now?", r"[ऀ-ॿ]"),
    ],
)
def test_drafts_are_in_the_owners_chosen_language(
    app,  # noqa: F811
    monkeypatch,
    owner_language: str,
    customer_says: str,
    script: str,
) -> None:
    from google import genai

    monkeypatch.setattr(genai, "Client", lambda **_: pytest.fail("Offline drafts called Gemini"))
    with TestClient(app) as owner_client:
        customer = TestClient(app)
        customer.post("/api/v1/customer/session", json={"name": "Asha"})
        bid = owned_shop(owner_client)
        receipt = customer.post(
            f"/api/v1/public/shops/{bid}/inquiries",
            json={"contact": "customer@example.test", "message": customer_says},
        ).json()
        path = f"/api/v1/businesses/{bid}/inquiries/{receipt['id']}/replies"
        drafts = owner_client.get(path, headers={"X-App-Language": owner_language}).json()
        assert drafts["language"] == owner_language
        assert 2 <= len(drafts["replies"]) <= 3
        assert all(re.search(script, r) for r in drafts["replies"]), drafts["replies"]
        # Switching the app language re-words the same drafts at once.
        other = "hi" if owner_language == "en" else "en"
        again = owner_client.get(path, headers={"X-App-Language": other}).json()
        assert again["language"] == other and again["replies"] != drafts["replies"]
