import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.main import create_app
from app.settings import Settings
from tests.test_photos import join


@pytest.fixture
def settings(tmp_path: Path):
    return Settings(
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


@pytest.fixture
def app(settings: Settings):
    return create_app(settings, InMemorySessionService())


def propose_business(client: TestClient):
    response = client.post(
        "/api/v1/proposals",
        json={"kind": "business", "business": {"name": "Test Tea Stall"}},
    )
    assert response.status_code == 200
    return response.json()


def approve(client: TestClient, proposal):
    response = client.post(
        f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
    )
    assert response.status_code == 200
    return response.json()


def test_bootstrap_reports_enabled_offline_coach(app) -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/bootstrap")
        assert response.status_code == 200
        assert response.json()["v1_enabled"] is True
        assert response.json()["coach_mode"] == "offline"
        assert client.cookies
        assert client.get("/api/v1/businesses").status_code == 200


def test_business_approval_requires_digest_and_owner_and_is_idempotent(app) -> None:
    with TestClient(app) as client:
        join(client)
        proposal = propose_business(client)
        assert client.get("/api/v1/businesses").json() == []
        wrong_digest = ("0" if proposal["digest"][0] != "0" else "1") + proposal["digest"][1:]
        rejected = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": wrong_digest}
        )
        assert rejected.status_code == 409
        assert client.get("/api/v1/businesses").json() == []

        receipt = approve(client, proposal)
        assert receipt["receipt_id"]
        assert approve(client, proposal) == receipt
        response = client.get("/api/v1/businesses")
        assert response.status_code == 200
        businesses = response.json()
        assert len(businesses) == 1
        assert businesses[0]["id"] == receipt["business_id"]
        assert businesses[0]["fields"]["name"] == "Test Tea Stall"
        assert businesses[0]["revision"] == receipt["revision"] == 1

    with TestClient(app) as stranger:
        join(stranger)
        response = stranger.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        )
        assert response.status_code == 404
        assert stranger.get("/api/v1/businesses").json() == []


def test_business_update_rejects_stale_revision(app) -> None:
    with TestClient(app) as client:
        join(client)
        receipt = approve(client, propose_business(client))
        before = client.get("/api/v1/businesses").json()
        response = client.post(
            f"/api/v1/businesses/{receipt['business_id']}/update",
            params={"revision": receipt["revision"] - 1},
            json={"name": "Changed Tea Stall"},
        )
        assert response.status_code == 409
        assert client.get("/api/v1/businesses").json() == before


def test_inventory_approval_saves_product_for_owner_only(app) -> None:
    with TestClient(app) as client:
        join(client)
        receipt = approve(client, propose_business(client))
        bid = receipt["business_id"]
        product = {"name": "Chai", "price": 1500, "unit": "cup", "stock": 10}
        response = client.post(
            "/api/v1/proposals",
            json={
                "kind": "inventory",
                "business_id": bid,
                "revision": receipt["revision"],
                "products": [product],
            },
        )
        assert response.status_code == 200
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []
        inventory_receipt = approve(client, response.json())
        assert inventory_receipt["business_id"] == bid
        response = client.get(f"/api/v1/businesses/{bid}/inventory")
        assert response.status_code == 200
        products = response.json()
        assert len(products) == 1
        assert products[0]["id"]
        # A suggested category is filled in and reviewed with the rest (B28).
        assert products[0] == {
            "id": products[0]["id"],
            **product,
            "available": True,
            "category": "drinks",
        }

    with TestClient(app) as stranger:
        join(stranger)
        assert stranger.get(f"/api/v1/businesses/{bid}/inventory").status_code == 404


def test_face_challenge_requires_consent_and_capture_requires_video(app) -> None:
    with TestClient(app) as client:
        join(client)
        receipt = approve(client, propose_business(client))
        body = {"business_id": receipt["business_id"], "consent": False}
        assert client.post("/api/v1/face/challenges", json=body).status_code == 422
        response = client.post("/api/v1/face/challenges", json={**body, "consent": True})
        assert response.status_code == 200
        challenge = response.json()
        assert len(challenge["prompts"]) == 2
        assert len(set(challenge["prompts"])) == 2
        response = client.post(
            f"/api/v1/face/challenges/{challenge['id']}/capture",
            content=b"invalid capture",
            headers={"content-type": "text/plain"},
        )
        assert response.status_code == 415


def test_face_capture_is_single_use_without_worker(app) -> None:
    with TestClient(app) as client:
        join(client)
        receipt = approve(client, propose_business(client))
        response = client.post(
            "/api/v1/face/challenges",
            json={"business_id": receipt["business_id"], "consent": True},
        )
        assert response.status_code == 200
        capture_url = f"/api/v1/face/challenges/{response.json()['id']}/capture"
        response = client.post(
            capture_url, content=b"offline video fixture", headers={"content-type": "video/webm"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "review_pending"
        assert response.json()["reason"] == "worker_unavailable"
        assert response.json()["liveness"] == "unavailable"
        assert (
            client.post(
                capture_url,
                content=b"offline video fixture",
                headers={"content-type": "video/webm"},
            ).status_code
            == 409
        )


def test_face_template_deletion_without_worker_confirms(app) -> None:
    # No worker configured means no template was ever stored, so deletion succeeds.
    with TestClient(app) as client:
        join(client)
        response = client.delete("/api/v1/face/template")
        assert response.status_code == 200
        assert response.json() == {"status": "deleted"}


def test_coach_stream_rejects_another_workspaces_business(app) -> None:
    with TestClient(app) as client:
        join(client)
        receipt = approve(client, propose_business(client))

    with TestClient(app) as stranger:
        join(stranger)
        response = stranger.post(
            "/api/v1/coach/stream",
            json={"message": "Help with my business", "business_id": receipt["business_id"]},
        )
        assert response.status_code == 404


def test_coach_without_business_returns_offline_sse(app) -> None:
    with TestClient(app) as client:
        join(client)
        with client.stream(
            "POST", "/api/v1/coach/stream", json={"message": "Help with my business"}
        ) as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")
            lines = list(response.iter_lines())
        assert "event: coach" in lines
        events = [
            json.loads(line.removeprefix("data: ")) for line in lines if line.startswith("data: ")
        ]
        assert events[0]["kind"] == "ready"
        assert events[0]["mode"] == "offline"
        assert any(event["kind"] == "turn_complete" for event in events)
        assert not any(event["kind"] == "error" for event in events)


@pytest.mark.parametrize("currency", ["jpy", "JP", "JPYY", "123"])
def test_coach_stream_rejects_invalid_currency(app, currency) -> None:
    with TestClient(app) as client:
        join(client)
        response = client.post(
            "/api/v1/coach/stream", json={"message": "Help with my business", "currency": currency}
        )
        assert response.status_code == 422
        assert response.json()["issues"][0]["field"] == ["body", "currency"]


@pytest.mark.parametrize("currency, expected", [("JPY", "JPY"), (None, "SGD")])
def test_coach_stream_new_shop_currency(app, currency, expected) -> None:
    with TestClient(app) as client:
        join(client)
        response = client.post(
            "/api/v1/coach/stream",
            json={"message": "Shop name: New Tea Stall", "currency": currency},
        )
        assert response.status_code == 200
        events = [
            json.loads(line.removeprefix("data: "))
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]
        proposal = next(event["data"] for event in events if event["kind"] == "proposal")
        assert proposal["snapshot"]["business"]["currency"] == expected
        assert client.get("/api/v1/businesses").json() == []


def test_businesses_unavailable_when_v1_disabled(settings: Settings) -> None:
    app = create_app(settings.model_copy(update={"v1_enabled": False}), InMemorySessionService())
    with TestClient(app) as client:
        bootstrap = client.get("/api/v1/bootstrap")
        assert bootstrap.status_code == 200
        assert bootstrap.json()["v1_enabled"] is False
        assert client.get("/api/v1/businesses").status_code == 503


def stream_events(client: TestClient, body: dict[str, object]) -> list[dict[str, object]]:
    response = client.post("/api/v1/coach/stream", json=body)
    assert response.status_code == 200
    return [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


def test_offline_coach_halal_answer_is_reviewed_then_published(app) -> None:
    with TestClient(app) as client:
        join(client)
        bid = approve(client, propose_business(client))["business_id"]
        events = stream_events(client, {"message": "halal yes", "business_id": bid})
        proposal = next(event["data"] for event in events if event["kind"] == "proposal")
        assert isinstance(proposal, dict)
        assert proposal["snapshot"]["business"] == {
            "name": "Test Tea Stall",
            "category": "",
            "location": "",
            "hours": "",
            "phone": "",
            "currency": "SGD",
            "halal": "yes",
        }
        # The coach only prepared it; nothing changed yet.
        assert "halal" not in client.get("/api/v1/businesses").json()[0]["fields"]
        approve(client, proposal)
        client.post(f"/api/v1/businesses/{bid}/share", json={"public": True})
        public = client.get(f"/api/v1/public/shops/{bid}").json()
        assert public["facts"] == {"halal": "yes"}


def test_proposal_accepts_custom_names_and_rejects_oversized_facts(app) -> None:
    with TestClient(app) as client:
        join(client)
        response = client.post(
            "/api/v1/proposals",
            json={"kind": "business", "business": {"name": "Tea", "payment_methods": ["iou"]}},
        )
        assert response.status_code == 200
        assert response.json()["snapshot"]["business"]["payment_methods"] == ["iou"]
        for facts in [
            {"payment_methods": ["x" * 41]},
            {"payment_methods": [str(n) for n in range(9)]},
            {"delivery": "x" * 41},
        ]:
            assert (
                client.post(
                    "/api/v1/proposals",
                    json={"kind": "business", "business": {"name": "Tea", **facts}},
                ).status_code
                == 422
            )
