"""Reorder "what is coming" (#603): a shop with more than one need, orders on their way."""

import asyncio
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import pytest

from app import supply_chain, supply_coming
from app.coordinator import MerchantContext, current
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.sales import today_for
from tests.test_merchant_routes import approve, settings  # noqa: F401 - shared fixture
from tests.test_supply_chain import BENGALURU, client, draft  # noqa: F401 - shared fixtures

# --- #603: a shop with more than one need ---------------------------------------------------------


def dairy(store: MerchantStore, uid: str = "alice") -> str:
    """Milk runs out first, sugar a day or two later; atta has weeks of stock."""
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Lakshmi Kirana",
                category="Grocery",
                location="Indiranagar, Bengaluru",
                lat=BENGALURU[0],
                lng=BENGALURU[1],
                currency="INR",
                timezone="Asia/Kolkata",
                phone="+91 98450 00000",
            ),
            products=[
                ProductFields(name="Milk", price=6000, unit="litre", stock=8),
                ProductFields(name="Sugar", price=4800, unit="kg", stock=9),
                ProductFields(name="Atta (wheat flour)", price=5500, unit="kg", stock=200),
            ],
        ),
    )
    bid = store.commit(uid, proposal["id"], proposal["digest"])["business_id"]
    today = today_for(store.context(uid, bid)["business"]["fields"])
    rows = [
        {
            "date": (today - timedelta(days=i)).isoformat(),
            "item": item,
            "quantity": quantity,
            "revenue": quantity * price,
        }
        for i in range(1, 29)
        for item, quantity, price in (
            ("Milk", 6, 6000),
            ("Sugar", 3, 4800),
            ("Atta (wheat flour)", 3, 5500),
        )
    ]
    prepared = store.prepare_sales(uid, bid, rows)
    store.save_sales(uid, bid, prepared["id"], prepared["digest"])
    return bid


@pytest.fixture
def dairy_shop(tmp_path: Path) -> Iterator[tuple[MerchantStore, str]]:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = dairy(store)
    token = current.set(MerchantContext(store, "alice", bid, []))
    try:
        yield store, bid
    finally:
        current.reset(token)


def send_po(store: MerchantStore, bid: str, po: dict) -> dict:
    for _ in range(3):
        if not po["blocked"]:
            break
        fix = next(c["fix"] for c in po["checks"] if c["blocking"] and c["fix"])
        po = supply_chain.apply_fix(store, "alice", bid, po["id"], po["version"], fix)
    return supply_chain.approve(store, "alice", bid, po["id"], po["version"])


def chat_order(store: MerchantStore, bid: str, item: str, quantity: float, unit: str) -> dict:
    from app import sourcing
    from app.coordinator import find_suppliers, prepare_order

    found = asyncio.run(find_suppliers(item))
    made = prepare_order(
        found["suppliers"][0]["id"], [{"name": item, "quantity": quantity, "unit": unit}]
    )
    order = sourcing.get_order(store, "alice", bid, made["order_id"])
    assert order["lines"][0]["price"] is not None
    return order


def test_603_milk_on_order_does_not_hide_the_sugar_that_runs_out(dairy_shop) -> None:
    """#603: with milk covered by a sent PO, a generic "Draft a reorder" drafts sugar instead of
    saying no new order is needed; with both covered it says so."""
    store, bid = dairy_shop
    first = draft(store, bid)
    assert first["status"] == "drafted" and first["order"]["reason"]["item"] == "Milk"
    send_po(store, bid, first["order"])
    second = draft(store, bid)
    assert second["status"] == "drafted", second
    assert second["order"]["reason"]["item"] == "Sugar"
    send_po(store, bid, second["order"])
    third = draft(store, bid)
    assert third["status"] == "on_order" and third["item"] in {"Milk", "Sugar"}


def test_603_an_order_the_supplier_cannot_fill_is_not_on_its_way(dairy_shop) -> None:
    """#603: a chat order line the supplier does not have, or an order still waiting on the
    owner's reply, does not count as milk on order."""
    from app import sourcing

    store, bid = dairy_shop
    order = chat_order(store, bid, "Milk", 20, "litre")
    order["lines"][0]["available"] = False
    order = sourcing.save(store, "alice", bid, order, order["created"])
    sourcing.confirm(store, "alice", bid, order["id"], order["version"])
    assert supply_coming.on_order(store, "alice", bid, "Milk", "litre")["quantity"] == 0
    assert draft(store, bid, "milk")["status"] == "drafted"
    # A fillable order counts once sent, but not while it waits for the owner's reply.
    other = chat_order(store, bid, "Sugar", 10, "kg")
    other = sourcing.confirm(store, "alice", bid, other["id"], other["version"])
    assert supply_coming.on_order(store, "alice", bid, "Sugar", "kg")["quantity"] == 10
    stored = sourcing.get_order(store, "alice", bid, other["id"])
    stored["status"], stored["reply_due"] = "needs_reply", None
    sourcing.save(store, "alice", bid, stored, stored["updated"])
    assert supply_coming.on_order(store, "alice", bid, "Sugar", "kg")["quantity"] == 0


def test_603_a_reused_draft_is_sized_again_for_what_is_coming(dairy_shop) -> None:
    """#603: the open sugar draft shrinks when a chat order for some sugar is sent, and is
    withdrawn when what is coming covers the whole need."""
    from app import sourcing

    store, bid = dairy_shop
    po = draft(store, bid, "sugar")["order"]
    wanted = po["reason"]["wanted"]
    assert wanted > 5
    small = chat_order(store, bid, "Sugar", 5, "kg")
    sourcing.confirm(store, "alice", bid, small["id"], small["version"])
    again = draft(store, bid, "sugar")
    assert again["existing"] and again["order"]["id"] == po["id"]
    reason = again["order"]["reason"]
    assert reason["on_order"] == 5 and reason["wanted"] == round(wanted - 5, 2)
    assert again["order"]["lines"][0]["quantity"] < po["lines"][0]["quantity"]
    big = chat_order(store, bid, "Sugar", 200, "kg")
    sourcing.confirm(store, "alice", bid, big["id"], big["version"])
    covered = draft(store, bid, "sugar")
    assert covered["status"] == "on_order" and covered["quantity"] == 205
    assert all(o["id"] != po["id"] for o in supply_chain.orders(store, "alice", bid))
    gone = supply_chain.get_po(store, "alice", bid, po["id"])
    assert gone["status"] == "cancelled" and gone["reason"]["withdrawn"] == "on_order"


def test_603_a_named_quantity_changes_the_right_line(dairy_shop) -> None:
    store, bid = dairy_shop
    po = draft(store, bid, "sugar")["order"]
    po["lines"].insert(0, {**po["lines"][0], "item": "Atta (wheat flour)", "quantity": 7})
    supply_chain._save(store, bid, po)
    again = draft(store, bid, "sugar", 12)["order"]
    atta, sugar = again["lines"]
    assert atta["quantity"] == 7 and sugar["quantity"] >= 12


def test_603_cancelling_a_sent_po_records_the_cancellation(dairy_shop) -> None:
    """#603: "the supplier was told" is backed by a cancellation document on the order."""
    store, bid = dairy_shop
    sent = send_po(store, bid, draft(store, bid, "milk")["order"])
    done = supply_chain.cancel(store, "alice", bid, sent["id"], sent["version"])
    assert done["status"] == "cancelled" and done["cancelled_at"]
    note = done["documents"][-1]
    assert note["kind"] == "ORDER_CHANGE" and note["from"] == "buyer"
    assert note["canonical"]["ref"] == sent["number"]
    assert {line["status"] for line in note["canonical"]["lines"]} == {"rejected"}
    # A draft was never sent: nothing to tell, nothing recorded.
    unsent = draft(store, bid, "sugar")["order"]
    dropped = supply_chain.cancel(store, "alice", bid, unsent["id"], unsent["version"])
    assert dropped["documents"] == [] and "cancelled_at" not in dropped


def test_603_the_overview_reads_the_orders_once(client, monkeypatch) -> None:  # noqa: F811
    """#603: Today's on-order line reads chat orders once per request, not once per need."""
    from app import sourcing

    proposal = client.post(
        "/api/v1/proposals",
        json={
            "kind": "business",
            "business": {"name": "Lakshmi Kirana", "currency": "INR", "timezone": "Asia/Kolkata"},
            "products": [
                {"name": "Milk", "price": 6000, "unit": "litre", "stock": 8},
                {"name": "Sugar", "price": 4800, "unit": "kg", "stock": 9},
            ],
        },
    ).json()
    bid = approve(client, proposal)["business_id"]
    today = date.fromisoformat(client.get(f"/api/v1/businesses/{bid}/freshness").json()["today"])
    rows = "\n".join(
        f"{(today - timedelta(days=i)).isoformat()},{item},{qty},{qty * 60}"
        for i in range(1, 29)
        for item, qty in (("Milk", 6), ("Sugar", 3))
    )
    imported = client.post(
        f"/api/v1/businesses/{bid}/import",
        content=f"Date,Item,Qty,Revenue\n{rows}",
        headers={"Content-Type": "text/csv"},
    ).json()
    client.post(
        f"/api/v1/businesses/{bid}/import/{imported['import_id']}/approve",
        json={"digest": imported["digest"]},
    )
    calls = []
    real = sourcing.orders
    monkeypatch.setattr(sourcing, "orders", lambda *a, **k: calls.append(1) or real(*a, **k))
    overview = client.get(f"/api/v1/businesses/{bid}/supply").json()
    assert {need["item"] for need in overview["needs"]} == {"Milk", "Sugar"}
    assert len(calls) == 1


def test_603_a_covered_item_that_reorder_skips_loses_its_open_draft(dairy_shop) -> None:
    """#603: a milk draft must not stay approvable at 50 l after a 100 l chat order is sent; the
    generic reorder that moves on to sugar withdraws it."""
    from app import sourcing

    store, bid = dairy_shop
    first = draft(store, bid)["order"]
    assert first["reason"]["item"] == "Milk"
    big = chat_order(store, bid, "Milk", 100, "litre")
    sourcing.confirm(store, "alice", bid, big["id"], big["version"])
    second = draft(store, bid)
    assert second["status"] == "drafted" and second["order"]["reason"]["item"] == "Sugar"
    milk = supply_chain.get_po(store, "alice", bid, first["id"])
    assert milk["status"] == "cancelled" and milk["reason"]["withdrawn"] == "on_order"
    assert [
        o["id"] for o in supply_chain.orders(store, "alice", bid) if o["status"] == "draft"
    ] == [second["order"]["id"]]
