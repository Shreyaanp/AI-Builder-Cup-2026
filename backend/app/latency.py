"""Time to first token / first audio per coach flow, with p50/p95 over recent turns.

Every measurement is also logged (`coach_latency`), so Cloud Logging keeps the full history;
the in-memory window is for the quick /api/v1/latency read-out on one instance.
"""

import time
from collections import defaultdict, deque

import structlog

log = structlog.get_logger()

WINDOW = 500


def percentile(values: list[float], share: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    rank = share * (len(ordered) - 1)
    low = int(rank)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


class LatencyStats:
    def __init__(self, window: int = WINDOW) -> None:
        self.samples: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=window))

    def record(self, flow: str, ms: float) -> None:
        self.samples[flow].append(ms)
        log.info("coach_latency", flow=flow, ms=round(ms, 1))

    def summary(self) -> dict[str, dict[str, float]]:
        return {
            flow: {
                "n": len(values),
                "p50_ms": round(percentile(list(values), 0.5), 1),
                "p95_ms": round(percentile(list(values), 0.95), 1),
            }
            for flow, values in sorted(self.samples.items())
            if values
        }


stats = LatencyStats()


class FirstOutput:
    """Records the time from the start of a turn to its first visible output, once."""

    def __init__(self, flow: str, target: LatencyStats | None = None) -> None:
        self.flow = flow
        self.target = target or stats
        self.start = time.perf_counter()
        self.done = False

    def mark(self, flow: str | None = None) -> None:
        if not self.done:
            self.done = True
            self.target.record(flow or self.flow, (time.perf_counter() - self.start) * 1000)

    def restart(self) -> None:
        self.start = time.perf_counter()
        self.done = False
