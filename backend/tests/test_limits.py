import os
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore
from starlette.requests import Request

from app.limits import (
    LIMITS,
    Bucket,
    FirestoreRateLimiter,
    InMemoryRateLimiter,
    RateLimiter,
    client_ip,
    enforce_limits,
    rate_limiter,
)
from app.settings import Settings


@pytest.fixture(params=["memory", "firestore"])
def limiter(request: pytest.FixtureRequest) -> Iterator[RateLimiter]:
    if request.param == "memory":
        yield InMemoryRateLimiter()
        return
    if os.getenv("FIRESTORE_EMULATOR_HOST") != "127.0.0.1:8085":
        pytest.skip("Requires the explicitly local Firestore emulator; never a cloud database.")
    client = firestore.Client(project="demo-ogoogle-local", credentials=AnonymousCredentials())
    service = FirestoreRateLimiter(client, "ogoogle_ai_test_" + uuid4().hex)
    try:
        yield service
    finally:
        service.close()


@pytest.mark.parametrize("action", LIMITS)
def test_exact_limits_reset_and_subject_isolation(limiter: RateLimiter, action: str) -> None:
    for maximum, seconds in LIMITS[action]:
        bucket = Bucket(action, "alice", maximum, seconds)
        now = float(seconds * 20 + 1)
        for _ in range(maximum):
            assert limiter.take([bucket], now) == 0
        assert limiter.take([bucket], now) == seconds - 1
        assert limiter.take([Bucket(action, "bob", maximum, seconds)], now) == 0
        assert limiter.take([bucket], now + seconds) == 0


def test_atomic_multi_window_and_action_isolation(limiter: RateLimiter) -> None:
    minute = Bucket("coach", "alice", 2, 60)
    day = Bucket("coach", "alice", 3, 86_400)
    assert limiter.take([minute, day], 0) == 0
    assert limiter.take([minute, day], 0) == 0
    assert limiter.take([minute, day], 1.1) == 59
    # The rejected attempt did not consume the day quota.
    assert limiter.take([minute, day], 60) == 0
    assert limiter.take([minute, day], 61) == 86_339
    assert limiter.take([Bucket("photo", "alice", 2, 60)], 61) == 0


def test_concurrent_consumers_share_quota(limiter: RateLimiter) -> None:
    bucket = Bucket("coach", "alice", 2, 60)
    # A new Firestore adapter represents another Cloud Run instance.
    other = (
        FirestoreRateLimiter(limiter.client, limiter.counters.parent.parent.id)
        if isinstance(limiter, FirestoreRateLimiter)
        else limiter
    )
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda store: store.take([bucket], 0), [limiter, other] * 2))
    assert sorted(results) == [0, 0, 60, 60]


def test_firestore_expiry_is_timestamp(limiter: RateLimiter) -> None:
    if not isinstance(limiter, FirestoreRateLimiter):
        pytest.skip("Firestore timestamp assertion.")
    assert limiter.take([Bucket("photo", "alice", 1, 60)], 120) == 0
    data = next(limiter.counters.stream()).to_dict()
    assert data == {"count": 1, "expires_at": datetime.fromtimestamp(180, UTC)}


def test_memory_discards_expired_windows() -> None:
    limiter = InMemoryRateLimiter()
    assert limiter.take([Bucket("photo", "alice", 1, 60)], 0) == 0
    assert limiter.take([Bucket("photo", "bob", 1, 60)], 60) == 0
    assert len(limiter.counters) == 1


def connection(limiter: RateLimiter, forwarded: str = "") -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(b"x-forwarded-for", forwarded.encode())],
            "client": ("127.0.0.1", 1234),
            "app": SimpleNamespace(state=SimpleNamespace(rate_limiter=limiter)),
        }
    )


def test_forwarded_ip_and_fallback() -> None:
    assert client_ip(connection(InMemoryRateLimiter(), " 192.0.2.1, 192.0.2.2")) == "192.0.2.1"
    assert client_ip(connection(InMemoryRateLimiter())) == "127.0.0.1"


@pytest.mark.asyncio
async def test_store_failure_opens_for_owner_closes_for_anonymous() -> None:
    limiter = Mock(spec=RateLimiter)
    limiter.take.side_effect = RuntimeError("Store unavailable")
    request = connection(limiter)
    with patch("app.limits.log.warning") as warning:
        await enforce_limits(request, [("coach", "alice")], clock=lambda: 0)
        with pytest.raises(HTTPException) as rejected:
            await enforce_limits(
                request, [("ask:ip", "192.0.2.1")], anonymous=True, clock=lambda: 0
            )
        assert warning.call_count == 2
        warning.assert_any_call("rate_limit_store_failed", anonymous=False)
        warning.assert_called_with("rate_limit_store_failed", anonymous=True)
    assert rejected.value.status_code == 429
    assert rejected.value.detail == "RATE_LIMITED"
    assert rejected.value.headers == {"Retry-After": "60"}


def test_backend_selection_matches_merchant_storage() -> None:
    assert isinstance(rate_limiter(Settings(_env_file=None)), InMemoryRateLimiter)
    # Substitute construction; this test must never contact Firestore or load credentials.
    with patch("app.limits.firestore.Client") as client:
        service = rate_limiter(Settings(merchant_backend="firestore", _env_file=None))
        assert isinstance(service, FirestoreRateLimiter)
        client.assert_called_once()
