"""Owner analytics on BigQuery: one aggregated row per shop and day, exported nightly.

The export (Cloud Scheduler → ``POST /api/v1/internal/analytics/export``) writes ``shop_daily``:
sales, items sold, customer questions, customer page views, stamps and a forecast-vs-actual
backtest for each shop and day. No names, owner IDs, customer messages or contacts leave the app:
the shop is a pseudonymous ``shop_key`` and every value is a daily count or sum. Each day is a
partition loaded with WRITE_TRUNCATE (load jobs are free; re-running a day replaces it).
Views over it (``impact_daily``, ``forecast_accuracy``, ``latency_daily``) feed the Looker Studio
impact dashboard; ``latency_daily`` aggregates the existing Cloud Run request-log sink and drops
IP addresses, user agents and query strings.

The app reads a shop's last 14 days from ``shop_daily`` for the owner's chart cards (cached), and
falls back to the same rows computed live from the shop's records when BigQuery is off or
unreachable. Only BigQuery has page views (they come from the request logs).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

import anyio
import httpx
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .forecast import training, weekday_average
from .limits import enforce_limits
from .merchant import MerchantRepository
from .merchant_routes import owner, store
from .region import shop_currency, shop_zone
from .rescue import local_now
from .settings import Settings
from .shop_time import shop_timezone

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1")

TABLE = "shop_daily"
DAYS_SHOWN = 14
CACHE_SECONDS = 3600
MAX_SHOPS = 2000
COUNTRY_BY_CURRENCY = {
    "INR": "IN",
    "SGD": "SG",
    "MYR": "MY",
    "THB": "TH",
    "JPY": "JP",
    "IDR": "ID",
    "KRW": "KR",
    "CNY": "CN",
    "VND": "VN",
    "PHP": "PH",
}
SCHEMA = [
    {"name": "date", "type": "DATE", "mode": "REQUIRED"},
    {"name": "shop_key", "type": "STRING", "mode": "REQUIRED"},
    {"name": "category", "type": "STRING"},
    {"name": "country", "type": "STRING"},
    {"name": "currency", "type": "STRING"},
    {"name": "demo", "type": "BOOL"},
    {"name": "sales_minor", "type": "INT64"},
    {"name": "items_sold", "type": "FLOAT64"},
    {"name": "questions", "type": "INT64"},
    {"name": "page_views", "type": "INT64"},
    {"name": "stamps", "type": "INT64"},
    {"name": "returning", "type": "INT64"},
    {"name": "forecast_units", "type": "FLOAT64"},
    {"name": "actual_units", "type": "FLOAT64"},
    {"name": "forecast_method", "type": "STRING"},
    {"name": "exported_at", "type": "TIMESTAMP"},
]
# Customer shop page opens, by shop and hour, from the Cloud Run request-log sink.
VIEWS_QUERY = """
SELECT REGEXP_EXTRACT(httpRequest.requestUrl, r'/api/v1/public/shops/([^/?#]+)(?:[?#]|$)') AS bid,
       TIMESTAMP_TRUNC(timestamp, HOUR) AS hour, COUNT(*) AS views
FROM `{dataset}.run_googleapis_com_requests`
WHERE timestamp >= @start AND timestamp < @end
  AND httpRequest.requestMethod = 'GET' AND httpRequest.status = 200
GROUP BY bid, hour HAVING bid IS NOT NULL
"""
VIEWS = {
    "impact_daily": """
SELECT date, country, currency, demo,
  COUNT(DISTINCT shop_key) AS shops,
  COUNTIF(sales_minor IS NOT NULL) AS shops_with_sales,
  SUM(sales_minor) AS sales_minor, SUM(items_sold) AS items_sold,
  SUM(questions) AS questions, SUM(page_views) AS page_views, SUM(stamps) AS stamps,
  SUM(returning) AS returning,
  SAFE_DIVIDE(SUM(ABS(forecast_units - actual_units)), SUM(actual_units)) AS forecast_wape
FROM `{dataset}.shop_daily` GROUP BY date, country, currency, demo""",
    "forecast_accuracy": """
SELECT date, shop_key, category, country, demo, forecast_method, forecast_units, actual_units,
  forecast_units - actual_units AS error_units,
  SAFE_DIVIDE(ABS(forecast_units - actual_units), actual_units) AS abs_pct_error
FROM `{dataset}.shop_daily` WHERE forecast_units IS NOT NULL AND actual_units IS NOT NULL""",
    "latency_daily": r"""
SELECT DATE(timestamp) AS date,
  httpRequest.requestMethod AS method,
  REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(
    REGEXP_EXTRACT(httpRequest.requestUrl, r'https?://[^/]+(/[^?#]*)'),
    r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/{id}'),
    r'/(shops|businesses|proposals|import|inquiries|tips|photos)/[^/]+', '/\\1/{id}'),
    r'/[0-9]+(/|$)', '/{n}\\1') AS route,
  COUNT(*) AS requests,
  COUNTIF(httpRequest.status >= 500) AS server_errors,
  APPROX_QUANTILES(httpRequest.latency, 100)[OFFSET(50)] * 1000 AS p50_ms,
  APPROX_QUANTILES(httpRequest.latency, 100)[OFFSET(95)] * 1000 AS p95_ms
FROM `{dataset}.run_googleapis_com_requests`
GROUP BY date, method, route""",
}


def shop_key(project: str, bid: str) -> str:
    """A stable pseudonym for a shop. Not anonymisation: whoever holds the shop ID can derive
    it; it keeps the table free of names and readable IDs."""
    return hashlib.sha256(f"chalkboard-analytics:{project}:{bid}".encode()).hexdigest()[:20]


class Day(BaseModel):
    """One shop day. ``None`` means "no record", never zero."""

    date: date
    sales: int | None = None  # minor units of the shop currency
    items: float | None = None
    questions: int | None = None
    views: int | None = None
    stamps: int | None = None
    returning: int | None = None
    forecast: float | None = None
    actual: float | None = None


class Totals(BaseModel):
    sales: int | None = None
    items: float | None = None
    questions: int | None = None
    views: int | None = None
    stamps: int | None = None


class Analytics(BaseModel):
    source: Literal["bigquery", "live"]
    currency: str
    days: list[Day]
    yesterday: Day
    week: Totals
    last_week: Totals
    # Weighted absolute percentage error of the item forecast over the week, 0.12 = 12 %.
    forecast_error: float | None = None
    demo: bool


def _local_day(fields: dict[str, Any], at: float) -> str:
    zone = shop_timezone(shop_zone(fields))
    return datetime.fromtimestamp(at, zone).date().isoformat()


def build_days(
    fields: dict[str, Any],
    sales: list[dict[str, Any]],
    questions: list[dict[str, Any]],
    counters: dict[str, dict[str, Any]],
    days: list[date],
) -> list[Day]:
    """Daily totals from a shop's own records. ``counters`` are the per-day page-open and stamp
    totals (``shop_daily`` feature docs) keyed by ISO date, where they exist."""
    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in sales:
        by_day[row["date"]].append(row)
    asked: dict[str, int] = defaultdict(int)
    for question in questions:
        if question.get("created"):
            asked[_local_day(fields, float(question["created"]))] += 1
    out = []
    for day in days:
        iso = day.isoformat()
        rows = by_day.get(iso, [])
        totals = counters.get(iso) or {}
        result = Day(
            date=day,
            sales=sum(int(r["revenue"]) for r in rows) if rows else None,
            items=round(sum(float(r["quantity"]) for r in rows), 3) if rows else None,
            questions=asked.get(iso) or None,
            views=int(totals["views"]) if totals.get("views") else None,
            stamps=int(totals["stamps"]) if totals.get("stamps") else None,
            returning=int(totals["returning"]) if totals.get("returning") else None,
        )
        if rows:
            # Backtest: what the weekday forecast, trained only on earlier days, said for this day.
            eligible, _ = training([r for r in sales if r["date"] < iso], day - timedelta(days=1))
            predicted = [
                p for p in weekday_average(eligible, day - timedelta(days=1)) if p.date == day
            ]
            if predicted:
                items = {p.item for p in predicted}
                result.forecast = round(sum(p.quantity for p in predicted), 3)
                result.actual = round(
                    sum(float(r["quantity"]) for r in rows if r["item"] in items), 3
                )
        out.append(result)
    return out


def counters_for(repository: MerchantRepository, bid: str, days: list[date]) -> dict[str, Any]:
    """Per-day page-open and stamp totals counted by the app (``shop_daily`` feature docs)."""
    return {
        day.isoformat(): repository.feature_docs.get("shop_daily", f"{bid}:{day}") or {}
        for day in days
    }


def _sum(values: list[Any]) -> Any:
    present = [v for v in values if v is not None]
    return sum(present) if present else None


def summarize(
    days: list[Day], source: Literal["bigquery", "live"], fields: dict[str, Any]
) -> Analytics:
    days = sorted(days, key=lambda d: d.date)[-DAYS_SHOWN:]
    week, previous = days[-7:], days[:-7]

    def totals(chunk: list[Day]) -> Totals:
        return Totals(
            sales=_sum([d.sales for d in chunk]),
            items=_sum([d.items for d in chunk]),
            questions=_sum([d.questions for d in chunk]),
            views=_sum([d.views for d in chunk]),
            stamps=_sum([d.stamps for d in chunk]),
        )

    scored = [d for d in week if d.forecast is not None and d.actual]
    actual = sum(d.actual or 0 for d in scored)
    return Analytics(
        source=source,
        currency=(shop_currency(fields)),
        days=days,
        yesterday=days[-1],
        week=totals(week),
        last_week=totals(previous),
        forecast_error=round(
            sum(abs((d.forecast or 0) - (d.actual or 0)) for d in scored) / actual, 3
        )
        if actual
        else None,
        demo=bool(fields.get("demo")),
    )


class BigQuery:
    """Small REST adapter: parameterised queries and free load jobs, Google default credentials."""

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.project = settings.google_cloud_project
        self.dataset = settings.analytics_dataset
        self.location = settings.analytics_location
        self.transport = transport
        self._credentials: Any = None

    async def _token(self) -> str:
        if self.transport is not None:
            return "test-token"

        def refresh() -> str:
            from google.auth import default
            from google.auth.transport.requests import Request as AuthRequest

            if self._credentials is None:
                self._credentials, _ = default(scopes=["https://www.googleapis.com/auth/bigquery"])
            if not self._credentials.valid:
                self._credentials.refresh(AuthRequest())
            return str(self._credentials.token)

        return await anyio.to_thread.run_sync(refresh)

    def _client(self, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, transport=self.transport)

    async def query(
        self, sql: str, params: dict[str, tuple[str, str]] | None = None
    ) -> list[dict[str, Any]]:
        """Rows as dicts of strings (BigQuery JSON). ``params``: name → (type, value)."""
        body = {
            "query": sql.replace("{dataset}", self.dataset),
            "useLegacySql": False,
            "location": self.location,
            "timeoutMs": 20000,
            "maxResults": 10000,
            "parameterMode": "NAMED",
            "queryParameters": [
                {"name": k, "parameterType": {"type": t}, "parameterValue": {"value": v}}
                for k, (t, v) in (params or {}).items()
            ],
        }
        async with self._client(30) as client:
            response = await client.post(
                f"https://bigquery.googleapis.com/bigquery/v2/projects/{self.project}/queries",
                headers={"Authorization": f"Bearer {await self._token()}"},
                json=body,
            )
            response.raise_for_status()
            result = response.json()
        if not result.get("jobComplete") or result.get("errors") or result.get("pageToken"):
            raise ValueError("Incomplete query")
        if "schema" not in result:
            return []
        names = [f["name"] for f in result["schema"]["fields"]]
        return [
            dict(zip(names, [cell["v"] for cell in row["f"]], strict=True))
            for row in result.get("rows", [])
        ]

    async def load_day(self, day: date, rows: list[dict[str, Any]]) -> None:
        """Replace one day's partition of ``shop_daily`` (created on first load)."""
        config = {
            "configuration": {
                "load": {
                    "destinationTable": {
                        "projectId": self.project,
                        "datasetId": self.dataset,
                        "tableId": f"{TABLE}${day:%Y%m%d}",
                    },
                    "schema": {"fields": SCHEMA},
                    "timePartitioning": {"type": "DAY", "field": "date"},
                    "clustering": {"fields": ["shop_key"]},
                    "sourceFormat": "NEWLINE_DELIMITED_JSON",
                    "writeDisposition": "WRITE_TRUNCATE",
                    "createDisposition": "CREATE_IF_NEEDED",
                }
            },
            "jobReference": {"projectId": self.project, "location": self.location},
        }
        data = "\n".join(json.dumps(row) for row in rows)
        boundary = "chalkboard-analytics"
        body = (
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
            f"{json.dumps(config)}\r\n--{boundary}\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n{data}\r\n--{boundary}--\r\n"
        ).encode()
        token = await self._token()
        async with self._client(60) as client:
            response = await client.post(
                f"https://bigquery.googleapis.com/upload/bigquery/v2/projects/{self.project}/jobs",
                params={"uploadType": "multipart"},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": f"multipart/related; boundary={boundary}",
                },
                content=body,
            )
            response.raise_for_status()
            job = response.json()
            job_id = job["jobReference"]["jobId"]
            for _ in range(60):  # load jobs of a few hundred rows finish in seconds
                if job.get("status", {}).get("state") == "DONE":
                    break
                await asyncio.sleep(1)
                polled = await client.get(
                    f"https://bigquery.googleapis.com/bigquery/v2/projects/{self.project}/jobs/{job_id}",
                    params={"location": self.location},
                    headers={"Authorization": f"Bearer {token}"},
                )
                polled.raise_for_status()
                job = polled.json()
        status = job.get("status", {})
        if status.get("state") != "DONE" or status.get("errorResult"):
            raise ValueError(f"Load job failed: {status.get('errorResult', {}).get('reason')}")

    async def ensure_views(self) -> None:
        for name, sql in VIEWS.items():
            await self.query(f"CREATE OR REPLACE VIEW `{{dataset}}.{name}` AS {sql}")


async def page_views(bigquery: BigQuery, days: list[date]) -> dict[str, list[tuple[datetime, int]]]:
    """Shop page opens by shop ID and UTC hour, around the requested days (a day either side
    covers every shop time zone)."""
    start = datetime.combine(min(days) - timedelta(days=1), datetime.min.time(), UTC)
    end = datetime.combine(max(days) + timedelta(days=2), datetime.min.time(), UTC)
    rows = await bigquery.query(
        VIEWS_QUERY,
        {
            "start": ("TIMESTAMP", start.isoformat()),
            "end": ("TIMESTAMP", end.isoformat()),
        },
    )
    out: dict[str, list[tuple[datetime, int]]] = defaultdict(list)
    for row in rows:
        hour = datetime.fromtimestamp(float(row["hour"]), UTC)
        out[row["bid"]].append((hour, int(row["views"])))
    return out


async def export(
    repository: MerchantRepository, bigquery: BigQuery, settings: Settings, days: list[date]
) -> dict[str, Any]:
    """Build and load ``shop_daily`` for each day. Returns counts for the job log."""
    try:
        views = await page_views(bigquery, days)
    except Exception as error:  # no request-log table yet: export everything else
        log.warning("analytics_views_unavailable", error=type(error).__name__)
        views = {}
    shops = await anyio.to_thread.run_sync(repository.analytics_shops, MAX_SHOPS)
    rows: dict[date, list[dict[str, Any]]] = {day: [] for day in days}
    exported_at = datetime.now(UTC).isoformat()
    for uid, bid in shops:
        try:
            context = await anyio.to_thread.run_sync(repository.context, uid, bid)
            fields = context["business"]["fields"]
            sales = await anyio.to_thread.run_sync(repository.sales_history, uid, bid)
            signals = await anyio.to_thread.run_sync(repository.recap_signals, uid, bid)
            counters = await anyio.to_thread.run_sync(counters_for, repository, bid, days)
        except Exception as error:  # a shop deleted mid-export is skipped, not fatal
            log.warning("analytics_shop_skipped", error=type(error).__name__)
            continue
        opened: dict[str, int] = defaultdict(int)
        for hour, count in views.get(bid, []):
            opened[_local_day(fields, hour.timestamp())] += count
        for iso, count in opened.items():
            counters.setdefault(iso, {})
            counters[iso] = {**counters[iso], "views": count}
        currency = shop_currency(fields)
        for shop_day in build_days(fields, sales, signals["questions"], counters, days):
            rows[shop_day.date].append(
                {
                    "date": shop_day.date.isoformat(),
                    "shop_key": shop_key(settings.google_cloud_project, bid),
                    "category": str(fields.get("category") or "")[:40].casefold(),
                    "country": COUNTRY_BY_CURRENCY.get(currency, ""),
                    "currency": currency,
                    "demo": bool(fields.get("demo")),
                    "sales_minor": shop_day.sales,
                    "items_sold": shop_day.items,
                    "questions": shop_day.questions,
                    "page_views": shop_day.views,
                    "stamps": shop_day.stamps,
                    "returning": shop_day.returning,
                    "forecast_units": shop_day.forecast,
                    "actual_units": shop_day.actual,
                    "forecast_method": "weekday_average" if shop_day.forecast is not None else None,
                    "exported_at": exported_at,
                }
            )
    for day, day_rows in rows.items():
        await bigquery.load_day(day, day_rows)
    await bigquery.ensure_views()
    summary = {"shops": len(shops), "days": len(days), "rows": sum(map(len, rows.values()))}
    log.info("analytics_exported", **summary)
    return summary


class AnalyticsReader:
    """The owner's last 14 days, from BigQuery when on, cached; live records otherwise."""

    def __init__(self, settings: Settings, bigquery: BigQuery | None = None) -> None:
        self.settings = settings
        self.bigquery = bigquery or BigQuery(settings)
        self.cache: dict[str, tuple[float, list[Day]]] = {}

    async def stored(self, bid: str, start: date, end: date) -> list[Day]:
        key = f"{bid}:{end}"
        now = time.monotonic()
        hit = self.cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
        rows = await self.bigquery.query(
            f"SELECT * FROM `{{dataset}}.{TABLE}` WHERE shop_key = @key "
            "AND date BETWEEN @start AND @end ORDER BY date",
            {
                "key": ("STRING", shop_key(self.settings.google_cloud_project, bid)),
                "start": ("DATE", start.isoformat()),
                "end": ("DATE", end.isoformat()),
            },
        )

        def whole(value: str | None) -> int | None:
            return None if value is None else int(float(value))

        def real(value: str | None) -> float | None:
            return None if value is None else float(value)

        days = [
            Day(
                date=date.fromisoformat(r["date"]),
                sales=whole(r["sales_minor"]),
                items=real(r["items_sold"]),
                questions=whole(r["questions"]),
                views=whole(r["page_views"]),
                stamps=whole(r["stamps"]),
                returning=whole(r["returning"]),
                forecast=real(r["forecast_units"]),
                actual=real(r["actual_units"]),
            )
            for r in rows
        ]
        self.cache = {k: v for k, v in self.cache.items() if v[0] > now}
        self.cache[key] = (now + CACHE_SECONDS, days)
        return days

    async def forget(self, bids: list[str]) -> None:
        """Erasure: delete these shops' rows (DML on load-job tables applies at once)."""
        self.cache = {k: v for k, v in self.cache.items() if k.split(":")[0] not in bids}
        if self.settings.analytics_backend != "bigquery" or not bids:
            return
        keys = [shop_key(self.settings.google_cloud_project, bid) for bid in bids]
        await self.bigquery.query(
            f"DELETE FROM `{{dataset}}.{TABLE}` WHERE shop_key IN UNNEST(SPLIT(@keys))",
            {"keys": ("STRING", ",".join(keys))},
        )

    async def read(self, repository: MerchantRepository, uid: str, bid: str) -> Analytics:
        context = await anyio.to_thread.run_sync(repository.context, uid, bid)
        if not context["business"]:
            raise HTTPException(404, "Business not found.")
        fields = context["business"]["fields"]
        yesterday = local_now(fields).date() - timedelta(days=1)
        wanted = [yesterday - timedelta(days=i) for i in range(DAYS_SHOWN - 1, -1, -1)]
        sales = await anyio.to_thread.run_sync(repository.sales_history, uid, bid)
        signals = await anyio.to_thread.run_sync(repository.recap_signals, uid, bid)
        counters = await anyio.to_thread.run_sync(counters_for, repository, bid, wanted)
        live = {
            d.date: d for d in build_days(fields, sales, signals["questions"], counters, wanted)
        }
        if self.settings.analytics_backend == "bigquery":
            try:
                async with asyncio.timeout(15):
                    stored = await self.stored(bid, wanted[0], wanted[-1])
                if stored:
                    # Days the nightly export has not reached yet come from the live records.
                    merged = {**live, **{d.date: d for d in stored}}
                    return summarize(list(merged.values()), "bigquery", fields)
            except Exception as error:
                log.warning("analytics_read_failed", error=type(error).__name__)
        return summarize(list(live.values()), "live", fields)


@router.get("/businesses/{business_id}/analytics", response_model=Analytics)
async def shop_analytics(business_id: str, request: Request) -> Analytics:
    uid = await owner(request)
    await enforce_limits(request, [("owner:read", uid)])
    reader: AnalyticsReader = request.app.state.analytics
    return await reader.read(store(request), uid, business_id)


async def verify_scheduler(
    request: Request, settings: Settings, *, caller: str | None = None, audience: str | None = None
) -> None:
    """Only the configured scheduler service account may run the export (Google OIDC token)."""
    caller = settings.analytics_export_caller if caller is None else caller
    audience = settings.analytics_export_audience if audience is None else audience
    if not (caller and audience):
        raise HTTPException(404, "Not found.")
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Missing token.")

    def check() -> dict[str, Any]:
        from google.auth.transport.requests import Request as AuthRequest
        from google.oauth2 import id_token

        return dict(
            id_token.verify_oauth2_token(
                header.removeprefix("Bearer "),
                AuthRequest(),
                audience=audience,
            )
        )

    try:
        claims = await anyio.to_thread.run_sync(check)
    except Exception:
        raise HTTPException(401, "Invalid token.") from None
    if claims.get("email") != caller or not claims.get("email_verified"):
        raise HTTPException(403, "Not allowed.")


@router.post("/internal/analytics/export")
async def run_export(request: Request, days: int = 2) -> dict[str, Any]:
    """Nightly: yesterday (UTC) and the day before, so late sales entries are picked up."""
    settings: Settings = request.app.state.v1_settings
    await verify_scheduler(request, settings)
    if settings.analytics_backend != "bigquery":
        raise HTTPException(409, "Analytics export is off.")
    today = datetime.now(UTC).date()
    count = max(1, min(days, 60))
    wanted = [today - timedelta(days=i) for i in range(count, 0, -1)]
    reader: AnalyticsReader = request.app.state.analytics
    return await export(store(request), reader.bigquery, settings, wanted)
