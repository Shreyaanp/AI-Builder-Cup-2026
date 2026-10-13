from pathlib import Path

from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.main import create_app
from app.settings import Settings
from tests.test_photos import join, jpeg, upload


def make(tmp_path: Path):
    settings = Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        _env_file=None,
    )
    return create_app(settings, InMemorySessionService())


def test_changes_require_current_consent(tmp_path: Path) -> None:
    with TestClient(make(tmp_path)) as client:
        client.get("/api/v1/bootstrap")
        me = client.get("/api/v1/me").json()
        assert me["consent"] is None and me["consent_current"] is False
        business = {"kind": "business", "business": {"name": "Tea"}}
        assert client.post("/api/v1/proposals", json=business).status_code == 428
        assert upload(client, jpeg()).status_code == 428
        version = me["legal_version"]
        partial = {"version": version, "terms": True, "privacy": False}
        assert client.post("/api/v1/consent", json=partial).status_code == 422
        stale = {"version": "2020-01-01", "terms": True, "privacy": True}
        assert client.post("/api/v1/consent", json=stale).status_code == 422
        join(client)
        assert client.get("/api/v1/me").json()["consent_current"] is True
        assert client.post("/api/v1/proposals", json=business).status_code == 200


def test_erase_removes_every_owned_record(tmp_path: Path) -> None:
    app = make(tmp_path)
    with TestClient(app) as client:
        join(client)
        proposal = upload(client, jpeg()).json()["proposal"]
        client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        )
        assert len(client.get("/api/v1/businesses").json()) == 1
        client.post("/api/v1/coach/stream", json={"message": "Hello"})
        assert client.get("/api/v1/conversations").json()
        # One app instance (the local Qdrant store allows one opener); swap cookie jars to
        # act as a second owner.
        alice = dict(client.cookies)
        client.cookies.clear()
        join(client)
        create = {"kind": "business", "business": {"name": "Other shop"}}
        kept = client.post("/api/v1/proposals", json=create).json()
        client.post(f"/api/v1/proposals/{kept['id']}/approve", json={"digest": kept["digest"]})
        bob = dict(client.cookies)
        client.cookies.clear()
        client.cookies.update(alice)
        erased = client.delete("/api/v1/me/data")
        assert erased.status_code == 200
        assert erased.json()["businesses"] == 1
        assert client.get("/api/v1/businesses").json() == []
        assert client.get("/api/v1/conversations").json() == []
        assert client.get("/api/v1/me").json()["consent"] is None
        client.cookies.clear()
        client.cookies.update(bob)
        assert [b["fields"]["name"] for b in client.get("/api/v1/businesses").json()] == [
            "Other shop"
        ]
