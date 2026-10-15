"""'Delete all my data': every step runs on its own; failures are reported and retried."""

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from google.api_core.exceptions import Forbidden, ServiceUnavailable

from app import erasure, merchant_routes
from app.main import create_app
from app.settings import Settings
from tests.test_photos import join


def make(tmp_path: Path, **extra):
    settings = Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        _env_file=None,
        **extra,
    )
    return create_app(settings, InMemorySessionService())


def shop(client: TestClient, name: str = "Tea") -> str:
    created = client.post(
        "/api/v1/proposals", json={"kind": "business", "business": {"name": name}}
    ).json()
    return client.post(
        f"/api/v1/proposals/{created['id']}/approve", json={"digest": created["digest"]}
    ).json()["business_id"]


@pytest.fixture
def worker(monkeypatch):
    """A face worker that is down until `up["ok"]` is set."""
    up = {"ok": False, "calls": 0}

    def answer(request: httpx.Request) -> httpx.Response:
        up["calls"] += 1
        if not up["ok"]:
            raise httpx.ConnectError("worker down", request=request)
        return httpx.Response(200, json={"deleted": True})

    real = httpx.AsyncClient

    def with_worker(*args, **kwargs):
        return real(*args, **{**kwargs, "transport": httpx.MockTransport(answer)})

    async def headers(settings, uid):
        return {"Authorization": "Bearer worker"}

    monkeypatch.setattr(merchant_routes.httpx, "AsyncClient", with_worker)
    monkeypatch.setattr(erasure, "worker_headers", headers)
    return up


def test_everything_erased_reports_each_step(tmp_path: Path) -> None:
    with TestClient(make(tmp_path)) as client:
        join(client)
        shop(client)
        body = client.delete("/api/v1/me/data").json()
        assert body["status"] == "erased"
        assert body["erased"] == list(erasure.STEPS) and body["pending"] == []
        assert body["businesses"] == 1
        assert client.get("/api/v1/me").json()["erase_pending"] == []


def test_face_worker_down_erases_the_rest_and_retries_face(tmp_path: Path, worker) -> None:
    with TestClient(make(tmp_path, face_worker_token="fixture-only")) as client:
        join(client)
        bid = shop(client)
        response = client.delete("/api/v1/me/data")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "partial" and body["pending"] == ["face"]
        assert "records" in body["erased"] and body["businesses"] == 1
        assert body["retry_saved"] is True
        assert client.get("/api/v1/businesses").json() == []
        assert client.get(f"/api/v1/public/shops/{bid}").status_code == 404
        # The next visit retries quietly; still down, still pending.
        assert client.get("/api/v1/me").json()["erase_pending"] == ["face"]
        worker["ok"] = True
        client.get("/api/v1/me")  # background retry runs after this response
        assert client.get("/api/v1/me").json()["erase_pending"] == []


def test_storage_403_keeps_photos_and_gallery_pending_for_the_old_shop(
    tmp_path: Path, monkeypatch
) -> None:
    app = make(tmp_path)
    with TestClient(app) as client:
        join(client)
        old = shop(client)
        photos = app.state.photos
        deleted: list[str] = []

        def forbidden(*args):
            raise Forbidden("storage.objects.delete denied")

        monkeypatch.setattr(photos, "erase_owner_sync", forbidden)
        monkeypatch.setattr(photos, "delete_gallery_sync", forbidden)
        body = client.delete("/api/v1/me/data").json()
        assert body["status"] == "partial"
        assert body["pending"] == ["photos", "gallery"]
        assert {"face", "records", "community", "memory", "conversations"} <= set(body["erased"])
        # The owner starts again with a new shop; the retry only touches the erased one.
        join(client)
        new = shop(client, "New tea")
        monkeypatch.setattr(photos, "erase_owner_sync", lambda uid: 2)
        monkeypatch.setattr(photos, "delete_gallery_sync", lambda bid: deleted.append(bid))
        assert client.get("/api/v1/me").json()["erase_pending"] == ["photos", "gallery"]
        assert deleted == [old]
        assert client.get("/api/v1/me").json()["erase_pending"] == []
        assert [b["id"] for b in client.get("/api/v1/businesses").json()] == [new]


def test_firestore_error_on_records_still_erases_copies_and_needs_try_again(
    tmp_path: Path, monkeypatch
) -> None:
    app = make(tmp_path)
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        store = app.state.merchant
        real = store.erase_owner

        def unavailable(uid):
            raise ServiceUnavailable("Firestore unavailable")

        monkeypatch.setattr(store, "erase_owner", unavailable)
        erased_shops: list[str] = []
        community = app.state.community
        original = community.erase_shop
        monkeypatch.setattr(
            community, "erase_shop", lambda b: (erased_shops.append(b), original(b))
        )
        response = client.delete("/api/v1/me/data")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "partial" and body["pending"] == ["records"]
        # Shop-scoped copies were found from the records before they failed to delete.
        assert erased_shops == [bid]
        # The background retry never erases records on its own (the shop is still there).
        assert client.get("/api/v1/me").json()["erase_pending"] == ["records"]
        assert len(client.get("/api/v1/businesses").json()) == 1
        monkeypatch.setattr(store, "erase_owner", real)
        again = client.delete("/api/v1/me/data").json()
        assert again["status"] == "erased" and again["businesses"] == 1
        assert client.get("/api/v1/me").json()["erase_pending"] == []


def test_unsaved_retry_list_still_answers_with_what_is_pending(
    tmp_path: Path, worker, monkeypatch
) -> None:
    app = make(tmp_path, face_worker_token="fixture-only")
    with TestClient(app) as client:
        join(client)

        def broken(*args):
            raise ServiceUnavailable("Firestore unavailable")

        monkeypatch.setattr(app.state.community.docs, "put", broken)
        response = client.delete("/api/v1/me/data")
        assert response.status_code == 200
        body = response.json()
        assert body["pending"] == ["face"] and body["retry_saved"] is False


def test_failed_conversation_delete_is_pending(tmp_path: Path, monkeypatch) -> None:
    app = make(tmp_path)
    with TestClient(app) as client:
        join(client)
        client.post("/api/v1/coach/stream", json={"message": "Hello"})
        sessions = app.state.services.runtime.sessions

        async def broken(**kwargs):
            raise ServiceUnavailable("session store down")

        monkeypatch.setattr(sessions, "delete_session", broken)
        body = client.delete("/api/v1/me/data").json()
        assert body["pending"] == ["conversations"] and body["conversations"] == 0
