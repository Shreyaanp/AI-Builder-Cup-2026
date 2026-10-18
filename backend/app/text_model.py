"""Gemini text calls that ride out a busy model (chat, search, close the day).

A 429 (quota) or 503 (overloaded) is retried with exponential backoff and jitter, at most three
tries within six seconds, then the call goes once to the fallback model
(GOOGLE_TEXT_FALLBACK_MODEL, a lighter model with its own capacity). Every retry and fallback is
logged (gemini_text_retry, gemini_text_fallback, gemini_text_busy). Other errors are raised at
once: the callers already turn them into their own clean fallbacks.
"""

import asyncio
import random
import time
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any

import structlog
from google.adk.models.google_llm import Gemini
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from .settings import Settings

log = structlog.get_logger()

BUSY_STATUS = (429, 503)
ATTEMPTS = 3
BASE_DELAY_SECONDS = 0.5
BUDGET_SECONDS = 6.0


def busy_status(error: BaseException) -> int | None:
    """429/503 from the model, also when wrapped (ADK re-raises a 429 as its own error)."""
    seen: BaseException | None = error
    while seen is not None:
        code = getattr(seen, "code", None)
        if code in BUSY_STATUS:
            return int(code)
        seen = seen.__cause__
    return None


class Tries:
    """The busy-model policy for one call: the main model up to ATTEMPTS times within
    BUDGET_SECONDS, then the fallback model once."""

    def __init__(self, flow: str, model: str, fallback: str = "") -> None:
        self.flow = flow
        self.main = model
        self.fallback = fallback if fallback and fallback != model else ""
        self.model = model
        self.attempt = 1
        self.started = time.monotonic()

    async def again(self, error: BaseException) -> bool:
        """After a failed try: wait and set up the next one (True), or give up (False)."""
        status = busy_status(error)
        if status is None:
            return False
        if self.model == self.main:
            delay = BASE_DELAY_SECONDS * 2 ** (self.attempt - 1) * (1 + random.random() / 2)  # noqa: S311
            elapsed = time.monotonic() - self.started
            if self.attempt < ATTEMPTS and elapsed + delay < BUDGET_SECONDS:
                log.warning(
                    "gemini_text_retry",
                    flow=self.flow,
                    model=self.model,
                    attempt=self.attempt,
                    status=status,
                    delay=round(delay, 2),
                )
                await asyncio.sleep(delay)
                self.attempt += 1
                return True
            if self.fallback:
                log.warning(
                    "gemini_text_fallback",
                    flow=self.flow,
                    model=self.main,
                    fallback=self.fallback,
                    attempts=self.attempt,
                    status=status,
                )
                self.model, self.attempt = self.fallback, 1
                return True
        log.warning("gemini_text_busy", flow=self.flow, model=self.model, status=status)
        return False


def tries(settings: Settings, flow: str) -> Tries:
    return Tries(flow, settings.google_text_model, settings.google_text_fallback_model)


async def generate(client: Any, settings: Settings, flow: str, **request: Any) -> Any:
    """`client.aio.models.generate_content` with the busy-model policy (no `model` argument)."""
    plan = tries(settings, flow)
    while True:
        try:
            return await client.aio.models.generate_content(model=plan.model, **request)
        except Exception as error:
            if not await plan.again(error):
                raise


async def generate_stream(
    client: Any, settings: Settings, flow: str, **request: Any
) -> AsyncIterator[types.GenerateContentResponse]:
    """`generate_content_stream` with the busy-model policy: a busy model refuses before the
    first chunk, so only the opening is tried again (a stream never restarts half-way)."""
    plan = tries(settings, flow)
    while True:
        try:
            chunks = await client.aio.models.generate_content_stream(model=plan.model, **request)
            first = await anext(chunks, None)
            break
        except Exception as error:
            if not await plan.again(error):
                raise
    if first is None:
        return
    yield first
    async for chunk in chunks:
        yield chunk


class SteadyGemini(Gemini):
    """The text coach's model with the busy-model policy. A try is repeated only while nothing
    has been passed on yet, so the owner never sees half a reply twice."""

    fallback_model: str = ""

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse]:
        plan = Tries("chat", llm_request.model or self.model, self.fallback_model)
        while True:
            llm_request.model = plan.model
            passed_on = False
            try:
                async for response in super().generate_content_async(llm_request, stream):
                    passed_on = True
                    yield response
                return
            except Exception as error:
                if passed_on or not await plan.again(error):
                    raise
