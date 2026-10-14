import pytest
from google.auth.exceptions import GoogleAuthError
from httpx import ConnectError

from app import face_transport
from app.settings import Settings


@pytest.mark.asyncio
async def test_local_worker_does_not_request_cloud_identity(monkeypatch):
    def forbidden(*args):
        raise AssertionError("Local tests must not request cloud identity")

    monkeypatch.setattr(face_transport, "fetch_id_token", forbidden)
    settings = Settings(_env_file=None, face_worker_token="fixture-only")
    assert await face_transport.worker_headers(settings, "owner") == {
        "Authorization": "Bearer fixture-only",
        "X-Owner": "owner",
    }


@pytest.mark.asyncio
async def test_private_worker_keeps_bearer_and_adds_audience_identity(monkeypatch):
    settings = Settings(_env_file=None, face_worker_token="fixture-only")
    # Exercise production transport without unrelated production app settings.
    settings.app_env = "production"
    settings.face_worker_url = "https://worker.example/"
    audiences = []

    def identity(request, audience):
        audiences.append(audience)
        return "fixture-identity"

    monkeypatch.setattr(face_transport, "fetch_id_token", identity)
    headers = await face_transport.worker_headers(settings, "owner")
    assert audiences == ["https://worker.example"]
    assert headers["Authorization"] == "Bearer fixture-only"
    assert headers["X-Serverless-Authorization"] == "Bearer fixture-identity"


@pytest.mark.asyncio
async def test_identity_failure_uses_existing_worker_unavailable_path(monkeypatch):
    settings = Settings(_env_file=None)
    settings.app_env = "production"

    def unavailable(*args):
        raise GoogleAuthError("fixture error")

    monkeypatch.setattr(face_transport, "fetch_id_token", unavailable)
    with pytest.raises(ConnectError, match="Private worker identity unavailable"):
        await face_transport.worker_headers(settings, "owner")
