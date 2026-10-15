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
