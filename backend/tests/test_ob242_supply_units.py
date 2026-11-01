"""OB-242 / OB-243: a supply's use comes only from its own sales, never from the cups of a dish
made from it, and a slow supply is never read as "no sales yet"."""

from datetime import date
from pathlib import Path

import pytest

from app import supply_chain
from app.coordinator import MerchantContext, current
from app.forecast import weekday_average
from app.merchant import MerchantStore, ProductFields
from app.supply_offline import supply_reply
from tests.test_ob239_made_or_bought import draft, neighbour, open_shop

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


def test_ob242_only_a_bought_menu_item_in_a_unit_that_converts_is_its_use() -> None:
    today = date(2026, 11, 1)
    rows = [
        {"date": f"2026-11-0{d}", "item": item, "quantity": q, "upper": q, "unit": unit}
        for d in range(2, 9)
        for item, q, unit in (("Masala chai", 60, "cup"), ("Bread", 30, "kg"))
    ]
    forecast = {"method": "weekday_average", "predictions": rows}
    need = supply_chain.need_from_forecast
    tea = {"name": "Tea dust", "unit": "kg", "stock": 1}
    assert need(tea, forecast, "Tea dust", today, {"masala chai"})["daily"] == 0
    flour = {"name": "Bread flour", "unit": "kg", "stock": 1}
    # Bread sold by the kg is in the flour's unit, but unanswered or made it is not the flour's use.
    assert need(flour, forecast, "Bread flour", today)["daily"] == 0
    unanswered = supply_chain.bought_names([{"name": "Bread", "unit": "kg"}], "Bakery")
    assert need(flour, forecast, "Bread flour", today, unanswered)["daily"] == 0
    made = supply_chain.bought_names([{"name": "Bread", "unit": "kg", "source": "made"}])
    assert need(flour, forecast, "Bread flour", today, made)["daily"] == 0
    answered = supply_chain.bought_names([{"name": "Bread", "unit": "kg", "source": "bought"}])
    assert need(flour, forecast, "Bread flour", today, answered)["daily"] == 30
    # No product: nothing says the row is on the menu at all.
    assert need(None, forecast, "Bread flour", today, answered)["daily"] == 0


def test_ob242_a_loose_row_in_another_unit_is_converted_never_added_raw() -> None:
    today = date(2026, 11, 1)
    rows = [
        {
            "date": f"2026-11-0{d}",
            "item": "Rose milk",
            "quantity": 300,
            "upper": 400,
            "unit": "ml",
        }
        for d in range(2, 9)
    ]
    forecast = {"method": "weekday_average", "predictions": rows}
    milk = {"name": "Milk", "unit": "litre", "stock": 1}
    found = supply_chain.need_from_forecast(milk, forecast, "Milk", today, {"rose milk"})
    assert found["daily"] == 0.3
    # 1 litre lasts two days at the upper bound of 0.4 l, and runs out on the third.
    assert found["runs_out"] == "2026-11-04"


def product(name: str, unit: str, stock: float = 1) -> ProductFields:
    return ProductFields(name=name, price=10000, unit=unit, stock=stock)


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
        [product(supply, unit), product(dish, dish_unit, 5)],
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
