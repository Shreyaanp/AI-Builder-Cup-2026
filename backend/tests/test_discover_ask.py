from pathlib import Path

from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.discover_ask import keyword_intent
from app.main import create_app
from app.merchant import MerchantRepository
from tests.test_discover import settings, shared_shop

pytest_plugins = ("tests.test_merchant_store",)  # store fixture covers both adapters

TIONG_BAHRU = {"lat": 1.2847, "lng": 103.832}


def test_keyword_intent_reads_budget_diet_and_category() -> None:
    intent = keyword_intent("Cheap vegetarian coffee under 2.50 open now")
    assert intent.max_price == 2.5
    assert intent.vegetarian and intent.open_now and not intent.halal
    assert intent.category == "coffee"
    assert "coffee" in intent.keywords and "cheap" not in intent.keywords


def test_keyword_intent_reads_locally_made() -> None:
    for q in ["homemade cookies", "locally made soap", "hand-made bags", "local makers"]:
        assert keyword_intent(q).locally_made, q
    intent = keyword_intent("homemade cookies")
    assert intent.keywords == ["cookies"]
    assert not keyword_intent("cookies near me").locally_made


def test_ask_matches_real_menu_items_prices_and_facts(
    store: MerchantRepository, tmp_path: Path
) -> None:
    bid = shared_shop(store)
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store

        def ask(q: str) -> dict:
            response = client.post("/api/v1/discover/ask", json={"q": q, **TIONG_BAHRU})
            assert response.status_code == 200, response.text
            return response.json()

        found = ask("kopi under 2")
        assert found["mode"] == "keywords"  # offline: deterministic parser
        best = next(g for g in found["groups"] if g["id"] == "best")["places"]
        assert best[0]["id"] == bid
        assert [item["name"] for item in best[0]["matched"]] == ["Kopi"]  # 180 ≤ 200

        # A sold-out item is never offered as a match.
        teh = ask("teh tarik")
        offered = [m["name"] for g in teh["groups"] for p in g["places"] for m in p["matched"]]
        assert "Teh tarik" not in offered
        # Halal is only claimed from the shop's own confirmed facts (none here).
        halal = ask("halal kopi")
        assert all(p["id"] != bid for g in halal["groups"] for p in g["places"])
        # Too expensive for the budget: no match from this shop.
        cheap = ask("toast under 1")
        assert all(p["id"] != bid for g in cheap["groups"] for p in g["places"])
        # "Locally made" only matches shops whose owner said so (not this one).
        local = ask("homemade kopi")
        assert all(p["id"] != bid for g in local["groups"] for p in g["places"])


def test_follow_up_keeps_the_subject_and_adds_the_refinement() -> None:
    from app.discover_ask import follow_up

    first = keyword_intent("kopi")
    cheaper = follow_up("cheaper?", first, keyword_intent("cheaper?"))
    assert cheaper.keywords == ["kopi"] and cheaper.sort == "price"
    opened = follow_up("open now?", cheaper, keyword_intent("open now?"))
    assert opened.keywords == ["kopi"] and opened.open_now and opened.sort == "price"
    station = follow_up("near the MRT?", opened, keyword_intent("near the MRT?"))
    assert station.near == "transit" and station.open_now and station.keywords == ["kopi"]
    # A new subject starts a new search but keeps dietary needs.
    veg = keyword_intent("vegetarian kopi")
    bread = follow_up("what about bread?", veg, keyword_intent("what about bread?"))
    assert bread.keywords == ["bread"] and bread.vegetarian
    # Refinements in other supported languages.
    assert follow_up("सस्ता?", first, keyword_intent("सस्ता?")).sort == "price"
    assert follow_up("更便宜的", first, keyword_intent("更便宜的")).sort == "price"


def test_ask_follow_ups_reorder_and_measure_from_the_station(
    store: MerchantRepository, tmp_path: Path
) -> None:
    near = shared_shop(store, lat=1.2862)  # beside Tiong Bahru MRT
    far = shared_shop(store, lat=1.2965)
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        first = client.post("/api/v1/discover/ask", json={"q": "kopi", **TIONG_BAHRU}).json()
        assert first["anchor"] is None
        follow = client.post(
            "/api/v1/discover/ask",
            json={"q": "near the MRT?", "context": first["intent"], **TIONG_BAHRU},
        )
        assert follow.status_code == 200, follow.text
        body = follow.json()
        assert body["intent"]["keywords"] == ["kopi"] and body["intent"]["near"] == "transit"
        # Offline: approximate station position, labelled demo map data.
        assert body["anchor"] == {
            "name": "Tiong Bahru MRT",
            "lat": 1.28618,
            "lng": 103.82696,
            "demo": True,
        }
        best = next(g for g in body["groups"] if g["id"] == "best")["places"]
        ids = [p["id"] for p in best]
        assert near in ids and far not in ids  # 1 km walk of the station only
        assert best[0]["distance_m"] < 600
        cheaper = client.post(
            "/api/v1/discover/ask",
            json={"q": "cheaper", "context": first["intent"], **TIONG_BAHRU},
        ).json()
        assert cheaper["intent"]["sort"] == "price"
        assert all(
            not p["matched"] or p["matched"][0]["name"] == "Kopi"
            for g in cheaper["groups"]
            for p in g["places"]
        )


def test_suggestions_come_from_the_area_shops(store: MerchantRepository, tmp_path: Path) -> None:
    shared_shop(store)
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        here = client.get("/api/v1/discover/suggest", params=TIONG_BAHRU).json()
        assert here["shops"] == 1
        assert "Kopi" in here["items"] and "Teh tarik" not in here["items"]  # sold out
        empty = client.get("/api/v1/discover/suggest", params={"lat": 12.97, "lng": 77.59}).json()
        assert empty == {"items": [], "shops": 0, "open_now": 0, "locally_made": 0, "deals": 0}


def test_a_follow_up_chip_refines_in_any_language(
    store: MerchantRepository, tmp_path: Path
) -> None:
    shared_shop(store)
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        first = client.post("/api/v1/discover/ask", json={"q": "kopi", **TIONG_BAHRU}).json()
        for refine, check in [
            ("price", lambda i: i["sort"] == "price"),
            ("distance", lambda i: i["sort"] == "distance"),
            ("transit", lambda i: i["near"] == "transit"),
            ("open", lambda i: i["open_now"]),
            ("deals", lambda i: i["deals"]),
        ]:
            body = {"q": "ஏதாவது", "context": first["intent"], "refine": refine, **TIONG_BAHRU}
            intent = client.post("/api/v1/discover/ask", json=body).json()["intent"]
            assert check(intent) and intent["keywords"] == ["kopi"], refine


def test_a_first_chip_is_a_filter_not_a_keyword(store: MerchantRepository, tmp_path: Path) -> None:
    bid = shared_shop(store)
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        body = {"q": "இப்போது திறந்தவை", "refine": "open", **TIONG_BAHRU}
        answer = client.post("/api/v1/discover/ask", json=body).json()
        assert answer["intent"]["keywords"] == [] and answer["intent"]["open_now"]
        local = {"q": "உள்ளூர் தயாரிப்பு", "refine": "local", **TIONG_BAHRU}
        made = client.post("/api/v1/discover/ask", json=local).json()
        assert made["intent"]["locally_made"]
        assert all(p["id"] != bid for g in made["groups"] for p in g["places"])  # not said


def test_ask_stream_emits_instant_and_complete_events(
    store: MerchantRepository, tmp_path: Path
) -> None:
    bid = shared_shop(store)
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        response = client.post(
            "/api/v1/discover/ask",
            json={"q": "kopi", **TIONG_BAHRU},
            headers={"Accept": "text/event-stream"},
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        text = response.text
        assert "event: instant" in text
        assert "event: complete" in text
        assert bid in text

