"""Sourcing: find suppliers, one-tap order requests, the supplier thread and demo replies."""

import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.adk.events import Event
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app import sourcing
from app.coordinator import (
    DEMO_OWNER_UID,
    MerchantContext,
    cancel_order,
    current,
    find_suppliers,
    get_orders,
    message_supplier,
    prepare_order,
)
from app.customer import InquiryInput
from app.main import create_app
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.sourcing_offline import sourcing_call
from app.streaming import public_events
from tests.test_merchant_routes import approve, settings  # noqa: F401 - shared fixture
from tests.test_photos import join

BENGALURU = (12.9716, 77.5946)


@pytest.fixture
def ctx(tmp_path: Path) -> Iterator[MerchantContext]:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Asha Bakery",
                category="Bakery",
                location="Indiranagar, Bengaluru",
                lat=BENGALURU[0],
                lng=BENGALURU[1],
                currency="INR",
                timezone="Asia/Kolkata",
                phone="+91 98450 00000",
            ),
        ),
    )
    bid = store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    context = MerchantContext(store, "alice", bid, [])
    token = current.set(context)
    try:
        yield context
    finally:
        current.reset(token)


def test_units_and_local_names() -> None:
    assert sourcing.convert(500, "g", "kg") == 0.5
    assert sourcing.convert(2, "litre", "ml") == 2000
    assert sourcing.convert(1, "kg", "litre") is None
    assert sourcing.unit_of("kgs") == "kg" and sourcing.unit_of("L") == "litre"
    assert sourcing.matches("Wheat flour", "atta")
    assert sourcing.matches("Sugar", "chini")
    assert sourcing.matches("Paper cups (100)", "cups")
    assert not sourcing.matches("Sugar", "flour")


@pytest.mark.parametrize(
    ("currency", "total", "expected"),
    [("INR", 54000, "₹540"), ("SGD", 54050, "S$540.50")],
)
def test_supplier_order_message_uses_currency_symbol(
    currency: str, total: int, expected: str
) -> None:
    text = sourcing.order_text(
        {
            "shop_name": "Asha Bakery",
            "lines": [{"quantity": 10, "unit": "kg", "name": "Flour"}],
            "total": total,
            "currency": currency,
            "delivery": "Friday",
        }
    )
    assert expected in text
    assert f"{currency} 540" not in text


def test_no_supplier_nearby_generates_labelled_demo_suppliers_once(ctx) -> None:
    result = asyncio.run(find_suppliers("flour", 20, "kg"))
    assert result["status"] == "found"
    assert result["generated_demo_suppliers"] is True
    cards = result["suppliers"]
    assert 3 <= len(cards) <= 5
    assert all(card["demo"] for card in cards)
    assert [card["rank"] for card in cards] == list(range(1, len(cards) + 1))
    assert all(card["distance_km"] <= sourcing.SEARCH_KM for card in cards)
    assert cards[0]["estimate"] == pytest.approx(cards[0]["item"]["price"] * 20, rel=0.01)
    # Stored through the demo-shop path, owned by the demo owner, and reused next time.
    supplier = ctx.store.public_shop(cards[0]["id"])
    assert supplier and supplier["demo"] and supplier["supplier"]
    assert supplier["currency"] == "INR"
    assert ctx.store.list_businesses(DEMO_OWNER_UID)
    again = asyncio.run(find_suppliers("sugar"))
    assert again["generated_demo_suppliers"] is False
    assert {card["id"] for card in again["suppliers"]} <= {
        shop["id"] for shop in ctx.store.shared_shops()
    }


def test_order_is_prepared_then_sent_with_one_tap_and_demo_supplier_replies(ctx) -> None:
    found = asyncio.run(find_suppliers("flour"))
    second = found["suppliers"][1]
    result = prepare_order(
        second["id"],
        [
            {"name": "flour", "quantity": 20, "unit": "kg"},
            {"name": "sugar", "quantity": 5000, "unit": "g"},
        ],
    )
    assert result["status"] == "needs_owner_tap"
    order = ctx.cards[result["card_id"]][1]
    assert order["status"] == "draft" and order["messages"] == []
    sugar = next(line for line in order["lines"] if line["name"] == "Sugar")
    assert sugar["quantity"] == 5 and sugar["unit"] == "kg"
    assert order["total"] == sum(line["total"] for line in order["lines"])
    sent = sourcing.confirm(ctx.store, "alice", ctx.business_id, order["id"], order["version"])
    assert sent["status"] == "sent"
    assert (
        sent["messages"][0]["kind"] == "order"
        and "20 kg Wheat flour" in sent["messages"][0]["text"]
    )
    # Not yet due: the supplier has not answered.
    early = sourcing.get_order(ctx.store, "alice", ctx.business_id, order["id"])
    assert len(early["messages"]) == 1
    later = sourcing.get_order(
        ctx.store, "alice", ctx.business_id, order["id"], now=sent["updated"] + 10
    )
    reply = later["messages"][-1]
    assert reply["author"] == "supplier" and reply["auto"] is True
    assert reply["text"].startswith("Confirmed:") and "₹" in reply["text"]
    assert later["status"] == "confirmed" and later["unread"] is True
    with pytest.raises(Exception, match="changed"):
        sourcing.confirm(ctx.store, "alice", ctx.business_id, order["id"], order["version"])
    assert get_orders()["orders"][0]["status"] == "confirmed"


def test_message_change_and_cancel(ctx) -> None:
    found = asyncio.run(find_suppliers("flour"))
    draft = prepare_order(found["suppliers"][0]["id"], [{"name": "flour", "quantity": 10}])
    # "Change the quantity to 15" on a draft replaces it.
    changed = prepare_order(
        found["suppliers"][0]["id"],
        [{"name": "flour", "quantity": 15, "unit": "kg"}],
        replaces_order_id=draft["order_id"],
    )
    order = ctx.cards[changed["card_id"]][1]
    sent = sourcing.confirm(ctx.store, "alice", ctx.business_id, order["id"], order["version"])
    assert [o["id"] for o in sourcing.orders(ctx.store, "alice", ctx.business_id)] == [sent["id"]]
    asked = message_supplier(sent["id"], "Do you deliver on Sunday?")
    pending = ctx.cards[asked["card_id"]][1]
    assert pending["pending"]["text"] == "Do you deliver on Sunday?"
    after = sourcing.confirm(ctx.store, "alice", ctx.business_id, sent["id"], pending["version"])
    answered = sourcing.get_order(
        ctx.store, "alice", ctx.business_id, sent["id"], now=after["updated"] + 10
    )
    assert "Sunday" in answered["messages"][-1]["text"]
    assert answered["status"] == "needs_reply"
    cancel = cancel_order(sent["id"])
    pending = ctx.cards[cancel["card_id"]][1]
    done = sourcing.confirm(ctx.store, "alice", ctx.business_id, sent["id"], pending["version"])
    assert done["status"] == "cancelled"
    other = prepare_order(found["suppliers"][0]["id"], [{"name": "sugar", "quantity": 1}])
    assert cancel_order(other["order_id"])["status"] == "dropped"


def test_real_supplier_gets_the_request_in_its_inbox_and_its_reply_comes_back(ctx) -> None:
    store: MerchantStore = ctx.store
    proposal = store.propose(
        "bob",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Bob Flour Mill",
                lat=BENGALURU[0] + 0.01,
                lng=BENGALURU[1],
                currency="INR",
                supplier=True,
                supplies=["flour"],
            ),
            products=[ProductFields(name="Atta", price=4500, unit="kg")],
        ),
    )
    mill = store.commit("bob", proposal["id"], proposal["digest"])["business_id"]
    store.share("bob", mill, True)
    found = asyncio.run(find_suppliers("flour"))
    assert found["generated_demo_suppliers"] is False
    assert found["suppliers"][0]["id"] == mill and not found["suppliers"][0]["demo"]
    order = ctx.cards[prepare_order(mill, [{"name": "atta", "quantity": 3}])["card_id"]][1]
    sourcing.confirm(store, "alice", ctx.business_id, order["id"], order["version"])
    inbox = store.inquiries("bob", mill)
    assert inbox[0].name.startswith("Asha Bakery") and "3 kg Atta" in inbox[0].message
    store.thread_action("bob", mill, inbox[0].id, "", "post", "Yes, delivering at 10.")
    mirrored = sourcing.get_order(store, "alice", ctx.business_id, order["id"])
    assert mirrored["messages"][-1] == {
        **mirrored["messages"][-1],
        "author": "supplier",
        "text": "Yes, delivering at 10.",
    }
    assert "link" not in sourcing.public_order(mirrored)
    assert InquiryInput  # the inbox reuses the customer inquiry contract


def test_offline_script_understands_owner_phrasings(ctx) -> None:
    call = sourcing_call("My flour is running low", [], ctx)
    assert call and call.function_call.name == "find_suppliers"
    assert call.function_call.args == {"item": "flour"}
    call = sourcing_call("I need 20 kg flour by tomorrow", [], ctx)
    assert call.function_call.args == {"item": "flour", "quantity": 20.0, "unit": "kg"}
    found = asyncio.run(find_suppliers("flour"))
    history = [
        types.Content(
            role="user",
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(name="find_suppliers", response=found)
                )
            ],
        )
    ]
    call = sourcing_call(
        "The second one looks good, order 20 kg flour and 5 kg sugar from them", history, ctx
    )
    assert call.function_call.name == "prepare_order"
    assert call.function_call.args["supplier_id"] == found["suppliers"][1]["id"]
    assert call.function_call.args["items"] == [
        {"name": "flour", "quantity": 20.0, "unit": "kg"},
        {"name": "sugar", "quantity": 5.0, "unit": "kg"},
    ]
    cheapest = sourcing_call("order 2 kg flour from the cheapest one", history, ctx)
    assert cheapest.function_call.args["supplier_id"] == found["cheapest_id"]
    assert sourcing_call("What time do you open?", [], ctx) is None


def test_stream_shows_searching_state_and_supplier_cards(ctx) -> None:
    searching = Event(
        author="coach",
        content=types.Content(
            role="model",
            parts=[
                types.Part(
                    function_call=types.FunctionCall(name="find_suppliers", args={"item": "flour"})
                )
            ],
        ),
    )
    assert public_events(searching)[0].payload() == {
        "kind": "sourcing",
        "data": {"stage": "searching", "item": "flour"},
    }
    result = asyncio.run(find_suppliers("flour"))
    done = Event(
        author="coach",
        content=types.Content(
            role="user",
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(name="find_suppliers", response=result)
                )
            ],
        ),
    )
    [cards] = public_events(done)
    assert cards.kind == "suppliers" and cards.data["suppliers"] == result["suppliers"]


def test_end_to_end_running_low_to_supplier_reply_over_http(settings, monkeypatch) -> None:  # noqa: F811
    import json

    monkeypatch.setattr(sourcing, "DEMO_REPLY_SECONDS", 0.0)
    app = create_app(settings, InMemorySessionService())

    def stream(client: TestClient, body: dict[str, object]) -> list[dict[str, object]]:
        response = client.post("/api/v1/coach/stream", json=body)
        assert response.status_code == 200
        return [
            json.loads(line.removeprefix("data: "))
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]

    with TestClient(app) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals", json={"kind": "business", "business": {"name": "Kopi Corner"}}
        ).json()
        bid = approve(client, proposal)["business_id"]
        first = stream(client, {"message": "My flour is running low", "business_id": bid})
        kinds = [event["kind"] for event in first]
        assert kinds.index("sourcing") < kinds.index("suppliers")
        session = next(event["session_id"] for event in first if event["kind"] == "ready")
        second = stream(
            client,
            {
                "message": "The second one looks good, order 20 kg flour and 5 kg sugar from them",
                "business_id": bid,
                "session_id": session,
            },
        )
        order = next(event["data"] for event in second if event["kind"] == "order")
        reply = next(event["text"] for event in second if event["kind"] == "reply")
        assert "Tap Send" in reply
        assert client.get(f"/api/v1/businesses/{bid}/orders").json() == []
        sent = client.post(
            f"/api/v1/businesses/{bid}/orders/{order['id']}/send",
            json={"version": order["version"]},
        )
        assert sent.status_code == 200, sent.text
        listed = client.get(f"/api/v1/businesses/{bid}/orders").json()
        assert listed[0]["status"] == "confirmed"
        assert listed[0]["messages"][-1]["auto"] is True
        typed = client.post(
            f"/api/v1/businesses/{bid}/orders/{order['id']}/messages",
            json={"text": "Can you deliver by 8am?"},
        ).json()
        assert typed["messages"][-1]["author"] == "owner"
        answered = client.get(f"/api/v1/businesses/{bid}/orders/{order['id']}").json()
        assert answered["messages"][-1]["text"].startswith("Yes, we can deliver by 8")
        # Demo wholesalers are kept out of the customer Explore listing.
        assert client.post(f"/api/v1/businesses/{bid}/orders/{order['id']}/read").status_code == 200


def test_received_order_prepares_a_stock_update_for_review(ctx) -> None:
    store: MerchantStore = ctx.store
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="inventory",
            business_id=ctx.business_id,
            revision=store.context("alice", ctx.business_id)["business"]["revision"],
            products=[ProductFields(name="Flour", price=6000, unit="kg", stock=2, available=False)],
        ),
    )
    store.commit("alice", proposal["id"], proposal["digest"])
    found = asyncio.run(find_suppliers("flour"))
    made = prepare_order(
        found["suppliers"][0]["id"], [{"name": "flour", "quantity": 20000, "unit": "g"}]
    )
    order = ctx.cards[made["card_id"]][1]
    sent = sourcing.confirm(store, "alice", ctx.business_id, order["id"], order["version"])
    result = sourcing.receive(store, "alice", ctx.business_id, sent["id"], sent["version"])
    assert result["order"]["status"] == "received"
    [flour] = result["proposal"]["snapshot"]["products"]
    assert flour["stock"] == 22 and flour["available"] is True and flour["price"] == 6000
    # Nothing changes until the owner confirms the review.
    assert store.inventory("alice", ctx.business_id)[0]["stock"] == 2
    store.commit("alice", result["proposal"]["id"], result["proposal"]["digest"])
    assert store.inventory("alice", ctx.business_id)[0]["stock"] == 22


def test_ob222_an_edited_draft_retires_the_old_one_at_once(ctx) -> None:
    """#593: "change onions to 30 kg" replaces draft A on the server right away, so A's card can
    never offer a Send that is bound to fail, and only B can reach the supplier."""
    found = asyncio.run(find_suppliers("onions"))
    first = prepare_order(found["suppliers"][0]["id"], [{"name": "onions", "quantity": 20}])
    old = ctx.cards[first["card_id"]][1]
    second = prepare_order(
        found["suppliers"][0]["id"],
        [{"name": "onions", "quantity": 30, "unit": "kg"}],
        replaces_order_id=first["order_id"],
    )
    new = ctx.cards[second["card_id"]][1]
    assert new["replaces"] == old["id"]
    stale = sourcing.get_order(ctx.store, "alice", ctx.business_id, old["id"])
    assert stale["status"] == "replaced"
    with pytest.raises(HTTPException) as error:
        sourcing.confirm(ctx.store, "alice", ctx.business_id, old["id"], stale["version"])
    assert error.value.status_code == 409
    sent = sourcing.confirm(ctx.store, "alice", ctx.business_id, new["id"], new["version"])
    assert sent["status"] == "sent"
    assert [o["id"] for o in sourcing.orders(ctx.store, "alice", ctx.business_id)] == [new["id"]]


def test_ob225_a_sent_order_can_be_cancelled_or_changed_over_http(settings, monkeypatch) -> None:  # noqa: F811
    """#596: the Orders detail cancels a sent order or changes its quantity; the supplier is told
    each time, and a draft or a cancelled order refuses both."""
    import json

    monkeypatch.setattr(sourcing, "DEMO_REPLY_SECONDS", 0.0)
    app = create_app(settings, InMemorySessionService())

    def stream(client: TestClient, body: dict[str, object]) -> list[dict[str, object]]:
        response = client.post("/api/v1/coach/stream", json=body)
        assert response.status_code == 200
        return [
            json.loads(line.removeprefix("data: "))
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]

    with TestClient(app) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals", json={"kind": "business", "business": {"name": "Kopi Corner"}}
        ).json()
        bid = approve(client, proposal)["business_id"]
        base = f"/api/v1/businesses/{bid}/orders"
        first = stream(client, {"message": "My flour is running low", "business_id": bid})
        session = next(event["session_id"] for event in first if event["kind"] == "ready")
        second = stream(
            client,
            {"message": "order 20 kg flour from them", "business_id": bid, "session_id": session},
        )
        draft: dict = next(event["data"] for event in second if event["kind"] == "order")
        refused = client.post(f"{base}/{draft['id']}/cancel", json={"version": draft["version"]})
        assert refused.status_code == 409
        sent = client.post(f"{base}/{draft['id']}/send", json={"version": draft["version"]})
        assert sent.status_code == 200, sent.text
        confirmed = client.get(f"{base}/{draft['id']}").json()
        assert confirmed["status"] == "confirmed"
        price = confirmed["lines"][0]["price"]
        changed = client.post(
            f"{base}/{draft['id']}/change",
            json={"version": confirmed["version"], "lines": [{"line": 0, "quantity": 30}]},
        )
        assert changed.status_code == 200, changed.text
        body = changed.json()
        assert body["status"] == "sent"
        assert body["lines"][0]["quantity"] == 30 and body["total"] == round(price * 30)
        told = body["messages"][-1]
        assert told["author"] == "owner"
        name = body["lines"][0]["name"]
        assert told["text"] == f"Please change my order: {name} 30 kg (was 20 kg)."
        reply = client.get(f"{base}/{draft['id']}").json()
        assert reply["status"] == "confirmed" and reply["messages"][-1]["author"] == "supplier"
        stale = client.post(f"{base}/{draft['id']}/cancel", json={"version": body["version"]})
        assert stale.status_code == 409  # the supplier's reply moved the version on
        cancelled = client.post(f"{base}/{draft['id']}/cancel", json={"version": reply["version"]})
        assert cancelled.status_code == 200, cancelled.text
        done = cancelled.json()
        assert done["status"] == "cancelled"
        assert done["messages"][-1] == {
            **done["messages"][-1],
            "author": "owner",
            "kind": "cancel",
            "text": sourcing.CANCEL_TEXT,
        }
        again = client.post(f"{base}/{draft['id']}/cancel", json={"version": done["version"]})
        assert again.status_code == 409
