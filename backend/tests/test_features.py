import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from pydantic import ValidationError

from app.main import create_app
from app.settings import Settings


@pytest.mark.parametrize("enabled", [True, False])
def test_feature_switch_uses_server_environment(monkeypatch, enabled):
    monkeypatch.setenv("FEATURE_GOOGLE_GUIDE", str(enabled).lower())
    with TestClient(
        create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    ) as client:
        response = client.get("/api/v1/bootstrap")
        assert response.json()["features"] == {"google_guide": enabled}
        assert response.headers["cache-control"] == "no-store"
        # A visibility switch never changes authentication requirements.
        # Local bootstrap issued a preview identity; remove it to exercise an anonymous call.
        client.cookies.clear()
        assert client.post("/api/v1/coach/stream", json={"message": "Hi"}).status_code == 401


def test_feature_switch_rejects_invalid_environment(monkeypatch):
    monkeypatch.setenv("FEATURE_GOOGLE_GUIDE", "typo")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
