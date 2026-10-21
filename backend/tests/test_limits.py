import os
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore
from starlette.requests import Request
from starlette.websockets import WebSocket

from app.limits import (
    LIMITS,
    PAID_OWNER_ACTIONS,
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
    if (os.getenv("FIRESTORE_EMULATOR_HOST") or "").split(":")[0] not in {"127.0.0.1", "localhost"}:
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


def connection(
    limiter: RateLimiter, *forwarded: str, app_env: str = "test", trusted_proxy_hops: int = 0
) -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(b"x-forwarded-for", value.encode()) for value in forwarded or ("",)],
            "client": ("127.0.0.1", 1234),
            "app": SimpleNamespace(
                state=SimpleNamespace(
                    rate_limiter=limiter,
                    v1_settings=SimpleNamespace(
                        app_env=app_env,
                        rate_limits_enabled=True,
                        trusted_proxy_hops=trusted_proxy_hops,
                    ),
                )
            ),
        }
    )


def test_forwarded_ip_and_fallback() -> None:
    assert client_ip(connection(InMemoryRateLimiter(), " 192.0.2.1, 192.0.2.2")) == "192.0.2.1"
    assert client_ip(connection(InMemoryRateLimiter())) == "127.0.0.1"


# Behind chalkboard-https: '<caller-supplied...>, <client>, <load balancer>' (PROD-FACTS).
BALANCER = "198.51.100.1"


def behind_balancer(*forwarded: str) -> str:
    return client_ip(
        connection(InMemoryRateLimiter(), *forwarded, app_env="production", trusted_proxy_hops=2)
    )


def test_ob90_spoofed_leading_entries_never_change_the_client() -> None:
    real = "192.0.2.99"
    assert behind_balancer(f"{real}, {BALANCER}") == real
    assert behind_balancer(f"203.0.113.44, {real}, {BALANCER}") == real
    assert behind_balancer(f"10.0.0.1, 203.0.113.44, 8.8.8.8, {real}, {BALANCER}") == real
    # A second X-Forwarded-For header cannot hide the entries the balancer appended.
    assert behind_balancer("203.0.113.44", f"{real}, {BALANCER}") == real


def test_ob90_two_clients_behind_the_balancer_get_their_own_address() -> None:
    assert behind_balancer(f"192.0.2.10, {BALANCER}") == "192.0.2.10"
    assert behind_balancer(f"192.0.2.11, {BALANCER}") == "192.0.2.11"


def test_ob90_zero_trusted_proxy_hops_keeps_first_entry_behavior() -> None:
    assert client_ip(connection(InMemoryRateLimiter(), "203.0.113.44, 192.0.2.99")) == (
        "203.0.113.44"
    )
    assert client_ip(connection(InMemoryRateLimiter(), "203.0.113.44", "192.0.2.99")) == (
        "203.0.113.44"
    )


def test_ob90_direct_run_app_request_is_not_one_shared_bucket() -> None:
    # Fewer entries than hops: the request skipped the balancer. Each caller keeps its own
    # address instead of all of them sharing Google's front-end peer address.
    assert behind_balancer("192.0.2.10") == "192.0.2.10"
    assert behind_balancer("192.0.2.11") == "192.0.2.11"
    assert behind_balancer() == "127.0.0.1"


def test_ob90_voice_websocket_uses_the_same_client_address() -> None:
    app = FastAPI()
    app.state.v1_settings = Settings(trusted_proxy_hops=2, _env_file=None)

    @app.websocket("/ws")
    async def address(websocket: WebSocket) -> None:
        await websocket.accept()
        await websocket.send_text(client_ip(websocket))
        await websocket.close()

    with TestClient(app) as client:
        for spoof in ("203.0.113.44", "198.51.100.88"):
            headers = {"x-forwarded-for": f"{spoof}, 192.0.2.99, {BALANCER}"}
            with client.websocket_connect("/ws", headers=headers) as socket:
                assert socket.receive_text() == "192.0.2.99"


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


def failing_store() -> Request:
    limiter = Mock(spec=RateLimiter)
    limiter.take.side_effect = RuntimeError("Store unavailable")
    return connection(limiter)


@pytest.mark.asyncio
@pytest.mark.parametrize("action", sorted(PAID_OWNER_ACTIONS))
async def test_ob91_store_outage_keeps_paid_owner_limits_per_instance(action: str) -> None:
    request = failing_store()
    maximum = LIMITS[action][0][0]
    for _ in range(maximum):
        # The happy path: a normal owner's use within the limit is never refused.
        await enforce_limits(request, [(action, "alice")], clock=lambda: 0)
    with pytest.raises(HTTPException) as rejected:
        await enforce_limits(request, [(action, "alice")], clock=lambda: 0)
    assert rejected.value.status_code == 429
    assert rejected.value.detail == "RATE_LIMITED"
    # Another owner on the same instance is unaffected.
    await enforce_limits(request, [(action, "bob")], clock=lambda: 0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "action", sorted(action for action in LIMITS if action not in PAID_OWNER_ACTIONS)
)
async def test_ob91_store_outage_never_blocks_cheap_owner_actions(action: str) -> None:
    request = failing_store()
    for _ in range(LIMITS[action][0][0] + 1):
        await enforce_limits(request, [(action, "alice")], clock=lambda: 0)


def test_ob91_paid_owner_actions_are_known_limits() -> None:
    assert PAID_OWNER_ACTIONS <= LIMITS.keys()


def test_backend_selection_matches_merchant_storage() -> None:
    assert isinstance(rate_limiter(Settings(_env_file=None)), InMemoryRateLimiter)
    # Substitute construction; this test must never contact Firestore or load credentials.
    with patch("app.limits.firestore.Client") as client:
        service = rate_limiter(Settings(merchant_backend="firestore", _env_file=None))
        assert isinstance(service, FirestoreRateLimiter)
        client.assert_called_once()
