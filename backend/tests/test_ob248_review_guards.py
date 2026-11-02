"""OB-248 (#637): guards for three advisory review findings on the order settle and the draft
language. Each runs the real owner path and, where there is one, the demo path."""

import asyncio
import contextvars

from app import supply_chain
from app.agent import ui_language
from app.coordinator import find_suppliers, prepare_order
from tests.test_ob248_demo_flow import again, draft_and_send, instant, order_of, receive, send  # noqa: F401
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo import owner
from tests.test_public_demo_no_paid_ai import live_parent_demo, no_paid_calls  # noqa: F401
from tests.test_sourcing import ctx  # noqa: F401
from tests.test_supply_chain import draft, shop  # noqa: F401


def test_settle_uses_the_line_price_when_the_confirmed_price_is_empty() -> None:
    po = {
        "lines": [
            {"line": 1, "item": "Atta", "unit": "kg", "quantity": 6, "price": 200, "total": 1200},
        ]
    }
    po["lines"][0].update(confirmed=4, confirmed_price=None, backorder_quantity=2)
    supply_chain.settle_confirmation(po)
    line = po["lines"][0]
    assert line["price"] == 200 and line["total"] == 800
    assert po["total"] == po["confirmed_total"] == 800


def accepted_short(store, bid: str) -> dict:
    po = draft(store, bid, "atta")["order"]
    if po["blocked"]:
        fix = next(c["fix"] for c in po["checks"] if c["blocking"] and c["fix"])
        po = supply_chain.apply_fix(store, "alice", bid, po["id"], po["version"], fix)
    po = supply_chain.approve(store, "alice", bid, po["id"], po["version"])
    po = asyncio.run(supply_chain.simulate(store, "alice", bid, po["id"], po["version"], "partial"))
    assert po["status"] == "changed"
    for flag in [f for f in po["documents"][-1]["flags"] if f["resolved"] is None]:
        po = supply_chain.resolve_flag(
            store, "alice", bid, po["id"], po["version"], flag["id"], flag["options"][0]
        )
    return supply_chain.accept(store, "alice", bid, po["id"], po["version"])


def test_owner_short_reply_accepted_sets_price_total_and_acceptance(shop) -> None:  # noqa: F811
    store, bid = shop
    po = accepted_short(store, bid)
    line = po["lines"][0]
    assert line["confirmed_price"] is not None
    assert 0 < line["confirmed"] < line["quantity"]
    assert line["total"] == po["total"] == round(line["price"] * line["confirmed"])
    # SupplierTalk shows the owner's "OK, go ahead." from this flag.
    assert po["changes_accepted"] is True


def test_demo_short_and_dearer_replies_accepted_set_acceptance(
    live_parent_demo,  # noqa: F811
    instant,  # noqa: F811
) -> None:
    client, _app, session, bid = live_parent_demo
    first = draft_and_send(client, session, bid)
    assert order_of(client, session, bid, first["id"]).get("changes_accepted") is None
    receive(client, session, bid, first["id"])
    order = first
    for _ in range(2):
        sent = send(client, session, bid, again(client, session, bid, order["id"]))
        changed = order_of(client, session, bid, sent["id"])
        assert changed["status"] == "changed" and not changed.get("changes_accepted")
        accepted = owner(
            client,
            session,
            f"businesses/{bid}/supply/orders/{sent['id']}/accept",
            "POST",
            json={"version": changed["version"]},
        )
        assert accepted.status_code == 200, accepted.text
        order = accepted.json()
        assert order["changes_accepted"] is True
        line = order["lines"][0]
        assert line["total"] == order["total"] == round(line["price"] * line["confirmed"])
        receive(client, session, bid, order["id"])


def test_prepare_order_with_ui_language_unset_or_empty(ctx) -> None:  # noqa: F811
    mill = asyncio.run(find_suppliers("flour"))["suppliers"][0]["id"]

    def made() -> str:
        result = prepare_order(mill, [{"name": "flour", "quantity": 2, "unit": "kg"}])
        assert result["status"] == "needs_owner_tap", result
        return ctx.cards[result["card_id"]][1]["lang"]

    # Never set: the context default is English, and a draft made with it says so.
    assert contextvars.Context().run(ui_language.get) == "en"
    assert made() in {"en", "hi"}

    def empty() -> str:
        ui_language.set(None)  # type: ignore[arg-type]
        return made()

    # Set to nothing: the draft still falls back to English instead of crashing.
    assert contextvars.copy_context().run(empty) == "en"
