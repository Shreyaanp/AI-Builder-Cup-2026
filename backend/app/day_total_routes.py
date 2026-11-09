"""POST /day/total: the owner saves today's one total (see day_total.py)."""

from __future__ import annotations

import time
from datetime import date

import anyio
from fastapi import APIRouter, HTTPException, Request

from .day_total import KIND, DayTotal, NewDayTotal, split, to_minor_units
from .merchant_routes import consented_owner, store
from .region import shop_currency
from .sales import today_for

router = APIRouter(prefix="/api/v1/businesses")


@router.post("/{business_id}/day/total", response_model=DayTotal)
async def save_day_total(business_id: str, body: NewDayTotal, request: Request) -> DayTotal:
    """The owner read the total back on Check and tapped Save; closing again replaces it."""
    uid = await consented_owner(request)
    service = store(request)
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    if not context["business"]:
        raise HTTPException(404, "Business not found.")
    fields = context["business"]["fields"]
    today = today_for(fields)
    try:
        day = date.fromisoformat(body.date) if body.date else today
    except ValueError:
        day = today
    if day > today:
        raise HTTPException(422, "DAY_IN_FUTURE")
    currency = shop_currency(fields)
    total = to_minor_units(body.total, currency)
    cash, upi = split(
        total,
        None if body.cash is None else to_minor_units(body.cash, currency),
        None if body.upi is None else to_minor_units(body.upi, currency),
    )
    saved = DayTotal(date=day.isoformat(), currency=currency, total=total, cash=cash, upi=upi)
    await anyio.to_thread.run_sync(
        service.feature_docs.put,
        KIND,
        f"{business_id}:{saved.date}",
        business_id,
        time.time(),
        saved.model_dump(),
    )
    return saved
