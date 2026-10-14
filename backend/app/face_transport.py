"""Two independent authentication layers for the private Cloud Run worker."""

import anyio
import httpx
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2.id_token import fetch_id_token

from .settings import Settings


async def worker_headers(settings: Settings, uid: str) -> dict[str, str]:
    headers = {
        "Authorization": "Bearer " + settings.face_worker_token.get_secret_value(),
        "X-Owner": uid,
    }
    if settings.app_env == "production":
        try:
            identity = await anyio.to_thread.run_sync(
                fetch_id_token, Request(), settings.face_worker_url.rstrip("/")
            )
        except (GoogleAuthError, OSError, ValueError) as error:
            raise httpx.ConnectError("Private worker identity unavailable") from error
        # Cloud Run checks this header, leaving Authorization for the worker's shared token.
        headers["X-Serverless-Authorization"] = "Bearer " + identity
    return headers
