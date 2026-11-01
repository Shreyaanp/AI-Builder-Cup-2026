"""OB-248: vendor-to-vendor in the demo, end to end, and no owner feature blocked."""

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


@pytest.mark.parametrize(
    ("variant", "code"),
    [("partial", "partial"), ("price_change", "price_changed")],
)
def test_OB_248_a_short_or_dearer_reply_waits_for_the_owner_then_carries_on(
    live_parent_demo,  # noqa: F811
    instant,
    monkeypatch: pytest.MonkeyPatch,
    variant: str,
    code: str,
) -> None:
    client, _app, session, bid = live_parent_demo
    monkeypatch.setattr(demo_supplier, "SCRIPT", (variant,))
    sent = draft_and_send(client, session, bid)
    changed = order_of(client, session, bid, sent["id"])
    assert changed["status"] == "changed"
    assert code in {change["code"] for change in changed["changes"]}
    assert not any(d.get("flags") for d in changed["documents"]), "nothing here needs a fix-up"
    if variant == "price_change":
        was, now = sent["lines"][0]["price"], changed["lines"][0]["confirmed_price"]
        assert was < now <= was * 1.1 + 100 and now % 100 == 0
    # It waits: reading again never answers for the owner.
    assert order_of(client, session, bid, sent["id"])["status"] == "changed"
    accepted = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{sent['id']}/accept",
        "POST",
        json={"version": changed["version"]},
    )
    assert accepted.status_code == 200 and accepted.json()["status"] == "confirmed"
    assert order_of(client, session, bid, sent["id"])["status"] == "dispatched"


def test_OB_248_script_is_deterministic_and_starts_with_a_plain_yes() -> None:
    first = {"simulated": True, "status": "sent", "updated": 0.0, "number": "4500012346"}
    first["documents"] = [{"reader": "template"}]
    assert demo_supplier.next_reply(first, 1000.0) == "full"
    assert demo_supplier.next_reply({**first, "number": "4500012347"}, 1000.0) == "partial"
    assert demo_supplier.next_reply({**first, "number": "4500012348"}, 1000.0) == "price_change"
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
) -> None:
    """Each of these answered DEMO_NOT_SENT before. `no_paid_calls` fails on any provider call."""
    client, app, session, bid = live_parent_demo
    base = f"businesses/{bid}"
    community_before = app.state.community.docs.scoped("listing_review", "all", 50)

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
    assert app.state.community.docs.scoped("listing_review", "all", 50) == community_before
    assert app.state.community.docs.scoped("perks", bid, 5) == []


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
