"""OB-248: vendor-to-vendor in the demo, end to end, and no owner feature blocked."""

from unittest.mock import Mock

import pytest

from app import demo_supplier
from tests.test_photos import app, jpeg  # noqa: F401
from tests.test_public_demo import owner
from tests.test_public_demo_no_paid_ai import live_parent_demo, no_paid_calls  # noqa: F401


@pytest.fixture
def instant(monkeypatch: pytest.MonkeyPatch) -> None:
    """The scripted delay is only there for the visitor; the order of events is what is tested."""
    monkeypatch.setattr(demo_supplier, "REPLY_SECONDS", 0.0)


def order_of(client, session, bid, order_id):
    response = owner(client, session, f"businesses/{bid}/supply/orders/{order_id}")
    assert response.status_code == 200, response.text
    return response.json()


def draft_and_send(client, session, bid):
    drafted = owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={})
    assert drafted.status_code == 200, drafted.text
    order = drafted.json()["order"]
    assert order["status"] == "draft" and "(Demo)" in order["supplier"]["name"]
    sent = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{order['id']}/approve",
        "POST",
        json={"version": order["version"]},
    )
    assert sent.status_code == 200, sent.text
    return sent.json()


def stock_of(client, session, bid, name):
    rows = owner(client, session, f"businesses/{bid}/inventory").json()
    return next(row for row in rows if row["name"] == name)["stock"]


def test_OB_248_full_order_goes_draft_sent_reply_on_the_way_delivered_stock_up(
    live_parent_demo,  # noqa: F811
    instant,
) -> None:
    client, _app, session, bid = live_parent_demo
    before = stock_of(client, session, bid, "Tea dust")
    sent = draft_and_send(client, session, bid)
    assert sent["status"] == "sent"
    oid = sent["id"]

    # The first read after the delay brings the confirmation, the next the dispatch note.
    confirmed = order_of(client, session, bid, oid)
    assert confirmed["status"] == "confirmed"
    assert [d["kind"] for d in confirmed["documents"]] == ["ORDERS", "ORDRSP"]
    on_the_way = order_of(client, session, bid, oid)
    assert on_the_way["status"] == "dispatched"
    # On the way stays put until the owner says the goods came.
    assert order_of(client, session, bid, oid)["status"] == "dispatched"

    delivered = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{oid}/received",
        "POST",
        json={"version": on_the_way["version"]},
    )
    assert delivered.status_code == 200, delivered.text
    proposal = delivered.json()["proposal"]
    assert proposal, "goods that match a menu item go to the usual stock review"
    saved = owner(
        client,
        session,
        f"proposals/{proposal['id']}/approve",
        "POST",
        json={"digest": proposal["digest"]},
    )
    assert saved.status_code == 200, saved.text
    assert stock_of(client, session, bid, "Tea dust") == before + round(
        sent["lines"][0]["quantity"]
    )

    billed = order_of(client, session, bid, oid)
    assert billed["status"] == "invoiced"
    closed = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{oid}/accept",
        "POST",
        json={"version": billed["version"]},
    )
    assert closed.status_code == 200 and closed.json()["status"] == "closed"


def send(client, session, bid, order):
    sent = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{order['id']}/approve",
        "POST",
        json={"version": order["version"]},
    )
    assert sent.status_code == 200, sent.text
    return sent.json()


def receive(client, session, bid, oid):
    """Goods arrived, as the visitor taps it once the order is on the way."""
    on_the_way = order_of(client, session, bid, oid)
    assert on_the_way["status"] == "dispatched", on_the_way["status"]
    came = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{oid}/received",
        "POST",
        json={"version": on_the_way["version"]},
    )
    assert came.status_code == 200, came.text
    proposal = came.json()["proposal"]
    saved = owner(
        client,
        session,
        f"proposals/{proposal['id']}/approve",
        "POST",
        json={"digest": proposal["digest"]},
    )
    assert saved.status_code == 200, saved.text
    return came.json()


def again(client, session, bid, oid):
    drafted = owner(client, session, f"businesses/{bid}/supply/orders/{oid}/again", "POST")
    assert drafted.status_code == 200, drafted.text
    order = drafted.json()
    assert order["status"] == "draft" and not order["sent"]
    return order


def test_OB_248_a_visitor_sees_yes_then_short_then_dearer_in_three_plain_orders(
    live_parent_demo,  # noqa: F811
    instant,
) -> None:
    """No patching: Draft a reorder, then Order again on what came, twice (OB-248)."""
    client, _app, session, bid = live_parent_demo
    first = draft_and_send(client, session, bid)
    assert order_of(client, session, bid, first["id"])["status"] == "confirmed"
    receive(client, session, bid, first["id"])

    # Tea dust is covered now, so a plain reorder adds nothing; Order again is the way.
    assert (
        owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={}).json()["status"]
        == "on_order"
    )
    second = send(client, session, bid, again(client, session, bid, first["id"]))
    assert second["lines"][0]["quantity"] == first["lines"][0]["quantity"]
    short = order_of(client, session, bid, second["id"])
    assert short["status"] == "changed"
    assert "partial" in {change["code"] for change in short["changes"]}
    assert not any(d.get("flags") for d in short["documents"]), "nothing here needs a fix-up"
    # It waits: reading again never answers for the owner.
    assert order_of(client, session, bid, second["id"])["status"] == "changed"
    accepted = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{second['id']}/accept",
        "POST",
        json={"version": short["version"]},
    )
    assert accepted.status_code == 200 and accepted.json()["status"] == "confirmed"
    receive(client, session, bid, second["id"])

    third = send(client, session, bid, again(client, session, bid, second["id"]))
    dearer = order_of(client, session, bid, third["id"])
    assert dearer["status"] == "changed"
    assert "price_changed" in {change["code"] for change in dearer["changes"]}
    was, now = third["lines"][0]["price"], dearer["lines"][0]["confirmed_price"]
    assert was < now <= was * 1.1 + 100 and now % 100 == 0


def test_OB_248_a_cancelled_draft_never_shifts_the_replies(
    live_parent_demo,  # noqa: F811
    instant,
) -> None:
    client, _app, session, bid = live_parent_demo
    drafted = owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={})
    order = drafted.json()["order"]
    cancelled = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{order['id']}/cancel",
        "POST",
        json={"version": order["version"]},
    )
    assert cancelled.status_code == 200, cancelled.text
    sent = draft_and_send(client, session, bid)
    assert order_of(client, session, bid, sent["id"])["status"] == "confirmed"


def test_OB_248_order_again_only_on_what_came(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, bid = live_parent_demo
    sent = draft_and_send(client, session, bid)
    early = owner(client, session, f"businesses/{bid}/supply/orders/{sent['id']}/again", "POST")
    assert early.status_code == 409


def test_OB_248_script_is_deterministic_and_starts_with_a_plain_yes() -> None:
    first = {"simulated": True, "status": "sent", "updated": 0.0, "number": "4500012346"}
    first["documents"] = [{"reader": "template"}]
    assert demo_supplier.next_reply(first, 1000.0, 0) == "full"
    assert demo_supplier.next_reply(first, 1000.0, 1) == "partial"
    assert demo_supplier.next_reply(first, 1000.0, 2) == "price_change"
    # Not before the delay, and never on a seeded order's authored story or a real supplier's.
    assert demo_supplier.next_reply({**first, "updated": 999.0}, 1000.0) is None
    assert demo_supplier.next_reply({**first, "documents": [{"reader": "parser"}]}, 1000.0) is None
    assert demo_supplier.next_reply({**first, "simulated": False}, 1000.0) is None


def test_OB_248_seeded_orders_keep_their_story(live_parent_demo, instant) -> None:  # noqa: F811
    client, _app, session, bid = live_parent_demo
    before = owner(client, session, f"businesses/{bid}/supply").json()["orders"]
    after = owner(client, session, f"businesses/{bid}/supply").json()["orders"]
    assert [(o["id"], o["status"]) for o in before] == [(o["id"], o["status"]) for o in after]


def test_OB_248_owner_features_work_in_the_sandbox_and_stay_offline(
    live_parent_demo,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Each of these answered DEMO_NOT_SENT before. `no_paid_calls` fails on any provider call."""
    client, parent, session, bid = live_parent_demo
    base = f"businesses/{bid}"
    # Any touch of the shared community store (perks, a listing check after a save) is recorded.
    shared_store = Mock()
    monkeypatch.setattr(parent.state.community, "docs", shared_store)

    def ok(path, method="POST", **kwargs):
        response = owner(client, session, path, method, **kwargs)
        assert response.status_code < 400, f"{method} {path}: {response.text}"
        return response.json()

    assert ok(f"{base}/share", json={"public": True})["public"] is True
    assert ok(f"{base}/share", json={"public": False})["public"] is False
    menu = ok(f"{base}/inventory", "GET")
    ok(f"{base}/inventory/{menu[0]['id']}/source", json={"source": "made"})
    fields = owner(client, session, "businesses").json()[0]
    ok(f"{base}/update?revision={fields['revision']}", json=fields["fields"])
    perk = {"id": "welcome", "trigger": "regular", "text": "A free biscuit"}
    ok(f"{base}/perks", "PUT", json={"perks": [perk]})
    assert ok(f"{base}/perks", "GET")["perks"][0]["text"] == "A free biscuit"
    ok(f"{base}/playbook/regenerate", json={})

    photo = {"content": jpeg(), "headers": {"content-type": "image/jpeg"}}
    added = ok(f"{base}/gallery?kind=inside", **photo)
    assert added["sample"] is True and added["photo_id"] in added["gallery"]
    assert owner(client, session, f"{base}/gallery/{added['photo_id']}.jpg").status_code == 200
    ok(f"{base}/gallery/{added['photo_id']}/cover")
    ok(f"{base}/gallery/{added['photo_id']}/kind", json={"kind": "menu"})
    assert ok(f"{base}/icon/from-gallery/{added['photo_id']}")["icon"] == added["photo_id"]
    ok(f"{base}/icon", "DELETE")
    assert ok(f"{base}/icon", "PUT", **photo)["sample"] is True
    ok(f"{base}/gallery/{added['photo_id']}", "DELETE")

    thread = ok(f"{base}/inquiries", "GET")[0]
    ok(f"{base}/inquiries/{thread['id']}/block")
    ok(f"{base}/inquiries/{thread['id']}/unblock")
    message = thread["messages"][0]["id"]
    translated = ok(
        f"{base}/inquiries/{thread['id']}/messages/{message}/translation",
        json={"language": "hi"},
    )
    assert translated["mode"] == "fixture"

    assert ok(f"{base}/supply/send-all")["unsent"] == []
    assert ok(f"{base}/google-sim", "GET")

    # A demo's writes stayed out of the shared store.
    assert shared_store.mock_calls == []


def test_OB_248_a_chain_shop_gets_the_same_uploads(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    response = owner(
        client,
        session,
        "businesses/demo-chain-freshmart/gallery",
        "POST",
        content=jpeg(),
        headers={"content-type": "image/jpeg"},
    )
    assert response.status_code == 200, response.text


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("DELETE", "me/data"),
        ("POST", "tts"),
        ("POST", "face/challenges"),
        ("DELETE", "face/template"),
        ("POST", "trust/scan"),
        ("POST", "consent"),
    ],
)
def test_OB_248_what_would_touch_the_real_world_stays_pretend(
    live_parent_demo,  # noqa: F811
    method: str,
    path: str,
) -> None:
    client, _app, session, _bid = live_parent_demo
    response = owner(client, session, path, method, json={})
    assert response.status_code == 403 and response.json()["detail"] == "DEMO_NOT_SENT"


def test_OB_248_uploads_refuse_a_shop_outside_the_sandbox(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    response = owner(
        client,
        session,
        "businesses/someone-else/gallery",
        "POST",
        content=jpeg(),
        headers={"content-type": "image/jpeg"},
    )
    assert response.status_code == 403


def test_OB_248_an_icon_comes_from_the_shops_own_gallery(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, bid = live_parent_demo
    unknown = "00000000-0000-0000-0000-000000000000"
    response = owner(client, session, f"businesses/{bid}/icon/from-gallery/{unknown}", "POST")
    assert response.status_code == 404


def test_OB_248_hosted_overlapping_supply_reads_all_answer_when_a_reply_is_due(
    live_parent_demo,  # noqa: F811
    instant,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """On the hosted path every request restores its own copy; a due reply must not 409 a read."""
    from concurrent.futures import ThreadPoolExecutor

    import anyio

    from app import public_demo

    client, parent, session, bid = live_parent_demo
    sent = draft_and_send(client, session, bid)
    # Hosted from here: `live` restores each request from the saved document, as on Cloud Run.
    monkeypatch.setattr(parent.state.v1_settings, "merchant_backend", "firestore")
    real = public_demo.settle_supplier_replies
    arrived = {"n": 0}
    everyone = anyio.Event()

    async def together(store, uid, shop):
        # Hold every read until all four have restored the same revision, so they overlap.
        arrived["n"] += 1
        if arrived["n"] >= 4:
            everyone.set()
        with anyio.move_on_after(5):
            await everyone.wait()
        return await real(store, uid, shop)

    monkeypatch.setattr(public_demo, "settle_supplier_replies", together)
    paths = [f"businesses/{bid}/supply", f"businesses/{bid}/supply/board"] * 2
    with ThreadPoolExecutor(4) as pool:
        answers = list(pool.map(lambda path: owner(client, session, path), paths))
    assert [a.status_code for a in answers] == [200] * 4, [a.text for a in answers]
    # The reply was saved once and every later read sees it.
    assert order_of(client, session, bid, sent["id"])["status"] in {"confirmed", "dispatched"}


def test_OB_248_a_full_sandbox_still_answers_a_supply_read(
    live_parent_demo,  # noqa: F811
    instant,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import demo_sessions

    client, parent, session, bid = live_parent_demo
    sent = draft_and_send(client, session, bid)
    monkeypatch.setattr(parent.state.v1_settings, "merchant_backend", "firestore")
    monkeypatch.setattr(demo_sessions, "MAX_SNAPSHOT", 1)
    answer = owner(client, session, f"businesses/{bid}/supply/orders/{sent['id']}")
    assert answer.status_code == 200, answer.text
    assert answer.json()["status"] == "confirmed"


def test_OB_248_google_question_points_to_the_practice_tile(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach", json={"message": "How do I get on Google?"}
    )
    assert response.status_code == 200
    assert "Grow → Get on Google" in response.text
    assert "nothing is sent to Google" in response.text
