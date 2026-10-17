import pytest


@pytest.fixture(autouse=True)
def offline_test_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """User shell settings must never cause these fixture tests to call a model."""
    monkeypatch.setenv("COACH_MODE", "offline")
    monkeypatch.setenv("AUTH_MODE", "local")
    monkeypatch.setenv("APP_ENV", "test")
    for name in (
        "GOOGLE_API_KEY",
        "GOOGLE_TEXT_MODEL",
        "GOOGLE_LIVE_MODEL",
        "MAPS_SERVER_KEY",
        "MAPS_BROWSER_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    # Test clients send no phone signals; they stand in for the Singapore demo phone, like the
    # browser suite's en-SG / Asia/Singapore.
    monkeypatch.setattr("app.region.NO_SIGNAL_COUNTRY", "SG")
