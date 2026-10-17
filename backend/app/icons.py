"""Shop icons: a square picture for the shop card, customer page, results and map pin.

The owner either asks for one ("Make my icon": Gemini's image model, from the shop's name,
kind and region) or uses a photo of their own. Both end the same way: moderated, centre-cropped
to a square and re-encoded as a small JPEG. When AI is off or fails, the app draws a themed
monogram in the browser, so a shop never shows a broken image.
"""

from __future__ import annotations

import asyncio
import io
import time
from typing import Any, Protocol

import anyio
import structlog
from fastapi import HTTPException, Request
from PIL import Image, ImageOps

from .limits import Bucket, RateLimiter
from .settings import Settings

log = structlog.get_logger()

ICON_SIDE = 512
DAY = 86_400

PROMPT = (
    "Design a square app icon for a small local business. Name: {name}. Kind: {kind}. "
    "Region: {region}. One bold, simple symbol that suits this kind of shop and region, flat "
    "friendly shapes, two or three warm colours, the colour fills the whole square edge to edge. "
    "No text, no letters, no frame, no border, no rounded-corner mockup, no people's faces."
)


class IconGenerator(Protocol):
    async def generate(self, name: str, kind: str, region: str) -> bytes | None:
        """Raw image bytes, or None when no picture could be made."""
        ...


class GeminiIconGenerator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: Any = None

    @property
    def available(self) -> bool:
        return self.settings.shop_icon_ai and self.settings.coach_mode == "gemini"

    async def generate(self, name: str, kind: str, region: str) -> bytes | None:
        if not self.available:
            return None
        from google import genai
        from google.genai import types

        if self._client is None:
            self._client = (
                genai.Client(
                    vertexai=True,
                    project=self.settings.google_cloud_project,
                    location=self.settings.shop_icon_location,
                )
                if self.settings.gemini_backend == "vertex"
                else genai.Client(api_key=self.settings.google_api_key.get_secret_value())
            )
        prompt = PROMPT.format(
            name=name[:80] or "A small shop", kind=kind[:60] or "shop", region=region[:100] or "-"
        )
        try:
            async with asyncio.timeout(45):
                response = await self._client.aio.models.generate_content(
                    model=self.settings.shop_icon_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                        image_config=types.ImageConfig(aspect_ratio="1:1"),
                    ),
                )
        except Exception as error:  # noqa: BLE001 - any failure means "use the monogram"
            log.warning("icon_generation_failed", error=str(error)[:300])
            return None
        for candidate in response.candidates or []:
            for part in getattr(candidate.content, "parts", None) or []:
                if part.inline_data and part.inline_data.data:
                    return bytes(part.inline_data.data)
        return None


def square_icon(image_bytes: bytes) -> bytes:
    """Centre-crop to a square and shrink to ICON_SIDE; the output is always a clean JPEG."""
    with Image.open(io.BytesIO(image_bytes)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    image = ImageOps.fit(image, (ICON_SIDE, ICON_SIDE), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=88)
    return output.getvalue()


async def take_generation(request: Request, business_id: str) -> None:
    """Cost guard: at most `shop_icon_daily_limit` AI icons per shop per UTC day.

    Enforced even when general rate limits are switched off (as in local previews)."""
    settings: Settings = request.app.state.v1_settings
    bucket = Bucket("icon:generate", business_id, settings.shop_icon_daily_limit, DAY)
    limiter: RateLimiter = request.app.state.rate_limiter
    now = time.time()
    try:
        retry = await anyio.to_thread.run_sync(limiter.take, [bucket], now)
    except Exception:  # noqa: BLE001 - when the counter is down, spend nothing
        log.warning("icon_limit_store_failed")
        retry = 60
    if retry:
        raise HTTPException(429, "ICON_DAILY_LIMIT", headers={"Retry-After": str(retry)})
