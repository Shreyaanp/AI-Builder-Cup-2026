"""Offline supply-chain boundary and route regressions."""

import json
from copy import deepcopy
from datetime import date

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app import supply_chain
from app.main import create_app
from app.region import money_text
from tests.test_merchant_routes import approve, settings  # noqa: F401 - shared fixture
from tests.test_photos import join
from tests.test_supply_chain import http_shop


@pytest.fixture
def supply_client(settings):  # noqa: F811
    with TestClient(create_app(settings, InMemorySessionService())) as client:
        join(client)
        yield client


def new_order(client):
    bid = http_shop(client)
    base = f"/api/v1/businesses/{bid}/supply"
    response = client.post(f"{base}/reorder", json={"quantity": None})
    assert response.status_code == 200, response.text
    po = response.json()["order"]
    url = f"{base}/orders/{po['id']}"
    for check in po["checks"]:
        if check["blocking"] and check["fix"]:
            po = post_order(client, url, po, "fix", fix=check["fix"])
    return url, po


def post_order(client, url, po, action, **fields):
    response = client.post(f"{url}/{action}", json={"version": po["version"], **fields})
    assert response.status_code == 200, response.text
    saved = response.json()
    return saved["order"] if action == "received" else saved


def test_supply_routes_complete_lifecycle_and_reject_status_jumps(supply_client):
    client = supply_client
    url, po = new_order(client)
    assert po["reason"]["method"] == "weekday_average"
    for action, status in [
        (None, "draft"),
        ("approve", "sent"),
        ("simulate", "confirmed"),
        ("simulate", "dispatched"),
        ("simulate", "invoiced"),
        ("received", "invoiced"),
        ("accept", "closed"),
    ]:
        if action:
            old_version = po["version"]
            po = post_order(client, url, po, action)
            assert po["version"] == old_version + 1
        assert po["status"] == status
        invalid = {
            "draft": ["accept", "received", "simulate"],
            "sent": ["approve", "accept", "received"],
            "confirmed": ["approve", "cancel", "received", "accept"],
            "dispatched": ["approve", "cancel", "accept"],
            "invoiced": ["approve", "cancel", "simulate"],
            "closed": ["approve", "cancel", "simulate", "received", "accept"],
        }[status]
        if status == "invoiced" and not po.get("received"):
            invalid = [*invalid, "accept"]
        stored = client.get(url).json()
        for forbidden in invalid:
            response = client.post(f"{url}/{forbidden}", json={"version": po["version"]})
            assert response.status_code == 409, (status, forbidden, response.text)
            assert client.get(url).json() == stored
    assert [doc["kind"] for doc in po["documents"]] == ["ORDERS", "ORDRSP", "DESADV", "INVOIC"]
    assert po["match"] == [] and po["open_flags"] == 0


def test_supply_routes_missing_and_null_fields_never_mutate_order(supply_client):
    client = supply_client
    url, po = new_order(client)
    stored = client.get(url).json()
    for action, fields in {
        "approve": {},
        "cancel": {},
        "accept": {},
        "received": {},
        "simulate": {"variant": "full"},
        "inbound": {"text": "not a document"},
        "fix": {"fix": {"kind": "quantity", "line": 10, "value": 10}},
        "flags/unknown": {"value": "10"},
    }.items():
        valid = {"version": po["version"], **fields}
        for field in valid:
            missing = {key: value for key, value in valid.items() if key != field}
            for payload in (missing, {**valid, field: None}):
                response = client.post(f"{url}/{action}", json=payload)
                expected = (
                    409
                    if action == "simulate" and field == "variant" and payload == missing
                    else 422
                )
                assert response.status_code == expected, (action, payload, response.text)
                assert client.get(url).json() == stored
    for fix in ({"kind": "quantity"}, {"kind": "quantity", "line": None, "value": None}):
        response = client.post(f"{url}/fix", json={"version": po["version"], "fix": fix})
        assert response.status_code == 422
        assert client.get(url).json() == stored


def test_supply_inbound_missing_and_null_document_fields(supply_client):
    client = supply_client
    url, po = new_order(client)
    po = post_order(client, url, po, "approve")
    stored = client.get(url).json()
    canonical = {**po["documents"][0]["canonical"], "kind": "ORDRSP", "ref": po["number"]}
    for path in [(key,) for key in ("kind", "number", "issued", "currency", "lines")] + [
        ("lines", 0, key) for key in ("line", "item", "quantity", "unit")
    ]:
        for null in (False, True):
            doc = deepcopy(canonical)
            parent = doc
            for part in path[:-1]:
                parent = parent[part]
            if null:
                parent[path[-1]] = None
            else:
                del parent[path[-1]]
            response = client.post(
                f"{url}/inbound",
                json={
                    "version": po["version"],
                    "text": json.dumps(doc),
                },
            )
            assert response.status_code == 422, (path, null, response.text)
            assert client.get(url).json() == stored


def test_supply_incomplete_forecast_preserves_valid_rows():
    need = supply_chain.need_from_forecast(
        {"stock": None},
        {
            "predictions": [
                None,
                {"item": "Sugar", "date": "2026-10-18", "quantity": None},
                {"item": "Sugar", "date": "2026-10-19", "quantity": 3, "upper": None},
                {"item": "Sugar", "date": "2026-10-18", "quantity": 0},
            ]
        },
        "Sugar",
        date(2026, 10, 17),
    )
    assert need["rows"] == 2 and need["daily"] == 1.5
    assert need["runs_out"] == "2026-10-19"


@pytest.mark.parametrize(
    "currency,lat,lng,zone,mark",
    [
        ("INR", 12.9716, 77.5946, "Asia/Kolkata", "₹"),
        ("SGD", 1.3521, 103.8198, "Asia/Singapore", "S$"),
    ],
)
def test_supply_currency_follows_shop_region(supply_client, currency, lat, lng, zone, mark):
    client = supply_client
    proposal = client.post(
        "/api/v1/proposals",
        json={
            "kind": "business",
            "business": {
                "name": "Regional Grocer",
                "category": "Grocery",
                "lat": lat,
                "lng": lng,
                "currency": currency,
                "timezone": zone,
            },
            "products": [{"name": "Sugar", "price": 4800, "unit": "kg", "stock": None}],
        },
    )
    assert proposal.status_code == 200, proposal.text
    bid = approve(client, proposal.json())["business_id"]
    base = f"/api/v1/businesses/{bid}/supply"
    response = client.post(f"{base}/reorder", json={"item": "Sugar", "quantity": 10})
    assert response.status_code == 200, response.text
    po = response.json()["order"]
    assert po["currency"] == currency
    assert supply_chain.summary(po)["currency"] == currency
    assert money_text(po["total"], po["currency"]).startswith(mark)
    assert {row["currency"] for row in client.get(base).json()["suppliers"]} == {currency}
    url = f"{base}/orders/{po['id']}"
    po = post_order(client, url, po, "approve")
    assert po["documents"][0]["canonical"]["currency"] == currency


@pytest.mark.parametrize(
    "forecast",
    [
        {},
        {"predictions": None},
        {
            "predictions": [
                None,
                {},
                {"item": None},
                {"item": "Sugar"},
                {"item": "Sugar", "date": "2026-10-18", "quantity": None},
            ]
        },
    ],
)
def test_supply_incomplete_forecast_never_crashes(forecast):
    need = supply_chain.need_from_forecast(None, forecast, "Sugar", date(2026, 10, 17))
    assert need["daily"] == 0 and need["rows"] == 0
    assert not need["stock_known"]


def test_supply_overview_is_limited_and_reuses_cached_forecast(supply_client):
    from unittest.mock import AsyncMock

    from app.limits import LIMITS

    client = supply_client
    bid = http_shop(client)
    service = client.app.state.forecaster
    inner = AsyncMock(wraps=service._forecast)
    service._forecast = inner
    path = f"/api/v1/businesses/{bid}/supply"
    assert client.get(path).status_code == 200
    assert client.get(path).status_code == 200
    assert inner.await_count <= 1  # the second open is served from the forecast cache
    maximum, _ = LIMITS["supply:read"][0]
    codes = [client.get(path).status_code for _ in range(maximum)]
    assert codes[-1] == 429
