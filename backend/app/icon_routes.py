"""Shop icon endpoints. See icons.py for the flow."""

import asyncio
import contextlib
from typing import Any
from uuid import uuid4

import anyio
from fastapi import APIRouter, HTTPException, Request, Response

from .icons import GeminiIconGenerator, IconGenerator, square_icon, take_generation
from .limits import enforce_limits
from .merchant_routes import PHOTO_ID, PHOTO_TYPES, consented_owner, jpeg, store
from .photos import PhotoPipeline, PhotoRejected

router = APIRouter(prefix="/api/v1", tags=["shop icon"])


def generator(request: Request) -> IconGenerator:
    found = getattr(request.app.state, "icon_generator", None)
    if found is None:
        found = request.app.state.icon_generator = GeminiIconGenerator(
            request.app.state.v1_settings
        )
    return found


def ai_available(request: Request) -> bool:
    return bool(getattr(generator(request), "available", True))


async def owned_shop(request: Request, business_id: str) -> tuple[str, dict[str, Any]]:
    uid = await consented_owner(request)
    context = await anyio.to_thread.run_sync(store(request).context, uid, business_id)
    if not context["business"]:
        raise HTTPException(404, "Business not found.")
    return uid, context["business"]


async def keep_icon(
    request: Request, uid: str, business: dict[str, Any], picture: bytes, source: str
) -> dict[str, Any]:
    """Moderate, square, store and attach the picture; the old icon is removed afterwards."""
    pipeline: PhotoPipeline = request.app.state.photos
    try:
        clean = await pipeline.gallery_photo(picture)
    except PhotoRejected as rejected:
        raise HTTPException(rejected.status, rejected.code) from None
    try:
        square = await anyio.to_thread.run_sync(square_icon, clean)
    except Exception:  # noqa: BLE001 - a picture that cannot be cropped is not an icon
        raise HTTPException(415, "UNREADABLE_IMAGE") from None
    icon_id = str(uuid4())
    business_id = business["id"]
    await anyio.to_thread.run_sync(pipeline.save_gallery_sync, business_id, icon_id, square)
    await anyio.to_thread.run_sync(store(request).set_icon, uid, business_id, icon_id)
    if business.get("icon"):
        with contextlib.suppress(Exception):
            await anyio.to_thread.run_sync(
                pipeline.delete_gallery_sync, business_id, business["icon"]
            )
    return {"icon": icon_id, "source": source}


@router.get("/businesses/{business_id}/icon")
async def icon_status(business_id: str, request: Request) -> dict[str, Any]:
    _, business = await owned_shop(request, business_id)
    return {"icon": business.get("icon"), "ai_available": ai_available(request)}


@router.post("/businesses/{business_id}/icon/generate")
async def generate_icon(business_id: str, request: Request) -> dict[str, Any]:
    """Make my icon: name + kind + region in, a square icon out. A failure keeps the old icon
    and tells the app to show the monogram (ICON_UNAVAILABLE); it still counts as one try."""
    uid, business = await owned_shop(request, business_id)
    if not ai_available(request):
        raise HTTPException(503, "ICON_AI_OFF")
    await take_generation(request, business_id)
    fields = business["fields"]
    picture = await generator(request).generate(
        fields.get("name", ""), fields.get("category", ""), fields.get("location", "")
    )
    if not picture:
        raise HTTPException(503, "ICON_UNAVAILABLE")
    return await keep_icon(request, uid, {**business, "id": business_id}, picture, "ai")


@router.put("/businesses/{business_id}/icon")
async def upload_icon(business_id: str, request: Request) -> dict[str, Any]:
    """Use a photo as the icon. The app crops to a square first; the server crops again."""
    uid, business = await owned_shop(request, business_id)
    await enforce_limits(request, [("icon", uid)])
    if request.headers.get("content-type", "").split(";")[0] not in PHOTO_TYPES:
        raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
    limit = request.app.state.v1_settings.max_photo_bytes
    buffer = bytearray()
    try:
        async with asyncio.timeout(120):
            async for chunk in request.stream():
                if len(buffer) + len(chunk) > limit:
                    raise HTTPException(413, "Photo is too large.")
                buffer.extend(chunk)
        return await keep_icon(
            request, uid, {**business, "id": business_id}, bytes(buffer), "upload"
        )
    finally:
        buffer.clear()


@router.post("/businesses/{business_id}/icon/from-gallery/{photo_id}")
async def icon_from_gallery(business_id: str, photo_id: str, request: Request) -> dict[str, Any]:
    """Use this photo as my icon, for a photo already in the shop's gallery."""
    uid, business = await owned_shop(request, business_id)
    await enforce_limits(request, [("icon", uid)])
    if photo_id not in (business.get("gallery") or []):
        raise HTTPException(404, "Photo not found.")
    pipeline: PhotoPipeline = request.app.state.photos
    image = await anyio.to_thread.run_sync(pipeline.load_gallery_sync, business_id, photo_id)
    if image is None:
        raise HTTPException(404, "Photo not found.")
    return await keep_icon(request, uid, {**business, "id": business_id}, image, "gallery")


@router.delete("/businesses/{business_id}/icon")
async def remove_icon(business_id: str, request: Request) -> dict[str, Any]:
    uid, business = await owned_shop(request, business_id)
    if business.get("icon"):
        await anyio.to_thread.run_sync(store(request).set_icon, uid, business_id, None)
        pipeline: PhotoPipeline = request.app.state.photos
        with contextlib.suppress(Exception):
            await anyio.to_thread.run_sync(
                pipeline.delete_gallery_sync, business_id, business["icon"]
            )
    return {"icon": None}


@router.get("/businesses/{business_id}/icon/{icon_id}.jpg")
async def owner_icon(business_id: str, icon_id: str, request: Request) -> Response:
    _, business = await owned_shop(request, business_id)
    if icon_id != business.get("icon"):
        raise HTTPException(404, "Icon not found.")
    pipeline: PhotoPipeline = request.app.state.photos
    image = await anyio.to_thread.run_sync(pipeline.load_gallery_sync, business_id, icon_id)
    return jpeg(image, "private, max-age=3600")


@router.get("/public/shops/{business_id}/icon/{icon_id}.jpg")
async def public_icon(business_id: str, icon_id: str, request: Request) -> Response:
    """Only the current icon of a shared shop. IDs are never reused, so caching is safe."""
    if not PHOTO_ID.fullmatch(icon_id):
        raise HTTPException(404, "Icon not found.")
    shop = await anyio.to_thread.run_sync(store(request).public_shop, business_id)
    if shop is None or icon_id != shop.get("icon"):
        raise HTTPException(404, "Icon not found.")
    pipeline: PhotoPipeline = request.app.state.photos
    image = await anyio.to_thread.run_sync(pipeline.load_gallery_sync, business_id, icon_id)
    return jpeg(image, "public, max-age=86400, immutable")
