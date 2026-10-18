"""Every voice close logs how the Live provider closed its connection (code and reason), so a
409 or 1011 in production can be told apart from a normal 1000."""

import asyncio
import contextlib
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.adk.agents import LlmAgent
from google.adk.events import Event
from google.adk.models.google_llm import Gemini
from google.adk.models.llm_request import LlmRequest
from google.genai import types
from starlette.websockets import WebSocketDisconnect
from structlog.testing import capture_logs

from app.agent import LiveClose, LiveGemini, live_close
from app.main import create_app
from app.settings import Settings
from app.voice import VoiceStats

ORIGIN = {"origin": "http://127.0.0.1:3200"}


def connection(code: int | None, reason: str | None = None) -> Any:
    return SimpleNamespace(
        _gemini_session=SimpleNamespace(_ws=SimpleNamespace(close_code=code, close_reason=reason))
    )


@pytest.fixture
def fake_connect(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    """The base Gemini.connect, yielding whatever connection the test puts in the list."""
    made: list[Any] = []

    @contextlib.asynccontextmanager
    async def connect(self: Gemini, llm_request: LlmRequest) -> AsyncIterator[Any]:
        yield made[0]

    monkeypatch.setattr(Gemini, "connect", connect)
    return made


@pytest.mark.asyncio
async def test_live_connection_notes_the_providers_close(fake_connect: list[Any]) -> None:
    record = LiveClose()
    token = live_close.set(record)
    try:
        model = LiveGemini(model="live")
        fake_connect.append(connection(1011, "Internal error encountered." * 20))
        async with model.connect(LlmRequest(model="live")):
            pass
        assert (record.code, record.by) == (1011, "provider")
        assert record.reason.startswith("Internal error encountered.")
        assert len(record.reason) == 200

        # The provider's close surfacing as an error (ADK re-raises abnormal closes).
        fake_connect[0] = connection(1008, "409 conflict")
        with pytest.raises(RuntimeError):
            async with model.connect(LlmRequest(model="live")):
                raise RuntimeError("closed")
        assert (record.code, record.reason, record.by) == (1008, "409 conflict", "provider")

        # This side ends the connection first: no provider code.
        fake_connect[0] = connection(None)
        async with model.connect(LlmRequest(model="live")):
            pass
        assert (record.code, record.reason, record.by) == (None, "", "app")
    finally:
        live_close.reset(token)


@pytest.mark.asyncio
async def test_no_record_outside_a_voice_socket(fake_connect: list[Any]) -> None:
    fake_connect.append(connection(1000, ""))
    async with LiveGemini(model="live").connect(LlmRequest(model="live")):
        pass
    assert live_close.get() is None


def test_voice_stats_fields_carry_the_provider_close() -> None:
    stats = VoiceStats()
    assert stats.fields() | {"seconds": 0} == {
        "reason": "unknown",
        "seconds": 0,
        "turns": 0,
        "tool_calls": 0,
        "rotations": 0,
        "provider_code": None,
        "provider_reason": "",
        "closed_by": "none",
    }
    stats.provider.code, stats.provider.reason, stats.provider.by = 1000, "", "provider"
    assert stats.provider_fields() == {
        "provider_code": 1000,
        "provider_reason": "",
        "closed_by": "provider",
    }


def test_voice_closed_logs_the_providers_close_code(monkeypatch: pytest.MonkeyPatch) -> None:
    # The real live runner with the model replaced. The fake notes a provider close from inside
    # ADK's tasks, as LiveGemini.connect does: the socket's record must reach them.
    async def fake_live(self: LlmAgent, ctx: Any):
        yield Event(
            author="business_coach",
            content=types.Content(role="model", parts=[types.Part(text="hello")]),
        )
        record = live_close.get()
        assert record is not None
        record.note(connection(1011, "The service is currently unavailable."))
        await asyncio.Event().wait()

    monkeypatch.setattr(LlmAgent, "_run_live_impl", fake_live)
    app = create_app(Settings(app_env="test", _env_file=None))
    with capture_logs() as logs, TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        app.state.services.runtime.settings.coach_mode = "gemini"
        with client.websocket_connect("/api/v1/voice", headers=ORIGIN) as socket:
            assert socket.receive_json()["kind"] == "ready"
            assert socket.receive_json()["text"] == "hello"
            socket.send_json({"kind": "close"})
            with pytest.raises(WebSocketDisconnect):
                while True:
                    socket.receive_json()
    closed = [entry for entry in logs if entry["event"] == "voice_closed"]
    assert len(closed) == 1
    assert closed[0]["reason"] == "client_close"
    assert closed[0]["provider_code"] == 1011
    assert closed[0]["provider_reason"] == "The service is currently unavailable."
    assert closed[0]["closed_by"] == "provider"


def test_offline_voice_close_logs_no_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    app = create_app(Settings(app_env="test", _env_file=None))
    with capture_logs() as logs, TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        with client.websocket_connect("/api/v1/voice", headers=ORIGIN) as socket:
            assert socket.receive_json()["kind"] == "ready"
            socket.send_json({"kind": "close"})
            with pytest.raises(WebSocketDisconnect):
                while True:
                    socket.receive_json()
    closed = [entry for entry in logs if entry["event"] == "voice_closed"]
    assert [(c["provider_code"], c["closed_by"]) for c in closed] == [(None, "none")]
