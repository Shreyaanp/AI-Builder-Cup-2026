"""OB-273: link previews and search engines read the head and robots files the server writes."""

import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.frontend import area_of
from app.main import create_app
from app.merchant import (
    BusinessFields,
    MerchantRepository,
    MerchantStore,
    ProductFields,
    ProposalRequest,
)
from app.settings import Settings
from tests.pins import SHOP_PIN
from tests.test_merchant_store import store as store

INDEX = (
    "<!doctype html><html><head><title>Old</title>"
    '<meta name="description" content="old" /></head><body></body></html>'
)
WHATSAPP = {"User-Agent": "WhatsApp/2.23.20.0"}
FACEBOOK = {"User-Agent": "facebookexternalhit/1.1"}
ROBOTS = 'name="robots" content="noindex, nofollow"'
BUSINESS = {"Host": "business.chalkboard.example"}
RUN_APP = {"Host": "chalkboard-abc123-as.a.run.app"}
HOME_ADDRESS = "Block 412 Bedok North Ave 2 #05-123, Singapore 460412"


class Shops:
    def __init__(self, shops: dict[str, dict[str, Any]]) -> None:
        self.shops = shops

    def public_shop(self, bid: str) -> dict[str, Any] | None:
        return self.shops.get(bid)


@pytest.fixture
def client(tmp_path: Path) -> Any:
    (tmp_path / "index.html").write_text(INDEX)
    settings = Settings(app_env="test", frontend_dist=str(tmp_path), _env_file=None)
    with TestClient(create_app(settings, InMemorySessionService())) as test_client:
        test_client.app.state.merchant = Shops(  # type: ignore[attr-defined]
            {
                "bakery": {
                    "id": "bakery",
                    "name": 'Asha "Fresh" Bakery',
                    "location": "Tiong Bahru",
                    "gallery": ["abc123"],
                },
                "plain": {"id": "plain", "name": "Plain Shop", "location": "", "gallery": []},
                "sample": {
                    "id": "sample",
                    "name": "Sample Kopi",
                    "location": "1 Demo Lane, Indiranagar, Bengaluru (fictional address)",
                    "gallery": [],
                    "demo": True,
                },
            }
        )
        yield test_client


def shop_with(store: MerchantStore, name: str, location: str) -> str:
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(name=name, location=location, **SHOP_PIN),
            products=[ProductFields(name="Kaya toast", price=240, unit="set")],
        ),
    )
    return str(store.commit("alice", proposal["id"], proposal["digest"])["business_id"])


@pytest.fixture
def real(tmp_path: Path) -> Any:
    """The real SQLite store's public shop lookup, not a stub."""
    (tmp_path / "index.html").write_text(INDEX)
    settings = Settings(
        app_env="test",
        coach_mode="offline",
        v1_enabled=True,
        frontend_dist=str(tmp_path),
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        _env_file=None,
    )
    with TestClient(create_app(settings, InMemorySessionService())) as test_client:
        yield test_client


def test_ob_273_shop_page_preview_names_the_shop_area_and_photo(client: TestClient) -> None:
    for agent in (WHATSAPP, FACEBOOK):
        page = client.get("/explore/s/bakery", headers={**agent, "Host": "chalkboard.example"})
        assert page.status_code == 200
        html = page.text
        assert "<title>Asha &quot;Fresh&quot; Bakery — Tiong Bahru</title>" in html
        assert 'property="og:title" content="Asha &quot;Fresh&quot; Bakery — Tiong Bahru"' in html
        assert "Tiong Bahru" in html
        assert (
            'property="og:image" content="http://chalkboard.example/api/v1/public/shops/'
            'bakery/photos/abc123.jpg"'
        ) in html
        assert 'property="og:url" content="http://chalkboard.example/explore/s/bakery"' in html
        assert 'name="twitter:card" content="summary_large_image"' in html
        assert "<title>Old</title>" not in html
        assert 'content="old"' not in html
        assert html.count("<title>") == 1
        assert "noindex" not in html


def test_ob_273_shop_without_photo_uses_the_app_icon_and_unknown_shop_is_untouched(
    client: TestClient,
) -> None:
    html = client.get("/s/plain").text
    assert "<title>Plain Shop</title>" in html
    assert "/icons/customer-512.png" in html
    assert 'name="twitter:card" content="summary"' in html
    assert client.get("/explore/s/nobody").text == INDEX


@pytest.mark.parametrize(
    ("location", "area"),
    [
        (HOME_ADDRESS, "Singapore"),
        ("412 Bedok North Ave 2, #05-123, Singapore 460412", "Singapore"),
        ("Bedok North, Singapore", "Bedok North, Singapore"),
        ("12-2-831/A, Tolichowki, Hyderabad, Telangana 500008, India", "Tolichowki, Hyderabad"),
        ("Flat 3B, Road No. 12, Banjara Hills, Hyderabad, India", "Banjara Hills, Hyderabad"),
        ("1 Demo Lane, Indiranagar, Bengaluru (fictional address)", "Indiranagar, Bengaluru"),
        ("Tiong Bahru", "Tiong Bahru"),
        ("MG Road", ""),
        ("Unit 5, 22 Baker Street", ""),
        ("", ""),
    ],
)  # fmt: skip
def test_ob_273_preview_area_is_locality_and_city_only(location: str, area: str) -> None:
    assert area_of(location) == area


def test_ob_273_real_shop_with_a_full_address_shows_only_its_area(real: TestClient) -> None:
    store = real.app.state.merchant  # type: ignore[attr-defined]
    bid = shop_with(store, "Meena Home Bakes", HOME_ADDRESS)
    hidden = real.get(f"/explore/s/{bid}", headers=WHATSAPP)
    assert hidden.text == INDEX  # not shared yet: nothing about the shop at all
    assert "Meena" not in hidden.text
    store.share("alice", bid, True)
    html = real.get(f"/explore/s/{bid}", headers=WHATSAPP).text
    assert "<title>Meena Home Bakes — Singapore</title>" in html
    assert "See what Meena Home Bakes has today in Singapore" in html
    for secret in ("412", "Bedok", "Ave", "#05", "460412", "Block", "+65"):
        assert secret not in html
    store.share("alice", bid, False)
    assert real.get(f"/s/{bid}", headers=WHATSAPP).text == INDEX


def test_ob_273_home_and_how_it_works_have_title_description_and_cards(client: TestClient) -> None:
    for path, title in (("/", "Chalkboard — your shop"), ("/how-it-works", "How Chalkboard works")):
        html = client.get(path, headers=WHATSAPP).text
        assert f"<title>{title}" in html
        for key in ("og:title", "og:description", "og:image", "og:url", "twitter:card"):
            assert key in html
        assert 'name="description"' in html
        assert html.count('name="description"') == 1


def test_ob_273_robots_and_sitemap_are_real_files_on_the_customer_host(client: TestClient) -> None:
    robots = client.get("/robots.txt")
    assert robots.status_code == 200
    assert robots.headers["content-type"].startswith("text/plain")
    assert "Disallow: /demo\n" in robots.text
    assert "Disallow: /explore/demo\n" in robots.text
    assert "Sitemap: http://testserver/sitemap.xml" in robots.text
    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert sitemap.headers["content-type"].startswith("application/xml")
    assert sitemap.text.startswith("<?xml")
    assert "<loc>http://testserver/how-it-works</loc>" in sitemap.text


def test_ob_273_business_host_and_demo_are_noindex(client: TestClient) -> None:
    host = BUSINESS
    assert "Disallow: /\n" in client.get("/robots.txt", headers=host).text
    assert client.get("/sitemap.xml", headers=host).status_code == 404
    home = client.get("/", headers=host)
    assert ROBOTS in home.text
    assert home.headers["x-robots-tag"] == "noindex, nofollow"
    demo = client.get("/demo")
    assert ROBOTS in demo.text
    assert demo.headers["x-robots-tag"] == "noindex, nofollow"
    assert "x-robots-tag" not in client.get("/").headers


def test_ob_273_every_business_host_and_run_app_response_is_noindex(client: TestClient) -> None:
    pages = ("/coach", "/new-shop", "/settings", "/features", "/explore", "/explore/s/nobody")
    for host in (BUSINESS, RUN_APP):
        for path in (*pages, "/s/bakery", "/how-it-works"):
            page = client.get(path, headers=host)
            assert page.status_code == 200, (host, path)
            assert page.headers["x-robots-tag"] == "noindex, nofollow", (host, path)
            assert page.text.count(ROBOTS) == 1, (host, path)
            assert "canonical" not in page.text, (host, path)
        for path in ("/api/v1/health", "/robots.txt", "/api/missing"):
            assert client.get(path, headers=host).headers["x-robots-tag"] == "noindex, nofollow"


def test_ob_273_demo_paths_are_noindex_on_every_host(client: TestClient) -> None:
    for host in ({}, BUSINESS, {"Host": "chalkboard.example"}):
        for path in ("/demo", "/demo/coach", "/explore/demo", "/explore/demo/browse"):
            page = client.get(path, headers=host)
            assert page.headers["x-robots-tag"] == "noindex, nofollow", (host, path)
            assert ROBOTS in page.text, (host, path)
    # A shop page whose name merely starts with "demo" is not the demo.
    assert "x-robots-tag" not in client.get("/explore/demolition").headers


def test_ob_273_sample_shops_are_noindex_and_drop_the_fictional_label(client: TestClient) -> None:
    page = client.get("/explore/s/sample", headers=WHATSAPP)
    assert page.headers["x-robots-tag"] == "noindex, nofollow"
    assert ROBOTS in page.text and "canonical" not in page.text
    assert "<title>Sample Kopi — Indiranagar, Bengaluru</title>" in page.text
    assert "fictional" not in page.text and "Demo Lane" not in page.text


def test_ob_273_other_pages_and_api_are_unchanged(client: TestClient) -> None:
    assert client.get("/coach").text == INDEX
    assert client.get("/api/missing").status_code == 404


class SlowShops(Shops):
    def share_card(self, bid: str) -> dict[str, Any] | None:
        time.sleep(1.0)  # a slow database read
        return self.shops.get(bid)


def test_ob_273_a_slow_shop_lookup_holds_up_neither_health_nor_the_page(
    client: TestClient,
) -> None:
    shops = client.app.state.merchant.shops  # type: ignore[attr-defined]
    client.app.state.merchant = SlowShops(shops)  # type: ignore[attr-defined]
    client.get("/api/v1/health")  # warm up
    with ThreadPoolExecutor(max_workers=4) as pool:
        started = time.perf_counter()
        pages = [pool.submit(client.get, "/explore/s/bakery", headers=WHATSAPP) for _ in range(4)]
        time.sleep(0.05)  # the shop pages are in flight
        health_started = time.perf_counter()
        assert client.get("/api/v1/health").status_code == 200
        health = time.perf_counter() - health_started
        results = [page.result() for page in pages]
        elapsed = time.perf_counter() - started
    assert health < 0.25, health
    assert elapsed < 0.9, elapsed  # each page gives up on the lookup after 300 ms
    for page in results:
        assert page.status_code == 200
        assert page.text == INDEX  # served without shop tags rather than waiting


def test_ob_273_share_card_shows_exactly_the_shops_public_shop_shows(
    store: MerchantRepository,
) -> None:
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(name="Meena Home Bakes", location=HOME_ADDRESS, **SHOP_PIN),
        ),
    )
    bid = str(store.commit("alice", proposal["id"], proposal["digest"])["business_id"])
    assert store.share_card(bid) is None and store.public_shop(bid) is None
    store.share("alice", bid, True)
    card, shop = store.share_card(bid), store.public_shop(bid)
    assert card is not None and shop is not None
    assert card == {key: shop[key] for key in ("id", "name", "location", "gallery")}
    store.share("alice", bid, False)
    assert store.share_card(bid) is None
    assert store.share_card("../not-an-id") is None
