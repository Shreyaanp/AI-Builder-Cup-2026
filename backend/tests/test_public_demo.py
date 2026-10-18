"""Public demos never acquire an owner identity or use the durable merchant repository."""

import time
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi.testclient import TestClient

from tests.test_photos import app  # noqa: F401


def open_demo(client: TestClient):
    return client.post("/api/v1/demo/workspace?public=true&zone=Asia/Kolkata")


def read(client: TestClient, session: str, path: str):
    return client.get(f"/api/v1/demo/sessions/{session}", params={"path": path})


def owner(client: TestClient, session: str, path: str, method: str = "GET", **kwargs):
    return client.request(method, f"/api/v1/demo/sessions/{session}/api/{path}", **kwargs)


def test_public_demo_is_off_by_default(app):  # noqa: F811
    with TestClient(app) as client:
        assert open_demo(client).status_code == 404
        assert read(client, "missing", "/shops").status_code == 404
        assert owner(client, "missing", "businesses").status_code == 404


def test_demo_is_the_full_owner_app_on_a_private_sandbox(app, monkeypatch):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.v1_settings.forecast_backend = "bigquery"
        provider = AsyncMock(side_effect=AssertionError("live forecast"))
        monkeypatch.setattr("app.forecast.BigQueryClient.query", provider)
        app.state.services.identity.require = AsyncMock(side_effect=AssertionError("identity"))
        app.state.merchant = Mock()  # Any use of the real merchant repository fails this test.
        made = open_demo(client)
        assert made.status_code == 200, made.text
        session = made.json()["session_id"]
        assert time.time() < made.json()["expires_at"] <= time.time() + 900
        businesses = owner(client, session, "businesses").json()
        business = businesses[0]
        assert business["fields"]["name"] == "Lantern Chai Corner (Demo)"
        assert business["fields"]["currency"] == "INR"
        assert business["public"] is False
        assert {"demo-chain-freshmart", "demo-chain-metro-foods"} <= {b["id"] for b in businesses}
        bid = business["id"]
        inventory = owner(client, session, f"businesses/{bid}/inventory").json()
        sales = owner(client, session, f"businesses/{bid}/sales").json()
        assert len(sales) >= 42 * len(inventory)
        assert owner(client, session, f"businesses/{bid}/forecast").json()["status"] == "ready"
        supply = owner(client, session, f"businesses/{bid}/supply").json()
        assert any("Sri Lakshmi" in o["supplier"]["name"] for o in supply["orders"])
        metro = owner(client, session, "businesses/demo-chain-metro-foods/supply").json()
        assert any(
            d.get("translated_format") == "idoc" for o in metro["orders"] for d in o["documents"]
        )
        sap = owner(client, session, f"businesses/{bid}/supply/sap-sandbox")
        assert sap.status_code == 200 and sap.json()["source"] == "recorded"
        drafted = owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={})
        assert drafted.status_code == 200, drafted.text
        # Sandbox writes stay in the session; anything that would leave it is refused.
        assert owner(client, session, "me/data", "DELETE").status_code == 403
        shared = owner(client, session, f"businesses/{bid}/share", "POST", json={"public": True})
        assert shared.status_code == 403 and shared.json()["detail"] == "DEMO_NOT_SENT"
        assert owner(client, session, "businesses/someone-else/inventory").status_code in {
            403,
            404,
        }
        put = owner(client, session, "reminders", "PUT", json={"open": "07:00"})
        assert put.status_code == 200 and owner(client, session, "reminders").json()["demo"]
        assert owner(client, session, "demo/workspace", "POST").json()["business_id"] == bid
        app.state.services.identity.require.assert_not_called()
        assert app.state.merchant.mock_calls == []
        provider.assert_not_called()


def test_demo_coach_answers_offline(app, monkeypatch):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        paid_forecast = Mock(forecast=AsyncMock(side_effect=AssertionError("live tool")))
        monkeypatch.setattr("app.coordinator.forecaster", paid_forecast)
        reply = client.post(
            f"/api/v1/demo/sessions/{session}/coach",
            json={"message": "Forecast demand for Masala chai."},
        )
        assert reply.status_code == 200, reply.text
        assert "turn_complete" in reply.text
        assert "weekday average" in reply.text.lower()
        paid_forecast.forecast.assert_not_called()


def test_customer_snapshot_reads(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        shops = read(client, session, "/shops").json()
        assert shops
        public = read(client, session, f"/public/shops/{shops[0]['id']}").json()
        assert public["demo"] is True and public["products"]
        assert public["phone"] == ""
        assert public["stamps_enabled"] is True and public["reward_text"]
        assert read(client, session, "/me").status_code == 403
        assert client.post(f"/api/v1/demo/sessions/{session}").status_code == 405


def test_sessions_are_isolated_expire_and_exit(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        first, second = [open_demo(client).json()["session_id"] for _ in range(2)]
        first_id = owner(client, first, "businesses").json()[0]["id"]
        assert owner(client, second, f"businesses/{first_id}/inventory").status_code in {403, 404}
        app.state.public_demos[first].expires = time.time() - 1
        assert owner(client, first, "businesses").status_code == 410
        assert first not in app.state.public_demos
        assert client.delete(f"/api/v1/demo/sessions/{second}").status_code == 200
        assert owner(client, second, "businesses").status_code == 410


def test_rate_limit_per_ip_even_when_owner_limits_are_disabled(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.v1_settings.rate_limits_enabled = False
        for _ in range(5):
            assert open_demo(client).status_code == 200
        blocked = open_demo(client)
        assert blocked.status_code == 429
        assert int(blocked.headers["retry-after"]) > 0
        other = client.post(
            "/api/v1/demo/workspace?public=true", headers={"x-forwarded-for": "192.0.2.2"}
        )
        assert other.status_code == 200


def test_demo_limit_store_failure_is_closed(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.take = Mock(side_effect=RuntimeError("offline"))
        assert open_demo(client).status_code == 429
        assert app.state.public_demos == {}


def test_failed_seed_releases_capacity(app, monkeypatch):  # noqa: F811
    with TestClient(app, raise_server_exceptions=False) as client:
        app.state.v1_settings.public_demo_enabled = True
        monkeypatch.setattr("app.public_demo.sandbox", Mock(side_effect=RuntimeError("fixture")))
        assert open_demo(client).status_code == 500
        assert app.state.public_demos == {}
        monkeypatch.setattr("app.public_demo.MAX_SESSIONS", 0)
        assert open_demo(client).status_code == 429


def test_session_and_safe_writes_survive_instance_cache_loss(app):  # noqa: F811
    from tests.test_photos import jpeg

    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        bid = owner(client, session, "businesses").json()[0]["id"]
        drafted = owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={})
        assert drafted.status_code == 200, drafted.text
        supply = owner(client, session, f"businesses/{bid}/supply").json()
        incoming = next(o for o in supply["orders"] if o["status"] in {"dispatched", "invoiced"})
        received = owner(
            client,
            session,
            f"businesses/{bid}/supply/orders/{incoming['id']}/received",
            "POST",
            json={"version": incoming["version"]},
        )
        assert received.status_code == 200, received.text
        assert received.json()["order"]["received"] is True
        supply = owner(client, session, f"businesses/{bid}/supply").json()
        photo = owner(
            client,
            session,
            f"businesses/{bid}/day/read?kind=sales",
            "POST",
            content=jpeg(),
            headers={"Content-Type": "image/jpeg"},
        )
        assert photo.status_code == 200 and photo.json()["fixture"] is True
        prepared = owner(
            client,
            session,
            f"businesses/{bid}/day/prepare",
            "POST",
            json={
                "date": photo.json()["date"],
                "sales": [{"item": "Masala chai", "quantity": 12, "amount": 240}],
            },
        )
        assert prepared.status_code == 200, prepared.text
        sales = prepared.json()["sales"]
        saved = owner(
            client,
            session,
            f"businesses/{bid}/import/{sales['import_id']}/approve",
            "POST",
            json={"digest": sales["digest"]},
        )
        assert saved.status_code == 200, saved.text
        history = owner(client, session, f"businesses/{bid}/sales").json()
        supply = owner(client, session, f"businesses/{bid}/supply").json()
        assert owner(client, session, "reminders", "PUT", json={"enabled": True}).status_code == 200
        before = read(client, session, "/shops").json()
        for entry in app.state.public_demos.values():
            entry.close()
        app.state.public_demos.clear()
        # Every following request reconstructs from storage, as on a fresh instance.
        assert owner(client, session, "businesses").json()[0]["id"] == bid
        assert owner(client, session, f"businesses/{bid}/supply").json() == supply
        assert owner(client, session, f"businesses/{bid}/sales").json() == history
        assert owner(client, session, "reminders").json()["subscriptions"] == ["demo"]
        assert read(client, session, "/shops").json() == before
        reply = client.post(f"/api/v1/demo/sessions/{session}/coach", json={"message": "Hello"})
        assert reply.status_code == 200 and "turn_complete" in reply.text
        assert client.delete(f"/api/v1/demo/sessions/{session}").status_code == 200
        assert owner(client, session, "businesses").status_code == 410


def test_snapshot_rejects_stale_writes_and_expired_sessions(app):  # noqa: F811
    from fastapi import HTTPException
    from starlette.requests import Request

    from app.demo_sessions import KIND, repository, save

    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        request = Request({"type": "http", "app": app})
        docs = repository(request)
        entry = app.state.public_demos[session]
        revision = entry.revision
        save(docs, session, entry)
        entry.revision = revision
        with pytest.raises(HTTPException) as conflict:
            save(docs, session, entry)
        assert conflict.value.status_code == 409
        data = docs.get(KIND, session)
        data["expires"] = time.time() - 1
        docs.put(KIND, session, session, data["expires"], data)
        entry.close()
        app.state.public_demos.clear()
        assert owner(client, session, "businesses").status_code == 410
