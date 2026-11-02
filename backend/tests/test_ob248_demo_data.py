"""OB-248: the demo's seed data is correct and consistent, shop by shop."""

import re
import time
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.demo_chains import CHAINS
from app.demo_data import SHOPS
from app.product_source import source_of
from app.tour_catalogue import TOUR_SHOPS
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo import open_demo, owner

ALL_SHOPS = [*TOUR_SHOPS, *SHOPS, *CHAINS]
# Businesses that exist in the real world never appear in sample data.
REAL_BUSINESSES = re.compile(
    r"metro cash|reliance|amul|nandini|haldiram|parle|britannia|bigbasket|blinkit|dmart|udaan",
    re.IGNORECASE,
)


@pytest.fixture
def demo(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]
        yield client, session, owner(client, session, "businesses").json()


@pytest.mark.parametrize("shop", ALL_SHOPS, ids=lambda shop: shop.id)
def test_OB_248_catalogue_prices_units_and_names(shop) -> None:
    assert shop.fields.name.endswith("(Demo)")
    assert not REAL_BUSINESSES.search(shop.fields.name)
    names = [product.name for product in shop.products]
    assert len(names) == len(set(names)), "a menu never lists one item twice"
    for product in shop.products:
        assert product.price > 0, product.name
        assert product.unit, product.name


@pytest.mark.parametrize("shop", [*TOUR_SHOPS, *CHAINS], ids=lambda shop: shop.id)
def test_OB_248_every_stock_item_knows_made_or_bought(shop) -> None:
    category = shop.fields.category
    for product in shop.products:
        assert source_of(product.model_dump(), category) in {"made", "bought"}, product.name


def test_OB_248_a_shop_shows_one_price_and_unit_across_both_catalogues() -> None:
    tour = {shop.fields.name: shop for shop in TOUR_SHOPS}
    for shop in SHOPS:
        twin = tour.get(shop.fields.name)
        if twin is None:
            continue
        rows = {product.name: product for product in twin.products}
        for product in shop.products:
            if product.name in rows:
                assert (product.price, product.unit) == (
                    rows[product.name].price,
                    rows[product.name].unit,
                ), f"{shop.fields.name}: {product.name}"


def test_OB_248_sandbox_orders_are_consistent(demo) -> None:
    client, session, businesses = demo
    for business in businesses:
        bid = business["id"]
        supply = owner(client, session, f"businesses/{bid}/supply").json()
        open_orders = [
            order
            for order in supply["orders"]
            if order["status"] not in {"closed", "cancelled"} and order["buyer"]["id"] == bid
        ]
        seen = set()
        for order in open_orders:
            assert "(Demo)" in order["supplier"]["name"]
            assert not REAL_BUSINESSES.search(order["supplier"]["name"])
            for line in order["lines"]:
                assert line["price"] > 0 and line["quantity"] > 0, line["item"]
                key = (order["supplier"]["id"], line["item"])
                assert key not in seen, f"two open orders for {key}"
                seen.add(key)
            # Open means still to come: a delivery date in the past reads as a mistake.
            if order.get("delivery") and not order.get("received"):
                assert date.fromisoformat(order["delivery"]) >= date.today() - timedelta(days=1)
        inventory = owner(client, session, f"businesses/{bid}/inventory").json()
        for row in inventory:
            assert row.get("source") in {"made", "bought"}, row["name"]


def test_OB_248_closed_orders_happened_in_the_past_with_their_whole_story(demo) -> None:
    """FreshMart PO-FM-2210 and Metro Foods 4500091500 read "Done": every step is in the past,
    in order, and the chat holds the owner's order, the yes, the dispatch, the goods and the
    bill, never a delivery tomorrow or a step "Waiting"."""
    client, session, businesses = demo
    now = time.time()
    closed = []
    for business in businesses:
        supply = owner(client, session, f"businesses/{business['id']}/supply").json()
        closed += [order for order in supply["orders"] if order["status"] == "closed"]
    assert {"PO-FM-2210", "4500091500"} <= {order["number"] for order in closed}
    for order in closed:
        number = order["number"]
        assert order["received"], number
        assert date.fromisoformat(order["delivery"]) < date.today(), number
        kinds = [document["kind"] for document in order["documents"]]
        for step in ("ORDERS", "ORDRSP", "DESADV", "RECEIPT", "INVOIC"):
            assert step in kinds, f"{number}: no {step}"
        at = [document["at"] for document in order["documents"]]
        assert at == sorted(at) and at[-1] < now - 86400, f"{number}: steps out of order or new"
        assert order["created"] <= at[0] and order["received_at"] < now - 86400, number
        received = next(d for d in order["documents"] if d["kind"] == "RECEIPT")
        assert abs(received["at"] - order["received_at"]) < 3600 * 6, number
        for document in order["documents"]:
            issued = date.fromisoformat(document["canonical"]["issued"])
            assert issued < date.today(), f"{number} {document['kind']} issued {issued}"
            # Its text too: no document of a closed order is dated today, in any format.
            for today in (date.today().isoformat(), date.today().strftime("%Y%m%d")):
                assert today not in document["raw"], f"{number} {document['kind']} dated today"


def test_OB_248_run_out_dates_agree_and_follow_the_numbers(demo) -> None:
    client, session, businesses = demo
    bid = businesses[0]["id"]
    needs = owner(client, session, f"businesses/{bid}/supply").json()["needs"]
    need = next(row for row in needs if row["item"] == "Tea dust")
    story = owner(client, session, f"demo/chain/{bid}").json()["today"]
    assert need["runs_out"] == story["runs_out"]
    days = (date.fromisoformat(need["runs_out"]) - date.today()).days
    # The stock lasts about stock / daily days; a date far from that is a wrong number on screen.
    assert abs(days - need["stock"] / need["daily"]) <= 3


def test_OB_248_reorder_on_top_of_the_seed_is_a_real_top_up_not_one_kilo(demo) -> None:
    """Two near-identical tea dust rows came from a stray 1 kg draft beside the seed order."""
    client, session, businesses = demo
    bid = businesses[0]["id"]
    drafted = owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={}).json()
    assert drafted["status"] == "drafted"
    line = drafted["order"]["lines"][0]
    assert line["item"] == "Tea dust"
    assert line["quantity"] >= 5
    # The owner sees the two orders apart: different size and status.
    orders = owner(client, session, f"businesses/{bid}/supply").json()["orders"]
    rows = {(order["lines"][0]["quantity"], order["status"]) for order in orders}
    assert len(rows) == len(orders)
