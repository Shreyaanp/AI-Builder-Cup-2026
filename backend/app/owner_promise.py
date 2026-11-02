"""Tomorrow's promise: one thing the owner writes down at close and sees the next morning.

HABIT change 4. At close, or by saying "remind me to order milk tomorrow", the owner sets one
thing for the next shop-local day. That morning Today opens with it ("Last night you said: order
milk"). Done marks it done; "Not today" clears it with no comment. Nothing carries over or nags:
a promise belongs to one day, the shop keeps only its latest one (a new one replaces it), and it
is erased with the shop. One promise a day, never more.

Counting follows owner_habit: setting one and doing one add `promise_set` and `promise_done` to
the day's counts, never the words, never for a demo shop, and only for an owner who accepted the
current terms. A lost count never blocks the owner.
"""

import re
import time
from datetime import date, timedelta
from typing import Any, Literal

import anyio
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .limits import enforce_limits
from .merchant import MerchantRepository
from .merchant_routes import consented_owner, owner, store
from .owner_habit import HabitEvent, record
from .rescue import local_now

router = APIRouter(prefix="/api/v1/businesses", tags=["today"])
log = structlog.get_logger(__name__)

KIND = "owner_promise"
MAX_TEXT = 80
PromiseKind = Literal["order", "make", "note"]
State = Literal["open", "done", "skipped"]


class Promise(BaseModel):
    # The shop-local morning it is for.
    day: date
    # The owner's own words, shown back to them only ("order milk").
    text: str
    # What its button does: order a supply, make more of an item, or just a note.
    kind: PromiseKind = "note"
    item: str | None = None
    state: State = "open"


class NewPromise(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    kind: PromiseKind = "note"
    item: str | None = Field(default=None, max_length=MAX_TEXT)


def shop_day(fields: dict[str, Any]) -> date:
    return local_now(fields).date()


def clean(text: str) -> str:
    """One line, no control characters, at most 80 characters."""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", " ".join(text.split()))[:MAX_TEXT].strip()


def _count(repository: MerchantRepository, bid: str, fields: dict[str, Any], event: str) -> None:
    """Add the count for today, never for a demo shop; a lost count is fine."""
    if fields.get("demo"):
        return
    try:
        record(
            repository,
            bid,
            shop_day(fields).isoformat(),
            [HabitEvent(event=event)],  # type: ignore[arg-type]
        )
    except Exception as error:  # noqa: BLE001 - counting never blocks the owner
        log.warning("owner_promise_not_counted", error=type(error).__name__)


def stored(repository: MerchantRepository, bid: str) -> Promise | None:
    data = repository.feature_docs.get(KIND, bid)
    if not data:
        return None
    try:
        return Promise.model_validate(data)
    except ValueError:
        return None


def promise_for(repository: MerchantRepository, bid: str, day: date) -> Promise | None:
    """The open promise for this morning, or None (none set, done, cleared, or another day's)."""
    found = stored(repository, bid)
    return found if found and found.day == day and found.state == "open" else None


def set_promise(
    repository: MerchantRepository,
    bid: str,
    fields: dict[str, Any],
    new: NewPromise,
    count: bool = True,
) -> Promise:
    """Write one promise for tomorrow (shop-local), replacing any earlier one."""
    text = clean(new.text)
    if not text:
        raise HTTPException(422, "EMPTY_PROMISE")
    item = clean(new.item) if new.item else None
    value = Promise(
        day=shop_day(fields) + timedelta(days=1),
        text=text,
        kind=new.kind if item else "note",
        item=item or None,
    )
    repository.feature_docs.put(KIND, bid, bid, time.time(), value.model_dump(mode="json"))
    if count:
        _count(repository, bid, fields, "promise_set")
    return value


def answer(
    repository: MerchantRepository,
    bid: str,
    fields: dict[str, Any],
    day: date,
    state: Literal["done", "skipped"],
    count: bool = True,
) -> bool:
    """Mark this morning's promise done or cleared. False when there is no open one."""
    changed: list[bool] = []

    def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
        changed.clear()
        if not data or data.get("day") != day.isoformat() or data.get("state") != "open":
            return None
        changed.append(True)
        return time.time(), {**data, "state": state}

    repository.feature_docs.update(KIND, bid, bid, change)
    if changed and state == "done" and count:
        _count(repository, bid, fields, "promise_done")
    return bool(changed)


@router.post("/{business_id}/promise", response_model=Promise)
async def new_promise(business_id: str, body: NewPromise, request: Request) -> Promise:
    uid = await consented_owner(request)
    await enforce_limits(request, [("owner:write", uid)])
    service = store(request)
    business = await anyio.to_thread.run_sync(service.owned_business, uid, business_id)
    fields = business.get("fields") or {}
    return await anyio.to_thread.run_sync(set_promise, service, business_id, fields, body)


@router.post("/{business_id}/promise/{day}/{state}", status_code=204)
async def answer_promise(
    business_id: str, day: date, state: Literal["done", "skipped"], request: Request
) -> None:
    uid = await consented_owner(request)
    await enforce_limits(request, [("owner:write", uid)])
    service = store(request)
    business = await anyio.to_thread.run_sync(service.owned_business, uid, business_id)
    fields = business.get("fields") or {}
    # Answering again (a double tap, a second phone) is not an error.
    await anyio.to_thread.run_sync(answer, service, business_id, fields, day, state)


@router.get("/{business_id}/promise", response_model=Promise | None)
async def read_promise(business_id: str, request: Request, day: date | None = None) -> Promise | None:
    """The open promise for a morning: this one by default, or a given day (tonight's for
    tomorrow, so the close screen and tests can read it back)."""
    uid = await owner(request)
    await enforce_limits(request, [("owner:read", uid)])
    service = store(request)
    business = await anyio.to_thread.run_sync(service.owned_business, uid, business_id)
    when = day or shop_day(business.get("fields") or {})
    return await anyio.to_thread.run_sync(promise_for, service, business_id, when)
