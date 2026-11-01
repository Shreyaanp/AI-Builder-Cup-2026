"""OB-239: only stock a shop buys is reordered. Made items are made again; an item the app
cannot tell about asks the owner once ("Do you make it or buy it?"), and a shop of the same kind
is never a supplier."""

import asyncio
from datetime import timedelta
from pathlib import Path

import pytest

from app import brief, shop_today, sourcing, supply_chain
from app.coordinator import DEMO_OWNER_UID, MerchantContext, SupplierGenerator, current
from app.demand import Radar
from app.forecast import ForecastService
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.product_source import same_kind, source_of
from app.sales import today_for
from app.supply_offline import supply_call, supply_reply
from tests.test_supply_chain import BENGALURU, offline

Row = tuple[str, float, int]


def open_shop(
    store: MerchantStore,
    name: str,
    category: str,
    products: list[ProductFields],
    sales: list[Row],
) -> str:
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name=name,
                category=category,
                location="Indiranagar, Bengaluru",
                lat=BENGALURU[0],
                lng=BENGALURU[1],
                currency="INR",
                timezone="Asia/Kolkata",
                phone="+91 98450 00000",
            ),
            products=products,
        ),
    )
    bid = store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    today = today_for(store.context("alice", bid)["business"]["fields"])
    rows = [
        {
            "date": (today - timedelta(days=i)).isoformat(),
            "item": item,
            "quantity": quantity,
            "revenue": round(quantity * price),
        }
        for i in range(1, 36)
        for item, quantity, price in sales
    ]
    prepared = store.prepare_sales("alice", bid, rows)
    store.save_sales("alice", bid, prepared["id"], prepared["digest"])
    return bid


def neighbour(
    store: MerchantStore,
    bid: str,
    sid: str,
    name: str,
    category: str,
    products: list[ProductFields],
    supplier: bool = False,
) -> None:
    """A nearby demo shop, linked to the shop as if sourcing had found it."""
    fields = BusinessFields(
        name=name,
        category=category,
        location="Indiranagar, Bengaluru",
        lat=BENGALURU[0] + 0.002,
        lng=BENGALURU[1],
        currency="INR",
        timezone="Asia/Kolkata",
        demo=True,
        supplier=supplier,
    )
    store.seed_demo_shop(DEMO_OWNER_UID, sid, fields, products)
    shared = store.public_shop(sid)
    assert shared is not None
    supply_chain.ensure_relationship(store, bid, shared, "INR", 0)


def draft(store: MerchantStore, bid: str, item: str = "", source: str = "") -> dict:
    return asyncio.run(
        supply_chain.draft_reorder(
            store,
            "alice",
            bid,
            item,
            None,
            ForecastService(offline()),
            SupplierGenerator(offline()),
            DEMO_OWNER_UID,
            source=source,
        )
    )


def low_rows(store: MerchantStore, bid: str) -> dict[str, str]:
    context = store.context("alice", bid)
    today = today_for(context["business"]["fields"])
    forecast = asyncio.run(
        ForecastService(offline()).forecast(
            store.sales_history("alice", bid), today, context["inventory"]
        )
    )
    category = context["business"]["fields"]["category"]
    rows = shop_today.low_stock(context["inventory"], forecast, today, category)
    return {row.name: row.source for row in rows}


@pytest.fixture
def store(tmp_path: Path):
    repo = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    token = current.set(MerchantContext(repo, "alice", "", []))
    try:
        yield repo
    finally:
        current.reset(token)


@pytest.mark.parametrize(
    ("name", "unit", "category", "expected"),
    [
        ("Masala chai", "cup", "Tea stall", "made"),
        ("Milk", "litre", "Tea stall", "bought"),
        ("Tea dust", "kg", "Tea stall", "bought"),
        ("Wheat flour (atta)", "kg", "Bakery", "bought"),
        ("Bread", "piece", "Bakery", "unknown"),
        ("Milk bread", "piece", "Bakery", "unknown"),
        ("Samosa", "piece", "Café", "unknown"),
        ("Soft-boiled eggs", "piece", "Kopitiam", "unknown"),
        ("Lemon rice", "pack", "Home kitchen", "unknown"),
        ("Maggi noodles", "pack", "Grocery / Kirana", "bought"),
        ("Crocin", "strip", "Pharmacy", "bought"),
        ("Curtain shortening", "piece", "Tailor", "made"),
        ("Small bouquet", "bunch", "Florist", "made"),
        ("Haircut", "service", "Salon", "made"),
    ],
)
def test_made_or_bought_is_inferred_on_the_safe_side(name, unit, category, expected) -> None:
    assert source_of({"name": name, "unit": unit}, category) == expected


def test_the_owners_answer_wins_and_same_kind_shops_are_never_suppliers() -> None:
    assert source_of({"name": "Samosa", "unit": "piece", "source": "bought"}, "Café") == "bought"
    assert source_of({"name": "Milk", "unit": "litre", "source": "made"}, "Tea stall") == "made"
    assert same_kind("Bakery", "Bakery") and same_kind("Tea stall", "Kopitiam")
    assert same_kind("Grocery / Kirana", "Kirana store")
    assert not same_kind("Bakery", "Wholesale supplier")
    assert not same_kind("Bakery", "Bakery", other_is_supplier=True)
    assert not same_kind("Tea stall", "Bakery") and not same_kind("", "")


def test_tea_stall_makes_chai_and_buys_milk(store) -> None:
    bid = open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        [
            ProductFields(name="Masala chai", price=2000, unit="cup", stock=10),
            ProductFields(name="Milk", price=6000, unit="litre", stock=3),
        ],
        [("Masala chai", 60, 2000), ("Milk", 8, 6000)],
    )
    assert draft(store, bid, "Masala chai") == {"status": "made", "item": "Masala chai"}
    milk = draft(store, bid)
    assert milk["status"] == "drafted", milk
    assert milk["order"]["reason"]["item"] == "Milk"
    assert milk["order"]["lines"][0]["unit"] == "litre"
    assert low_rows(store, bid) == {"Masala chai": "made", "Milk": "bought"}


def test_bakery_never_orders_its_bread_and_never_from_a_rival_bakery(store) -> None:
    # The habit review drafted 257 pieces of Bread from "Bread House (Demo)", a rival bakery.
    bid = open_shop(
        store,
        "Butter Window Bakery",
        "Bakery",
        [
            ProductFields(name="Bread", price=5500, unit="piece", stock=5),
            ProductFields(name="Flour", price=5000, unit="kg", stock=2),
        ],
        [("Bread", 30, 5500), ("Flour", 4, 5000)],
    )
    rival = [
        ProductFields(name="Bread", price=5000, unit="piece", stock=500),
        ProductFields(name="Flour", price=4000, unit="kg", stock=500),
    ]
    neighbour(store, bid, "demo-ob239-bread-house", "Bread House (Demo)", "Bakery", rival)
    assert supply_chain.supplier_candidates(store, bid, "Flour", "INR", "Bakery") == []
    # Bread is not picked, nor drafted when named: the owner is asked once.
    flour = draft(store, bid)
    assert flour["status"] == "drafted", flour
    assert flour["order"]["reason"]["item"] == "Flour"
    assert flour["order"]["supplier"]["id"] != "demo-ob239-bread-house"
    bread = draft(store, bid, "Bread")
    assert bread["status"] == "ask_source" and bread["item"] == "Bread"
    assert low_rows(store, bid)["Bread"] == "unknown"
    # "I make it": saved on the item, and from then on it is made, never ordered.
    assert draft(store, bid, "Bread", source="made") == {"status": "made", "item": "Bread"}
    assert draft(store, bid, "Bread") == {"status": "made", "item": "Bread"}
    assert low_rows(store, bid)["Bread"] == "made"
    for order in supply_chain.orders(store, "alice", bid):
        assert all(line["item"] != "Bread" for line in order["lines"])


def test_kirana_still_reorders_everything_it_resells(store) -> None:
    bid = open_shop(
        store,
        "Lakshmi Kirana",
        "Grocery / Kirana",
        [
            ProductFields(name="Maggi noodles", price=1400, unit="pack", stock=4),
            ProductFields(name="Amul milk", price=3000, unit="bottle", stock=3),
        ],
        [("Maggi noodles", 6, 1400), ("Amul milk", 10, 3000)],
    )
    assert low_rows(store, bid) == {"Maggi noodles": "bought", "Amul milk": "bought"}
    for item in ("Maggi noodles", "Amul milk"):
        result = draft(store, bid, item)
        assert result["status"] in {"drafted", "check"}, result
        assert result["status"] != "ask_source"


def cafe(store: MerchantStore) -> str:
    bid = open_shop(
        store,
        "Corner Café",
        "Café",
        [
            ProductFields(name="Filter coffee", price=3000, unit="cup", stock=40),
            ProductFields(name="Samosa", price=2000, unit="piece", stock=4),
        ],
        [("Filter coffee", 50, 3000), ("Samosa", 12, 2000)],
    )
    snacks = [ProductFields(name="Samosa", price=1200, unit="piece", stock=900)]
    neighbour(store, bid, "demo-ob239-snacks", "Snack Wholesale (Demo)", "Wholesale", snacks, True)
    return bid


def test_cafe_samosa_asks_once_and_buy_reorders(store) -> None:
    bid = cafe(store)
    assert low_rows(store, bid)["Samosa"] == "unknown"
    # Nothing picks an item the shop has not said it buys.
    assert draft(store, bid)["status"] == "needs_item"
    assert draft(store, bid, "Samosa")["status"] == "ask_source"
    # The owner's tap on Today, the same as the route does.
    samosa = next(p for p in store.inventory("alice", bid) if p["name"] == "Samosa")
    assert store.set_source("alice", bid, samosa["id"], "bought")["source"] == "bought"
    assert low_rows(store, bid)["Samosa"] == "bought"
    order = draft(store, bid)
    assert order["status"] == "drafted", order
    assert order["order"]["reason"]["item"] == "Samosa"
    assert order["order"]["supplier"]["id"] == "demo-ob239-snacks"


def test_cafe_samosa_make_shows_make_more_and_never_orders(store) -> None:
    bid = cafe(store)
    assert draft(store, bid, "Samosa", source="made") == {"status": "made", "item": "Samosa"}
    assert low_rows(store, bid)["Samosa"] == "made"
    assert draft(store, bid)["status"] == "needs_item"
    assert supply_chain.orders(store, "alice", bid) == []


def test_a_menu_edit_keeps_the_owners_answer(store) -> None:
    bid = cafe(store)
    samosa = next(p for p in store.inventory("alice", bid) if p["name"] == "Samosa")
    store.set_source("alice", bid, samosa["id"], "made")
    revision = store.context("alice", bid)["business"]["revision"]
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="inventory",
            business_id=bid,
            revision=revision,
            products=[ProductFields(name="Samosa", price=2500, unit="piece", stock=4)],
        ),
    )
    store.commit("alice", proposal["id"], proposal["digest"])
    saved = next(p for p in store.inventory("alice", bid) if p["name"] == "Samosa")
    assert saved["price"] == 2500 and saved["source"] == "made"


def test_brief_never_says_order_for_an_item_the_owner_has_not_said_they_buy(store) -> None:
    # The habit walk's brief said "Best thing to do today: Order Samosa now".
    bid = cafe(store)
    context = store.context("alice", bid)
    today = brief.local_now(context["business"]["fields"]).date()
    forecast = asyncio.run(
        ForecastService(offline()).forecast(
            store.sales_history("alice", bid), today - timedelta(days=1), context["inventory"]
        )
    )
    radar = Radar(area_label="x", approximate=True, demo=False, opportunities=[])
    facts = brief.facts(store, "alice", bid, context, forecast, radar)
    assert {row.name: row.source for row in facts.low_stock}["Samosa"] == "unknown"
    assert facts.best_action.kind != "order"
    samosa = next(p for p in context["inventory"] if p["name"] == "Samosa")
    store.set_source("alice", bid, samosa["id"], "bought")
    facts = brief.facts(store, "alice", bid, store.context("alice", bid), forecast, radar)
    assert facts.best_action.kind == "order" and facts.best_action.item == "Samosa"


def test_sourcing_never_finds_a_rival_of_the_same_kind() -> None:
    pin = sourcing.ShopPin(
        lat=BENGALURU[0],
        lng=BENGALURU[1],
        approximate=False,
        currency="INR",
        timezone="Asia/Kolkata",
        location="",
        category="Tea stall",
        name="Sharma Chai Corner",
        phone="",
    )
    shop = {
        "lat": BENGALURU[0] + 0.002,
        "lng": BENGALURU[1],
        "currency": "INR",
        "products": [{"name": "Tea dust", "unit": "kg", "price": 30000}],
    }
    rival = {**shop, "id": "rival", "category": "Tea stall"}
    wholesaler = {**shop, "id": "wholesale", "category": "Wholesale supplier", "supplier": True}
    found = sourcing.candidates([rival, wholesaler], "mine", pin, "Tea dust")
    assert [entry["shop"]["id"] for entry in found] == ["wholesale"]


def test_a_unit_that_does_not_convert_is_checked_not_drafted(store) -> None:
    # Review of PR #623: Atta counted in kg, sold by the pack with a minimum of 1000, drafted
    # 1000 packs with no check because the units did not convert.
    bid = open_shop(
        store,
        "Lakshmi Kirana",
        "Grocery / Kirana",
        [ProductFields(name="Atta", price=5500, unit="kg", stock=6)],
        [("Atta", 3, 5500)],
    )
    packs = [ProductFields(name="Atta", price=4000, unit="pack", stock=5000)]
    neighbour(store, bid, "demo-ob239-packs", "Pack Wholesale (Demo)", "Wholesale", packs, True)
    for row in supply_chain.relationships(store, "alice", bid):
        rules = supply_chain.rules_of(row)
        items = [rule.model_copy(update={"moq": 1000.0}) for rule in rules.items]
        supply_chain.save_rules(
            store,
            "alice",
            bid,
            row["supplier"]["id"],
            rules.model_copy(update={"items": items}),
            row["version"],
        )
    result = draft(store, bid, "Atta")
    assert result["status"] == "check", result
    assert result["days"] is None and result["unit"] == "kg"
    assert result["supplier_unit"] == "pack" and result["supplier_quantity"] >= 1000
    assert supply_chain.orders(store, "alice", bid) == []
    reply = supply_reply("draft_reorder", {**result, "status": "check_quantity"})
    assert reply and "by the pack" in reply and "drafted nothing" in reply


def test_the_offline_coach_takes_the_owners_answer() -> None:
    bought = supply_call("I buy Samosa ready-made", None)
    assert bought is not None and bought.function_call is not None
    assert bought.function_call.args == {"item": "Samosa", "source": "bought"}
    made = supply_call("we make samosa", None)
    assert made is not None and made.function_call is not None
    assert made.function_call.args == {"item": "samosa", "source": "made"}
    ask = supply_reply("draft_reorder", {"status": "ask_make_or_buy", "item": "Samosa"})
    assert ask and "make Samosa or buy it" in ask


def test_the_offline_coach_reads_the_item_without_the_day() -> None:
    # The habit walk's "Reorder milk for tomorrow" looked for an item called "milk for".
    found = supply_call("Reorder milk for tomorrow", None)
    assert found is not None and found.function_call is not None
    assert found.function_call.args == {"item": "milk"}
