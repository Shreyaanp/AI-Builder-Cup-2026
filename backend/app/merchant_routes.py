import asyncio
import contextlib
import re
import time
from typing import Any, cast
from uuid import UUID, uuid4

import anyio
import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from . import erasure
from .coordinator import MerchantContext, ProductInput, current, propose_products
from .discover import pin_fields, prepare_pin
from .imports import MAX_BYTES as MAX_IMPORT_BYTES
from .imports import MAX_MEDIA_BYTES as MAX_IMPORT_MEDIA_BYTES
from .imports import SAMPLE_ROWS, ImportRejected, menu_items, parse_table, sales_summary
from .ingestion import IMAGE_TYPES, alias, as_table, clean, extract
from .limits import client_ip, enforce_limits
from .merchant import (
    Approval,
    AvailabilityRequest,
    BusinessFields,
    ConsentRequest,
    MerchantRepository,
    ProductFields,
    ProposalRequest,
    ShareRequest,
)
from .money import to_minor
from .photos import PhotoExtraction, PhotoPipeline, PhotoRejected, header_gps
from .product_categories import suggest_category
from .product_units import normalize_unit
from .region import new_shop_currency, shop_currency, shop_zone
from .sales import daily_sales
from .stock_alerts import StockAlertInput, StockAlertReceipt

# Bump when the Terms or Privacy Notice text changes; owners must accept again.
LEGAL_VERSION = "2026-10-14"

PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


def store(request: Request) -> MerchantRepository:
    service = getattr(request.app.state, "merchant", None)
    if service is None:
        raise HTTPException(503, "Local V1 is not enabled.")
    return cast(MerchantRepository, service)


async def owner(request: Request) -> str:
    return str((await request.app.state.services.identity.require(request)).uid)


async def consented_owner(request: Request) -> str:
    """Business changes and uploads require acceptance of the current Terms and Privacy Notice."""
    uid = await owner(request)
    record = await anyio.to_thread.run_sync(store(request).consent, uid)
    if not record or record.get("version") != LEGAL_VERSION:
        raise HTTPException(428, "CONSENT_REQUIRED")
    return uid


log = structlog.get_logger()
router = APIRouter(prefix="/api/v1")


@router.get("/me")
async def me(request: Request, background: BackgroundTasks) -> dict[str, Any]:
    uid = await owner(request)
    await enforce_limits(request, [("me", client_ip(request))])
    record = await anyio.to_thread.run_sync(store(request).consent, uid)
    left = ((await erasure.pending(request, uid)) or {}).get("steps", {})
    if left:
        # An earlier "Delete all my data" did not finish: retry it quietly in the background.
        background.add_task(erasure.retry_quietly, request, uid, list(left))
    return {
        "legal_version": LEGAL_VERSION,
        "consent": record,
        "consent_current": bool(record and record.get("version") == LEGAL_VERSION),
        "erase_pending": [step for step in erasure.STEPS if step in left],
    }


@router.post("/consent")
async def consent(body: ConsentRequest, request: Request) -> dict[str, Any]:
    uid = await owner(request)
    await enforce_limits(request, [("consent", client_ip(request))])
    if body.version != LEGAL_VERSION or not (body.terms and body.privacy):
        raise HTTPException(422, "Accept the current Terms and Privacy Notice to continue.")
    return await anyio.to_thread.run_sync(store(request).record_consent, uid, body.version)


@router.delete("/me/data")
async def erase(request: Request) -> dict[str, Any]:
    """Erase everything this owner stored: records, memory, conversations, photos, face data.

    Each step runs on its own; `status` is "erased", or "partial" with the `pending` steps that
    will be retried (on Try again and on the next visit) instead of a bare 500.
    """
    uid = await owner(request)
    return await erasure.erase(request, uid)


@router.get("/businesses")
async def businesses(request: Request) -> list[dict[str, Any]]:
    uid = await owner(request)
    return await anyio.to_thread.run_sync(store(request).list_businesses, uid)


@router.get("/businesses/{business_id}/inventory")
async def inventory(business_id: str, request: Request) -> list[dict[str, Any]]:
    uid = await owner(request)
    return await anyio.to_thread.run_sync(store(request).inventory, uid, business_id)


@router.post("/proposals")
async def propose(body: ProposalRequest, request: Request) -> dict[str, Any]:
    uid = await consented_owner(request)
    await enforce_limits(request, [("proposal", uid)])
    if body.business and body.business_id:
        # Saved prices are minor units of the saved currency, so edits keep it.
        context = await anyio.to_thread.run_sync(store(request).context, uid, body.business_id)
        saved = (context["business"] or {}).get("fields", {}).get("currency")
        body.business.currency = saved or shop_currency((context["business"] or {}).get("fields"))
    await prepare_pin(body, store(request), uid, request.app.state.maps)
    # Every item gets a category; the owner sees the suggestion in the review before saving.
    for product in body.products:
        if not product.category:
            product.category = suggest_category(product.name)
    return await anyio.to_thread.run_sync(store(request).propose, uid, body)


@router.post("/businesses/{business_id}/sort-menu")
async def sort_menu(business_id: str, request: Request) -> dict[str, Any]:
    """ "Sort my menu": a category for every uncategorised item, sealed for owner review.

    Nothing changes until the owner confirms the proposal; prices, units and stock stay as saved.
    """
    uid = await consented_owner(request)
    await enforce_limits(request, [("proposal", uid)])
    service = store(request)
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    business = context["business"]
    if not business:
        raise HTTPException(404, "Business not found.")
    unsorted = [item for item in context["inventory"] if not item.get("category")]
    if not unsorted:
        raise HTTPException(422, "NOTHING_TO_SORT")
    sections = await request.app.state.column_mapper.categorise(
        [item["name"] for item in unsorted], business["fields"].get("category", "")
    )
    allowed = ProductFields.model_fields
    products = [
        ProductFields.model_validate(
            {key: value for key, value in item.items() if key in allowed} | {"category": section}
        )
        for item, section in zip(unsorted, sections, strict=True)
    ]
    return await anyio.to_thread.run_sync(
        service.propose,
        uid,
        ProposalRequest(
            kind="inventory",
            business_id=business_id,
            revision=business["revision"],
            products=products,
        ),
    )


@router.post("/proposals/{proposal_id}/approve")
async def approve(
    proposal_id: str, body: Approval, request: Request, background: BackgroundTasks
) -> dict[str, Any]:
    uid = await consented_owner(request)
    started = time.perf_counter()
    receipt = await anyio.to_thread.run_sync(store(request).commit, uid, proposal_id, body.digest)
    log.info("proposal_save_ms", save=round((time.perf_counter() - started) * 1000))
    from .trust_routes import scan_after_change

    if receipt.get("business_id"):
        scan_after_change(request, background, receipt["business_id"])
    return receipt


@router.post("/businesses/{business_id}/update")
async def update(
    business_id: str,
    body: BusinessFields,
    request: Request,
    revision: int = 0,
    geocode_confirmed: bool = False,
) -> dict[str, Any]:
    uid = await consented_owner(request)
    await enforce_limits(request, [("proposal", uid)])
    proposal = ProposalRequest(
        kind="business",
        business_id=business_id,
        revision=revision,
        business=body,
        geocode_confirmed=geocode_confirmed,
    )
    await prepare_pin(proposal, store(request), uid, request.app.state.maps)
    return await anyio.to_thread.run_sync(store(request).propose, uid, proposal)


@router.post("/businesses/{business_id}/inventory/{product_id}/availability")
async def availability(
    business_id: str, product_id: str, body: AvailabilityRequest, request: Request
) -> dict[str, Any]:
    """The owner's own sold-out switch: an immediate, explicit action (no AI involved)."""
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(
        store(request).set_availability, uid, business_id, product_id, body.available
    )


@router.post("/businesses/{business_id}/share")
async def share(
    business_id: str, body: ShareRequest, request: Request, background: BackgroundTasks
) -> dict[str, Any]:
    uid = await consented_owner(request)
    shared = await anyio.to_thread.run_sync(store(request).share, uid, business_id, body.public)
    from .trust_routes import scan_after_change

    scan_after_change(request, background, business_id)
    return shared


@router.get("/public/shops/{business_id}")
async def public_shop(
    business_id: str,
    request: Request,
    lang: str = Query(
        default="en", max_length=16, pattern=r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$"
    ),
) -> dict[str, Any]:
    """Customer page data. No sign-in; only shops the owner chose to share are visible.

    Responses are not cached (boundary middleware), so a sold-out change shows immediately.
    """
    shop = await anyio.to_thread.run_sync(store(request).public_shop, business_id)
    if shop is None:
        raise HTTPException(404, "This shop page is not available.")
    # Display-only status uses the same conservative parser/timezone as discovery.
    from .discover import open_now
    from .shop_today import count

    # A daily total for the owner's Today page; counting never blocks the customer page.
    with contextlib.suppress(Exception):
        await anyio.to_thread.run_sync(count, store(request), business_id, "views", shop_zone(shop))
    shop["open_now"] = open_now(
        shop["hours"],
        shop_zone(shop),
        weekly_hours=shop.get("weekly_hours"),
        closed_on=shop.get("closed_on"),
    )
    from . import trust

    owners = await anyio.to_thread.run_sync(store(request).owners, business_id)
    # Only whether a check passed and when: never who, or any review about the shop.
    verified = await anyio.to_thread.run_sync(trust.verified_owner, trust.docs(request), owners)
    if verified:
        shop["verified_owner"] = verified
    # Categories, sections and demo stories in the customer's language (cached per shop).
    translator = getattr(request.app.state, "shop_translator", None)
    return await translator.localize_shop(shop, lang) if translator else shop


@router.post("/public/shops/{business_id}/stock-alerts")
async def subscribe_stock(
    business_id: str, body: StockAlertInput, request: Request
) -> StockAlertReceipt:
    await enforce_limits(
        request, [("stock:ip", client_ip(request)), ("stock:shop", business_id)], anonymous=True
    )
    return await anyio.to_thread.run_sync(store(request).subscribe_stock, business_id, body)


@router.get("/public/shops/{business_id}/stock-alerts")
async def stock_alerts(business_id: str, device_id: UUID, request: Request) -> list[dict[str, Any]]:
    await enforce_limits(request, [("stock:read", client_ip(request))], anonymous=True)
    return await anyio.to_thread.run_sync(store(request).stock_alerts, business_id, str(device_id))


@router.post("/photos/classify")
async def classify_photo(request: Request) -> dict[str, str]:
    """What a chat photo shows; nothing is stored or saved. The app confirms with the owner."""
    uid = await consented_owner(request)
    await enforce_limits(request, [("photo", uid)])
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
        try:
            kind = await request.app.state.photos.classify_upload(bytes(buffer))
        except PhotoRejected as rejected:
            raise HTTPException(rejected.status, rejected.code) from None
    finally:
        buffer.clear()
    return {"kind": kind}


@router.post("/photos")
async def photo(
    request: Request,
    business_id: str | None = None,
    currency: str | None = None,
    language: str = Query("en", max_length=16),
) -> dict[str, Any]:
    """``currency`` (ISO 4217) applies to a brand-new shop; existing shops keep their own.
    ``language`` is the owner's app language for the notes about what was unclear."""
    uid = await consented_owner(request)
    await enforce_limits(request, [("photo", uid)])
    service = store(request)
    pipeline: PhotoPipeline = request.app.state.photos
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    if request.headers.get("content-type", "").split(";")[0] not in PHOTO_TYPES:
        raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
    limit = request.app.state.v1_settings.max_photo_bytes
    buffer = bytearray()
    received = time.perf_counter()
    try:
        async with asyncio.timeout(120):  # big phone photos on mobile data
            async for chunk in request.stream():
                if len(buffer) + len(chunk) > limit:
                    raise HTTPException(413, "Photo is too large.")
                buffer.extend(chunk)
        received = time.perf_counter() - received
        try:
            outcome = await pipeline.process(uid, business_id, bytes(buffer), language)
        except PhotoRejected as rejected:
            raise HTTPException(rejected.status, rejected.code) from None
    finally:
        buffer.clear()
    log.info("photo_request_ms", receive=round(received * 1000))
    extraction: PhotoExtraction = outcome["extraction"]
    found = extraction.business
    business = context["business"]
    currency = (
        shop_currency(business["fields"])
        if business
        else (currency or "").upper()
        if re.fullmatch(r"[A-Za-z]{3}", currency or "")
        else new_shop_currency(None, None)
    )
    products = [
        ProductFields(
            name=p.name.strip()[:180],
            category=suggest_category(p.name, p.category),
            price=to_minor(p.price or 0, currency),
            unit=normalize_unit(p.unit),
        )
        for p in extraction.products
        if p.price is not None and p.name.strip()
    ]
    # The photo's own location (read server-side from its EXIF) can become the shop's pin.
    # It is only ever proposed: the owner sees the pin in the review sheet before saving.
    # A phone that resized the photo in the browser lost its EXIF, so it sends the location itself.
    gps = outcome.get("gps") or header_gps(request.headers.get("x-photo-gps"))
    pin = pin_fields(await request.app.state.maps.reverse(*gps)) if gps else {}
    proposal = None
    if business is None and found.name.strip():
        # A new shop and its menu are reviewed together in one sheet.
        request_body = ProposalRequest(
            kind="business",
            business=BusinessFields(
                name=found.name.strip()[:180],
                category=found.category[:180],
                location=(found.location or (str(pin["pin_label"]) if pin.get("place_id") else ""))[
                    :300
                ],
                hours=found.hours[:180],
                phone=found.phone[:40],
                currency=currency,
                **pin,
            ),
            products=products,
        )
        proposal = await anyio.to_thread.run_sync(service.propose, uid, request_body)
    elif business is not None and not products and pin and business["fields"].get("lat") is None:
        # A storefront photo for a shop with no pin yet: propose just the pin.
        allowed = BusinessFields.model_fields
        fields = {k: v for k, v in business["fields"].items() if k in allowed} | pin
        if not fields.get("location") and pin.get("place_id"):
            fields["location"] = pin["pin_label"][:300]
        request_body = ProposalRequest(
            kind="business",
            business_id=business["id"],
            revision=business["revision"],
            business=BusinessFields.model_validate(fields),
        )
        proposal = await anyio.to_thread.run_sync(service.propose, uid, request_body)
    elif business is not None and products:
        # The coach photo entry point uses the same single bulk-review tool as chat.
        def propose_menu() -> dict[str, Any]:
            ctx = MerchantContext(service, uid, business["id"], [])
            token = current.set(ctx)
            try:
                saved = {p["name"]: p for p in context["inventory"]}
                result = propose_products(
                    [
                        ProductInput(
                            name=name,
                            price=p.price,
                            unit=p.unit,
                            available=saved.get(name, {}).get("available", True),
                            # A new item takes the section read from the board; a saved item
                            # keeps its own.
                            category=None
                            if name in saved
                            else suggest_category(p.name, p.category),
                        )
                        for p in extraction.products
                        if p.price is not None and p.name.strip()
                        for name, _ in [alias(p.name, list(saved))]
                    ]
                )
                if result["status"] != "needs_review":
                    raise HTTPException(422, "NO_PRICED_ITEMS")
                return ctx.proposals[result["proposal_id"]]
            finally:
                current.reset(token)

        proposal = await anyio.to_thread.run_sync(propose_menu)
    pin_proposal = None
    saved_fields = business["fields"] if business is not None else {}
    # A photo's precise GPS is offered when the shop has no pin or only an approximate demo pin.
    unpinned = saved_fields.get("lat") is None or bool(saved_fields.get("pin_demo"))
    if business is not None and products and pin and unpinned:
        # Linked to this photo's menu review, but sealed/approved independently. Approving
        # either makes the other stale; the owner must explicitly review it again.
        allowed = BusinessFields.model_fields
        fields = {k: v for k, v in business["fields"].items() if k in allowed} | pin
        pin_proposal = await anyio.to_thread.run_sync(
            service.propose,
            uid,
            ProposalRequest(
                kind="business",
                business_id=business["id"],
                revision=business["revision"],
                business=BusinessFields.model_validate(fields),
            ),
        )
    return {
        "status": "needs_review" if proposal else "nothing_to_propose",
        "photo_id": outcome["photo_id"],
        "photo_kind": extraction.photo_kind,
        "extraction": extraction.model_dump(),
        "proposal": proposal,
        "pin_proposal": pin_proposal,
        "google_publication": "not_connected",
    }


@router.post("/businesses/{business_id}/import")
async def import_table(business_id: str, request: Request) -> dict[str, Any]:
    """Menu or sales export from any POS or spreadsheet (CSV / Excel), mapped by AI.

    Menu and sales exports are sealed for exact owner approval; neither is saved on upload.
    """
    uid = await consented_owner(request)
    await enforce_limits(request, [("import", uid)])
    service = store(request)
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    business = context["business"]
    if not business:
        raise HTTPException(404, "Business not found.")
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    media = content_type in IMAGE_TYPES | {"application/pdf"}
    limit = MAX_IMPORT_MEDIA_BYTES if media else MAX_IMPORT_BYTES
    buffer = bytearray()
    try:
        # Big phone photos on mobile data need time to arrive.
        async with asyncio.timeout(120):
            async for chunk in request.stream():
                if len(buffer) + len(chunk) > limit:
                    raise HTTPException(413, "FILE_TOO_LARGE")
                buffer.extend(chunk)
        try:
            mapper = request.app.state.column_mapper
            if content_type in IMAGE_TYPES | {"application/pdf", "text/plain"}:
                # Room for one retry of a slow read (OB-194); the app waits longer than this.
                async with asyncio.timeout(100):
                    extracted = await extract(
                        mapper,
                        request.app.state.photos,
                        bytes(buffer),
                        content_type,
                        str(business["fields"].get("name") or ""),
                    )
                headers, rows, mapping, low_confidence = as_table(extracted)
            else:
                headers, rows = await anyio.to_thread.run_sync(
                    parse_table, bytes(buffer), content_type
                )
                mapping = await mapper.map(headers, rows[:SAMPLE_ROWS])
                low_confidence = []
            rows, flags, dropped = clean(rows, mapping, context["inventory"], low_confidence)
        except (ImportRejected, PhotoRejected) as rejected:
            raise HTTPException(rejected.status, rejected.code) from None
        except TimeoutError:
            raise HTTPException(504, "EXTRACTION_TIMEOUT") from None
    finally:
        buffer.clear()
    if mapping.name is None:
        raise HTTPException(422, "NO_ITEM_COLUMN")
    if mapping.kind == "sales":
        currency = shop_currency(business["fields"])
        aggregates = daily_sales(rows, mapping, currency)
        proposal = await anyio.to_thread.run_sync(
            service.prepare_sales, uid, business_id, aggregates
        )
        return {
            "kind": "sales",
            "headers": headers,
            "mapping": mapping.model_dump(),
            "summary": sales_summary(rows, mapping),
            "saved": False,
            "import_id": proposal["id"],
            "digest": proposal["digest"],
            "expires": proposal["expires"],
            "sales": proposal["snapshot"]["sales"],
            "currency": currency,
            "flags": flags,
            "dropped": dropped,
        }
    items, skipped = menu_items(rows, mapping)
    if not items:
        raise HTTPException(422, "NO_PRICED_ITEMS")
    currency = shop_currency(business["fields"])
    saved = {(p["name"].casefold(), p["unit"].casefold()): p for p in context["inventory"]}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for saved_item in context["inventory"]:
        by_name.setdefault(saved_item["name"].casefold(), []).append(saved_item)
    matches = []
    for item in items:
        known = saved.get((item["name"].casefold(), item["unit"].casefold()))
        if not known and len(by_name.get(item["name"].casefold(), [])) == 1:
            # Exports often omit or rename units; one item with that name is the same item.
            known = by_name[item["name"].casefold()][0]
        matches.append(known)
    # New items with no category column are sorted into sections together. Saved items keep
    # their own (uncategorised ones are sorted with "Sort my menu").
    unsorted = [
        item["name"]
        for item, known in zip(items, matches, strict=True)
        if not item.get("category") and not known
    ]
    sections = dict(
        zip(
            unsorted,
            await request.app.state.column_mapper.categorise(
                unsorted, business["fields"].get("category", "")
            ),
            strict=True,
        )
    )
    products = []
    for item, known in zip(items, matches, strict=True):
        products.append(
            ProductFields(
                name=known["name"] if known else item["name"],
                price=to_minor(item["price"], currency),
                unit=known["unit"] if known else item["unit"],
                stock=item["stock"] if item["stock"] is not None else (known or {}).get("stock"),
                # An import never undoes an owner's sold-out switch.
                available=known.get("available", True) if known else True,
                category=item.get("category")
                or (
                    known.get("category", "")
                    if known
                    else sections.get(item["name"]) or suggest_category(item["name"])
                ),
            )
        )
    proposal = await anyio.to_thread.run_sync(
        service.propose,
        uid,
        ProposalRequest(
            kind="inventory",
            business_id=business_id,
            revision=business["revision"],
            products=products,
        ),
    )
    return {
        "kind": "menu",
        "status": "needs_review",
        "headers": headers,
        "mapping": mapping.model_dump(),
        "items": len(products),
        "skipped": skipped,
        "flags": flags,
        "dropped": dropped,
        "proposal": proposal,
    }


class SpeakRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=2_000)
    language: str = Field(default="en", max_length=10)


@router.post("/tts", response_model=None)
async def speak(body: SpeakRequest, request: Request) -> Response:
    """A coach reply as natural speech (MP3); 204 means use the phone's own voice."""
    uid = await consented_owner(request)
    await enforce_limits(request, [("tts", uid)])
    audio = await request.app.state.speech.speak(body.text, body.language)
    if audio is None:
        return Response(status_code=204)
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@router.delete("/businesses/{business_id}/notes/{note_id}")
async def delete_note(business_id: str, note_id: str, request: Request) -> dict[str, Any]:
    """Owner removes something the coach remembered."""
    uid = await consented_owner(request)
    service = store(request)
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    if not context["business"]:
        raise HTTPException(404, "Business not found.")
    notes = [n for n in context["business"].get("coach_notes") or [] if n["id"] != note_id]
    saved = await anyio.to_thread.run_sync(service.set_notes, uid, business_id, notes)
    return {"notes": saved}


# --- Shop gallery: photos the owner explicitly chose to show customers -------------------
GALLERY_LIMIT = 12
PHOTO_ID = re.compile(r"^[0-9a-f-]{36}$")
# What a gallery photo shows, so the owner sees them grouped. Unsorted photos are "other".
GALLERY_KINDS = ("storefront", "inside", "menu", "product", "other")


async def owned_gallery_kinds(
    request: Request, business_id: str
) -> tuple[str, list[str], dict[str, str]]:
    uid = await consented_owner(request)
    context = await anyio.to_thread.run_sync(store(request).context, uid, business_id)
    if not context["business"]:
        raise HTTPException(404, "Business not found.")
    business = context["business"]
    return uid, list(business.get("gallery") or []), dict(business.get("photo_kinds") or {})


async def owned_gallery(request: Request, business_id: str) -> tuple[str, list[str]]:
    uid, gallery, _ = await owned_gallery_kinds(request, business_id)
    return uid, gallery


@router.post("/businesses/{business_id}/gallery")
async def add_gallery_photo(
    business_id: str, request: Request, kind: str = "other"
) -> dict[str, Any]:
    """An explicit owner action ("Add photo"), like the sold-out switch: no AI, no proposal.
    The photo is re-encoded (metadata stripped) and safety-checked before it is kept. `kind`
    (shop front, inside, menu, product, other) is what the Photos sheet groups by."""
    if kind not in GALLERY_KINDS:
        raise HTTPException(422, "Unknown photo kind.")
    uid, gallery, kinds = await owned_gallery_kinds(request, business_id)
    await enforce_limits(request, [("gallery", uid)])
    if len(gallery) >= GALLERY_LIMIT:
        raise HTTPException(409, "GALLERY_FULL")
    if request.headers.get("content-type", "").split(";")[0] not in PHOTO_TYPES:
        raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
    limit = request.app.state.v1_settings.max_photo_bytes
    buffer = bytearray()
    try:
        async with asyncio.timeout(120):  # big phone photos on mobile data
            async for chunk in request.stream():
                if len(buffer) + len(chunk) > limit:
                    raise HTTPException(413, "Photo is too large.")
                buffer.extend(chunk)
        pipeline: PhotoPipeline = request.app.state.photos
        try:
            image = await pipeline.gallery_photo(bytes(buffer))
        except PhotoRejected as rejected:
            raise HTTPException(rejected.status, rejected.code) from None
    finally:
        buffer.clear()
    photo_id = str(uuid4())
    await anyio.to_thread.run_sync(pipeline.save_gallery_sync, business_id, photo_id, image)
    saved = await anyio.to_thread.run_sync(
        store(request).set_gallery,
        uid,
        business_id,
        [*gallery, photo_id],
        {**kinds, photo_id: kind},
    )
    return {"gallery": saved, "photo_id": photo_id, "kind": kind}


@router.delete("/businesses/{business_id}/gallery/{photo_id}")
async def remove_gallery_photo(business_id: str, photo_id: str, request: Request) -> dict[str, Any]:
    uid, gallery, kinds = await owned_gallery_kinds(request, business_id)
    if photo_id not in gallery:
        raise HTTPException(404, "Photo not found.")
    saved = await anyio.to_thread.run_sync(
        store(request).set_gallery,
        uid,
        business_id,
        [p for p in gallery if p != photo_id],
        {k: v for k, v in kinds.items() if k != photo_id},
    )
    pipeline: PhotoPipeline = request.app.state.photos
    await anyio.to_thread.run_sync(pipeline.delete_gallery_sync, business_id, photo_id)
    return {"gallery": saved}


@router.post("/businesses/{business_id}/gallery/{photo_id}/cover")
async def make_cover_photo(business_id: str, photo_id: str, request: Request) -> dict[str, Any]:
    """The first gallery photo is the one customers see on the shop page and in search."""
    uid, gallery = await owned_gallery(request, business_id)
    if photo_id not in gallery:
        raise HTTPException(404, "Photo not found.")
    saved = await anyio.to_thread.run_sync(
        store(request).set_gallery,
        uid,
        business_id,
        [photo_id, *(p for p in gallery if p != photo_id)],
    )
    return {"gallery": saved}


def jpeg(image: bytes | None, cache: str) -> Response:
    if image is None:
        raise HTTPException(404, "Photo not found.")
    return Response(content=image, media_type="image/jpeg", headers={"Cache-Control": cache})


@router.get("/businesses/{business_id}/gallery/{photo_id}.jpg")
async def owner_gallery_photo(business_id: str, photo_id: str, request: Request) -> Response:
    _, gallery = await owned_gallery(request, business_id)
    if photo_id not in gallery:
        raise HTTPException(404, "Photo not found.")
    pipeline: PhotoPipeline = request.app.state.photos
    image = await anyio.to_thread.run_sync(pipeline.load_gallery_sync, business_id, photo_id)
    return jpeg(image, "private, max-age=3600")


@router.get("/public/shops/{business_id}/photos/{photo_id}.jpg")
async def public_gallery_photo(business_id: str, photo_id: str, request: Request) -> Response:
    """Only photos in a shared shop's gallery. IDs are never reused, so caching is safe."""
    if not PHOTO_ID.fullmatch(photo_id):
        raise HTTPException(404, "Photo not found.")
    shop = await anyio.to_thread.run_sync(store(request).public_shop, business_id)
    if shop is None or photo_id not in (shop.get("gallery") or []):
        raise HTTPException(404, "Photo not found.")
    pipeline: PhotoPipeline = request.app.state.photos
    image = await anyio.to_thread.run_sync(pipeline.load_gallery_sync, business_id, photo_id)
    return jpeg(image, "public, max-age=86400, immutable")
