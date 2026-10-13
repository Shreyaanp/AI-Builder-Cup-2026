"""Request-local ADK tools; caller identity never comes from model arguments.

Tools only read and *propose*. Saving happens when the owner confirms the exact digest in the UI.

Self-repair: invalid arguments come back as structured `invalid` results naming each field and
how to fix it, so the model can correct itself. After MAX_REPAIRS failed attempts in one turn
the tool returns `ask_owner` and the model must ask instead of guessing again.
"""

from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError

from .merchant import BusinessFields, MerchantRepository, ProductFields, ProposalRequest

MAX_REPAIRS = 2
# A price moving by more than this factor is flagged so the model confirms with the owner.
SUSPICIOUS_PRICE_RATIO = 2.0


@dataclass
class MerchantContext:
    store: MerchantRepository
    uid: str
    business_id: str | None
    recalled: list[str]
    message: str = ""
    repairs: int = 0
    # Full proposals for the review UI; the model only ever sees ids, readable changes, warnings.
    proposals: dict[str, dict[str, Any]] = field(default_factory=dict)


current: ContextVar[MerchantContext | None] = ContextVar("merchant_context", default=None)


class ProductInput(BaseModel):
    """One menu or catalogue item as the owner described it."""

    name: str = Field(description="Item name exactly as the owner uses it")
    price: float = Field(description="Price in the shop's currency, major units (e.g. 15 or 12.5)")
    unit: str = Field(default="item", description="Selling unit: cup, plate, kg, piece, item…")
    stock: int | None = Field(default=None, description="Units in stock, only if the owner said")
    available: bool = Field(default=True, description="False when the owner says it is sold out")


def _invalid(
    error: ValidationError | HTTPException | ValueError, ctx: MerchantContext
) -> dict[str, Any]:
    ctx.repairs += 1
    if ctx.repairs > MAX_REPAIRS:
        return {
            "status": "ask_owner",
            "instruction": "Stop retrying. Ask the owner one short question to get the missing or "
            "unclear detail, in their language.",
        }
    if isinstance(error, ValidationError):
        problems = [
            {"field": ".".join(str(p) for p in item["loc"]), "problem": item["msg"]}
            for item in error.errors()
        ]
    elif isinstance(error, HTTPException):
        problems = [{"field": "record", "problem": str(error.detail)}]
    else:
        problems = [{"field": "input", "problem": str(error)}]
    return {
        "status": "invalid",
        "errors": problems,
        "repairs_left": MAX_REPAIRS - ctx.repairs + 1,
        "instruction": "Fix only the listed fields using what the owner actually said, then call "
        "the tool again. Never invent values.",
    }


def money(minor: int) -> float:
    """Model-facing prices are always in major units (15.0), never stored minor units (1500)."""
    return round(minor / 100, 2)


def get_business_context() -> dict[str, Any]:
    """Read the owner's saved shop and its products (prices in the shop's currency). Call this
    before proposing changes to an existing shop so you can compare with what is saved."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    data = ctx.store.context(ctx.uid, ctx.business_id)
    shop = data["business"]
    return {
        "shop": shop["fields"] if shop else None,
        "customer_page_shared": bool(shop and shop.get("public")),
        "products": [
            {
                "name": product["name"],
                "price": money(product["price"]),
                "unit": product["unit"],
                "stock": product.get("stock"),
                "available": product.get("available", True),
            }
            for product in data["inventory"]
        ],
        "relevant_history": ctx.recalled,
    }


def propose_business(
    name: str, category: str = "", location: str = "", hours: str = "", phone: str = ""
) -> dict[str, Any]:
    """Prepare the shop's details (new shop, or edits to the active shop) for the owner to review.
    Nothing is saved until the owner confirms. Leave a field empty if the owner did not say it."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    existing = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    given = {
        "name": name,
        "category": category,
        "location": location,
        "hours": hours,
        "phone": phone,
    }
    if existing:
        # Edits keep saved values the owner did not mention.
        given = {
            key: (value or "").strip() or existing["fields"].get(key, "")
            for key, value in given.items()
        }
    try:
        fields = BusinessFields(**given)
        proposal = ctx.store.propose(
            ctx.uid,
            ProposalRequest(
                kind="business",
                business_id=ctx.business_id,
                revision=existing["revision"] if existing else 0,
                business=fields,
            ),
        )
    except (ValidationError, HTTPException) as error:
        return _invalid(error, ctx)
    ctx.proposals[proposal["id"]] = proposal
    changes = (
        [
            f"{key}: {existing['fields'].get(key) or '(empty)'} → {value or '(empty)'}"
            for key, value in fields.model_dump().items()
            if value != existing["fields"].get(key, "")
        ]
        if existing
        else [f"New shop: {fields.name}"]
    )
    return {"status": "needs_review", "proposal_id": proposal["id"], "changes": changes}


def propose_products(items: list[ProductInput]) -> dict[str, Any]:
    """Prepare additions or corrections to the active shop's products and prices, including
    marking items sold out (available=false), for the owner to review. Use one call for all
    items mentioned together. Prices are in the shop's currency (major units)."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {
            "status": "needs_business",
            "instruction": "Ask for the shop name first and use propose_business.",
        }
    try:
        context = ctx.store.context(ctx.uid, ctx.business_id)
        saved = {(p["name"].casefold(), p["unit"].casefold()): p for p in context["inventory"]}
        products = []
        for item in items:
            known = saved.get((item.name.strip().casefold(), item.unit.strip().casefold()))
            products.append(
                ProductFields(
                    # Keep the saved spelling so a correction updates the same item.
                    name=known["name"] if known else item.name,
                    price=round(item.price * 100),
                    unit=known["unit"] if known else item.unit,
                    stock=item.stock if item.stock is not None else (known or {}).get("stock"),
                    available=item.available,
                )
            )
        proposal = ctx.store.propose(
            ctx.uid,
            ProposalRequest(
                kind="inventory",
                business_id=ctx.business_id,
                revision=context["business"]["revision"],
                products=products,
            ),
        )
    except (ValidationError, HTTPException, ValueError) as error:
        return _invalid(error, ctx)
    ctx.proposals[proposal["id"]] = proposal
    changes, warnings = [], []
    for product in products:
        known = saved.get((product.name.casefold(), product.unit.casefold()))
        if not known:
            changes.append(f"New item: {product.name}, {money(product.price):g} per {product.unit}")
            continue
        if known["price"] != product.price:
            changes.append(
                f"{product.name}: price {money(known['price']):g} → {money(product.price):g} "
                f"per {product.unit}"
            )
            low, high = sorted([max(known["price"], 1), max(product.price, 1)])
            if high / low >= SUSPICIOUS_PRICE_RATIO:
                warnings.append(
                    f"{product.name}: price changes from {money(known['price']):g} to "
                    f"{money(product.price):g}. Ask the owner to confirm this is correct."
                )
        if known.get("available", True) != product.available:
            changes.append(
                f"{product.name}: {'back in stock' if product.available else 'sold out'}"
            )
    return {
        "status": "needs_review",
        "proposal_id": proposal["id"],
        "changes": changes,
        "warnings": warnings,
    }


def request_registration() -> dict[str, Any]:
    """Open the optional, consented duplicate-owner check. It never certifies a person or that
    they own the shop; use only when the owner asks to register or verify."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "save_business_first"}
    data = ctx.store.context(ctx.uid, ctx.business_id)
    return {
        "status": "verification_required",
        "business_id": ctx.business_id,
        "person_verification": data["person_verification"],
    }
