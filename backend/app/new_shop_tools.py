"""The new-shop coach's own tools (owner decisions, 17 Oct): one `update_shop` that records
everything the owner said in one go, and `show_step` for the in-chat cards.

Onboarding asks only the shop's name, what it sells, where it is, its hours and a shop photo.
One sentence can answer several ("Lakshmi Tea Stall, chai aur samosa, Indiranagar metro ke
paas"), so update_shop takes every field at once; a correction simply replaces the field. Saving
is idempotent: the same answer twice (or a tool call replayed after a reconnect) changes nothing.
"""

import threading
from typing import Any, Literal

import structlog
from fastapi import HTTPException
from pydantic import ValidationError

from .coordinator import MerchantContext, _card, _propose_shop, current
from .merchant import BusinessFields, DayHours, NewShopDraft, NewShopStep, ProposalRequest
from .new_shop_resume import known_and_missing, ready_to_go_live

log = structlog.get_logger()

Step = Literal["location", "camera", "summary", "review", "face_check"]
SKIPPABLE: set[str] = {"hours", "photo", "face"}


def progress(draft: NewShopDraft | None) -> dict[str, Any]:
    """What the coach knows and still needs, for the tool result (a Live session's instruction
    is fixed when it connects, so each result carries the progress itself)."""
    known, missing = known_and_missing(draft)
    result: dict[str, Any] = {"known_never_ask_again": known, "still_missing": missing}
    if not missing:
        result["next"] = "Everything is gathered: no more questions; offer the face check once."
    elif draft and draft.live_id:
        result["live"] = "The shop is already live for customers."
    elif ready_to_go_live(draft):
        result["live"] = "Name, kind and place are known: the app puts the shop live now."
    return result


def update_shop(
    name: str = "",
    category: str = "",
    location: str = "",
    hours: str = "",
    weekly_hours: list[DayHours] | None = None,
    description: str = "",
    skip: list[NewShopStep] | None = None,
) -> dict[str, Any]:
    """Record what the owner just said about their new shop, all fields at once, silently (in
    the same turn as your reply). Pass ONLY the fields they said; one sentence can give several.
    name: the shop's real name, only when clearly a name (never invent one). category: what they
    sell, in a few words ("chai and samosa", "tailoring"). location: the area or street and a
    landmark, only when they are not at the shop or GPS was refused. hours: as said
    ("subah 6 se raat 10, Sunday band"), and weekly_hours: one record per weekday (day:
    mon..sun, closed: true, or open/close HH:MM; overnight closing belongs to the opening day).
    description: one short line for customers from what they told you. A correction ("nahi,
    Lakshmi Chai Point") is just a new value: pass it, do not confirm it aloud. skip: steps the
    owner put off or does not know ("pata nahi", "baad mein", silence twice): hours, photo, face.
    The same answer twice changes nothing. Never pass prices or menu items here."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    if not ctx.new_shop:
        return {
            "status": "not_new_shop",
            "instruction": "Use propose_business for an existing shop's details.",
        }
    given = {
        "name": name,
        "category": category,
        "location": location,
        "hours": hours,
        "description": description,
    }
    changed = any((value or "").strip() for value in given.values()) or weekly_hours is not None
    result: dict[str, Any] = {"status": "saved"}
    if changed:
        result = _propose_shop(
            name=name,
            category=category,
            location=location,
            hours=hours,
            weekly_hours=weekly_hours,
            description=description,
        )
        if result.get("status") not in {"needs_review"}:
            return result
        result = {"status": "saved", "proposal_id": result.get("proposal_id")}
    draft = ctx.new_shop_draft or NewShopDraft()
    later = [
        step
        for step in dict.fromkeys(skip or [])
        if step in SKIPPABLE and step not in draft.skipped
    ]
    if later:
        ctx.new_shop_draft = draft.model_copy(update={"skipped": [*draft.skipped, *later]})
    if not changed and not later:
        result["note"] = "Nothing new to record."
    went_live = go_live(ctx)
    if went_live:
        result["went_live"] = True
    return {**result, **progress(ctx.new_shop_draft)}


# One owner's shop goes live once, even when a tool call and the app's draft update race.
_live_locks: dict[str, threading.Lock] = {}
_live_guard = threading.Lock()


def _owner_lock(uid: str) -> threading.Lock:
    with _live_guard:
        return _live_locks.setdefault(uid, threading.Lock())


def go_live(ctx: MerchantContext) -> bool:
    """Owner decision (17 Oct): the shop goes live by itself as soon as its name, kind and place
    are known (no review step), and what the owner adds after that (hours, a correction) reaches
    the live shop at once. Never with menu items: the menu is added later from Today.

    Idempotent: the draft remembers the live shop (`live_id`, saved with the conversation), so a
    replayed answer or a reconnect updates that shop instead of opening a second one. Returns
    True when the shop went live just now."""
    if not ctx.new_shop:
        return False
    with _owner_lock(ctx.uid):
        draft = ctx.new_shop_draft
        if not draft or not draft.business or not ready_to_go_live(draft):
            return False
        fields = draft.business
        try:
            if draft.live_id:
                _sync_live(ctx, draft.live_id, fields)
                return False
            proposal = ctx.store.propose(
                ctx.uid,
                ProposalRequest(kind="business", business_id=None, revision=0, business=fields),
            )
            receipt = ctx.store.commit(ctx.uid, proposal["id"], proposal["digest"])
            bid = str(receipt["business_id"])
            ctx.store.share(ctx.uid, bid, True)
        except (HTTPException, ValidationError, ValueError) as error:
            # The conversation carries on; the next answer tries again.
            log.warning("new_shop_live_failed", reason=str(error)[:200])
            return False
        ctx.new_shop_draft = draft.model_copy(update={"live_id": bid})
        log.info("new_shop_live", business=bid)
        return True


def _sync_live(ctx: MerchantContext, bid: str, fields: BusinessFields) -> None:
    """What the owner said after the shop went live replaces the live shop's details."""
    business = ctx.store.context(ctx.uid, bid)["business"]
    if not business:
        return
    try:
        if BusinessFields.model_validate(business["fields"]) == fields:
            return
    except ValidationError:
        pass
    proposal = ctx.store.propose(
        ctx.uid,
        ProposalRequest(
            kind="business", business_id=bid, revision=business["revision"], business=fields
        ),
    )
    ctx.store.commit(ctx.uid, proposal["id"], proposal["digest"])


STEP_NOTES: dict[str, str] = {
    "location": "The map card opens and asks the phone for its location; wait for the pin.",
    "camera": "The camera card opens with a big Skip; wait for the photo or the skip.",
    "summary": "The summary card shows the whole shop; say one short closing sentence.",
    "review": "The owner's shop review opens; the conversation continues when they close it.",
    "face_check": "The optional face check is offered with a Skip; never insist.",
}


def show_step(step: Step) -> dict[str, Any]:
    """Open an in-chat card of the new-shop flow: location (the owner is at the shop now: the
    phone's GPS pins it), camera (a photo of the shop), summary (everything is gathered),
    review (the owner asked to see or check their shop: "meri dukaan dikhao"), face_check (the
    optional check at the very end). Opening never changes anything."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    if step not in STEP_NOTES:
        return {"status": "invalid", "instruction": f"step: one of {', '.join(STEP_NOTES)}"}
    card_id = _card(ctx, "action", {"target": "new_shop_step", "step": step})
    return {"status": "opened", "card_id": card_id, "instruction": STEP_NOTES[step]}
