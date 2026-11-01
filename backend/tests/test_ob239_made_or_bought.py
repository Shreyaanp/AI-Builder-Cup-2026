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
from app.product_source import same_kind, shop_kind, source_of
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
    if rows:
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


def draft(
    store: MerchantStore, bid: str, item: str = "", source: str = "", quantity: float | None = None
) -> dict:
    return asyncio.run(
        supply_chain.draft_reorder(
            store,
            "alice",
            bid,
            item,
            quantity,
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
        ("Haircut", "service", "Salon", "made"),
        ("Blouse stitching", "hour", "Tailor", "made"),
        # Second review of PR #623: a dish whose last word is a raw ingredient was "bought", so
        # Today offered Order and the brief said "order Palak paneer". Only a bare raw name or
        # a known supply phrase is bought; anything else is asked.
        ("Milk", "item", "Café", "bought"),
        ("Tea dust", "item", "Tea stall", "bought"),
        ("Amul milk", "bottle", "Tea stall", "bought"),
        ("Toor dal", "kg", "Restaurant", "bought"),
        ("Palak paneer", "item", "Restaurant", "unknown"),
        ("Chicken rice", "item", "Hawker stall", "unknown"),
        ("Tadka dal", "item", "Dhaba", "unknown"),
        ("Mix vegetables", "item", "Restaurant", "unknown"),
        ("Rose milk", "item", "Café", "unknown"),
        ("Bread butter", "item", "Café", "unknown"),
        ("Chilli paneer", "piece", "Restaurant", "unknown"),
        ("Hainanese chicken rice", "piece", "Hawker stall", "unknown"),
        ("Coconut rice", "pack", "Home kitchen", "unknown"),
        ("Mustard rice", "item", "Restaurant", "unknown"),
        ("Dry paneer", "item", "Restaurant", "unknown"),
        ("Double egg", "item", "Café", "unknown"),
        ("Cream cheese", "item", "Café", "unknown"),
        ("Fortune sunflower oil", "item", "Restaurant", "bought"),
        ("Amul full cream milk", "item", "Café", "bought"),
        # Resale is checked before served units: a kirana's set or glass is stock it resells.
        ("Soap gift set", "set", "Grocery / Kirana", "bought"),
        ("Steel glass", "glass", "Grocery / Kirana", "bought"),
        ("Pen set", "set", "Stationery shop", "bought"),
        # A service shop makes only its services: physical stock is asked, never "Make more".
        ("Shampoo", "bottle", "Salon", "unknown"),
        ("Red roses", "bunch", "Florist", "unknown"),
        ("Sunflower stems", "stem", "Florist", "unknown"),
        ("Thread", "item", "Tailor", "unknown"),
        ("Curtain shortening", "piece", "Tailor", "unknown"),
        ("Small bouquet", "bunch", "Florist", "unknown"),
        # OB-244: dal, rice or paneer a food shop sells by the item, plate or bowl may be the
        # dish, so it is asked. By the kg or pack, branded, or at a kirana, it is still bought.
        ("Moong dal", "item", "Restaurant", "unknown"),
        ("Toor dal", "plate", "Restaurant", "unknown"),
        ("Dal", "bowl", "Home kitchen", "unknown"),
        ("Basmati rice", "plate", "Restaurant", "unknown"),
        ("Paneer", "item", "Restaurant", "unknown"),
        ("Paneer", "kg", "Restaurant", "bought"),
        ("Fortune basmati rice", "item", "Restaurant", "bought"),
        ("Sugar", "item", "Bakery", "bought"),
        ("Basmati rice", "kg", "Dhaba", "bought"),
        ("Moong dal", "item", "Kirana store", "bought"),
        ("Toor dal", "pack", "Kirana store", "bought"),
        ("Dal", "item", "किराना", "bought"),
        # Whole words: a Mandir prasad shop is no mandi and asks; a medical store resells.
        ("Laddoo", "piece", "Mandir prasad", "unknown"),
        ("Crocin", "strip", "Medical store", "bought"),
        ("Dolo 650", "strip", "दवा की दुकान", "bought"),
        ("Haircut", "service", "सैलून", "made"),
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


@pytest.mark.parametrize(
    ("category", "kind"),
    [
        # Real Indian shop categories, and the words that only look like one (OB-244).
        ("Kirana store", "resale"),
        ("Kiryana shop", "resale"),
        ("Grocery / Kirana", "resale"),
        ("Medical store", "resale"),
        ("Apollo Pharmacy", "resale"),
        ("Chemist & druggist", "resale"),
        ("Stationery shop", "resale"),
        ("Tea stall", "tea"),
        ("Chai tapri", "tea"),
        ("Chaiwala", "tea"),
        ("Kopitiam", "tea"),
        ("Iyengar Bakery", "bakery"),
        ("Cake shop", "bakery"),
        ("Café", "cafe"),
        ("Coffee house", "cafe"),
        ("Agarwal Sweets", "sweets"),
        ("Mithai shop", "sweets"),
        ("Halwai", "sweets"),
        ("Punjabi Dhaba", "kitchen"),
        ("Home kitchen", "kitchen"),
        ("Udupi restaurant", "kitchen"),
        ("Hawker stall", "kitchen"),
        ("Sabzi mandi wholesaler", "wholesale"),
        ("Azadpur Mandi", "wholesale"),
        ("Cash & carry", "wholesale"),
        ("Ladies tailor", "tailor"),
        ("Flower shop", "florist"),
        ("Unisex salon", "salon"),
        ("Beauty parlour", "salon"),
        ("Barber shop", "salon"),
        # Hindi, Bengali, Tamil and Hinglish categories have a kind too.
        ("बेकरी", "bakery"),
        ("किराना स्टोर", "resale"),
        ("किराने की दुकान", "resale"),
        ("चाय की दुकान", "tea"),
        ("मिठाई की दुकान", "sweets"),
        ("दवा की दुकान", "resale"),
        ("मेडिकल स्टोर", "resale"),
        ("सैलून", "salon"),
        ("ढाबा", "kitchen"),
        ("थोक विक्रेता", "wholesale"),
        ("দর্জি", "tailor"),
        ("বেকারি", "bakery"),
        ("মিষ্টির দোকান", "sweets"),
        ("டீக்கடை", "tea"),
        ("Dawai ki dukan", "resale"),
        ("टी स्टॉल", "tea"),
        ("कैफ़े", "cafe"),
        ("टी-शर्ट की दुकान", ""),
        ("Mithaiwala", "sweets"),
        # A word inside another word is not that kind.
        ("Mandir prasad", ""),
        ("Kitchenware store", ""),
        ("Chair store", ""),
        ("Steakhouse", ""),
        ("Hardware & sanitary", ""),
        ("Ice cream parlour", ""),
        ("Hair oil and accessories", ""),
        ("Flour mill", ""),
        ("Sweetcorn cart", ""),
        ("Mobile repair", ""),
        ("", ""),
    ],
)
def test_shop_kind_matches_whole_words_in_every_script(category, kind) -> None:
    assert shop_kind(category) == kind


def test_rivals_are_never_suppliers_but_wholesalers_are() -> None:
    assert same_kind("Tea stall", "Café") and same_kind("Coffee house", "चाय की दुकान")
    assert same_kind("बेकरी", "Iyengar Bakery") and same_kind("किराना", "Kirana store")
    assert not same_kind("Restaurant", "Kitchenware store")
    assert not same_kind("Tea stall", "Chair store")
    assert not same_kind("Kirana store", "Mandir prasad")
    assert not same_kind("Tea stall", "Sabzi mandi wholesaler")
    assert not same_kind("Café", "Bakery")


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
    maggi = draft(store, bid, "Maggi noodles")
    assert maggi["status"] == "drafted", maggi
    assert maggi["order"]["reason"]["item"] == "Maggi noodles"
    result = draft(store, bid, "Amul milk")
    assert result["status"] in {"drafted", "check"}, result


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


# Second review of PR #623, point 3: the owner's chat answer is saved only on the item it names.


def chai_stall(store: MerchantStore, chai_first: bool = False) -> str:
    """Tea dust and Masala chai; the review's repros differ only in which the menu lists first."""
    menu = [
        ProductFields(name="Tea dust", price=30000, unit="kg", stock=1),
        ProductFields(name="Masala chai", price=2000, unit="cup", stock=10),
    ]
    return open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        menu[::-1] if chai_first else menu,
        [("Tea dust", 0.5, 30000), ("Masala chai", 60, 2000)],
    )


def saved_source(store: MerchantStore, bid: str, name: str) -> str | None:
    return next(p for p in store.inventory("alice", bid) if p["name"] == name).get("source")


def test_i_make_chai_marks_the_chai_and_tea_dust_still_reorders(store) -> None:
    # "I make chai" saved Tea dust as made: the stall's main supply silently stopped reordering.
    bid = chai_stall(store)
    assert draft(store, bid, "chai", source="made") == {"status": "made", "item": "Masala chai"}
    assert saved_source(store, bid, "Masala chai") == "made"
    assert saved_source(store, bid, "Tea dust") is None
    assert low_rows(store, bid)["Tea dust"] == "bought"
    order = draft(store, bid)
    assert order["status"] == "drafted", order
    assert order["order"]["reason"]["item"] == "Tea dust"


def test_reorder_tea_means_the_tea_dust_the_stall_buys(store) -> None:
    # "Reorder tea" answered "made" for Masala chai although the stall buys tea dust.
    bid = chai_stall(store, chai_first=True)
    order = draft(store, bid, "tea")
    assert order["status"] == "drafted", order
    assert order["order"]["reason"]["item"] == "Tea dust"


def test_i_buy_milk_never_changes_milk_bread(store) -> None:
    bid = open_shop(
        store,
        "Butter Window Bakery",
        "Bakery",
        [ProductFields(name="Milk bread", price=5500, unit="piece", stock=5)],
        [("Milk bread", 30, 5500)],
    )
    result = draft(store, bid, "milk", source="bought")
    assert result["status"] == "which_item", result
    assert saved_source(store, bid, "Milk bread") is None
    assert supply_chain.orders(store, "alice", bid) == []


def test_a_partial_name_is_saved_only_when_it_fits_the_answer(store) -> None:
    # "I buy rice" must not make the dish a reorder; "I make milk" must not stop the milk's.
    bid = open_shop(
        store,
        "Annapoorna Kitchen",
        "Restaurant",
        [
            ProductFields(name="Coconut rice", price=9000, unit="item", stock=5),
            ProductFields(name="Amul milk", price=3000, unit="bottle", stock=9),
        ],
        [("Coconut rice", 20, 9000), ("Amul milk", 2, 3000)],
    )
    result = draft(store, bid, "rice", source="bought")
    assert result["status"] == "which_item" and result["choices"] == ["Coconut rice"], result
    assert saved_source(store, bid, "Coconut rice") is None
    reply = supply_reply("draft_reorder", result)
    assert reply and 'Say "I buy Coconut rice"' in reply
    assert draft(store, bid, "milk", source="made")["status"] == "which_item"
    assert saved_source(store, bid, "Amul milk") is None
    assert draft(store, bid, "rice", source="made") == {"status": "made", "item": "Coconut rice"}
    assert saved_source(store, bid, "Coconut rice") == "made"


def test_i_make_biryani_off_the_menu_saves_and_drafts_nothing(store) -> None:
    # The answer was dropped and 10 kg of Biryani was drafted from a cash and carry.
    bid = chai_stall(store)
    result = draft(store, bid, "biryani", source="made")
    assert result == {"status": "which_item", "item": "biryani", "source": "made", "choices": []}
    assert supply_chain.orders(store, "alice", bid) == []
    reply = supply_reply("draft_reorder", result)
    assert reply and "not on your menu" in reply and "drafted nothing" in reply


def test_the_offline_coach_takes_it_buy_make_and_hindi() -> None:
    from google.genai import types

    asked = [
        types.Content(
            role="user",
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(
                        name="draft_reorder",
                        response={"status": "ask_make_or_buy", "item": "Samosa"},
                    )
                )
            ],
        )
    ]
    for text, source in [
        ("I buy it", "bought"),
        ("buy", "bought"),
        ("make", "made"),
        ("I buy it ready-made", "bought"),
        ("हम बनाते हैं", "made"),
        ("हम खरीदते हैं", "bought"),
    ]:
        found = supply_call(text, None, asked)
        assert found is not None and found.function_call is not None, text
        assert found.function_call.args == {"item": "Samosa", "source": source}, text
    # The full name of a longer item, as the "which item" question asks for it.
    named = supply_call("I make Hainanese chicken rice", None, [])
    assert named is not None and named.function_call is not None
    assert named.function_call.args == {"item": "Hainanese chicken rice", "source": "made"}
    # With no question asked, "buy" is not an answer, and "make a list" never is.
    assert supply_call("buy", None, []) is None
    assert supply_call("make a list", None, asked) is None


def test_the_offline_model_routes_each_answer_to_the_item_it_asked_about(store) -> None:
    # Through the coach itself, not only the parser: the answer reaches draft_reorder.
    from google.genai import types

    from app.agent import OfflineCoachModel

    bid = chai_stall(store)
    asked = types.Content(
        role="user",
        parts=[
            types.Part(
                function_response=types.FunctionResponse(
                    name="draft_reorder",
                    response={"status": "ask_make_or_buy", "item": "Masala chai"},
                )
            )
        ],
    )
    said = types.Content(role="model", parts=[types.Part(text="Do you make it or buy it?")])

    async def first_part(text: str) -> types.Part:
        request = types.Content(role="user", parts=[types.Part(text=text)])
        token = current.set(MerchantContext(store, "alice", bid, [], message=text))
        try:
            replies = [
                reply
                async for reply in OfflineCoachModel().generate_content_async(
                    type("R", (), {"contents": [asked, said, request]})()  # type: ignore[arg-type]
                )
            ]
        finally:
            current.reset(token)
        return replies[0].content.parts[0]

    for text, source in [
        ("I buy it", "bought"),
        ("buy", "bought"),
        ("make", "made"),
        ("हम बनाते हैं", "made"),
        ("हम खरीदते हैं", "bought"),
    ]:
        part = asyncio.run(first_part(text))
        assert part.function_call is not None, text
        assert part.function_call.name == "draft_reorder", text
        assert part.function_call.args == {"item": "Masala chai", "source": source}, text


# Second review of PR #623, point 5: the quantity cap has no holes.


def minimum(store: MerchantStore, bid: str, moq: float) -> None:
    for row in supply_chain.relationships(store, "alice", bid):
        rules = supply_chain.rules_of(row)
        items = [rule.model_copy(update={"moq": moq}) for rule in rules.items]
        supply_chain.save_rules(
            store,
            "alice",
            bid,
            row["supplier"]["id"],
            rules.model_copy(update={"items": items}),
            row["version"],
        )


def test_a_new_shop_with_no_sales_is_checked_not_drafted_at_the_minimum(store) -> None:
    # A new kirana with no Atta sales drafted 1000 kg of Atta with no check.
    bid = open_shop(
        store,
        "Lakshmi Kirana",
        "Grocery / Kirana",
        [ProductFields(name="Atta", price=5500, unit="kg", stock=6)],
        [],
    )
    kilos = [ProductFields(name="Atta", price=4000, unit="kg", stock=5000)]
    neighbour(store, bid, "demo-ob239-kilos", "Kilo Wholesale (Demo)", "Wholesale", kilos, True)
    minimum(store, bid, 1000.0)
    result = draft(store, bid, "Atta")
    assert result["status"] == "check" and result["reason"] == "no_history", result
    assert supply_chain.orders(store, "alice", bid) == []
    reply = supply_reply("draft_reorder", {**result, "status": "check_quantity"})
    assert reply and "can't tell how much Atta you use" in reply and "drafted nothing" in reply
    # Naming an amount the supplier sells drafts exactly that.
    minimum(store, bid, 0.0)
    named = draft(store, bid, "Atta", quantity=20)
    assert named["status"] == "drafted", named
    assert named["order"]["lines"][0]["quantity"] == 20


def test_a_named_amount_the_supplier_cannot_sell_is_said_not_swapped(store) -> None:
    # The check said "name the amount"; naming 5 then drafted 1000 packs.
    bid = open_shop(
        store,
        "Lakshmi Kirana",
        "Grocery / Kirana",
        [ProductFields(name="Atta", price=5500, unit="kg", stock=6)],
        [("Atta", 3, 5500)],
    )
    packs = [ProductFields(name="Atta", price=4000, unit="pack", stock=5000)]
    neighbour(store, bid, "demo-ob239-packs", "Pack Wholesale (Demo)", "Wholesale", packs, True)
    minimum(store, bid, 1000.0)
    result = draft(store, bid, "Atta", quantity=5)
    assert result["status"] == "check" and result["reason"] == "named", result
    assert result["asked"] == 5 and result["supplier_quantity"] >= 1000
    assert supply_chain.orders(store, "alice", bid) == []
    reply = supply_reply("draft_reorder", {**result, "status": "check_quantity"})
    assert reply and "can't sell 5 kg Atta" in reply and "drafted nothing" in reply


def test_a_named_amount_on_an_open_draft_is_said_and_the_draft_keeps_its_amount(store) -> None:
    # The open draft took any named amount and silently rounded it up to the minimum.
    bid = open_shop(
        store,
        "Lakshmi Kirana",
        "Grocery / Kirana",
        [ProductFields(name="Atta", price=5500, unit="kg", stock=6)],
        [("Atta", 3, 5500)],
    )
    kilos = [ProductFields(name="Atta", price=4000, unit="kg", stock=5000)]
    neighbour(store, bid, "demo-ob239-kilos", "Kilo Wholesale (Demo)", "Wholesale", kilos, True)
    minimum(store, bid, 0.0)
    assert draft(store, bid, "Atta", quantity=20)["order"]["lines"][0]["quantity"] == 20
    minimum(store, bid, 1000.0)
    result = draft(store, bid, "Atta", quantity=5)
    assert result["status"] == "check" and result["reason"] == "named", result
    assert result["asked"] == 5 and result["supplier_quantity"] == 1000
    open_orders = supply_chain.orders(store, "alice", bid)
    assert [order["lines"][0]["quantity"] for order in open_orders] == [20]


def test_a_named_amount_in_the_ingredient_path_is_respected_or_checked(store) -> None:
    # Amul milk by the bottle, named 20: it drafted 10 litres of Milk, ignoring the 20.
    bid = open_shop(
        store,
        "Lakshmi Kirana",
        "Grocery / Kirana",
        [ProductFields(name="Amul milk", price=3000, unit="bottle", stock=3)],
        [("Amul milk", 10, 3000)],
    )
    milk = [ProductFields(name="Milk", price=6000, unit="litre", stock=500)]
    neighbour(store, bid, "demo-ob239-dairy", "Dairy Wholesale (Demo)", "Wholesale", milk, True)
    result = draft(store, bid, "Amul milk", quantity=20)
    assert result["status"] == "check" and result["reason"] == "named", result
    assert supply_chain.orders(store, "alice", bid) == []
