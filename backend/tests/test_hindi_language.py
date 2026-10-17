"""Hindi stays Hindi in every model prompt, not only the voice: the text coach, shop translations,
Ask, pick explanations, the weekly recap, the playbook, area answers and the customer chat all
name the language in full (Hindi, hi-IN, Devanagari; not Urdu, Bhojpuri or Hinglish). A bare
"hi" tag let a model drift. Offline fixtures (playbook, area samples) read in Hindi too.
Mocked clients only; no model is called."""

import asyncio
import json
from datetime import UTC, date, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.agent import turn_instruction, ui_language
from app.customer import Answer, CustomerAnswers, Question
from app.maps_grounding import demo_answer, grounding_request
from app.merchant import BusinessFields
from app.playbook import FIXTURES, FOCUS_FEATURES, FOCUS_GOAL, PlaybookWriter, gather_inputs
from app.playbook_hi import HINDI
from app.recap import RecapWriter, Summary
from app.reply_language import language_rule, reply_language, written_language
from app.search_engine import Because, Explainer
from app.settings import Settings
from app.shop_language import ShopTranslator
from tests.test_discover import settings as discover_settings

LATIN = "abcdefghijklmnopqrstuvwxyz"


def hindi_pinned(text: str) -> None:
    assert "Hindi (hi-IN)" in text and "Devanagari" in text
    assert "not Urdu, Bhojpuri" in text and "Hinglish" in text


def fake(generate: Any) -> Any:
    return SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))


def gemini_settings() -> Settings:
    settings = Settings(
        app_env="test", coach_mode="offline", google_text_model="text-fixture", _env_file=None
    )
    settings.coach_mode = "gemini"  # a substituted client only
    return settings


def test_written_language_names_hindi_its_script_and_what_it_is_not() -> None:
    for tag in ("hi", "hi-IN", "HI-in", "Hindi"):
        hindi_pinned(written_language(tag))
    marathi = written_language("mr")
    assert "Marathi (mr-IN)" in marathi and "Devanagari" in marathi and "not Hindi" in marathi
    assert written_language("ta").startswith("Tamil (ta-IN), in Tamil script; standard Tamil")
    assert written_language("en") == "English (en-US)"
    assert written_language("bho") == "English (en-US)"  # never a reply language


def test_the_text_coach_turn_pins_hindi_in_devanagari() -> None:
    rule = language_rule(reply_language("hi"))
    assert "Always speak and write in Hindi (hi-IN). Write it in Devanagari script." in rule
    token = ui_language.set("hi")
    try:
        assert rule in turn_instruction()
    finally:
        ui_language.reset(token)


def test_shop_translations_ask_for_hindi_in_full(tmp_path: Path) -> None:
    generate = AsyncMock(return_value=SimpleNamespace(parsed=None, text='{"texts": ["बेकरी"]}'))
    translator = ShopTranslator(discover_settings(tmp_path))
    translator._client = fake(generate)
    assert asyncio.run(translator._ask_model("hi", ["Bakery"])) == ["बेकरी"]
    sent = json.loads(generate.await_args.kwargs["contents"])
    hindi_pinned(sent["language"])
    assert sent["texts"] == ["Bakery"]


def test_pick_explanations_are_written_in_hindi() -> None:
    calls: list[str] = []

    class Models:
        async def generate_content(self, model: str, contents: str, config: Any) -> Any:
            calls.append(contents)
            return SimpleNamespace(text=json.dumps(["क्योंकि आपको फ़िल्टर कॉफ़ी पसंद है"]))

    explainer = Explainer(lambda: SimpleNamespace(aio=SimpleNamespace(models=Models())), "m")
    because = Because(kind="like_stamped", shop="Sharma's", item="Filter coffee")
    lines = asyncio.run(explainer.explain([("s1", "Shop", because)], "hi"))
    assert lines == {"s1": "क्योंकि आपको फ़िल्टर कॉफ़ी पसंद है"}
    hindi_pinned(calls[0])
    assert "said in that language" in calls[0]


@pytest.mark.asyncio
async def test_weekly_recap_is_written_in_hindi() -> None:
    writer = RecapWriter(gemini_settings())
    generate = AsyncMock(return_value=SimpleNamespace(parsed=Summary(text="बिक्री बढ़ी।")))
    writer._client = fake(generate)
    text, mode = await writer.write({"sales_days": 1}, "hi")
    assert (text, mode) == ("बिक्री बढ़ी।", "gemini")
    hindi_pinned(generate.await_args.kwargs["config"].system_instruction)


@pytest.mark.asyncio
async def test_customer_chat_and_translation_fall_back_to_hindi() -> None:
    service = CustomerAnswers(gemini_settings())
    generate = AsyncMock(return_value=SimpleNamespace(parsed=Answer(answer="₹18 की है।")))
    service.client = fake(generate)
    shop = {"name": "Chai", "category": "Cafe", "location": "", "hours": "", "phone": ""}
    shop["products"] = []
    answer = await service.answer(shop, Question(question="Kopi kitne ki hai?", language="hi"))
    assert answer.answer == "₹18 की है।"
    instruction = generate.await_args.kwargs["config"].system_instruction
    assert "language and script of the customer's question" in instruction
    hindi_pinned(instruction)
    generate.return_value = SimpleNamespace(text="नमस्ते")
    assert (await service.translate("Hello", "hi")).text == "नमस्ते"
    hindi_pinned(json.loads(generate.await_args.kwargs["contents"])["language"])


def test_area_answers_are_asked_for_and_sampled_in_hindi(tmp_path: Path) -> None:
    plain = Settings(app_env="test", google_text_model="text-model", _env_file=None)
    request = grounding_request(plain, "पास में पार्किंग?", 12.97, 77.64, "hi")
    hindi_pinned(request["contents"])
    assert request["config"].tool_config.retrieval_config.language_code == "hi"
    sample = demo_answer("पास में पार्किंग?", 12.97, 77.64, "hi")
    assert sample.demo and sample.text.startswith("नमूना जवाब")
    assert all(place.name.startswith("नमूना") for place in sample.places)
    assert all(source.title.startswith("नमूना") for source in sample.sources)
    assert demo_answer("parking?", 1.28, 103.83).text.startswith("Sample answer")


def playbook_inputs(language: str, **fields: Any) -> dict[str, Any]:
    business = {
        "fields": BusinessFields(
            name="Courtyard Chai",
            category="Cafe",
            location="Indiranagar, Bengaluru",
            profile={"kind": "food", "subtype": "Tea stall", "food": {"segment": "beverage"}},
            **fields,
        ).model_dump(),
        "coach_notes": [],
    }
    inventory = [{"name": "Kopi", "price": 1800, "unit": "cup"}]
    inputs = gather_inputs(business, inventory, [], [], date(2026, 10, 16))
    inputs["language"] = language
    return inputs


def test_every_offline_playbook_line_has_hindi() -> None:
    english = {
        text
        for fixture in FIXTURES.values()
        for key in ("metrics", "watch", "features")
        for _, text in fixture[key]
    }
    english |= {t for fixture in FIXTURES.values() for t in fixture["segments"]}
    english |= {t for fixture in FIXTURES.values() for t in fixture["priorities"]}
    english |= set(FOCUS_GOAL.values()) | {text for _, text in FOCUS_FEATURES.values()}
    assert english <= set(HINDI), sorted(english - set(HINDI))
    for line in HINDI.values():
        assert any("ऀ" <= ch <= "ॿ" for ch in line), line
        assert not any(ch in LATIN for ch in line.casefold()), line


@pytest.mark.asyncio
async def test_the_offline_playbook_reads_in_hindi_with_owner_words_kept() -> None:
    writer = PlaybookWriter(Settings(_env_file=None, coach_mode="offline"))
    now = datetime(2026, 10, 16, 9, tzinfo=UTC)
    stored = await writer.build(playbook_inputs("hi"), "hi", None, now)
    playbook = stored.playbook
    assert playbook.summary == "Indiranagar, Bengaluru में Cafe की दुकान।"
    lines = [
        *(i.text for i in playbook.priorities),
        *(i.text for i in playbook.key_metrics),
        *(i.text for i in playbook.watch_list),
        *(i.text for i in playbook.segments),
        *(i.text for i in playbook.next_features),
    ]
    assert lines
    for line in lines:
        # Only the owner's own words (the menu item "Kopi") may stay in Latin script.
        assert not any(ch in LATIN for ch in line.replace("Kopi", "").casefold()), line
    assert "सबसे ज़्यादा बिकने वाले: Kopi" in lines
    english = await writer.build(playbook_inputs("en"), "en", None, now)
    assert english.playbook.summary == "A Cafe shop in Indiranagar, Bengaluru."


@pytest.mark.asyncio
async def test_the_live_playbook_prompt_pins_hindi() -> None:
    writer = PlaybookWriter(gemini_settings())
    generate = AsyncMock(side_effect=TimeoutError)
    writer._client = fake(generate)
    draft, mode = await writer.draft(playbook_inputs("hi"))
    hindi_pinned(generate.await_args.kwargs["config"].system_instruction)
    # The model failed: the Hindi offline fixture stands in.
    assert mode == "offline" and draft.summary.endswith("की दुकान।")


def test_offline_shop_answers_understand_hindi_questions() -> None:
    from app.customer import fixture_answer

    shop = {
        "name": "Chai",
        "category": "Cafe",
        "location": "Indiranagar",
        "hours": "07:00–20:00",
        "phone": "",
        "currency": "INR",
        "products": [{"name": "Kopi", "price": 1800, "unit": "cup", "available": True}],
        "facts": {"halal": "yes", "payment_methods": ["cash", "UPI"], "delivery": "Swiggy"},
    }

    def ask(question: str) -> str:
        return fixture_answer(shop, Question(question=question, language="hi")).answer

    price = fixture_answer(shop, Question(question="Kopi कितने की है?", language="hi"))
    assert price.answer == "दाम सूची में: Kopi। पेज के अनुसार उपलब्ध।"
    assert (price.price, price.unit) == (1800, "cup")
    assert ask("डिलीवरी होती है?") == "डिलीवरी: Swiggy"
    assert ask("भुगतान कैसे करें?") == "भुगतान: नकद, UPI"
    assert ask("कब खुलता है?") == "समय: 07:00–20:00"
    assert ask("दुकान कहाँ है?") == "जगह: Indiranagar"
    assert ask("क्या यह हलाल है?").startswith("मालिक के अनुसार हलाल।")
    assert "certified" not in ask("हलाल")
    # A mixed safety question is never answered from facts.
    assert ask("क्या हलाल और एलर्जी सुरक्षित है?") == "जानकारी नहीं दी गई। दुकान से संपर्क करें।"


@pytest.mark.asyncio
async def test_photo_notes_come_back_in_hindi() -> None:
    from app.photos import PhotoPipeline

    offline = PhotoPipeline(Settings(app_env="test", coach_mode="offline", _env_file=None))
    read = await offline.extract(b"", "hi")
    assert read.uncertain == ["ऑफ़लाइन नमूना: इस फ़ोटो को किसी मॉडल ने नहीं पढ़ा।"]
    assert (await offline.extract(b"")).uncertain == ["Offline fixture: no model read this photo."]
    live = PhotoPipeline(gemini_settings())
    generate = AsyncMock(side_effect=RuntimeError("no model in tests"))
    live._genai = fake(generate)
    with pytest.raises(Exception):  # noqa: B017 - only the prompt matters here
        await live.extract(b"\xff\xd8\xff", "hi")
    hindi_pinned(generate.await_args.kwargs["contents"][1])


def test_words_keep_indic_vowel_signs() -> None:
    from app.words import words

    # Python's \w alone split "सस्ती" into "सस" and "त": Hindi keywords never matched.
    assert words("पास में सस्ती चाय") == ["पास", "में", "सस्ती", "चाय"]
    assert words("சிறந்த காபி") == ["சிறந்த", "காபி"]
    assert words("ಕಾಫಿ ಬೇಕು") == ["ಕಾಫಿ", "ಬೇಕು"]
    assert words("cheap kopi, near MRT 2") == ["cheap", "kopi", "near", "MRT"]


def test_hindi_asks_without_the_model_keep_whole_words_and_filters() -> None:
    from app.discover_ask import keyword_intent

    cheap = keyword_intent("पास में सस्ती चाय")
    assert (cheap.keywords, cheap.sort) == (["चाय"], "price")
    veg = keyword_intent("100 रुपये से कम में शाकाहारी थाली")
    assert (veg.keywords, veg.max_price, veg.vegetarian) == (["थाली"], 100.0, True)
    halal = keyword_intent("अभी खुली हलाल बिरयानी")
    assert (halal.keywords, halal.halal, halal.open_now) == (["बिरयानी"], True, True)
