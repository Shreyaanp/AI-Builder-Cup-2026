"""Does the owner come back, and does the app help when they do? One daily row per shop.

HABIT section 9: today nothing measures owner return. The app counts, per shop and shop-local
day, how often Today opened, which prompts it showed, which the owner acted on, whether the day
was closed and how long the first action took. Same privacy rule as ``shop_daily``: counts
only, no names, owner IDs, customer data or free text, keyed by shop and day here and by the
pseudonymous ``shop_key`` in the nightly export. Kinds are an allow-list, so nothing else can be
written. Demo shops are never counted, the public demo's sandbox refuses the route, and a write
error is logged and dropped: counting never blocks the owner.
"""

import time
from datetime import date, datetime
from typing import Any, Literal

import anyio
import structlog
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .limits import enforce_limits
from .merchant import MerchantRepository
from .merchant_routes import consented_owner, store
from .region import shop_zone
from .shop_time import shop_timezone

router = APIRouter(prefix="/api/v1/businesses", tags=["today"])
log = structlog.get_logger(__name__)

KIND = "owner_habit"
Event = Literal[
    "opened",
    "prompt_shown",
    "action_done",
    "closed",
    "push_shown",
    "push_opened",
    "promise_set",
    "promise_done",
]
# Today's "needs you now" kinds (todayPlan.ts) and the reminder kinds (reminders.py).
PROMPT_KINDS = frozenset(
    {"reply", "closeDay", "menu", "low", "soldOut", "step", "facts", "morning", "evening"}
)
# Events counted per kind; the rest are one plain count for the day.
KINDED: frozenset[str] = frozenset({"prompt_shown", "action_done", "push_shown", "push_opened"})
# Slower than this is not a first action worth timing (the app was left open).
MAX_SECONDS = 3600
MAX_EVENTS = 20
# The columns of a day's row, for the export: every one is a count or a number of seconds.
COUNTS = ("opened", "closed", "promise_set", "promise_done")


class HabitEvent(BaseModel):
    event: Event
    kind: str | None = Field(default=None, max_length=20)
    # Seconds from opening the app to this action (the first action of the visit only).
    seconds: int | None = Field(default=None, ge=0, le=MAX_SECONDS)


class HabitEvents(BaseModel):
    events: list[HabitEvent] = Field(min_length=1, max_length=MAX_EVENTS)


def field_for(item: HabitEvent) -> str | None:
    """The counter an event adds to, or None when it is not one we count."""
    if item.event in KINDED:
        return f"{item.event}:{item.kind}" if item.kind in PROMPT_KINDS else None
    return item.event


def apply(data: dict[str, Any] | None, events: list[HabitEvent]) -> dict[str, int]:
    """Add the events to a day's counters. Pure, so a retried transaction counts once."""
    row = {key: int(value) for key, value in (data or {}).items()}
    for item in events:
        name = field_for(item)
        if name is None:
            continue
        # A day is closed or not; saving it twice is still one close.
        row[name] = 1 if name == "closed" else row.get(name, 0) + 1
        if (
            item.event == "action_done"
            and item.seconds is not None
            and "seconds_to_first_action" not in row
        ):
            row["seconds_to_first_action"] = item.seconds
    return row


def record(repository: MerchantRepository, bid: str, day: str, events: list[HabitEvent]) -> None:
    repository.feature_docs.update(
        KIND, f"{bid}:{day}", bid, lambda data: (time.time(), apply(data, events))
    )


def daily(repository: MerchantRepository, bid: str, day: str) -> dict[str, int]:
    return {k: int(v) for k, v in (repository.feature_docs.get(KIND, f"{bid}:{day}") or {}).items()}


def export_row(counts: dict[str, int]) -> dict[str, Any]:
    """A day's counters as the export's columns: counts, per-kind counts and seconds only."""

    def kinds(event: str) -> list[dict[str, Any]]:
        prefix = f"{event}:"
        return [
            {"kind": key[len(prefix) :], "count": value}
            for key, value in sorted(counts.items())
            if key.startswith(prefix)
        ]

    return {
        **{name: counts.get(name, 0) for name in COUNTS},
        "seconds_to_first_action": counts.get("seconds_to_first_action"),
        "prompts_shown": kinds("prompt_shown"),
        "actions_done": kinds("action_done"),
        "pushes_shown": kinds("push_shown"),
        "pushes_opened": kinds("push_opened"),
    }


@router.post("/{business_id}/habit", status_code=204)
async def count_habit(business_id: str, body: HabitEvents, request: Request) -> Response:
    uid = await consented_owner(request)
    await enforce_limits(request, [("owner:habit", uid)])
    service = store(request)
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    business = context.get("business")
    if not business:
        raise HTTPException(404, "Business not found.")
    fields = business.get("fields") or {}
    if fields.get("demo"):
        return Response(status_code=204)
    zone = shop_timezone(shop_zone(fields))
    day = datetime.fromtimestamp(time.time(), zone).date().isoformat()
    try:
        await anyio.to_thread.run_sync(record, service, business_id, day, body.events)
    except Exception as error:  # a lost count is fine; a failed owner action is not
        log.warning("owner_habit_not_counted", error=type(error).__name__)
    return Response(status_code=204)


def days_for(repository: MerchantRepository, bid: str, days: list[date]) -> dict[str, Any]:
    """Each requested day's counters, where the owner opened the app that day."""
    out = {}
    for day in days:
        counts = daily(repository, bid, day.isoformat())
        if counts:
            out[day.isoformat()] = counts
    return out
