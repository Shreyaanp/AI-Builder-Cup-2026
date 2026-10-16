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
    merged by name and unit (the overlay's version of an item wins)."""
    if not overlay:
        return base
    if not base:
        return overlay
    business = base.business
    if overlay.business:
        fields = base.business.model_dump() if base.business else {}
        fields.update({k: v for k, v in overlay.business.model_dump().items() if _filled(v)})
        business = BusinessFields.model_validate(fields)
    products = {(p.name.casefold(), p.unit.casefold()): p for p in base.products}
    products.update({(p.name.casefold(), p.unit.casefold()): p for p in overlay.products})
    return NewShopDraft(business=business, products=list(products.values()))


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


# The details the coach gathers, in the order it asks for them: (key, label for the model).
STEPS = (
    ("name", "the shop's real name"),
    ("kind", "what kind of business it is"),
    ("menu", "what they sell, with prices (offer a photo of the menu or price board once)"),
    ("place", "where the shop is"),
    ("hours", "opening hours"),
)


def known_and_missing(draft: NewShopDraft | None) -> tuple[list[str], list[str]]:
    """What the draft already answers (as the model should read it) and the steps still open."""
    fields = draft.business if draft else None
    products = draft.products if draft else []
    done = {
        "name": bool(fields and fields.name),
        "kind": bool(fields and fields.category),
        "menu": bool(products),
        "place": bool(fields and (fields.location or fields.lat is not None)),
        "hours": bool(fields and (fields.hours or fields.weekly_hours)),
    }
    known: list[str] = []
    if fields and fields.name:
        known.append(f'name "{fields.name}"')
    if fields and fields.category:
        known.append(f'kind "{fields.category}"')
    if products:
        names = ", ".join(p.name for p in products[:8])
        more = f" and {len(products) - 8} more" if len(products) > 8 else ""
        known.append(f"{len(products)} menu items ({names}{more})")
    if fields and fields.location:
        known.append(f'place "{fields.location}"')
    elif fields and fields.lat is not None:
        known.append("place (a pin on the map)")
    if fields and (fields.hours or fields.weekly_hours):
        known.append(f'hours "{fields.hours}"' if fields.hours else "weekly hours")
    if fields:
        answers = fields.model_dump(include={"payment_methods", "delivery", "halal"})
        answers["vegetarian options"] = fields.vegetarian_options
        known += [f"{k.replace('_', ' ')}" for k, v in answers.items() if v not in (None, [], "")]
        known += [str(fact.label) for fact in getattr(fields, "custom_facts", []) or []]
    missing = [label for key, label in STEPS if not done[key]]
    return known, missing


def progress_note(draft: NewShopDraft | None, last_question: str, resumed: bool) -> str:
    """The new-shop instruction's progress part: never ask again what is known, carry on from
    the next missing step, and after a reconnect, no second greeting or repeated question."""
    known, missing = known_and_missing(draft)
    lines = ["\nProgress so far (the saved draft is the source of truth):"]
    lines.append(
        "- Already known, NEVER ask for these again: " + "; ".join(known) + "."
        if known
        else "- Nothing is known yet."
    )
    if missing:
        lines.append("- Still missing, in this order: " + "; ".join(missing) + ".")
        lines.append(f"- Ask next: {missing[0]}.")
    else:
        lines.append(
            "- The basics are complete: ask the shop's customer questions from "
            "get_question_plan (skip any already known), then invite them to review the shop."
        )
    if resumed:
        lines.append(
            "- The connection dropped and the conversation has just resumed. Do not greet again,"
            " introduce yourself or start over, and do not repeat your last question unprompted."
        )
    if last_question:
        lines.append(
            f'- Your last question was: "{last_question[:240]}". The owner\'s next words '
            "most likely answer it. If the draft already answers it, never ask it again."
        )
    if known and not resumed:
        lines.append(
            "- If the app's opening message arrives now, the owner is coming back to this shop:"
            " welcome them back in a few words (no introduction) and ask the next missing step."
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


def adoptable(state: dict[str, Any], updated: float, finished: set[str]) -> bool:
    """An owner's recent new-shop conversation with an unfinished draft (its shop not opened)."""
    draft = saved_draft(state)
    if not state.get("new_shop") or is_empty(draft) or time.time() - updated > ADOPT_SECONDS:
        return False
    name = draft.business.name.strip().casefold() if draft and draft.business else ""
    return not (name and name in finished)
