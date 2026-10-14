"""Owned last-turn replay. A missing cursor must never start inference.

Turns stream from process memory. With a shared store (Firestore in production) each turn is also
mirrored every ~0.4 s, so a reconnect that lands on another Cloud Run instance can still resume
the same turn instead of failing.
"""

import asyncio
import hashlib
import json
from collections import deque
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Any, Protocol
from uuid import uuid4

import anyio
import structlog
from fastapi import HTTPException

from .contracts import StreamEvent

REPLAY_TTL = 120
MAX_EVENTS = 128
MAX_BYTES = 256 * 1024
MAX_SESSIONS = 128
MIRROR_SECONDS = 0.4
REMOTE_POLL_SECONDS = 0.5

log = structlog.get_logger()


def sequence_of(frame: dict[str, str]) -> int:
    return int(frame["id"].rsplit(":", 1)[1])


def check_cursor(event_id: str, turn_id: str, frames: list[dict[str, str]], last: int) -> int:
    try:
        turn, raw = event_id.rsplit(":", 1)
        sequence = int(raw)
    except ValueError:
        raise HTTPException(409, "RESUME_UNAVAILABLE") from None
    if (
        turn != turn_id
        or not frames
        or sequence < sequence_of(frames[0]) - 1
        or sequence > last
        or sequence < 1
    ):
        raise HTTPException(409, "RESUME_UNAVAILABLE")
    return sequence


class SharedTurns(Protocol):
    def save(self, uid: str, sid: str, record: dict[str, Any]) -> None: ...
    def load(self, uid: str, sid: str) -> dict[str, Any] | None: ...


class FirestoreTurns:
    """Mirror of recent turns, keyed by a hash of owner + session; expires via TTL."""

    def __init__(self, client: Any, namespace: str) -> None:
        self.turns = client.collection(namespace).document("replay").collection("turns")

    @staticmethod
    def key(uid: str, sid: str) -> str:
        return hashlib.sha256(f"{uid}:{sid}".encode()).hexdigest()

    def save(self, uid: str, sid: str, record: dict[str, Any]) -> None:
        expires = datetime.now(UTC) + timedelta(seconds=REPLAY_TTL)
        self.turns.document(self.key(uid, sid)).set(
            {**record, "expires_at": expires}, retry=None, timeout=5
        )

    def load(self, uid: str, sid: str) -> dict[str, Any] | None:
        snapshot = self.turns.document(self.key(uid, sid)).get(retry=None, timeout=5)
        data = snapshot.to_dict() if snapshot.exists else None
        if data and data["expires_at"] < datetime.now(UTC):
            return None
        return data


@dataclass
class RemoteTurn:
    """A turn running (or finished) on another instance, followed through the shared store."""

    shared: SharedTurns
    uid: str
    sid: str
    record: dict[str, Any]

    async def follow(self, after: int = 0) -> AsyncIterator[dict[str, str]]:
        deadline = monotonic() + REPLAY_TTL
        record = self.record
        while True:
            frames: list[dict[str, str]] = record["frames"]
            if frames and after < sequence_of(frames[0]) - 1:
                return
            for frame in frames:
                if sequence_of(frame) > after:
                    yield frame
                    after = sequence_of(frame)
            if record.get("finished") or monotonic() > deadline:
                return
            await asyncio.sleep(REMOTE_POLL_SECONDS)
            fresh = await anyio.to_thread.run_sync(self.shared.load, self.uid, self.sid)
            if not fresh or fresh["turn_id"] != record["turn_id"]:
                return
            record = fresh


@dataclass
class TurnReplay:
    business_id: str | None
    turn_id: str = field(default_factory=lambda: str(uuid4()))
    events: deque[dict[str, str]] = field(default_factory=deque)
    sequence: int = 0
    size: int = 0
    finished: float | None = None
    changed: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task[None] | None = None

    def append(self, event: StreamEvent) -> None:
        self.sequence += 1
        frame = {
            "event": "coach",
            "id": f"{self.turn_id}:{self.sequence}",
            "data": json.dumps(event.payload(), ensure_ascii=False),
        }
        self.events.append(frame)
        self.size += len(frame["data"].encode())
        while len(self.events) > MAX_EVENTS or self.size > MAX_BYTES:
            self.size -= len(self.events.popleft()["data"].encode())
        self.changed.set()

    def cursor(self, event_id: str) -> int:
        try:
            turn, raw = event_id.rsplit(":", 1)
            sequence = int(raw)
        except ValueError:
            raise HTTPException(409, "RESUME_UNAVAILABLE") from None
        if (
            turn != self.turn_id
            or not self.events
            or sequence < int(self.events[0]["id"].rsplit(":", 1)[1]) - 1
            or sequence > self.sequence
            or sequence < 1
        ):
            raise HTTPException(409, "RESUME_UNAVAILABLE")
        return sequence

    async def follow(self, after: int = 0) -> AsyncIterator[dict[str, str]]:
        while True:
            self.changed.clear()
            # A slow subscriber must fail rather than silently skip evicted deltas.
            if self.events and after < int(self.events[0]["id"].rsplit(":", 1)[1]) - 1:
                return
            for frame in list(self.events):
                sequence = int(frame["id"].rsplit(":", 1)[1])
                if sequence > after:
                    yield frame
                    after = sequence
            if self.finished is not None:
                return
            await self.changed.wait()


class ReplayStore:
    def __init__(self, shared: SharedTurns | None = None) -> None:
        self.turns: dict[tuple[str, str], TurnReplay] = {}
        self.shared = shared

    def prune(self) -> None:
        for key, turn in list(self.turns.items()):
            if turn.finished is not None and monotonic() - turn.finished >= REPLAY_TTL:
                del self.turns[key]

    async def resume(
        self, uid: str, sid: str, bid: str | None, cursor: str
    ) -> tuple[TurnReplay | RemoteTurn, int]:
        self.prune()
        turn = self.turns.get((uid, sid))
        if turn is not None:
            if turn.business_id != bid:
                raise HTTPException(409, "RESUME_UNAVAILABLE")
            return turn, turn.cursor(cursor)
        if self.shared is None:
            raise HTTPException(409, "RESUME_UNAVAILABLE")
        # The reconnect landed on another instance: continue from the shared mirror.
        try:
            record = await anyio.to_thread.run_sync(self.shared.load, uid, sid)
        except Exception:
            log.warning("replay_mirror_read_failed")
            record = None
        if not record or record.get("business_id") != (bid or ""):
            raise HTTPException(409, "RESUME_UNAVAILABLE")
        frames = record["frames"]
        last = sequence_of(frames[-1]) if frames else 0
        after = check_cursor(cursor, record["turn_id"], frames, last)
        return RemoteTurn(self.shared, uid, sid, record), after

    def start(
        self, uid: str, sid: str, bid: str | None, produce: Callable[[TurnReplay], Awaitable[None]]
    ) -> TurnReplay:
        self.prune()
        key = (uid, sid)
        if key not in self.turns and len(self.turns) >= MAX_SESSIONS:
            raise HTTPException(429, "Replay capacity reached. Try again shortly.")
        turn = TurnReplay(bid)
        self.turns[key] = turn

        async def run() -> None:
            mirror = (
                asyncio.create_task(self._mirror(uid, sid, bid, turn), name=f"coach-mirror:{sid}")
                if self.shared
                else None
            )
            try:
                await produce(turn)
            finally:
                turn.finished = monotonic()
                turn.changed.set()
                if mirror:
                    await asyncio.gather(mirror, return_exceptions=True)

        turn.task = asyncio.create_task(run(), name=f"coach-turn:{sid}")
        return turn

    async def _mirror(self, uid: str, sid: str, bid: str | None, turn: TurnReplay) -> None:
        """Copy the turn to the shared store in small batches; failures only cost cross-instance
        resume, never the live stream."""
        assert self.shared is not None
        written = -1
        while True:
            done = turn.finished is not None
            if turn.sequence != written or done:
                written = turn.sequence
                record = {
                    "turn_id": turn.turn_id,
                    "business_id": bid or "",
                    "frames": list(turn.events),
                    "finished": done,
                }
                try:
                    await anyio.to_thread.run_sync(self.shared.save, uid, sid, record)
                except Exception:
                    log.warning("replay_mirror_write_failed")
            if done:
                return
            await asyncio.sleep(MIRROR_SECONDS)

    async def maintain(self) -> None:
        while True:
            await asyncio.sleep(15)
            self.prune()

    async def close(self) -> None:
        tasks = [turn.task for turn in self.turns.values() if turn.task]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.turns.clear()
