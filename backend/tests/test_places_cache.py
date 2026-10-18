"""Places results shared across instances: hits, misses, field masks and failure fallbacks."""

import json
from pathlib import Path
from typing import Any

import httpx
from structlog.testing import capture_logs

from app.discover import DETAILS_MASK, FIXTURE_PLACES, PLACES_MASK, STATION_MASK, MapsService
from app.discover_ask import nearest_station
from app.places_cache import FirestorePlaces, MemoryPlaces, cache_id, shared_places
from app.settings import Settings


def live(tmp_path: Path, **values: Any) -> Settings:
    return Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "route.sqlite"),
        recall_path=str(tmp_path / "recall"),
        maps_server_key="fixture-server",
        maps_browser_key="fixture-browser",
        _env_file=None,
        **values,
    )


def google(seen: list[httpx.Request]) -> httpx.MockTransport:
    def fixture(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.startswith("/v1/places/"):
            return httpx.Response(200, json=FIXTURE_PLACES[0])
        return httpx.Response(200, json={"places": FIXTURE_PLACES})

    return httpx.MockTransport(fixture)


async def test_a_second_instance_reuses_the_first_ones_places_answer(tmp_path: Path) -> None:
    seen: list[httpx.Request] = []
    shared = MemoryPlaces(1800)
    first = MapsService(live(tmp_path), google(seen))
    second = MapsService(live(tmp_path), google(seen))
    first.shared = second.shared = shared
    try:
        with capture_logs() as logs:
            assert await first.places(1.2847, 103.832, 3000, "kopi", "") == FIXTURE_PLACES
            assert await second.places(1.2847, 103.832, 3000, "kopi", "") == FIXTURE_PLACES
            await second.places(1.2847, 103.832, 3000, "kopi", "")
            assert await first.place("ChIJfixture123") == FIXTURE_PLACES[0]
            assert await second.place("ChIJfixture123") == FIXTURE_PLACES[0]
        assert len(seen) == 2  # one search and one details call for two instances
        results = [
            (e["kind"], e["result"], e.get("layer")) for e in logs if e["event"] == "places_cache"
        ]
        assert results == [
            ("places", "miss", None),
            ("places", "hit", "shared"),
            ("places", "hit", "memory"),
            ("place", "miss", None),
            ("place", "hit", "shared"),
        ]
        # A different query, area or field mask is a different entry.
        await second.places(1.2847, 103.832, 3000, "dosa", "")
        await second.places(1.2847, 103.832, 3000, "kopi", "", STATION_MASK)
        assert len(seen) == 4
    finally:
        await first.close()
        await second.close()


async def test_expired_shared_entries_are_not_served(tmp_path: Path) -> None:
    seen: list[httpx.Request] = []
    shared = MemoryPlaces(1800)
    service = MapsService(live(tmp_path), google(seen))
    other = MapsService(live(tmp_path), google(seen))
    service.shared = other.shared = shared
    try:
        await service.places(1.2847, 103.832, 3000, "", "")
        for key, (_, value) in list(shared.entries.items()):
            from datetime import UTC, datetime, timedelta

            shared.entries[key] = (datetime.now(UTC) - timedelta(seconds=1), value)
        await other.places(1.2847, 103.832, 3000, "", "")
        assert len(seen) == 2
    finally:
        await service.close()
        await other.close()


async def test_a_broken_store_only_costs_the_google_call(tmp_path: Path) -> None:
    class Broken:
        async def get(self, key: tuple[Any, ...]) -> Any:
            raise RuntimeError("firestore down")

        async def put(self, key: tuple[Any, ...], value: Any) -> None:
            raise RuntimeError("firestore down")

    seen: list[httpx.Request] = []
    service = MapsService(live(tmp_path), google(seen))
    service.shared = Broken()
    try:
        with capture_logs() as logs:
            assert await service.places(1.2847, 103.832, 3000, "", "") == FIXTURE_PLACES
        assert len(seen) == 1
        assert sum(e["event"] == "places_cache_unavailable" for e in logs) == 2
    finally:
        await service.close()


async def test_failures_and_demo_data_are_never_shared(tmp_path: Path) -> None:
    shared = MemoryPlaces(1800)

    def failing(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    service = MapsService(live(tmp_path), httpx.MockTransport(failing))
    service.shared = shared
    demo = MapsService(Settings(app_env="test", _env_file=None))
    demo.shared = shared
    try:
        assert await service.place("ChIJfixture123") is None
        assert await demo.places(1.2847, 103.832, 3000, "", "") == FIXTURE_PLACES
        assert shared.entries == {}
    finally:
        await service.close()
        await demo.close()


async def test_each_caller_asks_only_for_the_fields_it_shows(tmp_path: Path) -> None:
    seen: list[httpx.Request] = []
    service = MapsService(live(tmp_path), google(seen))
    try:
        await service.places(1.2847, 103.832, 3000, "", "")
        await service.place("ChIJfixture123")
        await nearest_station(service, 1.2847, 103.832)
    finally:
        await service.close()
    masks = [r.headers["X-Goog-FieldMask"] for r in seen]
    assert masks == [PLACES_MASK, DETAILS_MASK, STATION_MASK]
    # The station anchor and the pins never ask for Enterprise-only or photo fields.
    for mask in (STATION_MASK, DETAILS_MASK):
        assert "photos" not in mask and "priceLevel" not in mask
    assert "rating" not in STATION_MASK and "currentOpeningHours" not in STATION_MASK
    assert json.loads(seen[2].content)["textQuery"] == "metro train station"


def test_the_switch_decides_whether_firestore_is_used() -> None:
    class Client:
        def __init__(self) -> None:
            self.paths: list[str] = []

        def collection(self, name: str) -> "Client":
            self.paths.append(name)
            return self

        document = collection

    client = Client()
    store = shared_places(client, Settings(_env_file=None))
    assert isinstance(store, FirestorePlaces) and store.ttl == 1800
    assert client.paths == ["ogoogle_ai_v1", "places", "places_cache"]
    assert shared_places(client, Settings(_env_file=None, places_cache=False)) is None
    assert shared_places(None, Settings(_env_file=None)) is None


def test_switch_and_ttl_follow_the_terms() -> None:
    assert Settings(_env_file=None).places_cache is True
    assert Settings(_env_file=None).places_cache_ttl_seconds == 1800
    try:
        Settings(_env_file=None, places_cache_ttl_seconds=7200)
    except ValueError:
        pass
    else:
        raise AssertionError("Places content may only be cached short-term")
    # Document ids are hashes, never the customer's query or position.
    key = ("places", 1.285, 103.832, 3000, "kopi near me", "", PLACES_MASK)
    assert "kopi" not in cache_id(key) and len(cache_id(key)) == 64
