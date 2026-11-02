"""What closing the day pays back: the day's total and only comparisons that are true.

Rules only, from saved records (HABIT slice 1, change 3). The day's total is what the owner
saved. A comparison is made only with the same weekday (weekly patterns make any other day
misleading), only when both days have saved takings, and never in a shop's first week, because
there is no earlier same weekday then. The forecast line is the number Today showed for the
shop's top item, next to what was sold; it never says the forecast was right. No records, no
reward: a day with no sales returns None.
"""

import math
from datetime import date, timedelta
from typing import Any

from pydantic import BaseModel

from .forecast import Forecast
from .region import money_text
from .rescue import buffer_for

# How far back an earlier same weekday may be (4 weeks), so a comparison stays recent.
SAME_WEEKDAY_WEEKS = 4


class SameWeekday(BaseModel):
    date: date
    weeks_ago: int
    total: int  # minor units
    difference: int  # this day minus that day, minor units


class ForecastCheck(BaseModel):
    item: str
    forecast: int
    sold: float
    unit: str


class CloseReward(BaseModel):
    date: date
    currency: str
    # Saved takings in minor units; None when the day has counts but no amounts.
    total: int | None
    items: float
    same_weekday: SameWeekday | None = None
    forecast: ForecastCheck | None = None


def _takings(sales: list[dict[str, Any]], day: str) -> tuple[list[dict[str, Any]], int]:
    rows = [r for r in sales if r["date"] == day]
    return rows, sum(int(r.get("revenue") or 0) for r in rows)


def same_weekday(sales: list[dict[str, Any]], day: date, total: int) -> SameWeekday | None:
    """The most recent earlier same weekday, up to 4 weeks back, with saved takings."""
    if total <= 0:
        return None
    for weeks in range(1, SAME_WEEKDAY_WEEKS + 1):
        earlier = day - timedelta(days=7 * weeks)
        rows, then = _takings(sales, earlier.isoformat())
        if rows and then > 0:
            return SameWeekday(date=earlier, weeks_ago=weeks, total=then, difference=total - then)
    return None


def forecast_check(
    sales: list[dict[str, Any]], day: date, forecast: Forecast | None
) -> ForecastCheck | None:
    """Today's forecast for the top item (as Today showed it) beside what was sold of it."""
    if forecast is None:
        return None
    prep = sorted((p for p in forecast.predictions if p.date == day), key=lambda p: -p.quantity)
    top = prep[0] if prep else None
    if top is None or top.quantity < 1:
        return None
    sold = sum(
        float(r["quantity"])
        for r in sales
        if r["date"] == day.isoformat() and r["item"].casefold() == top.item.casefold()
    )
    if sold <= 0:
        return None
    return ForecastCheck(
        item=top.item,
        forecast=math.ceil(top.quantity + buffer_for(top, forecast.method)),
        sold=round(sold, 2),
        unit=top.unit,
    )


def close_reward(
    sales: list[dict[str, Any]],
    day: date,
    currency: str,
    forecast: Forecast | None = None,
) -> CloseReward | None:
    """The facts for the close screen and "How did today go?", or None with no sales that day."""
    rows, total = _takings(sales, day.isoformat())
    if not rows:
        return None
    return CloseReward(
        date=day,
        currency=currency,
        total=total or None,
        items=round(sum(float(r["quantity"]) for r in rows), 2),
        same_weekday=same_weekday(sales, day, total),
        forecast=forecast_check(sales, day, forecast),
    )


WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def reward_text(reward: CloseReward | None) -> str:
    """The same facts in one plain English answer, for "How did today go?" in the chat."""
    if reward is None:
        return "No sales are saved for today yet. Close the day and I'll tell you how it went."
    if reward.total is None:
        return f"Today: {reward.items:g} sold. Add amounts when you close the day to see takings."
    text = f"Today: {money_text(reward.total, reward.currency)} saved."
    same = reward.same_weekday
    if same:
        weekday = WEEKDAYS[same.date.weekday()]
        then = (
            f"last {weekday}"
            if same.weeks_ago == 1
            else f"{weekday} {same.date.day} {same.date:%b}"
        )
        if same.difference > 0:
            text += f" That is {money_text(same.difference, reward.currency)} more than {then}."
        elif same.difference < 0:
            text += f" That is {money_text(-same.difference, reward.currency)} less than {then}."
        else:
            text += f" The same as {then}."
    return text
