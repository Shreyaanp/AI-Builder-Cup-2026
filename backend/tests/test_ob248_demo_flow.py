"""OB-248: vendor-to-vendor in the demo, end to end, and no owner feature blocked."""

import json
import re
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi import HTTPException

from app import demo_item_names, demo_supplier
from app.google_sim_routes import PRACTICE_PHONE
from tests.test_photos import app, jpeg  # noqa: F401
from tests.test_public_demo import owner
from tests.test_public_demo_no_paid_ai import live_parent_demo, no_paid_calls  # noqa: F401

ROOT = Path(__file__).resolve().parents[2]

HINDI_SCRIPT = re.compile(r"[ऀ-ॿ]")


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
    # The order now says what is coming: only what the supplier has, at the agreed price.
    settled = accepted.json()
    line = settled["lines"][0]
    came = line["confirmed"]
    assert 0 < came < line["quantity"]
    assert line["total"] == settled["total"] == round(line["price"] * came)
    assert settled["backorders"][0]["quantity"] == line["quantity"] - came
    receive(client, session, bid, second["id"])

    third = send(client, session, bid, again(client, session, bid, second["id"]))
    dearer = order_of(client, session, bid, third["id"])
    assert dearer["status"] == "changed"
    assert "price_changed" in {change["code"] for change in dearer["changes"]}
    was, now = third["lines"][0]["price"], dearer["lines"][0]["confirmed_price"]
    assert was < now <= was * 1.1 + 100 and now % 100 == 0
    # Before the owner says yes, the order keeps the price they approved.
    assert dearer["lines"][0]["price"] == was
    assert dearer["total"] == round(was * dearer["lines"][0]["quantity"])
    # After: the header, the line and the total all show the accepted amount.
    risen = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{third['id']}/accept",
        "POST",
        json={"version": dearer["version"]},
    )
    assert risen.status_code == 200, risen.text
    line = risen.json()["lines"][0]
    assert line["price"] == now
    assert line["total"] == risen.json()["total"] == round(now * line["quantity"])
    # The bill is that same amount, so the order and its bill agree.
    receive(client, session, bid, third["id"])
    assert order_of(client, session, bid, third["id"])["invoice_total"] == risen.json()["total"]


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


def test_OB_248_a_write_that_loses_the_save_race_says_so_instead_of_a_500(
    live_parent_demo,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Hosted: a tap beside a delivering read loses the save, and tapping again works."""
    from app import public_demo

    client, _parent, session, bid = live_parent_demo
    order = draft_and_send(client, session, bid)

    def stale(*_args, **_kwargs):
        raise HTTPException(409, "DEMO_SESSION_CONFLICT")

    monkeypatch.setattr(public_demo, "save", stale)
    answer = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{order['id']}/talk",
        "POST",
        json={"version": order["version"], "text": "Hello"},
    )
    assert answer.status_code == 409, answer.text
    assert answer.json()["detail"] == "DEMO_SESSION_CONFLICT"
    assert answer.headers["cache-control"] == "no-store"


def test_OB_248_google_question_points_to_the_practice_tile(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach", json={"message": "How do I get on Google?"}
    )
    assert response.status_code == 200
    assert "Grow → Get on Google" in response.text
    assert "nothing is sent to Google" in response.text


def _coach_events(response) -> list[dict]:
    return [
        json.loads(line[len("data: ") :])
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


def test_OB_248_find_suppliers_lists_them_and_drafts_the_order_card(
    live_parent_demo,  # noqa: F811
) -> None:
    client, _app, session, bid = live_parent_demo
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach",
        json={"message": "My masala chai is running low. Find suppliers."},
    )
    assert response.status_code == 200
    events = {event["kind"]: event for event in _coach_events(response)}
    suppliers = events["suppliers"]["data"]["suppliers"]
    assert suppliers and all(row["demo"] for row in suppliers)
    order = events["order"]["data"]
    assert order["status"] == "draft" and order["supplier"]["id"] == suppliers[0]["id"]
    assert order["lines"][0]["quantity"] == 10 and order["lines"][0]["unit"]
    reply = events["reply"]["text"]
    assert "You make Masala chai yourself" in reply and "Tea dust" in reply
    assert "In your real shop" not in reply and "Supplies" not in reply
    assert suppliers[0]["name"] in reply


@pytest.mark.parametrize(
    ("message", "words"),
    [
        ("My milk is running low", "Demo suppliers near you for Milk"),
        ("दूध ख़त्म होने वाला है", "पास के डेमो सप्लायर"),
    ],
)
def test_OB_248_the_screens_own_phrase_does_the_work(
    live_parent_demo,  # noqa: F811
    message: str,
    words: str,
) -> None:
    """Grow → Buy stock → Find a supplier sends this phrase, in English or Hindi."""
    client, _app, session, _bid = live_parent_demo
    response = client.post(f"/api/v1/demo/sessions/{session}/coach", json={"message": message})
    events = {event["kind"]: event for event in _coach_events(response)}
    assert events["order"]["data"]["lines"][0]["name"] == "Milk"
    assert words in events["reply"]["text"]
    # The path in the asker's language: no English screen names in a Hindi reply (OB-261).
    where = "Grow → Buy stock → Find a supplier"
    hindi = "बढ़ाएँ → माल मँगाएँ → सप्लायर ढूँढें"
    assert (hindi if HINDI_SCRIPT.search(message) else where) in events["reply"]["text"]


def test_simplify_4b_find_a_supplier_amount_then_order_from_the_vendor_list(
    live_parent_demo,  # noqa: F811
) -> None:
    """Buy stock → Find a supplier → milk, 20 L → vendor list → Order → the card with Send:
    the draft uses the owner's amount, and Order drafts to the supplier picked. No paid model
    (the fixture fails on any)."""
    client, _app, session, _bid = live_parent_demo
    asked = client.post(
        f"/api/v1/demo/sessions/{session}/coach",
        json={"message": "I need 20 L milk. Find suppliers."},
    )
    events = {event["kind"]: event for event in _coach_events(asked)}
    suppliers = events["suppliers"]["data"]["suppliers"]
    assert len(suppliers) >= 2 and all(row["demo"] for row in suppliers)
    first = events["order"]["data"]["lines"][0]
    assert (first["name"], first["quantity"], first["unit"]) == ("Milk", 20, "litre")
    assert "I drafted 20 litre" in events["reply"]["text"]

    # The vendor list's Order on each row (sourcing/copy.ts chooseDraft): that supplier, the
    # owner's 20 litre where it sells by volume, else its usual amount in its own unit.
    for rank, row in enumerate(suppliers, 1):
        ordered = client.post(
            f"/api/v1/demo/sessions/{session}/coach",
            json={"message": f"Order from number {rank}: 20 litre milk"},
        )
        events = {event["kind"]: event for event in _coach_events(ordered)}
        order = events["order"]["data"]
        assert order["status"] == "draft"
        assert order["supplier"]["id"] == row["id"]
        line = order["lines"][0]
        assert line["unit"] == row["item"]["unit"]
        assert line["quantity"] == (20 if row["item"]["unit"] == "litre" else 10)
        assert "only when you tap Send" in events["reply"]["text"]
        assert "suppliers" not in events


def test_OB_248_find_suppliers_for_an_item_the_shop_does_not_stock(
    live_parent_demo,  # noqa: F811
) -> None:
    """It looks for what was asked, never quietly for something else on the menu."""
    client, _app, session, _bid = live_parent_demo
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach", json={"message": "Find suppliers for rice"}
    )
    events = {event["kind"]: event for event in _coach_events(response)}
    assert events["suppliers"]["data"]["item"] == "rice"
    assert "for rice" in events["reply"]["text"] and "Tea dust" not in events["reply"]["text"]


def test_OB_248_supply_question_names_a_tile_that_exists_with_the_unit(
    live_parent_demo,  # noqa: F811
) -> None:
    client, _app, session, _bid = live_parent_demo
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach", json={"message": "how do I order tea dust?"}
    )
    assert "Tea dust has 6 kg in stock" in response.text
    assert "Grow → Buy stock → To do" in response.text
    assert "Supplies" not in response.text


@pytest.mark.parametrize(
    ("text", "kind"),
    [
        ("When will it reach me?", "when"),
        ("Any discount on the rate?", "price"),
        ("कब तक आएगा?", "when"),
        ("Please pack it well", "noted"),
    ],
)
def test_OB_248_a_visitor_writes_to_the_supplier_and_gets_a_scripted_answer(
    live_parent_demo,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
    text: str,
    kind: str,
) -> None:
    client, _app, session, bid = live_parent_demo
    order = draft_and_send(client, session, bid)
    path = f"businesses/{bid}/supply/orders/{order['id']}"
    written = owner(
        client, session, f"{path}/talk", "POST", json={"version": order["version"], "text": text}
    )
    assert written.status_code == 200
    assert written.json()["talk"][-1]["text"] == text
    assert "answer" not in written.json()["talk"][-1]
    # Not yet: the supplier takes a moment.
    assert "answer" not in owner(client, session, path).json()["talk"][-1]
    monkeypatch.setattr(demo_supplier, "REPLY_SECONDS", 0.0)
    assert owner(client, session, path).json()["talk"][-1]["answer"] == kind


def test_OB_248_writing_to_a_supplier_is_for_an_open_order_in_the_demo_only(
    live_parent_demo,  # noqa: F811
) -> None:
    client, _app, session, bid = live_parent_demo
    reorder = owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={})
    order = reorder.json()["order"]
    path = f"businesses/{bid}/supply/orders/{order['id']}/talk"
    body = {"version": order["version"], "text": "Hello"}
    assert owner(client, session, path, "POST", json=body).status_code == 409  # still a draft
    blank = {"version": order["version"], "text": "   "}
    assert owner(client, session, path, "POST", json=blank).status_code == 422
    # A real owner's order: the route is not there for them, whatever the order.
    with pytest.raises(HTTPException) as refused:
        demo_supplier.write(None, "firebase:someone", bid, order["id"], 1, "Hello")  # type: ignore[arg-type]
    assert refused.value.status_code == 404


def test_OB_248_hindi_stock_answer_says_the_unit_in_hindi(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach", json={"message": "Tea dust का स्टॉक कितना है?"}
    )
    assert "6 किलो" in response.text


def _hindi_reply(client, session: str, message: str) -> str:
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach", json={"message": message, "language": "hi"}
    )
    assert response.status_code == 200, response.text
    return next(event for event in _coach_events(response) if event["kind"] == "reply")["text"]


@pytest.mark.parametrize(
    ("message", "answer"),
    [
        # The review's table: the item asked about, its own numbers, its Hindi name.
        ("चाय पत्ती का स्टॉक कितना है?", r"डेमो में चाय पत्ती का स्टॉक 6 किलो है।"),
        ("चाय पत्ती का दाम क्या है?", r"डेमो में चाय पत्ती की कीमत ₹320 है।"),
        (
            "सप्लायर से ऑर्डर कैसे करूँ?",
            r"डेमो सप्लायर .+ है। चाय पत्ती का स्टॉक 6 किलो है।",
        ),
        (
            "कल क्या तैयार करूँ?",
            r"कल की तैयारी: \S+ \S+ \d+ कप, .+ \(पिछली बिक्री का औसत\)।",
        ),
        # Other names, and an item with no count says so instead of "0 कप".
        ("मसाला चाय का दाम क्या है?", r"डेमो में मसाला चाय की कीमत ₹20 है।"),
        (
            "मसाला चाय का स्टॉक कितना है?",
            r"डेमो में मसाला चाय की बिक्री चालू है, इसका स्टॉक गिना नहीं जाता।",
        ),
        ("बन मस्का का स्टॉक कितना है?", r"डेमो में बन मस्का का स्टॉक 4 पीस है।"),
        ("दूध का स्टॉक कितना है?", r"डेमो दुकान में दूध का स्टॉक दर्ज नहीं है।"),
        ("चीनी का दाम क्या है?", r"चीनी डेमो दुकान के मेन्यू में नहीं है।"),
        ("चीनी का ऑर्डर करो", r"डेमो दुकान में चीनी का स्टॉक दर्ज नहीं है।"),
        ("दूध ऑर्डर करो", r"डेमो दुकान में दूध का स्टॉक दर्ज नहीं है।"),
        # The shop's own category is not an item.
        ("मेरी चाय की दुकान में स्टॉक कितना है?", r"डेमो में चाय पत्ती का स्टॉक 6 किलो है।"),
        (
            "मेरी चाय की दुकान के लिए क्या ऑर्डर करूँ?",
            r"डेमो सप्लायर .+ है। चाय पत्ती का स्टॉक 6 किलो है।",
        ),
        (
            "चाय की दुकान का सप्लायर कौन है?",
            r"डेमो सप्लायर .+ है। चाय पत्ती का स्टॉक 6 किलो है।",
        ),
        # Asked without a name: the item the shop counts, not the first one on the menu.
        ("स्टॉक कितना है?", r"डेमो में चाय पत्ती का स्टॉक 6 किलो है।"),
    ],
)
def test_OB_248_hindi_question_finds_the_item_by_its_hindi_name(
    live_parent_demo,  # noqa: F811
    message: str,
    answer: str,
) -> None:
    client, _app, session, _bid = live_parent_demo
    reply = _hindi_reply(client, session, message)
    assert re.fullmatch(answer, reply), reply


def test_OB_248_hindi_best_sellers_use_hindi_names(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    reply = _hindi_reply(client, session, "सबसे ज़्यादा क्या बिकता है?")
    assert "Masala chai" not in reply and re.search(r"[ऀ-ॿ]+ \(\d+ बिके\)", reply), reply


def test_OB_248_backend_hindi_names_match_the_apps_table() -> None:
    """The coach and the screens must call an item the same thing."""
    source = (ROOT / "src/i18n/productNames.ts").read_text(encoding="utf-8")
    table = source.split("const HINDI", 1)[1].split("\n}\n", 1)[0]
    shown = {
        (quoted or bare): hindi
        for quoted, bare, hindi in re.findall(r"^\s+(?:'([^']+)'|(\w+)): \['([^']+)'", table, re.M)
    }
    for category in ("Tea stall", "Minimart"):
        shown.pop(category)  # categories live in the app only, not as coach items
    assert shown and demo_item_names.HINDI_ITEMS == shown


@pytest.mark.parametrize(
    ("message", "line", "words"),
    [
        ("मेरा दूध कम हो रहा है। सप्लायर खोजें।", "Milk", "दूध के लिए पास के डेमो सप्लायर: 1. "),
        (
            "मेरी चाय पत्ती कम हो रही है। सप्लायर खोजें।",
            "Tea dust",
            "चाय पत्ती के लिए पास के डेमो सप्लायर: 1. ",
        ),
        ("मेरी चीनी कम हो रही है। सप्लायर खोजें।", "Sugar", "चीनी के लिए पास के डेमो सप्लायर: 1. "),
        (
            "मेरी मसाला चाय कम हो रही है। सप्लायर खोजें।",
            "Tea dust",
            "मसाला चाय आप ख़ुद बनाते हैं, इसलिए ये चाय पत्ती के लिए हैं।",
        ),
    ],
)
def test_OB_248_hindi_find_suppliers_does_the_real_work(
    live_parent_demo,  # noqa: F811
    message: str,
    line: str,
    words: str,
) -> None:
    """The tile's own Hindi phrase, like English: the suppliers, then the drafted order card."""
    client, _app, session, _bid = live_parent_demo
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach", json={"message": message, "language": "hi"}
    )
    events = {event["kind"]: event for event in _coach_events(response)}
    suppliers = events["suppliers"]["data"]["suppliers"]
    assert suppliers and all(row["demo"] for row in suppliers)
    order = events["order"]["data"]
    assert order["status"] == "draft" and order["lines"][0]["name"] == line
    reply = events["reply"]["text"]
    assert words in reply and suppliers[0]["name"] in reply
    assert "असली दुकान" not in reply and not re.search(r"(?:Milk|Sugar|Tea dust|kg|litre)", reply)


@pytest.mark.parametrize(
    ("message", "reply"),
    [
        (
            "मेरा दूध कम हो रहा है। सप्लायर खोजें।",
            r"पुष्टि: 10 लीटर दूध, ₹[\d,.]+। कल सुबह 09:00 बजे पहुँचेगा।",
        ),
        (
            "मेरा पनीर कम हो रहा है। सप्लायर खोजें।",
            r"पुष्टि: 10 किलो पनीर, ₹[\d,.]+। \S+ \S+ \d\d:\d\d बजे पहुँचेगा।",
        ),
    ],
)
def test_OB_248_hindi_find_suppliers_ends_in_a_hindi_supplier_reply(
    live_parent_demo,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
    message: str,
    reply: str,
) -> None:
    """Send the drafted card: the supplier answers in the owner's language, in Hindi names."""
    monkeypatch.setattr("app.sourcing.DEMO_REPLY_SECONDS", 0.0)
    client, _app, session, bid = live_parent_demo
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach", json={"message": message, "language": "hi"}
    )
    order = {event["kind"]: event for event in _coach_events(response)}["order"]["data"]
    base = f"businesses/{bid}/orders/{order['id']}"
    sent = owner(client, session, f"{base}/send", "POST", json={"version": order["version"]})
    assert sent.status_code == 200, sent.text
    messages = owner(client, session, base).json()["messages"]
    text = messages[-1]["text"]
    assert messages[-1]["author"] == "supplier" and re.fullmatch(reply, text), text
    assert not re.search(r"[A-Za-z]", text)


def test_OB_248_the_demo_supplier_answers_every_kind_of_message_in_hindi() -> None:
    from app.sourcing import demo_reply

    order = {
        "lang": "hi",
        "currency": "INR",
        "delivery": "tomorrow at 09:00",
        "status": "sent",
        "total": 54000,
        "lines": [
            {"name": "Paneer", "quantity": 2, "unit": "kg", "price": 1, "available": False},
            {"name": "Milk", "quantity": 1, "unit": "litre", "price": 1, "available": True},
        ],
    }
    out, status = demo_reply(order, {"kind": "order", "text": ""})
    assert status == "needs_reply" and "पनीर" in out and "कल सुबह 09:00 बजे" in out
    assert demo_reply(order, {"kind": "cancel", "text": ""}) == (
        "कोई बात नहीं, ऑर्डर रद्द कर दिया गया है।",
        "cancelled",
    )
    for text in ("कल सुबह 8 बजे भेजें", "रविवार को भेजें", "धन्यवाद", "दाम कम करें"):
        reply, _status = demo_reply(order, {"kind": "text", "text": text})
        assert not re.search(r"[A-Za-z]", reply), reply
    english = demo_reply({**order, "lang": "en"}, {"kind": "cancel", "text": ""})
    assert english == ("No problem, the order is cancelled.", "cancelled")


def test_OB_248_google_practice_has_no_reviewer_jargon_in_any_language() -> None:
    """A main Grow tile for every visitor: plain words, in every language (PHONE-UX-RULES 7)."""
    source = (ROOT / "src/features/google-sim/strings.ts").read_text(encoding="utf-8")
    assert not re.search(r"fixture|oauth|authorization|validated|revision", source, re.I)
    # The local check, revision number and receipt id are gone from the screen, not reworded.
    screen = (ROOT / "src/features/google-sim/GoogleSimulator.tsx").read_text(encoding="utf-8")
    for gone in ("t.local", "t.revision", "t.receipt", "t.submissions"):
        assert gone not in screen and f"  {gone[2:]}:" not in source
    # Hindi's own word for "revision", and every language's table row is there.
    assert "संस्करण" not in source
    for plain in ("Shop type", "दुकान का प्रकार", "店铺类型", "Jenis kedai", "கடை வகை"):
        assert plain in source


def test_OB_248_practice_phone_stays_in_the_practice(live_parent_demo) -> None:  # noqa: F811
    """The visitor need not invent a number; the sample shop's public phone stays empty."""
    client, _app, session, bid = live_parent_demo
    state = owner(client, session, f"businesses/{bid}/google-sim")
    assert state.status_code == 200, state.text
    assert state.json()["facts"]["phone"] == PRACTICE_PHONE
    shop = owner(client, session, f"businesses/{bid}").json()
    assert not shop.get("phone") and not (shop.get("fields") or {}).get("phone")


def test_OB_248_the_demo_supplier_has_a_pin_of_its_own(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    response = client.post(
        f"/api/v1/demo/sessions/{session}/coach", json={"message": "My milk is running low"}
    )
    events = {event["kind"]: event for event in _coach_events(response)}
    assert events["suppliers"]["data"]["suppliers"][0]["distance_km"] > 0
    assert " 0 km" not in events["reply"]["text"]
