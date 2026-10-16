import asyncio
from pathlib import Path

from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.main import create_app
from app.shop_language import GLOSSARY, LANGUAGES, ShopTranslator
from tests.test_discover import settings

INDIRANAGAR = {"lat": 12.9719, "lng": 77.6412}


def test_glossary_covers_every_customer_language() -> None:
    for term, words in GLOSSARY.items():
        assert set(words) == set(LANGUAGES), term
        assert all(word.strip() for word in words.values()), term


def test_misses_of_many_shops_are_one_cached_batch(tmp_path: Path) -> None:
    calls: list[tuple[str, list[str]]] = []

    async def model(language: str, texts: list[str]) -> list[str]:
        calls.append((language, texts))
        return [f"{language}:{text}" for text in texts]

    async def run() -> None:
        translator = ShopTranslator(settings(tmp_path), model)
        wanted = {
            "shop-a": ["Bakery", "Grinds its coffee at 6am", "Chai & Filter Coffee"],
            "shop-b": ["Chai & Filter Coffee", "Florist"],
        }
        found = await translator.translate("ta", wanted)
        # Glossary words never reach the model; the rest go out once, deduplicated.
        assert found["shop-a"]["Bakery"] == "பேக்கரி"
        assert found["shop-b"]["Florist"] == "பூக்கடை"
        assert found["shop-a"]["Chai & Filter Coffee"] == "ta:Chai & Filter Coffee"
        assert calls == [("ta", ["Chai & Filter Coffee", "Grinds its coffee at 6am"])]
        # A second visit (any page) is served from the per-shop cache.
        again = await translator.translate("ta", wanted)
        assert again == found
        assert len(calls) == 1
        # Another language is its own entry; English and unknown tags never translate.
        await translator.translate("hi", {"shop-a": ["Grinds its coffee at 6am"]})
        assert len(calls) == 2
        assert await translator.translate("en", wanted) == {"shop-a": {}, "shop-b": {}}
        assert await translator.translate("xx", wanted) == {"shop-a": {}, "shop-b": {}}

    asyncio.run(run())


def test_a_slow_model_never_holds_the_page(tmp_path: Path) -> None:
    release = asyncio.Event()

    async def model(language: str, texts: list[str]) -> list[str]:
        await release.wait()
        return [f"{language}:{text}" for text in texts]

    async def run() -> None:
        translator = ShopTranslator(settings(tmp_path), model)
        first = await translator.translate("ja", {"s": ["Hand-pulled noodles"]}, wait=0.05)
        assert first == {"s": {}}
        release.set()
        await asyncio.sleep(0.01)
        # The call finished in the background and the next visitor gets it at once.
        later = await translator.translate("ja", {"s": ["Hand-pulled noodles"]}, wait=0)
        assert later == {"s": {"Hand-pulled noodles": "ja:Hand-pulled noodles"}}

    asyncio.run(run())


def test_failures_back_off_instead_of_retrying_every_page(tmp_path: Path) -> None:
    calls = 0

    async def model(language: str, texts: list[str]) -> list[str]:
        nonlocal calls
        calls += 1
        raise RuntimeError("quota")

    async def run() -> None:
        translator = ShopTranslator(settings(tmp_path), model)
        for _ in range(3):
            assert await translator.translate("ko", {"s": ["Seasonal soups"]}) == {"s": {}}
        assert calls == 1

    asyncio.run(run())


def test_demo_shop_page_reads_in_the_customer_language(tmp_path: Path) -> None:
    config = settings(tmp_path).model_copy(
        update={"rate_limits_enabled": False, "demo_world_enabled": True}
    )
    app = create_app(config, InMemorySessionService())
    with TestClient(app) as client:
        body = {**INDIRANAGAR, "currency": "INR", "timezone": "Asia/Kolkata", "place": "X"}
        ids = client.post("/api/v1/demo/world", json=body).json()["shop_ids"]
        # Sunrise Bakehouse: Bakery, sections Bakes / Bread / Drinks.
        english = client.get(f"/api/v1/public/shops/{ids[1]}").json()
        tamil = client.get(f"/api/v1/public/shops/{ids[1]}", params={"lang": "ta"}).json()
        assert english["category"] == "Bakery" and "language" not in english
        assert tamil["language"] == "ta"
        assert tamil["category"] == "பேக்கரி"
        assert {p["category"] for p in tamil["products"]} >= {"சுட்ட பண்டங்கள்", "ரொட்டி"}
        # Owner-written item names stay exactly as written.
        assert [p["name"] for p in tamil["products"]] == [p["name"] for p in english["products"]]
        labels = {fact["label"] for fact in tamil["facts"]["custom"]}
        assert "மாதிரித் தரவு" in labels
        # Ask results name the category in the customer's language too.
        ask = client.post(
            "/api/v1/discover/ask", json={"q": "croissant", "language": "hi", **INDIRANAGAR}
        ).json()
        categories = {p["category"] for g in ask["groups"] for p in g["places"]}
        assert "बेकरी" in categories
        bad = client.get(f"/api/v1/public/shops/{ids[1]}", params={"lang": "<script>"})
        assert bad.status_code == 422
