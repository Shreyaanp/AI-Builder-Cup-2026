import asyncio
from contextlib import suppress

from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from google.adk.agents.run_config import RunConfig
from google.adk.live.live_request_queue import LiveRequestQueue
from google.genai import types
from pydantic import ValidationError

from .auth import Principal
from .contracts import StreamEvent, VoiceControl
from .streaming import CoachRuntime, public_events


async def offline_voice(
    websocket: WebSocket, runtime: CoachRuntime, principal: Principal, sid: str
) -> None:
    """Exercise the same socket contract without recording or interpreting audio."""
    total_audio = 0
    text_turns = 0
    while True:
        frame = await websocket.receive()
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
            frame = await websocket.receive()
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
        await asyncio.gather(*tasks, return_exceptions=True)


async def serve_voice(
    websocket: WebSocket, runtime: CoachRuntime, principal: Principal, sid: str
) -> None:
    try:
        async with asyncio.timeout(runtime.settings.max_voice_seconds):
            if runtime.settings.coach_mode == "offline":
                await offline_voice(websocket, runtime, principal, sid)
            else:
                await gemini_voice(websocket, runtime, principal, sid)
    except WebSocketDisconnect:
        pass
    except TimeoutError:
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.send_json(StreamEvent(kind="error", code="SESSION_TIMEOUT").payload())
    except (ValueError, ValidationError, HTTPException):
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.send_json(StreamEvent(kind="error", code="INVALID_FRAME").payload())
    except Exception:
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.send_json(
                StreamEvent(kind="error", code="PROVIDER_UNAVAILABLE").payload()
            )
