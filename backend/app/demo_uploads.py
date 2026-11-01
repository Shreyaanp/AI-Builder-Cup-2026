"""Menu photos, PDFs, spreadsheets, gallery photos and icons in the public demo (O-1, OB-248).

The demo never sends a visitor's file to a model (OB-155) and never keeps it. A menu file within
the real limits gets one fixed sample read, labelled as a sample, for the same "Check before
saving" review; a gallery photo or icon becomes one of the demo's own bundled sample pictures. A
file over the limits gets the same 413 the real route sends. Nothing leaves the sandbox store.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any

import anyio
from fastapi import HTTPException, Request

from .coordinator import MerchantContext, ProductInput, current, propose_products
from .imports import MAX_BYTES as MAX_IMPORT_BYTES
from .imports import MAX_MEDIA_BYTES as MAX_IMPORT_MEDIA_BYTES
from .ingestion import IMAGE_TYPES
from .merchant_routes import GALLERY_KINDS, GALLERY_LIMIT
from .tour_catalogue import TOUR_SHOPS
from .tour_media import photo_id

PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}
SAMPLE_NOTE = (
    "Sample read: the demo never reads your file. In your own shop, Chalkboard reads your real "
    "menu and you check it the same way."
)
# (name, price in rupees, unit, menu section): a short South Indian breakfast board.
SAMPLE_ITEMS = (
    ("Masala dosa", 60, "plate", "Breakfast"),
    ("Idli (2 pieces)", 40, "plate", "Breakfast"),
    ("Medu vada", 30, "plate", "Snacks"),
    ("Filter coffee", 25, "cup", "Drinks"),
)
_BIZ = r"^businesses/(?P<bid>[A-Za-z0-9_.-]{1,120})"
IMPORT_PATH = re.compile(rf"{_BIZ}/import$")
GALLERY_PATH = re.compile(rf"{_BIZ}/gallery$")
ICON_PATH = re.compile(rf"{_BIZ}/icon$")
ICON_FROM_GALLERY = re.compile(rf"{_BIZ}/icon/from-gallery/(?P<photo>[0-9a-f-]{{36}})$")


def is_upload(method: str, path: str) -> bool:
    if method == "PUT":
        return ICON_PATH.match(path) is not None
    return method == "POST" and (
        path in {"photos", "photos/classify"}
        or any(p.match(path) for p in (IMPORT_PATH, GALLERY_PATH, ICON_FROM_GALLERY))
    )


async def drain(request: Request, limit: int, too_large: str) -> None:
    """Read and drop the body, with the real route's size limit; nothing is kept."""
    size = 0
    async with asyncio.timeout(120):  # big phone photos on mobile data
        async for chunk in request.stream():
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, too_large)


def owned(entry: Any, bid: str | None) -> str:
    """The visitor's own shop or one of the demo chains they can switch to."""
    if not bid or bid not in {shop["id"] for shop in entry.store.list_businesses(entry.uid)}:
        raise HTTPException(403, "DEMO_NOT_SENT")
    return bid


def sample_pictures() -> list[str]:
    """The demo's own bundled artwork: an uploaded picture shows as one of these."""
    return [photo_id(shop) for shop in TOUR_SHOPS if shop.city == "bengaluru"]


def add_sample_photo(entry: Any, bid: str, kind: str) -> dict[str, Any]:
    chosen: dict[str, str] = {}

    def append(photos: list[str], kinds: dict[str, str]) -> tuple[list[str], dict[str, str]]:
        unused = [picture for picture in sample_pictures() if picture not in photos]
        if not unused or len(photos) >= GALLERY_LIMIT:
            raise HTTPException(409, "GALLERY_FULL")
        chosen["id"] = unused[0]
        return [*photos, unused[0]], {**kinds, unused[0]: kind}

    saved = entry.store.edit_gallery(entry.uid, bid, append)
    return {"gallery": saved, "photo_id": chosen["id"], "kind": kind, "sample": True}


def sample_proposal(entry: Any, bid: str) -> dict[str, Any]:
    ctx = MerchantContext(entry.store, entry.uid, bid, [])
    token = current.set(ctx)
    try:
        result = propose_products(
            [
                ProductInput(name=name, price=price, unit=unit, category=category)
                for name, price, unit, category in SAMPLE_ITEMS
            ]
        )
    finally:
        current.reset(token)
    if result.get("status") != "needs_review":
        raise HTTPException(422, "NO_PRICED_ITEMS")
    return ctx.proposals[result["proposal_id"]]


async def demo_upload(request: Request, entry: Any, path: str) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if path == "photos/classify":
        if content_type not in PHOTO_TYPES:
            raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
        await drain(request, request.app.state.v1_settings.max_photo_bytes, "Photo is too large.")
        return {"kind": "menu", "sample": True}
    if gallery := GALLERY_PATH.match(path):
        bid = await anyio.to_thread.run_sync(owned, entry, gallery["bid"])
        kind = request.query_params.get("kind", "other")
        if kind not in GALLERY_KINDS:
            raise HTTPException(422, "Unknown photo kind.")
        if content_type not in PHOTO_TYPES:
            raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
        await drain(request, request.app.state.v1_settings.max_photo_bytes, "Photo is too large.")
        return await anyio.to_thread.run_sync(add_sample_photo, entry, bid, kind)
    if picked := ICON_FROM_GALLERY.match(path):
        bid = await anyio.to_thread.run_sync(owned, entry, picked["bid"])
        await anyio.to_thread.run_sync(entry.store.set_icon, entry.uid, bid, picked["photo"])
        return {"icon": picked["photo"], "source": "gallery", "sample": True}
    if icon := ICON_PATH.match(path):
        bid = await anyio.to_thread.run_sync(owned, entry, icon["bid"])
        if content_type not in PHOTO_TYPES:
            raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
        await drain(request, request.app.state.v1_settings.max_photo_bytes, "Photo is too large.")
        picture = sample_pictures()[0]
        await anyio.to_thread.run_sync(entry.store.set_icon, entry.uid, bid, picture)
        return {"icon": picture, "source": "upload", "sample": True}
    if path == "photos":
        bid = await anyio.to_thread.run_sync(owned, entry, request.query_params.get("business_id"))
        if content_type not in PHOTO_TYPES:
            raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
        await drain(request, request.app.state.v1_settings.max_photo_bytes, "Photo is too large.")
        proposal = await anyio.to_thread.run_sync(sample_proposal, entry, bid)
        return {
            "status": "needs_review",
            "photo_id": "demo-sample",
            "photo_kind": "menu",
            "extraction": {
                "photo_kind": "menu",
                "products": [
                    {"name": name, "price": price, "unit": unit, "category": category}
                    for name, price, unit, category in SAMPLE_ITEMS
                ],
                "uncertain": [SAMPLE_NOTE],
            },
            "proposal": proposal,
            "pin_proposal": None,
            "google_publication": "not_connected",
            "sample": True,
        }
    match = IMPORT_PATH.match(path)
    if not match:
        raise HTTPException(403, "DEMO_NOT_SENT")
    bid = await anyio.to_thread.run_sync(owned, entry, match["bid"])
    media = content_type in IMAGE_TYPES | {"application/pdf"}
    await drain(request, MAX_IMPORT_MEDIA_BYTES if media else MAX_IMPORT_BYTES, "FILE_TOO_LARGE")
    proposal = await anyio.to_thread.run_sync(sample_proposal, entry, bid)
    return {
        "kind": "menu",
        "proposal": proposal,
        "items": len(SAMPLE_ITEMS),
        "skipped": 0,
        "flags": [],
        "sample": True,
        "sample_note": SAMPLE_NOTE,
    }
