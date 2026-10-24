"""Menu photos, PDFs and spreadsheets in the public demo (O-1).

The demo never sends a visitor's file to a model (OB-155), so a file within the real limits gets
one fixed sample read, labelled as a sample, for the same "Check before saving" review. A file
over the limits gets the same 413 the real route sends. Nothing leaves the sandbox store.
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
IMPORT_PATH = re.compile(r"^businesses/(?P<bid>[A-Za-z0-9_.-]{1,120})/import$")


def is_upload(method: str, path: str) -> bool:
    return method == "POST" and (
        path in {"photos", "photos/classify"} or IMPORT_PATH.match(path) is not None
    )


async def drain(request: Request, limit: int, too_large: str) -> None:
    """Read and drop the body, with the real route's size limit; nothing is kept."""
    size = 0
    async with asyncio.timeout(120):  # big phone photos on mobile data
        async for chunk in request.stream():
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, too_large)


def sample_proposal(entry: Any) -> dict[str, Any]:
    ctx = MerchantContext(entry.store, entry.uid, entry.bid, [])
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
    if path == "photos":
        if request.query_params.get("business_id") != entry.bid:
            raise HTTPException(403, "DEMO_NOT_SENT")
        if content_type not in PHOTO_TYPES:
            raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
        await drain(request, request.app.state.v1_settings.max_photo_bytes, "Photo is too large.")
        proposal = await anyio.to_thread.run_sync(sample_proposal, entry)
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
    if not match or match["bid"] != entry.bid:
        raise HTTPException(403, "DEMO_NOT_SENT")
    media = content_type in IMAGE_TYPES | {"application/pdf"}
    await drain(request, MAX_IMPORT_MEDIA_BYTES if media else MAX_IMPORT_BYTES, "FILE_TOO_LARGE")
    proposal = await anyio.to_thread.run_sync(sample_proposal, entry)
    return {
        "kind": "menu",
        "proposal": proposal,
        "items": len(SAMPLE_ITEMS),
        "skipped": 0,
        "flags": [],
        "sample": True,
        "sample_note": SAMPLE_NOTE,
    }
