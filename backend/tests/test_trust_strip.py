import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from pydantic import ValidationError

from app.main import create_app
from app.settings import Settings


@pytest.mark.parametrize("enabled", [True, False])
@pytest.mark.parametrize("support", ["", "https://wa.me/919876543210"])
def test_trust_strip_bootstrap(monkeypatch, enabled, support):
    monkeypatch.setenv("FEATURE_TRUST_STRIP", str(enabled).lower())
    monkeypatch.setenv("SUPPORT_WHATSAPP", support)
    with TestClient(
        create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    ) as client:
        response = client.get("/api/v1/bootstrap")
        assert response.json()["trust_strip"] == {
            "enabled": enabled,
            "support_whatsapp": support if enabled else "",
        }
        assert response.headers["cache-control"] == "no-store"


def test_trust_strip_defaults_off(monkeypatch):
    monkeypatch.delenv("FEATURE_TRUST_STRIP", raising=False)
    monkeypatch.delenv("SUPPORT_WHATSAPP", raising=False)
    settings = Settings(_env_file=None)
    assert settings.feature_trust_strip is False
    assert settings.support_whatsapp == ""


@pytest.mark.parametrize(
    "value", ["javascript:alert(1)", "http://wa.me/919876543210", "https://example.com/help"]
)
def test_support_rejects_other_links(value):
    with pytest.raises(ValidationError):
        Settings(support_whatsapp=value, _env_file=None)
