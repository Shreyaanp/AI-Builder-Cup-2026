"""Closing-time rescue deals, as the passport and the Today feed see them.

The rescue feature itself (owner posts, holds, GET /api/v1/public/rescue) is built separately.
This adapter reads that endpoint in-process when it exists and accepts its likely field names
leniently. Until it exists, demo shops get labelled demo rescues derived from their real menu
and closing time, so the stamp moment and the "Rescue ending soon" card can be shown honestly
as demo.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog
from fastapi import Request
from pydantic import BaseModel

from .discover import distance
from .passport import is_food, local_now

log = structlog.get_logger()
RESCUE_PATH = "/api/v1/public/rescue"
# A demo rescue opens this long before closing, and needs at least this discount.
DEMO_WINDOW_MINUTES = 75
MIN_DISCOUNT = 0.3


class RescueDeal(BaseModel):
    id: str
    shop_id: str
    item: str
    portions: int
    price: int  # minor units
    was_price: int
    currency: str
    pickup_start: float  # epoch seconds
    pickup_end: float
    demo: bool = False


def _when(value: Any) -> float | None:
    if isinstance(value, int | float):
        return float(value) / (1000 if value > 1e11 else 1)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


def parse_deal(row: dict[str, Any]) -> RescueDeal | None:
    """Accepts the rescue endpoint's rows under the names it is likely to use."""
    items = row.get("items") or []
    first = items[0] if items and isinstance(items[0], dict) else {}
    end = _when(row.get("pickup_end") or row.get("ends_at") or row.get("end"))
    start = _when(row.get("pickup_start") or row.get("starts_at") or row.get("start"))
    shop = row.get("shop_id") or row.get("business_id") or (row.get("shop") or {}).get("id")
    price = row.get("price", row.get("rescue_price", first.get("price")))
    was = row.get("was_price", row.get("original_price", first.get("was_price")))
    if not (row.get("id") and shop and end and isinstance(price, int)):
        return None
    return RescueDeal(
        id=str(row["id"]),
        shop_id=str(shop),
        item=str(row.get("item") or first.get("name") or row.get("title") or ""),
        portions=int(row.get("portions", row.get("portions_left", 1)) or 0),
        price=price,
        was_price=was if isinstance(was, int) and was >= price else price,
        currency=str(row.get("currency") or ""),
        pickup_start=start or end - 3600,
        pickup_end=end,
        demo=bool(row.get("demo")),
    )


def closing_today(shop: dict[str, Any], now: float) -> datetime | None:
    """Today's closing time in the shop's zone, from weekly hours or a plain "HH:MM–HH:MM"."""
    local = local_now(str(shop.get("timezone") or "UTC"), now)
    close = ""
    weekly = shop.get("weekly_hours") or []
    if weekly:
        day = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[local.weekday()]
        entry = next((e for e in weekly if e.get("day") == day), None)
        if not entry or entry.get("closed"):
            return None
        close = str(entry.get("close") or "")
    else:
        parts = str(shop.get("hours") or "").replace("-", "–").split("–")
        close = parts[1].strip() if len(parts) == 2 else ""
    try:
        hour, minute = (int(x) for x in close.split(":"))
    except ValueError:
        return None
    if hour >= 24:
        return None
    return local.replace(hour=hour, minute=minute, second=0, microsecond=0)


def demo_rescue(shop: dict[str, Any], now: float) -> RescueDeal | None:
    """Half of the open demo food shops post a rescue for the last 75 minutes before closing."""
    if not shop.get("demo") or not is_food(str(shop.get("category") or "")):
        return None
    close = closing_today(shop, now)
    if close is None:
        return None
    start = close - timedelta(minutes=DEMO_WINDOW_MINUTES)
    day = close.date().isoformat()
    seed = int(hashlib.sha256(f"{shop['id']}/{day}".encode()).hexdigest()[:8], 16)
    if seed % 2:
        return None
    products = [p for p in shop.get("products", []) if p.get("available", True) and p["price"]]
    if not products:
        return None
    product = products[seed % len(products)]
    discount = 0.3 + (seed % 3) * 0.1  # 30-50 % off
    end_ts = close.astimezone(UTC).timestamp()
    if now > end_ts:
        return None
    return RescueDeal(
        id=f"demo-rescue-{shop['id']}-{day}",
        shop_id=shop["id"],
        item=product["name"],
        portions=2 + seed % 6,
        price=max(1, round(product["price"] * (1 - discount))),
        was_price=product["price"],
        currency=str(shop.get("currency") or ""),
        pickup_start=start.astimezone(UTC).timestamp(),
        pickup_end=end_ts,
        demo=True,
    )


def has_rescue_route(request: Request) -> bool:
    return any(getattr(route, "path", "") == RESCUE_PATH for route in request.app.routes)


async def live_rescues(
    request: Request, shops: list[dict[str, Any]], lat: float, lng: float, now: float
) -> list[RescueDeal]:
    """Live deals near (lat, lng): the rescue endpoint when it exists, else demo rescues."""
    if has_rescue_route(request):
        try:
            transport = httpx.ASGITransport(app=request.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://rescue") as client:
                response = await client.get(RESCUE_PATH, params={"lat": lat, "lng": lng}, timeout=5)
            body: Any = response.json() if response.status_code == 200 else []
            rows = body.get("rescues", body.get("deals", [])) if isinstance(body, dict) else body
            if not isinstance(rows, list):
                return []
            deals = [d for r in rows if isinstance(r, dict) and (d := parse_deal(r))]
            return [d for d in deals if d.pickup_end > now and d.portions > 0]
        except Exception:
            log.warning("rescue_feed_unavailable")
            return []
    deals = []
    for shop in shops:
        if shop.get("lat") is None or shop.get("lng") is None:
            continue
        if distance(lat, lng, shop["lat"], shop["lng"]) > 3000:
            continue
        deal = demo_rescue(shop, now)
        if deal is not None:
            deals.append(deal)
    return deals


async def find_rescue(
    request: Request, shop: dict[str, Any], rescue_id: str, now: float
) -> RescueDeal | None:
    if shop.get("lat") is None or shop.get("lng") is None:
        return None
    deals = await live_rescues(request, [shop], shop["lat"], shop["lng"], now)
    return next((d for d in deals if d.id == rescue_id and d.shop_id == shop["id"]), None)
