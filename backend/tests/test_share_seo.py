"""OB-273: link previews and search engines read the head and robots files the server writes."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.main import create_app
from app.settings import Settings

INDEX = (
    "<!doctype html><html><head><title>Old</title>"
    '<meta name="description" content="old" /></head><body></body></html>'
)
WHATSAPP = {"User-Agent": "WhatsApp/2.23.20.0"}
FACEBOOK = {"User-Agent": "facebookexternalhit/1.1"}


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
            }
        )
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
    assert "Disallow: /demo" in robots.text
    assert "Sitemap: http://testserver/sitemap.xml" in robots.text
    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert sitemap.headers["content-type"].startswith("application/xml")
    assert sitemap.text.startswith("<?xml")
    assert "<loc>http://testserver/how-it-works</loc>" in sitemap.text


def test_ob_273_business_host_and_demo_are_noindex(client: TestClient) -> None:
    host = {"Host": "business.chalkboard.example"}
    assert "Disallow: /\n" in client.get("/robots.txt", headers=host).text
    assert client.get("/sitemap.xml", headers=host).status_code == 404
    home = client.get("/", headers=host)
    assert 'name="robots" content="noindex, nofollow"' in home.text
    assert home.headers["x-robots-tag"] == "noindex, nofollow"
    demo = client.get("/demo")
    assert 'name="robots" content="noindex, nofollow"' in demo.text
    assert demo.headers["x-robots-tag"] == "noindex, nofollow"
    assert "x-robots-tag" not in client.get("/").headers


def test_ob_273_other_pages_and_api_are_unchanged(client: TestClient) -> None:
    assert client.get("/coach").text == INDEX
    assert client.get("/api/missing").status_code == 404
