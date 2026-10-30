"""OB-155: public demo routes stay offline even beside a live owner app."""

import json
import socket
from collections.abc import Iterator
from datetime import date
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from tests.test_photos import app, jpeg  # noqa: F401
from tests.test_public_demo import open_demo, owner, read


@pytest.fixture
def no_paid_calls(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[str]]:
    """Record attempts before raising: a caught provider error must still fail the test."""
    attempts: list[str] = []

    def forbid(name: str):
        def blocked(*args, **kwargs):
            attempts.append(name)
            raise AssertionError(f"OB-155: forbidden provider or network call: {name}")

        return blocked

    for target in (
        "google.genai.Client",
        "google.cloud.vision.ImageAnnotatorClient",
        "google.cloud.texttospeech.TextToSpeechClient",
        "google.cloud.storage.Client",
        "app.forecast.BigQueryClient.query",
        "socket.getaddrinfo",
        "httpx.HTTPTransport.handle_request",
    ):
        monkeypatch.setattr(target, forbid(target))
    # Windows implements asyncio's internal socketpair with a loopback TCP connection.
    # Permit only that local transport; all non-loopback destinations remain forbidden.
    for method in ("connect", "connect_ex"):
        original = getattr(socket.socket, method)
        blocked = forbid(f"socket.socket.{method}")

        def connect(sock, address, *, original=original, blocked=blocked):
            if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1"}:
                return original(sock, address)
            return blocked(sock, address)

        monkeypatch.setattr(socket.socket, method, connect)
    # TestClient uses its in-process transport, so neither guard prevents local API tests.
    for target in (
        "httpx.AsyncHTTPTransport.handle_async_request",
        "google.adk.models.google_llm.Gemini.generate_content_async",
    ):
        monkeypatch.setattr(target, AsyncMock(side_effect=forbid(target)))
    yield attempts
    assert attempts == [], f"OB-155: attempted paid/network calls: {attempts}"


@pytest.fixture
def live_parent_demo(app, no_paid_calls):  # noqa: F811
    # Start with the normal offline fixture (no credentials and no environment file).
    with TestClient(app) as client:
        settings = app.state.v1_settings
        # Then simulate the hosted owner's live flags. The demo must override these itself;
        # merely running every test with COACH_MODE=offline cannot prove that isolation.
        for name, value in {
            "public_demo_enabled": True,
            "coach_mode": "gemini",
            "forecast_backend": "bigquery",
            "analytics_backend": "bigquery",
            "document_ai_enabled": True,
            "moderation_mode": "vision",
            "media_bucket": "ob155-unused-bucket",
            "weather_backend": "open_meteo",
            "pos_live": "live",
            "maps_grounding": "live",
            "shop_icon_ai": True,
            "supply_sap_live": True,
            "search_embeddings": "vertex",
            "search_explanations": True,
            "instant_embeddings": True,
            "context_cache_enabled": True,
            "gemini_context_cache": True,
        }.items():
            setattr(settings, name, value)
        # Parent service instances share these settings. Build the sandbox only after the
        # live flags are set, so a prebuilt offline cache cannot hide a missing override.
        assert not hasattr(app.state, "demo_offline")
        app.state.services.runtime.session = AsyncMock(side_effect=AssertionError("live session"))
        made = open_demo(client)
        assert made.status_code == 200, made.text
        session = made.json()["session_id"]
        bid = owner(client, session, "businesses").json()[0]["id"]
        yield client, app, session, bid
        app.state.services.runtime.session.assert_not_called()
        assert client.delete(f"/api/v1/demo/sessions/{session}").status_code == 200
        assert session not in app.state.public_demos


def test_ob155_demo_reads_and_writes_never_call_paid_ai(live_parent_demo):
    client, parent_app, session, bid = live_parent_demo
    year, week, _ = date.today().isocalendar()
    for path in (
        "bootstrap",
        "conversations",
        f"demo/chain/{bid}",
        f"businesses/{bid}/inventory",
        f"businesses/{bid}/forecast",
        f"businesses/{bid}/analytics",
        f"businesses/{bid}/brief",
        f"businesses/{bid}/recap?week={year}-W{week:02d}",
        f"businesses/{bid}/playbook",
        f"businesses/{bid}/playbook/today",
        f"businesses/{bid}/rescue/suggestions",
        f"businesses/{bid}/supply",
        f"businesses/{bid}/supply/sap-sandbox",
    ):
        response = owner(client, session, path)
        assert response.status_code == 200, (path, response.text)
    reordered = owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={})
    assert reordered.status_code == 200, reordered.text
    shops = read(client, session, "/shops").json()
    for shop in shops:
        response = read(client, session, f"/public/shops/{shop['id']}")
        assert response.status_code == 200 and response.json()["demo"] is True
    # Unknown prompts also exercise the fixture model, beyond the instant answer rules.
    for message in ("Forecast demand for Masala chai", "Explain a curious purple teapot"):
        response = client.post(f"/api/v1/demo/sessions/{session}/coach", json={"message": message})
        assert response.status_code == 200, response.text
        events = [
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        ]
        assert events[0]["kind"] == "ready" and events[0]["mode"] == "offline"
        assert events[-1]["kind"] == "turn_complete"
        assert not any(event["kind"] == "error" for event in events)
    assert parent_app.state.v1_settings.coach_mode == "gemini"


@pytest.mark.parametrize("kind", ["sales", "stock_count", "delivery"])
def test_ob155_demo_document_photos_use_only_fixtures(live_parent_demo, kind):
    client, _, session, bid = live_parent_demo
    response = owner(
        client,
        session,
        f"businesses/{bid}/day/read?kind={kind}",
        "POST",
        content=jpeg(),
        headers={"Content-Type": "image/jpeg"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["reader"] == "fixture"
    assert response.json()["fixture"] is True
    assert response.json()["lines"]


@pytest.mark.parametrize("path", ["photos", "photos/classify"])
def test_ob155_demo_menu_photos_return_the_sample_menu_without_a_model(live_parent_demo, path):
    # Since the owner demo walk-through (O-1..O-4) the demo reads a menu photo as a fixed
    # sample. A real JPEG must never reach the vision/Gemini reader (no_paid_calls guards it).
    client, _, session, bid = live_parent_demo
    response = owner(
        client,
        session,
        f"{path}?business_id={bid}",
        "POST",
        content=jpeg(),
        headers={"Content-Type": "image/jpeg"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["sample"] is True


@pytest.mark.parametrize("path", ["tts", "voice", "discover/ask"])
def test_ob155_demo_paid_upload_and_speech_routes_are_denied(live_parent_demo, path):
    client, _, session, bid = live_parent_demo
    response = owner(client, session, f"{path}?business_id={bid}", "POST", content=jpeg())
    assert response.status_code == 403
    assert response.json()["detail"] == "DEMO_NOT_SENT"


def test_ob155_demo_voice_cannot_open_an_owned_live_session(live_parent_demo):
    client, parent_app, session, bid = live_parent_demo
    # The browser mic uses the ordinary voice URL with the sandbox business ID. A visitor
    # (even one already signed in) does not own that sandbox in the real merchant store.
    with client.websocket_connect(
        f"/api/v1/voice?business_id={bid}", headers={"origin": "http://127.0.0.1:3200"}
    ) as websocket:
        frame = websocket.receive_json()
        assert frame["kind"] == "error" and frame["code"] == "AUTH_OR_SESSION_ERROR"
        with pytest.raises(WebSocketDisconnect) as closed:
            websocket.receive_json()
        assert closed.value.code == 1008
    # The session-specific proxy cannot tunnel WebSockets to the live route either.
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/v1/demo/sessions/{session}/api/voice"):
            pytest.fail("OB-155: the demo proxy accepted a voice WebSocket")
    parent_app.state.services.runtime.session.assert_not_called()
