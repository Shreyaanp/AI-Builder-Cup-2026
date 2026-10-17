"""Closing-time rescue deals, as the passport, the Today feed and the rescue map see them.

Deals are the owners' own (`rescue.py`: posted, approved, held in chat). This module is the read
side: live deals near a point, one deal by ID for collecting it at the counter, and what a
customer's chat holds in a deal. Demo shops' deals come from the same store (the demo world
seeds them through the owner flow) and keep their `demo` label.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import anyio
from fastapi import Request
from pydantic import BaseModel

from . import rescue
from .discover import distance
from .merchant import MerchantRepository
from .merchant_routes import store
from .passport import local_now

# Today's 7 and the passport look this far for rescues.
NEARBY_METERS = 3000


class RescueDeal(BaseModel):
    """One deal as a single offer: its item with the most portions left."""

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


class PublicRescue(BaseModel):
    shop_id: str
    shop_name: str
    lat: float
    lng: float
    distance_m: float
    deal: rescue.Deal


def single(deal: rescue.Deal) -> RescueDeal:
    item = max(deal.items, key=lambda p: p.qty_left)
    return RescueDeal(
        id=deal.id,
        shop_id=deal.shop_id,
        item=item.name,
        portions=item.qty_left,
        price=item.price,
        was_price=max(item.was, item.price),
        currency=deal.currency,
        pickup_start=deal.starts,
        pickup_end=deal.ends,
        demo=deal.demo,
    )


def is_live(deal: rescue.Deal, now: float) -> bool:
    return deal.status == "live" and deal.starts <= now < deal.ends


def nearby(
    service: MerchantRepository,
    shops: list[dict[str, Any]],
    lat: float,
    lng: float,
    radius: float,
    now: float,
) -> list[PublicRescue]:
    """Live deals with portions left at shared shops within `radius`, nearest first."""
    found = []
    for shop in shops:
        if shop.get("lat") is None or shop.get("lng") is None:
            continue
        if not rescue.is_food_or_perishable(shop.get("category", "")):
            continue
        d = distance(lat, lng, shop["lat"], shop["lng"])
        if d > radius:
            continue
        for deal in rescue.deals(service, shop["id"], now):
            if is_live(deal, now) and any(p.qty_left for p in deal.items):
                found.append(
                    PublicRescue(
                        shop_id=shop["id"],
                        shop_name=shop["name"],
                        lat=shop["lat"],
                        lng=shop["lng"],
                        distance_m=d,
                        deal=deal,
                    )
                )
    return sorted(found, key=lambda r: (r.distance_m, r.deal.ends))


async def live_rescues(
    request: Request, shops: list[dict[str, Any]], lat: float, lng: float, now: float
) -> list[RescueDeal]:
    """Live deals near (lat, lng) among these shops, one offer per deal."""
    rows = await anyio.to_thread.run_sync(
        nearby, store(request), shops, lat, lng, NEARBY_METERS, now
    )
    return [single(row.deal) for row in rows]


async def find_rescue(
    request: Request, shop: dict[str, Any], rescue_id: str, now: float
) -> rescue.Deal | None:
    """One of this shop's deals by ID, sold out or ended early too (holds still get collected)."""
    found = await anyio.to_thread.run_sync(rescue.deals, store(request), shop["id"], now)
    return next((d for d in found if d.id == rescue_id), None)


def held(service: MerchantRepository, bid: str, rid: str, thread_id: str) -> dict[str, int]:
    """Item name → quantity this chat holds in the deal (the ledger stays private)."""
    state = service.feature_docs.get("rescue", bid) or {}
    data = next((d["data"] for d in state.get("deals", []) if d["id"] == rid), None)
    if data is None:
        return {}
    return {
        h["name"]: int(h["qty"])
        for h in data.get("holds", {}).values()
        if h.get("thread_id") == thread_id
    }


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
