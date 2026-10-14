import asyncio
import json
from time import monotonic

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.agent import OfflineCoachModel
from app.auth import Principal
from app.contracts import StreamEvent
from app.main import create_app
from app.replay import MAX_EVENTS, REPLAY_TTL, ReplayStore, TurnReplay
from app.settings import Settings
from app.streaming import CoachRuntime


@pytest.mark.asyncio
async def test_disconnect_resumes_owned_turn_without_second_model_call(monkeypatch):
    calls = 0
    original = OfflineCoachModel.generate_content_async

    async def counted(self, *args, **kwargs):
        nonlocal calls
        calls += 1
        async for event in original(self, *args, **kwargs):
            yield event

    monkeypatch.setattr(OfflineCoachModel, "generate_content_async", counted)
    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    async with app.router.lifespan_context(app):
        services = app.state.services
        principal = Principal("resume-owner", "test")
        sid = await services.runtime.session(principal, None)
        cookie = services.identity.signer.dumps(principal.uid)
        payload = {"message": "Hello kopi stall", "session_id": sid}
        incoming = asyncio.Queue()
        incoming.put_nowait(
            {"type": "http.request", "body": json.dumps(payload).encode(), "more_body": False}
        )
        cursor = ""
        received = []

        async def send(message):
            nonlocal cursor
            chunk = message.get("body", b"").decode()
            received.append(chunk)
            if '"kind": "delta"' in chunk and not cursor:
                cursor = next(line[4:] for line in chunk.splitlines() if line.startswith("id: "))
                incoming.put_nowait({"type": "http.disconnect"})

        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.4"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/v1/coach/stream",
            "raw_path": b"/api/v1/coach/stream",
            "query_string": b"",
            "root_path": "",
            "headers": [
                (b"content-type", b"application/json"),
                (b"cookie", f"ogoogle_preview_session={cookie}".encode()),
            ],
            "server": ("127.0.0.1", 3300),
            "client": ("127.0.0.1", 12345),
        }
        await asyncio.wait_for(app(scope, incoming.get, send), timeout=3)
        assert cursor
        assert services.registry.active  # Producer is owned by the turn, not its subscriber.
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            headers = {"Last-Event-ID": cursor, "Cookie": f"ogoogle_preview_session={cookie}"}
            response = await client.post("/api/v1/coach/stream", json=payload, headers=headers)
            assert response.status_code == 200
            frames = [
                json.loads(line[6:])
                for line in response.text.splitlines()
                if line.startswith("data: ")
            ]
            assert frames[-1]["kind"] == "turn_complete"
            assert "scripted reply" in next(
                item["text"] for item in frames if item["kind"] == "reply"
            )
            assert all(item["kind"] != "ready" for item in frames)
            ids = [line[4:] for line in response.text.splitlines() if line.startswith("id: ")]
            assert all(
                int(value.rsplit(":", 1)[1]) > int(cursor.rsplit(":", 1)[1]) for value in ids
            )
            other_cookie = services.identity.signer.dumps("another-owner")
            headers["Cookie"] = f"ogoogle_preview_session={other_cookie}"
            assert (
                await client.post("/api/v1/coach/stream", json=payload, headers=headers)
            ).status_code == 409
            headers["Cookie"] = f"ogoogle_preview_session={cookie}"
            headers["Last-Event-ID"] = "old-turn:1"
            assert (
                await client.post("/api/v1/coach/stream", json=payload, headers=headers)
            ).status_code == 409
            services.replay.turns[(principal.uid, sid)].finished = monotonic() - REPLAY_TTL - 1
            headers["Last-Event-ID"] = cursor
            assert (
                await client.post("/api/v1/coach/stream", json=payload, headers=headers)
            ).status_code == 409
        assert calls == 1
        assert not services.registry.active
        assert not any(task.get_name() == "adk-text-producer" for task in asyncio.all_tasks())


def test_heartbeat_during_silent_turn_and_timeout_cleanup(monkeypatch):
    closed = []

    async def stalled(self, *args):
        try:
            await asyncio.Event().wait()
            yield StreamEvent(kind="reply", text="Unreachable")
        finally:
            closed.append(True)

    monkeypatch.setattr(CoachRuntime, "text_events", stalled)
    monkeypatch.setattr("app.main.SSE_HEARTBEAT_SECONDS", 0.02)
    app = create_app(
        Settings(app_env="test", max_turn_seconds=1, _env_file=None), InMemorySessionService()
    )
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        response = client.post("/api/v1/coach/stream", json={"message": "Hello"})
        assert ": heartbeat" in response.text
        assert "TURN_TIMEOUT" in response.text
        assert closed == [True]
        assert not app.state.services.registry.active


def test_replay_bounds_cursor_and_business_scope():
    turn = TurnReplay(None)
    for _ in range(MAX_EVENTS + 2):
        turn.append(StreamEvent(kind="delta", text="x"))
    assert len(turn.events) == MAX_EVENTS
    with pytest.raises(HTTPException):
        turn.cursor(f"{turn.turn_id}:1")
    store = ReplayStore()
    store.turns[("owner", "sid")] = turn
    with pytest.raises(HTTPException):
        store.resume("owner", "sid", "other-business", f"{turn.turn_id}:3")


@pytest.mark.parametrize("idle", [True, False])
def test_voice_ping_pong_and_reasoned_timeout_cleanup(monkeypatch, idle):
    monkeypatch.setattr("app.voice.VOICE_PING_SECONDS", 0.02)
    monkeypatch.setattr("app.voice.VOICE_IDLE_SECONDS", 0.08 if idle else 5)
    app = create_app(
        Settings(app_env="test", max_voice_seconds=1, _env_file=None), InMemorySessionService()
    )
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        with client.websocket_connect(
            "/api/v1/voice", headers={"origin": "http://127.0.0.1:3200"}
        ) as socket:
            assert socket.receive_json()["kind"] == "ready"
            assert socket.receive_json()["kind"] == "ping"
            if not idle:
                socket.send_json({"kind": "pong"})
            while True:
                message = socket.receive()
                if message["type"] == "websocket.close":
                    assert message["code"] == 1001
                    assert message["reason"] == ("VOICE_IDLE" if idle else "SESSION_TIMEOUT")
                    break
        assert not app.state.services.registry.active
