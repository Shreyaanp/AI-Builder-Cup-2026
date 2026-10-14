"""Consented, owner-scoped private planning API."""

from datetime import date, timedelta
from typing import Any, Literal

import anyio
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .merchant import Approval
from .merchant_routes import consented_owner, store
from .planning import (
    Observation,
    backtest,
    demo_history,
    forecast,
    preparation,
    sales_forecast,
    stale,
)
from .sales import today_for

router = APIRouter(prefix="/api/v1/businesses/{business_id}/planning/{product_id}")


class PlanningInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["demo", "owner"] = "owner"
    ready_stock: int = Field(default=0, ge=0, le=1000000, strict=True)
    capacity: int = Field(default=0, ge=0, le=1000000, strict=True)


class Decision(PlanningInput):
    decision: Literal["accepted", "edited", "declined"]
    quantity: int = Field(ge=0, le=1000000, strict=True)


async def state_for(
    request: Request,
    bid: str,
    pid: str,
    action: str = "read",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    uid = await consented_owner(request)
    state = await anyio.to_thread.run_sync(
        store(request).planning, uid, bid, pid, action, payload or {}
    )
    if state.get("plan"):
        state["plan"]["stale"] = stale(state["plan"], date.today())
    return {**state, "today": date.today().isoformat()}


@router.get("")
async def history(business_id: str, product_id: str, request: Request) -> dict[str, Any]:
    return await state_for(request, business_id, product_id)


@router.post("/demo")
async def demo(business_id: str, product_id: str, request: Request) -> dict[str, Any]:
    return await state_for(
        request, business_id, product_id, "prepare", {"observations": demo_history(date.today())}
    )


@router.post("/observations")
async def observation(
    business_id: str, product_id: str, body: Observation, request: Request
) -> dict[str, Any]:
    if body.source != "owner" or body.date != date.today():
        raise HTTPException(422, "Enter today's owner observation.")
    return await state_for(
        request,
        business_id,
        product_id,
        "prepare",
        {"observations": [body.model_dump(mode="json")]},
    )


@router.post("/approve")
async def approve(
    business_id: str, product_id: str, body: Approval, request: Request
) -> dict[str, Any]:
    return await state_for(request, business_id, product_id, "approve", body.model_dump())


@router.post("/forecast")
async def calculate(
    business_id: str, product_id: str, body: PlanningInput, request: Request
) -> dict[str, Any]:
    state = await state_for(request, business_id, product_id)
    uid = await consented_owner(request)
    products = await anyio.to_thread.run_sync(store(request).inventory, uid, business_id)
    product = next(p for p in products if p["id"] == product_id)
    rows = [r for r in state.get("observations", []) if r["source"] == body.source]
    result = forecast(rows, date.today() + timedelta(days=1), product["unit"])
    if body.source == "owner":
        business = (await anyio.to_thread.run_sync(store(request).context, uid, business_id))[
            "business"
        ]
        sales = await anyio.to_thread.run_sync(store(request).sales_history, uid, business_id)
        result = (
            sales_forecast(
                sales,
                today_for(business["fields"]) + timedelta(days=1),
                product["name"],
                product["unit"],
            )
            or result
        )
    result.update(
        business_id=business_id,
        product_id=product_id,
        product_name=product["name"],
        source="sales" if result["method"] == "same_weekday_four_weeks" else body.source,
        evaluation=backtest(rows, product["unit"]),
    )
    if result["source"] == "sales":
        result["evaluation"] = {"n": 0, "mae": None, "naive_mae": None, "prefer_naive": False}
    if result["status"] == "ready":
        chosen = result["baseline"]
        if result["evaluation"]["prefer_naive"]:
            last = max(
                (
                    r
                    for r in rows
                    if r["status"] == "complete" and r["date"] <= date.today().isoformat()
                ),
                key=lambda r: r["date"],
            )
            chosen = last["sold"]
        result.update(
            planning_baseline=chosen, **preparation(chosen, body.ready_stock, body.capacity)
        )
    return result


@router.post("/decision")
async def decision(
    business_id: str, product_id: str, body: Decision, request: Request
) -> dict[str, Any]:
    result = await calculate(business_id, product_id, body, request)
    if result["status"] != "ready" or body.quantity > body.capacity:
        raise HTTPException(422, "A current forecast and quantity within capacity are required.")
    if (body.decision == "accepted" and body.quantity != result["suggestion"]) or (
        body.decision == "declined" and body.quantity != 0
    ):
        raise HTTPException(422, "Accept the suggestion exactly, edit it, or decline with zero.")
    plan = {"created_date": date.today().isoformat(), "forecast": result, **body.model_dump()}
    return await state_for(request, business_id, product_id, "prepare", {"plan": plan})
