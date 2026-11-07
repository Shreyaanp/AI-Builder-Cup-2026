"""OB-119: exploring Grow must fit within the offline demo's read allowance."""

import time
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app import public_demo
from app.limits import Bucket, InMemoryRateLimiter
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo import open_demo, owner


def test_ob119_grow_exploration_does_not_exhaust_live_owner_read_quota(app, monkeypatch):  # noqa: F811
    now = time.time()
    monkeypatch.setattr(public_demo, "time", SimpleNamespace(time=lambda: now))
    monkeypatch.setattr("app.limits.time", SimpleNamespace(time=lambda: now))
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter = InMemoryRateLimiter()
        session = open_demo(client).json()["session_id"]
        bid = app.state.public_demos[session].bid
        # Reproduce repeated sheet loads, including their supporting tile reads, in one minute.
        for _ in range(26):
            for endpoint in (
                "today",
                "rescue",
                "rescue/suggestions",
                "radar",
                "playbook",
                "analytics",
            ):
                response = owner(client, session, f"businesses/{bid}/{endpoint}")
                assert response.status_code == 200, (endpoint, response.text)
        assert not any(key[0].startswith("owner:read:") for key in app.state.rate_limiter.counters)


def test_ob119_demo_read_allowance_is_bounded_and_isolated():
    limiter = InMemoryRateLimiter()
    demo = public_demo.DemoReadLimiter(limiter)
    reads = [
        Bucket("owner:read", "visitor-a", 120, 3600),
        Bucket("owner:read", "visitor-a", 1000, 86400),
    ]
    for _ in range(public_demo.READ_PER_MINUTE):
        assert demo.take(reads, 120.0) == 0
    assert demo.take(reads, 120.0) == 60
    assert demo.take([Bucket("owner:read", "visitor-b", 120, 3600)], 120.0) == 0
    assert demo.take(reads, 180.0) == 0
    # Neither other route budgets nor the real owner's read policy is relaxed.
    writes = [Bucket("owner:write", "visitor-a", 1, 60)]
    assert demo.take(writes, 120.0) == 0
    assert demo.take(writes, 120.0) == 60
    for _ in range(120):
        assert limiter.take(reads, 120.0) == 0
    assert limiter.take(reads, 120.0) == 3480
