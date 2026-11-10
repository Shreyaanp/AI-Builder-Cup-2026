"""Chat and taps share one supplier list (OB-223, OB-265): compare it, save from it, and no order
until the owner picks a supplier. A "don't" does nothing."""

import asyncio
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from app import supplier_book, supply_chain
from app.agent import ui_language
from app.coordinator import MerchantContext, current, find_suppliers, save_supplier
from app.merchant import MerchantStore
from app.supplier_chat import answer
from tests.test_merchant_routes import settings  # noqa: F401 - shared fixture
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo_no_paid_ai import live_parent_demo, no_paid_calls  # noqa: F401
from tests.test_supply_one_system import open_shop


@pytest.fixture
def listed(tmp_path: Path) -> Iterator[tuple[MerchantStore, str, MerchantContext, dict[str, Any]]]:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = open_shop(store)
    ctx = MerchantContext(store, "alice", bid, [])
    token = current.set(ctx)
    try:
        found = asyncio.run(find_suppliers("Milk"))
        assert found["status"] == "found", found
        yield store, bid, ctx, found
    finally:
        current.reset(token)


def test_OB_265_compare_names_the_cheapest_and_the_nearest(listed) -> None:
    _store, _bid, ctx, found = listed
    said = answer(ctx, "Which one is cheapest and which is nearest?")
    assert said is not None
    assert said.intent == "compare_suppliers"
    cheapest = next(c for c in found["suppliers"] if c["id"] == found["cheapest_id"])
    nearest = next(c for c in found["suppliers"] if c["id"] == found["nearest_id"])
    assert f"Cheapest: {cheapest['name']}" in said.reply
    assert f"Nearest: {nearest['name']}" in said.reply
    # The list comes back with its buttons, and nothing is drafted.
    assert [event.kind for event in said.events] == ["suppliers"]
    assert not ctx.cards or all(kind != "order" for kind, _ in ctx.cards.values())


def test_OB_265_compare_answers_in_hindi_only_when_the_owner_chose_it(listed) -> None:
    _store, _bid, ctx, _found = listed
    english = answer(ctx, "सबसे सस्ता कौन है?")
    assert english is not None and "Cheapest:" in english.reply
    token = ui_language.set("hi")
    try:
        hindi = answer(ctx, "सबसे सस्ता कौन है?")
    finally:
        ui_language.reset(token)
    assert hindi is not None and "सबसे सस्ता:" in hindi.reply


@pytest.mark.parametrize(
    "text",
    [
        "don't save the first one",
        "mat save karo pehla",
        "पहला सेव मत करो",
        "do not order the cheapest",
    ],
)
def test_OB_223_a_dont_never_saves_or_orders(listed, text) -> None:
    store, bid, ctx, _found = listed
    assert answer(ctx, text) is None
    assert supply_chain.relationships(store, "alice", bid) == []


def test_OB_223_saving_by_chat_is_the_saved_supplier_on_screen(listed) -> None:
    store, bid, ctx, found = listed
    said = answer(ctx, "save the second one as my supplier")
    assert said is not None
    assert [event.kind for event in said.events] == ["supplier_saved"]
    second = found["suppliers"][1]
    assert said.events[0].data == {"supplier_id": second["id"], "saved": True}
    assert supplier_book.detail(store, "alice", bid, second["id"])["saved"] is True
    assert [r["supplier"]["id"] for r in supply_chain.relationships(store, "alice", bid)] == [
        second["id"]
    ]
    assert second["name"] in said.reply


def test_OB_223_removing_by_chat_takes_it_off(listed) -> None:
    store, bid, ctx, found = listed
    supplier_book.save(store, "alice", bid, found["suppliers"][0]["id"])
    said = answer(ctx, "remove the first one from my suppliers")
    assert said is not None and said.intent == "remove_supplier"
    assert supply_chain.relationships(store, "alice", bid) == []


def test_OB_223_the_live_tool_is_the_same_save(listed) -> None:
    store, bid, ctx, found = listed
    sid = found["suppliers"][0]["id"]
    made = save_supplier(sid)
    assert made["status"] == "saved"
    assert ctx.cards[made["card_id"]] == ("supplier_saved", {"supplier_id": sid, "saved": True})
    assert supplier_book.detail(store, "alice", bid, sid)["saved"] is True


def test_OB_265_ordering_from_a_pick_drafts_for_that_supplier(listed) -> None:
    _store, _bid, ctx, found = listed
    said = answer(ctx, "order 5 litre from the cheapest", ordering=True)
    assert said is not None and said.intent == "prepare_order"
    order = next(event.data for event in said.events if event.kind == "order")
    assert order["supplier"]["id"] == found["cheapest_id"]
    assert order["lines"][0]["quantity"] == 5


def test_OB_265_order_with_no_pick_drafts_nothing(listed) -> None:
    _store, _bid, ctx, _found = listed
    assert answer(ctx, "order 5 litre", ordering=True) is None
    assert all(kind != "order" for kind, _ in ctx.cards.values())


def test_OB_223_nothing_to_compare_without_a_list(tmp_path: Path) -> None:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = open_shop(store)
    assert answer(MerchantContext(store, "alice", bid, []), "which is cheapest?") is None


def events_of(response) -> list[dict]:
    return [
        json.loads(line[5:].strip())
        for line in response.text.splitlines()
        if line.startswith("data:")
    ]


def kinds(response) -> list[str]:
    return [event["kind"] for event in events_of(response)]


def test_OB_265_demo_find_suppliers_lists_and_drafts_nothing(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    url = f"/api/v1/demo/sessions/{session}/coach"
    events = events_of(client.post(url, json={"message": "Find suppliers for milk"}))
    assert "suppliers" in [event["kind"] for event in events]
    assert "order" not in [event["kind"] for event in events]
    reply = next(event["text"] for event in events if event["kind"] == "reply")
    # S2-2: never sent back to the form the owner just used.
    assert "Buy stock" not in reply and "Next, open" not in reply
    listed = next(event["data"] for event in events if event["kind"] == "suppliers")
    assert len(listed["suppliers"]) >= 2
    assert all("tags" in card and "compare" in card for card in listed["suppliers"])


def test_OB_223_demo_compare_save_and_open_on_one_list(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, bid = live_parent_demo
    url = f"/api/v1/demo/sessions/{session}/coach"
    found = events_of(client.post(url, json={"message": "Find suppliers for milk"}))
    cards = next(e["data"] for e in found if e["kind"] == "suppliers")["suppliers"]
    compared = events_of(client.post(url, json={"message": "which is the cheapest and nearest?"}))
    assert "Cheapest:" in next(e["text"] for e in compared if e["kind"] == "reply")
    assert "supplier_saved" in kinds(client.post(url, json={"message": "save the first one"}))
    base = f"/api/v1/demo/sessions/{session}/api/businesses/{bid}/supply"
    assert client.get(f"{base}/suppliers/{cards[0]['id']}").json()["saved"] is True
    mine = client.get(base).json()["suppliers"]
    assert [row["supplier"]["id"] for row in mine if row.get("saved")] == [cards[0]["id"]]
    assert client.delete(f"{base}/suppliers/{cards[0]['id']}/save").status_code == 200
    assert client.get(f"{base}/suppliers/{cards[0]['id']}").json()["saved"] is False
