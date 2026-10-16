"""Owner-scoped playbook endpoints: read (generating only when needed), edit, remove, refresh."""

from datetime import UTC, datetime
from typing import Annotated, Any

import anyio
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from .limits import enforce_limits
from .merchant_routes import consented_owner, owner, store
from .playbook import (
    Playbook,
    PlaybookWriter,
    StoredPlaybook,
    TodayHints,
    Tone,
    edit_item,
    gather_inputs,
    grow_order,
    migrate_stored,
    needs_refresh,
    remove_item,
    today_hints,
)
from .recap import LANGUAGES
from .sales import today_for

router = APIRouter(prefix="/api/v1/businesses/{business_id}/playbook", tags=["playbook"])

Language = Annotated[str, Query(pattern=LANGUAGES)]


class PlaybookView(BaseModel):
    playbook: Playbook
    generated_at: str
    edited_at: str | None
    # "offline" is the deterministic fixture: honest wording in the app says so.
    mode: str
    # Why it was rebuilt on this request (missing, profile_changed, menu_changed, weekly,
    # requested), or None when the cached one was used.
    refreshed: str | None
    today: TodayHints
    grow: list[str]


class ItemEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=120)


class PlaybookEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    summary: str | None = Field(default=None, max_length=240)
    terms: list[Annotated[str, Field(min_length=1, max_length=40)]] | None = Field(
        default=None, max_length=8
    )
    tone: Tone | None = None


def writer(request: Request) -> PlaybookWriter:
    state = request.app.state
    if getattr(state, "playbook_writer", None) is None:
        state.playbook_writer = PlaybookWriter(state.v1_settings)
    return state.playbook_writer


async def ensure(
    request: Request, uid: str, bid: str, language: str, force: bool = False
) -> tuple[StoredPlaybook, dict[str, Any], str | None]:
    service = store(request)
    context = await anyio.to_thread.run_sync(service.context, uid, bid)
    business = context["business"]
    stored = migrate_stored(await anyio.to_thread.run_sync(service.playbook, uid, bid))
    sales = await anyio.to_thread.run_sync(service.sales_history, uid, bid)
    signals = await anyio.to_thread.run_sync(service.recap_signals, uid, bid)
    inputs = gather_inputs(
        business, context["inventory"], sales, signals["questions"], today_for(business["fields"])
    )
    inputs["language"] = language
    now = datetime.now(UTC)
    reason = "requested" if force else needs_refresh(stored, inputs, now)
    if reason:
        # Generation is the only step that may call the model; it is capped per owner.
        await enforce_limits(
            request,
            [("playbook:regenerate", uid)] if force else [("playbook", uid)],
        )
        stored = await writer(request).build(inputs, language, stored, now)
        await anyio.to_thread.run_sync(service.set_playbook, uid, bid, stored.model_dump())
    assert stored is not None
    return stored, business["fields"], reason


def view(stored: StoredPlaybook, fields: dict[str, Any], reason: str | None) -> PlaybookView:
    return PlaybookView(
        playbook=stored.playbook,
        generated_at=stored.generated_at,
        edited_at=stored.edited_at,
        mode=stored.mode,
        refreshed=reason,
        today=today_hints(stored, fields),
        grow=grow_order(stored),
    )


@router.get("", response_model=PlaybookView)
async def get_playbook(
    business_id: str, request: Request, language: Language = "en"
) -> PlaybookView:
    uid = await owner(request)
    await enforce_limits(request, [("owner:read", uid)])
    return view(*await ensure(request, uid, business_id, language))


@router.get("/today", response_model=TodayHints)
async def playbook_today(
    business_id: str, request: Request, language: Language = "en"
) -> TodayHints:
    """For the Today page: which numbers, line topics and "needs you now" kinds lead."""
    uid = await owner(request)
    await enforce_limits(request, [("owner:read", uid)])
    stored, fields, _ = await ensure(request, uid, business_id, language)
    return today_hints(stored, fields)


@router.post("/regenerate", response_model=PlaybookView)
async def regenerate(business_id: str, request: Request, language: Language = "en") -> PlaybookView:
    uid = await consented_owner(request)
    return view(*await ensure(request, uid, business_id, language, force=True))


async def _change(request: Request, business_id: str, change: Any) -> PlaybookView:
    uid = await consented_owner(request)
    await enforce_limits(request, [("playbook:edit", uid)])
    service = store(request)
    stored = migrate_stored(await anyio.to_thread.run_sync(service.playbook, uid, business_id))
    if stored is None:
        raise HTTPException(404, "No playbook yet. Open it once to create it.")
    try:
        updated = change(stored, datetime.now(UTC))
    except KeyError:
        raise HTTPException(404, "That item is no longer in the playbook.") from None
    await anyio.to_thread.run_sync(service.set_playbook, uid, business_id, updated.model_dump())
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    return view(updated, context["business"]["fields"], None)


@router.patch("/items/{item_id}", response_model=PlaybookView)
async def edit(business_id: str, item_id: str, body: ItemEdit, request: Request) -> PlaybookView:
    return await _change(
        request, business_id, lambda stored, now: edit_item(stored, item_id, body.text, now)
    )


@router.delete("/items/{item_id}", response_model=PlaybookView)
async def remove(business_id: str, item_id: str, request: Request) -> PlaybookView:
    return await _change(
        request, business_id, lambda stored, now: remove_item(stored, item_id, now)
    )


@router.patch("", response_model=PlaybookView)
async def edit_playbook(business_id: str, body: PlaybookEdit, request: Request) -> PlaybookView:
    """The summary, the owner's words and the tone; all optional, all the owner's to change."""

    def change(stored: StoredPlaybook, now: datetime) -> StoredPlaybook:
        playbook = stored.playbook.model_copy(deep=True)
        if body.summary is not None:
            playbook.summary = body.summary
        if body.terms is not None:
            playbook.vocabulary.terms = list(dict.fromkeys(body.terms))
        if body.tone is not None:
            playbook.tone = body.tone
        return stored.model_copy(update={"playbook": playbook, "edited_at": now.isoformat()})

    return await _change(request, business_id, change)
