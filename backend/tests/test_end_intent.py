"""Finishing onboarding is recognised by intent, in any app language (#191).

"these are all my information", "I'm done", "that's everything", "nothing more to add" and their
Hindi (Devanagari and romanised), Chinese, Malay and Tamil equivalents end the conversation on
the owner's turn, before the model is asked (no extra call, no added latency); the coach's
instruction asks the same on every turn for any other wording. Questions, "I'm done with X,
what next?", names or answers that contain "bye" or "bas", and corrections never end it.
"""

import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.models.llm_request import LlmRequest
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.agent import NEW_SHOP_INSTRUCTION, asks_to_end, end_on_request
from app.coordinator import MerchantContext, current
from app.main import create_app
from app.merchant import MerchantStore
from tests.test_business_understanding import events_of
from tests.test_discover import settings
from tests.test_photos import join

FINISHED = [
    # English
    "these are all my information",
    "These are all my informations.",
    "this is all the information",
    "that's everything",
    "That’s everything, thank you!",
    "that is all",
    "Ok, that's all. Thanks",
    "that's it",
    "nothing more to add",
    "I have nothing more to add",
    "nothing else",
    "I'm done",
    "i am finished",
    "we're done here",
    "all done",
    "I've told you everything",
    "you have everything",
    "let's stop here",
    "end the chat",
    "okay bye",
    "that's all for now, goodbye",
    "no, that's all",
    # Hindi, romanised
    "bas",
    "bas itna hi",
    "haan ji, aur kuch nahi",
    "maine sab bata diya",
    "meri saari jankari yahi hai",
    "ho gaya bas",
    "theek hai, khatam",
    "baad mein baat karte hain",
    # Hindi, Devanagari
    "बस",
    "हो गया",
    "बस इतना ही",
    "मेरी सारी जानकारी यही है",
    "और कुछ नहीं है",
    "मैंने सब बता दिया",
    "ठीक है, धन्यवाद, बस",
    "मेरा हो गया",
    # Chinese
    "就这些",
    "好的，就这些，谢谢",
    "我说完了",
    "没有别的了",
    "我的信息就这些。",
    "就這些了",
    "够了",
    # Malay
    "itu sahaja",
    "Itu je, terima kasih",
    "saya dah selesai",
    "tiada lagi",
    "sudah cukup",
    "ok, itu semua",
    # Tamil
    "அவ்வளவுதான்",
    "அவ்வளவு தான், நன்றி",
    "எல்லாம் சொல்லிட்டேன்",
    "வேறு எதுவும் இல்லை",
    "சரி போதும்",
]

NOT_FINISHED = [
    # Questions
    "that's all?",
    "is that all",
    "are we done?",
    "हो गया?",
    "就这些吗？",
    "what next?",
    # Done with one thing, not the conversation
    "I'm done with the name, what next?",
    "I'm not done yet",
    "done, the hours are 9 to 5",
    # Names and answers that only contain such a word
    "Goodbye Cafe",
    "Bye Bye Bakery near the metro",
    "byepass road, near the petrol pump",
    "Lakshmi Tea Stall, bas itna hi naam hai",
    "chai aur samosa, that's all I sell",
    "我的店叫好了茶铺",
    "cukup besar untuk lima orang",
    "அவ்வளவு பெரிய கடை இல்லை, சின்ன கடை",
    # Corrections
    "no, the name is Lakshmi Chai Point",
    "nahi, bas naam galat hai",
    "stop calling it a shop, it is a service",
    # Courtesy alone is an answer ("ok" to the photo), not a goodbye
    "ok",
    "thank you",
    "theek hai",
]


def context(tmp_path: Path) -> MerchantContext:
    return MerchantContext(
        MerchantStore(str(tmp_path / "shops.sqlite")), "alice", None, [], new_shop=True
    )


TEXT_TURN = SimpleNamespace(_invocation_context=SimpleNamespace(live_request_queue=None))


def decided(tmp_path: Path, said: str) -> str | None:
    """The function the text coach is made to call before the model is asked, if any."""
    ctx = context(tmp_path)
    ctx.message = said
    request = LlmRequest(contents=[types.Content(role="user", parts=[types.Part(text=said)])])
    token = current.set(ctx)
    try:
        response = end_on_request(TEXT_TURN, request)
    finally:
        current.reset(token)
    if not response or not response.content or not response.content.parts:
        return None
    call = response.content.parts[0].function_call
    return call.name if call else None


def test_the_table_is_large_enough() -> None:
    assert len(FINISHED) >= 40 and len(NOT_FINISHED) >= 15


@pytest.mark.parametrize("said", FINISHED)
def test_finishing_in_any_language_ends_the_conversation(tmp_path: Path, said: str) -> None:
    assert asks_to_end(said), said
    assert decided(tmp_path, said) == "end_conversation"


@pytest.mark.parametrize("said", NOT_FINISHED)
def test_questions_answers_and_corrections_never_end_it(tmp_path: Path, said: str) -> None:
    assert not asks_to_end(said), said
    assert decided(tmp_path, said) is None


def test_live_voice_is_decided_in_the_voice_loop_not_here(tmp_path: Path) -> None:
    ctx = context(tmp_path)
    ctx.message = "these are all my information"
    live = SimpleNamespace(
        _invocation_context=SimpleNamespace(live_request_queue=LiveRequestQueue())
    )
    request = LlmRequest(
        contents=[types.Content(role="user", parts=[types.Part(text=ctx.message)])]
    )
    token = current.set(ctx)
    try:
        assert end_on_request(live, request) is None
    finally:
        current.reset(token)


def test_the_coach_decides_on_every_turn_with_examples_in_every_language() -> None:
    rule = NEW_SHOP_INSTRUCTION
    assert "On EVERY owner turn" in rule and "FIRST action is the end_conversation" in rule
    for example in ("these are all my information", "और कुछ नहीं", "就这些", "itu sahaja"):
        assert example in rule
    assert "அவ்வளவுதான்" in rule and "I'm done with the name, what next?" in rule


@pytest.mark.parametrize(
    "said", ["these are all my information", "मेरी सारी जानकारी यही है", "好的，就这些，谢谢"]
)
def test_a_typed_finish_ends_the_text_conversation(tmp_path: Path, said: str) -> None:
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        first = client.post(
            "/api/v1/coach/stream",
            json={"message": "name: Raju Tailors; category: tailoring", "new_shop": True},
        )
        sid = events_of(first.text)[0]["session_id"]
        ended = events_of(
            client.post(
                "/api/v1/coach/stream",
                json={"message": said, "new_shop": True, "session_id": sid},
            ).text
        )
    assert {"kind": "action", "data": {"target": "end_conversation"}} in ended
    reply = next(e["text"] for e in reversed(ended) if e["kind"] == "reply")
    assert "?" not in reply


def test_done_with_one_thing_carries_the_conversation_on(tmp_path: Path) -> None:
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        first = client.post(
            "/api/v1/coach/stream",
            json={"message": "name: Raju Tailors", "new_shop": True},
        )
        sid = events_of(first.text)[0]["session_id"]
        events: list[dict[str, Any]] = events_of(
            client.post(
                "/api/v1/coach/stream",
                json={
                    "message": "I'm done with the name, what next?",
                    "new_shop": True,
                    "session_id": sid,
                },
            ).text
        )
    assert {"kind": "action", "data": {"target": "end_conversation"}} not in events


def test_reading_a_normal_turn_adds_no_latency() -> None:
    """The decision on an ordinary turn is a local match in microseconds: no model call."""
    turns = [
        "Lakshmi Tea Stall, chai aur samosa, Indiranagar metro ke paas, subah 6 se raat 10",
        "मेरी दुकान का नाम शर्मा चाय है, हम चाय और समोसा बेचते हैं, मेट्रो के पास",
        "我们卖奶茶和点心，在地铁站旁边，早上七点到晚上十点",
        "Kedai saya jual nasi lemak dan teh tarik dekat stesen LRT",
        "எங்கள் கடையில் டீ மற்றும் வடை, பஸ் நிலையம் அருகில்",
        "I'm done with the name, what next?",
    ]
    rounds = 2000
    start = time.perf_counter()
    for _ in range(rounds):
        for said in turns:
            asks_to_end(said)
    per_turn = (time.perf_counter() - start) / (rounds * len(turns))
    assert per_turn < 0.0005, f"{per_turn * 1e6:.1f} µs per turn"
