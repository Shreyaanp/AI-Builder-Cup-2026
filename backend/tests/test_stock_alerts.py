from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.merchant import (
    BusinessFields,
    MerchantRepository,
    MerchantStore,
    ProductFields,
    ProposalRequest,
)
from app.merchant_firestore import FirestoreMerchantStore
from app.stock_alerts import ALERT_SECONDS, StockAlertInput
from tests.pins import OWNER_PIN, SHOP_PIN
from tests.test_merchant_store import store as merchant_store
from tests.test_photos import join
from tests.test_sharing_routes import app as route_app

store = merchant_store
app = route_app


def setup_shop(repo: MerchantRepository) -> tuple[str, str]:
    before = repo.list_businesses("owner")
    proposal = repo.propose(
        "owner",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Tiong Bahru Kopi", reward_text="10th kopi free", **SHOP_PIN
            ),
            products=[ProductFields(name="Kaya toast", price=240, unit="set", available=False)],
        ),
    )
    # Preparing a reward doesn't write any shop data.
    assert repo.list_businesses("owner") == before
    bid = repo.commit("owner", proposal["id"], proposal["digest"])["business_id"]
    repo.share("owner", bid, True)
    return bid, repo.inventory("owner", bid)[0]["id"]


def test_reminder_transition_is_scoped_idempotent_and_deleted(store: MerchantRepository) -> None:
    bid, pid = setup_shop(store)
    other, _ = setup_shop(store)
    device = uuid4()
    body = StockAlertInput(device_id=device, name="Kaya toast", unit="set")
    receipt = store.subscribe_stock(bid, body)
    assert receipt.delivery == "in_page"
    assert store.subscribe_stock(bid, body) == receipt
    assert len(store.stock_alerts(bid, str(device))) == 1
    assert not store.stock_alerts(bid, str(device))[0]["ready"]
    assert store.stock_alerts(other, str(device)) == []
    assert store.stock_alerts(bid, str(uuid4())) == []
    with pytest.raises(HTTPException) as denied:
        store.set_availability("stranger", bid, pid, True)
    assert denied.value.status_code == 404
    store.set_availability("owner", bid, pid, True)
    assert store.stock_alerts(bid, str(device))[0]["ready"]
    with pytest.raises(HTTPException) as available:
        store.subscribe_stock(bid, body)
    assert available.value.status_code == 409
    store.share("owner", bid, False)
    with pytest.raises(HTTPException):
        store.stock_alerts(bid, str(device))
    store.share("owner", bid, True)
    store.erase_owner("owner")
    if isinstance(store, MerchantStore):
        with store.connect() as db:
            assert db.execute("SELECT count(*) FROM stock_alerts").fetchone()[0] == 0
    elif isinstance(store, FirestoreMerchantStore):
        assert list(store.businesses.document(bid).collection("stock_alerts").stream()) == []
    with pytest.raises(HTTPException):
        store.subscribe_stock(bid, body)


def test_reminder_expires_after_seven_days(
    store: MerchantRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    bid, pid = setup_shop(store)
    device = uuid4()
    body = StockAlertInput(device_id=device, name="Kaya toast", unit="set")
    now = 1_800_000_000.0
    monkeypatch.setattr("time.time", lambda: now)
    receipt = store.subscribe_stock(bid, body)
    assert receipt.expires == now + ALERT_SECONDS
    now += ALERT_SECONDS
    store.set_availability("owner", bid, pid, True)
    assert store.stock_alerts(bid, str(device)) == []


def test_reminders_reject_missing_items_and_private_shops(store: MerchantRepository) -> None:
    bid, _ = setup_shop(store)
    body = StockAlertInput(device_id=uuid4(), name="Kopi", unit="cup")
    with pytest.raises(HTTPException) as missing:
        store.subscribe_stock(bid, body)
    assert missing.value.status_code == 404
    store.share("owner", bid, False)
    with pytest.raises(HTTPException):
        store.subscribe_stock(bid, body)


def test_reward_is_confirmed_public_and_bounded(store: MerchantRepository) -> None:
    bid, _ = setup_shop(store)
    shop = store.public_shop(bid)
    assert shop and shop["reward_text"] == "10th kopi free"
    assert "reward_text" not in BusinessFields(name="Kopi").model_dump()
    with pytest.raises(ValidationError):
        BusinessFields(name="Kopi", reward_text="x" * 81)
    business = store.list_businesses("owner")[0]
    proposal = store.propose(
        "owner",
        ProposalRequest(
            kind="business",
            business_id=bid,
            revision=business["revision"],
            business=BusinessFields(**{**business["fields"], "reward_text": ""}),
        ),
    )
    assert (store.public_shop(bid) or {})["reward_text"] == "10th kopi free"
    store.commit("owner", proposal["id"], proposal["digest"])
    assert "reward_text" not in (store.public_shop(bid) or {})


def test_capacity_is_bounded(store: MerchantRepository, monkeypatch: pytest.MonkeyPatch) -> None:
    bid, _ = setup_shop(store)
    # Small limit exercises the same transactional capacity branch without a large fixture.
    monkeypatch.setattr("app.merchant.MAX_ALERTS", 2)
    monkeypatch.setattr("app.merchant_firestore.MAX_ALERTS", 2)
    for _ in range(2):
        store.subscribe_stock(
            bid, StockAlertInput(device_id=uuid4(), name="Kaya toast", unit="set")
        )
    with pytest.raises(HTTPException) as full:
        store.subscribe_stock(
            bid, StockAlertInput(device_id=uuid4(), name="Kaya toast", unit="set")
        )
    assert full.value.status_code == 429


def test_anonymous_routes_validate_and_rate_limit(app) -> None:
    with TestClient(app) as owner:
        join(owner)
        proposal = owner.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                **OWNER_PIN,
                "business": {"name": "Kopi", "reward_text": "10th kopi free"},
                "products": [
                    {"name": "Kaya toast", "price": 240, "unit": "set", "available": False}
                ],
            },
        ).json()
        bid = owner.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()["business_id"]
        owner.post(f"/api/v1/businesses/{bid}/share", json={"public": True})
        app.state.v1_settings.rate_limits_enabled = True
        path = f"/api/v1/public/shops/{bid}/stock-alerts"
        device = str(uuid4())
        # Reuse the running app lifespan; entering a second one opens Qdrant twice.
        with closing(TestClient(app)) as customer:
            body = {"device_id": device, "name": "Kaya toast", "unit": "set"}
            assert customer.post(path, json={**body, "device_id": "bad"}).status_code == 422
            for _ in range(30):
                response = customer.post(path, json=body)
                assert response.status_code == 200
                assert response.json()["delivery"] == "in_page"
            assert customer.post(path, json=body).status_code == 429
            listed = customer.get(path, params={"device_id": device}).json()
            assert len(listed) == 1
            assert listed[0]["ready"] is False
            assert not customer.cookies


def test_concurrent_devices_cannot_exceed_capacity(
    store: MerchantRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    bid, _ = setup_shop(store)
    monkeypatch.setattr("app.merchant.MAX_ALERTS", 2)
    monkeypatch.setattr("app.merchant_firestore.MAX_ALERTS", 2)

    def subscribe(_: int) -> int:
        try:
            store.subscribe_stock(
                bid, StockAlertInput(device_id=uuid4(), name="Kaya toast", unit="set")
            )
            return 200
        except HTTPException as error:
            return error.status_code

    with ThreadPoolExecutor(max_workers=4) as workers:
        assert sorted(workers.map(subscribe, range(4))) == [200, 200, 429, 429]
