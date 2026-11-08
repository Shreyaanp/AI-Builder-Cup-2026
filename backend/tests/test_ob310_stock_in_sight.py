"""OB-310: stock in plain sight. Every menu item shows its count with − / + that save at once;
things the shop buys to make others (tea dust) live in "Things I buy", never on the customer
menu or page; "Make more" knows what usually sells today; chat sets stock with a confirm."""

from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.merchant import MerchantStore, ProductFields, ProposalRequest
from app.product_source import asks_for_sale, for_sale, sold_names
from app.shop_today import usual_sales
from tests.pins import OWNER_PIN
from tests.test_coach_owner_words import ENGLISH_WORD, cards, demo, reply_of  # noqa: F401
from tests.test_imports import make_shop
from tests.test_ob239_made_or_bought import open_shop
from tests.test_owner_features import setup  # noqa: F401
from tests.test_photos import app, join  # noqa: F401
from tests.test_public_demo import open_demo, owner


@pytest.mark.parametrize(
    ("name", "unit", "category", "expected"),
    [
        # Supplies no customer buys at a shop that makes things.
        ("Tea dust", "kg", "Tea stall", False),
        ("Tata tea dust", "kg", "Tea stall", False),
        ("Paper cups (100)", "pack", "Cafe", False),
        ("Coffee powder", "kg", "Cafe", False),
        ("Masala chai", "cup", "Tea stall", True),
        ("Bun maska", "piece", "Tea stall", True),
        # A shop that resells what it buys, or one of no known kind, sells its milk.
        ("Milk", "l", "Kirana store", True),
        ("Milk", "l", "Ravi Dairy", True),
        ("Milk", "l", "", True),
        ("Tea dust", "kg", "Kirana store", True),
        # "Dal" by the plate at a restaurant may be the dish: still on the menu.
        ("Dal", "plate", "Restaurant", True),
    ],
)
def test_ob310_things_i_buy_are_inferred_without_rewriting_items(name, unit, category, expected):
    assert for_sale({"name": name, "unit": unit}, category) is expected


# The review's real menus (HOLD 1): a bare name is never hidden by its name alone.
SELLABLE = [
    ("Paneer", "kg", "Sweets & dairy"),
    ("Paneer", "kg", "Sweet shop"),
    ("Ghee", "kg", "Sweet shop"),
    ("Milk", "litre", "Sweet shop"),
    ("Paneer", "kg", "Mithai"),
    ("Ghee", "kg", "Mithai"),
    ("Milk", "litre", "Mithai"),
    ("Eggs", "dozen", "Bakery"),
    ("Butter", "pack", "Bakery"),
    ("Cheese", "pack", "Bakery"),
    ("Milk", "bottle", "Cafe"),
    ("Ghee", "kg", "Home kitchen"),
    ("Milk", "l", "Tea stall"),
]


@pytest.mark.parametrize(("name", "unit", "category"), SELLABLE)
def test_ob310_a_bare_name_stays_on_the_menu_and_is_asked(name, unit, category):
    item = {"name": name, "unit": unit}
    assert for_sale(item, category) is True
    # The owner is asked once ("Do customers buy Paneer from you?") until they answer.
    assert asks_for_sale(item, category) is True
    assert asks_for_sale({**item, "for_sale": True}, category) is False
    assert asks_for_sale({**item, "for_sale": False}, category) is False


def test_ob310_nothing_else_is_asked():
    assert not asks_for_sale({"name": "Masala chai", "unit": "cup"}, "Tea stall")
    assert not asks_for_sale({"name": "Tea dust", "unit": "kg"}, "Tea stall")
    assert not asks_for_sale({"name": "Milk", "unit": "l"}, "Kirana store")
    assert not asks_for_sale({"name": "Paneer", "unit": "kg", "source": "made"}, "Sweet shop")


def test_ob310_a_supply_that_has_sold_stays_on_the_menu():
    tea = {"name": "Tea dust", "unit": "kg"}
    assert for_sale(tea, "Tea stall", sold_names([{"item": "tea dust", "quantity": 1}])) is True
    # "I buy it" says how the item is restocked, not that customers can't buy it: still asked.
    eggs = {"name": "Eggs", "unit": "dozen", "source": "bought"}
    assert for_sale(eggs, "Bakery") is True
    assert asks_for_sale(eggs, "Bakery") is True
    # "I make it" never hides anything; nor "I buy it" on something that isn't a raw supply.
    assert for_sale({**tea, "source": "made"}, "Tea stall") is True
    assert for_sale({"name": "Biscuits", "unit": "pack", "source": "bought"}, "Tea stall")


def test_ob310_the_owners_own_switch_wins():
    assert for_sale({"name": "Tea dust", "unit": "kg", "for_sale": True}, "Tea stall") is True
    assert for_sale({"name": "Samosa", "unit": "piece", "for_sale": False}, "Tea stall") is False


@pytest.mark.parametrize(("name", "unit", "category"), SELLABLE)
def test_ob310_existing_shops_keep_every_sellable_item_public(tmp_path: Path, name, unit, category):
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = open_shop(
        store,
        "Ravi's",
        category,
        [ProductFields(name=name, price=5000, unit=unit, stock=4)],
        [],
    )
    store.share("alice", bid, True)
    shop = store.public_shop(bid)
    assert shop is not None and [p["name"] for p in shop["products"]] == [name]
    assert [p["name"] for s in store.shared_shops() for p in s["products"]] == [name]


def tea_stall(store: MerchantStore) -> str:
    bid = open_shop(
        store,
        "Lantern Chai",
        "Tea stall",
        [
            ProductFields(name="Masala chai", price=2000, unit="cup", stock=40),
            ProductFields(name="Tea dust", price=32000, unit="kg", stock=3, source="bought"),
            ProductFields(name="Milk", price=6000, unit="l", stock=12),
        ],
        [],
    )
    store.share("alice", bid, True)
    return bid


def test_ob310_customer_page_never_shows_things_i_buy(tmp_path: Path):
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = tea_stall(store)
    shop = store.public_shop(bid)
    assert shop is not None
    # Tea dust is off the page; Milk, a bare name, stays on it until the owner says otherwise.
    assert [p["name"] for p in shop["products"]] == ["Masala chai", "Milk"]
    # Nothing was lost: the owner still has all three items.
    assert {p["name"] for p in store.inventory("alice", bid)} == {"Masala chai", "Tea dust", "Milk"}
    assert all(p["name"] != "Tea dust" for s in store.shared_shops() for p in s["products"])


def test_ob310_a_supply_with_sales_stays_on_the_customer_page(tmp_path: Path):
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = open_shop(
        store,
        "Lantern Chai",
        "Tea stall",
        [
            ProductFields(name="Masala chai", price=2000, unit="cup"),
            ProductFields(name="Tea dust", price=32000, unit="kg"),
            ProductFields(name="Cocoa powder", price=9000, unit="pack"),
        ],
        [("Masala chai", 30, 20), ("Tea dust", 1, 320)],
    )
    store.share("alice", bid, True)
    shop = store.public_shop(bid)
    assert shop is not None
    assert [p["name"] for p in shop["products"]] == ["Masala chai", "Tea dust"]


def test_ob310_the_owner_is_asked_about_a_bare_name_once(app):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                "revision": 0,
                "business": {"name": "Ravi Sweets", "category": "Sweet shop"},
                "products": [
                    {"name": "Paneer", "price": 40000, "unit": "kg"},
                    {"name": "Kaju katli", "price": 1200, "unit": "piece"},
                ],
            },
        ).json()
        bid = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()["business_id"]
        items = {p["name"]: p for p in client.get(f"/api/v1/businesses/{bid}/inventory").json()}
        assert items["Paneer"]["for_sale"] is True and items["Paneer"]["ask_for_sale"] is True
        assert "ask_for_sale" not in items["Kaju katli"]
        url = f"/api/v1/businesses/{bid}/inventory/{items['Paneer']['id']}/for-sale"
        assert client.post(url, json={"for_sale": True}).status_code == 200
        items = {p["name"]: p for p in client.get(f"/api/v1/businesses/{bid}/inventory").json()}
        # Answered once, never asked again.
        assert items["Paneer"]["for_sale"] is True and "ask_for_sale" not in items["Paneer"]


# HOLD 1 (7 Nov 21:16): the make-or-buy answer "Buy" never moves an item to Things I buy.
BOUGHT = [
    ("Paneer", "kg", "Sweet shop"),
    ("Eggs", "dozen", "Bakery"),
    ("Butter", "pack", "Bakery"),
    ("Cheese", "pack", "Bakery"),
    ("Milk", "bottle", "Cafe"),
    ("Ghee", "kg", "Home kitchen"),
]


@pytest.mark.parametrize(("name", "unit", "category"), BOUGHT)
def test_ob310_answering_buy_keeps_the_item_on_the_menu_and_asked(
    app,  # noqa: F811
    name,
    unit,
    category,
):
    with TestClient(app) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                "revision": 0,
                **OWNER_PIN,
                "business": {"name": "Ravi's", "category": category},
                "products": [{"name": name, "price": 40000, "unit": unit, "stock": 3}],
            },
        ).json()
        bid = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()["business_id"]
        [item] = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert item["for_sale"] is True and item["ask_for_sale"] is True
        url = f"/api/v1/businesses/{bid}/inventory/{item['id']}/source"
        assert client.post(url, json={"source": "bought"}).status_code == 200
        [item] = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert item["source"] == "bought"
        assert item["for_sale"] is True and item["ask_for_sale"] is True
        assert client.post(f"/api/v1/businesses/{bid}/share", json={"public": True}).is_success
        shop = client.get(f"/api/v1/public/shops/{bid}").json()
        assert [p["name"] for p in shop["products"]] == [name]


def test_ob310_a_menu_edit_keeps_the_for_sale_switch(tmp_path: Path):
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = tea_stall(store)
    milk = next(p for p in store.inventory("alice", bid) if p["name"] == "Milk")
    store.edit_item("alice", bid, milk["id"], lambda fields: {**fields, "for_sale": True})
    revision = store.context("alice", bid)["business"]["revision"]
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="inventory",
            business_id=bid,
            revision=revision,
            products=[ProductFields(name="Milk", price=6500, unit="l", stock=12)],
        ),
    )
    store.commit("alice", proposal["id"], proposal["digest"])
    milk = next(p for p in store.inventory("alice", bid) if p["name"] == "Milk")
    assert milk["price"] == 6500 and milk["for_sale"] is True
    assert "Milk" in [p["name"] for p in store.public_shop(bid)["products"]]  # type: ignore[index]


def test_ob310_usual_sales_is_this_weekdays_average():
    today = date(2026, 11, 3)  # a Tuesday
    rows = [
        {"date": (today - timedelta(days=7 * week)).isoformat(), "item": "Bun maska", "quantity": q}
        for week, q in ((1, 24), (2, 28), (3, 25), (4, 27))
    ]
    # Other weekdays, today's partial sales and older weeks never count.
    rows += [
        {"date": (today - timedelta(days=1)).isoformat(), "item": "Bun maska", "quantity": 90},
        {"date": today.isoformat(), "item": "Bun maska", "quantity": 3},
        {"date": (today - timedelta(days=35)).isoformat(), "item": "Bun maska", "quantity": 90},
    ]
    assert usual_sales(rows, today) == {"Bun maska": 26}
    assert usual_sales([], today) == {}


def stocked(client: TestClient) -> tuple[str, dict]:
    bid = make_shop(client)
    proposal = client.post(
        "/api/v1/proposals",
        json={
            "kind": "inventory",
            "business_id": bid,
            "revision": 1,
            "products": [{"name": "Bun maska", "price": 350, "unit": "piece", "stock": 4}],
        },
    ).json()
    client.post(f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]})
    [item] = client.get(f"/api/v1/businesses/{bid}/inventory").json()
    return bid, item


def test_ob310_undo_keeps_the_owners_sold_out_switch(app):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid, item = stocked(client)
        url = f"/api/v1/businesses/{bid}/inventory/{item['id']}/stock"
        client.post(url, json={"stock": 1})
        toggle = f"/api/v1/businesses/{bid}/inventory/{item['id']}/availability"
        client.post(toggle, json={"available": False})
        assert client.post(url, json={"stock": 0}).json()["available"] is False
        # Undo sends the count and the switch it had: switched off stays off.
        undone = client.post(url, json={"stock": 1, "available": False}).json()
        assert undone["stock"] == 1 and undone["available"] is False
        # Without the switch, more after 0 is on sale again; 0 left is sold out whatever is sent.
        client.post(url, json={"stock": 0})
        assert client.post(url, json={"stock": 1}).json()["available"] is True
        assert client.post(url, json={"stock": 0, "available": True}).json()["available"] is False


def test_ob310_stock_saves_at_once_and_adds_from_the_saved_count(app):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid, item = stocked(client)
        assert item["for_sale"] is True and item["stock"] == 4
        url = f"/api/v1/businesses/{bid}/inventory/{item['id']}/stock"
        first = client.post(url, json={"stock": 5}).json()
        assert first["stock"] == 5
        # "Made 20" adds to what is saved, so it never overwrites another tap.
        assert client.post(url, json={"add": 20}).json()["stock"] == 25
        assert client.post(url, json={"add": -100}).json()["stock"] == 0
        # Each tap is a new revision: a proposal prepared before it goes stale.
        assert client.post(url, json={"stock": 4}).json()["revision"] > first["revision"]
        for body in ({}, {"stock": 3, "add": 1}, {"stock": -1}, {"stock": 2_000_000}):
            assert client.post(url, json=body).status_code == 422, body
        [saved] = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert saved["stock"] == 4
        # Undo of the first tap on an item nobody counted: not counted again.
        assert client.post(url, json={"stock": None}).json()["stock"] is None
        assert client.post(url, json={"add": 2}).json()["stock"] == 2
        # 0 left is sold out, so customers are not offered it; more made puts it back on sale.
        gone = client.post(url, json={"add": -4}).json()
        assert gone["stock"] == 0 and gone["available"] is False
        back = client.post(url, json={"add": 3}).json()
        assert back["stock"] == 3 and back["available"] is True
        missing = f"/api/v1/businesses/{bid}/inventory/nope/stock"
        assert client.post(missing, json={"stock": 1}).status_code == 404


def test_ob310_an_item_moves_between_the_menu_and_things_i_buy(app):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid, item = stocked(client)
        url = f"/api/v1/businesses/{bid}/inventory/{item['id']}/for-sale"
        assert client.post(url, json={"for_sale": False}).json()["for_sale"] is False
        [saved] = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert saved["for_sale"] is False and saved["stock"] == 4
        assert client.post(url, json={"for_sale": "maybe"}).status_code == 422


def test_ob310_the_demo_sandbox_takes_stock_taps(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        bid = owner(client, session, "businesses").json()[0]["id"]
        menu = owner(client, session, f"businesses/{bid}/inventory").json()
        tea = next(p for p in menu if p["name"] == "Tea dust")
        bun = next(p for p in menu if p["name"] == "Bun maska")
        assert tea["for_sale"] is False and bun["for_sale"] is True
        tapped = owner(
            client,
            session,
            f"businesses/{bid}/inventory/{bun['id']}/stock",
            "POST",
            json={"add": 1},
        )
        assert tapped.status_code == 200 and tapped.json()["stock"] == (bun["stock"] or 0) + 1
        usual = owner(client, session, f"businesses/{bid}/usual-sales")
        assert usual.status_code == 200 and usual.json()["items"].get("Bun maska", 0) > 0
        # Another visitor's sandbox is untouched (#665: never shared state).
        other = open_demo(client).json()["session_id"]
        theirs = owner(client, other, "businesses").json()[0]["id"]
        again = owner(client, other, f"businesses/{theirs}/inventory").json()
        assert next(p for p in again if p["name"] == "Bun maska")["stock"] == bun["stock"]


def stock_of(events: list[dict]) -> dict[str, int | None]:
    [card] = cards(events)
    return {p["name"]: p.get("stock") for p in card["products"]}


@pytest.mark.parametrize(
    ("message", "language", "item", "added"),
    [
        ("bun maska 10 more bana diye", "en", "Bun maska", 10),
        ("Bun maska 10 aur bana diye hain", "hi", "Bun maska", 10),
        ("made 10 more bun maska", "en", "Bun maska", 10),
        ("बन मस्का 10 और बना दिए", "hi", "Bun maska", 10),
    ],
)
def test_ob310_chat_adds_what_the_owner_made(demo, message, language, item, added):  # noqa: F811
    events = demo(message, language)
    # The demo's Bun maska has 4 left (the audit's "only 4 left").
    assert stock_of(events) == {item: 4 + added}, events
    reply = reply_of(events)
    if language == "hi":
        assert "4 बचे → 14 बचे" in reply and not ENGLISH_WORD.search(reply), reply
    else:
        assert "Bun maska: 4 left → 14 left" in reply, reply


@pytest.mark.parametrize(
    ("message", "language"),
    [
        ("samosa stock 20", "en"),
        ("Samosa ka stock 20 hai", "en"),
        ("samosa 20 left", "en"),
        ("set stock of samosa to 20", "en"),
        ("समोसा स्टॉक 20", "hi"),
        ("समोसे 20 बचे हैं", "hi"),
        ("samosa stock 20 pieces", "en"),
        ("समोसा स्टॉक 20 पीस", "hi"),
    ],
)
def test_ob310_chat_sets_a_stock_count(demo, message, language):  # noqa: F811
    events = demo(message, language)
    assert stock_of(events) == {"Samosa": 20}, events
    if language == "hi":
        assert not ENGLISH_WORD.search(reply_of(events)), reply_of(events)


@pytest.mark.parametrize(
    ("message", "count"),
    [("samosa stock 1,000", 1000), ("samosa stock 1,00,000", 100000), ("samosa stock 1000", 1000)],
)
def test_ob310_chat_reads_grouped_numbers(demo, message, count):  # noqa: F811
    # Owners write "1,000" or the Indian "1,00,000"; both mean the plain number.
    assert stock_of(demo(message, "en")) == {"Samosa": count}


@pytest.mark.parametrize(
    "message",
    [
        "bun maska 10 more mat banao",
        "don't set samosa stock 20",
        "samosa stock 20?",
        "kya samosa 20 left hai",
        "समोसा स्टॉक 20 मत करो",
    ],
)
def test_ob310_a_question_or_a_not_never_changes_stock(demo, message):  # noqa: F811
    assert cards(demo(message, "en")) == []


def test_ob310_a_rescue_deal_never_offers_things_i_buy(setup):  # noqa: F811
    client, store, bid, _ = setup
    path = f"/api/v1/businesses/{bid}/rescue"
    items = {p["name"]: p for p in store.inventory("owner", bid)}
    deal = {"discount_pct": 30, "until": "19:45"}
    # Milk at a bakery stays on the menu, so it may go on a deal...
    milk = {"items": [{"name": "Milk", "qty": 2}], **deal}
    assert client.post(path, json=milk).status_code == 200
    # ...until the owner moves it to Things I buy.
    store.edit_item("owner", bid, items["Milk"]["id"], lambda f: {**f, "for_sale": False})
    refused = client.post(path, json=milk)
    assert refused.status_code == 422 and "Things I buy" in refused.text
    # A supply no customer buys is never offered either, without any switch.
    store.edit_item("owner", bid, items["Croissant"]["id"], lambda f: {**f, "name": "Cocoa powder"})
    cocoa = {"items": [{"name": "Cocoa powder", "qty": 2}], **deal}
    refused = client.post(path, json=cocoa)
    assert refused.status_code == 422 and "Things I buy" in refused.text


@pytest.mark.parametrize(
    ("message", "language"), [("samosa stock 0", "en"), ("समोसा स्टॉक 0", "hi")]
)
def test_ob310_chat_stock_0_is_sold_out(demo, message, language):  # noqa: F811
    events = demo(message, language)
    [card] = cards(events)
    [samosa] = card["products"]
    assert samosa["stock"] == 0 and samosa["available"] is False
    reply = reply_of(events)
    assert "0 left" not in reply and "0 बचे" not in reply, reply
    assert ("ख़त्म" if language == "hi" else "sold out") in reply, reply
