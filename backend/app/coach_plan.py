"""Multi-step chains that survive approval cards (OB-174, #533).

"Find milk suppliers, order 15 kg from the cheapest and ask if they deliver on Sunday" is three
steps, and the second ends at an order card the owner must tap. The plan and its current step
live in the conversation's session state (never only in the chat history), so the chain goes on
after the tap:

1. The coach calls plan_steps once with the steps in order. The app shows them.
2. Each action tool that completes a step moves the plan on (lookups do not).
3. A step that ends at an approval card (order Send, purchase order Approve, a review, a customer
   reply) parks the plan on that card: the function-call id, the invocation id and the card's id
   are saved, and the coach says what comes after the tap.
4. The owner's tap (in the chat or on any screen that shows the same order) sends a resume turn.
   The server checks the card's real state (sent, approved, saved), then runs the next step with
   a note the chat history never shows as the owner's words. Discarding the card stops the plan.
"""

from __future__ import annotations

import re
from typing import Any

from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext

from .coordinator import current

PLAN_STATE = "coach_plan"
# The resume turn's own user event carries this state key, so the history never shows the note.
NOTE_STATE = "coach_plan_note"
MAX_STEPS = 5
STEP_CHARS = 120

# Tools that finish a step when they succeed. Lookups (context, orders list, insights) never do:
# they are how a step is done, not a step.
STEP_TOOLS = {
    "find_suppliers",
    "prepare_order",
    "message_supplier",
    "cancel_order",
    "draft_reorder",
    "approve_and_send_po",
    "accept_order_change",
    "record_goods_received",
    "send_asn",
    "send_pending_documents",
    "set_supplier_rules",
    "update_shop_details",
    "propose_products",
    "propose_rescue_deal",
    "propose_stamp_card",
    "propose_customer_facts",
    "prepare_customer_reply",
    "prepare_payment_link",
    "set_open_today",
    "set_reply_language",
    "remember_note",
    "get_forecast",
    "get_insights",
}
# Results that mean the step did not happen (the coach asks or repairs instead).
NOT_DONE = {
    "invalid",
    "ask_owner",
    "needs_business",
    "needs_item",
    "needs_quantity",
    "none_found",
    "unknown_supplier",
    "unknown_order",
    "unavailable",
    "not_sent",
    "which_item",
    "ask_source",
}
# Steps said one after another: "find suppliers, then order", "uske baad", "फिर" (not "phir se",
# which is "again").
THEN = re.compile(
    r"\s*[,;]?\s*(?:\b(?:and\s+)?then\b|\bafter\s+that\b|\buske\s+baad\b|उसके\s+बाद|"
    r"\bphir\b(?!\s+se\b)|फिर(?!\s*से))\s*",
    re.I,
)


# "then don't order yet", "phir mat bhejna", "फिर नहीं": a no is never a step to act on.
NEGATED = re.compile(
    # Not "na": "karo na" is "please do it".
    r"\b(?:don'?t|do\s+not|never|not\s+yet|mat|nahi|nahin)\b|मत|नहीं",
    re.I,
)


def split_steps(text: str) -> list[str]:
    """The steps of one message to act on, in order (one item when it asks for one thing)."""
    steps = [step.strip(" ,.;।") for step in THEN.split(text or "")]
    return [step for step in steps if step and not NEGATED.search(step)][:MAX_STEPS]


def many_steps(text: str) -> bool:
    """Two or more steps in one message: the coach plans them (the instant path never answers
    only the first one)."""
    return len(split_steps(text)) >= 2


# What the owner taps on each card, for the coach's line and the app's steps list.
TAP = {"order": "Send", "purchase_order": "Approve", "proposal": "Save", "reply": "Send"}


def plan_steps(steps: list[str], tool_context: ToolContext) -> dict[str, Any]:
    """One message, 2-5 actions in order ("find suppliers, then order, then ask them"): call
    first, one step per action in the owner's words, then do them. Stop at a card to tap."""
    cleaned = [" ".join(str(step).split())[:STEP_CHARS] for step in steps or []]
    # A step the owner said no to ("then don't send it") is never planned, so never done.
    cleaned = [step for step in cleaned if step and not NEGATED.search(step)][:MAX_STEPS]
    if len(cleaned) < 2:
        tool_context.state[PLAN_STATE] = None
        return {"status": "single_step", "instruction": "Just do it; no plan needed."}
    plan = {
        "steps": cleaned,
        "done": 0,
        "waiting": None,
        "invocation_id": tool_context.invocation_id,
    }
    tool_context.state[PLAN_STATE] = plan
    _mirror(plan)
    return {"status": "planned", "plan": public_plan(plan)}


def public_plan(plan: dict[str, Any] | None) -> dict[str, Any] | None:
    """What the app shows: every step, how many are done, and the card the plan waits for."""
    if not plan:
        return None
    waiting = plan.get("waiting") or None
    return {
        "steps": list(plan["steps"]),
        "done": int(plan["done"]),
        **(
            {"waiting": {"kind": waiting["kind"], "id": waiting["id"], "tap": TAP[waiting["kind"]]}}
            if waiting
            else {}
        ),
        **({"stopped": True} if plan.get("stopped") else {}),
    }


def _mirror(plan: dict[str, Any] | None) -> None:
    """The offline coach fixture reads the plan from the turn's context (it has no session)."""
    ctx = current.get()
    if ctx is not None:
        ctx.plan = plan


def waiting_card(tool: str, response: dict[str, Any]) -> tuple[str, str] | None:
    """The approval card a tool result stands for, as (kind, id), or None."""
    if response.get("proposal_id"):
        return "proposal", str(response["proposal_id"])
    ctx = current.get()
    card = ctx.cards.get(str(response.get("card_id"))) if ctx and response.get("card_id") else None
    if not card:
        return None
    kind, data = card
    if (
        kind == "order"
        and data.get("id")
        and (data.get("status") == "draft" or data.get("pending"))
    ):
        return "order", str(data["id"])
    if kind == "purchase_order" and data.get("id") and data.get("status") == "draft":
        return "purchase_order", str(data["id"])
    if kind == "action" and data.get("target") == "reply" and data.get("thread_id"):
        return "reply", str(data["thread_id"])
    return None


def track_plan(
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext, tool_response: Any
) -> dict[str, Any] | None:
    """ADK after-tool callback: a finished step moves the plan on; a card parks it."""
    plan = tool_context.state.get(PLAN_STATE)
    if not plan or plan.get("waiting") or plan.get("stopped") or tool.name not in STEP_TOOLS:
        return None
    if not isinstance(tool_response, dict) or tool_response.get("status") in NOT_DONE:
        return None
    plan = {**plan, "done": min(len(plan["steps"]), int(plan["done"]) + 1)}
    card = waiting_card(tool.name, tool_response)
    remaining = plan["steps"][plan["done"] :]
    if card and remaining:
        kind, card_id = card
        plan["waiting"] = {
            "kind": kind,
            "id": card_id,
            "tool": tool.name,
            "function_call_id": tool_context.function_call_id,
            "invocation_id": tool_context.invocation_id,
        }
        tool_context.state[PLAN_STATE] = plan
        _mirror(plan)
        return {
            **tool_response,
            "plan": public_plan(plan),
            "instruction": f"Stop here. Say the card is ready: nothing happens until they tap "
            f"{TAP[kind]}. Then the app goes on with: {'; '.join(remaining)}. Do not do those "
            "steps now.",
        }
    if not remaining:
        # Every step done: the plan ends and the app shows them all ticked.
        tool_context.state[PLAN_STATE] = None
        _mirror(None)
        return {**tool_response, "plan": public_plan(plan)}
    tool_context.state[PLAN_STATE] = plan
    _mirror(plan)
    return {**tool_response, "plan": public_plan(plan)}


def card_outcome(ctx: Any, kind: str, card_id: str) -> str:
    """The card's real state on the server: done, discarded, or still waiting for the tap."""
    from . import sourcing, supply_chain

    try:
        if kind == "order":
            order = sourcing.get_order(ctx.store, ctx.uid, ctx.business_id, card_id)
            if order["status"] in {"replaced", "cancelled"}:
                return "discarded"
            return "waiting" if order["status"] == "draft" or order.get("pending") else "done"
        if kind == "purchase_order":
            po = supply_chain.get_po(ctx.store, ctx.uid, ctx.business_id, card_id)
            if po["status"] == "cancelled":
                return "discarded"
            return "waiting" if po["status"] == "draft" else "done"
        if kind == "proposal":
            return "done" if ctx.store.proposal_saved(ctx.uid, card_id) else "waiting"
    except Exception:  # noqa: BLE001 - a card that is gone cannot carry the plan on
        return "discarded"
    # A customer reply goes out from the card itself (the inquiry route); the tap is the proof.
    return "done"


def resume(plan: dict[str, Any] | None, ctx: Any, card_id: str, stop: bool) -> dict[str, Any]:
    """What a resume turn does with the saved plan.

    Returns {"run": False} when there is nothing to continue (no plan, another card, or still
    waiting), {"run": False, "plan": ...} when the plan stops, and {"run": True, "note": ...,
    "plan": ...} with the next step for the coach."""
    waiting = (plan or {}).get("waiting")
    if not plan or not waiting or waiting["id"] != card_id:
        return {"run": False}
    outcome = "discarded" if stop else card_outcome(ctx, waiting["kind"], card_id)
    if outcome == "waiting":
        return {"run": False}
    if outcome == "discarded":
        return {"run": False, "plan": {**plan, "waiting": None, "stopped": True}}
    remaining = plan["steps"][plan["done"] :]
    resumed = {**plan, "waiting": None}
    later = remaining[1:]
    note = (
        f"(App note, not the owner's words.) The owner tapped {TAP[waiting['kind']]} on the "
        f"card from step {plan['done']}; it is done. Do the next step now: {remaining[0]}."
        + (f" After it: {'; '.join(later)}." if later else "")
        + " Never redo finished steps. Reply in the owner's language."
    )
    return {"run": True, "note": note, "plan": resumed}


def plan_instruction(plan: dict[str, Any] | None) -> str:
    """One line in the turn instruction while a plan waits, so "done, carry on" in chat works
    the same as the tap."""
    if not plan or plan.get("stopped"):
        return ""
    waiting = plan.get("waiting")
    remaining = plan["steps"][plan["done"] :]
    if not remaining:
        return ""
    return (
        f"Plan in progress: still to do {'; '.join(remaining)}."
        + (f" Waiting for the owner to tap {TAP[waiting['kind']]} on the card." if waiting else "")
        + " If the owner says carry on, do the next step; if they change course, follow them."
    )


async def resume_plan(
    sessions: Any, app_name: str, uid: str, session_id: str, ctx: Any, card_id: str, stop: bool
) -> tuple[list[Any], str | None, dict[str, Any] | None]:
    """A resume turn: (events for the app, the coach's note or None, the state to save with it).

    No note means no model call: nothing waits for this card, it is still waiting, or the plan
    stopped (saved here at once). The public demo never resumes (it never calls a paid model)."""
    import anyio
    from google.adk.events import Event, EventActions

    from .contracts import StreamEvent

    if ctx is None or not ctx.business_id or ctx.uid.startswith("public-demo-"):
        return [], None, None
    session = await sessions.get_session(app_name=app_name, user_id=uid, session_id=session_id)
    plan = session.state.get(PLAN_STATE) if session else None
    decided = await anyio.to_thread.run_sync(resume, plan, ctx, card_id, stop)
    shown = decided.get("plan")
    events = [StreamEvent(kind="plan", data=public_plan(shown))] if shown else []
    if not decided["run"]:
        if shown and session:
            await sessions.append_event(
                session,
                Event(author="user", actions=EventActions(state_delta={PLAN_STATE: None})),
            )
        return events, None, None
    ctx.plan = shown
    return events, str(decided["note"]), {PLAN_STATE: shown, NOTE_STATE: True}
