from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app import demo_supply_seed, supply_chain, supply_io
from app.demo_chains import FRESHMART, METRO
from app.demo_data import SHOPS
from app.merchant import MerchantStore
from app.supply_rules import business_size, default_rules
from scripts.seed_demo_shops import seed

SMALL = tuple(
    next(shop.id for shop in SHOPS if shop.fields.currency == currency)
    for currency in ("SGD", "INR")
)
# The channel each business size really uses with its suppliers.
CHANNEL = {**dict.fromkeys(SMALL, "text"), FRESHMART.id: "csv", METRO.id: "idoc"}


def orders(store: MerchantStore, bid: str) -> list[dict[str, Any]]:
    return store.feature_docs.scoped(supply_chain.ORDERS, bid, 20)


def formats(store: MerchantStore, bid: str) -> set[str]:
    rows = orders(store, bid)
    return {
        doc["raw_format"]
        for row in rows
        for doc in row["documents"]
        if doc.get("direction") != "out"
    } | {entry["raw_format"] for entry in supply_io.inbox(store, bid)}


def test_seed_is_idempotent_and_every_shop_uses_its_size_channel(tmp_path: Path) -> None:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    seed(store)
    before = {bid: orders(store, bid) for bid in CHANNEL}
    inbox_before = {bid: supply_io.inbox(store, bid) for bid in CHANNEL}
    assert all(len(rows) >= 2 for rows in before.values())
    seed(store)
    assert {bid: orders(store, bid) for bid in CHANNEL} == before
    assert {bid: supply_io.inbox(store, bid) for bid in CHANNEL} == inbox_before
    for bid, channel in CHANNEL.items():
        assert formats(store, bid) == {channel}, bid
        for order in before[bid]:
            assert order["partner"]["demo"] and order["partner"]["id"].startswith("demo-")
            assert order["partner"]["name"].endswith("(Demo)")
            assert order["partner"]["system"] == channel or order["partner"]["id"].endswith(
                "stores"
            )
    # Nobody below a chain ever sees SAP: a stall and a minimart have no IDoc at all.
    for bid in (*SMALL, FRESHMART.id):
        for row in before[bid]:
            assert not any(doc["raw_format"] == "idoc" for doc in row["documents"])
            assert not any(doc.get("translated_format") == "idoc" for doc in row["documents"])


def test_stall_orders_by_whatsapp_with_everyday_items(tmp_path: Path) -> None:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    seed(store)
    for bid in SMALL:
        first = sorted(orders(store, bid), key=lambda r: r["number"])[0]
        assert first["terms_days"] == 0  # cash on delivery
        assert "Sugar" in {line["item"] for line in first["lines"]}
        assert len(first["lines"]) >= 3 and first["total"] < 100_000_00
        assert first["documents"][0]["raw"].startswith("*Purchase order")
        assert {d["kind"] for d in first["documents"]} == {"ORDERS", "RECEIPT"}


@pytest.mark.parametrize("bid", [*SMALL, FRESHMART.id])
def test_next_demo_document_keeps_the_shops_channel(tmp_path: Path, bid: str) -> None:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    seed(store)
    result = demo_supply_seed.next_document(store, "demo-world-owner", bid)
    assert result["entry"]["raw_format"] == CHANNEL[bid]
    assert result["entry"]["partner"]["system"] == CHANNEL[bid]


def test_minimart_emails_csv_with_a_change_and_a_receipt(tmp_path: Path) -> None:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    seed(store)
    rows = {row["number"]: row for row in orders(store, FRESHMART.id)}
    assert rows["PO-FM-2210"]["documents"][0]["raw"].startswith("doc_type,")
    assert rows["PO-FM-2210"]["terms_days"] == 7
    assert any(
        d["kind"] == "RECEIPT" and d["status"] == "sent" for d in rows["PO-FM-2210"]["documents"]
    )
    assert rows["PO-FM-2211"]["pending_change"]["changes"]
    assert business_size(FRESHMART.fields.model_dump()) == "mid"


def test_chain_runs_sap_both_ways(tmp_path: Path) -> None:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    seed(store)
    rows = orders(store, METRO.id)
    assert business_size(METRO.fields.model_dump()) == "large"
    distributor = next(r for r in rows if r["direction"] == "in" and r["status"] == "closed")
    assert [d["kind"] for d in distributor["documents"]] == [
        "ORDERS",
        "ORDRSP",
        "DESADV",
        "INVOIC",
        "RECEIPT",
    ]
    assert distributor["documents"][0]["raw"].lstrip().startswith("<")  # ORDERS05
    assert distributor["terms_days"] == 30
    stores = next(r for r in rows if r["direction"] == "out")
    kinds = {d["kind"] for d in stores["documents"]}
    assert {"ORDERS", "ORDER_CHANGE", "DESADV"} <= kinds
    assert {e["kind"] for e in supply_io.inbox(store, METRO.id)} >= {"FORECAST", "ORDERS"}


@pytest.mark.parametrize(
    ("category", "outlets", "size", "channel", "terms"),
    [
        ("Tea stall", 0, "small", "text", 0),
        ("Kirana", 1, "small", "text", 0),
        ("Minimart", 3, "mid", "csv", 7),
        ("Bakery", 5, "mid", "csv", 7),
        ("Supermarket chain", 24, "large", "idoc", 30),
        ("Restaurant group", 0, "large", "idoc", 30),
    ],
)
def test_default_channel_follows_business_size(
    category: str, outlets: int, size: str, channel: str, terms: int
) -> None:
    facts = [{"key": "outlets", "value": str(outlets)}] if outlets else []
    fields = {"category": category, "custom_facts": facts}
    assert business_size(fields) == size
    rules = default_rules({"demo": True, "products": []}, "INR", 0, 100, business_size(fields))
    assert (rules.system_format, rules.terms_days) == (channel, terms)
