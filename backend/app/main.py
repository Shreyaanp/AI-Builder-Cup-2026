import asyncio
import json
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path
from typing import cast
from uuid import UUID

import anyio
import structlog
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.adk.sessions import BaseSessionService, DatabaseSessionService
from google.cloud import firestore
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from sse_starlette import EventSourceResponse
from starlette.background import BackgroundTask

from .auth import IdentityService
from .boundary import RequestBoundary
from .contracts import CoachTurn, StreamEvent
from .coordinator import MerchantContext, current
from .firestore_memory import FirestoreRunRegistry, FirestoreSessionService
from .frontend import serve_frontend
from .limits import Lease, RunRegistry
from .memory_vectors import (
    ConversationRecall,
    FirestoreRecall,
    Recall,
    gemini_embedder,
    padded_lexical,
)
from .merchant import MerchantRepository, MerchantStore
from .merchant_firestore import FirestoreMerchantStore
from .merchant_routes import router as merchant_router
from .photos import PhotoPipeline
from .settings import Settings
from .streaming import CoachRuntime
from .voice import serve_voice

log = structlog.get_logger()


@dataclass
class Services:
    identity: IdentityService
    runtime: CoachRuntime
    registry: RunRegistry | FirestoreRunRegistry


def get_services(connection: Request | WebSocket) -> Services:
    return cast(Services, connection.app.state.services)


def merchant_services(settings: Settings) -> tuple[MerchantRepository | None, Recall | None]:
    if not settings.v1_enabled:
        return None, None
    if settings.merchant_backend == "sqlite":
        return MerchantStore(settings.merchant_database), ConversationRecall(settings.recall_path)
    client = firestore.Client(
        project=settings.google_cloud_project, database=settings.firestore_database
    )
    embed = (
        gemini_embedder(
            settings.google_cloud_project, settings.google_cloud_location, settings.embedding_model
        )
        if settings.coach_mode == "gemini" and settings.gemini_backend == "vertex"
        else padded_lexical
    )
    return (
        FirestoreMerchantStore(client, settings.firestore_namespace),
        FirestoreRecall(client, settings.firestore_namespace, embed),
    )


def create_app(
    settings: Settings | None = None, sessions: BaseSessionService | None = None
) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = None
        engine = None
        session_service: BaseSessionService
        if sessions is None and settings.session_backend == "firestore":
            client = firestore.AsyncClient(
                project=settings.google_cloud_project, database=settings.firestore_database
            )
            await (
                client.collection(settings.firestore_namespace).document("readiness").get(timeout=5)
            )
            session_service = FirestoreSessionService(client, settings.firestore_namespace)
        elif sessions is None:
            await anyio.to_thread.run_sync(lambda: Path("data").mkdir(exist_ok=True))
            engine = create_async_engine(settings.session_database_url, poolclass=NullPool)
            async with engine.begin() as connection:
                await connection.exec_driver_sql("PRAGMA journal_mode=WAL")
            session_service = DatabaseSessionService(db_engine=engine)
        else:
            session_service = sessions
        identity = await anyio.to_thread.run_sync(IdentityService, settings)
        app.state.v1_settings = settings
        app.state.merchant, app.state.recall = await anyio.to_thread.run_sync(
            merchant_services, settings
        )
        app.state.photos = PhotoPipeline(settings) if settings.v1_enabled else None
        app.state.services = Services(
            identity,
            CoachRuntime(settings, session_service),
            FirestoreRunRegistry(
                client,
                settings.firestore_namespace,
                settings.max_active_runs,
                max(settings.max_voice_seconds, settings.max_turn_seconds) + 10,
            )
            if client
            else RunRegistry(settings.max_active_runs),
        )
        try:
            yield
        finally:
            identity.close()
            if app.state.recall:
                await anyio.to_thread.run_sync(app.state.recall.close)
            if sessions is None and isinstance(session_service, DatabaseSessionService):
                await session_service.close()
            if engine:
                await engine.dispose()
            if client:
                await client._firestore_api.transport.close()
                client.close()

    app = FastAPI(title="oGoogle AI streaming API", version="0.1.0", lifespan=lifespan)
    app.include_router(merchant_router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    app.add_middleware(RequestBoundary, allowed_origins=settings.allowed_origins)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            {
                "code": "INVALID_REQUEST",
                "issues": [
                    {"field": list(item["loc"]), "message": item["msg"]} for item in error.errors()
                ],
            },
            status_code=422,
        )

    @app.get("/api/v1/health")
    async def health() -> dict[str, object]:
        return {
            "product": "oGoogle AI",
            "status": "ok",
            "coach_mode": settings.coach_mode,
            "auth_mode": settings.auth_mode,
            "streaming": ["sse", "websocket"],
            "google_publishing": False,
            "native_google_connected": False,
            "live_provider_verified": False,
            "session_backend": settings.session_backend,
            "release_commit": settings.release_commit,
        }

    @app.get("/api/v1/bootstrap")
    async def bootstrap(request: Request, response: Response) -> dict[str, object]:
        return {
            **get_services(request).identity.bootstrap(request, response),
            "v1_enabled": settings.v1_enabled,
            "coach_mode": settings.coach_mode,
        }

    @app.post(
        "/api/v1/coach/stream",
        response_class=EventSourceResponse,
        responses={
            200: {
                "description": "SSE frames containing StreamEvent JSON; not a JSON document.",
                "content": {"text/event-stream": {"schema": {"type": "string"}}},
            }
        },
    )
    async def coach_stream(body: CoachTurn, request: Request) -> EventSourceResponse:
        services = get_services(request)
        principal = await services.identity.require(request)
        bid = str(body.business_id) if body.business_id else None
        if bid:
            if not app.state.merchant:
                raise HTTPException(503, "Local V1 is not enabled.")
            await anyio.to_thread.run_sync(app.state.merchant.context, principal.uid, bid)
        sid = await services.runtime.session(
            principal, str(body.session_id) if body.session_id else None, bid
        )

        lease = await services.registry.acquire_async(principal.uid, sid)

        async def events() -> AsyncIterator[dict[str, str]]:
            token = None
            if app.state.merchant:
                recall = await anyio.to_thread.run_sync(
                    app.state.recall.search, principal.uid, bid, body.message
                )
                token = current.set(
                    MerchantContext(app.state.merchant, principal.uid, bid, recall, body.message)
                )
            sequence = 0

            def frame(event: StreamEvent) -> dict[str, str]:
                nonlocal sequence
                sequence += 1
                return {
                    "event": "coach",
                    "id": str(sequence),
                    "data": json.dumps(event.payload(), ensure_ascii=False),
                }

            try:
                yield frame(StreamEvent(kind="ready", session_id=sid, mode=settings.coach_mode))
                async with asyncio.timeout(settings.max_turn_seconds):
                    async for event in services.runtime.text_events(
                        principal, sid, body.message, body.language
                    ):
                        yield frame(event)
                        if event.kind == "error":
                            return
            except TimeoutError:
                yield frame(StreamEvent(kind="error", code="TURN_TIMEOUT"))
            except Exception:
                log.warning("coach_stream_failed", code="PROVIDER_UNAVAILABLE")
                yield frame(StreamEvent(kind="error", code="PROVIDER_UNAVAILABLE"))
            finally:
                if token is not None:
                    current.reset(token)
                await services.registry.release_async(lease)
            if app.state.recall:
                await anyio.to_thread.run_sync(
                    app.state.recall.remember, principal.uid, bid, body.message
                )

        return EventSourceResponse(
            events(),
            ping=10,
            send_timeout=5,
            headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"},
            background=BackgroundTask(services.registry.release_async, lease),
        )

    @app.get("/api/v1/conversations")
    async def conversations(request: Request) -> list[dict[str, object]]:
        services = get_services(request)
        principal = await services.identity.require(request)
        listing = await services.runtime.sessions.list_sessions(
            app_name="ogoogle_ai", user_id=principal.uid
        )
        return [
            {
                "session_id": item.id,
                "updated": item.last_update_time,
                "business_id": item.state.get("business_id"),
            }
            for item in reversed(listing.sessions)
        ]

    @app.get("/api/v1/conversations/{session_id}")
    async def conversation(session_id: UUID, request: Request) -> dict[str, object]:
        services = get_services(request)
        principal = await services.identity.require(request)
        session = await services.runtime.sessions.get_session(
            app_name="ogoogle_ai", user_id=principal.uid, session_id=str(session_id)
        )
        if not session:
            raise HTTPException(404, "Conversation not found.")
        messages = []
        for event in session.events:
            if event.content and event.content.role in {"model", "user"}:
                text = "".join(
                    part.text or "" for part in event.content.parts or [] if not part.thought
                )
                if text:
                    messages.append(
                        {
                            "role": "assistant" if event.content.role == "model" else "user",
                            "text": re.sub(r"^\[language=(en|hi)\]\s*", "", text)[:4000],
                        }
                    )
        return {"session_id": session.id, "messages": messages}

    @app.websocket("/api/v1/voice")
    async def voice(websocket: WebSocket) -> None:
        if websocket.headers.get("origin") not in settings.allowed_origins:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        services = get_services(websocket)
        lease: Lease | None = None
        context_token = None
        try:
            async with asyncio.timeout(5):
                principal = await services.identity.require_websocket(websocket)
            requested = websocket.query_params.get("session_id")
            if requested:
                requested = str(UUID(requested))
            bid = websocket.query_params.get("business_id")
            if bid:
                bid = str(UUID(bid))
                if not app.state.merchant:
                    raise HTTPException(503, "Local V1 is not enabled.")
                await anyio.to_thread.run_sync(app.state.merchant.context, principal.uid, bid)
            if app.state.merchant:
                context_token = current.set(
                    MerchantContext(app.state.merchant, principal.uid, bid, [])
                )
            sid = await services.runtime.session(principal, requested, bid)
            lease = await services.registry.acquire_async(principal.uid, sid)
            await websocket.send_json(
                StreamEvent(
                    kind="ready",
                    session_id=sid,
                    mode=settings.coach_mode,
                ).payload()
            )
            await serve_voice(websocket, services.runtime, principal, sid)
        except (HTTPException, ValueError, TimeoutError):
            with suppress(RuntimeError, WebSocketDisconnect):
                await websocket.send_json(
                    StreamEvent(kind="error", code="AUTH_OR_SESSION_ERROR").payload()
                )
        except WebSocketDisconnect:
            pass
        finally:
            if context_token is not None:
                current.reset(context_token)
            if lease:
                await services.registry.release_async(lease)
            with suppress(RuntimeError, WebSocketDisconnect):
                await websocket.close()

    if settings.frontend_dist:
        serve_frontend(app, settings.frontend_dist)
    return app


app = create_app()
