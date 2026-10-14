from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from pydantic import ValidationError

from app.main import create_app
from app.settings import Settings


def test_single_origin_serves_frontend_and_api_without_exposing_files(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<html>oGoogle AI</html>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "fixture.js").write_text("console.log('fixture')")
    with TestClient(
        create_app(
            Settings(app_env="test", frontend_dist=str(tmp_path), _env_file=None),
            InMemorySessionService(),
        )
    ) as client:
        assert "oGoogle AI" in client.get("/").text
        assert "oGoogle AI" in client.get("/coach").text
        assert client.get("/api/v1/health").json()["product"] == "oGoogle AI"
        assert client.get("/api/missing").status_code == 404
        assert client.get("/assets/missing.js").status_code == 404
        assert client.get("/.env").status_code == 404
        assert client.get("/%2e%2e/backend/.env").status_code == 404
        assert client.get("/assets/fixture.js").headers["cache-control"].endswith("immutable")
        assert client.get("/").headers["cache-control"] == "no-store"
        for path in ("/", "/api/v1/health"):
            headers = client.get(path).headers
            assert headers["x-frame-options"] == "DENY"
            assert headers["content-security-policy"] == "frame-ancestors 'none'"
            assert headers["strict-transport-security"].startswith("max-age=")
            assert headers["cross-origin-opener-policy"] == "same-origin-allow-popups"
            assert "camera=(self)" in headers["permissions-policy"]


def test_production_requires_identity_cloud_memory_and_https(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    values = dict(
        app_env="production",
        auth_mode="firebase",
        session_backend="firestore",
        google_cloud_project="demo-ogoogle",
        firebase_web_api_key="public-fixture",
        firebase_web_app_id="app-fixture",
        firebase_auth_domain="demo-ogoogle.firebaseapp.com",
        allowed_origins=["https://fixture.run.app"],
        _env_file=None,
    )
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    monkeypatch.delenv("FIREBASE_AUTH_EMULATOR_HOST", raising=False)
    assert Settings(**values).session_backend == "firestore"
    for change in [
        {"session_backend": "sqlite"},
        {"auth_mode": "local"},
        {"firebase_web_api_key": ""},
        {"allowed_origins": ["http://fixture"]},
    ]:
        with pytest.raises(ValidationError):
            Settings(**(values | change))
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8085")
    with pytest.raises(ValidationError):
        Settings(**values)
