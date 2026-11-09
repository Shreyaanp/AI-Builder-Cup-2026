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

from . import voice_resume
from .agent import LiveClose, asks_to_end, background_tools, live_close, ui_language
from .auth import Principal
from .contracts import NewShopVoiceContext, StreamEvent, VoiceControl
from .coordinator import current
from .firestore_memory import pending_writes, settle_writes
from .latency import FirstOutput
from .latency import stats as latency
from .new_shop_resume import merge_drafts, question_in
from .new_shop_tools import end_conversation, go_live
from .reply_language import ReplyLanguage, reply_language
from .settings import Settings
from .streaming import CoachRuntime, public_events
from .voice_usage import add_usage

log = structlog.get_logger()

VOICE_PING_SECONDS = 20
VOICE_IDLE_SECONDS = 45
# Press-to-talk: leave time for teardown before a 180-second request cap.
VOICE_SESSION_CAP_SECONDS = 150
# The new-shop conversation is one open socket for the whole onboarding (about a minute). Live
# voice is billed for every second a session is open and for its whole context on every turn
# (OB-181: about INR 1,010 in 8.5 days), so it ends politely after 5 minutes: the app offers
# "let's continue by typing" and a tap to talk again (it was 15 minutes, owner decision 17 Oct).
NEW_SHOP_SESSION_CAP_SECONDS = 300
# The open conversation streams the microphone all the time, so "no frames" never happens. When
# the owner has not spoken, typed or sent a photo/pin for this long, and the coach is not talking,
# the conversation pauses (same calm "tap to talk again" as the time cap; nothing is lost).
CONVERSATION_IDLE_SECONDS = 45
IDLE_CHECK_SECONDS = 1.0
# At the 5-minute cap the conversation waits (up to this long) for the owner or the coach to
# finish the sentence, so the pause never cuts anyone off mid-word.
CAP_GRACE_SECONDS = 20
CAP_QUIET_SECONDS = 2.0
# Live re-reads the whole session context on every turn. Past this many tokens the provider
# drops the oldest turns (the instruction and tools always stay), so a long or resumed session
# never grows the per-turn bill without limit.
CONTEXT_TRIGGER_TOKENS = 32_000
CONTEXT_TARGET_TOKENS = 20_000
# 16 kHz PCM16 in, 24 kHz PCM16 out.
AUDIO_IN_BYTES_PER_SECOND = 32_000
AUDIO_OUT_BYTES_PER_SECOND = 48_000
# No model-call cap for the Live conversation: ADK's Live flow never counts calls against
# RunConfig.max_llm_calls (only its request/response flow does), so the old 40-call cap never
# ended a session; the provider's own close did (no session resumption). Press-to-talk keeps a
# small budget for its request/response fallback.
VOICE_LLM_CALLS = 8
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
# Teardown waits this long for in-flight saves (the owner's last answer, the draft).
SAVE_SETTLE_SECONDS = 8


async def settle_saves() -> None:
    """Let the socket's in-flight saves land before its tasks are cancelled (shielded: the
    teardown may itself be running under a cancellation)."""
    with anyio.CancelScope(shield=True):
        running = await settle_writes(SAVE_SETTLE_SECONDS)
    if running:
        log.warning("voice_saves_unsettled", writes=running)


def is_new_shop() -> bool:
    merchant = current.get()
    return bool(merchant and merchant.new_shop)


def owner_ended() -> bool:
    """The owner asked to stop ("bas", "that's all"): end_conversation ran this turn."""
    merchant = current.get()
    return bool(merchant and merchant.ended)


class VoiceIdle(TimeoutError):
    pass


class ConversationPaused(Exception):
    """The open conversation heard nothing from the owner for CONVERSATION_IDLE_SECONDS."""


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
    # How the last Live connection closed (the provider's code and reason).
    provider: LiveClose = field(default_factory=LiveClose)
    # Cost (OB-181): what the session streamed and what the provider reported it billed.
    audio_in_bytes: int = 0
    audio_out_bytes: int = 0
    connections: int = 0
    resumed_connections: int = 0
    tokens: dict[str, int] = field(default_factory=dict)
    # Last time the owner spoke, typed or sent something, or the coach spoke (monotonic).
    active: float = field(default_factory=time.monotonic)

    def end(self, reason: str) -> None:
        self.reason = self.reason or reason

    def touch(self) -> None:
        self.active = max(self.active, time.monotonic())

    def spoke(self, audio: bytes) -> None:
        """The coach's audio arrives faster than the phone plays it: the owner's silence starts
        when it has finished playing."""
        self.audio_out_bytes += len(audio)
        self.active = max(self.active, time.monotonic()) + len(audio) / AUDIO_OUT_BYTES_PER_SECOND

    def silent_for(self) -> float:
        return time.monotonic() - self.active

    def usage(self, usage: types.GenerateContentResponseUsageMetadata) -> None:
        add_usage(self.tokens, usage)

    def fields(self) -> dict[str, Any]:
        return {
            "reason": self.reason or "unknown",
            "seconds": round(time.monotonic() - self.started, 1),
            "turns": self.turns,
            "tool_calls": self.tool_calls,
            "rotations": self.rotations,
            "audio_in_seconds": round(self.audio_in_bytes / AUDIO_IN_BYTES_PER_SECOND, 1),
            "audio_out_seconds": round(self.audio_out_bytes / AUDIO_OUT_BYTES_PER_SECOND, 1),
            "connections": self.connections,
            "resumed_connections": self.resumed_connections,
            "tokens": dict(sorted(self.tokens.items())),
            **self.provider_fields(),
        }

    def provider_fields(self) -> dict[str, Any]:
        return {
            "provider_code": self.provider.code,
            "provider_reason": self.provider.reason,
            "closed_by": self.provider.by or "none",
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


async def publish_if_ready(websocket: WebSocket) -> None:
    """The app's own update (the GPS pin) can complete name + kind + place: the shop goes live
    now, and the app learns it (the draft with its live shop)."""
    merchant = current.get()
    if not merchant or not merchant.new_shop:
        return
    if await anyio.to_thread.run_sync(go_live, merchant) and merchant.new_shop_draft:
        await websocket.send_json(
            StreamEvent(
                kind="draft", data=merchant.new_shop_draft.model_dump(mode="json")
            ).payload()
        )


# Owners often pause mid-sentence ("Lakshmi Tea Stall… Indiranagar metro ke paas"): the model
# waits this long in silence before it takes the turn (the default cut them off).
END_OF_TURN_SILENCE_MS = 1200


def live_run_config(
    settings: Settings,
    language: ReplyLanguage,
    new_shop: bool,
    extras: bool = True,
    handle: str | None = None,
) -> RunConfig:
    """The Live session's setup. The owner's chosen language is pinned here (speech and
    transcription) and in the instruction (agent.turn_instruction): left to detect it from the
    audio, the model drifted, e.g. Hindi answered in Bhojpuri.

    The new-shop conversation also asks for session resumption: when the provider closes the
    connection (it did, with a normal close, after 1-2 minutes, which ended the run silently),
    ADK reconnects to the same Live session with its handle instead of ending, and a sliding
    context window keeps a long conversation inside the model's limit. A GoAway is handled by
    ADK itself: it reconnects with the latest resumption handle (transparent on Vertex AI).

    `extras`: voice activity detection tuned for owners who pause, barge-in, affective dialog and
    proactive audio. A model that rejects one of them gets a session without them (logged).

    Cost (OB-181): every session asks for resumption handles, and `handle` resumes the provider's
    session (the instruction and history are not sent again). A bounded sliding window keeps the
    context re-read on every turn under CONTEXT_TRIGGER_TOKENS."""
    code = language.code if language.live else None
    tuned: dict[str, Any] = (
        {
            "realtime_input_config": types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                    prefix_padding_ms=300,
                    silence_duration_ms=END_OF_TURN_SILENCE_MS,
                ),
                # Barge-in: the owner speaking stops the coach (audio and captions together).
                activity_handling=types.ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            ),
            "enable_affective_dialog": True,
            "proactivity": types.ProactivityConfig(proactive_audio=True),
        }
        if extras
        else {}
    )
    if not new_shop:
        tuned["max_llm_calls"] = VOICE_LLM_CALLS
    return RunConfig(
        response_modalities=[types.Modality.AUDIO],
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
        session_resumption=types.SessionResumptionConfig(handle=handle or None),
        context_window_compression=types.ContextWindowCompressionConfig(
            trigger_tokens=CONTEXT_TRIGGER_TOKENS,
            sliding_window=types.SlidingWindow(target_tokens=CONTEXT_TARGET_TOKENS),
        ),
        save_live_blob=False,
        **tuned,
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
            stats.audio_in_bytes += len(audio)
            continue
        text = frame.get("text", "")
        if len(text) > 5000:
            raise ValueError("Frame too large")
        if refresh_new_shop_draft(text):
            stats.touch()
            await publish_if_ready(websocket)
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
            stats.touch()
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
            if owner_ended():
                # The goodbye is out; everything is saved. The conversation ends here.
                stats.end("owner_ended")
                return


async def end_by_request(websocket: WebSocket) -> None:
    """The owner said a stop word and the model did not end the conversation itself: the app
    runs end_conversation and tells the phone, like the tool would have."""
    result = end_conversation()
    merchant = current.get()
    card = merchant.cards.get(str(result.get("card_id"))) if merchant else None
    if card:
        await websocket.send_json(StreamEvent(kind="action", data=card[1]).payload())


def tool_result(response: types.FunctionResponse, called: float | None) -> None:
    """Every tool result on its way back to the Live model is logged with what it carries (owner
    report, 17 Oct: missing context seemed to break the flow), and its time joins the latency
    read-out. A background (NON_BLOCKING) result carries its scheduling."""
    body = response.response or {}
    ms = (time.perf_counter() - called) * 1000 if called is not None else None
    missing = body.get("still_missing")
    log.info(
        "voice_tool_result",
        tool=response.name,
        ms=round(ms, 1) if ms is not None else None,
        scheduling=response.scheduling.value if response.scheduling else "blocking",
        status=str(body.get("status", ""))[:40],
        fields=sorted(body)[:16],
        missing=len(missing) if isinstance(missing, list) else None,
    )
    if ms is not None:
        latency.record(f"voice_tool:{response.name}", ms)


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
    # Tuned voice options on; off for this socket once the model rejected one of them.
    extras = True
    text_turns = 0
    new_shop = is_new_shop()
    merchant = current.get()
    if merchant:
        merchant.spoken = True
    budget = AudioBudget(runtime.settings, new_shop)
    max_text_turns = NEW_SHOP_TEXT_TURNS if new_shop else VOICE_TEXT_TURNS
    # A typed turn (or the owner's spoken words) the coach has not answered yet: a fresh Live
    # connection gets it again.
    unanswered: list[str] = []
    # The owner typed "bas" / "ho gaya": the conversation ends after the coach's goodbye.
    stop_asked = False
    # The provider's session to resume (OB-181): the last mic press, or this socket's last
    # connection, while nothing moved outside Live since (voice_resume). None: a fresh session
    # that gets the instruction and recent history.
    uid = principal.uid
    handles = voice_resume.live_handles
    carried = handles.take(uid, sid)
    if carried:
        # The owner's words the last socket closed on (the cap or a pause): this one answers them.
        unanswered[:] = [carried]
        link.queue.send_content(types.Content(role="user", parts=[types.Part(text=carried)]))
        log.info("voice_spoken_turn_carried_over", length=len(carried))

    async def upstream() -> None:
        nonlocal text_turns, stop_asked
        while True:
            frame = await receive_frame(websocket)
            if frame["type"] == "websocket.disconnect":
                stats.end("client_gone")
                return
            audio = frame.get("bytes")
            if audio is not None:
                budget.take(audio)
                stats.audio_in_bytes += len(audio)
                link.queue.send_realtime(types.Blob(data=audio, mime_type="audio/pcm;rate=16000"))
                continue
            raw = frame.get("text", "")
            if len(raw) > 5000:
                raise ValueError("Frame too large")
            before = merchant.new_shop_draft if merchant else None
            if refresh_new_shop_draft(raw):
                stats.touch()
                if merchant and merchant.new_shop_draft != before:
                    # A photo or pin the provider never saw: no resuming past it.
                    handles.changed(uid, sid)
                await publish_if_ready(websocket)
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
                stats.touch()
                if new_shop and asks_to_end(command.text):
                    stop_asked = True
                link.queue.send_content(
                    types.Content(role="user", parts=[types.Part(text=command.text)])
                )
            elif command.kind == "audio_end":
                link.queue.send_audio_stream_end()

    async def one_connection() -> str:
        """Run one Live connection; returns why it ended (the socket itself stays open)."""
        nonlocal extras
        # A model that refused the tuned setup gets plain blocking tools too.
        background_tools.set(extras)
        since = handles.version(uid, sid)
        handle = handles.get(uid, sid, language.locale, await voice_resume.known_facts())
        latest: str | None = None
        resuming = bool(handle)
        stats.connections += 1
        stats.resumed_connections += resuming
        events = runtime.live_runner.run_live(
            user_id=principal.uid,
            session_id=sid,
            live_request_queue=link.queue,
            run_config=live_run_config(runtime.settings, language, new_shop, extras, handle),
        )
        # Time from the owner's last transcribed words to the first audio of the reply.
        heard = FirstOutput("voice_first_audio")
        heard.done = True
        said = ""
        owner_said = ""
        received = False
        # When each tool call was seen (by call id), for the time its result took.
        called: dict[str, float] = {}
        # This turn so far: the coach spoke (audio or words) / a tool ran. After a tool, ADK
        # completes a turn at once, before the coach says anything (live, 17 Oct): that turn is
        # not the reply, so it is not passed on (press-to-talk hung up on it, #137).
        spoke = tools_ran = False
        try:
            async for event in events:
                first, received = not received, True
                update = event.live_session_resumption_update
                if update and update.new_handle:
                    latest = update.new_handle
                if event.usage_metadata:
                    stats.usage(event.usage_metadata)
                if event.input_transcription and event.input_transcription.text:
                    heard.restart()
                    stats.touch()
                    owner_said += event.input_transcription.text
                if event.error_code:
                    log.warning(
                        "voice_provider_error",
                        code=str(event.error_code),
                        message=(event.error_message or "")[:300],
                    )
                    if resuming and first:
                        # The provider no longer has the session (an old handle): start fresh.
                        return "resume_rejected"
                    if new_shop:
                        # The conversation continues on a fresh connection, not an error screen.
                        return "provider_error"
                if event.output_transcription and event.output_transcription.text:
                    said += event.output_transcription.text
                    spoke = True
                    stats.touch()
                calls = event.get_function_calls()
                stats.tool_calls += len(calls)
                for call in calls:
                    called[call.id or call.name or ""] = time.perf_counter()
                for response in event.get_function_responses():
                    tool_result(response, called.pop(response.id or response.name or "", None))
                tools_ran = tools_ran or bool(calls or event.get_function_responses())
                silent_tool_turn = bool(event.turn_complete) and tools_ran and not spoke
                for visible in public_events(event):
                    if silent_tool_turn and visible.kind == "turn_complete":
                        continue
                    await websocket.send_json(visible.payload())
                    if visible.kind == "error":
                        return "provider_error"
                if event.content:
                    for part in event.content.parts or []:
                        blob = part.inline_data
                        if blob and blob.data and (blob.mime_type or "").startswith("audio/pcm"):
                            heard.mark()
                            spoke = True
                            stats.spoke(blob.data)
                            await websocket.send_json(
                                StreamEvent(
                                    kind="audio_format",
                                    sample_rate=24000,
                                ).payload()
                            )
                            await websocket.send_bytes(blob.data)
                if event.turn_complete and not silent_tool_turn:
                    spoke = tools_ran = False
                    stats.turns += 1
                    unanswered.clear()
                    stats.last_question = question_in(said) or stats.last_question
                    said = ""
                    spoken_stop, owner_said = new_shop and asks_to_end(owner_said), ""
                    if (stop_asked or spoken_stop) and not owner_ended():
                        # "bas" always ends the conversation, whatever the model made of it.
                        await end_by_request(websocket)
                    if owner_ended():
                        # The goodbye has been spoken; everything is saved.
                        return "owner_ended"
            return "provider_closed"
        except Exception as failure:
            if resuming and not received:
                log.warning("voice_resume_failed", reason=str(failure)[:300])
                return "resume_rejected"
            if extras and not received:
                # The model refused the session setup (an option it does not accept): carry on
                # without the tuned options instead of failing the conversation.
                log.warning("voice_options_rejected", reason=str(failure)[:300])
                extras = False
                return "options_rejected"
            raise
        finally:
            if owner_said.strip() and not unanswered:
                # The owner spoke but the connection ended before the coach's turn completed:
                # spoken words are saved to the conversation only at the end of a turn, so the
                # next connection would never hear them (#108). It gets them as a typed turn.
                unanswered[:] = [owner_said.strip()[:2000]]
                log.info("voice_spoken_turn_carried", length=len(unanswered[0]))
            await events.aclose()
            if latest:
                # Saved with the facts as they are now (the coach's own saves included); a typed
                # turn or app draft since this connection began keeps it from being saved.
                with anyio.CancelScope(shield=True):
                    facts = await voice_resume.known_facts()
                handles.put(uid, sid, language.locale, latest, facts, since)

    async def downstream() -> None:
        while True:
            began = time.monotonic()
            ended = await one_connection()
            if ended == "owner_ended":
                stats.end(ended)
                return
            if ended == "options_rejected":
                # The same conversation, at once, on a plain connection (nothing was said yet).
                fresh(resumed=False)
                continue
            if ended == "resume_rejected":
                # The provider no longer holds the session: the same conversation, at once, on a
                # fresh session with the instruction and recent history (never twice: no handle).
                handles.drop(uid, sid)
                log.info("voice_resume_rejected", turns=stats.turns)
                fresh(resumed=bool(stats.turns))
                continue
            if not new_shop or stats.rotations >= MAX_ROTATIONS:
                stats.end(ended)
                return
            if time.monotonic() - began < 3 and stats.rotations:
                # Two connections in a row that ended at once: the provider is down.
                stats.end(ended)
                raise RuntimeError(f"Live connection keeps ending: {ended}")
            # Seamless: a fresh Live connection on the same conversation. It starts from the
            # saved turns and draft, and the instruction says where the conversation stood.
            stats.rotations += 1
            log.info(
                "voice_rotated", reason=ended, rotation=stats.rotations, **stats.provider_fields()
            )
            fresh(resumed=True)

    def fresh(resumed: bool) -> None:
        """A new request queue for the next Live connection; a typed turn the coach never
        answered goes again."""
        previous, link.queue = link.queue, LiveRequestQueue()
        previous.close()
        merchant = current.get()
        if merchant and resumed:
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
        # The owner's last answer may be mid-save: it lands before the tasks are cancelled.
        await settle_saves()
        link.queue.close()
        for task in tasks:
            task.cancel()
        with anyio.CancelScope(shield=True):
            async with asyncio.timeout(5):
                await asyncio.gather(*tasks, return_exceptions=True)
        if unanswered and stats.reason in ("time_cap", "owner_silent"):
            # "Talk again" hears what the owner said (or typed) just before the pause.
            handles.carry(uid, sid, unanswered[0])


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
    # This socket's own in-flight saves, waited for at teardown (tasks below inherit the set).
    saves_token = pending_writes.set(set())
    live_close.set(stats.provider)

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(VOICE_PING_SECONDS)
            if keep and not await keep():
                raise TakenOver
            await websocket.send_json(StreamEvent(kind="ping").payload())

    async def watch_idle() -> None:
        """The open conversation pauses after CONVERSATION_IDLE_SECONDS without the owner (or
        the coach) saying anything: an always-on microphone is billed while nobody talks."""
        if not is_new_shop():
            await asyncio.Event().wait()
            return
        stats.touch()
        while True:
            await asyncio.sleep(IDLE_CHECK_SECONDS)
            if stats.silent_for() > CONVERSATION_IDLE_SECONDS:
                raise ConversationPaused

    # The new-shop conversation keeps one socket for the whole onboarding.
    seconds = (
        NEW_SHOP_SESSION_CAP_SECONDS
        if is_new_shop()
        else min(runtime.settings.max_voice_seconds, VOICE_SESSION_CAP_SECONDS)
    )

    async def watch_cap() -> None:
        """The time cap. The open conversation lets a sentence in progress finish first (the
        owner's or the coach's, up to CAP_GRACE_SECONDS). Press-to-talk keeps a hard cap."""
        await asyncio.sleep(seconds)
        if is_new_shop():
            grace = time.monotonic() + CAP_GRACE_SECONDS
            while time.monotonic() < grace:
                if stats.silent_for() >= CAP_QUIET_SECONDS:
                    break
                await asyncio.sleep(0.25)
        raise TimeoutError

    async def watch_takeover() -> None:
        if lost is None:
            await asyncio.Event().wait()
            return
        await lost.wait()
        raise TakenOver

    tasks = [
        asyncio.create_task(heartbeat(), name=f"voice-ping:{sid}"),
        asyncio.create_task(watch_takeover(), name=f"voice-takeover:{sid}"),
        asyncio.create_task(watch_idle(), name=f"voice-idle:{sid}"),
        asyncio.create_task(watch_cap(), name=f"voice-cap:{sid}"),
        asyncio.create_task(
            offline_voice(websocket, runtime, principal, sid, language, stats)
            if runtime.settings.coach_mode == "offline"
            else gemini_voice(websocket, runtime, principal, sid, language, stats),
            name=f"voice-session:{sid}",
        ),
    ]
    code, reason = 1000, "Voice session ended"
    error: str | None = None
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    except WebSocketDisconnect:
        stats.end("client_gone")
    except VoiceIdle:
        stats.end("idle")
        code, reason = 1001, "VOICE_IDLE"
    except ConversationPaused:
        # Like the time cap: a calm pause; "tap to talk again" resumes the same conversation.
        stats.end("owner_silent")
        code, reason, error = 1000, "VOICE_PAUSED", "VOICE_PAUSED"
    except TakenOver:
        stats.end("taken_over")
        code, reason, error = 1000, "TAKEN_OVER", "TAKEN_OVER"
    except TimeoutError:
        stats.end("time_cap")
        # The new-shop conversation ends politely: the app offers typing and a tap to talk again
        # (it does not reconnect by itself). Press-to-talk simply times out.
        cap = "SESSION_CAP" if is_new_shop() else "SESSION_TIMEOUT"
        code, reason, error = 1000 if is_new_shop() else 1001, cap, cap
    except (ValueError, ValidationError, HTTPException) as failure:
        stats.end(f"invalid_frame: {str(failure)[:80]}")
        code, reason, error = 1008, "INVALID_FRAME", "INVALID_FRAME"
    except Exception:
        log.exception("voice_session_failed")
        stats.end("provider_failed")
        code, reason, error = 1011, "PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE"
    finally:
        await settle_saves()
        for task in tasks:
            task.cancel()
        with anyio.CancelScope(shield=True):
            async with asyncio.timeout(5):
                await asyncio.gather(*tasks, return_exceptions=True)
            # A save the cancellation cut off goes on by itself: the socket stays until it lands.
            await settle_saves()
            pending_writes.reset(saves_token)
            with suppress(RuntimeError, WebSocketDisconnect):
                if error:
                    await websocket.send_json(StreamEvent(kind="error", code=error).payload())
            with suppress(RuntimeError, WebSocketDisconnect):
                if stats.reason == "owner_ended":
                    # The app shows "Conversation ended" (no reconnect, no error).
                    reason = "ENDED"
                await websocket.close(code=code, reason=reason)
    return stats
