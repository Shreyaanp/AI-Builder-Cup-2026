"""HABIT slice 2: tomorrow's promise and the morning's counts.

A promise is set at close (or by chat) for the next shop-local day, shows that morning only,
"Not today" clears it for good, and done marks it done. The day's habit row gains promise_set
and promise_done as counts: never the words, never for a demo shop, only with consent.
"""

import json
from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import owner_habit, owner_promise, shop_today
from app.coordinator import MerchantContext
from app.instant import promise_words, route
from app.owner_promise import NewPromise, answer, promise_for, set_promise
from app.rescue import local_now
from tests.test_analytics import owned_shop
from tests.test_photos import app  # noqa: F401


def at(monkeypatch: pytest.MonkeyPatch, when: datetime) -> None:
    """Move the shop's clock: the promise and Today read the same local day."""
    monkeypatch.setattr(owner_promise, "local_now", lambda *_: when)
    monkeypatch.setattr(shop_today, "local_now", lambda *_: when)


def evening(app_: Any, uid: str, bid: str) -> datetime:
    fields = app_.state.merchant.context(uid, bid)["business"]["fields"]
    now = local_now(fields)
    return now.replace(hour=20, minute=30)


def counts(app_: Any, bid: str, day: datetime) -> dict[str, int]:
    return owner_habit.daily(app_.state.merchant, bid, day.date().isoformat())


def test_set_at_close_appears_next_morning_and_counts(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        close = evening(app, uid, bid)
        at(monkeypatch, close)
        made = client.post(
            f"/api/v1/businesses/{bid}/promise",
            json={"text": "Order Milk", "kind": "order", "item": "Milk"},
        )
        assert made.status_code == 200, made.text
        tomorrow = close.date() + timedelta(days=1)
        assert made.json() == {
            "day": tomorrow.isoformat(),
            "text": "Order Milk",
            "kind": "order",
            "item": "Milk",
            "state": "open",
        }
        # Not tonight: the promise is for the morning.
        assert client.get(f"/api/v1/businesses/{bid}/promise").json() is None
        assert counts(app, bid, close)["promise_set"] == 1

        morning = (close + timedelta(days=1)).replace(hour=8, minute=0)
        at(monkeypatch, morning)
        today = client.get(f"/api/v1/businesses/{bid}/today").json()
        assert today["promise"]["text"] == "Order Milk"
        assert today["promise"]["day"] == tomorrow.isoformat()

        done = client.post(f"/api/v1/businesses/{bid}/promise/{tomorrow}/done")
        assert done.status_code == 204
        assert client.get(f"/api/v1/businesses/{bid}/today").json()["promise"] is None
        assert counts(app, bid, morning)["promise_done"] == 1
        # A second tap (or a second phone) is not an error and is not counted twice.
        again = client.post(f"/api/v1/businesses/{bid}/promise/{tomorrow}/done")
        assert again.status_code == 204
        assert counts(app, bid, morning)["promise_done"] == 1


def test_not_today_clears_it_and_it_never_comes_back(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        close = evening(app, uid, bid)
        at(monkeypatch, close)
        client.post(f"/api/v1/businesses/{bid}/promise", json={"text": "Call Ganesh"})
        morning = (close + timedelta(days=1)).replace(hour=8)
        day = morning.date().isoformat()
        at(monkeypatch, morning)
        assert client.get(f"/api/v1/businesses/{bid}/promise").json()["text"] == "Call Ganesh"
        skipped = client.post(f"/api/v1/businesses/{bid}/promise/{day}/skipped")
        assert skipped.status_code == 204
        assert client.get(f"/api/v1/businesses/{bid}/promise").json() is None
        assert client.get(f"/api/v1/businesses/{bid}/today").json()["promise"] is None
        # Later that day and the day after: nothing carries over or nags.
        at(monkeypatch, morning.replace(hour=18))
        assert client.get(f"/api/v1/businesses/{bid}/promise").json() is None
        at(monkeypatch, morning + timedelta(days=1))
        assert client.get(f"/api/v1/businesses/{bid}/today").json()["promise"] is None
        # Clearing is not doing: no promise_done.
        assert "promise_done" not in counts(app, bid, morning)
        # An unknown answer is refused.
        bad = client.post(f"/api/v1/businesses/{bid}/promise/{day}/later")
        assert bad.status_code == 422


def test_an_unanswered_promise_belongs_to_its_morning_only(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        close = evening(app, uid, bid)
        at(monkeypatch, close)
        client.post(f"/api/v1/businesses/{bid}/promise", json={"text": "Order sugar"})
        at(monkeypatch, close + timedelta(days=2))
        assert client.get(f"/api/v1/businesses/{bid}/today").json()["promise"] is None


def test_one_promise_a_day_the_new_one_replaces_the_old(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        close = evening(app, uid, bid)
        at(monkeypatch, close)
        repo = app.state.merchant
        fields = repo.context(uid, bid)["business"]["fields"]
        set_promise(repo, bid, fields, NewPromise(text="Order milk"))
        set_promise(repo, bid, fields, NewPromise(text="Order sugar"))
        tomorrow = close.date() + timedelta(days=1)
        found = promise_for(repo, bid, tomorrow)
        assert found is not None and found.text == "Order sugar"
        assert len(repo.feature_docs.scoped(owner_promise.KIND, bid)) == 1


def test_words_are_one_clean_line_and_never_empty(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        at(monkeypatch, evening(app, uid, bid))
        made = client.post(
            f"/api/v1/businesses/{bid}/promise",
            json={"text": "  order\nmilk\t ", "kind": "order"},
        ).json()
        # No item named: a note, never an Order button for something unknown.
        assert (made["text"], made["kind"], made["item"]) == ("order milk", "note", None)
        assert (
            client.post(f"/api/v1/businesses/{bid}/promise", json={"text": "\n\t"}).status_code
            == 422
        )
        assert (
            client.post(f"/api/v1/businesses/{bid}/promise", json={"text": "x" * 81}).status_code
            == 422
        )
        assert (
            client.post("/api/v1/businesses/not-mine/promise", json={"text": "a"}).status_code
            == 404
        )


def test_counts_hold_no_words_and_export_as_numbers(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        close = evening(app, uid, bid)
        at(monkeypatch, close)
        client.post(f"/api/v1/businesses/{bid}/promise", json={"text": "Order Kesar Milk"})
        stored = counts(app, bid, close)
        exported = owner_habit.export_row(stored)
        assert exported["promise_set"] == 1 and exported["promise_done"] == 0
        for private in ("Kesar", uid, bid):
            assert private not in json.dumps(stored) and private not in json.dumps(exported)


def test_demo_shops_keep_a_promise_but_are_never_counted(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        version = client.get("/api/v1/me").json()["legal_version"]
        client.post("/api/v1/consent", json={"version": version, "terms": True, "privacy": True})
        bid = client.post("/api/v1/demo/workspace", params={"zone": "Asia/Kolkata"}).json()[
            "business_id"
        ]
        made = client.post(f"/api/v1/businesses/{bid}/promise", json={"text": "Order milk"})
        assert made.status_code == 200
        assert app.state.merchant.feature_docs.scoped(owner_habit.KIND, bid) == []


def test_setting_a_promise_needs_the_owners_current_consent(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        sent = client.post("/api/v1/businesses/any/promise", json={"text": "Order milk"})
        assert sent.status_code == 428


def test_a_counting_error_never_fails_the_promise(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        at(monkeypatch, evening(app, uid, bid))

        def broken(*_: Any) -> None:
            raise RuntimeError("store down")

        monkeypatch.setattr(owner_promise, "record", broken)
        made = client.post(f"/api/v1/businesses/{bid}/promise", json={"text": "Order milk"})
        assert made.status_code == 200


def test_erasing_the_owner_erases_the_promise(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        at(monkeypatch, evening(app, uid, bid))
        client.post(f"/api/v1/businesses/{bid}/promise", json={"text": "Order milk"})
        assert app.state.merchant.feature_docs.get(owner_promise.KIND, bid)
        app.state.merchant.erase_owner(uid)
        assert app.state.merchant.feature_docs.get(owner_promise.KIND, bid) is None


@pytest.mark.parametrize(
    ("message", "what"),
    [
        ("Remind me to order milk tomorrow", "order milk"),
        ("remind me to order milk tomorrow morning", "order milk"),
        ("Remind me tomorrow to call Ganesh", "call Ganesh"),
        ("Tomorrow remind me to order sugar", "order sugar"),
        ("please remind me about the gas cylinder tomorrow", "the gas cylinder"),
        ("kal subah doodh yaad dilana", "doodh"),
        ("Kal doodh mangana yaad dilao", "doodh mangana"),
    ],
)
def test_chat_phrases_that_set_a_promise(message: str, what: str) -> None:
    assert promise_words(message) == what


@pytest.mark.parametrize(
    "message",
    ["Remind me every morning", "remind me tomorrow", "turn on reminders", "order milk"],
)
def test_chat_phrases_that_do_not(message: str) -> None:
    assert promise_words(message) is None


async def test_the_offline_coach_sets_a_promise_from_the_chat(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
    repo = app.state.merchant
    close = evening(app, uid, bid)
    at(monkeypatch, close)
    item = repo.context(uid, bid)["inventory"][0]["name"]
    ctx = MerchantContext(store=repo, uid=uid, business_id=bid, recalled=[])
    reply = await route(f"Remind me to order {item.lower()} tomorrow", ctx)
    assert reply is not None and reply.intent == "promise"
    assert "tomorrow morning" in reply.reply and "Grow → Close the day" in reply.reply
    tomorrow = close.date() + timedelta(days=1)
    found = promise_for(repo, bid, tomorrow)
    # A menu item it names gets that item's button tomorrow.
    assert found is not None and (found.kind, found.item) == ("order", item)
    note = await route("kal subah gas cylinder yaad dilana", ctx)
    assert note is not None and note.intent == "promise"
    found = promise_for(repo, bid, tomorrow)
    assert found is not None and (found.text, found.kind) == ("gas cylinder", "note")
    # "Remind me every morning" is not a promise (it stays the Remind me screen).
    every = await route("Remind me every morning", ctx)
    assert every is None or every.intent != "promise"
    assert counts(app, bid, close)["promise_set"] == 2


def test_answer_is_false_without_an_open_promise(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        close = evening(app, uid, bid)
        at(monkeypatch, close)
        repo = app.state.merchant
        fields = repo.context(uid, bid)["business"]["fields"]
        assert not answer(repo, bid, fields, close.date(), "done")
        set_promise(repo, bid, fields, NewPromise(text="Order milk"))
        # Tonight's promise is for tomorrow: it cannot be answered today.
        assert not answer(repo, bid, fields, close.date(), "done")
        assert answer(repo, bid, fields, close.date() + timedelta(days=1), "skipped")


def test_public_demo_sandbox_keeps_promises_in_the_sandbox() -> None:
    from app.public_demo import allowed

    assert allowed("POST", "businesses/demo-1/promise")
    assert allowed("POST", "businesses/demo-1/promise/2026-11-03/done")
    assert allowed("POST", "businesses/demo-1/promise/2026-11-03/skipped")
    assert not allowed("POST", "businesses/demo-1/promise/2026-11-03/later")
