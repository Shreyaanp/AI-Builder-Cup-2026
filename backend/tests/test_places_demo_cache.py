"""DEMO PURPOSE ONLY cache of Google Maps answers (app/places_demo_cache.py) and the daily cap."""

from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException

from app.discover import MapsService
from app.places_demo_cache import PlacesDemoCache
from app.settings import Settings

ROW = {
    "id": "ChIJfixture",
    "displayName": {"text": "Tiong Bahru Kopi"},
    "location": {"latitude": 1.2849, "longitude": 103.8321},
}


def config(tmp_path: Path, **extra: object) -> Settings:
    return Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "route.sqlite"),
        recall_path=str(tmp_path / "recall"),
        maps_server_key="fixture-server",
        maps_browser_key="fixture-browser",
        places_demo_cache_dir=str(tmp_path / "places-cache"),
        _env_file=None,
        **extra,
    )


def counting() -> tuple[list[httpx.Request], httpx.MockTransport]:
    calls: list[httpx.Request] = []

    def fixture(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"places": [ROW]})

    return calls, httpx.MockTransport(fixture)


async def test_an_area_looked_at_once_is_never_fetched_again(tmp_path: Path) -> None:
    calls, transport = counting()
    first = MapsService(config(tmp_path, places_demo_cache=True), transport)
    try:
        assert (await first.places(1.2847, 103.832, 1500, "coffee", ""))[0]["id"] == ROW["id"]
    finally:
        await first.close()
    # A new instance (a restart, another customer) nearby in the same ~1 km area: from disk.
    second = MapsService(config(tmp_path, places_demo_cache=True), transport)
    try:
        rows = await second.places(1.2812, 103.8318, 1500, "Coffee", "")
        assert rows[0]["id"] == ROW["id"]
    finally:
        await second.close()
    assert len(calls) == 1


async def test_cache_is_off_by_default_and_never_on_in_offline_demo(tmp_path: Path) -> None:
    calls, transport = counting()
    for _ in range(2):
        service = MapsService(config(tmp_path), transport)
        try:
            await service.places(1.2847, 103.832, 1500, "coffee", "")
        finally:
            await service.close()
    assert len(calls) == 2
    assert not (tmp_path / "places-cache").exists()
    offline = Settings(
        app_env="test", places_demo_cache=True, places_demo_cache_dir=str(tmp_path / "x")
    )
    service = MapsService(offline.model_copy(update={"maps_server_key": None}))
    try:
        assert not service.demo_cache.active()
    finally:
        await service.close()


async def test_cache_deletes_itself_after_the_demo_window(tmp_path: Path) -> None:
    calls, transport = counting()
    service = MapsService(config(tmp_path, places_demo_cache=True), transport)
    try:
        await service.places(1.2847, 103.832, 1500, "coffee", "")
    finally:
        await service.close()
    assert (tmp_path / "places-cache").exists()
    yesterday = datetime.now(UTC).date() - timedelta(days=1)
    service = MapsService(
        config(tmp_path, places_demo_cache=True, places_demo_cache_until=yesterday), transport
    )
    try:
        assert not service.demo_cache.active()
        await service.places(1.2847, 103.832, 1500, "coffee", "")
    finally:
        await service.close()
    assert not (tmp_path / "places-cache").exists()
    assert len(calls) == 2


async def test_daily_cap_stops_paid_calls(tmp_path: Path) -> None:
    calls, transport = counting()
    service = MapsService(config(tmp_path, places_daily_cap=2), transport)
    try:
        await service.places(1.30, 103.80, 1500, "coffee", "")
        await service.places(1.31, 103.80, 1500, "coffee", "")
        with pytest.raises(HTTPException) as error:
            await service.places(1.32, 103.80, 1500, "coffee", "")
        assert error.value.detail == "MAPS_DAILY_CAP"
        # Already fetched answers keep working under the cap.
        assert await service.places(1.30, 103.80, 1500, "coffee", "")
    finally:
        await service.close()
    assert len(calls) == 2


def test_photos_round_trip(tmp_path: Path) -> None:
    store = PlacesDemoCache(True, str(tmp_path), date.today() + timedelta(days=3))
    assert store.get_photo("places/x/photos/y", 800) is None
    store.put_photo("places/x/photos/y", 800, b"jpeg", "image/jpeg")
    assert store.get_photo("places/x/photos/y", 800) == (b"jpeg", "image/jpeg")
