"""Smart, dynamic onboarding (owner, 17 Oct 04:45: "if it is not smart there is no point").

The coach understands the business before asking about it: a self-cleaning helmet station is a
service and is never asked about halal. Only the universal core is asked (name, what you offer,
where, hours, photo); at most two extra questions, only when the profile is confident; never
menu, price, payment, delivery, halal or vegetarian. The owner's correction of the kind wins
silently. "bas" / "that's all" ends the conversation (end_conversation), whatever is missing.
The offline fixture follows no fixed script.
"""

import asyncio
import json
import re
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from starlette.websockets import WebSocketDisconnect

from app import business_understanding
from app.agent import (
    FACE_QUESTION,
    GOODBYE,
    NEW_SHOP_INSTRUCTION,
    NEW_SHOP_TOPICS,
    OFFLINE_HI,
    OPEN_QUESTION,
    topic_order,
    turn_instruction,
)
from app.business_understanding import (
    OFFLINE_EXTRAS,
    BusinessUnderstander,
    BusinessUnderstanding,
    ExtraQuestion,
    offline_understanding,
    safe,
    with_owner_kind,
)
from app.coordinator import MerchantContext, current, get_question_plan
from app.main import create_app
from app.merchant import BusinessFields, MerchantStore, NewShopDraft
from app.new_shop_resume import follow_up_plan, known_and_missing, merge_drafts
from app.new_shop_tools import end_conversation, update_shop
from app.settings import Settings
from tests.test_discover import settings
from tests.test_photos import join

ORIGIN = {"origin": "http://127.0.0.1:3200"}


def context(tmp_path: Path, uid: str = "alice") -> MerchantContext:
    return MerchantContext(
        MerchantStore(str(tmp_path / "shops.sqlite")),
        uid,
        None,
        [],
        new_shop=True,
        new_shop_draft=None,
    )


def run(ctx: MerchantContext, **args: Any) -> dict[str, Any]:
    async def call() -> dict[str, Any]:
        token = current.set(ctx)
        try:
            return await update_shop(**args)
        finally:
            current.reset(token)

    return asyncio.run(call())


def events_of(text: str) -> list[dict[str, Any]]:
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


@pytest.mark.parametrize(
    ("said", "kind"),
    [
        ("self-cleaning helmet station", "service"),
        ("chai aur samosa", "food"),
        ("mobile repair aur accessories", "service"),
        ("chai aur mobile recharge", "mixed"),
        ("kuch bhi bechte hain", "unknown"),
        ("phool bechte hain", "product"),
        ("दवाई की दुकान", "product"),
        ("सिलाई का काम", "service"),
        ("home bakery, cakes on order", "food"),
        ("pet grooming", "service"),
    ],
)
def test_offline_reading_understands_the_kind(said: str, kind: str) -> None:
    understood = offline_understanding(said)
    assert understood.kind == kind
    if kind != "food":
        # Food details are never relevant to a non-food business.
        assert "halal" in understood.never_ask and "vegetarian" in understood.never_ask


def test_the_policy_never_lets_a_wrong_question_through() -> None:
    """Whatever the model says: no menu/price/payment/delivery/halal/veg/core question, nothing
    below the confidence bar, nothing for an unsure profile, at most two, a real search group."""

    def ask(key: str, question: str, confidence: float = 0.95) -> ExtraQuestion:
        return ExtraQuestion(key=key, question=question, confidence=confidence)

    understood = safe(
        BusinessUnderstanding(
            kind="service",
            confidence=0.9,
            search_group="helmets",
            extra_questions=[
                ask("halal", "Is your food halal?"),
                ask("payment", "Do you take UPI?"),
                ask("delivery", "Do you deliver?"),
                ask("menu", "What is on your menu?"),
                ask("price", "What does a wash cost?"),
                ask("hours", "When do you open?"),
                ask("helmet_sizes", "Which helmet sizes fit the machine?", 0.5),
                ask("wash_time", "How long does one helmet take?"),
                ask("machines", "How many machines do you have?"),
                ask("brands", "Do you sell helmets too?"),
            ],
        )
    )
    assert [q.key for q in understood.extra_questions] == ["wash_time", "machines"]
    assert understood.search_group == ""
    assert {"halal", "payment", "delivery"} <= set(understood.never_ask)
    unsure = safe(
        BusinessUnderstanding(
            kind="service", confidence=0.5, extra_questions=[ask("wash_time", "How long?")]
        )
    )
    assert unsure.extra_questions == []
    unknown = safe(
        BusinessUnderstanding(
            kind="unknown", confidence=0.99, extra_questions=[ask("what", "What do you do?")]
        )
    )
    assert unknown.extra_questions == []


def test_the_helmet_station_is_a_service_and_is_never_asked_food_questions(
    tmp_path: Path,
) -> None:
    ctx = context(tmp_path)
    result = run(
        ctx,
        name="Clean Helmet Point",
        category="self-cleaning helmet station",
        location="MG Road metro",
    )
    assert result["went_live"] is True
    draft = ctx.new_shop_draft
    assert draft and draft.understanding and draft.understanding.kind == "service"
    assert draft.business and draft.business.profile.kind == "service"
    # The owner's words stay the category; the search group fits.
    assert draft.business.category == "self-cleaning helmet station"
    assert draft.understanding.search_group == "services"
    text = json.dumps(result, ensure_ascii=False).casefold()
    assert not any(word in text for word in ("halal", "vegetarian", "menu", "payment"))
    token = current.set(ctx)
    try:
        note = turn_instruction()
    finally:
        current.reset(token)
    assert "kind: service" in note and "NEVER ask about: halal" in note.replace(", ", ": ", 0)


def test_a_kind_correction_wins_silently_and_survives_a_later_guess(tmp_path: Path) -> None:
    """ "nahi, yeh service hai": the kind is fixed, extras of the wrong kind go, and a later
    guess (a new category) never brings the wrong kind back."""
    ctx = context(tmp_path)
    run(ctx, name="Lakshmi Corner", category="chai aur samosa")
    assert ctx.new_shop_draft and ctx.new_shop_draft.understanding
    assert ctx.new_shop_draft.understanding.kind == "food"
    result = run(ctx, kind="service")
    assert result["status"] == "saved" and "note" not in result
    understood = ctx.new_shop_draft.understanding
    assert understood and understood.kind == "service" and understood.owner_kind
    run(ctx, category="chai aur samosa, aur cooking classes")
    assert ctx.new_shop_draft.understanding.kind == "service"
    # The app's older copy of the draft never undoes the owner's word either.
    older = NewShopDraft(understanding=BusinessUnderstanding(kind="food", confidence=0.9))
    merged = merge_drafts(ctx.new_shop_draft, older)
    assert merged and merged.understanding and merged.understanding.kind == "service"
    # An unknown kind word changes nothing.
    assert with_owner_kind(understood, "spaceship") == understood


def test_extra_questions_are_asked_once_after_the_core_and_saved_as_facts(tmp_path: Path) -> None:
    ctx = context(tmp_path)
    first = run(ctx, name="Raju Tailors", category="silai ka kaam")
    # Before the shop is live, only the core is missing.
    assert not any("optional" in item for item in first["still_missing"])
    result = run(ctx, location="Lajpat Nagar")
    extra = [item for item in result["still_missing"] if item.startswith("optional")]
    assert len(extra) == 1 and "stitching_for" in extra[0]
    saved = run(ctx, extra_answers=[{"key": "stitching_for", "answer": "ladies and gents"}])
    assert not any(item.startswith("optional") for item in saved["still_missing"])
    assert any('"ladies and gents"' in item for item in saved["known_never_ask_again"])
    bid = ctx.new_shop_draft.live_id if ctx.new_shop_draft else None
    assert bid
    facts = ctx.store.context("alice", bid)["business"]["fields"]["custom_facts"]
    assert facts == [
        {"key": "stitching_for", "label": "Stitching for", "value": "ladies and gents"}
    ]
    # A replayed answer changes nothing; an unknown key is ignored.
    again = run(ctx, extra_answers=[{"key": "stitching_for", "answer": "only ladies"}])
    assert again["note"] == "Nothing new to record."
    run(ctx, extra_answers=[{"key": "halal", "answer": "yes"}])
    facts = ctx.store.context("alice", bid)["business"]["fields"]["custom_facts"]
    assert [fact["value"] for fact in facts] == ["ladies and gents"]


def test_an_extra_the_owner_does_not_know_is_never_asked_again(tmp_path: Path) -> None:
    ctx = context(tmp_path)
    run(ctx, name="Raju Tailors", category="silai ka kaam", location="Lajpat Nagar")
    result = run(ctx, extra_answers=[{"key": "stitching_for", "answer": ""}])
    assert not any(item.startswith("optional") for item in result["still_missing"])
    assert any("did not know" in item for item in result["known_never_ask_again"])


def test_onboarding_never_uses_the_type_question_plan(tmp_path: Path) -> None:
    ctx = context(tmp_path)
    run(ctx, name="Spice Kitchen", category="non-veg biryani")
    token = current.set(ctx)
    try:
        plan = asyncio.run(get_question_plan())
    finally:
        current.reset(token)
    assert plan["status"] == "not_in_onboarding"
    assert "halal" not in json.dumps(plan)


class FakeModels:
    def __init__(self, reply: str, delay: float = 0) -> None:
        self.reply = reply
        self.delay = delay
        self.calls = 0

    async def generate_content(self, **_: Any) -> Any:
        self.calls += 1
        await asyncio.sleep(self.delay)
        return SimpleNamespace(parsed=None, text=self.reply)


def gemini_reader(reply: dict[str, Any], delay: float = 0) -> tuple[BusinessUnderstander, Any]:
    reader = BusinessUnderstander(
        Settings(  # type: ignore[call-arg]
            _env_file=None,
            coach_mode="gemini",
            google_text_model="gemini-test",
            google_live_model="gemini-test-live",
            google_cloud_project="test",
        )
    )
    models = FakeModels(json.dumps(reply), delay)
    reader._client = SimpleNamespace(aio=SimpleNamespace(models=models, aclose=None))
    return reader, models


def test_the_gemini_profile_is_filtered_trimmed_and_cached() -> None:
    reader, models = gemini_reader(
        {
            "kind": "service",
            "what": "self-cleaning helmet station",
            "offerings": [f"thing {n}" for n in range(12)],
            "extra_questions": [
                {"key": "halal", "question": "Is it halal?", "confidence": 0.99},
                {"key": "wash_time", "question": "How long does a wash take?", "confidence": 0.9},
            ],
            "never_ask": ["halal"],
            "search_group": "services",
            "confidence": 0.95,
            "owner_kind": True,
        }
    )

    async def twice() -> tuple[BusinessUnderstanding, BusinessUnderstanding]:
        return (
            await reader.understand("self-cleaning helmet station"),
            await reader.understand("Self-cleaning  helmet station"),
        )

    first, second = asyncio.run(twice())
    assert first == second and models.calls == 1
    assert first.kind == "service" and len(first.offerings) == 8
    assert [q.key for q in first.extra_questions] == ["wash_time"]
    # The model never decides that the owner said the kind.
    assert first.owner_kind is False


def test_a_slow_profile_never_holds_up_the_reply(tmp_path: Path) -> None:
    reader, _ = gemini_reader({"kind": "food", "confidence": 0.9}, delay=5)
    previous = business_understanding.understander
    business_understanding.understander = reader
    try:
        ctx = context(tmp_path)

        async def flow() -> tuple[dict[str, Any], float]:
            loop = asyncio.get_running_loop()
            started = loop.time()
            token = current.set(ctx)
            try:
                result = await update_shop(name="Lakshmi", category="chai")
            finally:
                current.reset(token)
            return result, loop.time() - started

        result, seconds = asyncio.run(flow())
        assert result["status"] == "saved" and seconds < 4
        assert ctx.new_shop_draft and ctx.new_shop_draft.business
        assert ctx.new_shop_draft.business.category == "chai"
    finally:
        business_understanding.understander = previous


def test_a_slow_profile_is_picked_up_with_the_next_answer(tmp_path: Path) -> None:
    """Live eval (kirana, 17 Oct): the profile took longer than the first answer and every later
    answer changed a field (the place, the hours), so it never reached the draft."""
    reader, models = gemini_reader({"kind": "product", "confidence": 0.9}, delay=3)
    previous = business_understanding.understander
    business_understanding.understander = reader
    try:
        ctx = context(tmp_path)

        async def flow() -> None:
            token = current.set(ctx)
            try:
                await update_shop(name="Gupta Kirana", category="kirana, ration")
                assert ctx.new_shop_draft and ctx.new_shop_draft.understanding is None
                await asyncio.sleep(1)
                await update_shop(location="Karol Bagh")
            finally:
                current.reset(token)

        asyncio.run(flow())
        assert ctx.new_shop_draft and ctx.new_shop_draft.understanding
        assert ctx.new_shop_draft.understanding.kind == "product" and models.calls == 1
    finally:
        business_understanding.understander = previous


def test_a_profile_ready_by_bas_joins_the_draft(tmp_path: Path) -> None:
    """Live eval (tailor): the profile finished after the last answer; "bas" still saves it."""
    reader, _ = gemini_reader({"kind": "service", "confidence": 0.9}, delay=3)
    previous = business_understanding.understander
    business_understanding.understander = reader
    try:
        ctx = context(tmp_path)

        async def flow() -> None:
            token = current.set(ctx)
            try:
                await update_shop(name="Raju Tailors", category="silai, alteration")
                assert ctx.new_shop_draft and ctx.new_shop_draft.understanding is None
                await asyncio.sleep(1)
                end_conversation()
            finally:
                current.reset(token)

        asyncio.run(flow())
        assert ctx.new_shop_draft and ctx.new_shop_draft.understanding
        assert ctx.new_shop_draft.understanding.kind == "service"
    finally:
        business_understanding.understander = previous


def test_the_phone_gets_a_profile_that_arrives_during_bas(tmp_path: Path) -> None:
    """Live eval (vague store): the profile joined the draft after the turn's last draft event,
    and "bas" came next; the stream sends the draft again before the turn completes."""
    reader, _ = gemini_reader({"kind": "product", "confidence": 0.9}, delay=2.7)
    previous = business_understanding.understander
    try:
        app = create_app(settings(tmp_path), InMemorySessionService())
        with TestClient(app) as client:
            # After startup, which installs the app's own (offline) reader.
            own, business_understanding.understander = business_understanding.understander, reader
            try:
                join(client)
                first = events_of(
                    client.post(
                        "/api/v1/coach/stream",
                        json={"message": "category: sab kuch", "language": "hi", "new_shop": True},
                    ).text
                )
                sid = first[0]["session_id"]
                assert not any(
                    (e.get("data") or {}).get("understanding")
                    for e in first
                    if e["kind"] == "draft"
                )
                time.sleep(1)  # the profile finishes meanwhile
                ended = events_of(
                    client.post(
                        "/api/v1/coach/stream",
                        json={"message": "bas", "new_shop": True, "session_id": sid},
                    ).text
                )
            finally:
                business_understanding.understander = own
        drafts = [e["data"] for e in ended if e["kind"] == "draft"]
        assert drafts and drafts[-1]["understanding"]["kind"] == "product"
        assert ended[-1]["kind"] == "turn_complete"
    finally:
        business_understanding.understander = previous


def test_end_conversation_marks_the_turn_and_opens_no_question(tmp_path: Path) -> None:
    ctx = context(tmp_path)
    token = current.set(ctx)
    try:
        result = end_conversation()
    finally:
        current.reset(token)
    assert result["status"] == "ended" and ctx.ended
    assert ctx.cards[result["card_id"]] == ("action", {"target": "end_conversation"})
    assert "goodbye" in result["instruction"] and "end_conversation" in NEW_SHOP_INSTRUCTION


@pytest.mark.parametrize("word", ["bas", "ho gaya", "band karo", "that's all", "stop", "bye", "बस"])
def test_every_stop_word_ends_the_text_conversation_even_before_the_name(
    tmp_path: Path, word: str
) -> None:
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        first = client.post(
            "/api/v1/coach/stream",
            json={"message": "category: tailoring", "language": "hi", "new_shop": True},
        )
        sid = events_of(first.text)[0]["session_id"]
        ended = events_of(
            client.post(
                "/api/v1/coach/stream",
                json={"message": word, "language": "hi", "new_shop": True, "session_id": sid},
            ).text
        )
        assert {"kind": "action", "data": {"target": "end_conversation"}} in ended
        reply = next(e["text"] for e in reversed(ended) if e["kind"] == "reply")
        # A Hindi owner hears the goodbye in Hindi (#100): no question, everything saved.
        assert "?" not in reply and reply.endswith(OFFLINE_HI[GOODBYE])
        # Nothing is lost: the next visit continues from the saved draft (resume is silent).
        resumed = client.post(
            "/api/v1/coach/stream",
            json={"message": "name: Raju Tailors", "new_shop": True, "session_id": sid},
        )
        draft = [e for e in events_of(resumed.text) if e["kind"] == "draft"][-1]["data"]
        assert draft["business"]["category"] == "tailoring"
        assert draft["business"]["name"] == "Raju Tailors"


def test_bas_ends_the_voice_conversation_with_a_goodbye_and_no_error(tmp_path: Path) -> None:
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        with client.websocket_connect("/api/v1/voice?new_shop=true&lang=hi", headers=ORIGIN) as ws:
            ws.send_json({"kind": "new_shop", "draft": None})
            assert ws.receive_json()["kind"] == "ready"
            ws.send_json({"kind": "text", "text": "name: Lakshmi Tea Stall; category: chai"})
            while ws.receive_json()["kind"] != "turn_complete":
                pass
            ws.send_json({"kind": "text", "text": "bas"})
            seen: list[dict[str, Any]] = []
            with pytest.raises(WebSocketDisconnect) as closed:
                while True:
                    seen.append(ws.receive_json())
            assert closed.value.code == 1000 and closed.value.reason == "ENDED"
        assert {"kind": "action", "data": {"target": "end_conversation"}} in seen
        assert not any(event["kind"] == "error" for event in seen)
        assert any(event["kind"] == "turn_complete" for event in seen)


def test_the_fixture_follows_no_fixed_script() -> None:
    """Different owners get the missing basics in different orders; each order still has every
    basic exactly once."""
    orders = {tuple(topic_order(SimpleNamespace(uid=f"owner-{n}"))) for n in range(40)}
    assert len(orders) > 3
    assert all(sorted(order) == ["location", "name", "sell"] for order in orders)
    assert len({order[0] for order in orders}) == 3


def test_an_extra_the_owner_already_answered_is_never_asked() -> None:
    """Live eval (mehendi): "ghar par bhi aati hoon", then "do you come to customers' homes?"."""
    understood = safe(
        BusinessUnderstanding(
            kind="service",
            what="शादी और त्योहार के लिए मेहंदी लगाती हूँ, घर पर भी आती हूँ",
            confidence=0.95,
            extra_questions=[
                ExtraQuestion(
                    key="home_visits",
                    question="Do you also go to customers' homes or venues?",
                    confidence=0.9,
                ),
                ExtraQuestion(key="bridal", question="Do you do bridal designs?", confidence=0.9),
            ],
        )
    )
    assert [q.key for q in understood.extra_questions] == ["bridal"]
    # Someone who did not say it is still asked.
    shop = safe(
        BusinessUnderstanding(
            kind="service",
            what="mehendi artist",
            confidence=0.95,
            extra_questions=[
                ExtraQuestion(key="home_visits", question="Do you visit homes?", confidence=0.9)
            ],
        )
    )
    assert [q.key for q in shop.extra_questions] == ["home_visits"]


def test_voice_never_waits_for_the_profile(tmp_path: Path) -> None:
    """Live check: saving the kind held the spoken reply for up to 2.5 s (first audio ~4 s)."""
    reader, _ = gemini_reader({"kind": "food", "confidence": 0.9}, delay=3)
    previous = business_understanding.understander
    business_understanding.understander = reader
    try:
        ctx = context(tmp_path)
        ctx.spoken = True

        async def flow() -> float:
            loop = asyncio.get_running_loop()
            started = loop.time()
            token = current.set(ctx)
            try:
                result = await update_shop(name="Lakshmi Tea Stall", category="chai, samosa")
            finally:
                current.reset(token)
            assert result["status"] == "saved"
            return loop.time() - started

        assert asyncio.run(flow()) < 0.5
    finally:
        business_understanding.understander = previous


# --- #112 evals: open question, then smart follow-ups ------------------------------------------

# The trade's own follow-up for each business (business_understanding.OFFLINE_EXTRAS).
TRADE_QUESTIONS = {key: question for _, _, key, _, question, _ in OFFLINE_EXTRAS}
# Never asked of any business in onboarding; food words never of a business that is not food.
NEVER_ANY = re.compile(r"menu|price|pay|upi|deliver|halal|मेन्यू|दाम|कीमत|भुगतान|डिलीवरी|हलाल", re.I)
FOOD_ONLY = re.compile(r"veg|food|eat|cake|tea|chai|seat|\bsit\b|खाना|शाकाहार|केक|चाय|बैठ", re.I)


def asked_about(reply: str) -> str | None:
    """Which question the fixture coach asked in this reply, in English or Hindi."""

    def says(english: str) -> bool:
        return english in reply or OFFLINE_HI.get(english, english) in reply

    if says(FACE_QUESTION):
        return "face"
    if says(OPEN_QUESTION):
        return "open"
    extra = next((key for key, question in TRADE_QUESTIONS.items() if says(question)), None)
    if extra:
        return f"extra:{extra}"
    return next((key for key, question, _ in NEW_SHOP_TOPICS if says(question)), None)


def conversation(tmp_path: Path, language: str, answer: str) -> list[tuple[str, str]]:
    """Greeting, the owner's one answer to the open question, then "pata nahi" to everything
    until the face check. Every (topic, reply) the coach said, in order."""
    app = create_app(settings(tmp_path), InMemorySessionService())
    said: list[tuple[str, str]] = []
    sid: str | None = None
    draft: dict[str, Any] | None = None
    with TestClient(app) as client:
        join(client)
        for message in ["Hello! I want to open a new shop.", answer, *["pata nahi"] * 6]:
            events = events_of(
                client.post(
                    "/api/v1/coach/stream",
                    json={
                        "message": message,
                        "language": language,
                        "new_shop": True,
                        "session_id": sid,
                        "new_shop_draft": draft,
                    },
                ).text
            )
            sid = events[0]["session_id"]
            for event in events:
                if event["kind"] == "draft":
                    draft = event["data"]
            reply = next(e["text"] for e in reversed(events) if e["kind"] == "reply")
            topic = asked_about(reply)
            assert topic, f"a question outside the plan: {reply}"
            said.append((topic, reply))
            if topic == "face":
                break
    return said


EVALS = [
    # (business, language, its name, what it offers, where, its trade question, food)
    ("tea shop", "en", "Lakshmi Tea Stall", "tea and biscuits", "Indiranagar", "seating", True),
    ("tea shop", "hi", "लक्ष्मी टी स्टॉल", "चाय की दुकान", "इंदिरानगर मेट्रो", "seating", True),
    (
        "hardware store",
        "en",
        "Sharma Hardware",
        "hardware, paint and pipes",
        "Karol Bagh",
        "brands_stocked",
        False,
    ),
    (
        "hardware store",
        "hi",
        "शर्मा हार्डवेयर",
        "हार्डवेयर और पेंट की दुकान",
        "करोल बाग",
        "brands_stocked",
        False,
    ),
    (
        "tailor",
        "en",
        "Raju Tailors",
        "tailoring and alterations",
        "Lajpat Nagar",
        "stitching_for",
        False,
    ),
    ("tailor", "hi", "राजू टेलर्स", "सिलाई का काम", "लाजपत नगर", "stitching_for", False),
    ("mobile repair", "en", "Fix Point", "mobile repair", "Nehru Place", "brands_repaired", False),
    ("mobile repair", "hi", "फिक्स पॉइंट", "मोबाइल रिपेयर", "नेहरू प्लेस", "brands_repaired", False),
    (
        "home bakery",
        "en",
        "Meera Bakes",
        "home bakery, cakes on order",
        "Koramangala",
        "order_ahead",
        True,
    ),
    ("home bakery", "hi", "मीरा केक्स", "घर से केक बनाती हूँ", "कोरमंगला", "order_ahead", True),
]


@pytest.mark.parametrize(
    ("business", "language", "name", "offers", "place", "trade", "food"),
    EVALS,
    ids=[f"{business}-{language}" for business, language, *_ in EVALS],
)
def test_eval_open_question_then_at_most_two_smart_follow_ups(
    tmp_path: Path,
    business: str,
    language: str,
    name: str,
    offers: str,
    place: str,
    trade: str,
    food: bool,
) -> None:
    """The coach opens with "tell me about your shop", takes name, kind and place from the one
    answer (never asks them again), then asks at most two follow-ups, the first the trade's own
    question, the other only the hours; the photo and the face check close it. A Hindi owner
    hears all of it in Hindi."""
    answer = f"name: {name}; category: {offers}; location: {place}"
    said = conversation(tmp_path, language, answer)
    topics = [topic for topic, _ in said]
    assert topics[0] == "open"
    assert not {"name", "sell", "location"} & set(topics), topics
    follow_ups = [t for t in topics if t.startswith("extra:") or t == "hours"]
    assert follow_ups == [f"extra:{trade}", "hours"], topics
    assert topics[-2:] == ["photo", "face"], topics
    assert len(topics) == len(set(topics)), f"asked twice: {topics}"
    for _, reply in said:
        question = reply.removeprefix("Offline template: ").removeprefix("ऑफ़लाइन नमूना: ")
        assert not NEVER_ANY.search(question), question
        if not food:
            assert not FOOD_ONLY.search(question), f"{business} asked a food question: {question}"
        if language == "hi":
            assert not re.search(r"[A-Za-z]{3,}", question), question


@pytest.mark.parametrize(
    ("language", "answer"),
    [
        ("en", "name: Fix Point; category: mobile repair, Samsung and Vivo; location: Nehru Place"),
        ("hi", "name: लक्ष्मी टी स्टॉल; category: चाय, बैठने के लिए बेंच हैं; location: इंदिरानगर"),
    ],
)
def test_eval_what_the_owner_already_said_is_never_asked(
    tmp_path: Path, language: str, answer: str
) -> None:
    """The open answer already says the brands (the seating) and the hours: no follow-up at all,
    straight to the photo."""
    said = conversation(tmp_path, language, f"{answer}; hours: 7 am to 9 pm")
    assert [topic for topic, _ in said] == ["open", "photo", "face"]


def test_never_more_than_two_follow_ups_even_when_the_profile_comes_late() -> None:
    """A voice profile can arrive after the hours were asked: the hours keep their place, so
    only one of the business's own questions is left (never three in all)."""

    def ask(key: str) -> ExtraQuestion:
        return ExtraQuestion(key=key, question=f"About {key}?", confidence=0.9)

    profile = BusinessUnderstanding(
        kind="food", confidence=0.9, extra_questions=[ask("seating"), ask("chai_kinds")]
    )
    fields = BusinessFields(name="Lakshmi", category="chai", location="Indiranagar")
    extras, hours = follow_up_plan(NewShopDraft(business=fields, understanding=profile))
    assert [q.key for q in extras] == ["seating", "chai_kinds"] and hours is False
    timed = fields.model_copy(update={"hours": "6 am to 10 pm"})
    late = NewShopDraft(business=timed, understanding=profile)
    extras, hours = follow_up_plan(late)
    assert [q.key for q in extras] == ["seating"] and hours is False
    _, missing = known_and_missing(late)
    assert [item for item in missing if "follow-up" in item] == [missing[0]]
    one = profile.model_copy(update={"extra_questions": [ask("seating")]})
    extras, hours = follow_up_plan(NewShopDraft(business=fields, understanding=one))
    assert [q.key for q in extras] == ["seating"] and hours is True


def test_the_coach_opens_with_the_open_question_in_the_owner_language() -> None:
    assert "Tell me about your shop" in NEW_SHOP_INSTRUCTION
    assert "or with the name" in NEW_SHOP_INSTRUCTION
    assert "at most TWO follow-ups" in NEW_SHOP_INSTRUCTION
    assert OFFLINE_HI[OPEN_QUESTION] == "क्या आप अपनी दुकान के बारे में बताएँगे?"
