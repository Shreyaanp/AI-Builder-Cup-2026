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
from .region import shop_currency, shop_zone
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
    return datetime.now(shop_timezone(shop_zone(fields))).date()


# Dates as billing apps export them: ISO first, then the day-first forms Indian apps use
# (07/11/2026 is 7 November; Ahmed, 8 Nov), each optionally followed by a time.
DATE_FORMATS = ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y", "%d/%m/%y")
MAX_PROBLEMS = 3


def sale_date(value: str) -> date:
    """The day of one export row, or ValueError."""
    raw = value.strip()
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        pass
    for text in dict.fromkeys((raw, raw.split(" ")[0], raw.split("T")[0])):
        for fmt in DATE_FORMATS:
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
    raise ValueError("date")


def daily_sales(rows: list[list[str]], mapping: ColumnMap, currency: str) -> list[dict[str, Any]]:
    """Reject incomplete/invalid exports rather than replacing days with partial data. The
    rejection names what is wrong in the first rows that fail ("INVALID_SALES_ROWS:" + JSON of
    field, item and value), so the owner can fix the export instead of retrying blind."""
    totals: dict[tuple[str, str], dict[str, Any]] = {}
    problems: list[dict[str, str]] = []
    for row in rows:
        field = "date"
        try:
            day = sale_date(cell(row, mapping.date)).isoformat()
            field = "item"
            item = cell(row, mapping.name).strip()
            if not item:
                raise ValueError("item")
            field = "quantity"
            qty = (
                number(cell(row, mapping.quantity), currency, "quantity")
                if mapping.quantity is not None
                else 1
            )
            if qty is None or qty < 0:
                raise ValueError("quantity")
            field = "total"
            revenue = number(cell(row, mapping.total), currency)
            if revenue is None and mapping.total is None:
                price = number(cell(row, mapping.price), currency)
                revenue = price * qty if price is not None else None
            if revenue is None:
                raise ValueError("Missing revenue")
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
            column = {
                "date": mapping.date,
                "item": mapping.name,
                "quantity": mapping.quantity,
                "total": mapping.total if mapping.total is not None else mapping.price,
            }[field]
            problems.append(
                {
                    "field": field,
                    "item": cell(row, mapping.name).strip()[:60],
                    "value": cell(row, column).strip()[:40] if column is not None else "",
                }
            )
    if problems:
        shown = json.dumps(problems[:MAX_PROBLEMS], ensure_ascii=False)
        raise HTTPException(422, f"INVALID_SALES_ROWS:{len(problems)}:{shown}")
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
        "currency": shop_currency(business["fields"]),
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
