"""Time to first visible output of the text coach, per flow, p50/p95.

Offline (default, free): the instant path against the same turn without it (the offline
fixture model stands in for Gemini, so "agent" here is ADK overhead only, not model time).

Live (paid; run only with the owner's approval): the same common requests through Gemini with
the instant path off, and multi-turn sessions with Vertex context caching off and on:
  COACH_EVAL_LIVE=1 GOOGLE_CLOUD_PROJECT=... uv run python -m scripts.latency_bench
Optional: LATENCY_RUNS (default 20 offline, 5 live), LATENCY_OUT=results.json.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from google.adk.sessions import InMemorySessionService

from app.auth import Principal
from app.coordinator import MerchantContext, current
from app.latency import percentile
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.settings import Settings
from app.streaming import CoachRuntime

COMMON = [
    "Kaya toast is sold out",
    "Kopi is 2 dollars now",
    "Kaya toast is back",
    "We're closed today",
    "Share my page",
    "Any messages?",
    "What are my hours?",
    "How do I rescue leftovers?",
]
# Turns of one conversation, so a context cache can be reused from the second turn.
CONVERSATION = [
    "How is business this week?",
    "What should I prepare tomorrow?",
    "Remember that we close early on Fridays",
    "Is kopi priced right?",
]
VISIBLE = {"delta", "reply", "proposal", "action", "chart", "suppliers"}


def seed(store: MerchantStore, uid: str) -> str:
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ah Ming Kopi",
                category="Kopitiam",
                location="Tiong Bahru, Singapore",
                hours="7am-9pm",
            ),
            products=[
                ProductFields(name="Kopi", price=180, unit="cup"),
                ProductFields(name="Kaya toast", price=250, unit="set"),
            ],
        ),
    )
    return str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])


async def first_output(
    runtime: CoachRuntime, store: MerchantStore, uid: str, bid: str, sid: str, text: str
) -> float:
    token = current.set(MerchantContext(store, uid, bid, []))
    started = time.perf_counter()
    first = 0.0
    try:
        async for event in runtime.text_events(Principal(uid=uid, source="local"), sid, text, "en"):
            if not first and event.kind in VISIBLE:
                first = (time.perf_counter() - started) * 1000
    finally:
        current.reset(token)
    return first or (time.perf_counter() - started) * 1000


def summary(values: list[float]) -> dict[str, float]:
    return {
        "n": len(values),
        "p50_ms": round(percentile(values, 0.5), 1),
        "p95_ms": round(percentile(values, 0.95), 1),
    }


async def flow(settings: Settings, messages: list[str], runs: int, root: Path, name: str) -> Any:
    store = MerchantStore(str(root / f"{name}.sqlite3"))
    uid = "bench-owner"
    bid = seed(store, uid)
    runtime = CoachRuntime(settings, InMemorySessionService())
    principal = Principal(uid=uid, source="local")
    times: list[float] = []
    for _ in range(runs):
        sid = await runtime.session(principal, None, bid)
        for text in messages:
            times.append(await first_output(runtime, store, uid, bid, sid, text))
    return summary(times)


async def main() -> dict[str, Any]:
    live = os.getenv("COACH_EVAL_LIVE") == "1"
    runs = int(os.getenv("LATENCY_RUNS", "5" if live else "20"))
    base: dict[str, Any] = {"app_env": "test", "v1_enabled": True, "_env_file": None}
    if live:
        base |= {
            "coach_mode": "gemini",
            "gemini_backend": "vertex",
            "google_cloud_project": os.environ["GOOGLE_CLOUD_PROJECT"],
            "google_text_model": os.getenv("COACH_EVAL_MODEL", "gemini-3.5-flash"),
            "google_live_model": "gemini-3.8-live",
        }
    results: dict[str, Any] = {"live": live, "runs": runs}
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
        root = Path(folder)
        results["common_instant"] = await flow(
            Settings(**base, instant_path_enabled=True), COMMON, runs, root, "instant"
        )
        results["common_agent"] = await flow(
            Settings(**base, instant_path_enabled=False), COMMON, runs, root, "agent"
        )
        if live:
            for cached in (False, True):
                results[f"conversation_cache_{'on' if cached else 'off'}"] = await flow(
                    Settings(**base, instant_path_enabled=False, context_cache_enabled=cached),
                    CONVERSATION,
                    runs,
                    root,
                    f"cache-{cached}",
                )
    return results


if __name__ == "__main__":
    text = json.dumps(asyncio.run(main()), indent=2)
    print(text)
    if out := os.getenv("LATENCY_OUT"):
        Path(out).write_text(text + "\n", encoding="utf-8")
