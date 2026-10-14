import json
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.merchant import MerchantRepository
from app.planning import Observation, backtest, change, demo_history, forecast, preparation, stale
from tests.test_merchant_store import create_with_products, store  # noqa: F401, F811
from tests.test_photos import app, join  # noqa: F401, F811

TODAY = date(2026, 10, 14)


def rows(values):
    return [
        Observation(
            date=TODAY - timedelta(days=len(values) - i), status="complete", sold=v
        ).model_dump(mode="json")
        for i, v in enumerate(values)
    ]


def test_i01_i02_i03_i04_i07_baseline():
    assert forecast([], TODAY, "cup")["status"] == "insufficient"
    assert forecast(rows([1, 2]), TODAY, "cup")["status"] == "insufficient"
    data = rows([80, 100, 90, 110])
    for status in ("closed", "missing", "stockout"):
        data.append(
            Observation(
                date=TODAY - timedelta(days=5),
                status=status,
                sold=1 if status == "stockout" else None,
            ).model_dump(mode="json")
        )
    result = forecast(data, TODAY, "cup")
    assert result["baseline"] == 95
    assert result["range_seen"] == [80, 110]
    assert result["n"] == 4 and result["unit"] == "cup"
    assert result["window"] == [r["date"] for r in data[:4]]
    assert result["source"] == "owner" and result["horizon_days"] == 1
    assert result["dataset_version"] == "daily-v1" and result["event_adjustment"] == "none"
    assert result["stockout_dates"] == [(TODAY - timedelta(days=5)).isoformat()]
    assert forecast(rows([0, 0, 0]), TODAY, "cup")["baseline"] == 0
    for status, sold in [("missing", 0), ("closed", 0), ("complete", None), ("stockout", None)]:
        with pytest.raises(ValidationError):
            Observation(date=TODAY, status=status, sold=sold)


def test_i08_i09_chronological_zero_and_worse():
    data = rows([0, 0, 0, 0, 0])
    assert backtest(data, "cup") == {"n": 2, "mae": 0, "naive_mae": 0, "prefer_naive": False}
    trend = rows([10, 20, 30, 40, 50, 60])
    assert backtest(trend, "cup")["prefer_naive"]
    before = forecast(trend, TODAY - timedelta(days=2), "cup")
    trend[-1]["sold"] = 100000
    assert forecast(trend, TODAY - timedelta(days=2), "cup") == before
    # First cutoff has exactly three prior days, never its own actual.
    assert backtest(rows([10, 20, 30, 40]), "cup")["mae"] == 20


def test_i10_i12_capacity_stale_and_demo():
    assert preparation(95, 20, 60) == {"needed": 75, "suggestion": 60, "gap": 15}
    assert preparation(95, 100, 60)["suggestion"] == 0
    assert preparation(95.1, 20, 0)["gap"] == 76
    assert not stale({"created_date": TODAY.isoformat()}, TODAY + timedelta(days=1))
    assert stale({"created_date": TODAY.isoformat()}, TODAY + timedelta(days=2))
    demo = demo_history(TODAY)
    assert demo == demo_history(TODAY) and len(demo) == 14
    assert {r["status"] for r in demo} == {"complete", "closed", "missing", "stockout"}
    assert forecast(demo, TODAY + timedelta(days=1), "cup")["baseline"] == 95


def test_seal_rejects_wrong_stale_or_replaced_proposal():
    state = change({}, "prepare", {"observations": rows([1])}, TODAY)
    assert "observations" not in state
    for day, digest in [(TODAY, "wrong"), (TODAY + timedelta(days=1), state["pending"]["digest"])]:
        with pytest.raises(HTTPException):
            change(state, "approve", {"digest": digest}, day)
    replaced = change(state, "prepare", {"observations": rows([2])}, TODAY)
    with pytest.raises(HTTPException):
        change(replaced, "approve", {"digest": state["pending"]["digest"]}, TODAY)


def test_i05_i06_i11_store_audit_isolation_and_erasure(store: MerchantRepository):  # noqa: F811
    bid = create_with_products(store)
    products = store.inventory("alice", bid)
    pid, other = products[0]["id"], products[1]["id"]
    store.share("alice", bid, True)
    public = store.public_shop(bid)
    business = store.context("alice", bid)["business"]
    for value in [80, 100]:
        snapshot = {
            "observations": [
                Observation(date=date.today(), status="complete", sold=value).model_dump(
                    mode="json"
                )
            ]
        }
        pending = store.planning("alice", bid, pid, "prepare", snapshot)["pending"]
        with pytest.raises(HTTPException):
            store.planning("bob", bid, pid, "approve", {"digest": pending["digest"]})
        saved = store.planning("alice", bid, pid, "approve", {"digest": pending["digest"]})
    assert len(saved["observations"]) == 1 and saved["observations"][0]["sold"] == 100
    assert saved["audit"][0]["sold"] == 80
    assert store.planning("alice", bid, other, "read", {}) == {}
    for decision in ["accepted", "edited", "declined"]:
        pending = store.planning(
            "alice",
            bid,
            pid,
            "prepare",
            {
                "plan": {
                    "created_date": date.today().isoformat(),
                    "decision": decision,
                    "quantity": 20,
                }
            },
        )["pending"]
        store.planning("alice", bid, pid, "approve", {"digest": pending["digest"]})
    assert store.inventory("alice", bid) == products
    assert store.context("alice", bid)["business"] == business
    assert store.public_shop(bid) == public
    with pytest.raises(HTTPException):
        store.planning("alice", bid, "../invalid", "read", {})
    pending = store.planning("alice", bid, pid, "prepare", {"observations": []})["pending"]
    store.set_availability("alice", bid, pid, False)
    with pytest.raises(HTTPException) as changed:
        store.planning("alice", bid, pid, "approve", {"digest": pending["digest"]})
    assert changed.value.status_code == 409
    store.erase_owner("alice")
    with pytest.raises(HTTPException):
        store.planning("alice", bid, pid, "read", {})
    if hasattr(store, "connect"):
        with store.connect() as db:
            assert db.execute("SELECT count(*) FROM planning").fetchone()[0] == 0
    else:
        assert list(store.businesses.document(bid).collection("planning").stream()) == []


def test_routes_consent_owner_forecast_and_private_decisions(app):  # noqa: F811
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        assert client.post("/api/v1/businesses/missing/planning/missing/demo").status_code == 428
        join(client)
        proposal = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                "business": {"name": "Tea"},
                "products": [{"name": "Chai", "price": 1500, "unit": "cup"}],
            },
        ).json()
        bid = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()["business_id"]
        inventory = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        pid = inventory[0]["id"]
        path = f"/api/v1/businesses/{bid}/planning/{pid}"
        assert client.post(path + "/forecast", json={}).json()["status"] == "insufficient"
        pending = client.post(path + "/demo").json()["pending"]
        assert (
            client.post(path + "/forecast", json={"source": "demo"}).json()["status"]
            == "insufficient"
        )
        assert client.post(path + "/approve", json={"digest": "0" * 64}).status_code == 409
        assert client.post(path + "/approve", json={"digest": pending["digest"]}).status_code == 200
        inputs = {"source": "demo", "ready_stock": 20, "capacity": 60}
        result = client.post(path + "/forecast", json=inputs).json()
        assert (result["baseline"], result["suggestion"], result["gap"]) == (95, 60, 15)
        assert result["product_id"] == pid and result["business_id"] == bid
        assert client.post(path + "/forecast", json={"capacity": -1}).status_code == 422
        assert client.post(path + "/forecast", json={"festival": "invented"}).status_code == 422
        assert (
            client.post(
                path + "/decision", json={**inputs, "decision": "edited", "quantity": 61}
            ).status_code
            == 422
        )
        for choice, number in [("accepted", 1), ("declined", 1)]:
            assert (
                client.post(
                    path + "/decision", json={**inputs, "decision": choice, "quantity": number}
                ).status_code
                == 422
            )
        for decision, quantity in [("accepted", 60), ("edited", 30), ("declined", 0)]:
            pending = client.post(
                path + "/decision", json={**inputs, "decision": decision, "quantity": quantity}
            ).json()["pending"]
            assert (
                client.post(path + "/approve", json={"digest": pending["digest"]}).status_code
                == 200
            )
        assert client.get(path).json()["plan"]["decision"] == "declined"
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == inventory
        # Every response must keep an old saved plan labelled stale, including writes.
        saved = client.get(path).json()
        saved.pop("today")
        saved["plan"]["created_date"] = (date.today() - timedelta(days=2)).isoformat()
        with app.state.merchant.connect() as db:
            db.execute(
                "UPDATE planning SET fields=? WHERE business_id=? AND product_id=?",
                (json.dumps(saved), bid, pid),
            )
        assert client.get(path).json()["plan"]["stale"]
        reviewed = client.post(path + "/demo").json()
        assert reviewed["plan"]["stale"]
        assert client.post(
            path + "/approve", json={"digest": reviewed["pending"]["digest"]}
        ).json()["plan"]["stale"]
        assert (
            client.post(
                path + "/observations",
                json={"date": date.today().isoformat(), "status": "missing", "sold": 0},
            ).status_code
            == 422
        )
    with TestClient(app) as other:
        join(other)
        assert other.get(path).status_code == 404
        assert other.post(path + "/demo").status_code == 404
