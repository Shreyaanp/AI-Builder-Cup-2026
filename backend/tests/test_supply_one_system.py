"""One supply system (OB-223, OB-224, OB-265, OB-214): suppliers can be opened, compared in one
unit and saved, by tap or by chat, and the coach drafts only from the supplier the owner picked."""

import asyncio
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from app import sourcing, supplier_book, supply_chain
from app.coordinator import DEMO_OWNER_UID, MerchantContext, SupplierGenerator, current
from app.forecast import ForecastService
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.sourcing_offline import pick_supplier
from app.supplier_compare import compare_cards, per_common_unit
from app.tour_story import seed_workspace, top_up_tour_sales, tour_id
from tests.test_supply_chain import BENGALURU, offline


def card(sid: str, price: float, unit: str, km: float, name: str = "Milk") -> dict[str, Any]:
    return {
        "rank": 1,
        "id": sid,
        "name": sid,
        "distance_km": km,
        "demo": False,
        "item": {"name": name, "price": price, "unit": unit, "available": True},
    }


def test_OB_265_a_pack_with_a_size_is_priced_per_litre() -> None:
    assert per_common_unit({"name": "Milk 500 ml", "price": 29, "unit": "pack"}) == (58.0, "litre")
    assert per_common_unit({"name": "Milk", "price": 54, "unit": "l"}) == (54.0, "litre")
    assert per_common_unit({"name": "Tea", "price": 50, "unit": "g"}) == (50000.0, "kg")


def test_OB_265_a_pack_of_unknown_size_is_never_guessed() -> None:
    assert per_common_unit({"name": "Milk", "price": 29, "unit": "pack"}) == (29.0, "pack")


def test_OB_265_the_demo_milk_pack_is_a_half_litre() -> None:
    product = {"name": "Milk", "price": 29, "unit": "pack"}
    assert per_common_unit(product, demo=True) == (58.0, "litre")


def test_OB_265_cheapest_compares_the_same_unit_not_the_raw_price() -> None:
    cards = [card("litre", 54, "litre", 2.0), card("pack", 29, "pack", 0.5, name="Milk 500 ml")]
    result = compare_cards(cards)
    assert result["cheapest_id"] == "litre"
    assert result["nearest_id"] == "pack"
    assert cards[0]["compare"] == {"price": 54.0, "unit": "litre"}
    assert cards[1]["compare"] == {"price": 58.0, "unit": "litre"}
    assert cards[1]["pack"] == {"price": 29.0, "unit": "pack", "size": "500 ml"}
    assert cards[0]["tags"] == ["cheapest"]
    assert cards[1]["tags"] == ["nearest"]


def test_OB_265_a_price_that_cannot_be_compared_is_not_called_cheapest() -> None:
    cards = [card("a", 54, "litre", 2.0), card("b", 58, "litre", 3.0), card("c", 5, "pack", 4.0)]
    result = compare_cards(cards)
    assert result["cheapest_id"] == "a"
    assert cards[2]["compare"] is None
    assert "cheapest" not in cards[2]["tags"]


def test_OB_265_one_supplier_has_no_tags() -> None:
    cards = [card("a", 54, "litre", 2.0)]
    compare_cards(cards)
    assert cards[0]["tags"] == []


def test_OB_265_out_of_stock_is_never_cheapest() -> None:
    cards = [card("a", 54, "litre", 2.0), card("b", 40, "litre", 3.0)]
    cards[1]["item"]["available"] = False
    assert compare_cards(cards)["cheapest_id"] == "a"


FOUND = {
    "cheapest_id": "cheap",
    "nearest_id": "near",
    "suppliers": [
        {"id": "first", "name": "Shree Ganesh Traders"},
        {"id": "cheap", "name": "Lakshmi Cash and Carry"},
        {"id": "near", "name": "Corner Dairy"},
    ],
}


@pytest.mark.parametrize(
    ("said", "expected"),
    [
        ("order from the cheapest", "cheap"),
        ("go with the nearest one", "near"),
        ("order from number 3", "near"),
        ("take the second one", "cheap"),
        ("order 20 kg onions from Lakshmi Cash and Carry", "cheap"),
        ("order 20 kg onions", None),
        ("looks good", None),
    ],
)
def test_OB_265_the_supplier_is_the_one_the_owner_picked(said, expected) -> None:
    assert pick_supplier(said, FOUND) == expected


def open_shop(store: MerchantStore) -> str:
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ahmed Kirana",
                category="Grocery",
                location="Tolichowki, Hyderabad",
                lat=BENGALURU[0],
                lng=BENGALURU[1],
                currency="INR",
                timezone="Asia/Kolkata",
                phone="+91 98450 00000",
            ),
            products=[ProductFields(name="Sugar", price=4800, unit="kg", stock=3)],
        ),
    )
    return store.commit("alice", proposal["id"], proposal["digest"])["business_id"]


@pytest.fixture
def shop(tmp_path: Path) -> Iterator[tuple[MerchantStore, str]]:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = open_shop(store)
    token = current.set(MerchantContext(store, "alice", bid, []))
    try:
        yield store, bid
    finally:
        current.reset(token)


def find(store: MerchantStore, bid: str, item: str = "Milk") -> dict[str, Any]:
    return asyncio.run(
        sourcing.find(
            store, "alice", bid, item, None, "", SupplierGenerator(offline()), DEMO_OWNER_UID
        )
    )


def test_OB_223_a_found_supplier_opens_with_everything_it_sells(shop) -> None:
    store, bid = shop
    first = find(store, bid)["suppliers"][0]
    detail = supplier_book.detail(store, "alice", bid, first["id"])
    assert detail["name"] == first["name"]
    assert detail["distance_km"] == first["distance_km"]
    assert detail["saved"] is False
    assert any(p["name"] == first["item"]["name"] for p in detail["products"])


def test_OB_223_a_saved_supplier_is_on_my_suppliers_with_no_order_yet(shop) -> None:
    store, bid = shop
    first = find(store, bid)["suppliers"][0]
    assert supply_chain.relationships(store, "alice", bid) == []
    supplier_book.save(store, "alice", bid, first["id"])
    rows = supply_chain.relationships(store, "alice", bid)
    assert [(r["supplier"]["id"], r["saved"]) for r in rows] == [(first["id"], True)]
    assert supplier_book.detail(store, "alice", bid, first["id"])["saved"] is True


def test_OB_223_saving_twice_keeps_one_row_and_the_owners_rules(shop) -> None:
    store, bid = shop
    first = find(store, bid)["suppliers"][0]
    supplier_book.save(store, "alice", bid, first["id"])
    version = supply_chain.relationships(store, "alice", bid)[0]["version"]
    supplier_book.save(store, "alice", bid, first["id"])
    rows = supply_chain.relationships(store, "alice", bid)
    assert len(rows) == 1
    assert rows[0]["version"] == version


def test_OB_223_removing_a_supplier_with_no_orders_takes_it_off_the_list(shop) -> None:
    store, bid = shop
    first = find(store, bid)["suppliers"][0]
    supplier_book.save(store, "alice", bid, first["id"])
    supplier_book.remove(store, "alice", bid, first["id"])
    assert supply_chain.relationships(store, "alice", bid) == []


def test_OB_223_another_shops_demo_supplier_cannot_be_opened_or_saved(shop) -> None:
    store, bid = shop
    other = sourcing.demo_supplier_id("someone-else", 0)
    with pytest.raises(HTTPException):
        supplier_book.detail(store, "alice", bid, other)
    with pytest.raises(HTTPException):
        supplier_book.save(store, "alice", bid, other)


def test_OB_223_found_cards_say_which_are_saved(shop) -> None:
    store, bid = shop
    first = find(store, bid)["suppliers"][0]
    supplier_book.save(store, "alice", bid, first["id"])
    cards = {c["id"]: c for c in find(store, bid)["suppliers"]}
    assert cards[first["id"]]["saved"] is True
    assert sum(c["saved"] for c in cards.values()) == 1


def test_OB_223_order_more_goes_to_the_saved_supplier(shop) -> None:
    store, bid = shop
    found = find(store, bid, "Sugar")["suppliers"]
    assert len(found) >= 2
    pick = found[-1]
    supplier_book.save(store, "alice", bid, pick["id"])
    made = asyncio.run(
        supply_chain.draft_reorder(
            store,
            "alice",
            bid,
            "Sugar",
            40,
            ForecastService(offline()),
            SupplierGenerator(offline()),
            DEMO_OWNER_UID,
            direct=True,
        )
    )
    assert made["status"] == "drafted", made
    assert made["order"]["supplier"]["id"] == pick["id"]


def ctx_for(store: MerchantStore, bid: str) -> Any:
    return SimpleNamespace(store=store, uid="alice", business_id=bid, cards={})


@pytest.fixture
def world(tmp_path: Path) -> MerchantStore:
    return MerchantStore(str(tmp_path / "tour.sqlite3"))


TODAY = date(2026, 11, 10)


def seeded(store: MerchantStore, ago: int) -> str:
    return seed_workspace(store, "owner", "bengaluru", TODAY - timedelta(days=ago))[0]


def days_of(store: MerchantStore, bid: str) -> list[str]:
    return sorted({row["date"] for row in store.sales_history("owner", bid)})


@pytest.mark.parametrize("ago", [7, 10, 14, 30])
def test_OB_214_a_tour_shop_comes_back_with_sales_up_to_yesterday(world, ago) -> None:
    bid = seeded(world, ago)
    assert top_up_tour_sales(world, "owner", TODAY) == [bid]
    assert days_of(world, bid)[-1] == (TODAY - timedelta(days=1)).isoformat()


@pytest.mark.parametrize("ago", [7, 10, 14, 30])
def test_OB_214_a_tour_shop_keeps_suggesting_a_reorder(world, ago, monkeypatch) -> None:
    bid = seeded(world, ago)
    top_up_tour_sales(world, "owner", TODAY)
    monkeypatch.setattr(supply_chain, "shop_today", lambda _context: TODAY)
    made = asyncio.run(
        supply_chain.draft_reorder(
            world,
            "owner",
            bid,
            "",
            None,
            ForecastService(offline()),
            SupplierGenerator(offline()),
            DEMO_OWNER_UID,
        )
    )
    assert made["status"] != "needs_item", made


def test_OB_214_the_top_up_keeps_days_already_there(world) -> None:
    bid = seeded(world, 10)
    kept = (TODAY - timedelta(days=12)).isoformat()
    before = [row for row in world.sales_history("owner", bid) if row["date"] == kept]
    assert before
    top_up_tour_sales(world, "owner", TODAY)
    assert [row for row in world.sales_history("owner", bid) if row["date"] == kept] == before


def test_OB_214_the_top_up_runs_once_a_day(world) -> None:
    bid = seeded(world, 10)
    assert top_up_tour_sales(world, "owner", TODAY) == [bid]
    assert top_up_tour_sales(world, "owner", TODAY) == []


def test_OB_214_a_real_shop_is_never_topped_up(tmp_path: Path) -> None:
    store = MerchantStore(str(tmp_path / "real.sqlite3"))
    bid = open_shop(store)
    assert top_up_tour_sales(store, "alice", TODAY) == []
    assert store.sales_history("alice", bid) == []
    assert tour_id("alice", "bengaluru") != bid
