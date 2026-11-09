"""OB-333: "Sold out today" is not hiding an item. It stays on the menu, shows as sold out, and is
on sale again the next day or as soon as stock is added. A plain sold out keeps its old meaning."""

from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from app import merchant
from app.merchant import MerchantStore, ProductFields, ProposalRequest, StockRequest
from tests.test_ob239_made_or_bought import open_shop

TODAY = date(2026, 11, 8)
TOMORROW = date(2026, 11, 9)


@pytest.fixture
def shop(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = open_shop(
        store,
        "Lantern Chai",
        "Tea stall",
        [
            ProductFields(name="Masala chai", price=2000, unit="cup", stock=40),
            ProductFields(name="Ginger chai", price=2500, unit="cup"),
            ProductFields(name="Ragi biscuit", price=1500, unit="piece", stock=0, available=False),
        ],
        [],
    )
    store.share("alice", bid, True)
    days = {"now": TODAY}
    monkeypatch.setattr(merchant, "today_for", lambda _fields: days["now"])
    return store, bid, days


def item(store: MerchantStore, bid: str, name: str) -> dict[str, Any]:
    return next(p for p in store.inventory("alice", bid) if p["name"] == name)


def public_item(store: MerchantStore, bid: str, name: str) -> dict[str, Any]:
    page = store.public_shop(bid)
    assert page is not None
    return next(p for p in page["products"] if p["name"] == name)


def test_ob333_sold_out_today_stays_on_the_menu_and_returns_tomorrow(shop):
    store, bid, days = shop
    chai = item(store, bid, "Masala chai")
    saved = store.set_availability("alice", bid, chai["id"], False, True)
    assert saved["available"] is False
    assert saved["sold_out_day"] == TODAY.isoformat()
    # Still on the menu, shown as sold out, today.
    assert item(store, bid, "Masala chai")["available"] is False
    assert public_item(store, bid, "Masala chai")["available"] is False
    # The next day both the owner and customers see it back, with its count.
    days["now"] = TOMORROW
    back = item(store, bid, "Masala chai")
    assert back["available"] is True
    assert back["stock"] == 40
    assert "sold_out_day" not in back
    assert public_item(store, bid, "Masala chai")["available"] is True


def test_ob333_a_plain_sold_out_never_comes_back_by_itself(shop):
    store, bid, days = shop
    chai = item(store, bid, "Masala chai")
    saved = store.set_availability("alice", bid, chai["id"], False)
    assert "sold_out_day" not in saved
    days["now"] = TOMORROW
    assert item(store, bid, "Masala chai")["available"] is False
    assert public_item(store, bid, "Masala chai")["available"] is False


def test_ob333_a_plain_sold_out_replaces_an_earlier_today_only(shop):
    store, bid, days = shop
    chai = item(store, bid, "Masala chai")
    store.set_availability("alice", bid, chai["id"], False, True)
    store.set_availability("alice", bid, chai["id"], False)
    days["now"] = TOMORROW
    assert item(store, bid, "Masala chai")["available"] is False


def test_ob333_today_only_is_ignored_when_putting_back_on_sale(shop):
    store, bid, _ = shop
    chai = item(store, bid, "Masala chai")
    store.set_availability("alice", bid, chai["id"], False, True)
    saved = store.set_availability("alice", bid, chai["id"], True, True)
    assert saved["available"] is True
    assert "sold_out_day" not in saved


def test_ob333_nothing_left_stays_sold_out_tomorrow(shop):
    store, bid, days = shop
    biscuit = item(store, bid, "Ragi biscuit")
    store.set_availability("alice", bid, biscuit["id"], False, True)
    days["now"] = TOMORROW
    assert item(store, bid, "Ragi biscuit")["available"] is False
    assert public_item(store, bid, "Ragi biscuit")["available"] is False


@pytest.mark.parametrize(
    ("before", "change", "available"),
    [
        (4, StockRequest(add=1), True),
        (None, StockRequest(add=1), True),
        (4, StockRequest(stock=9), True),
        # A correction downward is not new stock.
        (4, StockRequest(add=-1), False),
        (4, StockRequest(stock=4), False),
        # Undo of the tap that brought it back says sold out again.
        (5, StockRequest(stock=4, available=False), False),
        (4, StockRequest(stock=0), False),
    ],
)
def test_ob333_adding_stock_ends_sold_out_today(before, change, available):
    fields = {
        "name": "Chai",
        "stock": before,
        "available": False,
        "sold_out_day": TODAY.isoformat(),
    }
    assert change.apply(fields)["available"] is available


def test_ob333_adding_stock_leaves_a_plain_sold_out_alone():
    fields = {"name": "Chai", "stock": 4, "available": False}
    assert StockRequest(add=1).apply(fields)["available"] is False


def edit(
    store: MerchantStore, bid: str, name: str, change: Callable[[dict[str, Any]], dict[str, Any]]
) -> None:
    saved = item(store, bid, name)
    fields = {key: value for key, value in saved.items() if key not in ("id", "sold_out_day")}
    fields = {key: value for key, value in fields.items() if key in ProductFields.model_fields}
    revision = store.context("alice", bid)["business"]["revision"]
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="inventory",
            business_id=bid,
            revision=revision,
            products=[ProductFields(**change(fields))],
        ),
    )
    store.commit("alice", proposal["id"], proposal["digest"])


def test_ob333_a_price_edit_keeps_back_tomorrow(shop):
    store, bid, days = shop
    chai = item(store, bid, "Masala chai")
    store.set_availability("alice", bid, chai["id"], False, True)
    edit(store, bid, "Masala chai", lambda fields: {**fields, "price": 2200})
    saved = item(store, bid, "Masala chai")
    assert (saved["price"], saved["available"]) == (2200, False)
    days["now"] = TOMORROW
    assert item(store, bid, "Masala chai")["available"] is True


def test_ob333_a_proposal_cannot_date_a_sold_out_by_itself(shop):
    store, bid, days = shop
    edit(
        store,
        bid,
        "Masala chai",
        lambda fields: {**fields, "available": False, "sold_out_day": TODAY.isoformat()},
    )
    assert "sold_out_day" not in item(store, bid, "Masala chai")
    days["now"] = TOMORROW
    assert item(store, bid, "Masala chai")["available"] is False
