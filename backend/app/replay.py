"""Process-local, owned last-turn replay. A missing cursor must never start inference."""

import asyncio
import json
from collections import deque
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from time import monotonic
from uuid import uuid4

from fastapi import HTTPException

from .contracts import StreamEvent

REPLAY_TTL = 120
MAX_EVENTS = 128
MAX_BYTES = 256 * 1024
MAX_SESSIONS = 128


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
    def __init__(self) -> None:
        self.turns: dict[tuple[str, str], TurnReplay] = {}

    def prune(self) -> None:
        for key, turn in list(self.turns.items()):
            if turn.finished is not None and monotonic() - turn.finished >= REPLAY_TTL:
                del self.turns[key]

    def resume(self, uid: str, sid: str, bid: str | None, cursor: str) -> tuple[TurnReplay, int]:
        self.prune()
        turn = self.turns.get((uid, sid))
        if turn is None or turn.business_id != bid:
            raise HTTPException(409, "RESUME_UNAVAILABLE")
        return turn, turn.cursor(cursor)

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
            try:
                await produce(turn)
            finally:
                turn.finished = monotonic()
                turn.changed.set()

        turn.task = asyncio.create_task(run(), name=f"coach-turn:{sid}")
        return turn

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
