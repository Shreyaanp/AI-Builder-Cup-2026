"""Local-only payment handoffs: ownership, persistence, validation and real ADK transport."""

import json
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.coordinator import MerchantContext, current
from app.merchant import BusinessFields, MerchantRepository, ProposalRequest
from app.payments import prepare_payment_link
from tests.test_community import app as app
from tests.test_merchant_store import store as store


def create(store: MerchantRepository, **fields) -> str:
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Tea & Toast", currency="INR", upi_id="tea.store@bank", **fields
            ),
        ),
    )
    return store.commit("alice", proposal["id"], proposal["digest"])["business_id"]


@pytest.mark.parametrize("value", ["bad", "a@b", "bad id@bank", "bad@bank?am=1", "bad@", "@bank"])
def test_upi_format(value):
    with pytest.raises(ValidationError):
        BusinessFields(name="Tea", upi_id=value)


async def test_owned_tool_and_approved_settings_persist(store):
    bid = create(store, rider_providers=["uber"])
    context = store.context("alice", bid)
    assert context["business"]["fields"]["rider_providers"] == ["uber"]
    token = current.set(MerchantContext(store, "alice", bid, []))
    try:
        result = await prepare_payment_link("240", "Tea & toast #4")
        assert result["status"] == "prepared"
        card = result["payment"]
        assert parse_qs(urlsplit(card["url"]).query) == {
            "pa": ["tea.store@bank"],
            "pn": ["Tea & Toast"],
            "am": ["240.00"],
            "cu": ["INR"],
            "tn": ["Tea & toast #4"],
        }
        assert current.get().cards[result["card_id"]][1] == card
        assert store.context("alice", bid) == context  # no money, inventory or shop write
    finally:
        current.reset(token)
    token = current.set(MerchantContext(store, "bob", bid, []))
    try:
        with pytest.raises(HTTPException) as denied:
            await prepare_payment_link("240")
        assert denied.value.status_code == 404
    finally:
        current.reset(token)


@pytest.mark.parametrize(
    "amount", ["0", "-1", "1.234", "NaN", "Infinity", "1e3", "10000000.01", "1,000", "9" * 400]
)
async def test_tool_rejects_invalid_amounts(store, amount):
    bid = create(store)
    ctx = MerchantContext(store, "alice", bid, [])
    token = current.set(ctx)
    try:
        assert (await prepare_payment_link(amount))["status"] == "invalid"
        assert not ctx.cards
        assert (await prepare_payment_link("0.01"))["payment"]["amount"] == "0.01"
        assert (await prepare_payment_link("10000000"))["status"] == "prepared"
        assert (await prepare_payment_link("240", "x" * 81))["status"] == "invalid"
    finally:
        current.reset(token)


async def test_tool_requires_shop_upi_and_inr(store):
    assert (await prepare_payment_link("240"))["status"] == "needs_business"
    for fields, status in [
        ({"currency": "INR"}, "add_upi_id"),
        ({"currency": "SGD", "upi_id": "shop@bank"}, "inr_only"),
    ]:
        proposal = store.propose(
            "alice", ProposalRequest(kind="business", business=BusinessFields(name="Tea", **fields))
        )
        bid = store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
        context = MerchantContext(store, "alice", bid, [])
        token = current.set(context)
        try:
            assert (await prepare_payment_link("240"))["status"] == status
            assert not context.cards
        finally:
            current.reset(token)


def test_stream_payment_card_restores_and_requires_owned_shop(app):
    from tests.test_photos import join

    with TestClient(app) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                "business": {"name": "Owner tea", "currency": "INR", "upi_id": "owner@bank"},
            },
        ).json()
        bid = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve",
            json={
                "digest": proposal["digest"],
            },
        ).json()["business_id"]
        response = client.post(
            "/api/v1/coach/stream",
            json={
                "message": "send a payment link for ₹240 to the customer",
                "business_id": bid,
            },
        )
        assert response.status_code == 200, response.text
        events = [
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        ]
        card = next(event["data"] for event in events if event["kind"] == "payment_link")
        assert card["amount"] == "240.00" and card["upi_id"] == "owner@bank"
        sid = events[0]["session_id"]
        history = client.get(f"/api/v1/conversations/{sid}").json()["messages"]
        assert (
            next(message["payment"] for message in history if message["role"] == "payment") == card
        )
        assert "nothing" in next(
            event["text"].lower() for event in events if event["kind"] == "reply"
        )
        # Never turn an unsupported numeric form into a smaller, valid payment request.
        invalid = client.post(
            "/api/v1/coach/stream",
            json={"message": "send a payment link for 1e3 to the customer", "business_id": bid},
        )
        assert invalid.status_code == 200
        assert '"kind":"payment_link"' not in invalid.text
        client.cookies.clear()
        join(client)
        assert client.get(f"/api/v1/conversations/{sid}").status_code == 404
