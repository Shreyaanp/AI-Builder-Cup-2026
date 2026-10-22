"""A-4: many customers behind one IP (carrier NAT, office wifi, a demo room) browse normally."""

import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.limits import LIMITS, Bucket
from app.main import create_app
from app.settings import Settings

SHARED = {"X-Forwarded-For": "198.51.100.7"}


@pytest.fixture
def app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    now = time.time()
    monkeypatch.setattr("app.limits.time.time", lambda: now)
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "art").mkdir()
    (dist / "index.html").write_text("<html>Chalkboard</html>")
    (dist / "assets" / "app.js").write_text("console.log('app')")
    (dist / "art" / "category-grocery.svg").write_text("<svg/>")
    return create_app(
        Settings(
            app_env="test",
            v1_enabled=True,
            frontend_dist=str(dist),
            merchant_database=str(tmp_path / "merchant.sqlite3"),
            recall_path=str(tmp_path / "recall"),
            _env_file=None,
        ),
        InMemorySessionService(),
    )


def test_a4_twenty_customers_on_one_ip_open_the_app_in_the_same_minute(app: FastAPI) -> None:
    # Each page open reads the app configuration and the customer's session once.
    with TestClient(app) as client:
        for _ in range(20 * 3):
            assert client.get("/api/v1/bootstrap", headers=SHARED).status_code == 200
            assert client.get("/api/v1/me", headers=SHARED).status_code == 200


def test_a4_pages_and_static_art_are_never_rate_limited(app: FastAPI) -> None:
    with TestClient(app) as client:
        # Exhaust the shared IP's API bucket: the API answers 429 (its limit is kept)...
        maximum, seconds = LIMITS["bootstrap"][0]
        bucket = Bucket("bootstrap", "198.51.100.7", maximum, seconds)
        for _ in range(maximum):
            assert app.state.rate_limiter.take([bucket], time.time()) == 0
        limited = client.get("/api/v1/bootstrap", headers=SHARED)
        assert limited.status_code == 429
        assert limited.json() == {"detail": "RATE_LIMITED"}
        assert int(limited.headers["retry-after"]) >= 1
        # ...but page loads and static files from the same IP still load.
        for path in (
            "/explore/",
            "/explore/rescue",
            "/explore/s/demo-story-bengaluru-chai",
            "/assets/app.js",
            "/art/category-grocery.svg",
        ):
            for _ in range(50):
                assert client.get(path, headers=SHARED).status_code == 200
