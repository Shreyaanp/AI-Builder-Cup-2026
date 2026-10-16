import asyncio
import time
from collections.abc import Awaitable, Callable, MutableMapping
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any

import anyio
import structlog
from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from google.adk.agents.run_config import RunConfig
from google.adk.live.live_request_queue import LiveRequestQueue
from google.genai import types
from pydantic import ValidationError

from .agent import ui_language
from .auth import Principal
from .contracts import NewShopVoiceContext, StreamEvent, VoiceControl
from .coordinator import current
from .latency import FirstOutput
from .new_shop_resume import merge_drafts, question_in
from .reply_language import ReplyLanguage, reply_language
from .settings import Settings
from .streaming import CoachRuntime, public_events

log = structlog.get_logger()

VOICE_PING_SECONDS = 20
VOICE_IDLE_SECONDS = 45
# Press-to-talk: leave time for teardown before a 180-second request cap.
VOICE_SESSION_CAP_SECONDS = 150
# The new-shop conversation is one open socket for the whole onboarding (the service's request
# timeout is 3600 s, see deploy.yml). At this cap the app reconnects and the conversation resumes.
NEW_SHOP_SESSION_CAP_SECONDS = 1800
# Model calls (turns plus tool calls) per Live connection. ADK's Live flow never counts calls
# against RunConfig.max_llm_calls (only its request/response flow does), so the budget is counted
# here. A press-to-talk turn needs a few; a measured new-shop onboarding uses about 2-3 per turn
# (one reply, one or two tool calls), so 120 is 40+ turns. When it is reached the new-shop
# conversation moves to a fresh Live connection at the end of a turn instead of ending.
VOICE_LLM_CALLS = 8
NEW_SHOP_LLM_CALLS = 120
VOICE_TEXT_TURNS = 12
# Typed answers and the app's own notes (photo, location, "no answer" nudges) in one socket.
NEW_SHOP_TEXT_TURNS = 400
# The new-shop microphone streams all the time (16 kHz PCM16 = 32,000 bytes a second). Its budget
# grows with the socket's age instead of a fixed total, which ended every conversation after about
# two minutes of listening ("Audio budget exceeded", closed as INVALID_FRAME).
AUDIO_BYTES_PER_SECOND = 40_000
AUDIO_BURST_BYTES = 1_000_000
# Fresh Live connections one socket may open after the provider ended one.
MAX_ROTATIONS = 12


def is_new_shop() -> bool:
    merchant = current.get()
    return bool(merchant and merchant.new_shop)


class VoiceIdle(TimeoutError):
    pass


class TakenOver(Exception):
    """A newer socket for the same conversation took it over (a reconnect)."""


@dataclass
class VoiceStats:
    """Why a voice socket ended and what it did, logged with every voice_closed."""

    started: float = field(default_factory=time.monotonic)
    reason: str = ""
    turns: int = 0
    tool_calls: int = 0
    rotations: int = 0
    # The coach's last question (for a fresh Live connection's instruction).
    last_question: str = ""

    def end(self, reason: str) -> None:
        self.reason = self.reason or reason

    def fields(self) -> dict[str, Any]:
        return {
            "reason": self.reason or "unknown",
            "seconds": round(time.monotonic() - self.started, 1),
            "turns": self.turns,
            "tool_calls": self.tool_calls,
            "rotations": self.rotations,
        }


def refresh_new_shop_draft(raw: str) -> bool:
    """A new-shop socket may resend its draft (a photo or a measured location changed it), so
    the tools keep building on what the owner sees. Only the session's own new-shop context moves.
    The app's draft is merged in: an empty or missing value never erases a saved answer.
    """
    if '"new_shop"' not in raw[:40]:
        return False
    update = NewShopVoiceContext.model_validate_json(raw)
    merchant = current.get()
    if not merchant or not merchant.new_shop:
        raise ValueError("Draft update outside a new-shop session")
    merchant.new_shop_draft = merge_drafts(merchant.new_shop_draft, update.draft)
    return True


def live_run_config(settings: Settings, language: ReplyLanguage, new_shop: bool) -> RunConfig:
    """The Live session's setup. The owner's chosen language is pinned here (speech and
    transcription) and in the instruction (agent.turn_instruction): left to detect it from the
    audio, the model drifted, e.g. Hindi answered in Bhojpuri.

    The new-shop conversation also asks for session resumption: when the provider closes the
    connection (it did, with a normal close, after 1-2 minutes, which ended the run silently),
    ADK reconnects to the same Live session with its handle instead of ending, and a sliding
    context window keeps a long conversation inside the model's limit."""
    code = language.code if language.live else None
    return RunConfig(
        response_modalities=[types.Modality.AUDIO],
        max_llm_calls=NEW_SHOP_LLM_CALLS if new_shop else VOICE_LLM_CALLS,
        input_audio_transcription=types.AudioTranscriptionConfig(
            language_codes=[code] if code else None
        ),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        speech_config=types.SpeechConfig(
            language_code=code,
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=settings.voice_name)
            ),
        ),
        session_resumption=types.SessionResumptionConfig() if new_shop else None,
        context_window_compression=types.ContextWindowCompressionConfig(
            sliding_window=types.SlidingWindow()
        )
        if new_shop
        else None,
        save_live_blob=False,
    )


async def receive_frame(websocket: WebSocket) -> MutableMapping[str, Any]:
    try:
        return await asyncio.wait_for(websocket.receive(), timeout=VOICE_IDLE_SECONDS)
    except TimeoutError:
        raise VoiceIdle from None


class AudioBudget:
    """Per-socket microphone limit: a fixed total for press-to-talk, a rate for conversations."""

    def __init__(self, settings: Settings, new_shop: bool) -> None:
        self.maximum = settings.max_audio_bytes
        self.new_shop = new_shop
        self.started = time.monotonic()
        self.total = 0

    def take(self, audio: bytes) -> None:
        self.total += len(audio)
        allowed = (
            AUDIO_BURST_BYTES + AUDIO_BYTES_PER_SECOND * (time.monotonic() - self.started)
            if self.new_shop
            else self.maximum
        )
        if len(audio) > 32_768 or len(audio) % 2 or self.total > allowed:
            raise ValueError("Audio budget exceeded")


async def offline_voice(
    websocket: WebSocket,
    runtime: CoachRuntime,
    principal: Principal,
    sid: str,
    language: ReplyLanguage,
    stats: VoiceStats,
) -> None:
    """Exercise the same socket contract without recording or interpreting audio."""
    budget = AudioBudget(runtime.settings, is_new_shop())
    text_turns = 0
    max_text_turns = NEW_SHOP_TEXT_TURNS if is_new_shop() else VOICE_TEXT_TURNS
    while True:
        frame = await receive_frame(websocket)
        if frame["type"] == "websocket.disconnect":
            stats.end("client_gone")
            return
        audio = frame.get("bytes")
        if audio is not None:
            budget.take(audio)
            continue
        text = frame.get("text", "")
        if len(text) > 5000:
            raise ValueError("Frame too large")
        if refresh_new_shop_draft(text):
            continue
        command = VoiceControl.model_validate_json(text)
        if command.kind == "close":
            stats.end("client_close")
            return
        if command.kind == "ping":
            await websocket.send_json(StreamEvent(kind="pong").payload())
        if command.kind == "audio_end":
            await websocket.send_json(
                StreamEvent(
                    kind="reply",
                    text="Offline audio transport received. No speech recognition was run.",
                ).payload()
            )
            await websocket.send_json(StreamEvent(kind="turn_complete").payload())
            stats.turns += 1
        if command.kind == "text":
            text_turns += 1
            if text_turns > max_text_turns or not command.text.strip():
                raise ValueError("Text turn limit exceeded")
            said = ""
            async for event in runtime.text_events(principal, sid, command.text, language.locale):
                if event.kind == "reply":
                    said = event.text or ""
                elif event.kind == "delta":
                    said += event.text or ""
                if event.kind == "proposal":
                    stats.tool_calls += 1
                if event.kind == "turn_complete":
                    stats.turns += 1
                    stats.last_question = question_in(said) or stats.last_question
                await websocket.send_json(event.payload())


class LiveLink:
    """The Live connection of the moment: a rotation swaps in a fresh request queue."""

    def __init__(self) -> None:
        self.queue = LiveRequestQueue()


async def gemini_voice(
    websocket: WebSocket,
    runtime: CoachRuntime,
    principal: Principal,
    sid: str,
    language: ReplyLanguage,
    stats: VoiceStats,
) -> None:
    link = LiveLink()
    text_turns = 0
    new_shop = is_new_shop()
    budget = AudioBudget(runtime.settings, new_shop)
    max_text_turns = NEW_SHOP_TEXT_TURNS if new_shop else VOICE_TEXT_TURNS
    # A typed turn the coach has not answered yet: a fresh Live connection gets it again.
    unanswered: list[str] = []

    async def upstream() -> None:
        nonlocal text_turns
        while True:
            frame = await receive_frame(websocket)
            if frame["type"] == "websocket.disconnect":
                stats.end("client_gone")
                return
            audio = frame.get("bytes")
            if audio is not None:
                budget.take(audio)
                link.queue.send_realtime(types.Blob(data=audio, mime_type="audio/pcm;rate=16000"))
                continue
            raw = frame.get("text", "")
            if len(raw) > 5000:
                raise ValueError("Frame too large")
            if refresh_new_shop_draft(raw):
                continue
            command = VoiceControl.model_validate_json(raw)
            if command.kind == "close":
                stats.end("client_close")
                return
            if command.kind == "client_error":
                log.warning("voice_client_error", reason=command.text[:200])
                stats.end("client_error")
                return
            if command.kind == "ping":
                await websocket.send_json(StreamEvent(kind="pong").payload())
            if command.kind == "text":
                text_turns += 1
                if text_turns > max_text_turns or not command.text.strip():
                    raise ValueError("Text turn limit exceeded")
                unanswered[:] = [command.text]
                link.queue.send_content(
                    types.Content(role="user", parts=[types.Part(text=command.text)])
                )
            elif command.kind == "audio_end":
                link.queue.send_audio_stream_end()

    async def one_connection() -> str:
        """Run one Live connection; returns why it ended (the socket itself stays open)."""
        events = runtime.live_runner.run_live(
            user_id=principal.uid,
            session_id=sid,
            live_request_queue=link.queue,
            run_config=live_run_config(runtime.settings, language, new_shop),
        )
        # Time from the owner's last transcribed words to the first audio of the reply.
        heard = FirstOutput("voice_first_audio")
        heard.done = True
        calls = 0
        said = ""
        try:
            async for event in events:
                if event.input_transcription and event.input_transcription.text:
                    heard.restart()
                if event.error_code:
                    log.warning(
                        "voice_provider_error",
                        code=str(event.error_code),
                        message=(event.error_message or "")[:300],
                    )
                    if new_shop:
                        # The conversation continues on a fresh connection, not an error screen.
                        return "provider_error"
                if event.output_transcription and event.output_transcription.text:
                    said += event.output_transcription.text
                tools = len(event.get_function_calls())
                calls += tools
                stats.tool_calls += tools
                for visible in public_events(event):
                    await websocket.send_json(visible.payload())
                    if visible.kind == "error":
                        return "provider_error"
                if event.content:
                    for part in event.content.parts or []:
                        blob = part.inline_data
                        if blob and blob.data and (blob.mime_type or "").startswith("audio/pcm"):
                            heard.mark()
                            await websocket.send_json(
                                StreamEvent(
                                    kind="audio_format",
                                    sample_rate=24000,
                                ).payload()
                            )
                            await websocket.send_bytes(blob.data)
                if event.turn_complete:
                    calls += 1
                    stats.turns += 1
                    unanswered.clear()
                    stats.last_question = question_in(said) or stats.last_question
                    said = ""
                    # Near the budget: the next turn starts on a fresh connection.
                    if new_shop and NEW_SHOP_LLM_CALLS - calls <= 3:
                        return "llm_budget"
            return "provider_closed"
        finally:
            await events.aclose()

    async def downstream() -> None:
        while True:
            began = time.monotonic()
            ended = await one_connection()
            if not new_shop or stats.rotations >= MAX_ROTATIONS:
                stats.end(ended)
                return
            if ended != "llm_budget" and time.monotonic() - began < 3 and stats.rotations:
                # Two connections in a row that ended at once: the provider is down.
                stats.end(ended)
                raise RuntimeError(f"Live connection keeps ending: {ended}")
            # Seamless: a fresh Live connection on the same conversation. It starts from the
            # saved turns and draft, and the instruction says where the conversation stood.
            stats.rotations += 1
            log.info("voice_rotated", reason=ended, rotation=stats.rotations)
            previous, link.queue = link.queue, LiveRequestQueue()
            previous.close()
            merchant = current.get()
            if merchant:
                merchant.resumed = True
                merchant.last_question = stats.last_question
            if unanswered:
                link.queue.send_content(
                    types.Content(role="user", parts=[types.Part(text=unanswered[0])])
                )

    tasks = [asyncio.create_task(upstream()), asyncio.create_task(downstream())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    finally:
        link.queue.close()
        for task in tasks:
            task.cancel()
        with anyio.CancelScope(shield=True):
            async with asyncio.timeout(5):
                await asyncio.gather(*tasks, return_exceptions=True)


async def serve_voice(
    websocket: WebSocket,
    runtime: CoachRuntime,
    principal: Principal,
    sid: str,
    lang: str | None = None,
    *,
    keep: Callable[[], Awaitable[bool]] | None = None,
    lost: asyncio.Event | None = None,
    stats: VoiceStats | None = None,
) -> VoiceStats:
    """Serve one voice socket until it ends; returns why it ended (for the voice_closed log).

    keep: renews the conversation's stream lease on every heartbeat (False: another socket took
    it over). lost: set at once when a newer socket for this conversation took it over here."""
    stats = stats or VoiceStats()
    language = reply_language(lang)
    # The session's tasks inherit the owner's language for the coach instruction.
    ui_language.set(language.locale)

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(VOICE_PING_SECONDS)
            if keep and not await keep():
                raise TakenOver
            await websocket.send_json(StreamEvent(kind="ping").payload())

    async def watch_takeover() -> None:
        if lost is None:
            await asyncio.Event().wait()
            return
        await lost.wait()
        raise TakenOver

    tasks = [
        asyncio.create_task(heartbeat(), name=f"voice-ping:{sid}"),
        asyncio.create_task(watch_takeover(), name=f"voice-takeover:{sid}"),
        asyncio.create_task(
            offline_voice(websocket, runtime, principal, sid, language, stats)
            if runtime.settings.coach_mode == "offline"
            else gemini_voice(websocket, runtime, principal, sid, language, stats),
            name=f"voice-session:{sid}",
        ),
    ]
    code, reason = 1000, "Voice session ended"
    # The new-shop conversation keeps one socket for the whole onboarding.
    seconds = (
        NEW_SHOP_SESSION_CAP_SECONDS
        if is_new_shop()
        else min(runtime.settings.max_voice_seconds, VOICE_SESSION_CAP_SECONDS)
    )
    error: str | None = None
    try:
        async with asyncio.timeout(seconds):
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
    except WebSocketDisconnect:
        stats.end("client_gone")
    except VoiceIdle:
        stats.end("idle")
        code, reason = 1001, "VOICE_IDLE"
    except TakenOver:
        stats.end("taken_over")
        code, reason, error = 1000, "TAKEN_OVER", "TAKEN_OVER"
    except TimeoutError:
        stats.end("time_cap")
        code, reason, error = 1001, "SESSION_TIMEOUT", "SESSION_TIMEOUT"
    except (ValueError, ValidationError, HTTPException) as failure:
        stats.end(f"invalid_frame: {str(failure)[:80]}")
        code, reason, error = 1008, "INVALID_FRAME", "INVALID_FRAME"
    except Exception:
        log.exception("voice_session_failed")
        stats.end("provider_failed")
        code, reason, error = 1011, "PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE"
    finally:
        for task in tasks:
            task.cancel()
        with anyio.CancelScope(shield=True):
            async with asyncio.timeout(5):
                await asyncio.gather(*tasks, return_exceptions=True)
            with suppress(RuntimeError, WebSocketDisconnect):
                if error:
                    await websocket.send_json(StreamEvent(kind="error", code=error).payload())
            with suppress(RuntimeError, WebSocketDisconnect):
                await websocket.close(code=code, reason=reason)
    return stats
