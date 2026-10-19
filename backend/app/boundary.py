"""Pure ASGI request limits; response chunks pass through without buffering."""

import asyncio

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .limits import JSON_BODY_BYTES
from .region import client_country
from .shop_time import client_timezone, valid_timezone

# Browsers ignore HSTS over plain http, so local dev is unaffected. The popup sign-in needs
# same-origin-allow-popups; camera, microphone and location stay first-party only.
SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self), payment=()",
}


def language_country(header: str | None) -> str | None:
    """The region of the phone's first language that names one ("en-IN,en;q=0.9" → IN)."""
    for part in (header or "")[:200].split(","):
        tag = part.split(";", 1)[0].strip()
        region = next((bit for bit in tag.split("-")[1:] if len(bit) == 2 and bit.isalpha()), None)
        if region:
            return region.upper()
    return None


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
                # Default no-store; static assets and routes that chose a cache policy (e.g.
                # immutable shop photos) keep theirs.
                cached = scope["path"].startswith("/assets/") or "cache-control" in headers
                if not (cached and message["status"] == 200):
                    headers["Cache-Control"] = "no-store"
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Referrer-Policy"] = "same-origin"
                headers.update(SECURITY_HEADERS)
            await send(message)

        async def reject(code: str, status: int) -> None:
            await JSONResponse({"code": code}, status_code=status)(scope, receive, send_headers)

        headers = Headers(scope=scope)
        client_timezone.set(valid_timezone(headers.get("x-client-timezone")))
        client_country.set(language_country(headers.get("accept-language")))
        origin = headers.get("origin")
        if origin and origin not in self.allowed_origins:
            await reject("ORIGIN_BLOCKED", 403)
            return
        next_receive = receive
        content_type = headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if (
            scope["method"] in {"POST", "PUT", "PATCH"}
            or content_type == "application/json"
            or content_type.endswith("+json")
        ):
            path = scope["path"]
            if (
                path in {"/api/v1/photos", "/api/v1/photos/classify"}
                or path.endswith("/import")
                # Close the day photos and shop gallery photos: real phone photos are megabytes,
                # far over the JSON limit (they were rejected with 413 before reaching the route).
                or (path.startswith("/api/v1/businesses/") and path.endswith("/day/read"))
                or (path.startswith("/api/v1/businesses/") and path.endswith("/gallery"))
                or (
                    path.startswith("/api/v1/businesses/")
                    and path.endswith(("/connect/analyze", "/connect/sync"))
                )
                or (path.startswith("/api/v1/face/challenges/") and path.endswith("/capture"))
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
            if length > JSON_BODY_BYTES:
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
                        if len(body) + len(chunk) > JSON_BODY_BYTES:
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
