from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.main import create_app
from app.settings import Settings
from tests.test_merchant_routes import approve
from tests.test_photos import join, jpeg, upload


@pytest.fixture
def app(tmp_path: Path):
    settings = Settings(
        app_env="test",
        v1_enabled=True,
        coach_mode="offline",
        auth_mode="local",
        session_backend="sqlite",
        merchant_backend="sqlite",
        moderation_mode="fixture",
        media_bucket="",
        face_worker_token="",
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        _env_file=None,
    )
    return create_app(settings, InMemorySessionService())


def create_shop(client: TestClient) -> tuple[str, str]:
    response = client.post(
        "/api/v1/proposals",
        json={
            "kind": "business",
            "business": {"name": "Test Tea Stall"},
            "products": [{"name": "Chai", "price": 1500, "unit": "cup", "stock": 10}],
        },
    )
    assert response.status_code == 200
    bid = approve(client, response.json())["business_id"]
    inventory = client.get(f"/api/v1/businesses/{bid}/inventory")
    assert inventory.status_code == 200
    return bid, inventory.json()[0]["id"]


def test_public_shop_requires_sharing_but_no_workspace(app) -> None:
    with TestClient(app) as owner:
        join(owner)
        bid, _ = create_shop(owner)
        # A fresh HTTP session uses the owner's running app without opening its lifespan
        # again (which would reopen Qdrant). No customer bootstrap or cookie is needed.
        customer = TestClient(app)
        try:
            assert not customer.cookies
            for shop_id in (bid, str(uuid4()), "not-a-uuid"):
                assert customer.get(f"/api/v1/public/shops/{shop_id}").status_code == 404
            shared = owner.post(f"/api/v1/businesses/{bid}/share", json={"public": True})
            assert shared.status_code == 200
            response = customer.get(f"/api/v1/public/shops/{bid}")
            assert response.status_code == 200
            assert response.json() == {
                "lat": None,
                "lng": None,
                "place_id": None,
                "timezone": "Asia/Singapore",
                "id": bid,
                "name": "Test Tea Stall",
                "category": "",
                "location": "",
                "hours": "",
                "phone": "",
                "currency": "SGD",
                "open_now": None,
                "facts": {},
                "products": [{"name": "Chai", "price": 1500, "unit": "cup", "available": True}],
            }
            for shop_id in (str(uuid4()), "not-a-uuid"):
                assert customer.get(f"/api/v1/public/shops/{shop_id}").status_code == 404
            assert not customer.cookies
        finally:
            customer.close()


@pytest.mark.parametrize("action", ["share", "availability"])
def test_share_and_availability_require_current_consent_and_ownership(app, action: str) -> None:
    with TestClient(app) as client:
        join(client)
        bid, product_id = create_shop(client)
        owner_cookies = dict(client.cookies)
        if action == "share":
            url = f"/api/v1/businesses/{bid}/share"
            body = {"public": True}
        else:
            url = f"/api/v1/businesses/{bid}/inventory/{product_id}/availability"
            body = {"available": False}

        # One app opener avoids the local Qdrant lock; swap workspaces by cookie jar.
        client.cookies.clear()
        assert client.get("/api/v1/bootstrap").status_code == 200
        me = client.get("/api/v1/me").json()
        assert me["consent_current"] is False
        response = client.post(url, json=body)
        assert response.status_code == 428
        assert response.json()["detail"] == "CONSENT_REQUIRED"

        join(client)
        create_shop(client)  # Another workspace owns its own shop, not the target shop.
        assert client.post(url, json=body).status_code == 404
        client.cookies.clear()
        client.cookies.update(owner_cookies)
        businesses = client.get("/api/v1/businesses").json()
        assert businesses[0]["public"] is False
        assert businesses[0]["revision"] == 1
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json()[0]["available"] is True
        assert client.post(url, json=body).status_code == 200


def test_new_shop_photo_has_one_business_proposal_with_priced_products(app) -> None:
    with TestClient(app) as client:
        join(client)
        assert client.get("/api/v1/businesses").json() == []
        response = upload(client, jpeg())
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "needs_review"
        proposal = body["proposal"]
        assert isinstance(proposal, dict)
        snapshot = proposal["snapshot"]
        assert snapshot["kind"] == "business"
        assert snapshot["revision"] == 0
        assert snapshot["business"]["name"] == "Offline Fixture Tea Stall"
        product = {"name": "Chai", "price": 1500, "unit": "cup", "stock": None, "available": True}
        assert snapshot["products"] == [product]
        assert client.get("/api/v1/businesses").json() == []
        bid = approve(client, proposal)["business_id"]
        businesses = client.get("/api/v1/businesses").json()
        assert len(businesses) == 1
        assert businesses[0]["id"] == bid == snapshot["business_id"]
        assert businesses[0]["revision"] == 1
        inventory = client.get(f"/api/v1/businesses/{bid}/inventory")
        assert inventory.status_code == 200
        items = inventory.json()
        assert len(items) == 1
        assert items[0] == {"id": items[0]["id"], **product}


def test_business_listing_reports_share_status(app) -> None:
    with TestClient(app) as client:
        join(client)
        bid, _ = create_shop(client)
        response = client.get("/api/v1/businesses")
        assert response.status_code == 200
        assert response.json()[0]["public"] is False
        shared = client.post(f"/api/v1/businesses/{bid}/share", json={"public": True})
        assert shared.status_code == 200
        assert shared.json() == {"business_id": bid, "public": True}
        response = client.get("/api/v1/businesses")
        assert response.status_code == 200
        assert response.json()[0]["id"] == bid
        assert response.json()[0]["public"] is True
