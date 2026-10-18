import pytest
from pydantic import ValidationError

from app import text_model
from app.agent import make_agent
from app.settings import Settings
from app.text_model import SteadyGemini

MODELS = {"google_text_model": "text-fixture", "google_live_model": "live-fixture"}


def test_vertex_gemini_uses_runtime_identity_without_a_key() -> None:
    settings = Settings(
        coach_mode="gemini", google_cloud_project="demo-ogoogle-local", _env_file=None, **MODELS
    )
    agent = make_agent(settings)
    client = agent.canonical_model.api_client  # type: ignore[union-attr]
    assert client.vertexai
    assert client._api_client.project == "demo-ogoogle-local"
    assert not settings.google_api_key.get_secret_value()


def test_a_busy_text_model_is_retried_briefly_but_live_is_not() -> None:
    settings = Settings(
        coach_mode="gemini", google_cloud_project="demo-ogoogle-local", _env_file=None, **MODELS
    )
    # The text coach retries a busy model itself (logged, then the fallback model: text_model.py),
    # so the SDK's own silent retry is off.
    text = make_agent(settings).canonical_model
    assert isinstance(text, SteadyGemini)
    assert text.retry_options.attempts == 1  # type: ignore[union-attr]
    assert text_model.ATTEMPTS == 3 and text_model.BUSY_STATUS == (429, 503)
    live = make_agent(settings, live=True).canonical_model.retry_options  # type: ignore[union-attr]
    assert live.attempts == 1


@pytest.mark.parametrize(
    "overrides",
    [
        {"google_cloud_project": "demo-ogoogle-local"},  # missing model IDs
        MODELS,  # Vertex without a project
        {**MODELS, "gemini_backend": "api_key"},  # API-key mode without a key
    ],
)
def test_gemini_mode_rejects_incomplete_configuration(
    overrides: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    with pytest.raises(ValidationError):
        Settings(coach_mode="gemini", _env_file=None, **overrides)
