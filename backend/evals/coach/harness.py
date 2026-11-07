"""Runs coach eval cases through the production ADK agent and its real tools (OB-173, #532).

Two models drive the same agent:
- offline (CI): ReplayModel makes exactly the calls a case expects, so the suite checks that
  the expected trajectory is valid against today's tools: each tool exists and accepts the
  arguments, the approval card appears (or not), and multi-turn ids carry across turns.
  Free and deterministic; it says nothing about whether Gemini would pick these calls.
- live (by hand): real Gemini picks the tools and writes the reply; every check applies.

A case's store is a fresh SQLite file seeded with synthetic shops (seeds.py).
"""

from __future__ import annotations

import re
from collections.abc import AsyncGenerator, Callable
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo

import anyio
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app import supply_chain
from app.agent import make_agent, ui_language
from app.coordinator import MerchantContext, current
from app.merchant import MerchantStore
from app.settings import Settings
from app.streaming import public_events

from .cases import ANY, Call, Case, Turn
from .seeds import SEEDS

Mode = Literal["offline", "live"]
UID = "eval-owner"
REPLAY_REPLY = "Offline eval replay: done."
# Tool results that mean the arguments were refused.
REFUSED = {
    "invalid",
    "ask_owner",
    "needs_business",
    "unknown_supplier",
    "unknown_order",
    "unsupported",
    "unavailable",
}
# Stream events the owner must approve before anything changes.
APPROVAL_KINDS = {
    "proposal",
    "payment_link",
    "rescue_proposal",
    "order",
    "purchase_order",
    "supply_rules",
}


def approval_card(kind: str, data: dict[str, Any] | None) -> bool:
    data = data or {}
    if kind in APPROVAL_KINDS:
        return True
    if kind == "supply":  # "order"/"send" wait for a tap; "coming"/"needs"/"sap" only show
        return data.get("view") in {"order", "send"}
    return kind == "action" and data.get("target") == "reply"


@dataclass
class TurnRecord:
    say: str
    calls: list[dict[str, Any]] = field(default_factory=list)
    responses: list[dict[str, Any]] = field(default_factory=list)
    cards: list[str] = field(default_factory=list)
    proposals: list[dict[str, Any]] = field(default_factory=list)
    reply: str = ""
    error: str = ""


@dataclass
class CaseResult:
    case: Case
    mode: Mode
    turns: list[tuple[TurnRecord, dict[str, bool]]]
    error: str = ""

    @property
    def passed(self) -> bool:
        return not self.error and all(all(checks.values()) for _, checks in self.turns)

    def failures(self) -> list[str]:
        if self.error:
            return [f"error: {self.error}"]
        return [
            f"turn {index} ({record.say!r}): {label}"
            for index, (record, checks) in enumerate(self.turns, 1)
            for label, ok in checks.items()
            if not ok
        ]


# --- Argument matching ------------------------------------------------------------------------


def fill(value: Any, names: dict[str, Any]) -> Any:
    """Replace "$name" and "{name}" with values found while the case runs."""
    if isinstance(value, dict):
        return {key: fill(item, names) for key, item in value.items()}
    if isinstance(value, list):
        return [fill(item, names) for item in value]
    if isinstance(value, str):
        if value.startswith("$") and value[1:] in names:
            return names[value[1:]]
        return re.sub(r"\{(\w+)\}", lambda m: str(names.get(m[1], m[0])), value)
    return value


def matches(expected: Any, actual: Any, names: dict[str, Any]) -> bool:
    """Does an actual tool argument satisfy the expected one?

    dict: every key must match ("a|b" = either key); list: every expected entry matches some
    actual entry; ANY: present and non-empty; "~regex": case-insensitive search; "$name": the id
    found earlier in the case; numbers compare as numbers ("240" == 240); other strings compare
    case-insensitively."""
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(
            any(key in actual and matches(want, actual[key], names) for key in keys.split("|"))
            for keys, want in expected.items()
        )
    if isinstance(expected, list):
        return isinstance(actual, list) and all(
            any(matches(want, entry, names) for entry in actual) for want in expected
        )
    if expected == ANY:
        return actual not in (None, "", [], {})
    if isinstance(expected, bool):
        return str(actual).casefold() == str(expected).casefold()
    if isinstance(expected, int | float):
        try:
            return float(actual) == float(expected)
        except (TypeError, ValueError):
            return False
    wanted = str(fill(expected, names))
    if wanted.startswith("~"):
        return bool(re.search(wanted[1:], str(actual), re.I))
    return str(actual).strip().casefold() == wanted.strip().casefold()


def found(call: Call, record: TurnRecord, names: dict[str, Any]) -> bool:
    return any(
        made["name"] == call.name and matches(call.args, made["args"], names)
        for made in record.calls
    )


# --- Offline replay model ---------------------------------------------------------------------

# The calls the replay model makes this turn, resolved when made (ids found mid-case).
script: ContextVar[Callable[[int], tuple[str, dict[str, Any]] | None]] = ContextVar("script")


class ReplayModel(BaseLlm):
    """Makes the case's expected calls one by one, then a fixed reply; never calls a provider."""

    model: str = "coach-eval-replay"

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse]:
        answered = 0
        for content in reversed(llm_request.contents):
            parts = content.parts or []
            if content.role == "user" and any(part.text for part in parts):
                break
            answered += sum(1 for part in parts if part.function_response)
        step = script.get()(answered)
        part = (
            types.Part(function_call=types.FunctionCall(name=step[0], args=step[1]))
            if step
            else types.Part(text=REPLAY_REPLY)
        )
        yield LlmResponse(content=types.Content(role="model", parts=[part]))


# --- Ids that later turns refer to ------------------------------------------------------------


def soon(store: MerchantStore, bid: str) -> str:
    """An HH:MM later today in the shop's time zone (a rescue deadline)."""
    fields = store.context(UID, bid)["business"]["fields"]
    now = datetime.now(ZoneInfo(fields.get("timezone") or "Asia/Kolkata"))
    later = min(now + timedelta(minutes=60), now.replace(hour=23, minute=59))
    return later.strftime("%H:%M")


def seeded_names(store: MerchantStore, bid: str) -> dict[str, Any]:
    names: dict[str, Any] = {"soon": soon(store, bid)}
    if threads := store.inquiries(UID, bid):
        names["thread"] = threads[0].id
    if sent := [o for o in store.supplier_orders(UID, bid) if o["status"] == "sent"]:
        names["sent_order"] = sent[0]["id"]
    if purchase_orders := supply_chain.orders(store, UID, bid):
        names["po_supplier"] = purchase_orders[0]["supplier"]["name"]
    return names


def learn(names: dict[str, Any], tool: str, response: dict[str, Any]) -> None:
    """Remember ids from tool results ("the cheapest one", "make it 15 kg")."""
    if tool == "get_customer_messages" and response.get("threads"):
        names["thread"] = response["threads"][0]["thread_id"]
    elif tool == "find_suppliers" and response.get("suppliers"):
        priced = [s for s in response["suppliers"] if s["item"].get("price") is not None]
        if priced:
            names["cheapest"] = min(priced, key=lambda s: float(s["item"]["price"]))["id"]
    elif tool == "prepare_order" and response.get("order_id"):
        names["draft_order"] = response["order_id"]


# --- Checks -----------------------------------------------------------------------------------


def pin_moves(record: TurnRecord, before: dict[str, Any]) -> bool:
    """A location change proposes a new map pin, not just new words (#527)."""
    for proposal in record.proposals:
        fields = (proposal.get("snapshot") or {}).get("business") or {}
        lat, lng = fields.get("lat"), fields.get("lng")
        if lat is not None and lng is not None and (lat, lng) != (before["lat"], before["lng"]):
            return True
    return False


def one_products_call(record: TurnRecord, before: dict[str, Any]) -> bool:
    """Two menu changes in one message are one review, not two."""
    return sum(call["name"] == "propose_products" for call in record.calls) == 1


EXTRA: dict[str, Callable[[TurnRecord, dict[str, Any]], bool]] = {
    "pin_moves": pin_moves,
    "one_products_call": one_products_call,
}

# Never shown to the owner: internal field names or tags (as in scripts/coach_eval).
LEAKS = r"\b(?:True|False|proposal_id|card_id|paise)\b|\[language"


def check(
    turn: Turn, record: TurnRecord, names: dict[str, Any], before: dict[str, Any], mode: Mode
) -> dict[str, bool]:
    results: dict[str, bool] = {}
    if record.error:
        results[f"runs without error ({record.error})"] = False
    for call in turn.calls:
        results[f"calls {call.name} {call.args or ''}".strip()] = found(call, record, names)
        last = [r for r in record.responses if r["name"] == call.name][-1:]
        results[f"{call.name} accepts the arguments"] = bool(last) and (
            last[0]["response"].get("status") not in REFUSED
        )
    made = {call["name"] for call in record.calls}
    if forbidden := sorted(made & set(turn.forbid)):
        results[f"must not call {', '.join(forbidden)}"] = False
    elif turn.forbid:
        results["calls nothing forbidden"] = True
    if turn.card is not None:
        results["approval card" if turn.card else "no approval card"] = (
            bool(record.cards) == turn.card
        )
    if turn.extra:
        results[turn.extra] = EXTRA[turn.extra](record, before)
    if mode == "live":
        reply = record.reply
        results["replies"] = bool(reply.strip())
        results["no internal fields in reply"] = not re.search(LEAKS, reply)
        if turn.ask:
            results["asks exactly one question"] = reply.count("?") == 1
        for pattern in turn.reply_has:
            results[f"reply has /{pattern}/"] = bool(re.search(fill(pattern, names), reply, re.I))
        for pattern in turn.reply_not:
            results[f"reply lacks /{pattern}/"] = not re.search(fill(pattern, names), reply, re.I)
    return results


# --- Running a case ---------------------------------------------------------------------------


def settings_for(mode: Mode, model: str = "") -> Settings:
    if mode == "offline":
        return Settings(_env_file=None, v1_enabled=True, coach_mode="offline", app_env="test")  # type: ignore[call-arg]
    return Settings(  # type: ignore[call-arg]
        _env_file=None,
        v1_enabled=True,
        coach_mode="gemini",
        app_env="test",
        google_text_model=model,
        google_live_model=model,
    )


async def run_case(case: Case, mode: Mode, root: Path, model: str = "") -> CaseResult:
    store = MerchantStore(str(root / f"{case.id}.sqlite3"))
    # Some seeds run the supply chain's own event loop: keep them off this one.
    bid = await anyio.to_thread.run_sync(SEEDS[case.seed], store, UID)
    names = seeded_names(store, bid)
    agent = make_agent(settings_for(mode, model))
    if mode == "offline":
        agent.model = ReplayModel()
    sessions = InMemorySessionService()
    runner = Runner(app_name="coach_eval", agent=agent, session_service=sessions)
    session = await sessions.create_session(
        app_name="coach_eval", user_id=UID, state={"business_id": bid}
    )
    ui_language.set(case.language)
    turns: list[tuple[TurnRecord, dict[str, bool]]] = []
    for turn in case.turns:
        said = str(fill(turn.say, names))
        fields = store.context(UID, bid)["business"]["fields"]
        before = {"lat": fields.get("lat"), "lng": fields.get("lng")}
        record = TurnRecord(said)
        # Checks use the ids known when the turn began ("make it 15 kg" replaces that draft).
        known = dict(names)

        def step(index: int, turn: Turn = turn) -> tuple[str, dict[str, Any]] | None:
            if index >= len(turn.calls):
                return None
            call = turn.calls[index]
            return call.name, fill(call.replay if call.replay is not None else call.args, names)

        context = MerchantContext(store, UID, bid, [], said)
        tokens = (current.set(context), script.set(step))
        try:
            async for event in runner.run_async(
                user_id=UID,
                session_id=session.id,
                new_message=types.Content(role="user", parts=[types.Part(text=said)]),
            ):
                for call in event.get_function_calls():
                    record.calls.append({"name": call.name, "args": dict(call.args or {})})
                for response in event.get_function_responses():
                    body = dict(response.response or {})
                    record.responses.append({"name": response.name, "response": body})
                    learn(names, response.name or "", body)
                for public in public_events(event):
                    if public.kind == "proposal" and public.data:
                        record.proposals.append(public.data)
                    if approval_card(public.kind, public.data):
                        record.cards.append(public.kind)
                    if public.kind == "error":
                        record.error = public.code or "error"
                if event.content and event.content.role == "model" and not event.partial:
                    text = "".join(
                        part.text or "" for part in event.content.parts or [] if not part.thought
                    )
                    if text.strip():
                        record.reply = text.strip()
        except Exception as error:  # one broken turn fails the case, not the whole run
            record.error = repr(error)[:300]
        finally:
            current.reset(tokens[0])
            script.reset(tokens[1])
        turns.append((record, check(turn, record, known, before, mode)))
    return CaseResult(case, mode, turns)
