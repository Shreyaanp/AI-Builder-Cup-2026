"""Public demos never acquire an owner identity or use the durable merchant repository."""

import time
from unittest.mock import AsyncMock, Mock

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


def test_demo_coach_answers_offline(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        reply = client.post(
            f"/api/v1/demo/sessions/{session}/coach", json={"message": "Show my purchase orders"}
        )
        assert reply.status_code == 200, reply.text
        assert "turn_complete" in reply.text


def test_customer_snapshot_reads(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        shops = read(client, session, "/shops").json()
        assert shops
        public = read(client, session, f"/public/shops/{shops[0]['id']}").json()
        assert public["demo"] is True and public["products"]
        assert public["phone"] == ""
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
