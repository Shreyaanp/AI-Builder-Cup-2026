import asyncio
import json
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
from sse_starlette import EventSourceResponse
from starlette.background import BackgroundTask

from .auth import IdentityService
from .boundary import RequestBoundary
from .contracts import CoachTurn, StreamEvent
from .limits import Lease, RunRegistry
from .settings import Settings
from .streaming import CoachRuntime
from .voice import serve_voice

log = structlog.get_logger()


@dataclass
class Services:
    identity: IdentityService
    runtime: CoachRuntime
    registry: RunRegistry


def get_services(connection: Request | WebSocket) -> Services:
    return cast(Services, connection.app.state.services)


def create_app(
    settings: Settings | None = None, sessions: BaseSessionService | None = None
) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if sessions is None and settings.session_database_url.startswith("sqlite"):
            await anyio.to_thread.run_sync(lambda: Path("data").mkdir(exist_ok=True))
        session_service = sessions or DatabaseSessionService(db_url=settings.session_database_url)
        identity = await anyio.to_thread.run_sync(IdentityService, settings)
        app.state.services = Services(
            identity, CoachRuntime(settings, session_service), RunRegistry(settings.max_active_runs)
        )
        try:
            yield
        finally:
            identity.close()
            if sessions is None and isinstance(session_service, DatabaseSessionService):
                await session_service.close()

    app = FastAPI(title="oGoogle AI streaming API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
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
        }

    @app.get("/api/v1/bootstrap")
    async def bootstrap(request: Request, response: Response) -> dict[str, str]:
        return get_services(request).identity.bootstrap(request, response)

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
        sid = await services.runtime.session(
            principal, str(body.session_id) if body.session_id else None
        )
        lease = services.registry.acquire(principal.uid, sid)

        async def events() -> AsyncIterator[dict[str, str]]:
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
                services.registry.release(lease)

        return EventSourceResponse(
            events(),
            ping=10,
            send_timeout=5,
            headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"},
            background=BackgroundTask(services.registry.release, lease),
        )

    @app.websocket("/api/v1/voice")
    async def voice(websocket: WebSocket) -> None:
        if websocket.headers.get("origin") not in settings.allowed_origins:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        services = get_services(websocket)
        lease: Lease | None = None
        try:
            async with asyncio.timeout(5):
                principal = await services.identity.require_websocket(websocket)
            requested = websocket.query_params.get("session_id")
            if requested:
                requested = str(UUID(requested))
            sid = await services.runtime.session(principal, requested)
            lease = services.registry.acquire(principal.uid, sid)
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
            if lease:
                services.registry.release(lease)
            with suppress(RuntimeError, WebSocketDisconnect):
                await websocket.close()

    return app


app = create_app()
