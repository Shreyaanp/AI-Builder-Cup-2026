import json
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect

from app.agent import prepare_business_draft
from app.limits import RunRegistry
from app.main import create_app
from app.settings import Settings

ORIGIN = {"origin": "http://127.0.0.1:3200"}


def test_settings_fail_closed_for_production_and_live_mode() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="production", _env_file=None)
    with pytest.raises(ValidationError):
        Settings(coach_mode="gemini", _env_file=None)


def test_sse_uses_real_adk_and_isolates_session_ownership() -> None:
    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    with TestClient(app) as client:
        assert client.get("/api/v1/health").json()["product"] == "oGoogle AI"
        assert client.post("/api/v1/coach/stream", json={"message": "Hello"}).status_code == 401
        client.get("/api/v1/bootstrap")
        response = client.post(
            "/api/v1/coach/stream", json={"message": "My tea shop", "language": "en"}
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["cache-control"] == "no-store"
        events = [
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        ]
        assert events[0]["kind"] == "ready"
        sid = events[0]["session_id"]
        assert sum(event["kind"] == "delta" for event in events) > 3
        assert "scripted reply" in next(
            event["text"] for event in events if event["kind"] == "reply"
        )
        assert events[-1]["kind"] == "turn_complete"
        own = client.cookies.get("ogoogle_preview_session")
        client.cookies.clear()
        client.get("/api/v1/bootstrap")
        assert (
            client.post(
                "/api/v1/coach/stream", json={"message": "Read", "session_id": sid}
            ).status_code
            == 404
        )
        client.cookies.clear()
        client.cookies.set("ogoogle_preview_session", own)
        response = client.post("/api/v1/coach/stream", json={"message": "Again", "session_id": sid})
        assert response.status_code == 200
        assert sid in response.text


def test_input_limits_origin_and_unknown_fields() -> None:
    with TestClient(
        create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    ) as client:
        client.get("/api/v1/bootstrap")
        for payload in [
            {"message": " "},
            {"message": "x" * 2001},
            {"message": "Hi", "user_id": "other"},
        ]:
            assert client.post("/api/v1/coach/stream", json=payload).status_code == 422
        assert (
            client.post(
                "/api/v1/coach/stream",
                json={"message": "hi"},
                headers={"origin": "https://bad.example"},
            ).status_code
            == 403
        )
        assert client.post("/api/v1/coach/stream", content="x" * 17000).status_code == 413
        assert (
            client.post(
                "/api/v1/coach/stream", json={"message": "hi", "session_id": str(uuid4())}
            ).status_code
            == 404
        )


def test_voice_text_and_binary_transport_and_disconnect_cleanup() -> None:
    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        with client.websocket_connect("/api/v1/voice", headers=ORIGIN) as socket:
            assert socket.receive_json()["kind"] == "ready"
            socket.send_bytes(b"\x00\x00" * 160)
            socket.send_json({"kind": "audio_end"})
            assert "No speech recognition" in socket.receive_json()["text"]
            assert socket.receive_json()["kind"] == "turn_complete"
            socket.send_json({"kind": "text", "text": "My shop"})
            while socket.receive_json()["kind"] != "turn_complete":
                pass
            socket.send_json({"kind": "close"})
        assert not app.state.services.registry.active


def test_voice_rejects_origin_auth_and_invalid_frames() -> None:
    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                "/api/v1/voice", headers={"origin": "https://bad.example"}
            ):
                pass
        with client.websocket_connect("/api/v1/voice", headers=ORIGIN) as socket:
            assert socket.receive_json()["kind"] == "error"
        client.get("/api/v1/bootstrap")
        with client.websocket_connect("/api/v1/voice", headers=ORIGIN) as socket:
            socket.receive_json()
            socket.send_bytes(b"\x00")
            assert socket.receive_json()["code"] == "INVALID_FRAME"
        assert not app.state.services.registry.active


def test_registry_limits_and_old_cleanup_cannot_release_new_run() -> None:
    registry = RunRegistry(1)
    lease = registry.acquire("user", "session")
    with pytest.raises(HTTPException) as error:
        registry.acquire("user", "session")
    assert error.value.status_code == 409
    with pytest.raises(HTTPException) as error:
        registry.acquire("other", "another")
    assert error.value.status_code == 429
    registry.release(lease)
    new = registry.acquire("user", "session")
    registry.release(lease)
    assert registry.active
    registry.release(new)


def test_agent_tools_only_prepare_unverified_proposals() -> None:
    assert prepare_business_draft("Tea", "Tea stall", "Pune")["status"] == "needs_review"
    assert prepare_business_draft("", "Tea stall", "Pune")["status"] == "needs_input"


def test_live_adk_bridge_forwards_pcm_and_cleans_up_without_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Validate the actual run_live adapter using a substituted SDK event source.
    # No model, key, microphone or provider request is involved.
    import asyncio

    from google.adk.events import Event
    from google.adk.runners import Runner

    received: list[bytes] = []
    queues: list[object] = []

    async def fake_live(self: Runner, **kwargs: object):
        queue = kwargs["live_request_queue"]
        queues.append(queue)
        request = await queue.get()
        received.append(request.blob.data)
        yield Event(
            author="business_coach",
            content=types.Content(role="model", parts=[types.Part(text="Fixture reply")]),
            partial=True,
        )
        yield Event(author="business_coach", interrupted=True)
        yield Event(
            author="business_coach",
            content=types.Content(
                role="model",
                parts=[types.Part(inline_data=types.Blob(data=b"\x01\x00", mime_type="audio/pcm"))],
            ),
        )
        await asyncio.Event().wait()

    monkeypatch.setattr(Runner, "run_live", fake_live)
    settings = Settings(app_env="test", _env_file=None)
    app = create_app(settings, InMemorySessionService())
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        # Construct runners in offline mode, then exercise only the live bridge.
        app.state.services.runtime.settings.coach_mode = "gemini"
        with client.websocket_connect("/api/v1/voice", headers=ORIGIN) as socket:
            assert socket.receive_json()["kind"] == "ready"
            audio = b"\x00\x00" * 80
            socket.send_bytes(audio)
            assert socket.receive_json()["text"] == "Fixture reply"
            assert socket.receive_json()["kind"] == "interrupted"
            assert socket.receive_json()["sample_rate"] == 24000
            assert socket.receive_bytes() == b"\x01\x00"
            socket.send_json({"kind": "close"})
        assert received == [audio]
        assert queues[0].closed
        assert not app.state.services.registry.active
