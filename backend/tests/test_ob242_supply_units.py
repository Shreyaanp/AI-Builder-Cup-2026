"""OB-242 / OB-243: a supply's use comes only from its own sales, never from the cups of a dish
made from it, and a slow supply is never read as "no sales yet"."""

import asyncio
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app import coordinator, supply_chain, supply_coming
from app.coordinator import MerchantContext, current
from app.forecast import ForecastService, weekday_average
from app.main import create_app
from app.merchant import MerchantStore, ProductFields
from app.supply_offline import supply_reply
from app.supply_tools import approve_and_send_po
from tests.test_merchant_routes import settings  # noqa: F401 - shared fixture
from tests.test_ob239_made_or_bought import draft, neighbour, offline, open_shop
from tests.test_photos import join
from tests.test_supply_chain import http_shop

TEA_DUST = [ProductFields(name="Tea dust", price=32000, unit="kg", stock=500)]


@pytest.fixture
def store(tmp_path: Path):
    repo = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    token = current.set(MerchantContext(repo, "alice", "", []))
    try:
        yield repo
    finally:
        current.reset(token)


def tea_stall(store: MerchantStore, tea_dust_sales: float = 0.0) -> str:
    sales = [("Masala chai", 60, 2000)]
    if tea_dust_sales:
        sales.append(("Tea dust", tea_dust_sales, 32000))
    bid = open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        [
            ProductFields(name="Masala chai", price=2000, unit="cup", stock=10),
            ProductFields(name="Tea dust", price=32000, unit="kg", stock=1),
        ],
        sales,
    )
    neighbour(store, bid, "demo-ob242-tea", "Tea Wholesale (Demo)", "Wholesale", TEA_DUST, True)
    return bid


def test_ob242_chai_cups_never_draft_kilos_of_tea_dust(store) -> None:
    # Chai's 60 cups a day were read as 60 kg of tea dust: a 540 kg draft (about ₹1.7 lakh).
    bid = tea_stall(store)
    assert draft(store, bid)["status"] != "drafted"
    result = draft(store, bid, "Tea dust")
    assert result["status"] == "check" and result["reason"] == "no_history", result
    assert supply_chain.orders(store, "alice", bid) == []
    reply = supply_reply("draft_reorder", {**result, "status": "check_quantity"})
    assert reply and "can't tell how much Tea dust you use" in reply
    assert "How much do you buy a week?" in reply and "drafted nothing" in reply


def test_ob242_a_supplys_use_is_only_its_own_sales() -> None:
    today = date(2026, 11, 1)
    rows = [
        {"date": f"2026-11-0{d}", "item": item, "quantity": q, "upper": q, "unit": unit}
        for d in range(2, 9)
        for item, q, unit in (("Masala chai", 60, "cup"), ("Bread", 30, "kg"), ("MILK", 4, "litre"))
    ]
    forecast = {"method": "weekday_average", "predictions": rows}
    need = supply_chain.need_from_forecast
    tea = {"name": "Tea dust", "unit": "kg", "stock": 1}
    assert need(tea, forecast, "Tea dust", today)["daily"] == 0
    # Bread is sold in the flour's unit, and it still is not the flour's use.
    flour = {"name": "Bread flour", "unit": "kg", "stock": 1}
    found = need(flour, forecast, "Bread flour", today)
    assert found["daily"] == 0 and not found["runs_out"]
    milk = {"name": "Milk", "unit": "litre", "stock": 1}
    assert need(milk, forecast, "Milk", today)["daily"] == 4
    assert need(None, forecast, "Milk", today)["daily"] == 4


def product(name: str, unit: str, stock: float = 1, source: str | None = None) -> ProductFields:
    found = ProductFields(name=name, price=10000, unit=unit, stock=stock)
    return found.model_copy(update={"source": source}) if source else found


# The review's table (35 days of sales, none of the supply itself): each one drafted hundreds of
# kilos, litres or items of the supply from a dish's sales.
WRONG_SIZES = [
    ("Sweet shop", "Besan", "kg", "Besan laddu", "kg", 25),
    ("Restaurant", "Rice", "kg", "Coconut rice", "kg", 40),
    ("Restaurant", "Paneer", "kg", "Palak paneer", "kg", 25),
    ("Cafe", "Milk", "litre", "Rose milk", "litre", 40),
    ("Cafe", "Milk", "litre", "Rose milk", "ml", 300),
    ("Restaurant", "Paneer", "item", "Palak paneer", "item", 25),
    ("Tea stall", "Tea dust", "item", "Masala chai", "item", 60),
]


@pytest.mark.parametrize(("category", "supply", "unit", "dish", "dish_unit", "daily"), WRONG_SIZES)
def test_ob242_a_dish_sold_in_the_supplys_unit_never_sizes_it(
    store, category: str, supply: str, unit: str, dish: str, dish_unit: str, daily: int
) -> None:
    bid = open_shop(
        store,
        "Test shop",
        category,
        # Answered "buy": Paneer by the item at a restaurant is asked first (OB-244).
        [product(supply, unit, source="bought"), product(dish, dish_unit, 5)],
        [(dish, daily, 5000)],
    )
    wholesale = [ProductFields(name=supply, price=8000, unit=unit, stock=5000)]
    neighbour(
        store, bid, "demo-ob242-table", "Table Wholesale (Demo)", "Wholesale", wholesale, True
    )
    assert draft(store, bid)["status"] != "drafted"
    result = draft(store, bid, supply)
    assert result["status"] == "check" and result["reason"] == "no_history", result
    assert supply_chain.orders(store, "alice", bid) == []


def test_ob242_hindi_milk_answered_buy_is_not_sized_by_rose_milk(store) -> None:
    # The owner has not said about the milk yet, so it asks first; then it has no use of its own.
    bid = open_shop(
        store,
        "गुप्ता कैफ़े",
        "Cafe",
        [product("दूध", "litre"), product("गुलाब दूध", "litre", 5)],
        [("गुलाब दूध", 40, 5000)],
    )
    wholesale = [ProductFields(name="दूध", price=5000, unit="litre", stock=5000)]
    neighbour(
        store, bid, "demo-ob242-doodh", "Doodh Wholesale (Demo)", "Wholesale", wholesale, True
    )
    assert draft(store, bid, "दूध")["status"] == "ask_source"
    result = draft(store, bid, "दूध", source="bought")
    assert result["status"] == "check" and result["reason"] == "no_history", result
    assert supply_chain.orders(store, "alice", bid) == []


# The second review's table: one bought item's sales sized a different bought item. Answering Buy
# or selling goods under a longer name still is not the supply's own use.
KIRANA = "Grocery / Kirana"
OTHER_ITEMS_SALES = [
    ("Cafe", "Milk", "litre", "Rose milk", "litre", 40, "bought"),
    ("Cafe", "दूध", "litre", "गुलाब दूध", "litre", 40, "bought"),
    ("Tea stall", "Tea dust", "item", "Masala chai", "item", 60, "bought"),
    (KIRANA, "Rice", "kg", "Rice flour", "kg", 20, None),
    (KIRANA, "Milk", "item", "Milk Bikis", "item", 60, None),
    (KIRANA, "Oil", "litre", "Hair oil", "litre", 10, None),
    (KIRANA, "Tea", "pack", "Chai masala", "pack", 12, None),
    (KIRANA, "Atta", "kg", "Aashirvaad Atta", "kg", 8, None),
    ("Restaurant", "Dal", "kg", "Toor dal", "kg", 25, None),
    ("Restaurant", "Dal", "item", "Moong dal", "item", 40, None),
    ("Restaurant", "Rice", "item", "Basmati rice", "item", 40, None),
]


@pytest.mark.parametrize(
    ("category", "supply", "unit", "other", "other_unit", "daily", "source"), OTHER_ITEMS_SALES
)
def test_ob242_another_items_sales_never_size_a_supply(
    store,
    category: str,
    supply: str,
    unit: str,
    other: str,
    other_unit: str,
    daily: int,
    source: str | None,
) -> None:
    bid = open_shop(
        store,
        "Test shop",
        category,
        [product(supply, unit, 2, "bought"), product(other, other_unit, 5000, source)],
        [(other, daily, 5000)],
    )
    wholesale = [ProductFields(name=supply, price=4000, unit=unit, stock=5000)]
    neighbour(
        store, bid, "demo-ob242-other", "Other Wholesale (Demo)", "Wholesale", wholesale, True
    )
    result = draft(store, bid, supply)
    assert result["status"] == "check" and result["reason"] == "no_history", result
    assert result["supplier_quantity"] < daily * supply_chain.CHECK_DAYS
    assert draft(store, bid)["status"] != "drafted"
    assert supply_chain.all_orders(store, bid) == []
    reply = supply_reply("draft_reorder", {**result, "status": "check_quantity"})
    assert reply and "How much do you buy a week?" in reply


@pytest.mark.parametrize(
    ("category", "supply", "unit", "other", "other_unit", "daily", "source"), OTHER_ITEMS_SALES
)
def test_ob242_a_low_item_never_orders_a_different_item_on_the_shelf(
    store,
    category: str,
    supply: str,
    unit: str,
    other: str,
    other_unit: str,
    daily: int,
    source: str | None,
) -> None:
    # The other item is the one running out, so the automatic reorder targets it. The supplier's
    # loose match is the shop's own supply: 355 l of Milk for Rose milk, 175 kg of Dal for Toor dal.
    bid = open_shop(
        store,
        "Test shop",
        category,
        [product(supply, unit, 2, "bought"), product(other, other_unit, 5, source or "bought")],
        [(other, daily, 5000)],
    )
    wholesale = [ProductFields(name=supply, price=4000, unit=unit, stock=5000)]
    neighbour(
        store, bid, "demo-ob242-other", "Other Wholesale (Demo)", "Wholesale", wholesale, True
    )
    draft(store, bid)
    ordered = [line["item"] for po in supply_chain.all_orders(store, bid) for line in po["lines"]]
    assert supply not in ordered, ordered


def test_ob242_the_owner_can_still_name_an_amount_of_a_loose_match(store) -> None:
    bid = open_shop(
        store,
        "Test shop",
        "Cafe",
        [product("Milk", "litre", 2, "bought"), product("Rose milk", "litre", 5, "bought")],
        [("Rose milk", 40, 5000)],
    )
    wholesale = [ProductFields(name="Milk", price=4000, unit="litre", stock=5000)]
    neighbour(
        store, bid, "demo-ob242-other", "Other Wholesale (Demo)", "Wholesale", wholesale, True
    )
    result = draft(store, bid, "Rose milk", quantity=10)
    assert result["status"] == "drafted" and result["order"]["lines"][0]["quantity"] == 10, result


def test_ob242_a_brand_with_no_shelf_row_of_its_own_still_buys_from_the_general_supplier(
    store,
) -> None:
    bid = open_shop(
        store,
        "Lakshmi Kirana",
        "Grocery / Kirana",
        [product("Aashirvaad Atta", "kg", 2, "bought")],
        [("Aashirvaad Atta", 8, 4500)],
    )
    atta = [ProductFields(name="Atta", price=4000, unit="kg", stock=5000)]
    neighbour(store, bid, "demo-ob242-atta", "Atta Wholesale (Demo)", "Wholesale", atta, True)
    result = draft(store, bid)
    assert result["status"] == "drafted", result
    line = result["order"]["lines"][0]
    assert line["item"] == "Atta" and line["quantity"] == 70


def test_ob242_a_tour_style_demo_supply_with_its_own_sales_still_drafts(store) -> None:
    bid = open_shop(
        store,
        "Tour Tea",
        "Tea stall",
        [product("Tea dust", "kg", 1, "bought"), product("Masala chai", "cup", 10, "made")],
        [("Masala chai", 60, 2000), ("Tea dust", 2, 32000)],
    )
    neighbour(store, bid, "demo-ob242-tea", "Tea Wholesale (Demo)", "Wholesale", TEA_DUST, True)
    result = draft(store, bid)
    assert result["status"] == "drafted", result
    line = result["order"]["lines"][0]
    assert line["item"] == "Tea dust" and line["quantity"] <= 2 * supply_chain.CHECK_DAYS


@pytest.mark.parametrize(
    ("stock_row", "supplier_unit"), [(None, "kg"), ("kg", "kg"), ("item", "item")]
)
def test_ob242_off_menu_chai_rows_never_size_tea_dust(
    store, stock_row: str | None, supplier_unit: str
) -> None:
    products = [ProductFields(name="Bun maska", price=3000, unit="plate", stock=5)]
    if stock_row:
        products.append(product("Tea dust", stock_row))
    bid = open_shop(store, "Sharma Chai Corner", "Tea stall", products, [("Chai", 60, 2000)])
    wholesale = [ProductFields(name="Tea dust", price=32000, unit=supplier_unit, stock=5000)]
    neighbour(store, bid, "demo-ob242-tea", "Tea Wholesale (Demo)", "Wholesale", wholesale, True)
    assert draft(store, bid)["status"] != "drafted"
    result = draft(store, bid, "Tea dust")
    assert result["status"] == "check" and result["reason"] == "no_history", result
    assert supply_chain.orders(store, "alice", bid) == []


def test_ob242_off_menu_chai_rows_never_size_the_offline_generators_tea(store) -> None:
    # No linked supplier: the offline generator's shop gave 540 kg of Tea leaves.
    bid = open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        [ProductFields(name="Bun maska", price=3000, unit="plate", stock=5)],
        [("Chai", 60, 2000)],
    )
    assert draft(store, bid, "Tea dust")["status"] != "drafted"
    assert supply_chain.orders(store, "alice", bid) == []


def test_ob242_a_kirana_selling_atta_still_drafts_a_sensible_amount(store) -> None:
    bid = open_shop(
        store,
        "Lakshmi Kirana",
        "Grocery / Kirana",
        [ProductFields(name="Atta", price=4500, unit="kg", stock=2)],
        [("Atta", 3, 4500)],
    )
    atta = [ProductFields(name="Atta", price=4000, unit="kg", stock=5000)]
    neighbour(store, bid, "demo-ob242-atta", "Atta Wholesale (Demo)", "Wholesale", atta, True)
    result = draft(store, bid)
    assert result["status"] == "drafted", result
    line = result["order"]["lines"][0]
    assert line["item"] == "Atta" and line["unit"] == "kg"
    # Enough for the cover days at 3 kg a day, never a month or more.
    assert 3 <= line["quantity"] <= 3 * supply_chain.CHECK_DAYS


def test_ob242_a_kirana_selling_its_stock_directly_keeps_its_sizes(store) -> None:
    sold = [
        ("Atta", "kg", 2, 8, 70),
        ("Milk", "litre", 0, 15, 135),
        ("Parle-G", "pack", 3, 12, 105),
    ]
    bid = open_shop(
        store,
        "Lakshmi Kirana",
        "Grocery / Kirana",
        [ProductFields(name=n, price=5000, unit=u, stock=s) for n, u, s, _, _ in sold],
        [(n, daily, 5000) for n, _, _, daily, _ in sold],
    )
    wholesale = [ProductFields(name=n, price=4000, unit=u, stock=9000) for n, u, _, _, _ in sold]
    neighbour(
        store, bid, "demo-ob242-kirana", "Kirana Wholesale (Demo)", "Wholesale", wholesale, True
    )
    for name, unit, _, _, quantity in sold:
        result = draft(store, bid, name)
        assert result["status"] == "drafted", result
        line = result["order"]["lines"][0]
        assert (line["item"], line["unit"], line["quantity"]) == (name, unit, quantity)


def test_ob243_a_slow_supply_is_not_read_as_no_sales(store) -> None:
    # 0.3 kg of tea dust a day was rounded to 0 and the check said "no sales of Tea dust yet".
    rows = [{"date": f"2026-10-{d:02d}", "item": "Tea dust", "quantity": 0.3} for d in range(1, 29)]
    assert all(p.quantity == 0.3 for p in weekday_average(rows, date(2026, 10, 28)))
    bid = tea_stall(store, tea_dust_sales=0.3)
    result = draft(store, bid, "Tea dust")
    assert result.get("reason") != "no_history", result


def seed_wrong_draft(store: MerchantStore, bid: str, item: str = "Tea dust") -> dict:
    """The draft main left behind: 540 kg of tea dust, sized from 60 cups of chai a day."""
    po = draft(store, bid, item, quantity=10)["order"]
    po["lines"][0]["quantity"] = 540
    po["reason"].update(owner_quantity=False, wanted=540, daily=60)
    supply_chain.recheck(store, bid, po, date.today())
    return supply_chain._save(store, bid, po)


def allow_auto_send(store: MerchantStore, bid: str, supplier: str) -> None:
    row = supply_chain.relationship(store, bid, supplier)
    rules = supply_chain.rules_of(row).model_copy(
        update={"auto_send": True, "approval_over": 10**9, "credit_limit": 0}
    )
    supply_chain.save_rules(store, "alice", bid, supplier, rules, row["version"])


def only_order(store: MerchantStore, bid: str) -> dict:
    found = supply_chain.all_orders(store, bid)
    assert len(found) == 1, found
    return found[0]


def test_ob242_a_wrong_draft_already_saved_is_withdrawn_when_named(store) -> None:
    bid = tea_stall(store)
    seed_wrong_draft(store, bid)
    result = draft(store, bid, "Tea dust")
    assert result["status"] == "check" and result["reason"] == "no_history", result
    # The supplier's smallest order, not the 540 kg the draft held.
    assert result["supplier_quantity"] < 540 and result["supplier_unit"] == "kg"
    po = only_order(store, bid)
    assert po["status"] == "cancelled" and po["reason"]["withdrawn"] == "no_use"
    assert not po["sent"]


def test_ob242_a_wrong_draft_is_never_auto_sent(store) -> None:
    bid = tea_stall(store)
    wrong = seed_wrong_draft(store, bid)
    allow_auto_send(store, bid, wrong["supplier"]["id"])
    result = draft(store, bid, "Tea dust")
    assert result["status"] == "check", result
    po = only_order(store, bid)
    assert po["status"] == "cancelled" and not po["sent"] and not po["auto_sent"]


def test_ob242_the_automatic_reorder_withdraws_a_wrong_draft(store) -> None:
    bid = tea_stall(store)
    seed_wrong_draft(store, bid)
    assert draft(store, bid)["status"] == "needs_item"
    assert only_order(store, bid)["status"] == "cancelled"


def test_ob242_settling_withdraws_a_wrong_draft_while_another_item_is_drafted(store) -> None:
    bid = open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        [
            ProductFields(name="Masala chai", price=2000, unit="cup", stock=10),
            product("Tea dust", "kg"),
            product("Milk", "litre", 0),
        ],
        [("Masala chai", 60, 2000), ("Milk", 15, 6000)],
    )
    wholesale = [*TEA_DUST, ProductFields(name="Milk", price=5000, unit="litre", stock=5000)]
    neighbour(store, bid, "demo-ob242-tea", "Tea Wholesale (Demo)", "Wholesale", wholesale, True)
    wrong = seed_wrong_draft(store, bid)
    allow_auto_send(store, bid, wrong["supplier"]["id"])
    result = draft(store, bid)
    assert result["status"] == "drafted" and result["order"]["lines"][0]["item"] == "Milk", result
    after = next(p for p in supply_chain.all_orders(store, bid) if p["id"] == wrong["id"])
    assert after["status"] == "cancelled" and not after["sent"]
    assert after["reason"]["withdrawn"] == "no_use"


def test_ob242_the_owners_own_quantity_stays_and_a_draft_with_real_use_stays(store) -> None:
    bid = open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        [product("Tea dust", "kg"), product("Milk", "litre", 0)],
        [("Milk", 15, 6000)],
    )
    wholesale = [*TEA_DUST, ProductFields(name="Milk", price=5000, unit="litre", stock=5000)]
    neighbour(store, bid, "demo-ob242-tea", "Tea Wholesale (Demo)", "Wholesale", wholesale, True)
    # Tea dust has no use on record, but the owner named 10 kg.
    named = draft(store, bid, "Tea dust", quantity=10)["order"]
    again = draft(store, bid, "Tea dust")
    assert again["status"] == "drafted" and again["existing"], again
    assert again["order"]["id"] == named["id"] and again["order"]["lines"][0]["quantity"] == 10
    # Milk has its own sales, so the automatic reorder keeps both.
    milk = draft(store, bid)["order"]
    assert milk["lines"][0]["item"] == "Milk"
    draft(store, bid)
    statuses = {p["id"]: p["status"] for p in supply_chain.all_orders(store, bid)}
    assert statuses == {named["id"]: "draft", milk["id"]: "draft"}


def slow_tea_stall(store: MerchantStore) -> tuple[str, dict]:
    """Tea dust really is used, 0.3 kg a day. The supplier is known and auto-send is on, with a
    limit above the total: only the size check stands between the 540 kg draft and the supplier."""
    bid = open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        [
            ProductFields(name="Masala chai", price=2000, unit="cup", stock=10),
            product("Tea dust", "kg"),
            product("Milk", "litre", 1000),
        ],
        [("Masala chai", 60, 2000), ("Tea dust", 0.3, 32000)],
    )
    wholesale = [*TEA_DUST, ProductFields(name="Milk", price=5000, unit="litre", stock=5000)]
    neighbour(store, bid, "demo-ob242-tea", "Tea Wholesale (Demo)", "Wholesale", wholesale, True)
    first = draft(store, bid, "Milk", quantity=10)["order"]
    supply_chain.approve(store, "alice", bid, first["id"], first["version"])
    wrong = seed_wrong_draft(store, bid)
    allow_auto_send(store, bid, wrong["supplier"]["id"])
    wrong = supply_chain.get_po(store, "alice", bid, wrong["id"])
    supply_chain.recheck(store, bid, wrong, date.today())
    assert wrong["auto_send_allowed"], wrong["checks"]
    return bid, wrong


@pytest.mark.parametrize("item", ["Tea dust", ""])
def test_ob242_an_oversized_draft_with_real_use_is_withdrawn_never_sent(store, item: str) -> None:
    bid, wrong = slow_tea_stall(store)
    result = draft(store, bid, item)
    assert result["status"] == "check" and result["reason"] == "month", result
    assert result["quantity"] == 10 and result["days"] == 33
    after = supply_chain.get_po(store, "alice", bid, wrong["id"])
    assert after["status"] == "cancelled" and after["reason"]["withdrawn"] == "too_big"
    assert not after["sent"] and not after["auto_sent"] and after["lines"][0]["quantity"] == 540


def test_ob242_settling_withdraws_an_oversized_draft_while_another_item_is_drafted(store) -> None:
    bid = open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        [product("Tea dust", "kg"), product("Milk", "litre", 0), product("Sugar", "kg", 100)],
        [("Tea dust", 0.3, 32000), ("Milk", 15, 6000)],
    )
    wholesale = [*TEA_DUST, ProductFields(name="Milk", price=5000, unit="litre", stock=5000)]
    neighbour(store, bid, "demo-ob242-tea", "Tea Wholesale (Demo)", "Wholesale", wholesale, True)
    wrong = seed_wrong_draft(store, bid)
    result = draft(store, bid)
    assert result["order"]["lines"][0]["item"] == "Milk", result
    after = supply_chain.get_po(store, "alice", bid, wrong["id"])
    assert after["status"] == "cancelled" and after["reason"]["withdrawn"] == "too_big"


def test_ob242_a_month_of_use_or_the_owners_amount_is_not_oversized(store) -> None:
    bid, wrong = slow_tea_stall(store)
    forecast = current_forecast(store, bid)
    inventory = store.context("alice", bid)["inventory"]
    today = date.today()
    fits = {**wrong, "lines": [{**wrong["lines"][0], "quantity": 9}]}
    assert supply_coming.wrong_size(fits, inventory, forecast, today) == ""
    assert supply_coming.wrong_size(wrong, inventory, forecast, today) == "too_big"
    # The owner's amount on the card, however large, stays the owner's.
    fixed = supply_chain.apply_fix(
        store,
        "alice",
        bid,
        wrong["id"],
        wrong["version"],
        {"kind": "quantity", "line": wrong["lines"][0]["line"], "value": 540},
    )
    assert fixed["reason"]["owner_quantity"]
    assert supply_coming.wrong_size(fixed, inventory, forecast, today) == ""


def current_forecast(store: MerchantStore, bid: str) -> dict:
    context = store.context("alice", bid)
    return asyncio.run(
        ForecastService(offline()).forecast(
            store.sales_history("alice", bid), date.today(), context["inventory"]
        )
    ).model_dump(mode="json")


def approve_tool(store: MerchantStore, bid: str, monkeypatch) -> dict:
    monkeypatch.setattr(coordinator, "forecaster", ForecastService(offline()))
    token = current.set(MerchantContext(store, "alice", bid, []))
    try:
        return asyncio.run(approve_and_send_po())
    finally:
        current.reset(token)


def test_ob242_the_coach_refuses_to_approve_a_wrong_size(store, monkeypatch) -> None:
    bid, wrong = slow_tea_stall(store)
    result = approve_tool(store, bid, monkeypatch)
    assert result["status"] == "too_big" and "card_id" not in result, result
    assert result["message"] == "This order is much bigger than you use. Check the amount first."
    assert result["message_hi"] == "यह ऑर्डर आपके इस्तेमाल से बहुत बड़ा है। पहले मात्रा जाँच लें।"
    assert "bigger than you use" in (supply_reply("approve_and_send_po", result) or "")
    assert not supply_chain.get_po(store, "alice", bid, wrong["id"])["sent"]


def test_ob242_the_coach_refuses_a_draft_with_no_use(store, monkeypatch) -> None:
    bid = tea_stall(store)
    wrong = seed_wrong_draft(store, bid)
    assert approve_tool(store, bid, monkeypatch)["status"] == "too_big"
    assert not supply_chain.get_po(store, "alice", bid, wrong["id"])["sent"]


def test_ob242_the_coach_still_sends_the_owners_own_amount(store, monkeypatch) -> None:
    bid = tea_stall(store)
    named = draft(store, bid, "Tea dust", quantity=10)["order"]
    result = approve_tool(store, bid, monkeypatch)
    assert result["status"] == "sent", result
    assert supply_chain.get_po(store, "alice", bid, named["id"])["sent"]


@pytest.fixture
def client(settings):  # noqa: F811
    with TestClient(create_app(settings, InMemorySessionService())) as test_client:
        join(test_client)
        yield test_client


def http_wrong_draft(client: TestClient) -> tuple[str, MerchantStore, str, dict]:
    """A real shop behind the routes, with a draft far beyond what it sells."""
    bid = http_shop(client)
    base = f"/api/v1/businesses/{bid}/supply"
    response = client.post(f"{base}/reorder", json={"quantity": None})
    assert response.status_code == 200, response.text
    po = response.json()["order"]
    assert not po["reason"]["owner_quantity"]
    po["lines"][0]["quantity"] = 100000
    repo = client.app.state.merchant
    return base, repo, bid, supply_chain._save(repo, bid, po)


def test_ob242_the_supply_overview_withdraws_a_wrong_size_before_showing_it(client) -> None:
    base, repo, bid, wrong = http_wrong_draft(client)
    shown = client.get(base).json()["orders"]
    assert wrong["id"] not in {po["id"] for po in shown}
    after = next(po for po in supply_chain.all_orders(repo, bid) if po["id"] == wrong["id"])
    assert after["status"] == "cancelled" and after["reason"]["withdrawn"] == "too_big"
    assert not after["sent"]


def test_ob242_the_overview_keeps_a_draft_sized_for_real_use(client) -> None:
    bid = http_shop(client)
    base = f"/api/v1/businesses/{bid}/supply"
    po = client.post(f"{base}/reorder", json={"quantity": None}).json()["order"]
    shown = client.get(base).json()["orders"]
    assert [row["status"] for row in shown if row["id"] == po["id"]] == ["draft"]


def test_ob242_the_approve_route_refuses_a_wrong_size_until_the_owner_sets_it(client) -> None:
    base, repo, bid, wrong = http_wrong_draft(client)
    url = f"{base}/orders/{wrong['id']}"
    response = client.post(f"{url}/approve", json={"version": wrong["version"]})
    assert response.status_code == 409 and response.json()["detail"] == "TOO_BIG", response.text
    held = next(po for po in supply_chain.all_orders(repo, bid) if po["id"] == wrong["id"])
    assert held["status"] == "draft" and not held["sent"]
    # Checking the amount on the card clears it: it is the owner's own now.
    fixed = client.post(
        f"{url}/fix",
        json={
            "version": wrong["version"],
            "fix": {"kind": "quantity", "line": wrong["lines"][0]["line"], "value": 50},
        },
    )
    assert fixed.status_code == 200, fixed.text
    sent = client.post(f"{url}/approve", json={"version": fixed.json()["version"]})
    if fixed.json()["blocked"]:
        assert sent.status_code == 409 and sent.json()["detail"] == "RULES_BROKEN"
    else:
        assert sent.status_code == 200 and sent.json()["status"] == "sent", sent.text
