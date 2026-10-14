import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.events import Event
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.auth import Principal
from app.contracts import StreamEvent
from app.main import create_app
from app.settings import Settings
from app.streaming import CoachRuntime, public_events


def test_provider_error_is_redacted_and_releases_lease(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failure(self: CoachRuntime, *args: object):
        yield StreamEvent(kind="delta", text="A partial reply")
        raise RuntimeError("provider-secret-should-never-leak")

    monkeypatch.setattr(CoachRuntime, "text_events", failure)
    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        response = client.post("/api/v1/coach/stream", json={"message": "Hi"})
        assert "PROVIDER_UNAVAILABLE" in response.text
        assert "provider-secret" not in response.text
        assert not app.state.services.registry.active


def test_turn_timeout_closes_generator_and_releases_lease(monkeypatch: pytest.MonkeyPatch) -> None:
    closed = []

    async def stalled(self: CoachRuntime, *args: object):
        try:
            yield StreamEvent(kind="delta", text="Waiting")
            await asyncio.Event().wait()
        finally:
            closed.append(True)

    monkeypatch.setattr(CoachRuntime, "text_events", stalled)
    app = create_app(
        Settings(app_env="test", max_turn_seconds=1, _env_file=None), InMemorySessionService()
    )
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        response = client.post("/api/v1/coach/stream", json={"message": "Hi"})
        assert "TURN_TIMEOUT" in response.text
        assert closed == [True]
        assert not app.state.services.registry.active


def test_chunked_body_limit_and_forged_cookie() -> None:
    with TestClient(
        create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    ) as client:
        client.cookies.set("ogoogle_preview_session", "forged")
        assert client.post("/api/v1/coach/stream", json={"message": "Hi"}).status_code == 401
        response = client.post("/api/v1/coach/stream", content=iter([b"x" * 9000, b"x" * 9000]))
        assert response.status_code == 413
        assert response.headers["cache-control"] == "no-store"


def test_public_events_hide_thoughts_and_user_text() -> None:
    event = Event(
        author="business_coach",
        content=types.Content(
            role="model",
            parts=[
                types.Part(text="private reasoning", thought=True),
                types.Part(text="Hello "),
                types.Part(text="shopkeeper"),
            ],
        ),
    )
    assert [part.text for part in public_events(event)] == ["Hello shopkeeper"]
    assert (
        public_events(
            Event(
                author="user", content=types.Content(role="user", parts=[types.Part(text="input")])
            )
        )
        == []
    )
    assert public_events(Event(author="business_coach", interrupted=True))[0].kind == "interrupted"


def test_sqlite_adk_session_survives_application_restart(tmp_path: Path) -> None:
    settings = Settings(
        app_env="test",
        session_database_url=f"sqlite+aiosqlite:///{(tmp_path / 'sessions.sqlite3').as_posix()}",
        session_signing_secret="test-fixture-secret-never-a-production-credential",
        _env_file=None,
    )
    first = create_app(settings)
    with TestClient(first) as client:
        principal = Principal("restart-test", "test")
        sid = client.portal.call(first.state.services.runtime.session, principal, None)
    second = create_app(settings)
    with TestClient(second) as client:
        assert client.portal.call(second.state.services.runtime.session, principal, sid) == sid


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["ready", "delta"])
async def test_sse_disconnect_finishes_owned_turn_preserves_sqlite_and_allows_next_turn(
    tmp_path: Path, phase: str
) -> None:
    settings = Settings(
        app_env="test",
        session_database_url=f"sqlite+aiosqlite:///{(tmp_path / 'cancel.sqlite3').as_posix()}",
        _env_file=None,
    )
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        services = app.state.services
        principal = Principal("disconnect-test", "test")
        sid = await services.runtime.session(principal, None)
        cookie = services.identity.signer.dumps(principal.uid)
        body = json.dumps({"message": "Help my tea shop", "session_id": sid}).encode()
        incoming = asyncio.Queue()
        incoming.put_nowait({"type": "http.request", "body": body, "more_body": False})
        disconnected = False

        async def send(message: dict) -> None:
            nonlocal disconnected
            if ('"kind": "' + phase + '"').encode() in message.get(
                "body", b""
            ) and not disconnected:
                disconnected = True
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
        assert disconnected
        turn = services.replay.turns[(principal.uid, sid)]
        assert turn.task is not None
        await asyncio.wait_for(turn.task, timeout=3)
        assert not services.registry.active
        assert await services.runtime.session(principal, sid) == sid
        events = [
            event async for event in services.runtime.text_events(principal, sid, "Next turn", "en")
        ]
        assert events[-1].kind == "turn_complete"
        assert not any(task.get_name() == "adk-text-producer" for task in asyncio.all_tasks())
