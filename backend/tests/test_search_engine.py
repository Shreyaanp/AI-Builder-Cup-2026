"""The shared search engine: weights, embeddings cache, personal picks, sourcing reuse."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import numpy as np
import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.community import SqliteDocuments
from app.main import create_app
from app.search_engine import (
    WEIGHTS,
    Because,
    Components,
    Explainer,
    Relevance,
    SearchEngine,
    Taste,
    VectorCache,
    blend,
    fixture_embedder,
    fixture_vector,
    fresh_days,
    parts,
    popularity,
)
from app.settings import Settings
from app.sourcing import ShopPin, candidates
from scripts.seed_demo_shops import seed
from tests.test_community import PROJECT, requires_emulator, sign_in

INDIRANAGAR = {"lat": 12.9718, "lng": 77.6412}
CAFE = "demo-bengaluru-indiranagar-coffee"
KIRANA = "demo-bengaluru-indiranagar-kirana"
BAKERY = "demo-bengaluru-koramangala-bakery"
TAILOR = "demo-bengaluru-koramangala-tailor"


def shop(bid: str, name: str, category: str, *items: str, lat: float = 1.0) -> dict[str, Any]:
    return {
        "id": bid,
        "name": name,
        "category": category,
        "lat": lat,
        "lng": 1.0,
        "products": [
            {"name": item, "price": 100, "unit": "cup", "available": True} for item in items
        ],
    }


# --- Weights and ranking --------------------------------------------------------------------


@pytest.mark.parametrize("profile", sorted(WEIGHTS))
def test_weights_live_in_one_place_and_sum_to_one(profile: str) -> None:
    w = WEIGHTS[profile]
    total = sum(v for k, v in vars(w).items() if k != "distance_scale_m")
    assert total == pytest.approx(1.0)
    best = Components(1, 1, 0, True, 1, 0, 1, 1, True)
    assert blend(best, profile) == pytest.approx(1.0)
    nothing = Components(distance_m=1e9, open_now=False, price_fit=0, fresh_days=1e9, popularity=0)
    assert blend(nothing, profile) == 0


def test_each_signal_moves_ranking_the_right_way() -> None:
    base = Components(semantic=0.5, keyword=0.5, distance_m=500)
    better = {
        "semantic": Components(semantic=0.9, keyword=0.5, distance_m=500),
        "keyword": Components(semantic=0.5, keyword=1.0, distance_m=500),
        "distance": Components(semantic=0.5, keyword=0.5, distance_m=100),
        "open_now": Components(semantic=0.5, keyword=0.5, distance_m=500, open_now=True),
        "price": Components(semantic=0.5, keyword=0.5, distance_m=500, price_fit=1.0),
        "fresh": Components(semantic=0.5, keyword=0.5, distance_m=500, fresh_days=0),
        "personal": Components(semantic=0.5, keyword=0.5, distance_m=500, personal=0.8),
        "popular": Components(semantic=0.5, keyword=0.5, distance_m=500, popularity=0.9),
        "deal": Components(semantic=0.5, keyword=0.5, distance_m=500, deal=True),
    }
    for signal, components in better.items():
        assert blend(components) > blend(base), signal
    # Unknown hours, price and freshness are neutral: neither rewarded nor punished.
    closed = Components(semantic=0.5, keyword=0.5, distance_m=500, open_now=False)
    assert blend(closed) < blend(base) < blend(better["open_now"])
    # Meaning and words outweigh a few hundred metres for a customer on foot.
    near_but_wrong = Components(semantic=0.1, keyword=0.0, distance_m=50, open_now=True)
    right_but_further = Components(semantic=0.9, keyword=1.0, distance_m=900, open_now=True)
    assert blend(right_but_further) > blend(near_but_wrong)


def test_sourcing_profile_ignores_taste_and_popularity() -> None:
    plain = Components(semantic=0.6, keyword=1.0, distance_m=2000, price_fit=0.8)
    personal = Components(
        semantic=0.6, keyword=1.0, distance_m=2000, price_fit=0.8, personal=1, popularity=1
    )
    assert blend(plain, "sourcing") == blend(personal, "sourcing")
    # A supplier 2 km away beats one 12 km away at the same price.
    far = Components(semantic=0.6, keyword=1.0, distance_m=12000, price_fit=0.8)
    assert blend(plain, "sourcing") > blend(far, "sourcing")
    assert set(parts(plain, "sourcing")) == set(parts(plain))


def test_popularity_and_freshness_signals() -> None:
    assert popularity(None, 10) is None and popularity(4.5, 0) is None
    many, few = popularity(4.5, 2000), popularity(4.5, 3)
    assert many is not None and few is not None and many > few
    assert popularity(5.0, 1000) <= 1.0
    from datetime import date

    assert fresh_days("2026-10-10", date(2026, 10, 16)) == 6
    assert fresh_days(None) is None and fresh_days("not a date") is None


# --- Embeddings -----------------------------------------------------------------------------


def cosine(a: str, b: str) -> float:
    return float(np.dot(fixture_vector(a), fixture_vector(b)))


def test_fixture_embedder_groups_meanings_without_a_model() -> None:
    assert cosine("kopi", "latte (Coffee)") > cosine("kopi", "Haircut (Cuts)")
    assert cosine("something sweet", "Banana cake (Cakes)") > cosine("something sweet", "Atta")
    assert cosine("fix my trousers", "Trouser hemming (Alterations)") > 0.3
    assert len(fixture_vector("")) == 768 and not any(fixture_vector(""))


class CountingEmbedder:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def __call__(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        return fixture_embedder(texts)


@pytest.fixture(params=["sqlite", "firestore"])
def documents(request: pytest.FixtureRequest, tmp_path: Path) -> Any:
    if request.param == "sqlite":
        return SqliteDocuments(str(tmp_path / "community.sqlite3"))
    requires_emulator()
    from google.auth.credentials import AnonymousCredentials
    from google.cloud import firestore

    from app.community import FirestoreDocuments

    client = firestore.Client(project=PROJECT, credentials=AnonymousCredentials())
    return FirestoreDocuments(client, "ogoogle_ai_test_" + uuid4().hex)


def test_vectors_are_cached_batched_and_reembedded_only_on_change(documents: Any) -> None:
    embed = CountingEmbedder()
    cache = VectorCache(embed, "m1", documents, calibration=0.0)
    shops = [shop("a", "Kopi Corner", "Cafe", "Kopi", "Toast"), shop("b", "Petals", "Florist")]
    first = cache.shops(shops)
    assert len(embed.calls) == 1  # one batch for both shops and every item
    assert set(first["a"].items) == {"Kopi", "Toast"} and first["b"].shop is not None
    cache.shops(shops)
    assert len(embed.calls) == 1  # nothing changed: nothing embedded
    shops[0]["products"].append({"name": "Teh", "price": 90, "unit": "cup"})
    cache.shops(shops)
    # Only the changed shop text and the new item; unchanged items are never re-sent.
    assert sorted(embed.calls[-1]) == sorted(["Kopi Corner. Cafe. Kopi, Toast, Teh", "Teh"])
    # Another instance (a new Cloud Run container) reads stored vectors instead of embedding.
    again = CountingEmbedder()
    restored = VectorCache(again, "m1", documents, calibration=0.0).shops(shops)
    assert again.calls == [] and set(restored["a"].items) == {"Kopi", "Toast", "Teh"}
    # A different model never reuses another model's vectors.
    other = CountingEmbedder()
    VectorCache(other, "m2", documents, calibration=0.0).shops(shops)
    assert len(other.calls) == 1


def test_queries_are_cached_and_a_failed_embedder_only_drops_meaning() -> None:
    embed = CountingEmbedder()
    cache = VectorCache(embed, "m1", None, calibration=0.0)
    assert cache.query("Kopi ") is cache.query("kopi")
    assert len(embed.calls) == 1

    def broken(texts: list[str]) -> list[list[float]]:
        raise RuntimeError("quota")

    engine = SearchEngine(broken, "m1")
    meaning = engine.relevance("kopi", [shop("a", "Kopi Corner", "Cafe", "Kopi")])
    assert meaning["a"].best == 0.0


def test_live_similarity_is_rescaled_above_the_unrelated_floor() -> None:
    cache = VectorCache(fixture_embedder, "m", None, calibration=0.55)
    a = np.array([1.0, 0.0])
    assert cache.similarity(a, a) == pytest.approx(1.0)
    assert cache.similarity(a, np.array([0.5, 0.866])) == 0.0
    assert cache.similarity(None, a) == 0.0


# --- Personal picks and cold start ----------------------------------------------------------


def test_personal_picks_come_only_from_this_customers_own_signals() -> None:
    engine = SearchEngine(fixture_embedder, "m")
    sharmas = shop("sharma", "Sharma's", "Cafe", "Filter coffee", "Masala chai")
    other_cafe = shop("brew", "Brew Lane", "Cafe", "Latte", "Cappuccino")
    tailor = shop("needle", "Needle Point", "Tailor", "Trouser hemming")
    nearby = [other_cafe, tailor]
    # Zero data: no personal signal at all, so ranking is location, time and popularity.
    assert engine.personal(nearby, Taste(), [sharmas, *nearby]) == {}
    taste = Taste(stamped={"sharma": 3})
    scores = engine.personal(nearby, taste, [sharmas, *nearby])
    value, because = scores["brew"]
    assert because is not None and because.kind == "like_stamped"
    assert because.shop == "Sharma's" and because.item in {"Filter coffee", "Masala chai"}
    assert value > scores["needle"][0]
    # The shop they follow is personal on its own; a past search pulls similar shops up.
    followed = engine.personal([tailor], Taste(follows=["needle"]), nearby)["needle"]
    assert followed[1] is not None and followed[1].kind == "followed"
    asked = engine.personal(nearby, Taste(asked=["coffee"]), nearby)
    assert asked["brew"][0] > asked["needle"][0]
    assert asked["brew"][1] is not None and asked["brew"][1].query == "coffee"


def test_explanations_are_few_cached_and_optional() -> None:
    calls: list[str] = []

    class Models:
        async def generate_content(self, model: str, contents: str, config: Any) -> Any:
            calls.append(contents)
            count = contents.count("- Pick:")
            return SimpleNamespace(text=json.dumps([f"Because you line {i}" for i in range(count)]))

    client = SimpleNamespace(aio=SimpleNamespace(models=Models()))
    explainer = Explainer(lambda: client, "model")
    picks = [
        (f"s{i}", f"Shop {i}", Because(kind="like_stamped", shop="Sharma's", item="Filter coffee"))
        for i in range(5)
    ]
    lines = asyncio.run(explainer.explain(picks, "en"))
    assert len(lines) == Explainer.MAX_PICKS and len(calls) == 1  # top few, one call
    again = asyncio.run(explainer.explain(picks, "en"))
    assert again == lines and len(calls) == 1  # cached: no call per keystroke or repeat
    asyncio.run(explainer.explain(picks, "hi"))
    assert len(calls) == 2  # each language once

    class Down:
        async def generate_content(self, **_: Any) -> Any:
            raise RuntimeError("unavailable")

    offline = Explainer(lambda: SimpleNamespace(aio=SimpleNamespace(models=Down())), "model")
    assert asyncio.run(offline.explain(picks, "en")) == {}


# --- Sourcing reuses the engine ---------------------------------------------------------------


def test_sourcing_matches_by_words_or_by_strong_meaning() -> None:
    pin = ShopPin(1.0, 1.0, False, "SGD", "Asia/Singapore", "", "", "Me", "")
    mill = shop("mill", "Mill", "Wholesale", "Maida 25 kg sack", "Basmati rice") | {
        "supplier": True,
        "currency": "SGD",
    }
    for product in mill["products"]:
        product["unit"] = "kg"
    words = candidates([mill], "me", pin, "flour")
    assert [p["name"] for p in words[0]["products"]] == ["Maida 25 kg sack"]
    weak = {"mill": Relevance(items={"Basmati rice": 0.5})}
    assert [p["name"] for p in candidates([mill], "me", pin, "flour", weak)[0]["products"]] == [
        "Maida 25 kg sack"
    ]
    strong = {"mill": Relevance(items={"Basmati rice": 0.9})}
    found = candidates([mill], "me", pin, "grain", strong)
    assert [p["name"] for p in found[0]["products"]] == ["Basmati rice"]


# --- Over HTTP, on both stores --------------------------------------------------------------


@pytest.fixture(params=["sqlite", "firestore"])
def client(request: pytest.FixtureRequest, tmp_path: Path) -> Any:
    hosted: dict[str, Any] = {}
    if request.param == "firestore":
        requires_emulator()
        hosted = {
            "merchant_backend": "firestore",
            "google_cloud_project": PROJECT,
            "firestore_namespace": "ogoogle_ai_test_" + uuid4().hex,
        }
    app = create_app(
        Settings(
            app_env="test",
            coach_mode="offline",
            v1_enabled=True,
            merchant_database=str(tmp_path / "merchant.sqlite3"),
            recall_path=str(tmp_path / "recall"),
            rate_limits_enabled=False,
            _env_file=None,
            **hosted,
        ),
        InMemorySessionService(),
    )
    with TestClient(app) as test_client:
        seed(test_client.app.state.merchant, "demo-owner", city="bengaluru")
        yield test_client


def ask(client: TestClient, q: str, **extra: Any) -> dict[str, Any]:
    response = client.post(
        "/api/v1/discover/ask", json={"q": q, **INDIRANAGAR, "radius": 8000, **extra}
    )
    assert response.status_code == 200, response.text
    return response.json()


def places(answer: dict[str, Any], group: str | None = None) -> list[dict[str, Any]]:
    return [p for g in answer["groups"] if group in (None, g["id"]) for p in g["places"]]


def test_meaning_finds_what_words_miss(client: TestClient) -> None:
    answer = ask(client, "something sweet")
    assert answer["engine"] == "fixture"  # offline: never a model
    found = {p["id"]: p for p in places(answer, "best")}
    assert CAFE in found and BAKERY in found and TAILOR not in found
    matched = {m["name"] for m in found[BAKERY]["matched"]}
    assert matched & {"Chocolate cake", "Coconut bun", "Khari biscuits"}
    # Filters stay hard: meaning never relaxes a budget.
    assert all(p["id"] != BAKERY for p in places(ask(client, "something sweet under 1")))
    tailor = places(ask(client, "fix my trousers"), "best")
    assert tailor and tailor[0]["id"] == TAILOR


def test_cold_start_then_own_signals_reorder_and_explain(client: TestClient) -> None:
    cold = ask(client, "coffee")
    assert not places(cold, "for_you") and cold["personal"] is None
    # The device's own history: shops opened here are personal even when signed out.
    opened = ask(client, "breakfast", opened=[CAFE])
    mine = places(opened, "for_you")
    assert mine and mine[0]["id"] == CAFE and mine[0]["because"]["kind"] == "opened"
    sign_in(client)
    assert client.put(f"/api/v1/customer/follows/{CAFE}").status_code == 200
    answer = ask(client, "something sweet")
    picks = places(answer, "for_you")
    assert picks and picks[0]["id"] == CAFE and "followed" in picks[0]["reasons"]
    # Liked the café: the bakery (similar food) is a personal pick, with its reason.
    bakery = next((p for p in picks if p["id"] == BAKERY), None)
    assert bakery is not None and bakery["because"]["kind"] == "like_followed"
    assert bakery["because"]["shop"].startswith("Courtyard Filter House")
    assert bakery["why"] is None  # offline: the app words the reason itself


def test_ob160_similar_nearby_for_a_shop_and_an_item(client: TestClient) -> None:
    response = client.get(
        "/api/v1/discover/similar", params={"shop": CAFE, "radius": 8000, **INDIRANAGAR}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "embeddings" and body["engine"] == "fixture"
    ids = [p["id"] for p in body["places"]]
    assert CAFE not in ids and BAKERY in ids and TAILOR not in ids
    item = client.get(
        "/api/v1/discover/similar",
        params={"shop": CAFE, "item": "Banana bread", "radius": 8000},
    ).json()
    top = item["places"][0]
    assert top["id"] == BAKERY and top["item"]["name"] in {
        "Milk bread",
        "Multigrain loaf",
        "Coconut bun",
        "Plum cake",
        "Chocolate cake",
    }
    missing = client.get("/api/v1/discover/similar", params={"shop": "nope"})
    assert missing.status_code == 404


def test_similar_prefers_recommendations_ai_when_switched_on(client: TestClient) -> None:
    class Recs:
        def similar_items(
            self, shop_id: str, item: str | None, limit: int, products: object = ()
        ) -> list[str]:
            return [TAILOR, "unknown-id"]

    client.app.state.search.similar_provider = Recs()
    body = client.get(
        "/api/v1/discover/similar", params={"shop": CAFE, "radius": 8000, **INDIRANAGAR}
    ).json()
    assert body["source"] == "recommendations" and [p["id"] for p in body["places"]] == [TAILOR]


def test_today_order_follows_the_customers_taste(client: TestClient) -> None:
    from app.today import Context, Find, FindShop, score

    def card(bid: str) -> Find:
        return Find(
            id=bid,
            kind="hidden_gem",
            shop=FindShop(id=bid, name=bid, distance_m=400, walk_min=5),
            source="demo",
            demo=True,
            action="go",
            score=0,
        )

    plain = Context(lat=0, lng=0, now=0)
    assert score(card("a"), plain, 1.0) == score(card("b"), plain, 1.0)
    liked = Context(lat=0, lng=0, now=0, affinity={"b": 0.8})
    assert score(card("b"), liked, 1.0) > score(card("a"), liked, 1.0)
    # Over HTTP: a signed-out feed with opened shops still loads (taste only reorders).
    feed = client.get(
        "/api/v1/public/today",
        params={**INDIRANAGAR, "tz": "Asia/Kolkata", "currency": "INR", "opened": CAFE},
    )
    assert feed.status_code == 200, feed.text


def test_supplier_search_calls_the_same_engine(client: TestClient) -> None:
    from app import coordinator

    assert coordinator.search_engine is client.app.state.search


def test_item_recall_relaxes_only_relative_to_the_best_match_nearby() -> None:
    from app.search_engine import ITEM_RECALL, ITEM_RECALL_MIN, RECALL_MARGIN, item_recall

    strong = {"a": Relevance(items={"Kopi": 0.9})}
    assert item_recall(strong) == ITEM_RECALL
    weak = {"a": Relevance(items={"Filter coffee": 0.4}), "b": Relevance(items={"Hair": 0.1})}
    assert item_recall(weak) == pytest.approx(0.4 - RECALL_MARGIN)
    assert item_recall({"a": Relevance(items={"Hair": 0.2})}) == ITEM_RECALL_MIN
    assert item_recall({}) == ITEM_RECALL_MIN
