from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app import erasure, merchant_routes
from app.main import create_app
from app.settings import Settings
from tests.test_photo_location import located_jpeg
from tests.test_photos import join, upload


def test_capture_reaches_the_worker_through_a_real_async_client(tmp_path: Path, monkeypatch):
    """Regression: a bytearray body made httpx's AsyncClient fail every capture with a 500."""
    seen: list[bytes] = []

    def worker(request: httpx.Request) -> httpx.Response:
        seen.append(request.content)
        return httpx.Response(
            200, json={"status": "verified", "liveness": "passed", "embedding": [0.1]}
        )

    real = httpx.AsyncClient

    def with_worker(*args, **kwargs):
        return real(*args, **{**kwargs, "transport": httpx.MockTransport(worker)})

    monkeypatch.setattr(merchant_routes.httpx, "AsyncClient", with_worker)
    settings = Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        face_worker_token="fixture-only",
        _env_file=None,
    )
    with TestClient(create_app(settings, InMemorySessionService())) as client:
        join(client)
        first = upload(client, located_jpeg(None)).json()["proposal"]
        bid = client.post(
            f"/api/v1/proposals/{first['id']}/approve", json={"digest": first["digest"]}
        ).json()["business_id"]
        challenge = client.post(
            "/api/v1/face/challenges", json={"business_id": bid, "consent": True}
        ).json()
        video = b"\x1a\x45\xdf\xa3" + b"\x00" * 2048
        response = client.post(
            f"/api/v1/face/challenges/{challenge['id']}/capture",
            content=video,
            headers={"content-type": "video/webm"},
        )
        assert response.status_code == 200, response.text
        assert seen == [video]
        body = response.json()
        assert body["status"] == "verified" and "embedding" not in str(body)


def test_erase_reaches_the_private_worker_with_both_auth_layers(tmp_path: Path, monkeypatch):
    """Regression: "Delete all my data" sent only the worker token, Cloud Run answered 401 and
    the whole erasure stopped with 503 (15 Oct 2026)."""
    seen: list[httpx.Headers] = []

    def worker(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers)
        return httpx.Response(200, json={"deleted": True})

    real = httpx.AsyncClient

    def with_worker(*args, **kwargs):
        return real(*args, **{**kwargs, "transport": httpx.MockTransport(worker)})

    async def headers(settings, uid):
        return {
            "Authorization": "Bearer worker",
            "X-Owner": uid,
            "X-Serverless-Authorization": "Bearer id",
        }

    monkeypatch.setattr(merchant_routes.httpx, "AsyncClient", with_worker)
    monkeypatch.setattr(erasure, "worker_headers", headers)
    settings = Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        face_worker_token="fixture-only",
        _env_file=None,
    )
    with TestClient(create_app(settings, InMemorySessionService())) as client:
        join(client)
        response = client.delete("/api/v1/me/data")
        assert response.status_code == 200, response.text
        assert seen and seen[0]["x-serverless-authorization"] == "Bearer id"
