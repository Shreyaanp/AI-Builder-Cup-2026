"""Pure ASGI request limits; response chunks pass through without buffering."""

import asyncio

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestBoundary:
    def __init__(self, app: ASGIApp, allowed_origins: list[str]) -> None:
        self.app = app
        self.allowed_origins = set(allowed_origins)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if not (scope["path"].startswith("/assets/") and message["status"] == 200):
                    headers["Cache-Control"] = "no-store"
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Referrer-Policy"] = "same-origin"
            await send(message)

        async def reject(code: str, status: int) -> None:
            await JSONResponse({"code": code}, status_code=status)(scope, receive, send_headers)

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if origin and origin not in self.allowed_origins:
            await reject("ORIGIN_BLOCKED", 403)
            return
        next_receive = receive
        if scope["method"] in {"POST", "PUT", "PATCH"}:
            path = scope["path"]
            if path == "/api/v1/photos" or (
                path.startswith("/api/v1/face/challenges/") and path.endswith("/capture")
            ):
                # The authenticated route consumes a bounded in-memory stream. Do not
                # spool media or buffer it before identity verification.
                await self.app(scope, receive, send_headers)
                return
            try:
                length = int(headers.get("content-length", "0"))
                if length < 0:
                    raise ValueError("Negative length")
            except ValueError:
                await reject("INVALID_LENGTH", 400)
                return
            if length > 16_384:
                await reject("BODY_TOO_LARGE", 413)
                return
            body = bytearray()
            try:
                async with asyncio.timeout(5):
                    while True:
                        message = await receive()
                        if message["type"] == "http.disconnect":
                            return
                        chunk = message.get("body", b"")
                        if len(body) + len(chunk) > 16_384:
                            await reject("BODY_TOO_LARGE", 413)
                            return
                        body.extend(chunk)
                        if not message.get("more_body", False):
                            break
            except TimeoutError:
                await reject("BODY_TIMEOUT", 408)
                return
            delivered = False

            async def replay() -> Message:
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            next_receive = replay
        await self.app(scope, next_receive, send_headers)
