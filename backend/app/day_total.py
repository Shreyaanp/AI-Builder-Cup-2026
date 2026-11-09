"""Close the day with one total, when the owner doesn't want to type every item.

A total is its own record: never a made-up item, so forecasts, best sellers and the menu are not
touched by it. It counts wherever the day's money is shown. When a day also has item lines, the
lines are the record and the total is ignored.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

from .money import exponent

KIND = "day_total"
# About two years of evenings, the most any screen looks back.
MAX_DAYS = 800


class NewDayTotal(BaseModel):
    date: str = ""
    total: float = Field(gt=0, le=1_000_000_000, allow_inf_nan=False)
    cash: float | None = Field(default=None, ge=0, le=1_000_000_000, allow_inf_nan=False)
    upi: float | None = Field(default=None, ge=0, le=1_000_000_000, allow_inf_nan=False)


class DayTotal(BaseModel):
    date: str
    currency: str
    total: int  # minor units of the shop currency
    cash: int | None = None
    upi: int | None = None


def to_minor_units(amount: float, currency: str) -> int:
    return int(
        (Decimal(str(amount)) * 10 ** exponent(currency)).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def split(total: int, cash: int | None, upi: int | None) -> tuple[int | None, int | None]:
    """Cash and UPI are optional; one of them gives the other. They must add up to the total."""
    if cash is None and upi is None:
        return None, None
    if cash is None:
        cash = total - (upi or 0)
    if upi is None:
        upi = total - cash
    if cash < 0 or upi < 0 or cash + upi != total:
        raise HTTPException(422, "SPLIT_DOES_NOT_ADD_UP")
    return cash, upi


def day_totals(repository: Any, bid: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = repository.feature_docs.scoped(KIND, bid, limit=MAX_DAYS)
    return found


def with_day_totals(repository: Any, bid: str, sales: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sales rows plus one money-only row per day closed with a total. Only for what adds up the
    day's money: anything that goes item by item keeps using the plain sales history."""
    with_items = {row["date"] for row in sales}
    return sales + [
        {
            "date": entry["date"],
            "item": "",
            "quantity": 0,
            "revenue": entry["total"],
            "whole_day": True,
            "cash": entry.get("cash"),
            "upi": entry.get("upi"),
        }
        for entry in day_totals(repository, bid)
        if entry["date"] not in with_items
    ]
