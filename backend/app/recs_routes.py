"""Customer events for Recommendations AI. Anonymous, off by default, real actions only."""

from __future__ import annotations

from typing import Any, Literal

import anyio
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from .limits import client_ip, enforce_limits
from .merchant import MerchantRepository
from .retail_recs import AppEvent, EventPipeline

router = APIRouter(prefix="/api/v1/public/recs", tags=["recommendations"])


class EventItem(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    unit: str = Field(min_length=1, max_length=40)


class EventInput(BaseModel):
    kind: Literal["shop_open", "item_open", "ask", "remind", "follow", "ask_owner"]
    # The app's existing anonymous device id; hashed before it leaves the server.
    visitor: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9-]+$")
    shop_id: str = Field(default="", max_length=128)
    item: EventItem | None = None
    query: str = Field(default="", max_length=500)


class EventReceipt(BaseModel):
    accepted: bool
    # False tells the app to stop sending for this session.
    enabled: bool


def to_app_event(body: EventInput, shop: dict[str, Any] | None) -> AppEvent | None:
    """Only events about shared shops and items that really exist on them."""
    if body.kind == "ask":
        return AppEvent(kind="ask", anonymous_id=body.visitor, query=body.query)
    if shop is None:
        return None
    item = None
    if body.item:
        known = {(p["name"], p["unit"]) for p in shop.get("products") or []}
        if (body.item.name, body.item.unit) not in known:
            return None
        item = (body.item.name, body.item.unit)
    return AppEvent(
        kind=body.kind,
        anonymous_id=body.visitor,
        shop_id=shop["id"],
        category=shop.get("category") or "",
        item=item,
    )


@router.post("/events", response_model=EventReceipt, status_code=202)
async def record_event(body: EventInput, request: Request) -> EventReceipt:
    pipeline: EventPipeline | None = getattr(request.app.state, "recs_events", None)
    if pipeline is None or not pipeline.enabled:
        return EventReceipt(accepted=False, enabled=False)
    await enforce_limits(request, [("recs:event", client_ip(request))], anonymous=True)
    shop = None
    store: MerchantRepository | None = request.app.state.merchant
    if body.shop_id and store is not None:
        shop = await anyio.to_thread.run_sync(store.public_shop, body.shop_id)
    event = to_app_event(body, shop)
    accepted = event is not None and pipeline.record(event)
    if pipeline.due():
        await anyio.to_thread.run_sync(pipeline.flush)
    return EventReceipt(accepted=accepted, enabled=True)
