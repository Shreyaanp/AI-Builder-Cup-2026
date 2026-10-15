import hashlib
import json
import math
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import Protocol, cast
from uuid import uuid4

import anyio
import structlog
from fastapi import HTTPException, Request, WebSocket
from google.cloud import firestore

from .settings import Settings

log = structlog.get_logger()
JSON_BODY_BYTES = 16_384

# (maximum, window seconds). Windows align to Unix time, including UTC days.
LIMITS: dict[str, tuple[tuple[int, int], ...]] = {
    "discover": ((30, 60),),
    "discover:place": ((10, 60), (100, 86_400)),
    # Customer AI entry: one model call per ask.
    "discover:ask": ((15, 60), (300, 86_400)),
    # Demo world: at most one model call per new ~2 km area; repeats reuse stored shops.
    "demo:world": ((10, 60), (60, 86_400)),
    "stock:ip": ((30, 86_400),),
    "stock:shop": ((300, 86_400),),
    "stock:read": ((60, 60),),
    "coach": ((20, 60), (300, 86_400)),
    # Every mic press opens a session; owners test voice many times in a row.
    "voice": ((30, 600), (300, 86_400)),
    "photo": ((10, 60), (60, 86_400)),
    # Shop gallery uploads (moderated, no AI extraction).
    "gallery": ((20, 60), (100, 86_400)),
    "import": ((10, 3_600), (30, 86_400)),
    # The Prep plan tile loads with My shop; repeats are answered from the forecast cache.
    "forecast": ((120, 3_600), (1_000, 86_400)),
    "owner:read": ((120, 3_600), (1_000, 86_400)),
    "rescue:write": ((30, 60), (200, 86_400)),
    "rescue:public": ((30, 60),),
    "rescue:hold": ((20, 60), (100, 86_400)),
    "recap": ((30, 60), (300, 86_400)),
    "tts": ((30, 60), (600, 86_400)),
    "proposal": ((60, 60),),
    "ask:ip": ((10, 60),),
    "ask:shop": ((200, 86_400),),
    "inquire:ip": ((30, 86_400),),
    "thread:token": ((10, 600),),
    "thread:owner": ((60, 60),),
    # Signed-in customers: messages across all their threads, and neighbour tips.
    "thread:customer": ((20, 60), (300, 86_400)),
    "tips": ((5, 600), (20, 86_400)),
    "thread:translate": ((30, 60),),
    "bootstrap": ((30, 60),),
    "consent": ((30, 60),),
    "me": ((30, 60),),
}


@dataclass(frozen=True)
class Bucket:
    action: str
    subject: str
    maximum: int
    seconds: int

    def key(self, now: float) -> tuple[str, str, int]:
        # Include duration so minute/day windows cannot collide at midnight.
        return (
            f"{self.action}:{self.seconds}",
            self.subject,
            int(now // self.seconds) * self.seconds,
        )

    def retry_after(self, now: float) -> int:
        return max(1, math.ceil(self.key(now)[2] + self.seconds - now))


class RateLimiter(Protocol):
    def take(self, buckets: Sequence[Bucket], now: float) -> int:
        """Atomically consume all buckets; return seconds to retry, or zero if allowed."""
        ...

    def close(self) -> None: ...


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self.counters: dict[tuple[str, str, int], tuple[int, float]] = {}
        self.lock = Lock()

    def take(self, buckets: Sequence[Bucket], now: float) -> int:
        with self.lock:
            self.counters = {key: value for key, value in self.counters.items() if value[1] > now}
            retry = max(
                (
                    bucket.retry_after(now)
                    for bucket in buckets
                    if self.counters.get(bucket.key(now), (0, 0))[0] >= bucket.maximum
                ),
                default=0,
            )
            if not retry:
                for bucket in buckets:
                    key = bucket.key(now)
                    count = self.counters.get(key, (0, 0))[0]
                    self.counters[key] = (count + 1, key[2] + bucket.seconds)
            return retry

    def close(self) -> None:
        pass


class FirestoreRateLimiter:
    def __init__(self, client: firestore.Client, namespace: str) -> None:
        self.client = client
        self.counters = client.collection(namespace).document("limits").collection("rate_limits")

    def take(self, buckets: Sequence[Bucket], now: float) -> int:
        refs = [
            self.counters.document(hashlib.sha256(json.dumps(bucket.key(now)).encode()).hexdigest())
            for bucket in buckets
        ]

        # Atomic server-side increments: no transaction contention to abort under bursts.
        # Anything past a maximum is rejected and its increments are undone, so a blocked
        # attempt never consumes the other windows (bursts can only err towards rejecting).
        batch = self.client.batch()
        for ref, bucket in zip(refs, buckets, strict=True):
            batch.set(
                ref,
                {
                    "count": firestore.Increment(1),
                    "expires_at": datetime.fromtimestamp(bucket.key(now)[2] + bucket.seconds, UTC),
                },
                merge=True,
            )
        results = batch.commit(retry=None, timeout=5)
        # Each write returns the value its own Increment produced, so concurrent takes
        # never see each other's later increments (a separate read would over-reject).
        retry = max(
            (
                bucket.retry_after(now)
                for result, bucket in zip(results, buckets, strict=True)
                if result.transform_results[0].integer_value > bucket.maximum
            ),
            default=0,
        )
        if retry:
            undo = self.client.batch()
            for ref in refs:
                undo.update(ref, {"count": firestore.Increment(-1)})
            undo.commit(retry=None, timeout=5)
        return retry

    def close(self) -> None:
        self.client.close()


def rate_limiter(settings: Settings) -> RateLimiter:
    if settings.merchant_backend == "firestore" or settings.app_env == "production":
        return FirestoreRateLimiter(
            firestore.Client(
                project=settings.google_cloud_project, database=settings.firestore_database
            ),
            settings.firestore_namespace,
        )
    return InMemoryRateLimiter()


def client_ip(connection: Request | WebSocket) -> str:
    forwarded = connection.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    return forwarded or (connection.client.host if connection.client else "unknown")


async def enforce_limits(
    connection: Request | WebSocket,
    subjects: Sequence[tuple[str, str]],
    *,
    anonymous: bool = False,
    clock: Callable[[], float] | None = None,
) -> None:
    settings = getattr(connection.app.state, "v1_settings", None)
    if settings is not None and not settings.rate_limits_enabled:
        return
    buckets = [
        Bucket(action, subject, maximum, seconds)
        for action, subject in subjects
        for maximum, seconds in LIMITS[action]
    ]
    limiter = cast(RateLimiter, connection.app.state.rate_limiter)
    try:
        retry = await anyio.to_thread.run_sync(limiter.take, buckets, (clock or time.time)())
    except Exception:
        # Log no subject, IP, provider error or request content.
        log.warning("rate_limit_store_failed", anonymous=anonymous)
        if not anonymous:
            return
        retry = 60
    if retry:
        raise HTTPException(429, "RATE_LIMITED", headers={"Retry-After": str(retry)})


@dataclass(frozen=True)
class Lease:
    key: tuple[str, str]
    token: str


class RunRegistry:
    """Single-process template limits. Redis/distributed quotas precede multi-worker rollout."""

    def __init__(self, maximum: int) -> None:
        self.maximum = maximum
        self.active: dict[tuple[str, str], str] = {}

    def acquire(self, user_id: str, session_id: str) -> Lease:
        key = (user_id, session_id)
        if key in self.active:
            raise HTTPException(409, "This conversation already has an active stream.")
        if len(self.active) >= self.maximum:
            raise HTTPException(429, "The coach is busy. Try again shortly.")
        lease = Lease(key, str(uuid4()))
        self.active[key] = lease.token
        return lease

    def release(self, lease: Lease) -> None:
        if self.active.get(lease.key) == lease.token:
            del self.active[lease.key]

    async def acquire_async(self, user_id: str, session_id: str) -> Lease:
        return self.acquire(user_id, session_id)

    async def release_async(self, lease: Lease) -> None:
        self.release(lease)
