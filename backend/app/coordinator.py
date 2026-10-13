"""Request-local ADK tools; caller identity never comes from model arguments."""

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from .merchant import BusinessFields, MerchantRepository, ProductFields, ProposalRequest


@dataclass
class MerchantContext:
    store: MerchantRepository
    uid: str
    business_id: str | None
    recalled: list[str]
    message: str = ""


current: ContextVar[MerchantContext | None] = ContextVar("merchant_context", default=None)


def get_business_context() -> dict[str, Any]:
    """Read the current caller's authoritative business, inventory and progress."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    return {**ctx.store.context(ctx.uid, ctx.business_id), "relevant_history": ctx.recalled}


def propose_business(
    name: str, category: str = "", location: str = "", hours: str = "", phone: str = ""
) -> dict[str, Any]:
    """Prepare business details for exact UI review; never commit them."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    existing = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    fields = BusinessFields(
        name=name, category=category, location=location, hours=hours, phone=phone
    )
    proposal = ctx.store.propose(
        ctx.uid,
        ProposalRequest(
            kind="business",
            business_id=ctx.business_id,
            revision=existing["revision"] if existing else 0,
            business=fields,
        ),
    )
    return {"status": "needs_review", "proposal": proposal}


def propose_product(
    name: str, price_paise: int, unit: str = "item", stock: int | None = None
) -> dict[str, Any]:
    """Prepare one exact inventory correction/addition; prices are INR paise."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    business = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    proposal = ctx.store.propose(
        ctx.uid,
        ProposalRequest(
            kind="inventory",
            business_id=ctx.business_id,
            revision=business["revision"],
            products=[ProductFields(name=name, price=price_paise, unit=unit, stock=stock)],
        ),
    )
    return {"status": "needs_review", "proposal": proposal}


def request_registration() -> dict[str, Any]:
    """Request the consented camera flow; never certify a person or business."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "save_business_first"}
    data = ctx.store.context(ctx.uid, ctx.business_id)
    return {
        "status": "verification_required",
        "business_id": ctx.business_id,
        "person_verification": data["person_verification"],
    }
