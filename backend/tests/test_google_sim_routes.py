from fastapi.testclient import TestClient
from test_photos import app as app  # noqa: F401 - shared consented local app fixture
from test_photos import join


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
                    "category_id": "tea_shop",
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
