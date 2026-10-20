"""OB-94: the price used for ordering must be the price the customer sees."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app import discover_ask
from app.community import Profile
from app.discover import TopItem
from app.discover_ask import AskRequest, Intent, PickDeal, min_price, ranking, shop_pick
from app.main import create_app
from app.search_engine import SearchEngine, Taste, fixture_embedder, item_recall
from tests.test_discover import settings


def shop(products: list[dict]) -> dict:
    return {
        "id": "bakery",
        "name": "Sunrise Bakehouse",
        "category": "Bakery",
        "lat": 1.2847,
        "lng": 103.832,
        "hours": "24 hours",
        "timezone": "Asia/Singapore",
        "currency": "SGD",
        "products": products,
    }


def product(name: str, price: int, category: str = "Drinks") -> dict:
    return {"name": name, "price": price, "category": category, "available": True, "unit": "cup"}


def test_ob94_cheapest_uses_headline_not_unrelated_rescue() -> None:
    bakery = shop_pick(
        shop([product("Iced coffee", 300)]), Intent(keywords=["coffee"]), 1.28, 103.83
    )
    assert bakery is not None
    bakery.deal = PickDeal(item="Croissant", price=133, was_price=190, pickup_end=9999999999)
    cafe = bakery.model_copy(update={"id": "cafe", "matched": [TopItem(**product("Coffee", 200))]})
    assert min_price(bakery) == bakery.matched[0].price == 300
    assert [p.id for p in sorted([bakery, cafe], key=ranking(Intent(sort="price"), None))] == [
        "cafe",
        "bakery",
    ]


def test_ob94_cheapest_item_is_headline_before_menu_is_capped() -> None:
    menu = [product(f"Coffee {n}", price) for n, price in enumerate([600, 500, 400, 200])]
    pick = shop_pick(shop(menu), Intent(keywords=["coffee"], sort="price"), 1.28, 103.83)
    assert pick is not None
    assert pick.matched[0].price == min_price(pick) == 200
    assert pick.matched[0].name == "Coffee 3"


def test_ob94_bread_does_not_offer_coffee_shop_cake_from_bakes_section() -> None:
    cafe = {
        **shop([product("Banana cake", 220, "Bakes")]),
        "id": "cafe",
        "name": "Corner Cup",
        "category": "Cafe",
    }
    bakery = shop([product("Sourdough loaf", 610, "Bread"), product("Croissant", 190, "Bakes")])
    engine = SearchEngine(fixture_embedder, "ob94")
    meaning = engine.relevance("bread", [cafe, bakery])
    intent = Intent(keywords=["bread"], open_now=True)
    assert shop_pick(cafe, intent, 1.28, 103.83, meaning["cafe"], item_recall(meaning)) is None
    pick = shop_pick(bakery, intent, 1.28, 103.83, meaning["bakery"], item_recall(meaning))
    assert pick is not None
    assert pick.matched[0].name == "Croissant" and pick.matched[0].price == 190
    assert all(p.name in {"Sourdough loaf", "Croissant"} for p in pick.matched)
    assert all(
        any(p.name == m["name"] and p.price == m["price"] for m in bakery["products"])
        for p in pick.matched
    )


async def test_ob94_explicit_price_order_keeps_followed_shop_in_price_position(monkeypatch) -> None:
    bakery = shop([product("Iced coffee", 300)])
    cafe = {**shop([product("Coffee", 200)]), "id": "cafe", "name": "Corner Cup"}
    monkeypatch.setattr(discover_ask, "live_rescues", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        discover_ask, "customer_profile", AsyncMock(return_value=(Profile(follows=["bakery"]), []))
    )
    monkeypatch.setattr(discover_ask, "customer_taste", AsyncMock(return_value=Taste()))
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(search=SearchEngine(fixture_embedder, "ob94")))
    )
    body = AskRequest(q="cheaper", lat=1.2847, lng=103.832)
    picks, personal, _, _ = await discover_ask.match_local_shops(
        request,
        body,
        Intent(keywords=["coffee"], sort="price"),
        None,
        body.lat,
        body.lng,
        4000,
        None,
        explain=False,
        shared=[bakery, cafe],
    )
    groups = discover_ask.assemble_groups(personal, picks, [])
    assert [p.id for g in groups for p in g.places] == ["cafe", "bakery"]
    assert picks[1].reasons == ["followed"]


def test_ob94_price_sort_without_subject_uses_cheapest_available_menu_item() -> None:
    menu = [
        product("Cake", 400),
        product("Tea", 200),
        product("Coffee", 300),
        {**product("Sold out", 50), "available": False},
        product("Toast", 100),
    ]
    pick = shop_pick(shop(menu), Intent(sort="price"), 1.28, 103.83)
    assert pick is not None
    assert min_price(pick) == 100 and pick.items[0].name == "Toast"


def test_ob94_ask_api_followup_and_bread_prices_match_discovery(tmp_path, monkeypatch) -> None:
    bakery = shop(
        [
            product("Croissant", 190, "Bakes"),
            product("Sourdough loaf", 610, "Bread"),
            product("Iced coffee", 300),
        ]
    )
    cafe = {
        **shop([product("Coffee", 200), product("Banana cake", 220, "Bakes")]),
        "id": "cafe",
        "name": "Corner Cup",
        "category": "Cafe",
    }
    monkeypatch.setattr(
        discover_ask,
        "live_rescues",
        AsyncMock(
            return_value=[
                SimpleNamespace(
                    shop_id="bakery",
                    item="Croissant",
                    price=133,
                    was_price=190,
                    pickup_end=9999999999,
                    demo=True,
                )
            ]
        ),
    )
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        monkeypatch.setattr(app.state.merchant, "shared_shops", lambda: [bakery, cafe])
        here = {"lat": 1.2847, "lng": 103.832}
        first = client.post("/api/v1/discover/ask", json={"q": "coffee", **here}).json()
        follow = client.post(
            "/api/v1/discover/ask",
            json={"q": "Cheaper?", "refine": "price", "context": first["intent"], **here},
        ).json()
        ours = [p for g in follow["groups"] for p in g["places"] if p["source"] == "chalkboard"]
        assert [(p["id"], p["matched"][0]["price"]) for p in ours] == [
            ("cafe", 200),
            ("bakery", 300),
        ]
        nearby = client.get("/api/v1/discover", params=here).json()["places"]
        listed = {p["id"]: p["items"] for p in nearby if p["source"] == "chalkboard"}
        bread = client.post("/api/v1/discover/ask", json={"q": "bread open now", **here}).json()
        ours = [p for g in bread["groups"] for p in g["places"] if p["source"] == "chalkboard"]
        assert [p["id"] for p in ours] == ["bakery"]
        headline = ours[0]["matched"][0]
        assert headline == listed["bakery"][0]
        assert (headline["name"], headline["price"]) == ("Croissant", 190)
