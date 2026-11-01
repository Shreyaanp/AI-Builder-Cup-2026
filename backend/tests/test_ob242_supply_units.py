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


def test_ob242_loose_rows_from_another_unit_or_a_made_item_are_not_its_use() -> None:
    today = date(2026, 11, 1)
    rows = [
        {"date": f"2026-11-0{d}", "item": item, "quantity": q, "unit": unit}
        for d in range(2, 9)
        for item, q, unit in (("Masala chai", 60, "cup"), ("Bread", 30, "kg"))
    ]
    forecast = {"method": "weekday_average", "predictions": rows}
    tea = {"name": "Tea dust", "unit": "kg", "stock": 1}
    assert supply_chain.need_from_forecast(tea, forecast, "Tea dust", today)["daily"] == 0
    flour = {"name": "Bread flour", "unit": "kg", "stock": 1}
    # Bread sold by the kg is in the flour's unit, but the bakery makes it.
    assert supply_chain.need_from_forecast(flour, forecast, "Bread flour", today)["daily"] == 30
    made = supply_chain.made_names([{"name": "Bread", "unit": "kg", "source": "made"}])
    assert (
        supply_chain.need_from_forecast(flour, forecast, "Bread flour", today, made)["daily"] == 0
    )


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


def test_ob243_a_slow_supply_is_not_read_as_no_sales(store) -> None:
    # 0.3 kg of tea dust a day was rounded to 0 and the check said "no sales of Tea dust yet".
    rows = [{"date": f"2026-10-{d:02d}", "item": "Tea dust", "quantity": 0.3} for d in range(1, 29)]
    assert all(p.quantity == 0.3 for p in weekday_average(rows, date(2026, 10, 28)))
    bid = tea_stall(store, tea_dust_sales=0.3)
    result = draft(store, bid, "Tea dust")
    assert result.get("reason") != "no_history", result
