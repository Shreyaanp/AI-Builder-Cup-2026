import pytest


@pytest.fixture(autouse=True)
def offline_eval_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """The offline coach evals never call a model, whatever the user's shell says."""
    monkeypatch.setenv("COACH_MODE", "offline")
    monkeypatch.setenv("AUTH_MODE", "local")
    monkeypatch.setenv("APP_ENV", "test")
    for name in ("GOOGLE_API_KEY", "GOOGLE_TEXT_MODEL", "GOOGLE_LIVE_MODEL", "MAPS_SERVER_KEY"):
        monkeypatch.delenv(name, raising=False)
