"""Owner photo intake: sanitize -> SafeSearch -> Gemini business check/extraction -> storage.

Nothing is stored unless the photo passes moderation and is recognised as business material.
Extraction only prepares draft fields; owners still approve an exact proposal before saving.
"""

from __future__ import annotations

import hashlib
import io
import warnings
from typing import Any, Literal
from uuid import uuid4

import anyio
import structlog
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

from .settings import Settings

log = structlog.get_logger()

MAX_SIDE = 1600
MAX_PIXELS = 40_000_000
# Fixture moderation only: an image exactly this wide is treated as explicit content.
FIXTURE_BLOCK_WIDTH = 13
# SafeSearch likelihood: 0 unknown, 1 very unlikely, 2 unlikely, 3 possible, 4 likely, 5 very.
BLOCK_AT = {"adult": 3, "racy": 4, "violence": 4}


class PhotoRejected(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


class ExtractedBusiness(BaseModel):
    name: str = ""
    category: str = ""
    location: str = ""
    hours: str = ""
    phone: str = ""


class ExtractedProduct(BaseModel):
    name: str
    price: float | None = Field(default=None, ge=0, le=100_000_000)
    unit: str = "item"


class PhotoExtraction(BaseModel):
    photo_kind: Literal["signboard", "menu", "price_list", "product", "storefront", "other"]
    business: ExtractedBusiness = Field(default_factory=ExtractedBusiness)
    products: list[ExtractedProduct] = Field(default_factory=list, max_length=200)
    uncertain: list[str] = Field(default_factory=list, max_length=20)


PROMPT = """You review a photo sent by a small-business owner for their own business listing.
Classify photo_kind. Use "other" for anything that is not a signboard, menu, price list,
product or storefront (for example selfies, people, documents, screenshots or scenery).
Copy only text that is clearly visible; never guess. Keep the original language/script.
Prices: a plain number in the local currency, only when printed next to the item.
List every field or item you are unsure about in "uncertain"."""


def sanitize(data: bytes) -> bytes:
    """Decode and re-encode as JPEG: drops EXIF/GPS metadata and rejects non-images."""
    if not (
        data.startswith(b"\xff\xd8\xff")
        or data.startswith(b"\x89PNG\r\n\x1a\n")
        or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")
    ):
        raise PhotoRejected(415, "UNSUPPORTED_IMAGE")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            Image.MAX_IMAGE_PIXELS = MAX_PIXELS
            with Image.open(io.BytesIO(data)) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
    except (OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise PhotoRejected(415, "UNREADABLE_IMAGE") from None
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=85)
    return output.getvalue()


class PhotoPipeline:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._vision: Any = None
        self._bucket: Any = None
        self._genai: Any = None

    # --- moderation -------------------------------------------------------------------
    def moderate_sync(self, image: bytes) -> dict[str, int]:
        if self.settings.moderation_mode == "fixture":
            with Image.open(io.BytesIO(image)) as opened:
                explicit = opened.width == FIXTURE_BLOCK_WIDTH
            return {"adult": 5 if explicit else 1, "racy": 1, "violence": 1}
        from google.cloud import vision

        if self._vision is None:
            self._vision = vision.ImageAnnotatorClient()
        response = self._vision.safe_search_detection(image=vision.Image(content=image))
        if response.error.message:
            raise PhotoRejected(503, "MODERATION_UNAVAILABLE")
        found = response.safe_search_annotation
        return {"adult": found.adult, "racy": found.racy, "violence": found.violence}

    @staticmethod
    def blocked(scores: dict[str, int]) -> bool:
        return any(int(scores.get(name, 0)) >= level for name, level in BLOCK_AT.items())

    # --- extraction -------------------------------------------------------------------
    async def extract(self, image: bytes) -> PhotoExtraction:
        if self.settings.coach_mode != "gemini":
            return PhotoExtraction(
                photo_kind="signboard",
                business=ExtractedBusiness(name="Offline Fixture Tea Stall", category="Tea stall"),
                products=[ExtractedProduct(name="Chai", price=15, unit="cup")],
                uncertain=["Offline fixture: no model read this photo."],
            )
        from google import genai
        from google.genai import types

        if self._genai is None:
            self._genai = (
                genai.Client(
                    vertexai=True,
                    project=self.settings.google_cloud_project,
                    location=self.settings.google_cloud_location,
                )
                if self.settings.gemini_backend == "vertex"
                else genai.Client(api_key=self.settings.google_api_key.get_secret_value())
            )
        response = await self._genai.aio.models.generate_content(
            model=self.settings.google_text_model,
            contents=[types.Part.from_bytes(data=image, mime_type="image/jpeg"), PROMPT],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PhotoExtraction,
                temperature=0,
                max_output_tokens=16000,
            ),
        )
        feedback = getattr(response, "prompt_feedback", None)
        candidate = (response.candidates or [None])[0]
        reason = str(getattr(candidate, "finish_reason", "") or "")
        if (feedback and feedback.block_reason) or "SAFETY" in reason or "PROHIBITED" in reason:
            raise PhotoRejected(422, "PHOTO_BLOCKED")
        if not isinstance(response.parsed, PhotoExtraction):
            raise PhotoRejected(503, "EXTRACTION_UNAVAILABLE")
        return response.parsed

    # --- storage ----------------------------------------------------------------------
    def store_sync(self, uid: str, bid: str | None, image: bytes) -> str | None:
        if not self.settings.media_bucket:
            return None
        from google.cloud import storage  # type: ignore[attr-defined]

        if self._bucket is None:
            client = storage.Client(project=self.settings.google_cloud_project)
            self._bucket = client.bucket(self.settings.media_bucket)
        photo_id = str(uuid4())
        owner = hashlib.sha256(uid.encode()).hexdigest()
        blob = self._bucket.blob(f"approved/{owner}/{bid or 'unassigned'}/{photo_id}.jpg")
        blob.upload_from_string(image, content_type="image/jpeg")
        return photo_id

    def erase_owner_sync(self, uid: str) -> int:
        """Delete every stored photo for this owner; returns the number removed."""
        if not self.settings.media_bucket:
            return 0
        from google.cloud import storage  # type: ignore[attr-defined]

        if self._bucket is None:
            client = storage.Client(project=self.settings.google_cloud_project)
            self._bucket = client.bucket(self.settings.media_bucket)
        owner = hashlib.sha256(uid.encode()).hexdigest()
        blobs = list(self._bucket.list_blobs(prefix=f"approved/{owner}/"))
        for blob in blobs:
            blob.delete()
        return len(blobs)

    # --- pipeline ---------------------------------------------------------------------
    async def process(self, uid: str, bid: str | None, data: bytes) -> dict[str, Any]:
        image = await anyio.to_thread.run_sync(sanitize, data)
        scores = await anyio.to_thread.run_sync(self.moderate_sync, image)
        if self.blocked(scores):
            log.info("photo_rejected", code="EXPLICIT_CONTENT")
            raise PhotoRejected(422, "PHOTO_BLOCKED")
        extraction = await self.extract(image)
        if extraction.photo_kind == "other":
            log.info("photo_rejected", code="NOT_BUSINESS")
            raise PhotoRejected(422, "NOT_BUSINESS_PHOTO")
        photo_id = await anyio.to_thread.run_sync(self.store_sync, uid, bid, image)
        return {"photo_id": photo_id, "extraction": extraction}
