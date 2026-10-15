import json
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.agent import instruction, new_shop_call
from app.coordinator import (
    MerchantContext,
    ProductInput,
    current,
    propose_business,
    propose_customer_facts,
    propose_products,
)
from app.discover import MapsService, prepare_pin
from app.main import create_app
from app.merchant import (
    BusinessFields,
    MerchantStore,
    NewShopDraft,
    OwnerLocation,
    ProductFields,
    ProposalRequest,
)
from tests.test_discover import settings
from tests.test_photos import join


@pytest.mark.parametrize("existing", [False, True])
async def test_device_point_is_sealed_reviewed_and_never_a_demo(tmp_path: Path, existing: bool):
    store = MerchantStore(str(tmp_path / "shops.sqlite"))
    before = BusinessFields(
        name="First shop", location="Tiong Bahru", lat=1.28, lng=103.83, pin_demo=True
    )
    bid = None
    if existing:
        initial = store.propose("alice", ProposalRequest(kind="business", business=before))
        bid = store.commit("alice", initial["id"], initial["digest"])["business_id"]
    body = ProposalRequest(
        kind="business",
        business_id=bid,
        revision=1 if bid else 0,
        business=before,
        owner_location=OwnerLocation(lat=12.9718234, lng=77.6412345, accuracy_m=19.2),
    )
    maps = MapsService(settings(tmp_path))
    try:
        await prepare_pin(body, store, "alice", maps)
    finally:
        await maps.close()
    proposal = store.propose("alice", body)
    fields = proposal["snapshot"]["business"]
    assert fields["lat"] == 12.9718234 and fields["lng"] == 77.6412345
    assert fields["pin_source"] == "device" and fields["pin_accuracy_m"] == 19.2
    assert not fields.get("pin_demo") and fields["pin_label"] == "Near Indiranagar"
    if bid:
        assert store.context("alice", bid)["business"]["fields"]["lat"] == 1.28
    else:
        assert store.list_businesses("alice") == []
    receipt = store.commit("alice", proposal["id"], proposal["digest"])
    saved = store.context("alice", receipt["business_id"])["business"]["fields"]
    assert saved["pin_source"] == "device" and saved["pin_accuracy_m"] == 19.2


@pytest.mark.parametrize("unavailable", [False, True])
async def test_reverse_address_never_moves_measured_point(tmp_path: Path, unavailable: bool):
    def provider(request: httpx.Request):
        assert request.url.params["latlng"] == "12.9718234,77.6412345"
        if unavailable:
            return httpx.Response(503)
        return httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [
                    {
                        "place_id": "fixture-place",
                        "formatted_address": "Example Road, Bengaluru",
                        "geometry": {"location": {"lat": 12.9, "lng": 77.6}},
                    }
                ],
            },
        )

    maps = MapsService(settings(tmp_path, live=True), httpx.MockTransport(provider))
    store = MerchantStore(str(tmp_path / "shops.sqlite"))
    body = ProposalRequest(
        kind="business",
        business=BusinessFields(name="Tea"),
        owner_location=OwnerLocation(lat=12.9718234, lng=77.6412345, accuracy_m=20),
    )
    try:
        await prepare_pin(body, store, "alice", maps)
    finally:
        await maps.close()
    assert body.business and body.business.lat == 12.9718234
    assert body.business.lng == 77.6412345 and body.business.pin_source == "device"
    assert body.business.location == ("" if unavailable else "Example Road, Bengaluru")


def test_guided_tools_accumulate_one_new_shop_without_writes(tmp_path: Path):
    store = MerchantStore(str(tmp_path / "shops.sqlite"))
    context = MerchantContext(
        store, "alice", None, [], new_shop=True, new_shop_draft=NewShopDraft()
    )
    token = current.set(context)
    try:
        assert "NEW SHOP mode" in instruction(None)  # type: ignore[arg-type]
        assert (
            propose_business("Chai Corner", category="Tea stall", description="Fresh chai.")[
                "status"
            ]
            == "needs_review"
        )
        assert (
            propose_products([ProductInput(name="Chai", price=15, unit="cup")])["status"]
            == "needs_review"
        )
        assert (
            propose_customer_facts(payment_methods=["UPI"], delivery="none")["status"]
            == "needs_review"
        )
        result = propose_business("", hours="7am–8pm")
        proposal = context.proposals[result["proposal_id"]]
        assert proposal["snapshot"]["products"][0]["name"] == "Chai"
        assert proposal["snapshot"]["business"]["payment_methods"] == ["UPI"]
        assert proposal["snapshot"]["business"]["description"] == "Fresh chai."
        assert store.list_businesses("alice") == []
        receipt = store.commit("alice", proposal["id"], proposal["digest"])
        assert len(store.inventory("alice", receipt["business_id"])) == 1
    finally:
        current.reset(token)


def test_menu_only_draft_suggests_name_but_preserves_an_explicit_name(tmp_path: Path):
    context = MerchantContext(
        MerchantStore(str(tmp_path / "shops.sqlite")),
        "alice",
        None,
        [],
        new_shop=True,
        new_shop_draft=NewShopDraft(
            products=[ProductFields(name="Chai", price=1500, unit="cup", category="Drinks")]
        ),
    )
    suggestion = new_shop_call("Help with my shop", context)
    assert suggestion and suggestion.function_call
    assert suggestion.function_call.args["name"] == "Chai Corner"
    explicit = new_shop_call("name: Actual Shop", context)
    assert explicit and explicit.function_call
    assert explicit.function_call.args["name"] == "Actual Shop"


def test_new_shop_session_mode_is_owned_and_cannot_target_existing_shop(tmp_path: Path):
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        assert (
            client.post(
                "/api/v1/coach/stream",
                json={
                    "message": "name: Second",
                    "new_shop": True,
                    "business_id": str(uuid4()),
                },
            ).status_code
            == 422
        )
        response = client.post(
            "/api/v1/coach/stream",
            json={
                "message": "name: Second; category: Bakery",
                "new_shop": True,
            },
        )
        events = [
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        ]
        sid = events[0]["session_id"]
        assert any(event["kind"] == "proposal" for event in events)
        assert client.get("/api/v1/businesses").json() == []
        assert (
            client.post(
                "/api/v1/coach/stream",
                json={
                    "message": "hello",
                    "session_id": sid,
                },
            ).status_code
            == 404
        )
        assert not app.state.services.registry.active
        with client.websocket_connect(
            "/api/v1/voice?new_shop=true",
            headers={
                "origin": "http://127.0.0.1:3200",
            },
        ) as socket:
            socket.send_json({"kind": "new_shop", "draft": {"business": {"name": "Voice shop"}}})
            assert socket.receive_json()["kind"] == "ready"
            socket.send_json({"kind": "text", "text": "hours: 8am–6pm"})
            proposed = False
            while True:
                event = socket.receive_json()
                if event["kind"] == "proposal":
                    proposed = True
                    assert event["data"]["snapshot"]["business"]["name"] == "Voice shop"
                if event["kind"] == "turn_complete":
                    break
            socket.send_json({"kind": "close"})
            assert proposed
        assert client.get("/api/v1/businesses").json() == []


@pytest.mark.parametrize(
    "point",
    [
        {"lat": 91, "lng": 0, "accuracy_m": 20},
        {"lat": 0, "lng": 181, "accuracy_m": 20},
        {"lat": 0, "lng": 0, "accuracy_m": -1},
        {"lat": 0, "lng": 0},
    ],
)
def test_invalid_device_location_is_rejected(tmp_path: Path, point: dict):
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        assert (
            client.post(
                "/api/v1/proposals",
                json={
                    "kind": "business",
                    "business": {"name": "Tea"},
                    "owner_location": point,
                },
            ).status_code
            == 422
        )
