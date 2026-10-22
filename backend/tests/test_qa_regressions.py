"""QA findings: these assert desired behavior. Open ones stay strict expected failures."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.main import create_app
from app.settings import Settings
from tests.pins import OWNER_PIN
from tests.test_photos import join


@pytest.fixture
def qa_client(tmp_path: Path):
    app = create_app(
        Settings(
            app_env="test",
            coach_mode="offline",
            v1_enabled=True,
            merchant_database=str(tmp_path / "merchant.sqlite3"),
            recall_path=str(tmp_path / "recall"),
            rate_limits_enabled=False,
            _env_file=None,
        ),
        InMemorySessionService(),
    )
    with TestClient(app) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                **OWNER_PIN,
                "business": {"name": "QA tea stall"},
                "products": [{"name": "QA tea", "price": 1800, "unit": "cup"}],
            },
        ).json()
        bid = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve",
            json={"digest": proposal["digest"]},
        ).json()["business_id"]
        assert client.post(f"/api/v1/businesses/{bid}/share", json={"public": True}).is_success
        yield client, bid


# Q8 fixed: the legacy route now requires a signed-in customer.
def test_legacy_inquiry_requires_customer_identity(qa_client) -> None:
    client, bid = qa_client
    client.cookies.clear()
    assert client.get("/api/v1/customer/me").json()["signed_in"] is False
    response = client.post(
        f"/api/v1/public/shops/{bid}/inquiries",
        json={
            "name": "Anonymous stranger",
            "contact": "stranger@example.invalid",
            "message": "New anonymous inquiry",
        },
    )
    assert response.status_code == 401


# Fixed Q9: owner erasure also removes the shop's community snapshot, updates and tips.
def test_owner_erasure_removes_derived_shop_community_records(qa_client) -> None:
    client, bid = qa_client
    service = client.app.state.community
    shop = client.get(f"/api/v1/public/shops/{bid}").json()
    service.observe(bid, shop)
    # Snapshot contains the owner's approved public menu, copied into community storage.
    assert service.docs.get("snapshot", bid) is not None
    assert any(p["name"] == "QA tea" for p in service.docs.get("snapshot", bid)["products"])
    assert client.delete("/api/v1/me/data").is_success
    assert client.get(f"/api/v1/public/shops/{bid}").status_code == 404
    assert service.docs.get("snapshot", bid) is None


# Fixed Q10: an atomic per-customer slot lets exactly one of two simultaneous starts create the
# shop thread; the other waits for it and continues the same thread.
def test_concurrent_starts_keep_one_customer_thread(
    qa_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, bid = qa_client
    assert client.post("/api/v1/customer/session", json={"name": "QA customer"}).is_success
    service = client.app.state.community
    original = service.thread_for_shop
    barrier = Barrier(2, timeout=10)

    def together(*args, **kwargs):
        # Both requests read the empty per-customer index at the same moment, then race on
        # to creation: an ordinary concurrent start from two tabs.
        found = original(*args, **kwargs)
        barrier.wait()
        return found

    monkeypatch.setattr(service, "thread_for_shop", together)

    def start(text: str):
        return client.post(f"/api/v1/customer/shops/{bid}/threads", json={"text": text})

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(start, ["First tab", "Second tab"]))
    assert all(response.is_success for response in responses)
    ids = [response.json()["thread"]["id"] for response in responses]
    assert ids[0] == ids[1]
    chats = client.get("/api/v1/customer/threads").json()
    assert len(chats) == 1
    texts = [m["text"] for m in chats[0]["thread"]["messages"]]
    assert "First tab" in texts and "Second tab" in texts
