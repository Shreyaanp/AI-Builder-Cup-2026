from dataclasses import dataclass
from uuid import uuid4

from fastapi import HTTPException


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
