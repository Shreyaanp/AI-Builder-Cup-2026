import asyncio
import re
from typing import Any, cast

import anyio
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

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
from .streaming import APP_NAME

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
    record = await anyio.to_thread.run_sync(store(request).consent, uid)
    return {
        "legal_version": LEGAL_VERSION,
        "consent": record,
        "consent_current": bool(record and record.get("version") == LEGAL_VERSION),
    }


@router.post("/consent")
async def consent(body: ConsentRequest, request: Request) -> dict[str, Any]:
    uid = await owner(request)
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
    if body.business and body.business_id:
        # Saved prices are minor units of the saved currency, so edits keep it.
        context = await anyio.to_thread.run_sync(store(request).context, uid, body.business_id)
        saved = (context["business"] or {}).get("fields", {}).get("currency")
        body.business.currency = saved or DEFAULT_CURRENCY
    return await anyio.to_thread.run_sync(store(request).propose, uid, body)


@router.post("/proposals/{proposal_id}/approve")
async def approve(proposal_id: str, body: Approval, request: Request) -> dict[str, Any]:
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(store(request).commit, uid, proposal_id, body.digest)


@router.post("/businesses/{business_id}/update")
async def update(
    business_id: str, body: BusinessFields, request: Request, revision: int = 0
) -> dict[str, Any]:
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(
        store(request).propose,
        uid,
        ProposalRequest(kind="business", business_id=business_id, revision=revision, business=body),
    )


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
    return shop


@router.post("/photos")
async def photo(
    request: Request, business_id: str | None = None, currency: str | None = None
) -> dict[str, Any]:
    """``currency`` (ISO 4217) applies to a brand-new shop; existing shops keep their own."""
    uid = await consented_owner(request)
    service = store(request)
    pipeline: PhotoPipeline = request.app.state.photos
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    if request.headers.get("content-type", "").split(";")[0] not in PHOTO_TYPES:
        raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
    limit = request.app.state.v1_settings.max_photo_bytes
    buffer = bytearray()
    try:
        async with asyncio.timeout(20):
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
            price=to_minor(p.price or 0, currency),
            unit=(p.unit or "item").strip()[:40] or "item",
        )
        for p in extraction.products
        if p.price is not None and p.name.strip()
    ][:30]
    proposal = None
    if business is None and found.name.strip():
        # A new shop and its menu are reviewed together in one sheet.
        request_body = ProposalRequest(
            kind="business",
            business=BusinessFields(
                name=found.name.strip()[:180],
                category=found.category[:180],
                location=found.location[:300],
                hours=found.hours[:180],
                phone=found.phone[:40],
                currency=currency,
            ),
            products=products,
        )
        proposal = await anyio.to_thread.run_sync(service.propose, uid, request_body)
    elif business is not None and products:
        request_body = ProposalRequest(
            kind="inventory",
            business_id=business["id"],
            revision=business["revision"],
            products=products,
        )
        proposal = await anyio.to_thread.run_sync(service.propose, uid, request_body)
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
                async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
                    response = await client.post(
                        settings.face_worker_url + "/evaluate",
                        content=buffer,
                        headers={
                            "Authorization": "Bearer " + token,
                            "Content-Type": content_type,
                            "X-Owner": uid,
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
        raise HTTPException(503, "Start the private face worker to delete its templates.")
    try:
        async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
            response = await client.delete(
                settings.face_worker_url + "/template",
                headers={"Authorization": "Bearer " + token, "X-Owner": uid},
            )
            if not response.is_success:
                raise HTTPException(503, "Template deletion could not be confirmed. Retry.")
    except httpx.HTTPError as error:
        raise HTTPException(503, "Template deletion could not be confirmed. Retry.") from error
    await anyio.to_thread.run_sync(store(request).invalidate_face, uid)
    return {"status": "deleted"}
