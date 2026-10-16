"""Dependency-free beyond existing httpx: same local workload as scripts/load-local.js.

Run the fixture first. The target is fixed, proxy env is ignored, redirects are disabled,
and health must advertise offline local-load-fixture before any workload is sent.
"""

import asyncio
import json
import platform
import statistics
import sys
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import httpx

ORIGIN = "http://127.0.0.1:3398"
DURATION = 30
NEW_SESSIONS = "--new-sessions" in sys.argv


async def run() -> None:
    async with httpx.AsyncClient(base_url=ORIGIN, trust_env=False) as client:
        health = (await client.get("/api/v1/health")).json()
        assert health["release_commit"] == "local-load-fixture"
        assert health["coach_mode"] == "offline" and health["auth_mode"] == "local"
        bids = (await client.get("/load-fixture")).json()["shops"]
    samples: dict[str, list[float]] = defaultdict(list)
    failures: dict[str, int] = defaultdict(int)
    statuses: dict[str, int] = defaultdict(int)
    errors: dict[str, int] = defaultdict(int)
    deadline = time.perf_counter() + DURATION
    started = time.perf_counter()

    async def worker(index: int) -> None:
        async with httpx.AsyncClient(base_url=ORIGIN, trust_env=False, timeout=10) as client:
            coach = index >= 16
            if coach:
                (await client.get("/api/v1/bootstrap")).raise_for_status()
            count = 0
            sid: str | None = None
            while time.perf_counter() < deadline:
                name = "coach_stream" if coach else "discover" if count % 2 else "public_shop"
                before = time.perf_counter()
                try:
                    if coach:
                        response = await client.post(
                            "/api/v1/coach/stream",
                            json={"message": "Hello", "language": "en", "session_id": sid},
                        )
                        statuses[str(response.status_code)] += 1
                        response.raise_for_status()
                        events = [
                            json.loads(line[6:])
                            for line in response.text.splitlines()
                            if line.startswith("data: ")
                        ]
                        for event in events:
                            if event["kind"] == "error":
                                errors[str(event.get("code", "UNKNOWN"))] += 1
                        assert events and events[-1]["kind"] == "turn_complete"
                        assert not any(event["kind"] == "error" for event in events)
                        assert any(event["kind"] == "reply" for event in events)
                        if not NEW_SESSIONS:
                            sid = next(e["session_id"] for e in events if e["kind"] == "ready")
                    elif name == "discover":
                        response = await client.get("/api/v1/discover?lat=1.28&lng=103.84")
                        assert response.json()["places"]
                    else:
                        response = await client.get(f"/api/v1/public/shops/{bids[count % 10]}")
                        assert response.json()["name"].startswith("Offline load shop")
                    response.raise_for_status()
                except Exception as error:
                    failures[name] += 1
                    errors[type(error).__name__] += 1
                finally:
                    samples[name].append((time.perf_counter() - before) * 1000)
                count += 1
                await asyncio.sleep(0.1)

    await asyncio.gather(*(worker(i) for i in range(20)))
    elapsed = time.perf_counter() - started
    result = {
        "date_utc": datetime.now(UTC).isoformat(),
        "driver": "Python asyncio/httpx (k6 unavailable offline)",
        "platform": platform.platform(),
        "python": platform.python_version(),
        "target": ORIGIN,
        "duration_seconds": round(elapsed, 2),
        "users": {"read": 16, "coach": 4},
        "think_seconds": 0.1,
        "rate_limits": "disabled in isolated fixture only",
        "shops": len(bids),
        "conversation_mode": "new session per turn" if NEW_SESSIONS else "reuse owned session",
        "coach_http_statuses": dict(statuses),
        "errors": dict(errors),
        "requests_per_second": round(sum(map(len, samples.values())) / elapsed, 2),
        "endpoints": {
            name: {
                "requests": len(values),
                "failures": failures[name],
                "mean_ms": round(statistics.mean(values), 2),
                "p95_ms": round(sorted(values)[int((len(values) - 1) * 0.95)], 2),
                "max_ms": round(max(values), 2),
            }
            for name, values in samples.items()
        },
    }
    output = Path(
        "../docs/impact/load-test-new-sessions.json"
        if NEW_SESSIONS
        else "../docs/impact/load-test.json"
    )
    await asyncio.to_thread(
        output.write_text, json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(result, indent=2))
    assert not sum(failures.values()), "Load assertions failed; inspect the saved report."


if __name__ == "__main__":
    asyncio.run(run())
