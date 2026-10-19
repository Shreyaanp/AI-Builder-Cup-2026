"""Bounded, server-key Places (New) photo media. No owner-upload publication."""

import asyncio
import hashlib
import hmac
import re
import time
from typing import Any
from urllib.parse import quote, urlencode, urlsplit

import httpx
from fastapi import HTTPException

RESOURCE = re.compile(r"^places/[A-Za-z0-9_-]{1,256}/photos/[A-Za-z0-9_=-]{1,3500}$")
MAX_BYTES = 2_000_000


class PlacesPhotos:
    def __init__(self, client: httpx.AsyncClient, key: str, enabled: bool):
        self.client = client
        self.key = key
        self.enabled = enabled
        self.cache: dict[tuple[str, int], tuple[float, bytes, str]] = {}
        self.lock = asyncio.Lock()

    def describe(self, row: dict[str, Any]) -> tuple[str | None, list[str]]:
        if not self.enabled:
            return None, []
        for photo in row.get("photos", [])[:1]:
            name = photo.get("name", "")
            if not isinstance(name, str) or not RESOURCE.fullmatch(name):
                continue
            if not name.startswith("places/" + row["id"] + "/photos/"):
                continue
            authors = [
                str(author["displayName"])[:200]
                for author in photo.get("authorAttributions", [])[:5]
                if author.get("displayName")
            ]
            return "/api/v1/place-photo?" + urlencode(
                {"name": name, "width": 800, "sig": self.sign(name)}
            ), authors
        return None, []

    def sign(self, name: str) -> str:
        """Stateless proof that this server listed the photo: any instance can check it (OB-46)."""
        return hmac.new(self.key.encode(), name.encode(), hashlib.sha256).hexdigest()[:32]

    async def media(self, name: str, width: int, sig: str = "") -> tuple[bytes, str]:
        if not self.enabled or not hmac.compare_digest(sig.encode(), self.sign(name).encode()):
            raise HTTPException(404, "PHOTO_NOT_AVAILABLE")
        async with self.lock:
            self.cache = {k: v for k, v in self.cache.items() if v[0] > time.monotonic()}
            cached = self.cache.get((name, width))
            if cached:
                return cached[1], cached[2]
            try:
                async with asyncio.timeout(10):
                    response = await self.client.get(
                        "https://places.googleapis.com/v1/" + quote(name, safe="/") + "/media",
                        headers={"X-Goog-Api-Key": self.key},
                        params={"maxWidthPx": width, "skipHttpRedirect": "true"},
                    )
                    response.raise_for_status()
                    uri = response.json()["photoUri"]
                    parsed = urlsplit(uri)
                    host = parsed.hostname or ""
                    # Reject arbitrary provider URLs, credentials, ports and redirect chains.
                    if (
                        parsed.scheme != "https"
                        or parsed.username
                        or parsed.password
                        or parsed.port not in (None, 443)
                        or not any(
                            host.endswith("." + suffix)
                            for suffix in ("googleusercontent.com", "ggpht.com")
                        )
                    ):
                        raise ValueError("Invalid media host")
                    async with self.client.stream("GET", uri, follow_redirects=False) as image:
                        image.raise_for_status()
                        media_type = image.headers.get("content-type", "").split(";")[0]
                        if media_type not in {
                            "image/jpeg",
                            "image/png",
                            "image/webp",
                            "image/avif",
                        }:
                            raise ValueError("Invalid image type")
                        buffer = bytearray()
                        async for chunk in image.aiter_bytes():
                            if len(buffer) + len(chunk) > MAX_BYTES:
                                raise ValueError("Image too large")
                            buffer.extend(chunk)
                    if not buffer:
                        raise ValueError("Empty image")
            except (httpx.HTTPError, ValueError, KeyError, TypeError, TimeoutError) as error:
                raise HTTPException(503, "PHOTO_UNAVAILABLE") from error
            # Small transient memory cache only; no browser or disk retention of provider media.
            if len(self.cache) >= 32:
                self.cache.pop(next(iter(self.cache)))
            self.cache[(name, width)] = (time.monotonic() + 60, bytes(buffer), media_type)
            return bytes(buffer), media_type
