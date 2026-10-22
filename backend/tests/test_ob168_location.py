"""OB-168: a place name is a draft, never an invisible public shop."""

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.boundary import language_country
from app.discover import MapsService, prepare_pin
from app.main import create_app
from app.merchant import (
    BusinessFields,
    MerchantStore,
    NewShopDraft,
    OwnerLocation,
    ProductFields,
    ProposalRequest,
)
from app.new_shop_resume import ready_to_go_live
from app.region import client_country, client_language_country, phone_country
from app.settings import Settings
from app.shop_time import client_timezone
from tests.test_discover import settings
from tests.test_photos import join


def test_ob168_hindi_place_needs_pin_before_publication(tmp_path):
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    fields = BusinessFields(name="परीक्षण किराना", category="किराना", location="माधवपुर")
    assert not ready_to_go_live(NewShopDraft(business=fields))
    proposal = store.propose("owner", ProposalRequest(kind="business", business=fields))
    bid = store.commit("owner", proposal["id"], proposal["digest"])["business_id"]
    with pytest.raises(HTTPException, match="Add your location"):
        store.share("owner", bid, True)
    assert not store.list_businesses("owner")[0]["public"]


async def test_ob168_hindi_defaults_and_country_biased_confirmed_pin(tmp_path, monkeypatch):
    monkeypatch.setattr("app.region.NO_SIGNAL_COUNTRY", None)
    country = client_country.set(language_country("hi"))
    zone = client_timezone.set("UTC")
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))

    def geocode(request):
        assert request.url.params["region"] == "in"
        return httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [
                    {
                        "place_id": "fixture-madhavpur",
                        "formatted_address": "Madhavpur, India",
                        "geometry": {"location": {"lat": 21.27, "lng": 69.97}},
                    }
                ],
            },
        )

    maps = MapsService(
        Settings(maps_server_key="fixture", maps_browser_key="fixture", _env_file=None),
        httpx.MockTransport(geocode),
    )
    try:
        fields = BusinessFields(name="परीक्षण किराना", category="किराना", location="माधवपुर")
        assert (fields.currency, fields.timezone) == ("INR", "Asia/Kolkata")
        body = ProposalRequest(kind="business", business=fields, geocode_confirmed=True)
        await prepare_pin(body, store, "owner", maps)
        assert ready_to_go_live(NewShopDraft(business=body.business))
        proposal = store.propose("owner", body)
        bid = store.commit("owner", proposal["id"], proposal["digest"])["business_id"]
        store.share("owner", bid, True)
        shop = store.shared_shops()[0]
        assert (shop["lat"], shop["lng"]) == (21.27, 69.97)
        assert (shop["currency"], shop["timezone"]) == ("INR", "Asia/Kolkata")
    finally:
        await maps.close()
        client_country.reset(country)
        client_timezone.reset(zone)


def test_ob168_phone_country_precedes_app_language_and_pin_precedes_phone(monkeypatch):
    monkeypatch.setattr("app.region.NO_SIGNAL_COUNTRY", None)
    country = client_country.set(None)
    language = client_language_country.set(language_country("hi"))
    zone = client_timezone.set("UTC")
    try:
        assert phone_country() == "IN"
        assert BusinessFields(name="Chai").currency == "INR"
        client_country.set("SG")
        assert phone_country() == "SG"
        assert BusinessFields(name="Kopi").currency == "SGD"
        fields = BusinessFields(name="Chai", lat=12.9716, lng=77.6412)
        assert (fields.currency, fields.timezone) == ("INR", "Asia/Kolkata")
    finally:
        client_country.reset(country)
        client_language_country.reset(language)
        client_timezone.reset(zone)


def test_ob168_removing_pin_withdraws_public_shop_and_preserves_ownership(tmp_path):
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    fields = BusinessFields(name="Chai", lat=21.27, lng=69.97)
    proposal = store.propose("owner", ProposalRequest(kind="business", business=fields))
    bid = store.commit("owner", proposal["id"], proposal["digest"])["business_id"]
    store.share("owner", bid, True)
    with pytest.raises(HTTPException) as other_owner:
        store.share("other-owner", bid, False)
    assert other_owner.value.status_code == 404
    proposal = store.propose(
        "owner",
        ProposalRequest(
            kind="business",
            business_id=bid,
            revision=1,
            business=BusinessFields(name="Chai", location="New place"),
        ),
    )
    store.commit("owner", proposal["id"], proposal["digest"])
    assert not store.list_businesses("owner")[0]["public"]
    assert store.public_shop(bid) is None
    assert store.shared_shops() == []


def test_ob168_suggestion_is_unsaved_then_confirmed_shop_appears_in_discovery(tmp_path):
    def maps_response(request):
        if request.url.host == "places.googleapis.com":
            return httpx.Response(200, json={"places": []})
        assert request.url.host == "maps.googleapis.com"
        if "address" in request.url.params:
            assert request.url.params["address"] == "माधवपुर"
            assert request.url.params["region"] == "in"
        return httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [
                    {
                        "place_id": "fixture-owner-pin",
                        "formatted_address": "Fixture India address",
                        "geometry": {"location": {"lat": 12.9716, "lng": 77.6412}},
                    }
                ],
            },
        )

    config = settings(tmp_path, live=True)
    app = create_app(
        config,
        InMemorySessionService(),
        maps_service=MapsService(config, httpx.MockTransport(maps_response)),
    )
    with TestClient(app) as client:
        join(client)
        client.headers.update(
            {"X-App-Language": "hi", "X-Client-Timezone": "UTC", "Accept-Language": "en"}
        )
        suggestion = client.get("/api/v1/places/pin", params={"q": "माधवपुर"})
        assert suggestion.status_code == 200
        assert client.get("/api/v1/businesses").json() == []
        point = suggestion.json()
        response = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                "business": {"name": "परीक्षण किराना", "category": "किराना", "location": "माधवपुर"},
                "owner_location": {
                    "lat": point["lat"],
                    "lng": point["lng"],
                    "accuracy_m": 0,
                    "source": "pin",
                },
            },
        )
        assert response.status_code == 200
        proposal = response.json()
        assert proposal["snapshot"]["business"]["currency"] == "INR"
        assert proposal["snapshot"]["business"]["timezone"] == "Asia/Kolkata"
        saved = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        )
        assert saved.status_code == 200
        bid = saved.json()["business_id"]
        assert (
            client.post(f"/api/v1/businesses/{bid}/share", json={"public": True}).status_code == 200
        )
        discovered = client.get(
            "/api/v1/discover", params={"lat": point["lat"], "lng": point["lng"]}
        )
        assert discovered.status_code == 200
        assert bid in {place["id"] for place in discovered.json()["places"]}


async def test_ob168_first_pin_repairs_legacy_usd_utc_without_changing_prices(
    tmp_path, monkeypatch
):
    monkeypatch.setattr("app.region.NO_SIGNAL_COUNTRY", None)
    country = client_country.set(None)
    language = client_language_country.set(None)
    zone = client_timezone.set(None)
    store = MerchantStore(str(tmp_path / "legacy.sqlite3"))
    maps = MapsService(Settings(_env_file=None))
    try:
        fields = BusinessFields(
            name="Legacy Chai", location="Old place", currency="USD", timezone="UTC"
        )
        proposal = store.propose(
            "owner",
            ProposalRequest(
                kind="business",
                business=fields,
                products=[ProductFields(name="Chai", price=1500)],
            ),
        )
        bid = store.commit("owner", proposal["id"], proposal["digest"])["business_id"]
        assert store.list_businesses("owner")[0]["fields"]["currency"] == "USD"
        body = ProposalRequest(
            kind="business",
            business_id=bid,
            revision=1,
            business=fields,
            owner_location=OwnerLocation(lat=12.9716, lng=77.6412, accuracy_m=0, source="pin"),
        )
        await prepare_pin(body, store, "owner", maps)
        proposal = store.propose("owner", body)
        assert proposal["snapshot"]["business"]["currency"] == "INR"
        assert proposal["snapshot"]["business"]["timezone"] == "Asia/Kolkata"
        store.commit("owner", proposal["id"], proposal["digest"])
        assert store.context("owner", bid)["inventory"][0]["price"] == 1500
        assert not store.list_businesses("owner")[0]["public"]
    finally:
        await maps.close()
        client_country.reset(country)
        client_language_country.reset(language)
        client_timezone.reset(zone)


@pytest.mark.parametrize("language", ["en", "hi"])
def test_ob189_known_address_is_never_asked_again_and_stays_private_until_pinned(language):
    """A typed place the map could not find: the coach moves on (the app asks the owner to
    confirm the pin), never asks the place again, and the shop does not go live without it."""
    from types import SimpleNamespace

    from app.agent import OFFLINE_HI, new_shop_reply, ui_language

    token = ui_language.set(language)
    try:
        draft = NewShopDraft(
            business=BusinessFields(name="Chai", category="Tea", location="Lajpat Nagar")
        )
        reply = new_shop_reply(SimpleNamespace(uid="owner", new_shop_draft=draft))
        hours = "What are your opening hours?"
        assert (hours if language == "en" else OFFLINE_HI[hours]) in reply
        question = "Are you at the shop right now?"
        assert question not in reply
        assert OFFLINE_HI[next(key for key in OFFLINE_HI if key.startswith(question))] not in reply
        assert not ready_to_go_live(draft)
    finally:
        ui_language.reset(token)
