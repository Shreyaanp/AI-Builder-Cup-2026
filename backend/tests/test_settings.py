import pytest
from pydantic import ValidationError

from app.agent import make_agent
from app.settings import Settings

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


@pytest.mark.parametrize(
    "overrides",
    [
        {"google_cloud_project": "demo-ogoogle-local"},  # missing model IDs
        MODELS,  # Vertex without a project
        {**MODELS, "gemini_backend": "api_key"},  # API-key mode without a key
    ],
)
def test_gemini_mode_rejects_incomplete_configuration(overrides: dict[str, str]) -> None:
    with pytest.raises(ValidationError):
        Settings(coach_mode="gemini", _env_file=None, **overrides)
