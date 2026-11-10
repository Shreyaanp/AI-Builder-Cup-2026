"""OB-339: ordering stock works the way a shopkeeper expects (persona runs, 8 Nov).

Sold out or low means "how much?", never "nothing to reorder" (Ahmed B2); "butter, 2 kg" drafts
an order in any language (Priya 2); a changed or replaced draft replaces the old one (Ramesh 5).
"""

import asyncio
import json
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app import sourcing, supply_chain, supply_coming
from app.coordinator import (
    DEMO_OWNER_UID,
    MerchantContext,
    SupplierGenerator,
    current,
    prepare_order,
)
from app.forecast import ForecastService
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.order_words import read_order, resolve_item
from app.sourcing import OrderItem
from app.supply_offline import order_call
from tests.test_merchant_routes import settings  # noqa: F401 - shared fixture
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo_no_paid_ai import live_parent_demo, no_paid_calls  # noqa: F401
from tests.test_supply_chain import BENGALURU, offline


def lines(text: str) -> list[tuple[str, float | None, str]]:
    return [(line.item, line.quantity, line.unit) for line in read_order(text).lines]


@pytest.mark.parametrize(
    ("text", "item", "quantity", "unit"),
    [
        ("butter, 2 kg", "butter", 2, "kg"),
        ("2 kg butter", "butter", 2, "kg"),
        ("butter 2kg", "butter", 2, "kg"),
        ("मक्खन 2 किलो", "मक्खन", 2, "kg"),
        ("2 किलो मक्खन चाहिए", "मक्खन", 2, "kg"),
        ("makhan 2 kilo mangao", "makhan", 2, "kg"),
        ("5 litre doodh chahiye", "doodh", 5, "litre"),
        ("do kilo cheeni chahiye", "cheeni", 2, "kg"),
        ("दो किलो चीनी चाहिए", "चीनी", 2, "kg"),
        ("५ लीटर दूध", "दूध", 5, "litre"),
        ("नहीं, सिर्फ़ 5 लीटर दूध चाहिए", "दूध", 5, "litre"),
        ("no, only 5 litres milk", "milk", 5, "litre"),
        ("butter nahi, ghee 2 kg", "ghee", 2, "kg"),
        ("atta 1,000 kg", "atta", 1000, "kg"),
        ("atta 1,00,000 kg", "atta", 100000, "kg"),
        ("atta 1000.50 kg", "atta", 1000.5, "kg"),
        ("atta 1,5 kg", "atta", 1.5, "kg"),
    ],
)
def test_OB_339_reads_an_order_in_any_language(text, item, quantity, unit) -> None:
    said = read_order(text)
    assert said.asked and not said.refused
    assert lines(text) == [(item, quantity, unit)]


@pytest.mark.parametrize(
    "text",
    [
        "don't order butter",
        "do not order 2 kg butter",
        "butter mat mangao",
        "2 kilo makhan mat mangana",
        "butter nahi chahiye",
        "दूध नहीं चाहिए",
        "2 किलो मक्खन मत मँगाओ",
        "दूध की ज़रूरत नहीं",
        "rehne do",
    ],
)
def test_OB_339_a_dont_never_orders(text) -> None:
    said = read_order(text)
    assert said.refused and said.lines == []


@pytest.mark.parametrize(
    "text",
    ["sold 2 kg butter", "2 kg butter left", "चाय 20 बिकी", "कल सुबह दूध मँगाना याद दिलाना"],
)
def test_OB_339_a_remark_with_an_amount_is_not_an_order(text) -> None:
    assert not read_order(text).asked


def test_OB_339_two_items_in_one_sentence_and_a_pack_size() -> None:
    assert lines("2 kg चीनी और 5 लीटर दूध") == [("चीनी", 2, "kg"), ("दूध", 5, "litre")]
    assert lines("butter 2 kg, milk 5 L") == [("butter", 2, "kg"), ("milk", 5, "litre")]
    # The Find a supplier line: the bracket says more about the amount; 500ml stays in the name.
    assert lines("2 crates (24 packets) heritage milk 500ml") == [
        ("heritage milk 500ml", 2, "crate")
    ]


def test_OB_339_names_the_shops_own_item() -> None:
    shelf = [{"name": "Milk"}, {"name": "Tea dust"}]
    assert resolve_item("दूध", shelf) == "Milk"
    assert resolve_item("doodh", shelf) == "Milk"
    assert resolve_item("makhan", shelf) == "Butter"
    assert resolve_item("Amul butter", shelf) == "Amul butter"


def open_shop(store: MerchantStore, products: list[ProductFields]) -> str:
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
            products=products,
        ),
    )
    return store.commit("alice", proposal["id"], proposal["digest"])["business_id"]


@pytest.fixture
def shop(tmp_path: Path) -> Iterator[tuple[MerchantStore, str]]:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = open_shop(
        store,
        [
            ProductFields(name="Milk", price=6000, unit="litre", stock=12, available=False),
            ProductFields(name="Sugar", price=4800, unit="kg", stock=3),
            ProductFields(name="Atta", price=5500, unit="kg", stock=200),
        ],
    )
    token = current.set(MerchantContext(store, "alice", bid, []))
    try:
        yield store, bid
    finally:
        current.reset(token)


def reorder(store: MerchantStore, bid: str, item: str = "", quantity: Any = None, **more) -> dict:
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
            **more,
        )
    )


def waiting(store: MerchantStore, bid: str) -> list[dict]:
    chats = [o for o in sourcing.orders(store, "alice", bid) if o["status"] == "draft"]
    pos = [po for po in supply_chain.orders(store, "alice", bid) if po["status"] == "draft"]
    return chats + pos


def test_OB_339_sold_out_asks_how_much_never_nothing_to_reorder(shop) -> None:
    store, bid = shop
    result = reorder(store, bid)
    assert result["status"] == "needs_quantity"
    assert result["item"] == "Milk" and result["sold_out"] and result["left"] == 0


def test_OB_339_every_sold_out_or_low_item_is_listed_sold_out_first(shop) -> None:
    store, bid = shop
    context = store.context("alice", bid)
    listed = supply_coming.to_order(
        store,
        "alice",
        bid,
        context["inventory"],
        {"predictions": []},
        supply_chain.shop_today(context),
        "Grocery",
        supply_coming.coming_orders(store, "alice", bid),
    )
    assert [(row["item"], row["sold_out"], row["left"]) for row in listed] == [
        ("Milk", True, 0),
        ("Sugar", False, 3),
    ]


def test_OB_339_free_entry_drafts_when_the_app_thinks_nothing_is_needed(shop) -> None:
    store, bid = shop
    result = reorder(store, bid, "Butter", 2, unit_said="kg", direct=True)
    assert result["status"] == "drafted", result
    line = result["order"]["lines"][0]
    assert line["quantity"] == 2 and line["unit"] == "kg"


def test_OB_339_a_new_amount_replaces_the_draft(shop) -> None:
    store, bid = shop
    first = reorder(store, bid, "Milk", 10, direct=True)
    second = reorder(store, bid, "Milk", 5, direct=True)
    assert second["order"]["id"] == first["order"]["id"]
    assert second["order"]["lines"][0]["quantity"] == 5
    assert len(waiting(store, bid)) == 1


def test_OB_339_a_units_change_on_the_card_is_saved_in_the_suppliers_unit(shop) -> None:
    store, bid = shop
    order = reorder(store, bid, "Butter", 2, unit_said="kg", direct=True)["order"]
    fixed = supply_chain.apply_fix(
        store,
        "alice",
        bid,
        order["id"],
        order["version"],
        {"kind": "quantity", "line": order["lines"][0]["line"], "value": 500, "unit": "g"},
    )
    assert fixed["lines"][0]["quantity"] == 0.5


def chat_draft(store: MerchantStore, bid: str, item: str, quantity: float) -> dict:
    found = asyncio.run(
        sourcing.find(
            store,
            "alice",
            bid,
            item,
            quantity,
            "litre",
            SupplierGenerator(offline()),
            DEMO_OWNER_UID,
        )
    )
    first = found["suppliers"][0]
    drafted = prepare_order(
        first["id"], [OrderItem(name=first["item"]["name"], quantity=quantity, unit="litre")]
    )
    assert drafted["status"] == "needs_owner_tap", drafted
    return drafted


def test_OB_339_a_second_chat_draft_replaces_the_first(shop) -> None:
    store, bid = shop
    old = chat_draft(store, bid, "Milk", 10)
    new = chat_draft(store, bid, "Milk", 5)
    live = waiting(store, bid)
    assert [order["id"] for order in live] == [new["order_id"]]
    gone = sourcing.get_order(store, "alice", bid, old["order_id"])
    assert gone["status"] == "replaced" and gone["replaced_by"] == new["order_id"]


def test_OB_339_a_purchase_order_replaces_a_chat_draft_for_the_same_item(shop) -> None:
    store, bid = shop
    chat_draft(store, bid, "Milk", 10)
    reorder(store, bid, "Milk", 5, direct=True)
    live = waiting(store, bid)
    assert len(live) == 1 and "reason" in live[0]


def test_OB_339_a_draft_of_something_else_stays(shop) -> None:
    store, bid = shop
    chat_draft(store, bid, "Milk", 10)
    reorder(store, bid, "Sugar", 2, direct=True)
    assert len(waiting(store, bid)) == 2


def test_OB_339_the_amount_can_change_on_a_chat_draft(shop) -> None:
    store, bid = shop
    drafted = chat_draft(store, bid, "Milk", 10)
    order = sourcing.get_order(store, "alice", bid, drafted["order_id"])
    price = order["lines"][0]["price"]
    edited = sourcing.edit_draft(store, "alice", bid, order["id"], order["version"], {0: (5, "")})
    assert edited["id"] == order["id"] and edited["status"] == "draft"
    assert edited["lines"][0]["quantity"] == 5
    assert edited["total"] == edited["lines"][0]["total"] == round(price * 5)
    assert len(waiting(store, bid)) == 1


def calls(text: str, store: MerchantStore, bid: str) -> list[tuple[str, dict]]:
    ctx = SimpleNamespace(store=store, uid="alice", business_id=bid)
    return [(p.function_call.name, dict(p.function_call.args)) for p in order_call(text, ctx) or []]


def test_OB_339_the_offline_coach_drafts_what_is_said(shop) -> None:
    store, bid = shop
    assert calls("butter 2 kg", store, bid) == [
        ("draft_reorder", {"item": "Butter", "quantity": 2.0, "unit": "kg"})
    ]
    assert calls("5 लीटर दूध चाहिए", store, bid)[0][1]["item"] == "Milk"
    assert calls("don't order butter", store, bid) == []
    assert calls("mat mangao butter", store, bid) == []
    assert len(calls("2 kg sugar and 5 l milk chahiye", store, bid)) == 2


def test_OB_339_a_correction_goes_to_the_waiting_chat_draft(shop) -> None:
    store, bid = shop
    drafted = chat_draft(store, bid, "Milk", 10)
    made = calls("नहीं, सिर्फ़ 5 लीटर दूध चाहिए", store, bid)
    assert made[0][0] == "prepare_order"
    assert made[0][1]["supplier_id"] == drafted["supplier_id"]
    assert made[0][1]["items"][0]["quantity"] == 5.0


def events_of(response) -> list[dict]:
    return [
        json.loads(line[5:].strip())
        for line in response.text.splitlines()
        if line.startswith("data:")
    ]


def demo_order(events: list[dict]) -> dict:
    return next(event for event in events if event["kind"] == "order")["data"]


def test_OB_339_demo_correction_replaces_the_card(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    url = f"/api/v1/demo/sessions/{session}/coach"
    # Saying it is low only lists suppliers (OB-265); an explicit order makes the first card.
    first = demo_order(events_of(client.post(url, json={"message": "10 लीटर दूध चाहिए"})))
    second = demo_order(events_of(client.post(url, json={"message": "नहीं, सिर्फ़ 5 लीटर दूध चाहिए"})))
    assert second["lines"][0]["quantity"] == 5
    assert second["retired"] == [first["id"]]


def test_OB_339_demo_a_dont_orders_nothing(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    url = f"/api/v1/demo/sessions/{session}/coach"
    events = events_of(client.post(url, json={"message": "2 kilo makhan mat mangao"}))
    assert not [event for event in events if event["kind"] == "order"]


# Review HOLD on #704: "भेज दो" names the shop's own item, a chat draft keeps the other lines
# of a purchase order, the closest shelf name wins, and only the one order skips a guess.


@pytest.mark.parametrize(
    ("text", "item", "quantity", "unit"),
    [
        ("दूध 5 लीटर भेज दो", "दूध", 5, "litre"),
        ("मक्खन दो किलो भेज दो", "मक्खन", 2, "kg"),
        ("5 लीटर दूध भिजवा दीजिए", "दूध", 5, "litre"),
        ("butter 2 kg chahiye kal tak", "butter", 2, "kg"),
        ("milk 5 litre bhej do", "milk", 5, "litre"),
    ],
)
def test_OB_339_send_words_are_not_part_of_the_name(text, item, quantity, unit) -> None:
    assert lines(text) == [(item, quantity, unit)]


def test_OB_339_a_hindi_name_with_more_words_is_still_the_shops_item() -> None:
    shelf = [{"name": "Milk"}, {"name": "Butter"}]
    assert resolve_item("दूध भेज", shelf) == "Milk"
    assert resolve_item("फुल क्रीम दूध", shelf) == "Milk"
    assert resolve_item("मक्खन भेज", shelf) == "Butter"


def test_OB_339_the_closest_shelf_name_wins() -> None:
    shelf = [{"name": "Milk"}, {"name": "Heritage Milk 500ml"}]
    assert resolve_item("heritage milk", shelf) == "Heritage Milk 500ml"
    assert resolve_item("milk", shelf) == "Milk"


def test_OB_339_hindi_send_drafts_one_order_for_the_shops_milk(shop) -> None:
    store, bid = shop
    made = calls("दूध 5 लीटर भेज दो", store, bid)
    assert made == [("draft_reorder", {"item": "Milk", "quantity": 5.0, "unit": "litre"})]
    result = reorder(store, bid, "Milk", 5, unit_said="litre", direct=True)
    assert result["status"] == "drafted", result
    assert result["order"]["reason"]["item"] == "Milk"
    live = waiting(store, bid)
    assert len(live) == 1 and live[0]["reason"]["item"] == "Milk"
    assert calls("मक्खन दो किलो भेज दो", store, bid)[0][1]["item"] == "Butter"


def test_OB_339_a_chat_draft_takes_only_its_line_from_a_purchase_order(shop) -> None:
    store, bid = shop
    po = reorder(store, bid, "Sugar", 10, unit_said="kg", direct=True)["order"]
    sugar = po["lines"][0]
    milk = {**sugar, "line": sugar["line"] + 10, "item": "Milk", "quantity": 5, "unit": "litre"}
    po["lines"] = [sugar, milk]
    supply_chain._save(store, bid, po)
    chat_draft(store, bid, "Milk", 5)
    kept = next(p for p in supply_chain.orders(store, "alice", bid) if p["id"] == po["id"])
    assert kept["status"] == "draft"
    assert [line["item"] for line in kept["lines"]] == [sugar["item"]]
    assert kept["total"] == sum(line["total"] or 0 for line in kept["lines"])


def test_OB_339_a_named_amount_never_changes_the_suppliers_saved_rules(shop) -> None:
    store, bid = shop
    result = reorder(store, bid, "Butter", 2, unit_said="kg", direct=True)
    assert result["status"] == "drafted", result
    assert result["order"]["lines"][0]["quantity"] == 2
    assert not any(c["code"] == "below_moq" for c in result["order"]["checks"])
    row = supply_chain.relationship(store, bid, result["order"]["supplier"]["id"])
    assert row["suggested"]
    guessed = supply_chain.rules_of(row)
    rule = supply_chain.item_rule(guessed, result["order"]["lines"][0]["item"])
    assert rule and (rule.moq or rule.pack), "the guess stays for the next forecast reorder"


def test_OB_339_the_live_coach_orders_a_named_amount_directly(shop, monkeypatch) -> None:
    from app import supply_tools

    seen: dict[str, Any] = {}

    async def fake(*args: Any, **kwargs: Any) -> dict:
        seen.update(kwargs)
        return {"status": "needs_item"}

    monkeypatch.setattr(supply_chain, "draft_reorder", fake)
    asyncio.run(supply_tools.draft_reorder("Butter", 2, unit="kg"))
    assert seen["direct"] is True
    asyncio.run(supply_tools.draft_reorder())
    assert seen["direct"] is False
