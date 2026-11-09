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
import structlog
from fastapi import APIRouter, Request
from pydantic import BaseModel

from . import brief
from .close_reward import CloseReward, close_reward
from .expenses import spent_on
from .limits import enforce_limits
from .merchant import MerchantRepository
from .merchant_routes import owner, store
from .owner_promise import Promise, promise_for
from .playbook import LineTopic, TodayHints, migrate_stored, today_hints
from .product_source import Source, source_of
from .region import shop_currency, shop_zone
from .rescue import buffer_for, local_now
from .shop_time import shop_timezone
from .supply_chain import runs_out
from .supply_coming import arrivals_by_item

router = APIRouter(prefix="/api/v1/businesses", tags=["today"])
log = structlog.get_logger(__name__)

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
    # Bought stock is ordered, made items are made again, unknown ones ask once (OB-239).
    source: Source = "bought"
    product_id: str | None = None
    # How many usually sell on this weekday, for "Make 20 more now? Usually 26 sell on
    # Tuesdays." (OB-310); None without four weeks of sales to say it from.
    usual: int | None = None


class UsualSales(BaseModel):
    """What usually sells on today's weekday, by item name: the menu marks stock below it as
    low, gently (OB-310). Only items with sales on this weekday in the last four weeks."""

    weekday: int  # 0 = Monday
    items: dict[str, int]


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
    # None: feature disabled; never infer zero from missing facts.
    has_customer_stamp: bool | None = None
    # What the owner wrote down last night for this morning, while still open (HABIT change 4).
    promise: Promise | None = None
    # No forecast yet: what the latest closed day sold, so Home says what to make (OB-329).
    last_day: brief.LastDay | None = None
    # Expenses noted for yesterday and today (minor units; 0 with none), for "spent · left".
    spent_yesterday: int = 0
    spent_today: int = 0


def _day(fields: dict[str, Any], at: float | None = None) -> str:
    zone = shop_timezone(shop_zone(fields))
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


def has_customer_stamp(repository: MerchantRepository, bid: str) -> bool:
    """Check the shop's complete aggregate history, including stamps before yesterday."""
    return repository.feature_docs.any_positive(KIND, bid, "stamps")


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


def usual_sales(sales: list[dict[str, Any]], today: date) -> dict[str, int]:
    """The average sold per item on today's weekday over the last four weeks, whole numbers;
    an item that sold none of those days is left out (OB-310)."""
    start = (today - timedelta(days=28)).isoformat()
    days: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in sales:
        day = date.fromisoformat(row["date"])
        if start <= row["date"] < today.isoformat() and day.weekday() == today.weekday():
            days[row["item"]][row["date"]] += float(row["quantity"])
    return {
        item: usual
        for item, sold in days.items()
        if (usual := math.floor(sum(sold.values()) / len(sold) + 0.5)) > 0
    }


def low_stock(
    inventory: list[dict[str, Any]],
    forecast: brief.Forecast,
    today: date,
    category: str = "",
    arrivals: dict[str, list[tuple[str, float]]] | None = None,
    usual: dict[str, int] | None = None,
) -> list[LowItem]:
    """Stock that runs out by tomorrow, or has 5 or fewer left. The run-out day is the supply
    tile's (OB-238), counting what is on order from the day it arrives (OB-263). Each row says
    if the shop buys it (an order), makes it (make more) or has not said (one question), so a
    made item never becomes a supplier order (OB-239)."""
    predictions = {"predictions": [p.model_dump(mode="json") for p in forecast.predictions]}
    out = []
    for product in inventory:
        stock = product.get("stock")
        if stock is None or product.get("available") is False:
            continue
        found = runs_out(product, predictions, today, (arrivals or {}).get(product["name"]))
        day = date.fromisoformat(found) if found else None
        if stock <= 5 or (day is not None and day <= today + timedelta(days=1)):
            out.append(
                LowItem(
                    name=product["name"],
                    stock=stock,
                    runs_out=day,
                    source=source_of(product, category),
                    product_id=product.get("id"),
                    usual=(usual or {}).get(product["name"]),
                )
            )
    # Made items never push out a supply the shop must order: what it buys or has not said comes
    # first, the one that runs out first leading, then the fewest left (OB-244).
    return sorted(
        out,
        key=lambda item: (item.source == "made", item.runs_out or date.max, item.stock),
    )[:3]


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
    customer_stamp = None
    if request.app.state.v1_settings.qr_poster_enabled:
        try:
            customer_stamp = await anyio.to_thread.run_sync(
                has_customer_stamp, service, business_id
            )
        except Exception:  # Optional promotion must not take the owner's daily facts away.
            log.warning("customer_stamp_history_unavailable")
    return Today(
        date=today,
        currency=(shop_currency(fields)),
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
        low_stock=low_stock(
            context["inventory"],
            forecast,
            today,
            str(fields.get("category") or ""),
            await anyio.to_thread.run_sync(
                arrivals_by_item, service, uid, business_id, context["inventory"]
            ),
            usual=usual_sales(sales, today),
        ),
        line=coach_line(fields, today, sales, weather, hints.line_topics if hints else None),
        demo=bool(fields.get("demo")),
        hints=hints,
        has_customer_stamp=customer_stamp,
        promise=await anyio.to_thread.run_sync(promise_for, service, business_id, today),
        last_day=brief.last_day(
            sales, today, context["inventory"], str(fields.get("category") or ""), forecast
        ),
        spent_yesterday=await anyio.to_thread.run_sync(
            spent_on, service, business_id, today - timedelta(days=1)
        ),
        spent_today=await anyio.to_thread.run_sync(spent_on, service, business_id, today),
    )


@router.get("/{business_id}/usual-sales", response_model=UsualSales)
async def usual_today(business_id: str, request: Request) -> UsualSales:
    """The menu's gentle "low" mark: saved sales only, no forecast or model call (OB-310)."""
    uid = await owner(request)
    await enforce_limits(request, [("owner:read", uid)])
    service = store(request)
    fields = (await anyio.to_thread.run_sync(service.owned_business, uid, business_id))["fields"]
    today = local_now(fields).date()
    sales = await anyio.to_thread.run_sync(service.sales_history, uid, business_id)
    return UsualSales(weekday=today.weekday(), items=usual_sales(sales, today))


@router.get("/{business_id}/day/{day}/reward", response_model=CloseReward | None)
async def day_reward(business_id: str, day: date, request: Request) -> CloseReward | None:
    uid = await owner(request)
    await enforce_limits(request, [("owner:read", uid)])
    service = store(request)
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    fields = context["business"]["fields"]
    if day == local_now(fields).date():
        # Same forecast and cache as Today, so the number matches what the owner saw there.
        sales, forecast = await brief.today_forecast(
            service, uid, business_id, request.app.state.forecaster, context
        )
    else:
        sales = await anyio.to_thread.run_sync(service.sales_history, uid, business_id)
        forecast = None
    return close_reward(sales, day, shop_currency(fields), forecast)
