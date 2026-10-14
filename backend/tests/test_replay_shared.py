import asyncio
import os
from typing import Any

import pytest
from fastapi import HTTPException

from app.contracts import StreamEvent
from app.replay import FirestoreTurns, RemoteTurn, ReplayStore, TurnReplay


class MemoryTurns:
    """Stands in for Firestore: one shared store seen by two 'instances'."""

    def __init__(self) -> None:
        self.records: dict[tuple[str, str], dict[str, Any]] = {}

    def save(self, uid: str, sid: str, record: dict[str, Any]) -> None:
        self.records[(uid, sid)] = dict(record, frames=list(record["frames"]))

    def load(self, uid: str, sid: str) -> dict[str, Any] | None:
        return self.records.get((uid, sid))


async def collect(turn: TurnReplay | RemoteTurn, after: int) -> list[str]:
    return [frame["id"] for frame in [f async for f in turn.follow(after)]]


def test_reconnect_on_another_instance_resumes_from_the_mirror() -> None:
    async def scenario() -> None:
        shared = MemoryTurns()
        first, second = ReplayStore(shared), ReplayStore(shared)
        gate = asyncio.Event()

        async def produce(turn: TurnReplay) -> None:
            for text in ("Hel", "lo"):
                turn.append(StreamEvent(kind="delta", text=text))
            await gate.wait()
            turn.append(StreamEvent(kind="reply", text="Hello"))

        turn = first.start("alice", "s1", None, produce)
        await asyncio.sleep(0.6)  # one mirror flush while the turn is still running
        cursor = f"{turn.turn_id}:1"
        remote, after = await second.resume("alice", "s1", None, cursor)
        assert isinstance(remote, RemoteTurn) and after == 1
        reader = asyncio.create_task(collect(remote, after))
        gate.set()
        ids = await asyncio.wait_for(reader, 5)
        assert ids == [f"{turn.turn_id}:2", f"{turn.turn_id}:3"]
        await first.close()

    asyncio.run(scenario())


def test_remote_resume_is_scoped_to_owner_shop_and_turn() -> None:
    async def scenario() -> None:
        shared = MemoryTurns()
        first, second = ReplayStore(shared), ReplayStore(shared)

        async def produce(turn: TurnReplay) -> None:
            turn.append(StreamEvent(kind="reply", text="Done"))

        turn = first.start("alice", "s1", "shop-1", produce)
        await asyncio.wait_for(turn.task, 5)  # type: ignore[arg-type]
        cursor = f"{turn.turn_id}:1"
        for uid, bid, event_id in (
            ("mallory", "shop-1", cursor),  # another owner
            ("alice", "shop-2", cursor),  # another shop
            ("alice", "shop-1", "other-turn:1"),  # another turn
        ):
            with pytest.raises(HTTPException):
                await second.resume(uid, "s1", bid, event_id)
        remote, _ = await second.resume("alice", "s1", "shop-1", cursor)
        assert await collect(remote, 1) == []  # finished, nothing after the cursor

    asyncio.run(scenario())


def test_without_a_shared_store_other_instances_cannot_resume() -> None:
    async def scenario() -> None:
        with pytest.raises(HTTPException):
            await ReplayStore().resume("alice", "s1", None, "t:1")

    asyncio.run(scenario())


@pytest.mark.skipif(not os.environ.get("FIRESTORE_EMULATOR_HOST"), reason="Firestore emulator")
def test_firestore_mirror_round_trip() -> None:
    from google.cloud import firestore

    turns = FirestoreTurns(firestore.Client(project="demo-ogoogle-local"), "test-replay")
    record = {"turn_id": "t", "business_id": "", "frames": [{"id": "t:1", "data": "{}"}]}
    turns.save("alice", "s1", {**record, "finished": True})
    loaded = turns.load("alice", "s1")
    assert loaded and loaded["frames"] == record["frames"] and loaded["finished"] is True
    assert turns.load("bob", "s1") is None
