import asyncio
import re
from typing import Any, cast
from uuid import UUID

import anyio
import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from .coordinator import MerchantContext, ProductInput, current, propose_products
from .discover import prepare_pin
from .face_transport import worker_headers
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
from .money import DEFAULT_CURRENCY, to_minor
from .photos import PhotoExtraction, PhotoPipeline, PhotoRejected
from .product_categories import suggest_category
from .sales import daily_sales
from .stock_alerts import StockAlertInput, StockAlertReceipt
from .streaming import APP_NAME
from .threads import thread_signals

# Bump when the Terms or Privacy Notice text changes; owners must accept again.
LEGAL_VERSION = "2026-10-14"

PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


class ChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    business_id: str
    consent: bool


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


router = APIRouter(prefix="/api/v1")


@router.get("/me")
async def me(request: Request) -> dict[str, Any]:
    uid = await owner(request)
    await enforce_limits(request, [("me", client_ip(request))])
    record = await anyio.to_thread.run_sync(store(request).consent, uid)
    return {
        "legal_version": LEGAL_VERSION,
        "consent": record,
        "consent_current": bool(record and record.get("version") == LEGAL_VERSION),
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
    """Erase everything this owner stored: records, memory, conversations, photos, face data."""
    uid = await owner(request)
    settings = request.app.state.v1_settings
    token = settings.face_worker_token.get_secret_value()
    if token:
        try:
            async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
                response = await client.delete(
                    settings.face_worker_url + "/template",
                    headers={"Authorization": "Bearer " + token, "X-Owner": uid},
                )
            if not response.is_success:
                raise HTTPException(503, "Face data deletion could not be confirmed. Retry.")
        except httpx.HTTPError as error:
            raise HTTPException(503, "Face data deletion could not be confirmed. Retry.") from error
    photos = await anyio.to_thread.run_sync(request.app.state.photos.erase_owner_sync, uid)
    businesses = await anyio.to_thread.run_sync(store(request).erase_owner, uid)
    for bid in businesses:
        thread_signals(request).wake(bid)
    if request.app.state.recall:
        await anyio.to_thread.run_sync(request.app.state.recall.forget, uid, businesses)
    runtime = request.app.state.services.runtime
    listing = await runtime.sessions.list_sessions(app_name=APP_NAME, user_id=uid)
    for session in listing.sessions:
        await runtime.sessions.delete_session(app_name=APP_NAME, user_id=uid, session_id=session.id)
    return {
        "status": "erased",
        "businesses": len(businesses),
        "photos": photos,
        "conversations": len(listing.sessions),
    }


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
        body.business.currency = saved or DEFAULT_CURRENCY
    await prepare_pin(body, store(request), uid, request.app.state.maps)
    return await anyio.to_thread.run_sync(store(request).propose, uid, body)


@router.post("/proposals/{proposal_id}/approve")
async def approve(proposal_id: str, body: Approval, request: Request) -> dict[str, Any]:
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(store(request).commit, uid, proposal_id, body.digest)


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
async def share(business_id: str, body: ShareRequest, request: Request) -> dict[str, Any]:
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(store(request).share, uid, business_id, body.public)


@router.get("/public/shops/{business_id}")
async def public_shop(business_id: str, request: Request) -> dict[str, Any]:
    """Customer page data. No sign-in; only shops the owner chose to share are visible.

    Responses are not cached (boundary middleware), so a sold-out change shows immediately.
    """
    shop = await anyio.to_thread.run_sync(store(request).public_shop, business_id)
    if shop is None:
        raise HTTPException(404, "This shop page is not available.")
    # Display-only status uses the same conservative parser/timezone as discovery.
    from .discover import open_now

    shop["open_now"] = open_now(
        shop["hours"], shop.get("timezone", "Asia/Singapore"), weekly_hours=shop.get("weekly_hours")
    )
    return shop


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


@router.post("/photos")
async def photo(
    request: Request, business_id: str | None = None, currency: str | None = None
) -> dict[str, Any]:
    """``currency`` (ISO 4217) applies to a brand-new shop; existing shops keep their own."""
    uid = await consented_owner(request)
    await enforce_limits(request, [("photo", uid)])
    service = store(request)
    pipeline: PhotoPipeline = request.app.state.photos
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
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
        try:
            outcome = await pipeline.process(uid, business_id, bytes(buffer))
        except PhotoRejected as rejected:
            raise HTTPException(rejected.status, rejected.code) from None
    finally:
        buffer.clear()
    extraction: PhotoExtraction = outcome["extraction"]
    found = extraction.business
    business = context["business"]
    currency = (
        business["fields"].get("currency", DEFAULT_CURRENCY)
        if business
        else (currency or "").upper()
        if re.fullmatch(r"[A-Za-z]{3}", currency or "")
        else DEFAULT_CURRENCY
    )
    products = [
        ProductFields(
            name=p.name.strip()[:180],
            category=suggest_category(p.name, p.category),
            price=to_minor(p.price or 0, currency),
            unit=(p.unit or "item").strip()[:40] or "item",
        )
        for p in extraction.products
        if p.price is not None and p.name.strip()
    ]
    # The photo's own location (read server-side from its EXIF) can become the shop's pin.
    # It is only ever proposed: the owner sees the pin in the review sheet before saving.
    gps = outcome.get("gps")
    pin = await request.app.state.maps.reverse(*gps) if gps else {}
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
    return {
        "status": "needs_review" if proposal else "nothing_to_propose",
        "photo_id": outcome["photo_id"],
        "photo_kind": extraction.photo_kind,
        "extraction": extraction.model_dump(),
        "proposal": proposal,
        "google_publication": "not_connected",
    }


@router.post("/face/challenges")
async def challenge(body: ChallengeRequest, request: Request) -> dict[str, Any]:
    uid = await consented_owner(request)
    if not body.consent:
        raise HTTPException(
            422, "Camera/biometric consent is required; your draft stays available."
        )
    return await anyio.to_thread.run_sync(store(request).challenge, uid, body.business_id)


@router.get("/face/challenges/{challenge_id}")
async def result(challenge_id: str, request: Request) -> dict[str, Any]:
    uid = await owner(request)
    return await anyio.to_thread.run_sync(store(request).result, uid, challenge_id)


@router.post("/face/challenges/{challenge_id}/capture")
async def capture(challenge_id: str, request: Request) -> dict[str, Any]:
    uid = await consented_owner(request)
    service = store(request)
    metadata = await anyio.to_thread.run_sync(service.consume, uid, challenge_id)
    content_type = request.headers.get("content-type", "").split(";")[0]
    if content_type not in {"video/webm", "video/mp4"}:
        raise HTTPException(415, "Capture must be a browser-recorded video.")
    buffer = bytearray()
    try:
        async with asyncio.timeout(10):
            async for chunk in request.stream():
                if len(buffer) + len(chunk) > 8 * 1024 * 1024:
                    raise HTTPException(413, "Capture exceeds 8 MB.")
                buffer.extend(chunk)
        settings = request.app.state.v1_settings
        outcome: dict[str, Any] = {
            "status": "review_pending",
            "reason": "worker_unavailable",
            "liveness": "unavailable",
            "one_to_one": "not_evaluated",
            "one_to_many": "not_evaluated",
        }
        token = settings.face_worker_token.get_secret_value()
        if token:
            try:
                async with httpx.AsyncClient(timeout=70, trust_env=False) as client:
                    response = await client.post(
                        settings.face_worker_url + "/evaluate",
                        # bytes, not the bytearray: httpx treats a bytearray as a sync stream and
                        # an AsyncClient then fails every capture with a 500.
                        content=bytes(buffer),
                        headers={
                            **await worker_headers(settings, uid),
                            "Content-Type": content_type,
                            "X-Challenge": challenge_id,
                            "X-Prompts": ",".join(metadata["prompts"]),
                        },
                    )
                    if response.is_success:
                        data = response.json()
                        # Whitelist fields. No embeddings, IDs or provider errors reach the UI.
                        outcome = {
                            k: data[k]
                            for k in ["status", "reason", "liveness", "one_to_one", "one_to_many"]
                            if k in data
                        }
            except (httpx.HTTPError, ValueError):
                pass
        await anyio.to_thread.run_sync(service.face_result, uid, challenge_id, outcome)
        return outcome
    finally:
        buffer.clear()


@router.delete("/face/template")
async def delete_template(request: Request) -> dict[str, str]:
    uid = await owner(request)
    settings = request.app.state.v1_settings
    token = settings.face_worker_token.get_secret_value()
    if not token:
        # No worker means no template was ever stored; clear the local result and confirm.
        await anyio.to_thread.run_sync(store(request).invalidate_face, uid)
        return {"status": "deleted"}
    try:
        async with httpx.AsyncClient(timeout=70, trust_env=False) as client:
            response = await client.delete(
                settings.face_worker_url + "/template",
                headers=await worker_headers(settings, uid),
            )
            if not response.is_success:
                raise HTTPException(503, "Template deletion could not be confirmed. Retry.")
    except httpx.HTTPError as error:
        raise HTTPException(503, "Template deletion could not be confirmed. Retry.") from error
    await anyio.to_thread.run_sync(store(request).invalidate_face, uid)
    return {"status": "deleted"}


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
                async with asyncio.timeout(60):
                    extracted = await extract(
                        mapper, request.app.state.photos, bytes(buffer), content_type
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
        currency = business["fields"].get("currency") or DEFAULT_CURRENCY
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
    currency = business["fields"].get("currency") or DEFAULT_CURRENCY
    saved = {(p["name"].casefold(), p["unit"].casefold()): p for p in context["inventory"]}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for saved_item in context["inventory"]:
        by_name.setdefault(saved_item["name"].casefold(), []).append(saved_item)
    products = []
    for item in items:
        known = saved.get((item["name"].casefold(), item["unit"].casefold()))
        if not known and len(by_name.get(item["name"].casefold(), [])) == 1:
            # Exports often omit or rename units; one item with that name is the same item.
            known = by_name[item["name"].casefold()][0]
        products.append(
            ProductFields(
                name=known["name"] if known else item["name"],
                price=to_minor(item["price"], currency),
                unit=known["unit"] if known else item["unit"],
                stock=item["stock"] if item["stock"] is not None else (known or {}).get("stock"),
                # An import never undoes an owner's sold-out switch.
                available=known.get("available", True) if known else True,
                category=item.get("category")
                or (known or {}).get("category")
                or suggest_category(item["name"]),
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
