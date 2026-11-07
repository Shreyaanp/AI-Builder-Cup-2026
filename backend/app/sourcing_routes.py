"""Supplier order requests: the Orders tile, the one-tap Send, and the supplier thread."""

from typing import Any

import anyio
from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from . import sourcing
from .limits import enforce_limits
from .merchant_routes import consented_owner, owner, store

router = APIRouter(prefix="/api/v1")


class OrderVersion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1)


class LineQuantity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    line: int = Field(ge=0, le=50)
    quantity: float = Field(gt=0, le=1_000_000)


class OrderChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1)
    lines: list[LineQuantity] = Field(min_length=1, max_length=50)


class OrderMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=500)


@router.get("/businesses/{business_id}/orders")
async def list_orders(business_id: str, request: Request) -> list[dict[str, Any]]:
    uid = await owner(request)
    found = await anyio.to_thread.run_sync(sourcing.orders, store(request), uid, business_id)
    # Drafts live in the chat card until sent; the Orders tile lists what reached a supplier.
    return [sourcing.public_order(order) for order in found if order["status"] != "draft"]


@router.get("/businesses/{business_id}/orders/{order_id}")
async def read_order(business_id: str, order_id: str, request: Request) -> dict[str, Any]:
    uid = await owner(request)
    order = await anyio.to_thread.run_sync(
        sourcing.get_order, store(request), uid, business_id, order_id
    )
    return sourcing.public_order(order)


@router.post("/businesses/{business_id}/orders/{order_id}/send")
async def send_order(
    business_id: str, order_id: str, body: OrderVersion, request: Request
) -> dict[str, Any]:
    uid = await consented_owner(request)
    await enforce_limits(request, [("coach", uid)])
    return await anyio.to_thread.run_sync(
        sourcing.confirm, store(request), uid, business_id, order_id, body.version
    )


@router.post("/businesses/{business_id}/orders/{order_id}/discard")
async def discard_order(
    business_id: str, order_id: str, body: OrderVersion, request: Request
) -> dict[str, Any]:
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(
        sourcing.discard, store(request), uid, business_id, order_id, body.version
    )


@router.post("/businesses/{business_id}/orders/{order_id}/cancel")
async def cancel_order(
    business_id: str, order_id: str, body: OrderVersion, request: Request
) -> dict[str, Any]:
    """Cancel a sent order: the supplier gets the cancellation at once."""
    uid = await consented_owner(request)
    await enforce_limits(request, [("coach", uid)])
    return await anyio.to_thread.run_sync(
        sourcing.cancel_sent, store(request), uid, business_id, order_id, body.version
    )


@router.post("/businesses/{business_id}/orders/{order_id}/change")
async def change_order(
    business_id: str, order_id: str, body: OrderChange, request: Request
) -> dict[str, Any]:
    """New quantities on a sent order: the supplier is told what changed."""
    uid = await consented_owner(request)
    await enforce_limits(request, [("coach", uid)])
    quantities = {row.line: row.quantity for row in body.lines}
    return await anyio.to_thread.run_sync(
        sourcing.change_quantities,
        store(request),
        uid,
        business_id,
        order_id,
        body.version,
        quantities,
    )


@router.post("/businesses/{business_id}/orders/{order_id}/messages")
async def post_order_message(
    business_id: str, order_id: str, body: OrderMessage, request: Request
) -> dict[str, Any]:
    uid = await consented_owner(request)
    await enforce_limits(request, [("coach", uid)])
    return await anyio.to_thread.run_sync(
        sourcing.owner_message, store(request), uid, business_id, order_id, body.text
    )


@router.post("/businesses/{business_id}/orders/{order_id}/read")
async def read_order_messages(business_id: str, order_id: str, request: Request) -> dict[str, Any]:
    uid = await owner(request)
    return await anyio.to_thread.run_sync(
        sourcing.mark_read, store(request), uid, business_id, order_id
    )


@router.post("/businesses/{business_id}/orders/{order_id}/received")
async def order_received(
    business_id: str, order_id: str, body: OrderVersion, request: Request
) -> dict[str, Any]:
    """Returns the received order and, when menu items match, a stock proposal to review."""
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(
        sourcing.receive, store(request), uid, business_id, order_id, body.version
    )
