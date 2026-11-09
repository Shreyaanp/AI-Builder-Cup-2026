"""Live voice costs less without hurting owners (OB-181).

The open conversation pauses after 5 minutes or 45 s without the owner (a calm "tap to talk
again"), a conversation's provider session is resumed instead of resending the coach instruction
and history, the per-turn context is bounded, and every voice socket logs its duration, audio
seconds and token counts.
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from google.adk.events import Event
from google.adk.live.live_request_queue import LiveRequestQueue
from google.adk.sessions import InMemorySessionService
from google.genai import types
from structlog.testing import capture_logs

from app import voice, voice_resume
from app.agent import turn_facts
from app.auth import Principal
from app.coordinator import MerchantContext, current
from app.merchant import MerchantStore
from app.reply_language import reply_language
from app.settings import Settings
from app.streaming import APP_NAME, CoachRuntime
from app.voice import (
    CONTEXT_TRIGGER_TOKENS,
    NEW_SHOP_SESSION_CAP_SECONDS,
    VoiceStats,
    live_run_config,
    serve_voice,
)
from app.voice_resume import LiveHandles, digest
from tests.test_voice_reliability import (
    FakeLive,
    FakeRuntime,
    FakeSocket,
    chai_draft,
    new_shop_context,
    run_voice,
    turn,
)


@pytest.fixture(autouse=True)
def handles(monkeypatch: pytest.MonkeyPatch) -> LiveHandles:
    store = LiveHandles()
    monkeypatch.setattr(voice_resume, "live_handles", store)
    return store


def facts_of(context: MerchantContext) -> str:
    token = current.set(context)
    try:
        return digest(turn_facts())
    finally:
        current.reset(token)


def recording(live: FakeLive) -> list[Any]:
    configs: list[Any] = []
    original = live.run_live

    def run_live(**kwargs: Any) -> AsyncIterator[Event]:
        configs.append(kwargs["run_config"])
        return original(**kwargs)

    live.run_live = run_live  # type: ignore[method-assign]
    return configs


def resumption(handle: str) -> Event:
    return Event(
        author="business_coach",
        live_session_resumption_update=types.LiveServerSessionResumptionUpdate(
            new_handle=handle, resumable=True
        ),
    )


def shop_context(tmp_path: Path) -> MerchantContext:
    return MerchantContext(MerchantStore(str(tmp_path / "shops.sqlite")), "alice", None, [])


# --- Limits ---


def test_the_open_conversation_is_capped_at_five_minutes() -> None:
    assert NEW_SHOP_SESSION_CAP_SECONDS == 300
    assert voice.CONVERSATION_IDLE_SECONDS == 45


def test_every_live_session_has_a_bounded_context_and_asks_for_resumption() -> None:
    settings = Settings(app_env="test", _env_file=None)
    hindi = reply_language("hi")
    for new_shop in (True, False):
        config = live_run_config(settings, hindi, new_shop)
        assert config.session_resumption is not None
        assert config.session_resumption.handle is None
        compression = config.context_window_compression
        assert compression and compression.trigger_tokens == CONTEXT_TRIGGER_TOKENS
        assert compression.sliding_window and compression.sliding_window.target_tokens
        assert compression.sliding_window.target_tokens < CONTEXT_TRIGGER_TOKENS
    resumed = live_run_config(settings, hindi, False, handle="h-1")
    assert resumed.session_resumption and resumed.session_resumption.handle == "h-1"


class ClosingSocket(FakeSocket):
    def __init__(self) -> None:
        super().__init__()
        self.closed: tuple[int, str] | None = None

    async def close(self, code: int = 1000, reason: str = "") -> None:
        self.closed = (code, reason)


async def serve(
    socket: ClosingSocket, context: MerchantContext, live: FakeLive | None = None
) -> VoiceStats:
    runtime = FakeRuntime(live or FakeLive([]))
    # Only the mode is read here: the Live connection itself is faked.
    runtime.settings = Settings(app_env="test", _env_file=None).model_copy(
        update={"coach_mode": "gemini" if live else "offline"}
    )
    token = current.set(context)
    try:
        async with asyncio.timeout(10):
            return await serve_voice(
                socket,  # type: ignore[arg-type]
                runtime,  # type: ignore[arg-type]
                Principal("alice", "test"),
                "sid",
                "hi",
            )
    finally:
        current.reset(token)


async def test_a_silent_owner_pauses_the_open_conversation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The microphone streams silence all the time: with no words, typing or photo for the idle
    limit, the conversation ends calmly with VOICE_PAUSED (the app offers "talk again")."""
    monkeypatch.setattr(voice, "CONVERSATION_IDLE_SECONDS", 0.3)
    monkeypatch.setattr(voice, "IDLE_CHECK_SECONDS", 0.05)
    socket = ClosingSocket()
    for _ in range(10):  # one second of always-on microphone, all silence
        socket.frames.put_nowait({"type": "websocket.receive", "bytes": b"\x00\x00" * 1600})
    stats = await serve(socket, new_shop_context(tmp_path))
    assert stats.reason == "owner_silent"
    assert {"kind": "error", "code": "VOICE_PAUSED"} in socket.sent
    assert socket.closed == (1000, "VOICE_PAUSED")
    assert stats.fields()["audio_in_seconds"] == 1.0


async def test_the_owner_typing_keeps_the_conversation_open(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(voice, "CONVERSATION_IDLE_SECONDS", 0.4)
    monkeypatch.setattr(voice, "IDLE_CHECK_SECONDS", 0.05)
    socket = ClosingSocket()

    async def chatty(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        for index in range(4):
            await asyncio.sleep(0.2)
            socket.push({"kind": "text", "text": f"answer {index}"})
            await queue.get()
            for event in turn(f"सवाल {index}?", tools=0):
                yield event
        socket.push({"kind": "close"})
        await asyncio.Event().wait()

    stats = await serve(socket, new_shop_context(tmp_path), FakeLive([chatty]))
    assert stats.reason == "client_close" and stats.turns == 4


def test_the_coachs_words_still_playing_are_not_owner_silence() -> None:
    stats = VoiceStats()
    stats.spoke(b"\x00" * 48_000 * 10)  # ten seconds of coach audio, generated in a moment
    assert stats.silent_for() < -9
    assert stats.fields()["audio_out_seconds"] == 10.0


async def test_press_to_talk_has_no_owner_silence_pause(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(voice, "CONVERSATION_IDLE_SECONDS", 0.1)
    monkeypatch.setattr(voice, "IDLE_CHECK_SECONDS", 0.02)
    socket = ClosingSocket()

    async def later() -> None:
        await asyncio.sleep(0.4)
        socket.push({"kind": "close"})

    task = asyncio.create_task(later())
    stats = await serve(socket, shop_context(tmp_path))
    await task
    assert stats.reason == "client_close"


# --- Context once, then resume ---


async def test_the_next_mic_press_resumes_the_providers_session(tmp_path: Path) -> None:
    """Press-to-talk opened a fresh Live session per press, sending the long coach instruction
    and recent history every time. The next press resumes with the provider's handle (ADK then
    sends no history)."""

    async def answers(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        yield resumption("h-1")
        for event in turn("Masala chai added.", tools=0):
            yield event

    live = FakeLive([answers])
    configs = recording(live)
    first = await run_voice(live, FakeSocket(), shop_context(tmp_path))
    second = await run_voice(live, FakeSocket(), shop_context(tmp_path))
    assert configs[0].session_resumption.handle is None
    assert configs[1].session_resumption.handle == "h-1"
    assert (first.connections, first.resumed_connections) == (1, 0)
    assert (second.connections, second.resumed_connections) == (1, 1)


async def test_another_language_or_an_old_handle_starts_fresh(handles: LiveHandles) -> None:
    handles.put("alice", "sid", "hi-IN", "h-1")
    assert handles.get("alice", "sid", "hi-IN") == "h-1"
    assert handles.get("bob", "sid", "hi-IN") is None
    assert handles.get("alice", "sid", "en-IN") is None
    assert handles.get("alice", "sid", "hi-IN") is None  # dropped with the language change
    handles.put("alice", "sid", "hi-IN", "h-2")
    handles.items[("alice", "sid")].expires = time.monotonic() - 1
    assert handles.get("alice", "sid", "hi-IN") is None
    small = LiveHandles(kept=2)
    for index in range(3):
        small.put("alice", f"s{index}", "hi-IN", f"h{index}")
    assert list(small.items) == [("alice", "s1"), ("alice", "s2")]


async def test_a_rejected_handle_falls_back_to_a_fresh_session(
    tmp_path: Path, handles: LiveHandles
) -> None:
    """The provider no longer holds the session: the owner's turn is answered on a fresh one."""
    socket = FakeSocket()
    socket.push({"kind": "text", "text": "price of chai?"})

    async def refuses(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        raise RuntimeError("1008 session not found")
        yield  # pragma: no cover

    async def answers(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        request = await queue.get()
        assert request.content and request.content.parts
        assert request.content.parts[0].text == "price of chai?"
        yield resumption("h-new")
        for event in turn("15 rupees.", tools=0):
            yield event

    context = shop_context(tmp_path)
    handles.put("alice", "sid", reply_language("hi").locale, "h-old", facts_of(context))
    live = FakeLive([refuses, answers])
    configs = recording(live)
    with capture_logs() as logs:
        stats = await run_voice(live, socket, context)
    assert [c.session_resumption.handle for c in configs] == ["h-old", None]
    assert stats.turns == 1 and stats.connections == 2 and stats.resumed_connections == 1
    assert any(entry["event"] == "voice_resume_rejected" for entry in logs)
    assert handles.get("alice", "sid", reply_language("hi").locale, facts_of(context)) == "h-new"


async def test_a_rotation_resumes_instead_of_replaying_the_conversation(tmp_path: Path) -> None:
    """When the provider ends a connection mid-onboarding, the next one resumes its session."""
    socket = FakeSocket()

    async def closes(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        yield resumption("h-1")
        for event in turn("आपकी दुकान का नाम?", tools=0):
            yield event

    async def continues(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        for event in turn("आप क्या बेचते हैं?", tools=0):
            yield event
        socket.push({"kind": "close"})
        await asyncio.Event().wait()

    live = FakeLive([closes, continues])
    configs = recording(live)
    stats = await run_voice(live, socket, new_shop_context(tmp_path))
    assert stats.rotations == 1
    assert [c.session_resumption.handle for c in configs] == [None, "h-1"]


# --- Cost is measured per session ---


async def test_voice_closed_carries_audio_seconds_and_token_counts(tmp_path: Path) -> None:
    socket = FakeSocket()
    socket.frames.put_nowait({"type": "websocket.receive", "bytes": b"\x00\x00" * 16_000})

    def usage(text: int, audio: int, out: int) -> Event:
        return Event(
            author="business_coach",
            usage_metadata=types.GenerateContentResponseUsageMetadata(
                prompt_token_count=text + audio,
                candidates_token_count=out,
                total_token_count=text + audio + out,
                prompt_tokens_details=[
                    types.ModalityTokenCount(modality=types.MediaModality.TEXT, token_count=text),
                    types.ModalityTokenCount(modality=types.MediaModality.AUDIO, token_count=audio),
                ],
                candidates_tokens_details=[
                    types.ModalityTokenCount(modality=types.MediaModality.AUDIO, token_count=out)
                ],
            ),
        )

    async def speaks(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        await queue.get()
        yield Event(
            author="business_coach",
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        inline_data=types.Blob(
                            data=b"\x00\x00" * 24_000, mime_type="audio/pcm;rate=24000"
                        )
                    )
                ],
            ),
        )
        yield usage(9_000, 25, 50)
        for event in turn("Done.", tools=0):
            yield event
        yield usage(9_100, 30, 40)

    stats = await run_voice(FakeLive([speaks]), socket, shop_context(tmp_path))
    fields = stats.fields()
    assert fields["audio_in_seconds"] == 1.0 and fields["audio_out_seconds"] == 1.0
    assert fields["tokens"] == {
        "in_audio": 55,
        "in_text": 18_100,
        "out_audio": 90,
        "prompt": 18_155,
        "response": 90,
        "total": 18_245,
    }
    assert fields["connections"] == 1 and fields["resumed_connections"] == 0
    json.dumps(fields)  # the log line stays plain JSON


# --- A resumed session never misses what happened outside it (review of #699) ---


async def answered_with_handle(queue: LiveRequestQueue) -> AsyncIterator[Event]:
    yield resumption("h-1")
    for event in turn("Masala chai added.", tools=0):
        yield event


async def test_a_typed_turn_after_a_pause_makes_the_next_connection_start_fresh(
    tmp_path: Path, handles: LiveHandles
) -> None:
    """The owner types "sold 3 sugar" in the chat (the text path, which the Live provider never
    sees), then presses the mic: that connection starts fresh with the history, not resumed."""
    live = FakeLive([answered_with_handle])
    configs = recording(live)
    context = shop_context(tmp_path)
    await run_voice(live, FakeSocket(), context)
    assert ("alice", "sid") in handles.items

    sessions = InMemorySessionService()
    await sessions.create_session(app_name=APP_NAME, user_id="alice", session_id="sid")
    runtime = CoachRuntime(Settings(app_env="test", _env_file=None), sessions)
    token = current.set(context)
    try:
        typed = [
            event
            async for event in runtime.text_events(
                Principal("alice", "test"), "sid", "sold 3 sugar", "en"
            )
        ]
    finally:
        current.reset(token)
    assert typed[-1].kind == "turn_complete"
    assert ("alice", "sid") not in handles.items

    await run_voice(live, FakeSocket(), context)
    assert [c.session_resumption.handle for c in configs] == [None, None]


async def test_changed_shop_facts_make_the_next_connection_start_fresh(
    tmp_path: Path, handles: LiveHandles
) -> None:
    """A tap or edit since the last connection (here the new-shop draft the app sends with the
    next socket) changes the facts in the instruction: the next connection gets it fresh."""

    def closes_after_a_turn(socket: FakeSocket) -> Any:
        async def script(queue: LiveRequestQueue) -> AsyncIterator[Event]:
            yield resumption("h-1")
            for event in turn("Masala chai added.", tools=0):
                yield event
            socket.push({"kind": "close"})
            await asyncio.Event().wait()

        return script

    handles_used: list[str | None] = []
    for context in (new_shop_context(tmp_path), new_shop_context(tmp_path), edited(tmp_path)):
        socket = FakeSocket()
        live = FakeLive([closes_after_a_turn(socket)])
        configs = recording(live)
        await run_voice(live, socket, context)
        handles_used.append(configs[0].session_resumption.handle)
    # The second socket resumes (nothing moved); the third has an edited draft: fresh.
    assert handles_used == [None, "h-1", None]


def edited(tmp_path: Path) -> MerchantContext:
    context = new_shop_context(tmp_path)
    context.new_shop_draft = chai_draft(phone="+919800000000")
    return context


async def test_a_draft_from_the_app_mid_connection_is_never_resumed_past(
    tmp_path: Path, handles: LiveHandles
) -> None:
    """A photo or pin arrives as a draft frame while the coach is connected: the handle of that
    connection is not saved, so the next one starts fresh and sees it in the instruction."""

    def with_frame(socket: FakeSocket, draft: dict[str, Any]) -> Any:
        async def script(queue: LiveRequestQueue) -> AsyncIterator[Event]:
            yield resumption("h-1")
            socket.push({"kind": "new_shop", "draft": draft})
            await asyncio.sleep(0.05)
            for event in turn("Nice photo.", tools=0):
                yield event
            socket.push({"kind": "close"})
            await asyncio.Event().wait()

        return script

    same = chai_draft().model_dump(mode="json")
    socket = FakeSocket()
    await run_voice(FakeLive([with_frame(socket, same)]), socket, new_shop_context(tmp_path))
    assert ("alice", "sid") in handles.items  # the app resent what the coach already had

    handles.items.clear()
    pinned = chai_draft(lat=12.97, lng=77.59).model_dump(mode="json")
    socket = FakeSocket()
    context = new_shop_context(tmp_path)
    await run_voice(FakeLive([with_frame(socket, pinned)]), socket, context)
    assert ("alice", "sid") not in handles.items
    assert context.new_shop_draft and context.new_shop_draft.business
    assert context.new_shop_draft.business.lat == 12.97


async def test_words_cut_off_by_the_cap_are_heard_after_talk_again(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, handles: LiveHandles
) -> None:
    """The owner was talking when the 5-minute cap closed the socket: "talk again" opens a
    connection that gets those words first, so nothing said is lost."""
    monkeypatch.setattr(voice, "NEW_SHOP_SESSION_CAP_SECONDS", 0.2)
    monkeypatch.setattr(voice, "CAP_QUIET_SECONDS", 0.1)

    async def cut_off(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        yield Event(
            author="business_coach",
            input_transcription=types.Transcription(text="mera naam Ramesh hai"),
        )
        await asyncio.Event().wait()

    first = ClosingSocket()
    stats = await serve(first, new_shop_context(tmp_path), FakeLive([cut_off]))
    assert stats.reason == "time_cap" and first.closed == (1000, "SESSION_CAP")

    heard: list[str] = []
    second = ClosingSocket()

    async def hears(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        request = await queue.get()
        assert request.content and request.content.parts
        heard.append(request.content.parts[0].text or "")
        for event in turn("Namaste Ramesh ji.", tools=0):
            yield event
        second.push({"kind": "close"})
        await asyncio.Event().wait()

    monkeypatch.setattr(voice, "NEW_SHOP_SESSION_CAP_SECONDS", 60)
    await serve(second, new_shop_context(tmp_path), FakeLive([hears]))
    assert heard == ["mera naam Ramesh hai"]
    assert handles.take("alice", "sid") is None


async def test_the_cap_lets_a_sentence_in_progress_finish(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(voice, "NEW_SHOP_SESSION_CAP_SECONDS", 0.1)
    monkeypatch.setattr(voice, "CAP_QUIET_SECONDS", 0.3)
    monkeypatch.setattr(voice, "CAP_GRACE_SECONDS", 5)

    async def talking(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        for word in ("mera", "naam", "Ramesh", "hai", "aur", "dukaan"):
            yield Event(author="business_coach", input_transcription=types.Transcription(text=word))
            await asyncio.sleep(0.15)
        await asyncio.Event().wait()

    began = time.monotonic()
    stats = await serve(ClosingSocket(), new_shop_context(tmp_path), FakeLive([talking]))
    assert stats.reason == "time_cap"
    assert time.monotonic() - began >= 0.9  # six words, 0.15 s apart, then quiet

    monkeypatch.setattr(voice, "CAP_GRACE_SECONDS", 0.3)

    async def endless(queue: LiveRequestQueue) -> AsyncIterator[Event]:
        while True:
            yield Event(
                author="business_coach", input_transcription=types.Transcription(text="aur")
            )
            await asyncio.sleep(0.05)

    began = time.monotonic()
    stats = await serve(ClosingSocket(), new_shop_context(tmp_path), FakeLive([endless]))
    assert stats.reason == "time_cap" and time.monotonic() - began < 2
