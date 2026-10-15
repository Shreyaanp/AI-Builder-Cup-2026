import asyncio
from collections.abc import AsyncIterator
from uuid import uuid4

import anyio
from fastapi import HTTPException
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService
from google.genai import types

from .agent import make_agent, ui_language
from .auth import Principal
from .contracts import StreamEvent
from .coordinator import current, ui_currency
from .settings import Settings

APP_NAME = "ogoogle_ai"
# Tools whose results reach the chat as supplier or order cards.
SOURCING_TOOLS = {"find_suppliers", "prepare_order", "message_supplier", "cancel_order"}


def public_events(event: Event) -> list[StreamEvent]:
    """Expose allowed UI fields, excluding thoughts, tool arguments and provider error details."""
    output: list[StreamEvent] = []
    if event.error_code:
        return [StreamEvent(kind="error", code="PROVIDER_ERROR")]
    if event.interrupted:
        output.append(StreamEvent(kind="interrupted"))
    for name in ["input_transcription", "output_transcription"]:
        transcription = getattr(event, name, None)
        if transcription and transcription.text:
            output.append(
                StreamEvent(
                    kind="input_transcript"
                    if name == "input_transcription"
                    else "output_transcript",
                    text=transcription.text[:4000],
                )
            )
    if event.content and event.content.role == "model":
        text = "".join(part.text or "" for part in event.content.parts or [] if not part.thought)
        if text:
            output.append(StreamEvent(kind="delta" if event.partial else "reply", text=text[:4000]))
    if event.turn_complete:
        output.append(StreamEvent(kind="turn_complete"))
    if event.content:
        for part in event.content.parts or []:
            call = part.function_call
            if call and call.name == "find_suppliers":
                # Shown at once, while the search runs, as "Searching nearby suppliers…".
                item = str((call.args or {}).get("item") or "")[:80]
                output.append(
                    StreamEvent(kind="sourcing", data={"stage": "searching", "item": item})
                )
            response = part.function_response
            if response and response.name == "propose_rescue_deal":
                merchant = current.get()
                card = (
                    merchant.cards.get(str((response.response or {}).get("card_id")))
                    if merchant
                    else None
                )
                if card:
                    output.append(StreamEvent(kind="rescue_proposal", data=card[1]))
            if response and response.name in SOURCING_TOOLS:
                merchant = current.get()
                card = (
                    merchant.cards.get(str((response.response or {}).get("card_id")))
                    if merchant
                    else None
                )
                if card:
                    output.append(
                        StreamEvent(
                            kind="suppliers" if card[0] == "suppliers" else "order", data=card[1]
                        )
                    )
            if response and response.name in {
                "propose_business",
                "propose_customer_facts",
                "propose_products",
                "request_registration",
            }:
                payload = response.response or {}
                # The model sees only the id; the exact sealed proposal goes to the review UI.
                merchant = current.get()
                proposal = (
                    merchant.proposals.get(str(payload.get("proposal_id"))) if merchant else None
                )
                if proposal:
                    output.append(StreamEvent(kind="proposal", data=proposal))
                if payload.get("status") in {"verification_required", "save_business_first"}:
                    output.append(StreamEvent(kind="workflow", data={"status": payload["status"]}))
    return output


# Conversations kept per account (oldest cleared first) and events per conversation.
MAX_CONVERSATIONS = 20
MAX_EVENTS = 400


class CoachRuntime:
    def __init__(self, settings: Settings, sessions: BaseSessionService) -> None:
        self.settings = settings
        self.sessions = sessions
        self.text_runner = Runner(
            app_name=APP_NAME, agent=make_agent(settings), session_service=sessions
        )
        self.live_runner = Runner(
            app_name=APP_NAME, agent=make_agent(settings, live=True), session_service=sessions
        )

    async def session(
        self, principal: Principal, requested: str | None, business_id: str | None = None
    ) -> str:
        if requested:
            existing = await self.sessions.get_session(
                app_name=APP_NAME,
                user_id=principal.uid,
                session_id=requested,
            )
            if not existing:
                raise HTTPException(404, "Conversation not found in this workspace.")
            if existing.state.get("business_id") != business_id:
                raise HTTPException(404, "Conversation belongs to a different business.")
            if len(existing.events) < MAX_EVENTS:
                return requested
            # Ownership and shop scope were checked above. Keep the full history and start
            # a fresh thread; transports announce the changed id in their ready event.
        listing = await self.sessions.list_sessions(app_name=APP_NAME, user_id=principal.uid)
        # Keep the newest conversations and quietly clear the oldest, instead of refusing every
        # new chat and voice session once an account had 20 (owner report, 15 Oct: the mic said
        # "Too many requests" forever). Shop records live elsewhere; only old chat history goes.
        if len(listing.sessions) >= MAX_CONVERSATIONS:
            oldest = sorted(listing.sessions, key=lambda item: item.last_update_time or 0)
            for stale in oldest[: len(listing.sessions) - MAX_CONVERSATIONS + 1]:
                await self.sessions.delete_session(
                    app_name=APP_NAME, user_id=principal.uid, session_id=stale.id
                )
        session_id = str(uuid4())
        await self.sessions.create_session(
            app_name=APP_NAME,
            user_id=principal.uid,
            session_id=session_id,
            state={"business_id": business_id},
        )
        return session_id

    async def text_events(
        self,
        principal: Principal,
        session_id: str,
        text: str,
        language: str,
        currency: str | None = None,
    ) -> AsyncIterator[StreamEvent]:
        # The app language reaches the instruction via a context variable, never the owner's
        # message (models echo bracketed prefixes back into replies).
        ui_language.set(language)
        run = self.text_runner.run_async(
            user_id=principal.uid,
            session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part(text=text)]),
            # Room for context → propose → self-repair → propose → reply.
            run_config=RunConfig(streaming_mode=StreamingMode.SSE, max_llm_calls=8),
        )
        queue: asyncio.Queue[StreamEvent | Exception | None] = asyncio.Queue(maxsize=8)

        async def produce() -> None:
            # A raw asyncio task isolates ADK/SQLAlchemy cleanup from the SSE
            # task group's repeated (level) cancellation on browser disconnect.
            currency_token = ui_currency.set(currency)
            try:
                try:
                    async for event in run:
                        for visible in public_events(event):
                            await queue.put(visible)
                            if visible.kind == "error":
                                return
                finally:
                    await run.aclose()
            except Exception as error:
                await queue.put(error)
            else:
                await queue.put(None)
            finally:
                ui_currency.reset(currency_token)

        task = asyncio.create_task(produce(), name="adk-text-producer")
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                if isinstance(item, Exception):
                    raise item
                yield item
                if item.kind == "error":
                    return
        finally:
            if not task.done():
                task.cancel()
            with anyio.CancelScope(shield=True):
                async with asyncio.timeout(5):
                    await asyncio.gather(task, return_exceptions=True)
        yield StreamEvent(kind="turn_complete", session_id=session_id)
