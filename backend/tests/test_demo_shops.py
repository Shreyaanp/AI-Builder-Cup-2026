import os
from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore

from app.main import create_app
from app.merchant import BusinessFields, MerchantRepository, MerchantStore, ProductFields
from app.merchant_firestore import FirestoreMerchantStore
from app.settings import Settings
from scripts.seed_demo_shops import SHOPS, main, seed
from tests.test_photos import join

EMULATOR = os.getenv("FIRESTORE_EMULATOR_HOST") == "127.0.0.1:8085"


@pytest.fixture(params=["sqlite", "firestore"])
def store(request: pytest.FixtureRequest, tmp_path: Path) -> Iterator[MerchantRepository]:
    if request.param == "sqlite":
        yield MerchantStore(str(tmp_path / "merchant.sqlite3"))
        return
    if not EMULATOR:
        pytest.skip("Requires the explicitly local Firestore emulator; never a cloud database.")
    client = firestore.Client(project="demo-ogoogle-local", credentials=AnonymousCredentials())
    yield FirestoreMerchantStore(client, "ogoogle_ai_test_" + uuid4().hex)
    client.close()


def test_demo_seed_is_idempotent_and_labelled(store: MerchantRepository) -> None:
    assert [changed for _, changed in seed(store, "demo-owner")] == [True] * len(SHOPS)
    first = {shop["id"]: shop for shop in store.shared_shops()}
    # A second run changes nothing: same shops, same menus, same revisions.
    assert [changed for _, changed in seed(store, "demo-owner")] == [False] * len(SHOPS)
    assert {shop["id"]: shop for shop in store.shared_shops()} == first
    assert sorted(first) == sorted(s.id for s in SHOPS)
    revisions = {b["id"]: b["revision"] for b in store.list_businesses("demo-owner")}
    assert set(revisions.values()) == {1}
    for demo in SHOPS:
        shop = store.public_shop(demo.id)
        assert shop is not None
        assert shop["demo"] is True
        assert shop["phone"].startswith("+65 6000 00")
        assert shop["currency"] == "SGD"
        assert shop["lat"] is not None and shop["lng"] is not None
        assert "paynow" in shop["facts"]["payment_methods"]
        assert "delivery" in shop["facts"]
        assert 6 <= len(shop["products"]) <= 12
        assert 1 <= sum(not p["available"] for p in shop["products"]) <= 2
        # Menu order is the seed order.
        assert [p["name"] for p in shop["products"]] == [p.name for p in demo.products]


def test_demo_seed_resets_owner_changes_and_keeps_product_ids(store: MerchantRepository) -> None:
    seed(store, "demo-owner")
    bid = SHOPS[0].id
    before = {p["name"]: p["id"] for p in store.inventory("demo-owner", bid)}
    first = next(iter(before.values()))
    store.set_availability("demo-owner", bid, first, False)
    assert dict(seed(store, "demo-owner"))[bid] is True
    after = store.inventory("demo-owner", bid)
    assert {p["name"]: p["id"] for p in after} == before
    assert all(p["available"] == q.available for p, q in zip(after, SHOPS[0].products, strict=True))


def test_demo_seed_refuses_other_owners_and_unlabelled_shops(store: MerchantRepository) -> None:
    seed(store, "demo-owner")
    with pytest.raises(HTTPException):
        store.seed_demo_shop("someone-else", SHOPS[0].id, SHOPS[0].fields, SHOPS[0].products)
    with pytest.raises(ValueError):
        store.seed_demo_shop("demo-owner", "kopi", SHOPS[0].fields, SHOPS[0].products)
    with pytest.raises(ValueError):
        store.seed_demo_shop(
            "demo-owner",
            "demo-not-labelled",
            BusinessFields(name="Real-looking shop"),
            [ProductFields(name="Kopi", price=150)],
        )
    assert store.public_shop("demo-not-labelled") is None


def test_shops_without_the_flag_keep_their_shape() -> None:
    assert "demo" not in BusinessFields(name="Tea").model_dump()
    assert BusinessFields(name="Tea", demo=True).model_dump()["demo"] is True


def test_script_refuses_production_without_explicit_project(monkeypatch, capsys) -> None:
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    assert main(["--owner-uid", "demo-owner"]) == 2
    assert "Refusing" in capsys.readouterr().err
    assert main(["--owner-uid", "demo-owner", "--dry-run", "--project", "p"]) == 0


def test_dry_run_writes_nothing(tmp_path: Path) -> None:
    database = tmp_path / "merchant.sqlite3"
    assert main(["--owner-uid", "demo-owner", "--dry-run", "--sqlite", str(database)]) == 0
    assert not database.exists()
    assert main(["--owner-uid", "demo-owner", "--sqlite", str(database)]) == 0
    assert MerchantStore(str(database)).public_shop(SHOPS[0].id) is not None


def test_owners_cannot_set_or_clear_the_demo_label(tmp_path: Path) -> None:
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
    with TestClient(create_app(settings, InMemorySessionService())) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals",
            json={"kind": "business", "business": {"name": "Sneaky Kopi", "demo": True}},
        ).json()
        assert "demo" not in proposal["snapshot"]["business"]
        client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        )
        bid = client.get("/api/v1/businesses").json()[0]["id"]
        client.post(f"/api/v1/businesses/{bid}/share", json={"public": True})
        assert "demo" not in client.get(f"/api/v1/public/shops/{bid}").json()
        discovered = client.get("/api/v1/discover", params={"lat": 1.3, "lng": 103.85}).json()
        assert not any(place["demo_shop"] for place in discovered["places"])
