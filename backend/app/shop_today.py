"""The owner's Today page: yesterday's pulse, today's forecast and one true coach line.

Rules only. Every number comes from saved records and is omitted when it does not exist; the
coach line is a structured kind the app phrases in the owner's language, never free text.
Customer page opens and stamps are counted as per-shop daily totals: no person, device or
address is stored.
"""

import math
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Literal

import anyio
from fastapi import APIRouter, Request
from pydantic import BaseModel

from . import brief
from .limits import enforce_limits
from .merchant import MerchantRepository
from .merchant_routes import owner, store
from .playbook import LineTopic, TodayHints, migrate_stored, today_hints
from .rescue import buffer_for, local_now
from .shop_time import shop_timezone

router = APIRouter(prefix="/api/v1/businesses", tags=["today"])

KIND = "shop_daily"
Metric = Literal["views", "stamps", "returning"]

# Festival days (the passport trails open weeks around them). Shown from 14 days before.
FESTIVAL_DAYS: list[tuple[str, str, date]] = [
    ("diwali", "IN", date(2026, 11, 8)),
    ("diwali", "SG", date(2026, 11, 8)),
    ("diwali", "MY", date(2026, 11, 8)),
    ("loy_krathong", "TH", date(2026, 11, 24)),
    ("new_year", "JP", date(2027, 1, 1)),
    ("pongal", "IN", date(2027, 1, 14)),
    ("chinese_new_year", "SG", date(2027, 2, 6)),
    ("chinese_new_year", "MY", date(2027, 2, 6)),
    ("ramadan", "ID", date(2027, 2, 8)),
]
FESTIVAL_LEAD_DAYS = 14
COUNTRY_BY_CURRENCY = {
    "INR": "IN",
    "SGD": "SG",
    "MYR": "MY",
    "THB": "TH",
    "JPY": "JP",
    "IDR": "ID",
}
RAIN_LIKELY = 60


class Pulse(BaseModel):
    """One day's activity; None means "no record", never zero."""

    sales: int | None = None  # minor units of the shop currency
    items: float | None = None
    views: int | None = None
    questions: int | None = None
    stamps: int | None = None
    returning: int | None = None


class TodayForecast(BaseModel):
    item: str
    quantity: int
    unit: str


class LowItem(BaseModel):
    name: str
    stock: int
    runs_out: date | None


class CoachLine(BaseModel):
    kind: Literal["festival", "rain", "busiest_day"]
    festival: str | None = None
    days: int | None = None
    rain: int | None = None
    weekday: int | None = None  # 0 = Monday
    item: str | None = None
    count: int | None = None


class Today(BaseModel):
    date: date
    currency: str
    yesterday: Pulse
    today: Pulse
    forecast: TodayForecast | None
    low_stock: list[LowItem]
    line: CoachLine | None
    demo: bool
    # The shop playbook's order for Today (pulse numbers, "needs you now"); None without one.
    hints: TodayHints | None = None


def _day(fields: dict[str, Any], at: float | None = None) -> str:
    zone = shop_timezone(str(fields.get("timezone") or "Asia/Singapore"))
    return datetime.fromtimestamp(time.time() if at is None else at, zone).date().isoformat()


def count(repository: MerchantRepository, bid: str, metric: Metric, timezone: str) -> None:
    """Add one to a shop's daily total (atomic across instances)."""
    day = _day({"timezone": timezone})

    def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        totals = dict(data or {})
        totals[metric] = int(totals.get(metric, 0)) + 1
        return time.time(), totals

    repository.feature_docs.update(KIND, f"{bid}:{day}", bid, change)


def daily(repository: MerchantRepository, bid: str, day: str) -> dict[str, int]:
    return {k: int(v) for k, v in (repository.feature_docs.get(KIND, f"{bid}:{day}") or {}).items()}


def pulse(
    sales: list[dict[str, Any]],
    questions: list[dict[str, Any]],
    totals: dict[str, int],
    fields: dict[str, Any],
    day: str,
) -> Pulse:
    rows = [r for r in sales if r["date"] == day]
    asked = sum(1 for q in questions if q.get("created") and _day(fields, q["created"]) == day)
    return Pulse(
        sales=sum(r["revenue"] for r in rows) if rows else None,
        items=sum(r["quantity"] for r in rows) if rows else None,
        views=totals.get("views") or None,
        questions=asked or None,
        stamps=totals.get("stamps") or None,
        returning=totals.get("returning") or None,
    )


def low_stock(inventory: list[dict[str, Any]], forecast: brief.Forecast) -> list[LowItem]:
    """Items that run out within two days of forecast demand, or have 5 or fewer left."""
    out = []
    for product in inventory:
        stock = product.get("stock")
        if stock is None or product.get("available") is False:
            continue
        total, runs_out = 0.0, None
        for row in sorted(
            (p for p in forecast.predictions if p.item.casefold() == product["name"].casefold()),
            key=lambda p: p.date,
        ):
            total += row.quantity
            if total >= stock:
                runs_out = row.date
                break
        first = forecast.predictions[0].date if forecast.predictions else None
        soon = runs_out is not None and first is not None and runs_out <= first + timedelta(days=1)
        if stock <= 5 or soon:
            out.append(LowItem(name=product["name"], stock=stock, runs_out=runs_out))
    return sorted(out, key=lambda item: item.stock)[:3]


def coach_line(
    fields: dict[str, Any],
    today: date,
    sales: list[dict[str, Any]],
    weather: brief.Weather | None,
    topics: list[LineTopic] | None = None,
) -> CoachLine | None:
    """The single most useful true thing to say today, or nothing. The shop playbook's topic
    order decides which true line leads; without one, festival, then rain, then busiest day."""
    lines = {
        line.kind: line
        for line in (
            festival_line(fields, today),
            rain_line(fields, weather),
            busiest_line(today, sales),
        )
        if line
    }
    order = [*(t for t in topics or [] if t in lines), "festival", "rain", "busiest_day"]
    return next((lines[kind] for kind in order if kind in lines), None)


def festival_line(fields: dict[str, Any], today: date) -> CoachLine | None:
    country = COUNTRY_BY_CURRENCY.get(str(fields.get("currency") or ""))
    upcoming = [
        (day - today).days
        for _, where, day in FESTIVAL_DAYS
        if where == country and 0 <= (day - today).days <= FESTIVAL_LEAD_DAYS
    ]
    if upcoming:
        days = min(upcoming)
        name = next(
            n for n, where, d in FESTIVAL_DAYS if where == country and (d - today).days == days
        )
        return CoachLine(kind="festival", festival=name, days=days)
    return None


def rain_line(fields: dict[str, Any], weather: brief.Weather | None) -> CoachLine | None:
    # Live weather only; the offline fixture is labelled demo data and only fits demo shops.
    if (
        weather
        and weather.rain_probability >= RAIN_LIKELY
        and (not weather.demo or fields.get("demo"))
    ):
        return CoachLine(kind="rain", rain=weather.rain_probability)
    return None


def busiest_line(today: date, sales: list[dict[str, Any]]) -> CoachLine | None:
    # Busiest weekday over the last four weeks, said on that weekday with last week's number.
    start = (today - timedelta(days=28)).isoformat()
    by_weekday: dict[int, float] = defaultdict(float)
    by_item: dict[str, float] = defaultdict(float)
    for row in sales:
        if start <= row["date"] < today.isoformat():
            by_weekday[date.fromisoformat(row["date"]).weekday()] += row["quantity"]
            by_item[row["item"]] += row["quantity"]
    if len(by_weekday) >= 4 and max(by_weekday, key=lambda d: by_weekday[d]) == today.weekday():
        top = max(by_item, key=lambda i: by_item[i])
        last = (today - timedelta(days=7)).isoformat()
        sold = sum(r["quantity"] for r in sales if r["date"] == last and r["item"] == top)
        if sold:
            return CoachLine(
                kind="busiest_day", weekday=today.weekday(), item=top, count=round(sold)
            )
    return None


@router.get("/{business_id}/today", response_model=Today)
async def today_page(business_id: str, request: Request) -> Today:
    uid = await owner(request)
    await enforce_limits(request, [("owner:read", uid)])
    service = store(request)
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    fields = context["business"]["fields"]
    today = local_now(fields).date()
    yesterday = (today - timedelta(days=1)).isoformat()
    sales, forecast = await brief.today_forecast(
        service, uid, business_id, request.app.state.forecaster, context
    )
    signals = await anyio.to_thread.run_sync(service.recap_signals, uid, business_id)
    weather = await request.app.state.weather.get(fields, today)
    prep = sorted((p for p in forecast.predictions if p.date == today), key=lambda p: -p.quantity)
    # Reading the saved playbook is cheap (no model call); a shop without one keeps the defaults.
    stored = migrate_stored(await anyio.to_thread.run_sync(service.playbook, uid, business_id))
    hints = today_hints(stored, fields) if stored else None
    top = prep[0] if prep else None
    return Today(
        date=today,
        currency=str(fields.get("currency") or "SGD"),
        yesterday=pulse(
            sales,
            signals["questions"],
            await anyio.to_thread.run_sync(daily, service, business_id, yesterday),
            fields,
            yesterday,
        ),
        today=pulse(
            sales,
            signals["questions"],
            await anyio.to_thread.run_sync(daily, service, business_id, today.isoformat()),
            fields,
            today.isoformat(),
        ),
        forecast=TodayForecast(
            item=top.item,
            quantity=math.ceil(top.quantity + buffer_for(top, forecast.method)),
            unit=top.unit,
        )
        if top and top.quantity >= 1
        else None,
        low_stock=low_stock(context["inventory"], forecast),
        line=coach_line(fields, today, sales, weather, hints.line_topics if hints else None),
        demo=bool(fields.get("demo")),
        hints=hints,
    )
