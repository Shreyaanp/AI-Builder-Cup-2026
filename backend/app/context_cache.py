"""Vertex context caching for the text coach (owner chat and new-shop onboarding; never Live).

The coach sends the same long rules and ~30 tool schemas on every model call. With
GEMINI_CONTEXT_CACHE on, that stable prefix lives in one Vertex cache shared by every shop, and
each call pays the cached input rate for it. Only this turn's part of the instruction (reply
language, region, shop snapshot, new-shop draft) is sent with the conversation.

Safety first, because the coach works well as it is:
- the agent, its instruction text and its tools are unchanged; the split happens on the
  outgoing request copy, so turning the switch off is exactly the old request;
- the cache key hashes the model, the cached text, the tool schemas and CACHE_VERSION, so any
  prompt or tool change makes a new cache instead of reusing a stale one;
- any cache error (create, expired, rejected request) sends the ordinary request instead, and
  a failed create is not retried for a few minutes.
"""

import asyncio
import hashlib
import json
import time
from collections.abc import AsyncGenerator
from typing import Any

import structlog
from google.adk.models.google_llm import Gemini
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import PrivateAttr

from .settings import Settings
from .text_model import SteadyGemini

log = structlog.get_logger()

# Bump to force fresh caches without a prompt change.
CACHE_VERSION = "1"
TURN_LABEL = "Context for this turn, from the app (not the owner's words):\n"
# Vertex rejects explicit caches below a per-model token floor; smaller prefixes skip caching.
MIN_TOKENS = {"gemini-2.5": 2048, "gemini-3": 4096}
# Use a cache until shortly before Vertex expires it, then make the next one.
REFRESH_MARGIN = 120
SAFETY_MARGIN = 30
RETRY_AFTER = 300


def uses_gemini_context_cache(settings: Settings) -> bool:
    # Explicit caches are a Vertex feature; the API-key backend and the offline fixture skip it.
    return (
        settings.gemini_context_cache
        and settings.coach_mode == "gemini"
        and settings.gemini_backend == "vertex"
    )


def min_tokens(model: str) -> int:
    name = model.rsplit("/", maxsplit=1)[-1]
    return next((floor for prefix, floor in MIN_TOKENS.items() if name.startswith(prefix)), 4096)


def split_instruction(text: str, stable_parts: list[str]) -> tuple[str, str] | None:
    """(cacheable prefix, this turn's part) of the coach's system instruction, or None when the
    instruction is not the coach's. The first stable part is the coach rules; later parts (the
    new-shop rules) join the prefix when this turn includes them."""
    anchor, *extras = stable_parts
    start = text.find(anchor)
    if start < 0:
        return None
    stable, dynamic = text[: start + len(anchor)], text[start + len(anchor) :]
    for extra in extras:
        if extra and extra in dynamic:
            stable += "\n\n" + extra
            dynamic = dynamic.replace(extra, "", 1)
    return stable, dynamic.strip()


class CachedGemini(SteadyGemini):
    """Text coach with the shared Vertex cache and the ordinary busy-model fallback."""

    stable_parts: list[str]
    cache_ttl: int = 3600
    _caches: dict[str, tuple[str, float]] = PrivateAttr(default_factory=dict)
    _retry_after: dict[str, float] = PrivateAttr(default_factory=dict)
    _creating: dict[str, asyncio.Task[None]] = PrivateAttr(default_factory=dict)
    _counts: dict[str, int] = PrivateAttr(default_factory=dict)

    def count(self, result: str) -> dict[str, int]:
        """Running totals since start-up, logged with every cache decision so the hit rate
        is one log line away."""
        self._counts[result] = self._counts.get(result, 0) + 1
        return {name: self._counts.get(name, 0) for name in ("hit", "miss", "skipped")}

    def cache_key(
        self, model: str, stable: str, tools: list[types.Tool], tool_config: types.ToolConfig | None
    ) -> str:
        fingerprint = json.dumps(
            [
                CACHE_VERSION,
                model,
                stable,
                [tool.model_dump(mode="json", exclude_none=True) for tool in tools],
                tool_config.model_dump(mode="json", exclude_none=True) if tool_config else None,
            ],
            sort_keys=True,
            ensure_ascii=False,
        )
        return hashlib.sha256(fingerprint.encode()).hexdigest()[:16]

    def cache_name(
        self, model: str, stable: str, tools: list[types.Tool], tool_config: types.ToolConfig | None
    ) -> tuple[str, str] | None:
        """(key, Vertex cache name) for this prefix, shared by every shop; None sends the
        ordinary request. A missing or ageing cache is made in the background, so no owner's
        turn ever waits for it (creating one took ~4 s in the live A/B)."""
        schemas = json.dumps([tool.model_dump(mode="json", exclude_none=True) for tool in tools])
        # About four characters per token; below the floor Vertex would refuse the cache.
        if (len(stable) + len(schemas)) // 4 < min_tokens(model):
            log.info(
                "context_cache", result="skipped", reason="below_minimum", **self.count("skipped")
            )
            return None
        key = self.cache_key(model, stable, tools, tool_config)
        now = time.monotonic()
        entry = self._caches.get(key)
        if not entry or entry[1] - REFRESH_MARGIN <= now:
            self.start_create(key, model, stable, tools, tool_config)
        # Never send a cache in its last seconds: it could expire before Vertex reads it.
        if entry and entry[1] - SAFETY_MARGIN > now:
            log.info("context_cache", result="hit", key=key, **self.count("hit"))
            return key, entry[0]
        log.info("context_cache", result="miss", key=key, **self.count("miss"))
        return None

    def start_create(
        self,
        key: str,
        model: str,
        stable: str,
        tools: list[types.Tool],
        tool_config: types.ToolConfig | None,
    ) -> None:
        if key in self._creating or self._retry_after.get(key, 0) > time.monotonic():
            return

        async def create() -> None:
            started = time.monotonic()
            try:
                cache = await self.api_client.aio.caches.create(
                    model=model,
                    config=types.CreateCachedContentConfig(
                        display_name="coach-" + key,
                        system_instruction=stable,
                        tools=tools,
                        tool_config=tool_config,
                        ttl=f"{self.cache_ttl}s",
                    ),
                )
                if not cache.name:
                    raise ValueError("Cache without a name")
            except Exception as error:  # noqa: BLE001 - caching is an optimisation only
                log.warning("context_cache_unavailable", stage="create", error=type(error).__name__)
                self._retry_after[key] = time.monotonic() + RETRY_AFTER
                return
            finally:
                self._creating.pop(key, None)
            self._caches = {k: v for k, v in self._caches.items() if v[1] > started}
            self._caches[key] = (cache.name, started + self.cache_ttl)
            log.info("context_cache", result="created", key=key)

        self._creating[key] = asyncio.create_task(create())

    def forget(self, key: str) -> None:
        # A rejected cached request pauses caching for this prefix, so a cache Vertex keeps
        # refusing is not recreated (and paid for) on every turn.
        self._caches.pop(key, None)
        self._retry_after[key] = time.monotonic() + RETRY_AFTER

    async def cached_request(self, llm_request: LlmRequest) -> tuple[str, LlmRequest] | None:
        """A copy of the request that uses the shared cache, or None to send it unchanged."""
        config = llm_request.config
        if (
            llm_request.cache_config is not None  # ADK's own caching (CONTEXT_CACHE_ENABLED)
            or not llm_request.model
            or config is None
            or config.cached_content
            or not isinstance(config.system_instruction, str)
            or not all(isinstance(tool, types.Tool) for tool in config.tools or [])
        ):
            return None
        parts = split_instruction(config.system_instruction, self.stable_parts)
        if parts is None:
            return None
        stable, dynamic = parts
        tools = [tool for tool in config.tools or [] if isinstance(tool, types.Tool)]
        found = self.cache_name(llm_request.model, stable, tools, config.tool_config)
        if found is None:
            return None
        key, name = found
        # turn_instruction supplies language_rule(reply_language(tag)); keep the full dynamic
        # instruction intact when adding it to this request.
        turn = [types.Content(role="user", parts=[types.Part(text=TURN_LABEL + dynamic)])]
        plan = llm_request.model_copy(
            update={
                "config": config.model_copy(
                    update={
                        "system_instruction": None,
                        "tools": None,
                        "tool_config": None,
                        "cached_content": name,
                        "http_options": config.http_options.model_copy()
                        if config.http_options
                        else None,
                    }
                ),
                "contents": [*(turn if dynamic else []), *llm_request.contents],
            }
        )
        return key, plan

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse]:
        try:
            cached = await self.cached_request(llm_request)
        except Exception as error:  # noqa: BLE001
            log.warning("context_cache_unavailable", stage="prepare", error=type(error).__name__)
            cached = None
        if cached is not None:
            key, plan = cached
            started = False
            try:
                # The cached prefix already contains the per-turn language rule. Bypass the
                # steady wrapper for this request so it does not append that rule again.
                async for response in Gemini.generate_content_async(self, plan, stream):
                    started = True
                    if not response.partial and (usage := cache_usage(response)):
                        log.info("context_cache_usage", key=key, **usage)
                    yield response
                return
            except Exception as error:
                if started:
                    raise  # words already reached the owner; never answer twice
                # Expired, deleted or rejected cache: the ordinary request answers this turn.
                log.warning("context_cache_fallback", error=type(error).__name__, key=key)
                self.forget(key)
        async for response in super().generate_content_async(llm_request, stream):
            yield response


def cache_usage(response: Any) -> dict[str, int]:
    """Billed token counts from a response's usage metadata (cached tokens bill at the
    discounted rate)."""
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return {}
    return {
        "prompt": usage.prompt_token_count or 0,
        "cached": usage.cached_content_token_count or 0,
        "output": (usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0),
    }
