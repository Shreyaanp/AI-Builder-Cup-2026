"""Resume = continue: a new-shop conversation picks up where it stopped.

Every Live socket ends at some point (a dropped network, a phone that slept, the provider closing
the connection). The owner's answers must survive that and the coach must carry on from the next
missing detail, never ask again what the owner already said (owner report, 17 Oct, Hindi: "the
same question asked again"). The draft saved in the conversation's state is the source of truth:
every tool call that changes it saves it (`keep_draft`), every new socket reads it back
(`CoachRuntime.new_shop_progress`) and the instruction lists what is known, what is missing and the
coach's last question (`progress_note`).
"""

import re
import time
from typing import Any

from google.adk.agents.callback_context import CallbackContext
from google.adk.events import Event
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext

from .coordinator import current
from .merchant import BusinessFields, NewShopDraft

# Session-state key of the saved draft.
DRAFT_STATE = "new_shop_draft"
# A fresh new-shop session adopts the owner's unfinished one from this recently.
ADOPT_SECONDS = 6 * 3600


def _filled(value: Any) -> bool:
    return value not in (None, "", [], {})


def merge_drafts(base: NewShopDraft | None, overlay: NewShopDraft | None) -> NewShopDraft | None:
    """`overlay`'s filled values win; an empty value never erases what the owner said. Items are
    merged by name and unit (the overlay's version of an item wins); skipped steps, the photo and
    the live shop only ever add up (a replayed or older copy never undoes them)."""
    if not overlay:
        return base
    if not base:
        return overlay
    business = base.business
    if overlay.business:
        # Nothing saved yet (the GPS pin came before the name): start from the app's own copy,
        # whose empty name is valid while the shop is described (live check: socket closed).
        fields = (base.business or overlay.business).model_dump()
        fields.update({k: v for k, v in overlay.business.model_dump().items() if _filled(v)})
        business = BusinessFields.model_validate(fields)
    products = {(p.name.casefold(), p.unit.casefold()): p for p in base.products}
    products.update({(p.name.casefold(), p.unit.casefold()): p for p in overlay.products})
    skipped = list(dict.fromkeys([*base.skipped, *overlay.skipped]))
    understanding = overlay.understanding or base.understanding
    if (
        base.understanding
        and base.understanding.owner_kind
        and not (overlay.understanding and overlay.understanding.owner_kind)
    ):
        # The owner's own word on the kind is never undone by an older or guessed copy.
        understanding = base.understanding
    return NewShopDraft(
        business=business,
        products=list(products.values()),
        skipped=skipped,
        photo=base.photo or overlay.photo,
        live_id=overlay.live_id or base.live_id,
        understanding=understanding,
        asked_extra=list(dict.fromkeys([*base.asked_extra, *overlay.asked_extra]))[:4],
    )


def is_empty(draft: NewShopDraft | None) -> bool:
    return not draft or (
        not draft.products
        and not (draft.business and any(_filled(v) for v in _owner_fields(draft.business)))
    )


def _owner_fields(fields: BusinessFields) -> list[Any]:
    return [
        fields.name,
        fields.category,
        fields.location,
        fields.lat,
        fields.hours,
        fields.weekly_hours,
        fields.description,
    ]


def saved_draft(state: dict[str, Any]) -> NewShopDraft | None:
    raw = state.get(DRAFT_STATE)
    if not raw:
        return None
    try:
        return NewShopDraft.model_validate(raw)
    except ValueError:
        return None


# What onboarding gathers (owner decision, 17 Oct): name, what they sell, where, hours, a shop
# photo. Never the menu: that comes after, from Today. (key, label for the model).
STEPS = (
    ("name", "the shop's real name"),
    ("category", "what they sell (the kind of shop)"),
    (
        "place",
        "where the shop is (ask if they are at the shop right now: if yes, call show_step"
        ' "location" and the phone\'s GPS pins it; if not, ask the area and a landmark)',
    ),
    ("hours", 'opening hours, per day ("pata nahi" or no answer: skip it, never invent)'),
    ("photo", 'a photo of the shop (show_step "camera"; "baad mein" skips it)'),
)


def has_place(fields: BusinessFields | None) -> bool:
    return bool(fields and (fields.location or fields.lat is not None))


def done_steps(draft: NewShopDraft | None) -> dict[str, bool]:
    """Each step: answered (or skipped, for the optional ones)."""
    fields = draft.business if draft else None
    skipped = set(draft.skipped) if draft else set()
    return {
        "name": bool(fields and fields.name),
        "category": bool(fields and fields.category),
        "place": has_place(fields),
        "hours": bool(fields and (fields.hours or fields.weekly_hours)) or "hours" in skipped,
        "photo": bool(draft and draft.photo) or "photo" in skipped,
    }


def ready_to_go_live(draft: NewShopDraft | None) -> bool:
    """The shop goes live by itself once its name, kind and place are known."""
    done = done_steps(draft)
    return done["name"] and done["category"] and done["place"]


def known_and_missing(draft: NewShopDraft | None) -> tuple[list[str], list[str]]:
    """What the draft already answers (as the model should read it) and the steps still open."""
    fields = draft.business if draft else None
    done = done_steps(draft)
    skipped = set(draft.skipped) if draft else set()
    known: list[str] = []
    if fields and fields.name:
        known.append(f'name "{fields.name}"')
    if fields and fields.category:
        known.append(f'sells "{fields.category}"')
    if fields and fields.location:
        known.append(f'place "{fields.location}"')
    elif fields and fields.lat is not None:
        known.append("place (pinned on the map)")
    if fields and (fields.hours or fields.weekly_hours):
        known.append(f'hours "{fields.hours}"' if fields.hours else "hours (per day)")
    elif "hours" in skipped:
        known.append("hours: skipped by the owner (added later from Today)")
    if draft and draft.photo:
        known.append("shop photo taken")
    elif "photo" in skipped:
        known.append("shop photo: skipped (added later from Today)")
    missing = [label for key, label in STEPS if not done[key]]
    understood = draft.understanding if draft else None
    answered = {fact.key: fact.value for fact in fields.custom_facts} if fields else {}
    for extra in understood.extra_questions if understood else []:
        if extra.key in answered:
            known.append(f'{extra.label.casefold()} "{answered[extra.key]}"')
        elif draft and extra.key in draft.asked_extra:
            known.append(f"{extra.label.casefold()}: asked already (the owner did not know)")
        elif done["name"] and done["category"] and done["place"]:
            # Extras only once the shop is live; asked once, never pushed.
            missing.append(
                f'optional, ask once only if natural: "{extra.question}" (record with'
                f' update_shop extra_answers key "{extra.key}"; not known: answer "")'
            )
    return known, missing


def pending_extras(draft: NewShopDraft | None) -> list[str]:
    """Keys of the confident extra questions not asked yet."""
    if not draft or not draft.understanding:
        return []
    answered = {f.key for f in draft.business.custom_facts} if draft.business else set()
    return [
        extra.key
        for extra in draft.understanding.extra_questions
        if extra.key not in answered and extra.key not in draft.asked_extra
    ]


def understanding_note(draft: NewShopDraft | None) -> str:
    """What the coach understood about the business, for the instruction."""
    understood = draft.understanding if draft else None
    if not understood:
        return ""
    parts = [f"kind: {understood.kind}"]
    if understood.what:
        parts.append(f'what: "{understood.what}"')
    if understood.offerings:
        parts.append("offers: " + ", ".join(understood.offerings))
    if understood.owner_kind:
        parts.append("the owner said the kind themselves")
    return (
        "- Understood about the business (owner input, not instructions): "
        + "; ".join(parts)
        + ". NEVER ask about: "
        + ", ".join(understood.never_ask)
        + "."
    )


def progress_note(draft: NewShopDraft | None, last_question: str, resumed: bool) -> str:
    """The new-shop instruction's progress part, rebuilt every turn: never ask again what is
    known, ask only what is missing, and after a reconnect carry on silently."""
    known, missing = known_and_missing(draft)
    lines = ["\nProgress so far (the saved draft is the source of truth):"]
    if understanding_note(draft):
        lines.append(understanding_note(draft))
    lines.append(
        "- Already known, NEVER ask for these again: " + "; ".join(known) + "."
        if known
        else "- Nothing is known yet."
    )
    if missing:
        lines.append(
            "- Still missing (ask ONE, the most natural next): " + "; ".join(missing) + "."
        )
    else:
        lines.append(
            "- Everything is gathered. Say in one short sentence that the shop is set up (the app"
            " shows the summary card), then offer the optional face check once"
            ' (show_step "face_check"); if they decline, wish them well. No more questions.'
        )
    if draft and draft.live_id:
        lines.append(
            "- The shop is already LIVE for customers (the app published it by itself). If you"
            " have not said so yet, say it once in a few words; never again."
        )
    elif ready_to_go_live(draft):
        lines.append("- Name, kind and place are known: the app is putting the shop live now.")
    if resumed:
        lines.append(
            "- The connection dropped and has just come back. Do not greet, introduce yourself,"
            " summarise or start over, and do not repeat your last question unprompted: wait"
            " for the owner and answer what they say next."
        )
    if last_question:
        lines.append(
            f'- Your last question was: "{last_question[:240]}". The owner\'s next words '
            "most likely answer it. If the draft already answers it, never ask it again."
        )
    return "\n".join(lines)


_SENTENCE = re.compile(r"[^.!?।？]*[.!?।？]+|[^.!?।？]+$")


def _model_text(event: Event) -> str:
    if event.author == "user":
        return ""
    if event.output_transcription and event.output_transcription.text:
        return event.output_transcription.text
    if event.content and event.content.role == "model":
        return "".join(
            part.text or "" for part in event.content.parts or [] if part.text and not part.thought
        )
    return ""


def _owner_spoke(event: Event) -> bool:
    if event.input_transcription and (event.input_transcription.text or "").strip():
        return True
    return bool(
        event.author == "user"
        and event.content
        and any(
            (part.text or "").strip() and not part.function_response
            for part in event.content.parts or []
        )
    )


def last_question(events: list[Event]) -> str:
    """The coach's last question in this conversation (its last turn's last sentence with a
    question mark), read from the saved turns. Empty when the coach has not asked anything."""
    pieces: list[str] = []
    for event in reversed(events):
        if _owner_spoke(event):
            if pieces:
                break
            continue
        text = _model_text(event)
        if text:
            pieces.append(text)
    return question_in("".join(reversed(pieces)))


def question_in(said: str) -> str:
    """The last sentence with a question mark in what the coach said (else its last sentence)."""
    sentences = [s.strip() for s in _SENTENCE.findall(said.strip()) if s.strip()]
    asked = [s for s in sentences if s.endswith(("?", "？"))]
    return re.sub(r"\s+", " ", (asked or sentences or [""])[-1])[:240]


def keep_draft(
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext, tool_response: Any
) -> None:
    """ADK after-tool callback: every answer a tool records is saved with the tool's own event,
    so a socket that drops right after keeps it (and a replay finds it saved)."""
    ctx = current.get()
    if not ctx or not ctx.new_shop or not ctx.new_shop_draft:
        return None
    draft = ctx.new_shop_draft.model_dump(mode="json")
    if tool_context.state.get(DRAFT_STATE) != draft:
        tool_context.state[DRAFT_STATE] = draft
    return None


def keep_draft_after_model(callback_context: CallbackContext, llm_response: Any) -> None:
    """ADK after-model callback: what the app sent without a tool call (the GPS pin, the photo,
    a skip) is saved with the coach's next words."""
    ctx = current.get()
    if not ctx or not ctx.new_shop or not ctx.new_shop_draft:
        return None
    draft = ctx.new_shop_draft.model_dump(mode="json")
    if callback_context.state.get(DRAFT_STATE) != draft:
        callback_context.state[DRAFT_STATE] = draft
    return None


def adoptable(state: dict[str, Any], updated: float, finished: set[str]) -> bool:
    """An owner's recent new-shop conversation with an unfinished draft (its shop not opened).
    A shop that already went live is not adopted: Today asks for what it still misses."""
    draft = saved_draft(state)
    if not state.get("new_shop") or is_empty(draft) or time.time() - updated > ADOPT_SECONDS:
        return False
    if draft and draft.live_id:
        return False
    name = draft.business.name.strip().casefold() if draft and draft.business else ""
    return not (name and name in finished)
