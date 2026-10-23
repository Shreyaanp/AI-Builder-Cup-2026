"""Customer Ask answers are relevant retail results (audit A-1, A-2, A-3, A-10, A-13; OB-104).

Each test reproduces one audit finding with the shops it was seen with: wholesale suppliers in a
customer's answer, "cheapest" ranking salt above chai, nonsense or "pharmacy" matching groceries
by loose meaning, an English budget question carrying question words, and a shop listed twice in
"Similar nearby".
"""

import math
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app import discover_ask
from app.discover_ask import Intent, keyword_intent
from app.main import create_app
from app.merchant import MerchantRepository
from app.search_engine import DIMENSIONS, SearchEngine, fixture_vector
from tests.test_discover import settings, shared_shop

pytest_plugins = ("tests.test_merchant_store",)  # store fixture covers both adapters

# Indiranagar, Bengaluru (the audit's area).
HERE = {"lat": 12.9718, "lng": 77.6412}


def east(metres: float) -> dict[str, float]:
    """A point this many metres east of HERE."""
    return {
        "lat": HERE["lat"],
        "lng": HERE["lng"] + metres / (111_320 * math.cos(math.radians(HERE["lat"]))),
    }


def shop(
    sid: str,
    name: str,
    category: str,
    metres: float,
    products: list[tuple[str, int, str]],
    **extra: Any,
) -> dict[str, Any]:
    """A shared shop as MerchantRepository.shared_shops returns it (prices in paise)."""
    return {
        "id": sid,
        "name": name,
        "category": category,
        "location": "Indiranagar",
        **east(metres),
        "timezone": "Asia/Kolkata",
        "hours": "",
        "phone": "",
        "currency": "INR",
        "stamps_needed": 8,
        "stamps_enabled": False,
        "facts": {},
        "products": [
            {"name": n, "price": price, "unit": unit, "available": True, "category": ""}
            for n, price, unit in products
        ],
        **extra,
    }


LANTERN = shop(
    "demo-story-bengaluru-chai",
    "Lantern Chai Corner (Demo)",
    "Tea stall",
    470,
    [("Masala chai", 2000, "cup"), ("Bun maska", 3500, "piece")],
    demo=True,
)
KAPI = shop(
    "demo-bengaluru-kapi",
    "Kapi & Ketli (Demo)",
    "Cafe",
    550,
    [("Adrak Elaichi Chai", 1200, "cup"), ("Filter coffee", 3000, "cup")],
    demo=True,
)
COURTYARD = shop(
    "demo-bengaluru-courtyard",
    "Courtyard Filter House (Demo)",
    "Cafe",
    900,
    [("Masala chai", 3500, "cup"), ("Filter coffee", 4000, "cup")],
    demo=True,
)
# A tea-themed shop with nothing named chai: close to "masala chai" as a whole, but its cheap
# headline (sugar) answers nothing that was asked.
TEA_HOUSE = shop(
    "demo-bengaluru-tea-house",
    "Nilgiri Tea House (Demo)",
    "Tea shop",
    300,
    [("Sugar", 500, "kg"), ("Glucose biscuits", 1000, "pack")],
    demo=True,
)
# Generated demo wholesalers (sourcing.py) and a real wholesaler: shops buy from them.
MALNAD = shop(
    "demo-sup-0123456789-3",
    "Malnad Coffee & Tea Traders",
    "coffee",
    2200,
    [("Coffee beans", 69700, "kg"), ("Sugar", 4750, "kg"), ("Tea leaves", 28000, "kg")],
    demo=True,
    supplier=True,
    supplies=["coffee", "tea"],
    min_order="",
)
GANESH = shop(
    "demo-sup-0123456789-0",
    "Shree Ganesh Wholesale Traders",
    "Wholesale",
    1400,
    [("Lentils (dal)", 6900, "kg"), ("Salt", 1950, "kg"), ("Masala chai premix", 900, "kg")],
    demo=True,
    supplier=True,
    supplies=["grocery"],
    min_order="",
)
REAL_WHOLESALER = shop(
    "real-wholesaler",
    "Indiranagar Coffee Wholesale",
    "Wholesale",
    100,
    [("Coffee", 50000, "kg")],
    supplier=True,
    supplies=["coffee"],
    min_order="",
)
CAFE = shop(
    "corner-cafe",
    "Corner Brew Cafe",
    "Cafe",
    30,
    [("Cold coffee", 9000, "glass")],
)
KIRANA = shop(
    "corner-kirana",
    "Corner Kirana",
    "Grocery",
    200,
    [("Salt", 1950, "kg"), ("Sugar", 4100, "kg"), ("Milk", 3000, "litre")],
)
# The same kirana seeded twice (tour story and demo catalogue), at different prices.
KIRANA_STORY = shop(
    "demo-story-bengaluru-kirana",
    "Little Lantern Kirana (Demo)",
    "Grocery / Kirana",
    740,
    [("Tea leaves", 28000, "kg"), ("Masala chai premix", 9000, "kg")],
    demo=True,
)
KIRANA_CATALOGUE = shop(
    "demo-bengaluru-indiranagar-kirana",
    "Little Lantern Kirana (Demo)",
    "Grocery / Kirana",
    640,
    [("Tea leaves", 14000, "kg"), ("Masala chai premix", 8000, "kg")],
    demo=True,
)


@pytest.fixture
def ask_client(store: MerchantRepository, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """An offline app whose shared shops are exactly the ones a test sets."""
    shared_shop(store)
    shops: list[dict[str, Any]] = []
    monkeypatch.setattr(store, "shared_shops", lambda: list(shops))
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        client.shops = shops  # type: ignore[attr-defined]
        client.app_state = app.state  # type: ignore[attr-defined]
        yield client


def ask(client: TestClient, q: str, **extra: Any) -> dict[str, Any]:
    response = client.post("/api/v1/discover/ask", json={"q": q, **HERE, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def ours(answer: dict[str, Any]) -> list[dict[str, Any]]:
    """Chalkboard results in the order the customer sees them."""
    return [
        p
        for g in answer["groups"]
        if g["id"] in {"for_you", "best"}
        for p in g["places"]
        if p["source"] == "chalkboard"
    ]


def headline(place: dict[str, Any]) -> tuple[str, int]:
    item = (place["matched"] or place["items"])[0]
    return item["name"], item["price"]


def test_a10_wholesale_suppliers_never_reach_customers(ask_client: TestClient) -> None:
    ask_client.shops[:] = [MALNAD, GANESH, REAL_WHOLESALER, CAFE, LANTERN, KAPI]
    suppliers = {MALNAD["id"], GANESH["id"], REAL_WHOLESALER["id"]}
    for q in ["coffee", "sugar", "cheapest masala chai", "tea leaves", "lentils"]:
        found = {p["id"] for g in ask(ask_client, q)["groups"] for p in g["places"]}
        assert not found & suppliers, q
    listed = ask_client.get("/api/v1/discover", params={**HERE, "radius": 4000}).json()
    assert not {p["id"] for p in listed["places"]} & suppliers
    similar = ask_client.get(
        "/api/v1/discover/similar", params={"shop": CAFE["id"], "radius": 4000}
    ).json()
    assert not {p["id"] for p in similar["places"]} & suppliers


def test_ob104_coffee_near_me_puts_the_cafe_nearby_first(ask_client: TestClient) -> None:
    ask_client.shops[:] = [MALNAD, REAL_WHOLESALER, KAPI, CAFE]
    answer = ask(ask_client, "Coffee near me")
    assert answer["intent"]["sort"] == "distance"
    assert [p["id"] for p in ours(answer)] == [CAFE["id"], KAPI["id"]]


def test_a1_cheapest_ranks_the_asked_item_by_its_price(ask_client: TestClient) -> None:
    ask_client.shops[:] = [MALNAD, GANESH, TEA_HOUSE, COURTYARD, LANTERN, KAPI]
    answer = ask(ask_client, "cheapest masala chai")
    assert answer["intent"]["sort"] == "price"
    places = ours(answer)
    # The shops selling chai, cheapest chai first; nothing else is ranked on a sugar price.
    assert [headline(p) for p in places[:3]] == [
        ("Adrak Elaichi Chai", 1200),
        ("Masala chai", 2000),
        ("Masala chai", 3500),
    ]
    assert all(p["id"] != TEA_HOUSE["id"] for p in places[:3])


def live_like_engine() -> SearchEngine:
    """Real embeddings' shape: unrelated texts still share a large common component (raw cosine
    about 0.6), calibrated with the live floor. The fixture alone scores unrelated texts at 0."""
    common = np.zeros(DIMENSIONS, dtype=np.float32)
    common[0] = 1.0

    def embed(texts: list[str]) -> list[list[float]]:
        out = []
        for text in texts:
            vector = np.asarray(fixture_vector(text), dtype=np.float32)
            vector[0] = 0.0
            vector = vector / (np.linalg.norm(vector) or 1.0) + math.sqrt(1.5) * common
            out.append((vector / np.linalg.norm(vector)).tolist())
        return out

    return SearchEngine(embed, "live-like", live=True)


def test_a2_no_match_for_nonsense_or_what_no_shop_here_sells(ask_client: TestClient) -> None:
    ask_client.shops[:] = [KIRANA, LANTERN]
    ask_client.app_state.search = live_like_engine()  # type: ignore[attr-defined]
    # What is sold here is still found by its own words.
    assert [p["id"] for p in ours(ask(ask_client, "milk"))] == [KIRANA["id"]]
    # Nothing here is a pharmacy: salt and sugar are not an answer.
    assert ours(ask(ask_client, "pharmacy open now")) == []
    # Nonsense gets an honest "no match", from us and from Google.
    assert ask(ask_client, "asdkjh qwe zzz")["groups"] == []


def test_a2_a_model_reading_with_no_subject_is_no_match(
    ask_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ask_client.shops[:] = [KIRANA, LANTERN]

    async def nothing(request: Any, body: Any) -> Intent:
        return Intent(summary="I could not tell what you are looking for.")

    monkeypatch.setattr(discover_ask, "ai_intent", nothing)
    assert ask(ask_client, "asdkjh qwe zzz")["groups"] == []
    # A filter on its own is a request: every open shop nearby.
    open_now = ask(ask_client, "open now", refine="open")
    assert {p["id"] for p in ours(open_now)} == {KIRANA["id"], LANTERN["id"]}


def test_a3_english_budget_question_finds_the_same_shops_as_hindi(
    ask_client: TestClient,
) -> None:
    english = keyword_intent("Where can I get masala chai under 30 rupees?")
    assert english.keywords == ["masala", "chai"] and english.max_price == 30
    hindi = keyword_intent("30 रुपये से कम में मसाला चाय कहाँ मिलेगी?")
    assert hindi.max_price == 30
    ask_client.shops[:] = [COURTYARD, LANTERN, KAPI, GANESH]
    found = ours(ask(ask_client, "Where can I get masala chai under 30 rupees?"))
    assert {p["id"] for p in found} == {LANTERN["id"], KAPI["id"]}


def test_a13_similar_nearby_lists_each_shop_once(ask_client: TestClient) -> None:
    ask_client.shops[:] = [LANTERN, KIRANA_STORY, KIRANA_CATALOGUE, KAPI, COURTYARD]
    similar = ask_client.get(
        "/api/v1/discover/similar", params={"shop": LANTERN["id"], "radius": 4000}
    ).json()
    names = [p["name"] for p in similar["places"]]
    assert names.count("Little Lantern Kirana (Demo)") == 1
    assert len(names) == len(set(names))
    # The anchor's own other copy never shows beside it.
    ask_client.shops.append({**LANTERN, "id": "demo-tour-lantern", "name": "Lantern Chai Corner"})
    again = ask_client.get(
        "/api/v1/discover/similar", params={"shop": LANTERN["id"], "radius": 4000}
    ).json()
    assert all(not p["name"].startswith("Lantern Chai Corner") for p in again["places"])


def test_a1_a_price_word_beats_near_me() -> None:
    from app.discover_ask import AskRequest, resolve_intent_refinements

    def read(q: str) -> str:
        body = AskRequest(q=q, **HERE)
        return resolve_intent_refinements(body, keyword_intent(q)).sort

    # "near me" only says where when the customer asked for it cheaper.
    assert read("Cheap vegetarian breakfast near me") == "price"
    assert read("cheapest masala chai nearby") == "price"
    assert read("Coffee near me") == "distance"
    # An explicit "closest" still asks for distance.
    assert read("closest chai") == "distance"


def test_a1_a_chip_label_is_not_reread(ask_client: TestClient) -> None:
    ask_client.shops[:] = [TEA_HOUSE, COURTYARD, LANTERN, KAPI]
    first = ask(ask_client, "cheapest masala chai")
    assert first["intent"]["sort"] == "price"
    # The app's own "Open now nearby" chip refines to open only; cheapest first stays.
    chip = ask(ask_client, "Open now nearby", context=first["intent"], refine="open")
    assert chip["intent"]["sort"] == "price" and chip["intent"]["open_now"]
    assert chip["intent"]["keywords"] == ["masala", "chai"]
    assert [headline(p) for p in ours(chip)[:3]] == [
        ("Adrak Elaichi Chai", 1200),
        ("Masala chai", 2000),
        ("Masala chai", 3500),
    ]
