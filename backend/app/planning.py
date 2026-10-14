"""Deterministic per-product planning; no providers or business writes."""

import hashlib
import json
import math
from copy import deepcopy
from datetime import date, timedelta
from statistics import mean
from typing import Any, Literal, cast

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: date
    status: Literal["complete", "closed", "missing", "stockout"]
    sold: int | None = Field(default=None, ge=0, le=1000000, strict=True)
    waste: int | None = Field(default=None, ge=0, le=1000000, strict=True)
    source: Literal["owner", "demo"] = "owner"

    @model_validator(mode="after")
    def counts(self) -> "Observation":
        if (self.status in {"complete", "stockout"}) != (self.sold is not None):
            raise ValueError("Complete/stockout require sold; closed/missing must omit sold.")
        return self


def demo_history(today: date) -> list[dict[str, Any]]:
    counts = [60, 130, 75, 60, 130, 90, 60, 130, 75, 60, 80, 100, 90, 110]
    return [
        Observation(
            date=today - timedelta(days=13 - i),
            status=cast(
                Literal["complete", "closed", "missing", "stockout"],
                {2: "closed", 5: "missing", 8: "stockout"}.get(i, "complete"),
            ),
            sold=None if i in {2, 5} else count,
            source="demo",
        ).model_dump(mode="json")
        for i, count in enumerate(counts)
    ]


def forecast(rows: list[dict[str, Any]], cutoff: date, unit: str, n: int = 4) -> dict[str, Any]:
    usable = sorted(
        (r for r in rows if r["status"] == "complete" and r["date"] < cutoff.isoformat()),
        key=lambda r: r["date"],
    )[-n:]
    result: dict[str, Any] = {
        "status": "ready" if len(usable) >= 3 else "insufficient",
        "method": "recent_complete_mean",
        "forecast_date": cutoff.isoformat(),
        "training_cutoff": (cutoff - timedelta(days=1)).isoformat(),
        "horizon_days": 1,
        "window": [r["date"] for r in usable],
        "n": len(usable),
        "unit": unit,
        "source": "demo" if any(r["source"] == "demo" for r in usable) else "owner",
        "dataset_version": "daily-v1",
        "stockout_dates": [
            r["date"] for r in rows if r["status"] == "stockout" and r["date"] < cutoff.isoformat()
        ],
        "event_adjustment": "none",
    }
    if len(usable) >= 3:
        values = [r["sold"] for r in usable]
        result.update(baseline=mean(values), range_seen=[min(values), max(values)])
    return result


def preparation(baseline: float, ready_stock: int, capacity: int) -> dict[str, int]:
    needed = max(0, math.ceil(baseline) - ready_stock)
    suggestion = min(needed, capacity)
    return {"needed": needed, "suggestion": suggestion, "gap": needed - suggestion}


def backtest(rows: list[dict[str, Any]], unit: str) -> dict[str, Any]:
    errors: list[float] = []
    naive: list[float] = []
    for actual in sorted(rows, key=lambda r: r["date"]):
        trained = forecast(rows, date.fromisoformat(actual["date"]), unit)
        if actual["status"] != "complete" or trained["status"] != "ready":
            continue
        prior = sorted(
            (r for r in rows if r["status"] == "complete" and r["date"] < actual["date"]),
            key=lambda r: r["date"],
        )
        errors.append(abs(actual["sold"] - trained["baseline"]))
        naive.append(abs(actual["sold"] - prior[-1]["sold"]))
    mae, naive_mae = (mean(errors), mean(naive)) if errors else (None, None)
    return {
        "n": len(errors),
        "mae": mae,
        "naive_mae": naive_mae,
        "prefer_naive": bool(mae is not None and naive_mae is not None and mae > naive_mae),
    }


def stale(plan: dict[str, Any], today: date) -> bool:
    return (today - date.fromisoformat(plan["created_date"])).days > 1


def change(
    state: dict[str, Any], action: str, payload: dict[str, Any], today: date
) -> dict[str, Any]:
    """Adapters persist sealed changes atomically. Demo and real histories stay separate."""
    state = deepcopy(state)
    if action == "prepare":
        text = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        state["pending"] = {
            "snapshot": payload,
            "digest": hashlib.sha256(text.encode()).hexdigest(),
            "created_date": today.isoformat(),
        }
    elif action == "approve":
        pending = state.get("pending")
        if (
            not pending
            or pending["digest"] != payload["digest"]
            or pending["created_date"] != today.isoformat()
        ):
            raise HTTPException(409, "Review the current exact planning proposal.")
        snapshot = pending["snapshot"]
        rows = state.setdefault("observations", [])
        for row in snapshot.get("observations", []):
            old = next(
                (r for r in rows if r["date"] == row["date"] and r["source"] == row["source"]), None
            )
            if old:
                state.setdefault("audit", []).append({**old, "corrected_on": today.isoformat()})
                rows.remove(old)
            rows.append(row)
        if "plan" in snapshot:
            state["plan"] = snapshot["plan"]
        state.pop("pending")
    if len(json.dumps(state).encode()) > 500000:
        raise HTTPException(413, "Planning history is full; no changes saved.")
    return state
