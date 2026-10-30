"""OB-155: public demo routes stay offline even beside a live owner app."""

import json
import socket
from collections.abc import Iterator
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import supply_io
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


def test_ob221_remaining_allowed_demo_routes_never_call_paid_ai(live_parent_demo, monkeypatch):
    """Every other ALLOWED sandbox route (app/public_demo.py) runs offline beside live flags."""
    client, parent_app, session, bid = live_parent_demo
    base = f"businesses/{bid}"
    # Rescue deals need a pickup time before closing: pin the clock to 10:00 in the shop.
    morning = datetime.now(ZoneInfo("Asia/Kolkata")).replace(hour=10, minute=0, second=0)
    monkeypatch.setattr("app.rescue.time", SimpleNamespace(time=lambda: morning.timestamp()))
    for path in (
        "reminders",
        "trust",
        "places/reverse?lat=12.96880&lng=77.63820",
        "places/pin?q=Indiranagar",
    ):
        response = owner(client, session, path)
        assert response.status_code == 200, (path, response.text)
    assert owner(client, session, "reminders", "PUT", json={"enabled": True}).status_code == 200
    menu = owner(client, session, f"{base}/inventory").json()
    item, sold_out = menu[0], menu[-1]
    for path, method, body in (
        (f"{base}/inventory/{sold_out['id']}/availability", "POST", {"available": False}),
        (f"{base}/freshness/confirm", "POST", None),
        (f"{base}/supply/demo/next", "POST", None),
        (
            f"{base}/day/prepare",
            "POST",
            {
                "date": date.today().isoformat(),
                "sales": [{"item": "Masala chai", "quantity": 2, "amount": 40}],
            },
        ),
        (f"{base}/playbook", "PATCH", {"summary": "Sample shop summary."}),
    ):
        response = owner(client, session, path, method, **({"json": body} if body else {}))
        assert response.status_code == 200, (path, response.status_code, response.text)
    rescue = owner(
        client,
        session,
        f"{base}/rescue",
        "POST",
        json={
            "items": [{"name": item["name"], "qty": 1}],
            "discount_pct": 30,
            "until": "11:00",
        },
    )
    assert rescue.status_code == 200, rescue.text
    approved = owner(
        client,
        session,
        f"{base}/rescue/{rescue.json()['id']}/approve",
        "POST",
        json={"digest": rescue.json()["digest"]},
    )
    assert approved.status_code == 200, approved.text
    assert (
        owner(client, session, f"{base}/rescue/{rescue.json()['id']}", "DELETE").status_code == 200
    )
    assert owner(client, session, f"{base}/supply/reorder", "POST", json={}).status_code == 200
    supply = owner(client, session, f"{base}/supply").json()
    incoming = next(o for o in supply["orders"] if o["status"] in {"dispatched", "invoiced"})
    received = owner(
        client,
        session,
        f"{base}/supply/orders/{incoming['id']}/received",
        "POST",
        json={"version": incoming["version"]},
    )
    assert received.status_code == 200, received.text
    entries = supply_io.inbox(parent_app.state.public_demos[session].store, bid)
    assert entries, "the demo supply chain should hold inbound documents"
    dismissed = owner(client, session, f"{base}/supply/inbox/{entries[0]['id']}/dismiss", "POST")
    assert dismissed.status_code == 200, dismissed.text
    imported = owner(
        client,
        session,
        f"{base}/import",
        "POST",
        content=b"item,price\nTea,10\n",
        headers={"Content-Type": "text/csv"},
    )
    assert imported.status_code == 200, imported.text
    proposal = imported.json()["proposal"]
    approve = owner(
        client,
        session,
        f"proposals/{proposal['id']}/approve",
        "POST",
        json={"digest": proposal["digest"]},
    )
    assert approve.status_code == 200, approve.text


def test_ob221_demo_world_is_not_reachable_from_the_sandbox(live_parent_demo, monkeypatch):
    """/demo/world would use the real WorldGenerator (Gemini) if demo_world_enabled were on."""
    client, parent_app, session, _ = live_parent_demo
    parent_app.state.v1_settings.demo_world_enabled = True
    generate = AsyncMock(side_effect=AssertionError("OB-221: real WorldGenerator called"))
    monkeypatch.setattr(parent_app.state.world_generator, "generate", generate)
    response = owner(client, session, "demo/world", "POST", json={"lat": 12.9, "lng": 77.6})
    assert response.status_code == 403, response.text
    generate.assert_not_called()


def test_ob221_order_flag_playbook_item_and_other_supply_actions_stay_offline(live_parent_demo):
    """Routes the allow-list admits but the tests above skip: each must reach its handler (never
    the sandbox's 403) and finish without a paid or network call (no_paid_calls guards that)."""
    client, _, session, bid = live_parent_demo
    base = f"businesses/{bid}"
    assert owner(client, session, f"{base}/supply/reorder", "POST", json={}).status_code == 200

    def settled(path: str, method: str, body: dict | None = None) -> int:
        response = owner(client, session, path, method, **({"json": body} if body else {}))
        assert response.status_code not in {403, 405} and response.status_code < 500, (
            path,
            response.status_code,
            response.text,
        )
        return response.status_code

    def newest() -> dict:
        orders = owner(client, session, f"{base}/supply").json()["orders"]
        return next(o for o in orders if o["status"] in {"dispatched", "invoiced"})

    order = newest()
    path = f"{base}/supply/orders/{order['id']}"
    line = {"line": 1, "quantity": 1.0}
    for action, body in (
        ("simulate", {"variant": "partial"}),
        ("inbound", {"text": "PO acknowledged: all lines confirmed for delivery"}),
        ("asn", {"shipped": [line]}),
        ("receipt", {"received": [line], "note": "ok"}),
        ("change", {"accept": True}),
        ("fix", {"fix": {"kind": "cash", "value": 10}}),
        ("accept", {}),
        ("approve", {}),
        ("cancel", {}),
    ):
        order = owner(client, session, path).json()
        settled(f"{path}/{action}", "POST", {"version": order["version"], **body})
    order = owner(client, session, path).json()
    flag_id = next((f["id"] for f in order.get("flags", []) if "id" in f), "flag-1")
    settled(f"{path}/flags/{flag_id}", "POST", {"version": order["version"], "value": "ok"})
    # Buyer-side sourcing orders: a missing order answers 404 from the handler itself.
    for action in ("read", "received", "discard"):
        settled(f"{base}/orders/order-x/{action}", "POST", {"version": 1})
    settled(f"{base}/playbook/items/item-x", "PATCH", {"text": "A sample note for the shop."})
