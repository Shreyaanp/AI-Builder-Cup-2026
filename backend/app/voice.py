import asyncio
from collections.abc import MutableMapping
from contextlib import suppress
from typing import Any

import anyio
from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from google.adk.agents.run_config import RunConfig
from google.adk.live.live_request_queue import LiveRequestQueue
from google.genai import types
from pydantic import ValidationError

from .auth import Principal
from .contracts import StreamEvent, VoiceControl
from .streaming import CoachRuntime, public_events

VOICE_PING_SECONDS = 20
VOICE_IDLE_SECONDS = 45


class VoiceIdle(TimeoutError):
    pass


async def receive_frame(websocket: WebSocket) -> MutableMapping[str, Any]:
    try:
        return await asyncio.wait_for(websocket.receive(), timeout=VOICE_IDLE_SECONDS)
    except TimeoutError:
        raise VoiceIdle from None


async def offline_voice(
    websocket: WebSocket, runtime: CoachRuntime, principal: Principal, sid: str
) -> None:
    """Exercise the same socket contract without recording or interpreting audio."""
    total_audio = 0
    text_turns = 0
    while True:
        frame = await receive_frame(websocket)
        if frame["type"] == "websocket.disconnect":
            return
        audio = frame.get("bytes")
        if audio is not None:
            total_audio += len(audio)
            if (
                len(audio) > 32_768
                or len(audio) % 2
                or total_audio > runtime.settings.max_audio_bytes
            ):
                raise ValueError("Audio budget exceeded")
            continue
        text = frame.get("text", "")
        if len(text) > 5000:
            raise ValueError("Frame too large")
        command = VoiceControl.model_validate_json(text)
        if command.kind == "close":
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
        if command.kind == "text":
            text_turns += 1
            if text_turns > 12 or not command.text.strip():
                raise ValueError("Text turn limit exceeded")
            async for event in runtime.text_events(principal, sid, command.text, "en"):
                await websocket.send_json(event.payload())


async def gemini_voice(
    websocket: WebSocket, runtime: CoachRuntime, principal: Principal, sid: str
) -> None:
    queue = LiveRequestQueue()
    total_audio = 0
    text_turns = 0

    async def upstream() -> None:
        nonlocal total_audio, text_turns
        while True:
            frame = await receive_frame(websocket)
            if frame["type"] == "websocket.disconnect":
                return
            audio = frame.get("bytes")
            if audio is not None:
                total_audio += len(audio)
                if (
                    len(audio) > 32_768
                    or len(audio) % 2
                    or total_audio > runtime.settings.max_audio_bytes
                ):
                    raise ValueError("Audio budget exceeded")
                queue.send_realtime(types.Blob(data=audio, mime_type="audio/pcm;rate=16000"))
                continue
            raw = frame.get("text", "")
            if len(raw) > 5000:
                raise ValueError("Frame too large")
            command = VoiceControl.model_validate_json(raw)
            if command.kind == "close":
                return
            if command.kind == "ping":
                await websocket.send_json(StreamEvent(kind="pong").payload())
            if command.kind == "text":
                text_turns += 1
                if text_turns > 12 or not command.text.strip():
                    raise ValueError("Text turn limit exceeded")
                queue.send_content(
                    types.Content(role="user", parts=[types.Part(text=command.text)])
                )
            elif command.kind == "audio_end":
                queue.send_audio_stream_end()

    async def downstream() -> None:
        events = runtime.live_runner.run_live(
            user_id=principal.uid,
            session_id=sid,
            live_request_queue=queue,
            run_config=RunConfig(
                response_modalities=[types.Modality.AUDIO],
                max_llm_calls=8,
                input_audio_transcription=types.AudioTranscriptionConfig(),
                output_audio_transcription=types.AudioTranscriptionConfig(),
                save_live_blob=False,
            ),
        )
        try:
            async for event in events:
                for visible in public_events(event):
                    await websocket.send_json(visible.payload())
                    if visible.kind == "error":
                        return
                if event.content:
                    for part in event.content.parts or []:
                        blob = part.inline_data
                        if blob and blob.data and (blob.mime_type or "").startswith("audio/pcm"):
                            await websocket.send_json(
                                StreamEvent(
                                    kind="audio_format",
                                    sample_rate=24000,
                                ).payload()
                            )
                            await websocket.send_bytes(blob.data)
        finally:
            await events.aclose()

    tasks = [asyncio.create_task(upstream()), asyncio.create_task(downstream())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    finally:
        queue.close()
        for task in tasks:
            task.cancel()
        with anyio.CancelScope(shield=True):
            async with asyncio.timeout(5):
                await asyncio.gather(*tasks, return_exceptions=True)


async def serve_voice(
    websocket: WebSocket, runtime: CoachRuntime, principal: Principal, sid: str
) -> None:
    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(VOICE_PING_SECONDS)
            await websocket.send_json(StreamEvent(kind="ping").payload())

    tasks = [
        asyncio.create_task(heartbeat(), name=f"voice-ping:{sid}"),
        asyncio.create_task(
            offline_voice(websocket, runtime, principal, sid)
            if runtime.settings.coach_mode == "offline"
            else gemini_voice(websocket, runtime, principal, sid),
            name=f"voice-session:{sid}",
        ),
    ]
    code, reason = 1000, "Voice session ended"
    try:
        # Leave time for teardown before Cloud Run's 180-second request cap.
        async with asyncio.timeout(min(runtime.settings.max_voice_seconds, 150)):
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
    except WebSocketDisconnect:
        pass
    except VoiceIdle:
        code, reason = 1001, "VOICE_IDLE"
    except TimeoutError:
        code, reason = 1001, "SESSION_TIMEOUT"
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.send_json(StreamEvent(kind="error", code="SESSION_TIMEOUT").payload())
    except (ValueError, ValidationError, HTTPException):
        code, reason = 1008, "INVALID_FRAME"
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.send_json(StreamEvent(kind="error", code="INVALID_FRAME").payload())
    except Exception:
        code, reason = 1011, "PROVIDER_UNAVAILABLE"
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.send_json(
                StreamEvent(kind="error", code="PROVIDER_UNAVAILABLE").payload()
            )
    finally:
        for task in tasks:
            task.cancel()
        with anyio.CancelScope(shield=True):
            async with asyncio.timeout(5):
                await asyncio.gather(*tasks, return_exceptions=True)
            with suppress(RuntimeError, WebSocketDisconnect):
                await websocket.close(code=code, reason=reason)
