"""Public demos never acquire an owner identity or use the durable merchant repository."""

import time
from unittest.mock import AsyncMock, Mock

from fastapi.testclient import TestClient

from tests.test_photos import app  # noqa: F401


def open_demo(client: TestClient):
    return client.post("/api/v1/demo/workspace?public=true&zone=Asia/Kolkata")


def read(client: TestClient, session: str, path: str):
    return client.get(f"/api/v1/demo/sessions/{session}", params={"path": path})


def test_public_demo_is_off_by_default(app):  # noqa: F811
    with TestClient(app) as client:
        assert open_demo(client).status_code == 404
        assert read(client, "missing", "/businesses").status_code == 404


def test_demo_without_identity_is_filled_private_and_read_only(app, monkeypatch):  # noqa: F811
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
        response = read(client, session, "/businesses")
        assert response.headers["cache-control"] == "no-store"
        business = response.json()[0]
        assert business["fields"]["name"].endswith("(Demo)")
        assert business["fields"]["currency"] == "INR"
        assert business["public"] is False
        bid = business["id"]
        inventory = read(client, session, f"/businesses/{bid}/inventory").json()
        sales = read(client, session, f"/businesses/{bid}/sales").json()
        assert len(sales) >= 42 * len(inventory)
        assert read(client, session, f"/businesses/{bid}/forecast").json()["status"] == "ready"
        assert len(read(client, session, f"/businesses/{bid}/inquiries").json()) == 3
        shops = read(client, session, "/shops").json()
        assert shops
        public = read(client, session, f"/public/shops/{shops[0]['id']}").json()
        assert public["demo"] is True and public["products"]
        assert public["phone"] == ""
        assert public["stamps_enabled"] is True and public["reward_text"]
        assert read(client, session, "/me").status_code == 403
        assert read(client, session, "/businesses/someone-else/inventory").status_code == 403
        assert client.post(f"/api/v1/demo/sessions/{session}").status_code == 405
        app.state.services.identity.require.assert_not_called()
        assert app.state.merchant.mock_calls == []
        provider.assert_not_called()


def test_sessions_are_isolated_expire_and_exit(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        first, second = [open_demo(client).json()["session_id"] for _ in range(2)]
        first_id = read(client, first, "/businesses").json()[0]["id"]
        assert read(client, second, f"/businesses/{first_id}/inventory").status_code == 403
        app.state.public_demos[first].expires = time.time() - 1
        assert read(client, first, "/businesses").status_code == 410
        assert first not in app.state.public_demos
        assert client.delete(f"/api/v1/demo/sessions/{second}").status_code == 200
        assert read(client, second, "/businesses").status_code == 410


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
        monkeypatch.setattr("app.public_demo.fixture", Mock(side_effect=RuntimeError("fixture")))
        assert open_demo(client).status_code == 500
        assert app.state.public_demos == {}
        monkeypatch.setattr("app.public_demo.MAX_SESSIONS", 0)
        assert open_demo(client).status_code == 429
