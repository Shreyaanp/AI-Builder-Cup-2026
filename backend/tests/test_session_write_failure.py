"""A failed or cancelled Firestore event write never ends the voice session.

Production (17 Oct): the voice socket closed while ADK was committing a reply event. ADK's live
runner cancelled its event pump mid-commit, Firestore's transaction wrapper rolled back, the
rollback failed with 409 ABORTED ("transaction has expired") and that error replaced the
cancellation, so ADK logged "Root node business_coach failed". The fake below runs through the
real ``firestore.async_transactional`` wrapper, so the library's own rollback path is exercised.
"""

import asyncio
import json
import logging
import threading
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.adk.agents import LlmAgent
from google.adk.events import Event
from google.api_core import exceptions
from google.cloud import firestore
from google.genai import types
from starlette.websockets import WebSocketDisconnect

from app import firestore_memory
from app.firestore_memory import FirestoreSessionService, pending_writes, settle_writes
from app.main import create_app
from app.settings import Settings

ORIGIN = {"origin": "http://127.0.0.1:3200"}
EXPIRED = "The referenced transaction has expired or is no longer valid."


class Snapshot:
    def __init__(self, data: dict | None) -> None:
        self.exists = data is not None
        self.data = data

    def to_dict(self) -> dict | None:
        return json.loads(json.dumps(self.data)) if self.data is not None else None


class Document:
    def __init__(self, store: "FakeFirestore", path: str) -> None:
        self.store = store
        self.path = path

    def collection(self, name: str) -> "Collection":
        return Collection(self.store, f"{self.path}/{name}")

    async def get(self, transaction: Any = None) -> Snapshot:
        return Snapshot(self.store.data.get(self.path))


class Collection:
    def __init__(self, store: "FakeFirestore", path: str) -> None:
        self.store = store
        self.path = path
        self.id = path

    def document(self, name: str) -> Document:
        return Document(self.store, f"{self.path}/{name}")

    def limit(self, count: int) -> "Collection":
        return self

    async def stream(self):
        for path, data in list(self.store.data.items()):
            if path.rsplit("/", 1)[0] == self.path:
                yield Snapshot(data)


class Transaction:
    """The surface ``_AsyncTransactional`` drives: begin, commit, rollback."""

    _read_only = False
    _max_attempts = 5

    def __init__(self, store: "FakeFirestore") -> None:
        self.store = store
        self._id: bytes | None = None
        self.writes: list[tuple[str, dict | None]] = []

    def _clean_up(self) -> None:
        self._id = None
        self.writes = []

    async def _begin(self, retry_id: bytes | None = None) -> None:
        self._id = b"transaction"

    def set(self, ref: Document, data: dict) -> None:
        self.writes.append((ref.path, data))

    create = set

    def delete(self, ref: Document) -> None:
        self.writes.append((ref.path, None))

    async def _commit(self) -> None:
        payload = json.dumps([data for _, data in self.writes])
        self.store.commits += 1
        for marker in list(self.store.cancel):
            if marker in payload and self.store.cancel[marker] > 0:
                self.store.cancel[marker] -= 1
                self.store.expired = True
                # A gRPC call cut off mid-flight surfaces as CancelledError.
                raise asyncio.CancelledError
        for marker in self.store.hang:
            if marker in payload:
                self.store.hanging.set()
                self.store.expired = True
                await asyncio.to_thread(self.store.release.wait, 5)
                self.store.expired = False
        for path, data in self.writes:
            if data is None:
                self.store.data.pop(path, None)
            else:
                self.store.data[path] = json.loads(json.dumps(data))
        self._clean_up()

    async def _rollback(self) -> None:
        self._clean_up()
        if self.store.expired:
            self.store.expired = False
            raise exceptions.Aborted(EXPIRED)


class FakeFirestore:
    def __init__(self) -> None:
        self.data: dict[str, dict] = {}
        self.commits = 0
        self.cancel: dict[str, int] = {}
        self.hang: set[str] = set()
        self.expired = False
        # Threading events: the app's loop runs in TestClient's thread.
        self.hanging = threading.Event()
        self.release = threading.Event()

    def collection(self, name: str) -> Collection:
        return Collection(self, name)

    def transaction(self) -> Transaction:
        return Transaction(self)


def reply(text: str) -> Event:
    return Event(
        author="business_coach",
        content=types.Content(role="model", parts=[types.Part(text=text)]),
    )


def stored_texts(store: FakeFirestore) -> list[str]:
    texts = []
    for path, data in store.data.items():
        if "/sessions/" in path:
            for event in json.loads(data["payload"])["events"]:
                parts = (event.get("content") or {}).get("parts", [])
                texts += [part.get("text") for part in parts]
    return texts


@pytest.mark.asyncio
async def test_library_turns_a_cancelled_commit_into_aborted() -> None:
    # The production chain, without our service: cancel lands mid-commit, rollback raises 409.
    store = FakeFirestore()
    store.hang.add("x")

    @firestore.async_transactional
    async def write(transaction: Any) -> None:
        transaction.set(store.collection("c").document("d"), {"value": "x"})

    task = asyncio.create_task(write(store.transaction()))
    assert await asyncio.to_thread(store.hanging.wait, 5)
    task.cancel()
    with pytest.raises(exceptions.Aborted, match="expired"):
        await task


@pytest.mark.asyncio
async def test_cancel_mid_commit_finishes_the_write_then_stays_a_cancel() -> None:
    store = FakeFirestore()
    memory = FirestoreSessionService(store, "ns")
    session = await memory.create_session(app_name="coach", user_id="alice")
    store.hang.add("cut off")
    task = asyncio.create_task(memory.append_event(session, reply("cut off")))
    assert await asyncio.to_thread(store.hanging.wait, 5)
    task.cancel()
    await asyncio.sleep(0.05)
    store.release.set()
    # A real cancellation stays a cancellation (not the rollback's 409), so the socket's
    # teardown is clean, and the transaction committed whole instead of half-rolled-back.
    with pytest.raises(asyncio.CancelledError):
        await task
    assert stored_texts(store) == ["cut off"]


@pytest.mark.asyncio
async def test_failed_write_is_retried_then_skipped_without_going_stale() -> None:
    store = FakeFirestore()
    memory = FirestoreSessionService(store, "ns")
    session = await memory.create_session(app_name="coach", user_id="alice")
    store.cancel["retried"] = 1
    await memory.append_event(session, reply("retried"))
    assert stored_texts(store) == ["retried"]

    store.cancel["skipped"] = 2
    await memory.append_event(session, reply("skipped"))
    assert stored_texts(store) == ["retried"]
    # The turn keeps the event in memory, and the next write is not rejected as stale.
    assert [e.content.parts[0].text for e in session.events] == ["retried", "skipped"]
    await memory.append_event(session, reply("after"))
    assert stored_texts(store) == ["retried", "after"]


def test_voice_session_survives_failed_write_and_closes_cleanly(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    # The real ADK live runner (event pump, persistence, root-task cleanup) with the model
    # replaced: only the agent's live implementation is substituted.
    async def fake_live(self: LlmAgent, ctx: Any):
        yield reply("first reply")
        yield reply("second reply")
        yield reply("cut off")
        await asyncio.Event().wait()

    monkeypatch.setattr(LlmAgent, "_run_live_impl", fake_live)
    store = FakeFirestore()
    # The first reply's commit is cut off twice (the second attempt too), and its rollback 409s.
    store.cancel["first reply"] = 2
    store.hang.add("cut off")
    app = create_app(Settings(app_env="test", _env_file=None), FirestoreSessionService(store, "ns"))
    caplog.set_level(logging.INFO)
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        app.state.services.runtime.settings.coach_mode = "gemini"
        with client.websocket_connect("/api/v1/voice", headers=ORIGIN) as socket:
            assert socket.receive_json()["kind"] == "ready"
            assert socket.receive_json()["text"] == "first reply"
            # Still up after the failed write.
            assert socket.receive_json()["text"] == "second reply"
            assert store.hanging.wait(5)
            # The owner ends the call while the next event is mid-commit.
            threading.Timer(0.2, store.release.set).start()
            socket.send_json({"kind": "close"})
            # Wait for the server's own close: leaving the block early makes TestClient cancel
            # the app, a second cancellation production's server never sends.
            with pytest.raises(WebSocketDisconnect) as closed:
                while True:
                    socket.receive_json()
            assert closed.value.code == 1000
        assert not app.state.services.registry.active
    assert stored_texts(store) == ["second reply", "cut off"]
    assert "Root node business_coach failed" not in caplog.text


@pytest.mark.asyncio
async def test_settle_waits_for_a_write_its_cancelled_caller_left_behind(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(firestore_memory, "CANCELLED_WRITE_SECONDS", 0.05)
    store = FakeFirestore()
    memory = FirestoreSessionService(store, "ns")
    session = await memory.create_session(app_name="coach", user_id="alice")
    store.hang.add("last answer")
    token = pending_writes.set(set())
    try:
        task = asyncio.create_task(memory.append_event(session, reply("last answer")))
        assert await asyncio.to_thread(store.hanging.wait, 5)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        # The caller gave up; the write did not land yet.
        assert stored_texts(store) == []
        threading.Timer(0.3, store.release.set).start()
        assert await settle_writes(5) == 0
        assert stored_texts(store) == ["last answer"]
    finally:
        pending_writes.reset(token)


def test_voice_close_mid_save_persists_the_last_answer_before_the_socket_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The owner closes while their last answer is still being committed, and the commit outlasts
    # the cancelled caller's own wait: the socket closes only once the answer is stored.
    async def fake_live(self: LlmAgent, ctx: Any):
        yield reply("first reply")
        yield reply("last answer")
        await asyncio.Event().wait()

    monkeypatch.setattr(LlmAgent, "_run_live_impl", fake_live)
    monkeypatch.setattr(firestore_memory, "CANCELLED_WRITE_SECONDS", 0.1)
    store = FakeFirestore()
    store.hang.add("last answer")
    app = create_app(Settings(app_env="test", _env_file=None), FirestoreSessionService(store, "ns"))
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        app.state.services.runtime.settings.coach_mode = "gemini"
        with client.websocket_connect("/api/v1/voice", headers=ORIGIN) as socket:
            assert socket.receive_json()["kind"] == "ready"
            assert socket.receive_json()["text"] == "first reply"
            assert store.hanging.wait(5)
            threading.Timer(1.0, store.release.set).start()
            socket.send_json({"kind": "close"})
            with pytest.raises(WebSocketDisconnect) as closed:
                while True:
                    socket.receive_json()
            assert closed.value.code == 1000
            assert stored_texts(store) == ["first reply", "last answer"]
