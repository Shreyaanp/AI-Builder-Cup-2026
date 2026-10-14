import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.discover import FIXTURE_PLACES, PLACES_MASK, MapsService, open_now
from app.main import create_app
from app.merchant import BusinessFields, MerchantRepository, ProductFields, ProposalRequest
from app.settings import Settings
from tests.test_photos import join

pytest_plugins = ("tests.test_merchant_store",)  # store fixture covers both adapters


def settings(tmp_path: Path, *, live: bool = False) -> Settings:
    return Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "route.sqlite"),
        recall_path=str(tmp_path / "recall"),
        maps_server_key="fixture-server" if live else None,
        maps_browser_key="fixture-browser" if live else None,
        _env_file=None,
    )


def shared_shop(repository: MerchantRepository, *, shared: bool = True, lat: float = 1.2847) -> str:
    proposal = repository.propose(
        "fixture-owner",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Fixture Kopi Shop",
                category="Kopi",
                location="Tiong Bahru",
                lat=lat,
                lng=103.832,
                hours="7am–3pm",
                currency="SGD",
            ),
            products=[
                ProductFields(name="Teh tarik", price=220, unit="cup", available=False),
                ProductFields(name="Kopi", price=180, unit="cup"),
                ProductFields(name="Toast", price=240, unit="set"),
                ProductFields(name="Eggs", price=150, unit="pair"),
            ],
        ),
    )
    bid = repository.commit("fixture-owner", proposal["id"], proposal["digest"])["business_id"]
    repository.share("fixture-owner", bid, shared)
    return str(bid)


def test_public_discovery_both_stores(
    store: MerchantRepository, tmp_path: Path, monkeypatch
) -> None:
    bid = shared_shop(store)
    shared_shop(store, shared=False)
    shared_shop(store, lat=1.35)
    monkeypatch.setattr(
        "app.discover.open_now",
        lambda h, z, **kw: open_now(h, z, datetime(2026, 10, 14, 1, tzinfo=UTC), **kw),
    )
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        response = client.get("/api/v1/discover?lat=1.2847&lng=103.832")
        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "demo"
        assert data["places"][0]["id"] == bid
        ours = [p for p in data["places"] if p["source"] == "chalkboard"]
        assert len(ours) == 1
        assert ours[0]["currency"] == "SGD"
        assert len(ours[0]["items"]) == 3
        assert ours[0]["items"][0]["price"] == 220
        assert ours[0]["sold_out"] == ["Teh tarik"]
        assert "stock" not in ours[0]["items"][0]
        assert "owners" not in ours[0]
        filtered = client.get(
            "/api/v1/discover?lat=1.2847&lng=103.832&q=teh+tarik+near+me,+open+now"
        )
        assert filtered.status_code == 200
        assert [p["id"] for p in filtered.json()["places"]] == [bid]
        open_places = client.get("/api/v1/discover?lat=1.2847&lng=103.832&open_now=true").json()[
            "places"
        ]
        assert open_places and all(p["open_now"] is True for p in open_places)
        bakeries = client.get("/api/v1/discover?lat=1.2847&lng=103.832&category=bakery").json()[
            "places"
        ]
        assert [p["id"] for p in bakeries] == ["demo-bakery"]
        assert client.get("/api/v1/discover?lat=nan&lng=103").status_code == 422
        assert client.get("/api/v1/discover?lat=91&lng=103").status_code == 422
        assert client.get("/api/v1/discover?lat=1&lng=103&radius=50001").status_code == 422
        assert client.get("/api/v1/discover?lat=1&lng=103&category=unknown").status_code == 422
        store.share("fixture-owner", bid, False)
        assert not any(
            p["source"] == "chalkboard"
            for p in client.get("/api/v1/discover?lat=1.2847&lng=103.832").json()["places"]
        )


def test_pin_consent_sealed_review_and_changed_location_both_stores(
    store: MerchantRepository, tmp_path: Path
) -> None:
    calls: list[httpx.Request] = []

    def fixture(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.url.host == "maps.googleapis.com"
        assert "region" not in request.url.params  # global: no country bias
        return httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [
                    {
                        "place_id": "fixture-pin",
                        "formatted_address": "Tiong Bahru Market",
                        "geometry": {"location": {"lat": 1.2847, "lng": 103.832}},
                    }
                ],
            },
        )

    config = settings(tmp_path, live=True)
    app = create_app(
        config,
        InMemorySessionService(),
        maps_service=MapsService(config, httpx.MockTransport(fixture)),
    )
    with TestClient(app) as client:
        app.state.merchant = store
        join(client)
        body = {
            "kind": "business",
            "business": {"name": "Owner Kopi", "location": "Tiong Bahru Market"},
        }
        proposal = client.post("/api/v1/proposals", json=body).json()
        assert proposal["snapshot"]["business"].get("lat") is None
        assert not calls
        assert client.get("/api/v1/businesses").json() == []
        pinned = client.post("/api/v1/proposals", json={**body, "geocode_confirmed": True}).json()
        assert len(calls) == 1
        assert pinned["digest"] != proposal["digest"]
        assert pinned["snapshot"]["business"]["pin_label"] == "Tiong Bahru Market"
        assert client.get("/api/v1/businesses").json() == []
        again = client.post("/api/v1/proposals", json={**body, "geocode_confirmed": True})
        assert again.status_code == 200 and len(calls) == 1
        assert (
            client.post(
                f"/api/v1/proposals/{pinned['id']}/approve", json={"digest": proposal["digest"]}
            ).status_code
            == 409
        )
        saved = client.post(
            f"/api/v1/proposals/{pinned['id']}/approve", json={"digest": pinned["digest"]}
        ).json()
        bid = saved["business_id"]
        fields = pinned["snapshot"]["business"]
        assert client.get("/api/v1/businesses").json()[0]["fields"]["lat"] == 1.2847
        edit = {
            "kind": "business",
            "business_id": bid,
            "revision": 1,
            "business": {**fields, "name": "Renamed", "timezone": "UTC"},
        }
        unchanged = client.post("/api/v1/proposals", json=edit).json()
        assert unchanged["snapshot"]["business"]["lat"] == 1.2847 and len(calls) == 1
        assert unchanged["snapshot"]["business"]["timezone"] == "UTC"
        changed = client.post(
            "/api/v1/proposals", json={**edit, "business": {**fields, "location": "Bugis"}}
        ).json()
        assert changed["snapshot"]["business"].get("lat") is None and len(calls) == 1
        assert (
            client.post(
                "/api/v1/proposals",
                json={
                    **edit,
                    "revision": 0,
                    "business": {**fields, "location": "Bugis"},
                    "geocode_confirmed": True,
                },
            ).status_code
            == 409
        )
        assert len(calls) == 1
        client.cookies.clear()
        join(client)
        assert (
            client.post("/api/v1/proposals", json={**edit, "geocode_confirmed": True}).status_code
            == 404
        )
        assert len(calls) == 1


def test_place_search_works_anywhere_and_text_search_has_no_country(tmp_path: Path) -> None:
    seen: list[httpx.Request] = []

    def fixture(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "places.googleapis.com":
            assert "Singapore" not in json.loads(request.content)["textQuery"]
            assert "regionCode" not in json.loads(request.content)
            return httpx.Response(200, json={"places": []})
        assert "region" not in request.url.params
        return httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [
                    {
                        "place_id": "fixture-bengaluru",
                        "formatted_address": "Indiranagar, Bengaluru, Karnataka, India",
                        "geometry": {"location": {"lat": 12.9719, "lng": 77.6412}},
                    }
                ],
            },
        )

    config = settings(tmp_path, live=True)
    app = create_app(
        config,
        InMemorySessionService(),
        maps_service=MapsService(config, httpx.MockTransport(fixture)),
    )
    with TestClient(app) as client:
        found = client.get("/api/v1/discover/place", params={"q": "Indiranagar"}).json()
        assert found == {
            "lat": 12.9719,
            "lng": 77.6412,
            "label": "Indiranagar, Bengaluru, Karnataka, India",
        }
        client.get("/api/v1/discover", params={"lat": 12.9719, "lng": 77.6412, "q": "dosa"})
        assert any(r.url.host == "places.googleapis.com" for r in seen)
        assert client.get("/api/v1/discover/place", params={"q": "x"}).status_code == 422


def test_new_shop_opens_in_the_owners_own_timezone(tmp_path: Path) -> None:
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)

        def zone(header: str | None, business: dict) -> str:
            headers = {"X-Client-Timezone": header} if header else {}
            body = {"kind": "business", "business": business}
            proposal = client.post("/api/v1/proposals", json=body, headers=headers).json()
            # The default zone is omitted from stored records.
            return str(proposal["snapshot"]["business"].get("timezone", "Asia/Singapore"))

        assert zone("Asia/Kolkata", {"name": "Dosa Corner"}) == "Asia/Kolkata"
        assert zone("Europe/London", {"name": "Cafe"}) == "Europe/London"
        assert zone(None, {"name": "Kopi"}) == "Asia/Singapore"  # no header: demo default
        assert zone("Not/AZone", {"name": "Kopi"}) == "Asia/Singapore"  # invalid: ignored
        # An explicit timezone from the owner always wins over the phone's.
        assert zone("Asia/Kolkata", {"name": "Kopi", "timezone": "Asia/Tokyo"}) == "Asia/Tokyo"


def test_fixture_pin_and_missing_one_key(tmp_path: Path) -> None:
    config = settings(tmp_path)
    app = create_app(config, InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        response = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                "geocode_confirmed": True,
                "business": {"name": "Kopi", "location": "Tiong Bahru Market"},
            },
        )
        assert response.json()["snapshot"]["business"]["pin_demo"] is True
        assert response.json()["snapshot"]["business"]["pin_label"] == "Tiong Bahru Market"
    partial = Settings(maps_server_key="fixture-server", _env_file=None)
    with TestClient(create_app(partial, InMemorySessionService())) as client:
        assert client.get("/api/v1/bootstrap").json()["maps_mode"] == "demo"


def test_demo_pin_can_be_reviewed_again_when_connected(
    store: MerchantRepository, tmp_path: Path
) -> None:
    calls: list[httpx.Request] = []

    def fixture(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [
                    {
                        "place_id": "fixture-live-pin",
                        "formatted_address": "Tiong Bahru Market",
                        "geometry": {"location": {"lat": 1.2848, "lng": 103.8321}},
                    }
                ],
            },
        )

    config = settings(tmp_path, live=True)
    maps = MapsService(config, httpx.MockTransport(fixture))
    app = create_app(config, InMemorySessionService(), maps_service=maps)
    with TestClient(app) as client:
        app.state.merchant = store
        join(client)
        maps.demo = True
        body = {
            "kind": "business",
            "geocode_confirmed": True,
            "business": {"name": "Kopi", "location": "Tiong Bahru Market"},
        }
        demo = client.post("/api/v1/proposals", json=body).json()
        saved = client.post(
            f"/api/v1/proposals/{demo['id']}/approve", json={"digest": demo["digest"]}
        ).json()
        assert not calls
        # A new connected process has no cached fixture geocode responses.
        maps.demo = False
        maps.cache.clear()
        refreshed = client.post(
            "/api/v1/proposals", json={**body, "business_id": saved["business_id"], "revision": 1}
        ).json()
        assert len(calls) == 1
        assert refreshed["snapshot"]["business"].get("pin_demo", False) is False
        assert refreshed["snapshot"]["business"]["lat"] == 1.2848
        # Still a proposal: existing facts stay explicitly demo until exact approval.
        assert client.get("/api/v1/businesses").json()[0]["fields"]["pin_demo"] is True


def test_rate_limit_and_public_config(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.limits.time.time", lambda: 120.0)
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        for _ in range(30):
            assert client.get("/api/v1/discover?lat=1.2847&lng=103.832").status_code == 200
        blocked = client.get("/api/v1/discover?lat=1.2847&lng=103.832")
        assert blocked.status_code == 429 and blocked.headers["Retry-After"] == "60"
        assert (
            client.get(
                "/api/v1/discover?lat=1.2847&lng=103.832", headers={"x-forwarded-for": "other-ip"}
            ).status_code
            == 200
        )
        assert client.get("/api/v1/bootstrap").json()["maps_mode"] == "demo"


async def test_places_masks_cache_expiry_and_separate_filters(tmp_path: Path, monkeypatch) -> None:
    requests: list[httpx.Request] = []

    def fixture(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.headers["X-Goog-FieldMask"] == PLACES_MASK
        payload = json.loads(request.content)
        assert "openNow" not in payload
        return httpx.Response(200, json={"places": FIXTURE_PLACES})

    clock = [100.0]
    monkeypatch.setattr("app.discover.time.monotonic", lambda: clock[0])
    service = MapsService(settings(tmp_path, live=True), httpx.MockTransport(fixture))
    try:
        assert not service.demo
        await service.places(1.2847, 103.832, 3000, "", "")
        await service.places(1.28471, 103.83201, 3000, "", "")
        assert len(requests) == 1 and requests[0].url.path.endswith(":searchNearby")
        await service.places(1.2847, 103.832, 3000, "kopi", "kopi")
        assert requests[1].url.path.endswith(":searchText")
        assert json.loads(requests[1].content)["includedType"] == "cafe"
        await service.places(1.2847, 103.832, 1000, "", "")
        assert len(requests) == 3
        clock[0] = 701
        await service.places(1.2847, 103.832, 3000, "", "")
        assert len(requests) == 4
    finally:
        await service.close()


def test_live_route_and_redacted_provider_failure(tmp_path: Path) -> None:
    failing = [False]

    def fixture(request: httpx.Request) -> httpx.Response:
        return (
            httpx.Response(403, json={"error": "provider-private-detail"})
            if failing[0]
            else httpx.Response(200, json={"places": FIXTURE_PLACES})
        )

    config = settings(tmp_path, live=True)
    app = create_app(
        config,
        InMemorySessionService(),
        maps_service=MapsService(config, httpx.MockTransport(fixture)),
    )
    with TestClient(app) as client:
        data = client.get("/api/v1/discover?lat=1.2847&lng=103.832&q=kopi").json()
        assert data["mode"] == "live" and data["places"][0]["source"] == "google"
        public = client.get("/api/v1/bootstrap").json()
        assert public["maps_browser_key"] == "fixture-browser"
        assert "fixture-server" not in json.dumps(public)
        failing[0] = True
        failed = client.get("/api/v1/discover?lat=1.2847&lng=103.832&q=other")
        assert failed.status_code == 200 and failed.json()["google_unavailable"]
        assert "provider-private-detail" not in failed.text


@pytest.mark.parametrize(
    ("hours", "timezone", "instant", "expected"),
    [
        ("7am–3pm", "Asia/Singapore", "2026-10-14T01:00:00+00:00", True),
        ("7-3pm", "Asia/Singapore", "2026-10-14T10:00:00+00:00", False),
        ("22:00–02:00", "Asia/Singapore", "2026-10-14T17:00:00+00:00", True),
        ("07:00–15:00", "UTC", "2026-10-14T06:00:00+00:00", False),
        ("Mon–Fri 7am–3pm", "Asia/Singapore", "2026-10-14T01:00:00+00:00", None),
        ("25:00–26:00", "Asia/Singapore", "2026-10-14T01:00:00+00:00", None),
        ("7:70–15:00", "Asia/Singapore", "2026-10-14T01:00:00+00:00", None),
    ],
)
def test_open_now_in_shop_timezone(
    hours: str, timezone: str, instant: str, expected: bool | None
) -> None:
    assert open_now(hours, timezone, datetime.fromisoformat(instant)) is expected
