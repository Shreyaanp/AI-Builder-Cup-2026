"""Live A/B of GEMINI_CONTEXT_CACHE: the same coach turns with the shared cache off and on.

Paid (a handful of Flash calls); run only with the owner's approval:
  GOOGLE_CLOUD_PROJECT=... uv run python -m scripts.context_cache_ab
Hard cap: 10 model calls in total (CACHE_AB_MAX_CALLS). Reports, per mode, the tool calls each
turn made and the tokens billed from the responses' usage metadata, then deletes its cache.
Optional: CACHE_AB_MODEL (default gemini-3.5-flash), CACHE_AB_OUT=results.json.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from google.adk.models.google_llm import Gemini
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.sessions import InMemorySessionService

from app.auth import Principal
from app.context_cache import CachedGemini, cache_usage
from app.coordinator import MerchantContext, current
from app.merchant import MerchantStore
from app.settings import Settings
from app.streaming import CoachRuntime
from scripts.latency_bench import seed

TURNS = ["Share my page", "What are my hours?"]
MAX_CALLS = int(os.getenv("CACHE_AB_MAX_CALLS", "10"))
# Vertex bills cached input at 10% of the input rate (90% discount) for Gemini 2.5 and later.
CACHED_RATE = 0.1

calls: list[dict[str, Any]] = []
original = Gemini.generate_content_async


async def recording(
    self: Gemini, llm_request: LlmRequest, stream: bool = False
) -> AsyncGenerator[LlmResponse]:
    if len(calls) >= MAX_CALLS:
        raise RuntimeError("Call budget reached")
    entry: dict[str, Any] = {
        "cached_content": bool(llm_request.config and llm_request.config.cached_content),
        "tool_calls": [],
        "usage": {},
    }
    calls.append(entry)
    async for response in original(self, llm_request, stream):
        if response.usage_metadata:
            entry["usage"] = cache_usage(response)
        if not response.partial and response.content:
            entry["tool_calls"] += [
                f"{part.function_call.name}({json.dumps(part.function_call.args, sort_keys=True)})"
                for part in response.content.parts or []
                if part.function_call
            ]
        yield response


async def run(settings: Settings, root: Path, mode: str) -> dict[str, Any]:
    store = MerchantStore(str(root / f"{mode}.sqlite3"))
    uid = "cache-ab-owner"
    bid = seed(store, uid)
    runtime = CoachRuntime(settings, InMemorySessionService())
    principal = Principal(uid=uid, source="local")
    sid = await runtime.session(principal, None, bid)
    turns = []
    for text in TURNS:
        first = len(calls)
        token = current.set(MerchantContext(store, uid, bid, []))
        reply = ""
        try:
            async for event in runtime.text_events(principal, sid, text, "en"):
                if event.kind == "reply":
                    reply = event.text or ""
                if event.kind == "error":
                    reply = f"[error {event.code}]"
        finally:
            current.reset(token)
        made = calls[first:]
        turns.append(
            {
                "owner": text,
                "tool_calls": [c for call in made for c in call["tool_calls"]],
                "model_calls": len(made),
                "cached_calls": sum(call["cached_content"] for call in made),
                "reply": reply[:200],
            }
        )
    model = runtime.text_runner.agent.model
    if isinstance(model, CachedGemini):
        # Stop paying cache storage as soon as the measurement is done.
        for name, _ in model._caches.values():
            await model.api_client.aio.caches.delete(name=name)
    return {"turns": turns}


async def main() -> dict[str, Any]:
    Gemini.generate_content_async = recording  # type: ignore[method-assign]
    base: dict[str, Any] = {
        "app_env": "test",
        "v1_enabled": True,
        "_env_file": None,
        "coach_mode": "gemini",
        "gemini_backend": "vertex",
        "google_cloud_project": os.environ["GOOGLE_CLOUD_PROJECT"],
        "google_text_model": os.getenv("CACHE_AB_MODEL", "gemini-3.5-flash"),
        "google_live_model": "gemini-3.8-live",
        "instant_path_enabled": False,
    }
    results: dict[str, Any] = {"model": base["google_text_model"], "turns": TURNS}
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
        for mode, on in (("off", False), ("on", True)):
            start = len(calls)
            settings = Settings(**base, gemini_context_cache=on)
            results[mode] = await run(settings, Path(folder), mode)
            usage = [call["usage"] for call in calls[start:]]
            prompt = sum(u.get("prompt", 0) for u in usage)
            cached = sum(u.get("cached", 0) for u in usage)
            results[mode] |= {
                "prompt_tokens": prompt,
                "cached_tokens": cached,
                "output_tokens": sum(u.get("output", 0) for u in usage),
                # Input tokens priced at the full rate: uncached + cached at the cached rate.
                "input_billed_equivalent": round(prompt - cached + cached * CACHED_RATE),
            }
    results["model_calls"] = len(calls)
    results["same_tool_calls"] = [t["tool_calls"] for t in results["off"]["turns"]] == [
        t["tool_calls"] for t in results["on"]["turns"]
    ]
    off, on = results["off"]["input_billed_equivalent"], results["on"]["input_billed_equivalent"]
    results["input_saving_percent"] = round(100 * (off - on) / off, 1) if off else None
    return results


if __name__ == "__main__":
    text = json.dumps(asyncio.run(main()), indent=2, ensure_ascii=False)
    print(text)
    if out := os.getenv("CACHE_AB_OUT"):
        Path(out).write_text(text + "\n", encoding="utf-8")
