"""Unauthenticated shop questions/contact and owner-only inquiry handling."""

import anyio
from fastapi import APIRouter, HTTPException, Request

from .customer import Answer, Inquiry, InquiryInput, InquiryReceipt, Question
from .merchant_routes import consented_owner, owner, store

router = APIRouter(prefix="/api/v1")


async def shared(request: Request, bid: str) -> dict:
    shop = await anyio.to_thread.run_sync(store(request).public_shop, bid)
    if shop is None:
        raise HTTPException(404, "This shop page is not available.")
    return shop


def limit(request: Request, action: str, bid: str) -> None:
    request.app.state.customer_limiter.take(
        action, bid, request.client.host if request.client else "unknown"
    )


@router.post("/public/shops/{business_id}/ask", response_model=Answer)
async def ask(business_id: str, body: Question, request: Request) -> Answer:
    shop = await shared(request, business_id)
    limit(request, "ask", business_id)
    answer = await request.app.state.customer_answers.answer(shop, body)
    # An in-flight answer must not survive unsharing or a changed menu.
    if await shared(request, business_id) != shop:
        raise HTTPException(409, "The shop details changed. Please ask again.")
    return answer


@router.post("/public/shops/{business_id}/inquiries", response_model=InquiryReceipt)
async def inquire(business_id: str, body: InquiryInput, request: Request) -> InquiryReceipt:
    await shared(request, business_id)
    limit(request, "inquire", business_id)
    return await anyio.to_thread.run_sync(store(request).add_inquiry, business_id, body)


@router.get("/businesses/{business_id}/inquiries", response_model=list[Inquiry])
async def inquiries(business_id: str, request: Request) -> list[Inquiry]:
    uid = await owner(request)
    return await anyio.to_thread.run_sync(store(request).inquiries, uid, business_id)


@router.post("/businesses/{business_id}/inquiries/{inquiry_id}/done", response_model=Inquiry)
async def done(business_id: str, inquiry_id: str, request: Request) -> Inquiry:
    # Explicit handling action, separate from saving shop facts or accepting an order.
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(
        store(request).complete_inquiry, uid, business_id, inquiry_id
    )
