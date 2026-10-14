"""Seven-day item forecasts from approved sales; provider use is explicitly configured."""

import asyncio
import hashlib
import json
import math
import time
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean
from typing import Any, Literal

import anyio
import httpx
from pydantic import BaseModel, Field

from .settings import Settings

PROJECT = "ichiropractic"
DATASET = "chalkboard_analytics"
LOCATION = "asia-south1"

# Parameterized inline data: no permanent or temporary merchant tables are written.
QUERY = """SELECT item, DATE(forecast_timestamp) AS forecast_date,
                  forecast_value, lower_bound, upper_bound FROM AI.FORECAST(
  TABLE (SELECT DATE(JSON_VALUE(r, '$.date')) AS date,
                JSON_VALUE(r, '$.item') AS item,
                FLOAT64(JSON_VALUE(r, '$.quantity')) AS quantity
         FROM UNNEST(JSON_QUERY_ARRAY(@sales)) AS r),
  data_col => 'quantity', timestamp_col => 'date', id_cols => ['item'],
  horizon => @horizon, confidence_level => 0.9)
"""


class Prediction(BaseModel):
    date: date
    item: str
    quantity: float = Field(ge=0, allow_inf_nan=False)
    lower: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    upper: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    unit: str = "item"


class Forecast(BaseModel):
    status: Literal["ready", "insufficient"]
    method: Literal["timesfm", "weekday_average"]
    training_cutoff: date
    horizon_days: int = 7
    predictions: list[Prediction] = Field(default_factory=list)
    insufficient_items: list[str] = Field(default_factory=list)
    fallback_reason: Literal["provider_unavailable"] | None = None
    confidence_level: float | None = None


def training(rows: list[dict[str, Any]], today: date) -> tuple[list[dict[str, Any]], list[str]]:
    grouped: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in rows:
        if row["date"] > today.isoformat():
            continue
        item, day = row["item"], row["date"]
        existing = grouped[item].setdefault(day, {"date": day, "item": item, "quantity": 0.0})
        existing["quantity"] += row["quantity"]
    eligible: list[dict[str, Any]] = []
    insufficient: list[str] = []
    for item, days in sorted(grouped.items()):
        # Missing days are unknown, never zero. Require 28 recorded days for each series.
        if len(days) < 28 or max(days) < (today - timedelta(days=7)).isoformat():
            insufficient.append(item)
        else:
            eligible.extend(days[d] for d in sorted(days))
    return eligible, insufficient


def weekday_average(rows: list[dict[str, Any]], today: date) -> list[Prediction]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["item"]].append(row)
    predictions = []
    for item, history in sorted(grouped.items()):
        recent = history[-28:]
        previous_level, current_level = (
            mean(r["quantity"] for r in recent[:14]),
            mean(r["quantity"] for r in recent[14:]),
        )
        # Multiplicative level trend, bounded so a small denominator cannot explode demand.
        trend = min(1.5, max(0.5, current_level / previous_level)) if previous_level else 1.0
        for offset in range(1, 8):
            day = today + timedelta(days=offset)
            matching = [
                r["quantity"]
                for r in recent
                if date.fromisoformat(r["date"]).weekday() == day.weekday()
            ]
            # Same weekday is the weekly seasonal adjustment; extrapolate the recent level.
            baseline = mean(matching) if matching else mean(r["quantity"] for r in recent)
            quantity = math.floor(baseline * trend ** (offset / 14) + 0.5)
            predictions.append(Prediction(date=day, item=item, quantity=quantity))
    return predictions


class BigQueryClient:
    """Small asynchronous REST adapter using existing Google auth/httpx dependencies."""

    async def query(self, rows: list[dict[str, Any]], horizon: int) -> list[dict[str, Any]]:
        from google.auth import default
        from google.auth.transport.requests import Request

        def credentials() -> str:
            credential, _ = default(scopes=["https://www.googleapis.com/auth/bigquery"])
            credential.refresh(Request())
            return str(credential.token)

        token = await anyio.to_thread.run_sync(credentials)
        body = {
            "query": QUERY,
            "useLegacySql": False,
            "location": LOCATION,
            "defaultDataset": {"projectId": PROJECT, "datasetId": DATASET},
            "timeoutMs": 10000,
            "maxResults": 10000,
            "parameterMode": "NAMED",
            "queryParameters": [
                {
                    "name": "sales",
                    "parameterType": {"type": "STRING"},
                    "parameterValue": {"value": json.dumps(rows)},
                },
                {
                    "name": "horizon",
                    "parameterType": {"type": "INT64"},
                    "parameterValue": {"value": str(horizon)},
                },
            ],
        }
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"https://bigquery.googleapis.com/bigquery/v2/projects/{PROJECT}/queries",
                headers={"Authorization": f"Bearer {token}"},
                json=body,
            )
            response.raise_for_status()
            result = response.json()
        # Incomplete, paged, or failed jobs fall back; never return partial item forecasts.
        if not result.get("jobComplete") or result.get("errors") or result.get("pageToken"):
            raise ValueError("Incomplete forecast")
        fields = [field["name"] for field in result["schema"]["fields"]]
        return [
            dict(zip(fields, [cell["v"] for cell in row["f"]], strict=True))
            for row in result.get("rows", [])
        ]


CACHE_SECONDS = 1800
CACHE_SIZE = 512


class ForecastService:
    def __init__(self, settings: Settings, client: Any = None) -> None:
        self.settings = settings
        self.client = client or BigQueryClient()
        # Same sales, day and units always give the same plan: answer repeats from memory so the
        # Prep plan tile can load freely without repeating BigQuery jobs.
        self.cache: dict[str, tuple[float, Forecast]] = {}

    async def forecast(
        self, rows: list[dict[str, Any]], today: date, inventory: list[dict[str, Any]]
    ) -> Forecast:
        units = sorted((p["name"], p["unit"]) for p in inventory)
        key = hashlib.sha256(
            json.dumps([rows, today.isoformat(), units], sort_keys=True, default=str).encode()
        ).hexdigest()
        now = time.monotonic()
        hit = self.cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
        result = await self._forecast(rows, today, inventory)
        if result.fallback_reason:  # a provider outage is retried next time, not remembered
            return result
        self.cache = {k: v for k, v in self.cache.items() if v[0] > now}
        if len(self.cache) >= CACHE_SIZE:
            self.cache.pop(next(iter(self.cache)))
        self.cache[key] = (now + CACHE_SECONDS, result)
        return result

    async def _forecast(
        self, rows: list[dict[str, Any]], today: date, inventory: list[dict[str, Any]]
    ) -> Forecast:
        eligible, insufficient = training(rows, today)
        result = Forecast(
            status="ready" if eligible else "insufficient",
            method="weekday_average",
            training_cutoff=today,
            insufficient_items=insufficient,
        )
        if not eligible:
            return result
        units = {p["name"]: p["unit"] for p in inventory}
        if self.settings.forecast_backend == "bigquery":
            try:
                async with asyncio.timeout(25):
                    # Horizon also bridges a stale final observation, without filling missing sales.
                    last: dict[str, str] = defaultdict(str)
                    for row in eligible:
                        last[row["item"]] = max(last[row["item"]], row["date"])
                    horizon = max((today - date.fromisoformat(d)).days + 7 for d in last.values())
                    output = await self.client.query(eligible, horizon)
                predictions = [
                    Prediction(
                        date=r["forecast_date"],
                        item=r["item"],
                        quantity=max(0, float(r["forecast_value"])),
                        lower=max(0, float(r["lower_bound"]))
                        if r.get("lower_bound") is not None
                        else None,
                        upper=max(0, float(r["upper_bound"]))
                        if r.get("upper_bound") is not None
                        else None,
                    )
                    for r in output
                    if today.isoformat()
                    < r["forecast_date"]
                    <= (today + timedelta(days=7)).isoformat()
                ]
                expected = {(item, today + timedelta(days=i)) for item in last for i in range(1, 8)}
                if {(p.item, p.date) for p in predictions} != expected or len(predictions) != len(
                    expected
                ):
                    raise ValueError("Incomplete forecast")
                if any(
                    p.lower is not None and p.upper is not None and p.lower > p.upper
                    for p in predictions
                ):
                    raise ValueError("Invalid interval")
                result.method, result.predictions = "timesfm", predictions
                result.confidence_level = (
                    0.9
                    if all(p.lower is not None and p.upper is not None for p in predictions)
                    else None
                )
            except Exception:
                result.fallback_reason = "provider_unavailable"
        if not result.predictions:
            result.predictions = weekday_average(eligible, today)
        for prediction in result.predictions:
            prediction.unit = units.get(prediction.item, "item")
        result.predictions.sort(key=lambda p: (p.date, -p.quantity, p.item))
        return result
