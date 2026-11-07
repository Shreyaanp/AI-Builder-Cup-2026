"""Shop kinds after the review of PR #638: serving words only, traders are wholesale (OB-244)."""

import pytest

from app import sourcing, supply_chain
from app.merchant import ProductFields
from app.product_source import same_kind, shop_kind
from tests.test_ob239_made_or_bought import neighbour, open_shop, store  # noqa: F401
from tests.test_supply_chain import BENGALURU


@pytest.mark.parametrize(
    ("category", "kind"),
    [
        # Review of PR #638: bare "tea" or "coffee" is no serving shop; traders are wholesale.
        ("Assam Tea Traders", "wholesale"),
        ("Tea emporium", "wholesale"),
        ("Tea depot", "wholesale"),
        ("Tea estate", "wholesale"),
        ("Tea & spices", ""),
        ("Coffee powder", ""),
        ("Coffee works", ""),
        ("Coffee agencies", "wholesale"),
        ("Distributers", "wholesale"),
        ("Tea shop", "tea"),
        ("Tea-stall", "tea"),
        ("Bubble tea", "tea"),
        ("टी-स्टॉल", "tea"),
        ("Hair & Beauty", "salon"),
        ("Beauty & wellness", "salon"),
        ("Nails by Riya", "salon"),
        ("Nails & screws", ""),
        ("Medical clinic", ""),
        ("Medical centre", ""),
        ("Medical Hall", "resale"),
        ("Sharma Medicos", "resale"),
        ("Hotel Annapurna", "kitchen"),
        ("Udupi hotel", "kitchen"),
        ("होटल", "kitchen"),
        ("Sri Krishna Bhavan", "kitchen"),
        ("Biryani house", "kitchen"),
        ("Chaat corner", "kitchen"),
        ("Juice centre", "kitchen"),
        ("Mess", "kitchen"),
        ("Super market", "resale"),
        ("स्वीट्स", "sweets"),
        ("बेकर्स", "bakery"),
        ("जनरल स्टोर्स", "resale"),
        ("फूलों की दुकान", "florist"),
        ("Modular kitchen", ""),
        ("Kitchen appliances", ""),
        ("Sweet home furnishings", ""),
    ],
)
def test_review_shop_kinds(category, kind) -> None:
    assert shop_kind(category) == kind


def test_cafes_and_tea_stalls_do_not_rival_coffee_traders() -> None:
    assert not same_kind("Café", "Coffee powder") and not same_kind("Kopitiam", "Coffee works")


@pytest.mark.parametrize("buyer", ["Tea stall", "Kopitiam", "Café"])
@pytest.mark.parametrize(
    "seller", ["Assam Tea Traders", "Tea emporium", "Coffee powder", "Coffee works"]
)
def test_tea_and_coffee_traders_are_suppliers_to_tea_stalls_and_cafes(buyer, seller) -> None:
    pin = sourcing.ShopPin(
        lat=BENGALURU[0],
        lng=BENGALURU[1],
        approximate=False,
        currency="INR",
        timezone="Asia/Kolkata",
        location="",
        category=buyer,
        name="Mine",
        phone="",
    )
    trader = {
        "id": "trader",
        "category": seller,
        "lat": BENGALURU[0] + 0.0013,
        "lng": BENGALURU[1],
        "currency": "INR",
        "products": [
            {"name": "Tea dust", "unit": "kg", "price": 30000},
            {"name": "Coffee powder", "unit": "kg", "price": 50000},
        ],
    }
    for item in ("Tea dust", "Coffee powder"):
        assert len(sourcing.candidates([trader], "mine", pin, item)) == 1


def test_a_linked_tea_trader_is_a_supplier_candidate(store) -> None:  # noqa: F811
    bid = open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        [ProductFields(name="Tea dust", price=30000, unit="kg", stock=1)],
        [],
    )
    stock = [ProductFields(name="Tea dust", price=28000, unit="kg", stock=500)]
    neighbour(store, bid, "demo-pr638-traders", "Assam Tea Traders", "Assam Tea Traders", stock)
    found = supply_chain.supplier_candidates(store, bid, "Tea dust", "INR", "Tea stall")
    assert len(found) == 1
