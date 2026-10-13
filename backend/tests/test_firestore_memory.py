import os
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from google.adk.errors import StaleSessionError
from google.adk.events import Event, EventActions
from google.adk.sessions.base_session_service import GetSessionConfig
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore
from google.genai import types

from app.auth import Principal
from app.firestore_memory import FirestoreRunRegistry, FirestoreSessionService
from app.settings import Settings
from app.streaming import CoachRuntime

pytestmark = pytest.mark.skipif(
    os.getenv("FIRESTORE_EMULATOR_HOST") != "127.0.0.1:8085",
    reason="Requires the explicitly local Firestore emulator; never use a cloud database.",
)


@pytest_asyncio.fixture
async def memory():
    client = firestore.AsyncClient(project="demo-ogoogle-local", credentials=AnonymousCredentials())
    service = FirestoreSessionService(client, "ogoogle_ai_test_" + uuid4().hex)
    yield service
    await client._firestore_api.transport.close()


@pytest.mark.asyncio
async def test_owned_sessions_shared_state_and_restart(memory: FirestoreSessionService) -> None:
    session = await memory.create_session(
        app_name="coach",
        user_id="alice",
        state={"name": "Tea", "user:language": "hi", "app:version": 1, "temp:secret": "discard"},
    )
    second = FirestoreSessionService(memory.client, memory.root.id)
    restored = await second.get_session(app_name="coach", user_id="alice", session_id=session.id)
    assert restored.state == {"name": "Tea", "user:language": "hi", "app:version": 1}
    assert await second.get_session(app_name="coach", user_id="bob", session_id=session.id) is None
    assert await second.get_user_state(app_name="coach", user_id="alice") == {"language": "hi"}
    listing = await second.list_sessions(app_name="coach", user_id="alice")
    assert [item.id for item in listing.sessions] == [session.id]
    await second.delete_session(app_name="coach", user_id="bob", session_id=session.id)
    assert await memory.get_session(app_name="coach", user_id="alice", session_id=session.id)
    await second.delete_session(app_name="coach", user_id="alice", session_id=session.id)
    assert not (await second.list_sessions(app_name="coach", user_id="alice")).sessions


@pytest.mark.asyncio
async def test_event_idempotence_staleness_and_temporary_state(
    memory: FirestoreSessionService,
) -> None:
    session = await memory.create_session(app_name="coach", user_id="alice")
    stale = session.model_copy(deep=True)
    event = Event(
        author="coach",
        actions=EventActions(
            state_delta={"name": "Bakery", "user:language": "en", "temp:hint": "ephemeral"}
        ),
    )
    await memory.append_event(session, event)
    await memory.append_event(session, event)
    assert session.state["temp:hint"] == "ephemeral"
    restored = await memory.get_session(app_name="coach", user_id="alice", session_id=session.id)
    assert len(restored.events) == 1
    assert "temp:hint" not in restored.state
    assert restored.state["user:language"] == "en"
    with pytest.raises(StaleSessionError):
        await memory.append_event(stale, Event(author="coach"))
    await memory.append_event(session, Event(author="coach", partial=True))
    recent = await memory.get_session(
        app_name="coach",
        user_id="alice",
        session_id=session.id,
        config=GetSessionConfig(num_recent_events=0),
    )
    assert recent.events == []


@pytest.mark.asyncio
async def test_real_adk_conversation_persists_across_runners(
    memory: FirestoreSessionService,
) -> None:
    settings = Settings(app_env="test", _env_file=None)
    principal = Principal("alice", "test")
    runtime = CoachRuntime(settings, memory)
    sid = await runtime.session(principal, None)
    events = [event async for event in runtime.text_events(principal, sid, "My tea shop", "en")]
    assert events[-1].kind == "turn_complete"
    restarted = CoachRuntime(settings, FirestoreSessionService(memory.client, memory.root.id))
    assert await restarted.session(principal, sid) == sid
    session = await memory.get_session(app_name="ogoogle_ai", user_id="alice", session_id=sid)
    assert len(session.events) >= 2
    assert any(
        part.text and "My tea shop" in part.text
        for event in session.events
        if event.content
        for part in event.content.parts or []
    )
    events = [event async for event in restarted.text_events(principal, sid, "Continue", "hi")]
    assert events[-1].kind == "turn_complete"


@pytest.mark.asyncio
async def test_distributed_leases_and_old_release(memory: FirestoreSessionService) -> None:
    first = FirestoreRunRegistry(memory.client, memory.root.id, 1, 130)
    second = FirestoreRunRegistry(memory.client, memory.root.id, 1, 130)
    lease = await first.acquire_async("alice", "one")
    with pytest.raises(HTTPException) as duplicate:
        await second.acquire_async("alice", "one")
    assert duplicate.value.status_code == 409
    with pytest.raises(HTTPException) as full:
        await second.acquire_async("bob", "two")
    assert full.value.status_code == 429
    await second.release_async(lease)
    new = await second.acquire_async("alice", "one")
    await first.release_async(lease)
    with pytest.raises(HTTPException):
        await first.acquire_async("alice", "one")
    await first.release_async(new)
    again = await first.acquire_async("bob", "two")
    await first.release_async(again)


@pytest.mark.asyncio
async def test_storage_limits_and_partial_events(memory: FirestoreSessionService) -> None:
    session = await memory.create_session(app_name="coach", user_id="alice")
    event = Event(
        author="coach", content=types.Content(role="model", parts=[types.Part(text="x" * 810000)])
    )
    with pytest.raises(ValueError, match="storage limit"):
        await memory.append_event(session, event)
    stored = await memory.get_session(app_name="coach", user_id="alice", session_id=session.id)
    assert stored.events == []
    assert session.events == []
