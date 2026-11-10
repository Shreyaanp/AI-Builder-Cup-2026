"""OB-176 (#535): Today cards. X asks "Not now" (back on the shop's next day) or "Not useful"
(that kind of card rests two weeks); one setting says how often cards come (every day, only
important, off). Stored per shop on the server, so every phone sees the same; erased with the
shop. A supplier's unread reply is a card too."""

import time
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app import sourcing, today_cards
from app.coordinator import MerchantContext, current, find_suppliers, prepare_order
from app.rescue import local_now
from tests.test_analytics import owned_shop
from tests.test_photos import app  # noqa: F401


def cards(client: TestClient, bid: str) -> dict:
    today = client.get(f"/api/v1/businesses/{bid}/today")
    assert today.status_code == 200, today.text
    return today.json()["cards"]


def test_a_new_shop_gets_every_card_daily_with_nothing_hidden(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        _, bid = owned_shop(client, app)
        assert cards(client, bid) == {
            "frequency": "daily",
            "hidden": [],
            "resting": [],
            "supplier_replies": [],
        }


def test_not_now_hides_one_card_until_the_shops_next_day(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        hidden = client.post(
            f"/api/v1/businesses/{bid}/today/cards/dismiss",
            json={"card": "low-Milk", "reason": "not_now"},
        )
        assert hidden.status_code == 200, hidden.text
        assert hidden.json()["hidden"] == ["low-Milk"]
        assert hidden.json()["resting"] == []
        assert cards(client, bid)["hidden"] == ["low-Milk"]
        # Shop midnight passes: the card comes back by itself.
        fields = app.state.merchant.context(uid, bid)["business"]["fields"]
        midnight = (local_now(fields) + timedelta(days=1)).replace(hour=0, minute=0, second=1)
        monkeypatch.setattr(today_cards, "clock", lambda: midnight.timestamp())
        assert cards(client, bid)["hidden"] == []


def test_not_useful_rests_the_whole_kind_for_two_weeks(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        _, bid = owned_shop(client, app)
        rested = client.post(
            f"/api/v1/businesses/{bid}/today/cards/dismiss",
            json={"card": "step-photo", "reason": "not_useful"},
        ).json()
        assert rested["resting"] == ["step"]
        assert rested["hidden"] == []
        later = time.time() + 13 * 86_400
        monkeypatch.setattr(today_cards, "clock", lambda: later)
        assert cards(client, bid)["resting"] == ["step"]
        monkeypatch.setattr(today_cards, "clock", lambda: later + 2 * 86_400)
        assert cards(client, bid)["resting"] == []


@pytest.mark.parametrize("frequency", ["important", "off", "daily"])
def test_how_often_is_saved_for_every_phone(app, frequency: str) -> None:  # noqa: F811
    with TestClient(app) as client:
        _, bid = owned_shop(client, app)
        saved = client.post(
            f"/api/v1/businesses/{bid}/today/cards/frequency", json={"frequency": frequency}
        )
        assert saved.status_code == 200, saved.text
        assert cards(client, bid)["frequency"] == frequency


def test_bad_input_and_other_shops_are_refused(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        _, bid = owned_shop(client, app)
        base = f"/api/v1/businesses/{bid}/today/cards"
        assert client.post(f"{base}/frequency", json={"frequency": "hourly"}).status_code == 422
        assert (
            client.post(f"{base}/dismiss", json={"card": "x", "reason": "never"}).status_code == 422
        )
        assert (
            client.post(
                f"{base}/dismiss", json={"card": "<script>", "reason": "not_now"}
            ).status_code
            == 422
        )
        other = "/api/v1/businesses/00000000-0000-4000-8000-000000000000/today/cards"
        assert client.post(f"{other}/frequency", json={"frequency": "off"}).status_code == 404


def test_an_unread_supplier_reply_is_a_card_until_it_is_read(app, monkeypatch) -> None:  # noqa: F811
    monkeypatch.setattr(sourcing, "DEMO_REPLY_SECONDS", 0.0)
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        store = app.state.merchant
        ctx = MerchantContext(store, uid, bid, [], "order flour")
        token = current.set(ctx)
        try:
            found = client.portal.call(find_suppliers, "flour")  # type: ignore[union-attr]
            order = prepare_order(
                found["suppliers"][0]["id"], [{"name": "flour", "quantity": 5, "unit": "kg"}]
            )
        finally:
            current.reset(token)
        drafted = client.get(f"/api/v1/businesses/{bid}/orders/{order['order_id']}").json()
        sent = client.post(
            f"/api/v1/businesses/{bid}/orders/{order['order_id']}/send",
            json={"version": drafted["version"]},
        )
        assert sent.status_code == 200, sent.text
        client.get(f"/api/v1/businesses/{bid}/orders")  # the demo supplier answers
        replies = cards(client, bid)["supplier_replies"]
        assert [r["order_id"] for r in replies] == [order["order_id"]]
        assert replies[0]["supplier"] and replies[0]["text"]
        assert client.post(f"/api/v1/businesses/{bid}/orders/{order['order_id']}/read").is_success
        assert cards(client, bid)["supplier_replies"] == []


def test_choices_are_erased_with_the_shop(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        client.post(f"/api/v1/businesses/{bid}/today/cards/frequency", json={"frequency": "off"})
        assert app.state.merchant.feature_docs.get(today_cards.KIND, bid)
        app.state.merchant.erase_owner(uid)
        assert app.state.merchant.feature_docs.get(today_cards.KIND, bid) is None
