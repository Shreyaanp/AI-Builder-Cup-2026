import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.main import create_app
from app.settings import Settings


def test_firebase_bearer_owns_sessions_and_web_config_excludes_model_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def verify(token: str, **kwargs: object):
        if token not in {"fixture-alice", "fixture-bob"}:
            raise ValueError("private-provider-details")
        return {
            "uid": token,
            "email_verified": True,
            "firebase": {"sign_in_provider": "google.com"},
        }

    monkeypatch.setattr("app.auth.firebase_auth.verify_id_token", verify)
    settings = Settings(
        app_env="test",
        auth_mode="firebase",
        google_cloud_project="demo-ogoogle-local",
        firebase_web_api_key="public-fixture-key",
        firebase_web_app_id="public-fixture-app",
        firebase_auth_domain="demo-ogoogle-local.firebaseapp.com",
        google_api_key="private-model-fixture",
        _env_file=None,
    )
    with TestClient(create_app(settings, InMemorySessionService())) as client:
        configuration = client.get("/api/v1/bootstrap")
        assert configuration.json()["auth_mode"] == "firebase"
        assert "private-model-fixture" not in configuration.text
        assert client.post("/api/v1/coach/stream", json={"message": "Hi"}).status_code == 401
        alice = {"authorization": "Bearer fixture-alice"}
        response = client.post("/api/v1/coach/stream", json={"message": "Hi"}, headers=alice)
        assert response.status_code == 200
        import json

        ready = next(
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        )
        denied = client.post(
            "/api/v1/coach/stream",
            json={"message": "Hi", "session_id": ready["session_id"]},
            headers={"authorization": "Bearer fixture-bob"},
        )
        assert denied.status_code == 404
        assert (
            client.get("/api/v1/conversations", headers=alice).json()[0]["session_id"]
            == ready["session_id"]
        )
        assert (
            client.get("/api/v1/conversations/" + ready["session_id"], headers=alice).status_code
            == 200
        )
        assert (
            client.get(
                "/api/v1/conversations/" + ready["session_id"],
                headers={"authorization": "Bearer fixture-bob"},
            ).status_code
            == 404
        )
        rejected = client.post(
            "/api/v1/coach/stream",
            json={"message": "Hi"},
            headers={"authorization": "Bearer invalid-fixture"},
        )
        assert rejected.status_code == 401
        assert "private-provider-details" not in rejected.text
