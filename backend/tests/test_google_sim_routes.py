from fastapi.testclient import TestClient

from tests.test_photos import app as app  # noqa: F401 - shared consented local app fixture
from tests.test_photos import join


def shop(client: TestClient, name: str) -> str:
    proposal = client.post(
        "/api/v1/proposals", json={"kind": "business", "business": {"name": name}}
    ).json()
    return client.post(
        f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
    ).json()["business_id"]


def test_owner_consent_reset_isolation_and_pending_restore(app) -> None:
    with TestClient(app) as client:
        join(client)
        bid, other = shop(client, "Saved shop"), shop(client, "Other shop")
        path = f"/api/v1/businesses/{bid}/google-sim"
        original = client.get("/api/v1/businesses").json()
        s = client.get(path).json()
        assert s["facts"]["name"] == "Saved shop" and s["facts"]["category_id"] == ""
        s = client.post(path + "/reset", json={"scenario": "submit-unknown", "version": 0}).json()
        for body in [
            {"kind": "start"},
            {"kind": "type", "value": "store"},
            {
                "kind": "facts",
                "facts": {
                    "name": "Saved shop",
                    "location": "Demo Road",
                    "hours": "9–18",
                    "phone": "Demo",
                    "category_id": "hawker_stall",
                },
            },
            {"kind": "authorize", "value": "demo-owner"},
            {"kind": "select", "value": "new"},
            {"kind": "submit", "revision": 2},
        ]:
            response = client.post(path, json={**body, "version": s["version"]})
            assert response.status_code == 200, response.json()
            s = response.json()
        assert s["phase"] == "pending" and s["submissions"] == 1
        assert client.get(path).json() == s
        assert (
            client.post(path, json={"kind": "reconcile", "version": s["version"] - 1}).status_code
            == 409
        )
        assert client.get(f"/api/v1/businesses/{other}/google-sim").json()["phase"] == "goal"
        reset = client.post(
            path + "/reset", json={"scenario": "restricted", "version": s["version"]}
        )
        assert reset.status_code == 200 and reset.json()["receipt"] is None
        assert client.get("/api/v1/businesses").json() == original
        assert client.get("/api/v1/businesses/invalid/google-sim").status_code == 404
    with TestClient(app) as stranger:
        stranger.get("/api/v1/bootstrap")
        assert stranger.get(path).status_code == 428
        join(stranger)
        assert stranger.get(path).status_code == 404
        assert stranger.post(path, json={"kind": "start", "version": 0}).status_code == 404
        assert stranger.post(path + "/reset", json={"version": 0}).status_code == 404


def test_find_entry_claim_outcome_is_saved_without_changing_shop(app) -> None:
    with TestClient(app) as client:
        join(client)
        bid = shop(client, "Katong Kopi")
        path = f"/api/v1/businesses/{bid}/google-sim"
        original = client.get("/api/v1/businesses").json()
        s = client.get(path).json()
        for body in [
            {"kind": "start", "value": "find"},
            {"kind": "type", "value": "store"},
            {
                "kind": "facts",
                "facts": {
                    "name": "Katong Kopi",
                    "location": "Katong, Singapore",
                    "hours": "09:00–18:00",
                    "phone": "Fictional contact",
                    "category_id": "hawker_stall",
                },
            },
            {"kind": "authorize", "value": "demo-owner"},
        ]:
            response = client.post(path, json={**body, "version": s["version"]})
            assert response.status_code == 200
            s = response.json()
        assert len(s["matches"]) == 2
        s = client.post(
            path, json={"kind": "select", "value": s["matches"][0]["id"], "version": s["version"]}
        ).json()
        assert s["phase"] == "claim"
        s = client.post(path, json={"kind": "claim", "version": s["version"]}).json()
        assert s["ownership"] == "pending"
        assert s["publication"] == "not_submitted" and s["verification"] == "unverified"
        assert client.get(path).json() == s
        assert client.get("/api/v1/businesses").json() == original
