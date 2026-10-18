"""Bounded, expiring fixture snapshots. No account, live services or durable merchant writes."""

import sqlite3
import time
from contextlib import ExitStack
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from secrets import token_urlsafe
from tempfile import TemporaryDirectory
from typing import Any

import anyio
from fastapi import APIRouter, HTTPException, Query, Request, Response

from .demo_data import SHOPS, customer_activity
from .demo_workspace import ZONE_CITY
from .forecast import ForecastService
from .limits import Bucket, client_ip
from .merchant import MerchantStore
from .sales import today_for
from .tour_story import seed_workspace

router = APIRouter(prefix="/api/v1/demo/sessions")
TTL_SECONDS = 900
MAX_SESSIONS = 128


class FixtureStore(MerchantStore):
    """Close every short-lived SQLite handle before removing the fixture directory."""

    def __init__(self, path: str, cleanup: ExitStack) -> None:
        self.cleanup = cleanup
        super().__init__(path)

    def connect(self) -> sqlite3.Connection:
        connection = super().connect()
        self.cleanup.callback(connection.close)
        return connection


@dataclass
class DemoSession:
    expires: float
    reads: dict[str, Any]


def sessions(request: Request) -> dict[str, DemoSession]:
    if not request.app.state.v1_settings.public_demo_enabled:
        raise HTTPException(404, "DEMO_DISABLED")
    saved: dict[str, DemoSession] = getattr(request.app.state, "public_demos", {})
    request.app.state.public_demos = saved
    for key in list(saved):
        if saved[key].expires <= time.time():
            del saved[key]
    return saved


def fixture(zone: str) -> tuple[dict[str, Any], list[dict[str, Any]], date]:
    # The same tour seeding code runs against throwaway files, never the real merchant store.
    with TemporaryDirectory(prefix="chalkboard-demo-") as directory, ExitStack() as cleanup:
        service = FixtureStore(str(Path(directory) / "demo.sqlite3"), cleanup)
        uid = f"public-demo-{token_urlsafe(8)}"
        city = ZONE_CITY.get(zone, "singapore")
        city = city if city in {"bengaluru", "singapore"} else "singapore"
        bid, _ = seed_workspace(service, uid, city)
        business = service.list_businesses(uid)[0]
        business["fields"]["name"] = business["fields"]["name"].replace(" (Tour)", " (Demo)")
        inventory = service.inventory(uid, bid)
        sales = service.sales_history(uid, bid)
        today = today_for(business["fields"])
        shops = [shop for shop in SHOPS if shop.city == city]
        demo = next(shop for shop in shops if shop.fields.category.lower() != "hardware")
        reads: dict[str, Any] = {
            "/businesses": [business],
            "/bootstrap": {},
            f"/businesses/{bid}/inventory": inventory,
            f"/businesses/{bid}/sales": sales,
            f"/businesses/{bid}/inquiries": [
                inquiry.model_dump() for inquiry in customer_activity(demo, today)
            ],
            f"/businesses/{bid}/freshness": {
                "today": today.isoformat(),
                "monday": today.weekday() == 0,
                "last_confirmed": today.isoformat(),
                "recap_week": today.strftime("%G-W%V"),
            },
            "/shops": [{"id": shop.id, "name": shop.fields.name} for shop in shops],
        }
        for product in inventory:
            reads[f"/businesses/{bid}/planning/{product['id']}"] = {
                **service.planning(uid, bid, product["id"], "read", {}),
                "today": today.isoformat(),
            }
        for shop in shops:
            fields = shop.fields.model_dump()
            reads[f"/public/shops/{shop.id}"] = {
                **fields,
                "id": shop.id,
                "demo": True,
                "stamps_enabled": False,
                "phone": "",
                "products": [p.model_dump() for p in shop.products],
                "facts": fields,
            }
        return reads, inventory, today


async def open_workspace(request: Request, zone: str) -> dict[str, Any]:
    saved = sessions(request)
    # Always enforce this public allocation limit, even when owner limits are disabled locally.
    try:
        retry = await anyio.to_thread.run_sync(
            request.app.state.rate_limiter.take,
            [
                Bucket("public-demo", client_ip(request), 5, 60),
                Bucket("public-demo", client_ip(request), 20, 3600),
            ],
            time.time(),
        )
    except Exception:
        retry = 60
    if retry:
        raise HTTPException(429, "RATE_LIMITED", headers={"Retry-After": str(retry)})
    # Reserve before yielding so concurrent allocations cannot exceed the memory bound.
    if len(saved) >= MAX_SESSIONS:
        raise HTTPException(429, "DEMO_BUSY", headers={"Retry-After": "60"})
    key = token_urlsafe(24)
    entry = DemoSession(time.time() + TTL_SECONDS, {})
    saved[key] = entry
    try:
        reads, inventory, today = await anyio.to_thread.run_sync(fixture, zone)
        bid = reads["/businesses"][0]["id"]
        offline = request.app.state.v1_settings.model_copy(
            update={"forecast_backend": "weekday_average"}
        )
        forecast = await ForecastService(offline).forecast(
            reads[f"/businesses/{bid}/sales"], today, inventory
        )
        reads[f"/businesses/{bid}/forecast"] = forecast.model_dump(mode="json")
        entry.reads = reads
    except BaseException:
        saved.pop(key, None)
        raise
    return {"session_id": key, "expires_at": entry.expires}


@router.get("/{session_id}")
async def read_demo(
    session_id: str,
    request: Request,
    response: Response,
    path: str = Query(max_length=256),
) -> Any:
    entry = sessions(request).get(session_id)
    if entry is None:
        raise HTTPException(410, "DEMO_EXPIRED")
    response.headers["Cache-Control"] = "no-store"
    if path not in entry.reads:
        raise HTTPException(403, "DEMO_READ_ONLY")
    return entry.reads[path]


@router.delete("/{session_id}")
async def exit_demo(session_id: str, request: Request) -> dict[str, bool]:
    sessions(request).pop(session_id, None)
    return {"exited": True}
