"""Owned ADK sessions and distributed leases in a dedicated Firestore namespace."""

import asyncio
import hashlib
import json
import time
from typing import Any
from uuid import uuid4

import anyio
from fastapi import HTTPException
from google.adk.errors import StaleSessionError
from google.adk.errors.already_exists_error import AlreadyExistsError
from google.adk.errors.session_not_found_error import SessionNotFoundError
from google.adk.events import Event
from google.adk.sessions import BaseSessionService, Session
from google.adk.sessions.base_session_service import GetSessionConfig, ListSessionsResponse
from google.adk.sessions.state import State
from google.cloud import firestore

from .limits import Lease


def key(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def scope_state(state: dict[str, Any]) -> tuple[dict, dict, dict]:
    app, user, local = {}, {}, {}
    for name, value in state.items():
        if name.startswith(State.APP_PREFIX):
            app[name[len(State.APP_PREFIX) :]] = value
        elif name.startswith(State.USER_PREFIX):
            user[name[len(State.USER_PREFIX) :]] = value
        elif not name.startswith(State.TEMP_PREFIX):
            local[name] = value
    return app, user, local


class FirestoreSessionService(BaseSessionService):
    def __init__(self, client: firestore.AsyncClient, namespace: str) -> None:
        self.client = client
        self.root = client.collection(namespace)

    def refs(self, app_name: str, user_id: str, session_id: str) -> tuple[Any, Any, Any]:
        app = self.root.document(key(app_name))
        user = app.collection("users").document(key(user_id))
        return app, user, user.collection("sessions").document(key(session_id))

    @staticmethod
    def encode(session: Session) -> dict[str, Any]:
        _, _, state = scope_state(session.state)
        stored = session.model_copy(update={"state": state})
        payload = stored.model_dump_json()
        if len(payload.encode()) > 800_000:
            raise ValueError("Conversation storage limit exceeded; start a new conversation.")
        return {"payload": payload, "updated": session.last_update_time}

    @staticmethod
    def merge(session: Session, app: dict, user: dict) -> Session:
        session.state.update({State.APP_PREFIX + k: v for k, v in app.get("state", {}).items()})
        session.state.update({State.USER_PREFIX + k: v for k, v in user.get("state", {}).items()})
        return session

    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: dict[str, Any] | None = None,
        session_id: str | None = None,
    ) -> Session:
        sid = session_id or str(uuid4())
        app_ref, user_ref, session_ref = self.refs(app_name, user_id, sid)
        app_delta, user_delta, local = scope_state(state or {})
        session = Session(
            id=sid, app_name=app_name, user_id=user_id, state=local, last_update_time=time.time()
        )

        @firestore.async_transactional
        async def create(transaction: Any) -> Session:
            app = (await app_ref.get(transaction=transaction)).to_dict() or {}
            user = (await user_ref.get(transaction=transaction)).to_dict() or {}
            existing = await session_ref.get(transaction=transaction)
            if existing.exists:
                raise AlreadyExistsError("Conversation already exists.")
            if user.get("count", 0) >= 20:
                raise HTTPException(429, "This workspace supports 20 conversations.")
            app_state = app.get("state", {}) | app_delta
            user_state = user.get("state", {}) | user_delta
            if app_delta:
                transaction.set(app_ref, {"state": app_state})
            transaction.set(user_ref, {"state": user_state, "count": user.get("count", 0) + 1})
            transaction.create(session_ref, self.encode(session))
            return self.merge(session, {"state": app_state}, {"state": user_state})

        return await create(self.client.transaction())

    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: GetSessionConfig | None = None,
    ) -> Session | None:
        app_ref, user_ref, session_ref = self.refs(app_name, user_id, session_id)
        snapshot = await session_ref.get()
        if not snapshot.exists:
            return None
        session = Session.model_validate_json((snapshot.to_dict() or {})["payload"])
        if (session.app_name, session.user_id, session.id) != (app_name, user_id, session_id):
            raise ValueError("Conversation scope mismatch.")
        app, user = await asyncio.gather(app_ref.get(), user_ref.get())
        if config:
            if config.after_timestamp is not None:
                session.events = [
                    e for e in session.events if e.timestamp >= config.after_timestamp
                ]
            if config.num_recent_events is not None:
                session.events = (
                    session.events[-config.num_recent_events :] if config.num_recent_events else []
                )
        return self.merge(session, app.to_dict() or {}, user.to_dict() or {})

    async def list_sessions(
        self, *, app_name: str, user_id: str | None = None
    ) -> ListSessionsResponse:
        if user_id is None:
            raise ValueError("Owner-scoped listing requires a user ID.")
        app_ref, user_ref, _ = self.refs(app_name, user_id, "")
        app, user = await asyncio.gather(app_ref.get(), user_ref.get())
        sessions = []
        async for snapshot in user_ref.collection("sessions").limit(20).stream():
            session = Session.model_validate_json((snapshot.to_dict() or {})["payload"])
            session.events = []
            sessions.append(self.merge(session, app.to_dict() or {}, user.to_dict() or {}))
        sessions.sort(key=lambda s: (s.last_update_time, s.id))
        return ListSessionsResponse(sessions=sessions)

    async def get_user_state(self, *, app_name: str, user_id: str) -> dict[str, Any]:
        _, user_ref, _ = self.refs(app_name, user_id, "")
        return ((await user_ref.get()).to_dict() or {}).get("state", {})

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str) -> None:
        _, user_ref, session_ref = self.refs(app_name, user_id, session_id)

        @firestore.async_transactional
        async def delete(transaction: Any) -> None:
            user = (await user_ref.get(transaction=transaction)).to_dict() or {}
            existing = await session_ref.get(transaction=transaction)
            if existing.exists:
                transaction.delete(session_ref)
                transaction.set(user_ref, {**user, "count": max(0, user.get("count", 0) - 1)})

        await delete(self.client.transaction())

    async def append_event(self, session: Session, event: Event) -> Event:
        if event.partial:
            return event
        app_ref, user_ref, session_ref = self.refs(session.app_name, session.user_id, session.id)
        # Temporary values remain in this invocation only, following ADK's base service.
        clean = event.model_copy(deep=True)
        clean = self._trim_temp_delta_state(clean)

        @firestore.async_transactional
        async def append(transaction: Any) -> Session:
            snapshot = await session_ref.get(transaction=transaction)
            app = (await app_ref.get(transaction=transaction)).to_dict() or {}
            user = (await user_ref.get(transaction=transaction)).to_dict() or {}
            if not snapshot.exists:
                raise SessionNotFoundError("Conversation no longer exists.")
            stored = Session.model_validate_json((snapshot.to_dict() or {})["payload"])
            if any(previous == clean for previous in stored.events if previous.id == clean.id):
                return stored
            if stored.last_update_time != session.last_update_time:
                raise StaleSessionError("Conversation changed; reload before retrying.")
            app_delta, user_delta, local_delta = scope_state(clean.actions.state_delta or {})
            stored.state.update(local_delta)
            stored.events.append(clean)
            stored.last_update_time = event.timestamp
            if app_delta:
                transaction.set(app_ref, {"state": app.get("state", {}) | app_delta})
            if user_delta:
                transaction.set(user_ref, {**user, "state": user.get("state", {}) | user_delta})
            transaction.set(session_ref, self.encode(stored))
            return stored

        stored = await append(self.client.transaction())
        # Only mutate the caller's session after durable commit succeeded.
        self._apply_temp_state(session, event)
        session.state.update(stored.state)
        session.state.update(clean.actions.state_delta or {})
        if not any(previous == clean for previous in session.events if previous.id == clean.id):
            session.events.append(clean)
        session.last_update_time = stored.last_update_time
        return clean


class FirestoreRunRegistry:
    def __init__(
        self, client: firestore.AsyncClient, namespace: str, maximum: int, ttl: int
    ) -> None:
        self.client = client
        self.ref = client.collection(namespace).document("runtime_leases")
        self.maximum = maximum
        self.ttl = ttl

    async def acquire_async(self, user_id: str, session_id: str) -> Lease:
        lease = Lease((user_id, session_id), str(uuid4()))
        slot = key(json.dumps(lease.key))

        @firestore.async_transactional
        async def acquire(transaction: Any) -> None:
            snapshot = await self.ref.get(transaction=transaction)
            now = time.time()
            active = {
                k: v
                for k, v in (snapshot.to_dict() or {}).get("active", {}).items()
                if v["expires"] > now
            }
            if slot in active:
                raise HTTPException(409, "This conversation already has an active stream.")
            if len(active) >= self.maximum:
                raise HTTPException(429, "The coach is busy. Try again shortly.")
            active[slot] = {"token": lease.token, "expires": now + self.ttl}
            transaction.set(self.ref, {"active": active})

        await acquire(self.client.transaction())
        return lease

    async def release_async(self, lease: Lease) -> None:
        slot = key(json.dumps(lease.key))

        @firestore.async_transactional
        async def release(transaction: Any) -> None:
            snapshot = await self.ref.get(transaction=transaction)
            active = (snapshot.to_dict() or {}).get("active", {})
            if active.get(slot, {}).get("token") == lease.token:
                del active[slot]
                transaction.set(self.ref, {"active": active})

        # Firestore cleanup must survive the SSE task group's disconnect cancellation.
        with anyio.CancelScope(shield=True):
            async with asyncio.timeout(5):
                await release(self.client.transaction())
