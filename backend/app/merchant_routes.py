import asyncio
from typing import Any, cast

import anyio
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from .merchant import Approval, BusinessFields, MerchantStore, ProposalRequest


class ChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    business_id: str
    consent: bool


def store(request: Request) -> MerchantStore:
    service = getattr(request.app.state, "merchant", None)
    if service is None:
        raise HTTPException(503, "Local V1 is not enabled.")
    return cast(MerchantStore, service)


async def owner(request: Request) -> str:
    return str((await request.app.state.services.identity.require(request)).uid)


router = APIRouter(prefix="/api/v1")


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
    uid = await owner(request)
    return await anyio.to_thread.run_sync(store(request).propose, uid, body)


@router.post("/proposals/{proposal_id}/approve")
async def approve(proposal_id: str, body: Approval, request: Request) -> dict[str, Any]:
    uid = await owner(request)
    return await anyio.to_thread.run_sync(store(request).commit, uid, proposal_id, body.digest)


@router.post("/businesses/{business_id}/update")
async def update(
    business_id: str, body: BusinessFields, request: Request, revision: int = 0
) -> dict[str, Any]:
    uid = await owner(request)
    return await anyio.to_thread.run_sync(
        store(request).propose,
        uid,
        ProposalRequest(kind="business", business_id=business_id, revision=revision, business=body),
    )


@router.post("/face/challenges")
async def challenge(body: ChallengeRequest, request: Request) -> dict[str, Any]:
    uid = await owner(request)
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
    uid = await owner(request)
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
