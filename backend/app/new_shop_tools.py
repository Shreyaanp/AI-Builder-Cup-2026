"""The new-shop coach's own tools (owner decisions, 17 Oct): one `update_shop` that records
everything the owner said in one go, and `show_step` for the in-chat cards.

Onboarding asks only the shop's name, what it sells, where it is, its hours and a shop photo.
One sentence can answer several ("Lakshmi Tea Stall, chai aur samosa, Indiranagar metro ke
paas"), so update_shop takes every field at once; a correction simply replaces the field. Saving
is idempotent: the same answer twice (or a tool call replayed after a reconnect) changes nothing.
"""

import asyncio
import threading
from typing import Any, Literal

import anyio
import structlog
from fastapi import HTTPException
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from .business_understanding import (
    KINDS,
    BusinessUnderstanding,
    get_understander,
    keep_owner_kind,
    with_owner_kind,
)
from .coordinator import FactInput, MerchantContext, _card, _propose_shop, current
from .merchant import (
    BusinessFields,
    CustomFact,
    DayHours,
    NewShopDraft,
    NewShopStep,
    ProposalRequest,
)
from .new_shop_resume import known_and_missing, ready_to_go_live
from .vendor_profile import (
    BusinessTypeProfile,
    FoodAttributes,
    RetailAttributes,
    ServiceAttributes,
    infer_profile,
)

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


class ExtraAnswer(BaseModel):
    """The owner's answer to one of the business's extra questions."""

    key: str = Field(description="The extra question's key from still_missing")
    answer: str = Field(default="", description='In the owner\'s words; "" when they do not know')


# How long a tool waits for the business profile; a slower one is picked up on the next answer.
UNDERSTAND_SECONDS = 2.5


def words(category: str, description: str) -> str:
    return ". ".join(part for part in (category, description) if part.strip())


def owner_words(draft: NewShopDraft | None) -> str:
    """What the owner said the business is (never its name: "Tea Tree Tailors" is no tea)."""
    fields = draft.business if draft else None
    return words(fields.category, fields.description) if fields else ""


async def understand(ctx: MerchantContext, said: str, wait: float = UNDERSTAND_SECONDS) -> None:
    """Bring the draft's business profile up to date with what the owner said (the owner's own
    word on the kind always wins). Never blocks a reply for long, never fails a save."""
    draft = ctx.new_shop_draft or NewShopDraft()
    if not said:
        return
    reader = get_understander()
    fresh = reader.cached(said)
    if fresh is None:
        try:
            fresh = await asyncio.wait_for(asyncio.shield(reader.understand(said)), wait)
        except TimeoutError:
            log.info("business_understanding_pending")
            return
        except Exception as failure:  # noqa: BLE001 - the profile is an aid, never a blocker
            log.warning("business_understanding_failed", reason=str(failure)[:200])
            return
    understood = keep_owner_kind(fresh, draft.understanding)
    if understood != draft.understanding:
        ctx.new_shop_draft = draft.model_copy(update={"understanding": understood})
        log.info(
            "business_understood",
            kind=understood.kind,
            extras=len(understood.extra_questions),
            group=understood.search_group,
        )


def shop_profile(understood: BusinessUnderstanding | None, category: str) -> BusinessTypeProfile:
    """The saved shop's type profile from what the coach understood. Food details stay unknown
    (never halal-relevant from onboarding); a mixed or unclear business stays generic."""
    if not understood or understood.kind in {"unknown", "mixed"}:
        return BusinessTypeProfile()
    guess = infer_profile(category, understood.what)
    if understood.kind == "food":
        return BusinessTypeProfile(kind="food", subtype=category[:80], food=FoodAttributes())
    if understood.kind == "service":
        if guess.kind in {"tailor", "salon", "service"}:
            return guess
        return BusinessTypeProfile(kind="service", service=ServiceAttributes())
    if guess.kind in {"retail", "grocer"}:
        return guess
    return BusinessTypeProfile(kind="retail", retail=RetailAttributes())


async def update_shop(
    name: str = "",
    category: str = "",
    location: str = "",
    hours: str = "",
    weekly_hours: list[DayHours] | None = None,
    description: str = "",
    kind: str = "",
    extra_answers: list[ExtraAnswer] | None = None,
    skip: list[NewShopStep] | None = None,
) -> dict[str, Any]:
    """Record what the owner just said about their new shop, all fields at once, silently (in
    the same turn as your reply). Pass ONLY the fields they said; one sentence can give several.
    name: the shop's real name, only when clearly a name (never invent one). category: what
    they offer, in THEIR words, a few words ("chai aur samosa", "silai ka kaam", "self-cleaning
    helmet station"). location: the area or street and a landmark, only when they are not at the
    shop or GPS was refused. hours: as said ("subah 6 se raat 10, Sunday band"), and
    weekly_hours: one record per weekday (day: mon..sun, closed: true, or open/close HH:MM;
    overnight closing belongs to the opening day). description: one short line for customers
    from what they told you. kind: only when the owner says what kind of business it is or
    corrects it ("nahi, yeh service hai"): product, service, food or mixed. extra_answers: the
    answer to an extra question listed in still_missing ({key, answer}; answer "" when they do
    not know). A correction ("nahi, Lakshmi Chai Point") is just a new value: pass it, do not
    confirm it aloud. skip: steps the owner put off or does not know ("pata nahi", "baad
    mein", silence twice): hours, photo, face. The same answer twice changes nothing. Never pass
    prices or menu items here."""
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
    draft = ctx.new_shop_draft or NewShopDraft()
    if kind.strip().casefold() in KINDS:
        owner_kind = with_owner_kind(draft.understanding, kind.strip().casefold())
        if owner_kind != draft.understanding:
            ctx.new_shop_draft = draft = draft.model_copy(update={"understanding": owner_kind})
    # Extra answers: each question is asked once; an answer becomes a customer fact.
    questions = (
        {q.key: q for q in draft.understanding.extra_questions} if draft.understanding else {}
    )
    facts: list[FactInput] = []
    asked: list[str] = []
    # The model's arguments arrive as plain JSON objects (or models, from tests and fixtures).
    for extra in TypeAdapter(list[ExtraAnswer]).validate_python(
        [e.model_dump() if isinstance(e, BaseModel) else e for e in extra_answers or []]
    ):
        question = questions.get(extra.key.strip())
        if not question or question.key in draft.asked_extra:
            continue
        asked.append(question.key)
        if extra.answer.strip():
            facts.append(
                FactInput(key=question.key, label=question.label, value=extra.answer.strip()[:200])
            )
    if asked:
        ctx.new_shop_draft = draft = draft.model_copy(
            update={"asked_extra": list(dict.fromkeys([*draft.asked_extra, *asked]))[:4]}
        )
    changed = any((value or "").strip() for value in given.values()) or weekly_hours is not None
    result: dict[str, Any] = {"status": "saved"}
    if changed:
        fields = draft.business
        said = words(
            category.strip() or (fields.category if fields else ""),
            description.strip() or (fields.description if fields else ""),
        )
        if said != owner_words(draft):
            # What the business is, understood before it is saved (its type profile follows).
            await understand(ctx, said)
            draft = ctx.new_shop_draft or draft
        result = _propose_shop(
            name=name,
            category=category,
            location=location,
            hours=hours,
            weekly_hours=weekly_hours,
            description=description,
            profile=shop_profile(
                draft.understanding,
                category.strip() or (fields.category if fields else ""),
            )
            if draft.understanding
            else None,
        )
        if result.get("status") not in {"needs_review"}:
            return result
        result = {"status": "saved", "proposal_id": result.get("proposal_id")}
    pending = ctx.new_shop_draft or draft
    if pending.understanding is None and owner_words(pending):
        # A profile that took longer than one answer: picked up with any later answer (hours,
        # the place), not only with one that changes nothing.
        await understand(ctx, owner_words(pending), wait=0)
    current_draft = ctx.new_shop_draft
    if facts and current_draft and current_draft.business:
        # The answers to the business's own questions: customer facts of the shop (the owner's
        # words), saved with the draft and on the live shop.
        business = current_draft.business
        merged = {fact.key: fact for fact in business.custom_facts}
        merged.update({f.key: CustomFact(key=f.key, label=f.label, value=f.value) for f in facts})
        ctx.new_shop_draft = current_draft.model_copy(
            update={"business": business.model_copy(update={"custom_facts": list(merged.values())})}
        )
        changed = True
    draft = ctx.new_shop_draft or NewShopDraft()
    later = [
        step
        for step in dict.fromkeys(skip or [])
        if step in SKIPPABLE and step not in draft.skipped
    ]
    if later:
        ctx.new_shop_draft = draft.model_copy(update={"skipped": [*draft.skipped, *later]})
    if not changed and not later and not asked and not kind:
        result["note"] = "Nothing new to record."
    went_live = await anyio.to_thread.run_sync(go_live, ctx)
    if went_live:
        result["went_live"] = True
    return {**result, **progress(ctx.new_shop_draft)}


# Owner words that end the conversation ("bas", "ho gaya", "that's all", "bye").
END_NOTE = (
    'Say ONE short, warm goodbye in the reply language (a few words, e.g. "theek hai, phir'
    ' milte hain"), nothing else, no question. Everything is saved; the app closes the'
    " conversation and the owner continues from here next time."
)


def end_conversation() -> dict[str, Any]:
    """End the conversation now because the owner asked to stop ("bas", "ho gaya", "band
    karo", "that's all", "stop", "bye", "baad mein baat karte hain"). Call it at once, even if
    the name, kind or place are not known yet: everything said is already saved and the next
    visit carries on silently. Then say one short goodbye and nothing else."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    if ctx.ended:
        # Already ended (the app caught the stop word first): a second call changes nothing.
        return {"status": "ended", "instruction": END_NOTE}
    ctx.ended = True
    card_id = _card(ctx, "action", {"target": "end_conversation"})
    log.info("conversation_end_requested", new_shop=ctx.new_shop)
    return {"status": "ended", "card_id": card_id, "instruction": END_NOTE}


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
