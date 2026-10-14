"""Validated daily sales and sealed import snapshots; no provider calls."""

import hashlib
import json
import secrets
import time
from collections import defaultdict
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .imports import ColumnMap, cell, number
from .money import exponent
from .shop_time import shop_timezone

MAX_DAYS = 365
MAX_ITEMS = 500


class DailySale(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    date: date
    item: str = Field(min_length=1, max_length=180)
    quantity: float = Field(ge=0, le=1_000_000, allow_inf_nan=False)
    revenue: int = Field(ge=0, le=100_000_000_000, strict=True)


def today_for(fields: dict[str, Any]) -> date:
    return datetime.now(shop_timezone(fields.get("timezone") or "Asia/Singapore")).date()


def daily_sales(rows: list[list[str]], mapping: ColumnMap, currency: str) -> list[dict[str, Any]]:
    """Reject incomplete/invalid exports rather than replacing days with partial data."""
    totals: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        try:
            day = date.fromisoformat(cell(row, mapping.date)[:10]).isoformat()
            item = cell(row, mapping.name).strip()
            qty = number(cell(row, mapping.quantity)) if mapping.quantity is not None else 1
            revenue = number(cell(row, mapping.total))
            if revenue is None and mapping.total is None:
                price = number(cell(row, mapping.price))
                revenue = price * qty if price is not None and qty is not None else None
            if qty is None or revenue is None:
                raise ValueError("Missing quantity or revenue")
            minor = int(
                (Decimal(str(revenue)) * 10 ** exponent(currency)).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )
            )
            sale = DailySale(
                date=date.fromisoformat(day), item=item, quantity=qty, revenue=minor
            ).model_dump(mode="json")
            key = (day, item.casefold())
            if key in totals:
                sale["quantity"] += totals[key]["quantity"]
                sale["revenue"] += totals[key]["revenue"]
                sale["item"] = totals[key]["item"]
                DailySale.model_validate(sale)
            totals[key] = sale
        except (ValueError, ArithmeticError):
            raise HTTPException(422, "INVALID_SALES_ROWS") from None
    result = sorted(totals.values(), key=lambda r: (r["date"], r["item"].casefold()))
    validate_capacity(result)
    return result


def validate_capacity(rows: list[dict[str, Any]]) -> None:
    if (
        len({r["date"] for r in rows}) > MAX_DAYS
        or len({r["item"].casefold() for r in rows}) > MAX_ITEMS
    ):
        raise HTTPException(413, "SALES_HISTORY_FULL")


def sales_days(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    days: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        days[row["date"]].append(row)
    return dict(days)


def prepare_import(business: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    rows = [DailySale.model_validate(r).model_dump(mode="json") for r in rows]
    if not rows:
        raise HTTPException(422, "EMPTY_SALES")
    validate_capacity(rows)
    snapshot = {
        "business_id": business["id"],
        "revision": business["revision"],
        "currency": business["fields"].get("currency") or "SGD",
        "sales": rows,
    }
    text = json.dumps(snapshot, sort_keys=True, ensure_ascii=False)
    if len(text.encode()) > 800_000:
        raise HTTPException(413, "FILE_TOO_LARGE")
    return {
        "id": str(uuid4()),
        "digest": hashlib.sha256(text.encode()).hexdigest(),
        "expires": time.time() + 600,
        "snapshot": snapshot,
    }


def check_import(proposal: dict[str, Any], digest: str, revision: int) -> None:
    if not secrets.compare_digest(proposal["digest"], digest):
        raise HTTPException(409, "Review the exact sales import.")
    if proposal.get("receipt"):
        return
    if proposal["expires"] < time.time() or proposal["snapshot"]["revision"] != revision:
        raise HTTPException(409, "Sales review expired or shop changed; import again.")


def fingerprint(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
