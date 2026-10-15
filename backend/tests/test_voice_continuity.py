import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.adk.events import Event
from google.adk.sessions import InMemorySessionService

from app.auth import Principal
from app.main import create_app
from app.settings import Settings
from app.streaming import APP_NAME, CoachRuntime

ORIGIN = {"origin": "http://127.0.0.1:3200"}


def text_turn(client: TestClient, **body: object) -> list[dict]:
    response = client.post("/api/v1/coach/stream", json={"message": "Hello", **body})
    assert response.status_code == 200
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


def test_voice_joins_text_conversation_and_preserves_history_after_disconnect() -> None:
    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        sid = text_turn(client)[0]["session_id"]
        for _ in range(2):
            with client.websocket_connect(f"/api/v1/voice?session_id={sid}", headers=ORIGIN) as ws:
                ready = ws.receive_json()
                assert ready["session_id"] == sid
                assert "code" not in ready
                ws.send_json({"kind": "text", "text": "Voice transport fixture"})
                while ws.receive_json()["kind"] != "turn_complete":
                    pass
            assert not app.state.services.registry.active
        history = client.get(f"/api/v1/conversations/{sid}").json()["messages"]
        assert sum(item["text"] == "Voice transport fixture" for item in history) == 2
        assert len(client.get("/api/v1/conversations").json()) == 1


@pytest.mark.parametrize("transport", ["voice", "text"])
def test_full_conversation_rolls_over_and_keeps_old_history(
    monkeypatch: pytest.MonkeyPatch, transport: str
) -> None:
    monkeypatch.setattr("app.streaming.MAX_EVENTS", 2)
    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        sid = text_turn(client)[0]["session_id"]
        before = client.get(f"/api/v1/conversations/{sid}").json()
        if transport == "voice":
            with client.websocket_connect(f"/api/v1/voice?session_id={sid}", headers=ORIGIN) as ws:
                ready = ws.receive_json()
                ws.send_bytes(b"\x00\x00" * 160)
                ws.send_json({"kind": "audio_end"})
                assert ws.receive_json()["kind"] == "reply"
                assert ws.receive_json()["kind"] == "turn_complete"
        else:
            ready = text_turn(client, session_id=sid)[0]
        assert ready["kind"] == "ready"
        assert ready["code"] == "CONVERSATION_ROLLED_OVER"
        assert ready["session_id"] != sid
        assert client.get(f"/api/v1/conversations/{sid}").json() == before
        assert len(client.get("/api/v1/conversations").json()) == 2
        assert not app.state.services.registry.active


def test_voice_cannot_join_or_roll_over_another_owners_conversation() -> None:
    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        sid = text_turn(client)[0]["session_id"]
        client.cookies.clear()
        client.get("/api/v1/bootstrap")
        with client.websocket_connect(f"/api/v1/voice?session_id={sid}", headers=ORIGIN) as ws:
            assert ws.receive_json()["code"] == "AUTH_OR_SESSION_ERROR"
        assert client.get("/api/v1/conversations").json() == []


def test_voice_rate_limit_includes_actual_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    async def limited(*args: object, **kwargs: object) -> None:
        raise HTTPException(429, "RATE_LIMITED", headers={"Retry-After": "137"})

    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        monkeypatch.setattr("app.main.enforce_limits", limited)
        with client.websocket_connect("/api/v1/voice", headers=ORIGIN) as ws:
            assert ws.receive_json() == {
                "kind": "error",
                "code": "RATE_LIMITED",
                "data": {"retry_after": 137},
            }
        assert not app.state.services.registry.active


@pytest.mark.asyncio
async def test_full_session_rollover_preserves_shop_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.streaming.MAX_EVENTS", 1)
    sessions = InMemorySessionService()
    runtime = CoachRuntime(Settings(_env_file=None), sessions)
    owner = Principal("owner", "local")
    sid = await runtime.session(owner, None, "shop-1")
    session = await sessions.get_session(app_name=APP_NAME, user_id=owner.uid, session_id=sid)
    assert session is not None
    await sessions.append_event(session, Event(author="user"))
    with pytest.raises(HTTPException) as error:
        await runtime.session(owner, sid, "shop-2")
    assert error.value.status_code == 404
    next_sid = await runtime.session(owner, sid, "shop-1")
    assert next_sid != sid
    next_session = await sessions.get_session(
        app_name=APP_NAME, user_id=owner.uid, session_id=next_sid
    )
    assert next_session is not None and next_session.state["business_id"] == "shop-1"
    assert await runtime.session(owner, next_sid, "shop-1") == next_sid
