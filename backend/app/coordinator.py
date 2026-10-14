"""Request-local ADK tools; caller identity never comes from model arguments.

Tools only read and *propose*. Saving happens when the owner confirms the exact digest in the UI.

Self-repair: invalid arguments come back as structured `invalid` results naming each field and
how to fix it, so the model can correct itself. After MAX_REPAIRS failed attempts in one turn
the tool returns `ask_owner` and the model must ask instead of guessing again.
"""

import re
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from .merchant import (
    FACT_KEYS,
    BusinessFields,
    MerchantRepository,
    ProductFields,
    ProposalRequest,
)
from .money import DEFAULT_CURRENCY, to_major, to_minor

MAX_REPAIRS = 2
# Customer facts the coach asks about after the basics are saved, most asked first.
ASK_ORDER = (
    "halal",
    "payment_methods",
    "delivery",
    "vegetarian_options",
    "preorders",
    "busy_hours",
)
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
ui_currency: ContextVar[str | None] = ContextVar("ui_currency", default=None)


class ProductInput(BaseModel):
    """One menu or catalogue item as the owner described it."""

    name: str = Field(description="Item name exactly as the owner uses it")
    price: float | None = Field(
        default=None,
        description="Price in the shop's currency, major units (e.g. 15 or 12.5). Leave empty "
        "to keep the saved price of an existing item, e.g. when only marking it sold out.",
    )
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


def shop_currency(business: dict[str, Any] | None) -> str:
    return (business or {}).get("fields", {}).get("currency") or DEFAULT_CURRENCY


def get_business_context() -> dict[str, Any]:
    """Read the owner's saved shop and its products (prices in the shop's currency). Call this
    before proposing changes to an existing shop so you can compare with what is saved."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    data = ctx.store.context(ctx.uid, ctx.business_id)
    shop = data["business"]
    currency = shop_currency(shop)
    return {
        "shop": {
            key: value
            for key, value in shop["fields"].items()
            # Coordinates stay hidden from the model; customer facts are part of the shop.
            if key
            in {"name", "category", "location", "hours", "phone", "currency"} | set(FACT_KEYS)
        }
        if shop
        else None,
        "customer_page_shared": bool(shop and shop.get("public")),
        "products": [
            {
                "name": product["name"],
                "price": to_major(product["price"], currency),
                "unit": product["unit"],
                "stock": product.get("stock"),
                "available": product.get("available", True),
            }
            for product in data["inventory"]
        ],
        "relevant_history": ctx.recalled,
        # Customer facts not stated yet, in the order the coach should ask about them.
        "customer_facts_to_ask": [
            key for key in ASK_ORDER if shop and shop["fields"].get(key) in (None, "", [])
        ],
    }


def propose_business(
    name: str,
    category: str = "",
    location: str = "",
    hours: str = "",
    phone: str = "",
    currency: str = "",
    halal: str = "",
    vegetarian_options: bool | None = None,
    delivery: str = "",
    delivery_note: str = "",
    preorders: bool | None = None,
    preorder_lead_time: str = "",
    payment_methods: list[str] | None = None,
    busy_hours: str = "",
) -> dict[str, Any]:
    """Prepare the shop's details (new shop, or edits to the active shop) for the owner to review.
    Nothing is saved until the owner confirms. Leave a field empty if the owner did not say it.
    currency is the ISO 4217 code (SGD, JPY, MYR…) for a new shop, only when the owner states
    or clearly implies it; an existing shop keeps its currency.
    Customer facts, only as the owner states them: halal is yes, no, muslim_owned or not_stated;
    vegetarian_options and preorders are true/false; delivery is none, own, grab, foodpanda or
    other (delivery_note: up to 80 characters, e.g. "within 3 km"); preorder_lead_time e.g.
    "1 day ahead"; payment_methods from cash, paynow, card, grabpay, nets, other; busy_hours
    e.g. "12:00-13:30". For an existing shop pass name="" and only the facts that changed."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    existing = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    given: dict[str, Any] = {
        "name": name,
        "category": category,
        "location": location,
        "hours": hours,
        "phone": phone,
        "currency": (currency or "").strip().upper(),
    }
    facts: dict[str, Any] = {
        "halal": (halal or "").strip().lower() or None,
        "vegetarian_options": vegetarian_options,
        "delivery": (delivery or "").strip().lower() or None,
        "delivery_note": (delivery_note or "").strip() or None,
        "preorders": preorders,
        "preorder_lead_time": (preorder_lead_time or "").strip() or None,
        "payment_methods": [m.strip().lower() for m in payment_methods]
        if payment_methods
        else None,
        "busy_hours": (busy_hours or "").strip() or None,
    }
    if existing:
        # Edits keep everything saved that the owner did not mention, customer facts included.
        given = {
            **existing["fields"],
            **{key: value.strip() for key, value in given.items() if (value or "").strip()},
        }
        # Saved prices are minor units of the saved currency, so it never changes on edit.
        given["currency"] = shop_currency(existing)
    elif not re.fullmatch(r"[A-Z]{3}", given["currency"]):
        given["currency"] = ui_currency.get() or DEFAULT_CURRENCY
    given.update({key: value for key, value in facts.items() if value is not None})
    try:
        fields = BusinessFields.model_validate(given)
        if existing and existing["fields"].get("location") == fields.location:
            fields = BusinessFields.model_validate({**existing["fields"], **given})
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
            if value != existing["fields"].get(key, "" if key not in FACT_KEYS else None)
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
        # The model sometimes sends bare strings; validation turns that into a repairable error
        # instead of a crash that ends the owner's turn with no reply.
        items = TypeAdapter(list[ProductInput]).validate_python(items)
        context = ctx.store.context(ctx.uid, ctx.business_id)
        currency = shop_currency(context["business"])
        saved = {(p["name"].casefold(), p["unit"].casefold()): p for p in context["inventory"]}
        by_name: dict[str, list[dict[str, Any]]] = {}
        for p in context["inventory"]:
            by_name.setdefault(p["name"].casefold(), []).append(p)
        products = []
        for item in items:
            name = item.name.strip().casefold()
            known = saved.get((name, item.unit.strip().casefold()))
            if not known and len(by_name.get(name, [])) == 1:
                # "Kaya toast is sold out" names the item but rarely its unit.
                known = by_name[name][0]
            if item.price is None and not known:
                raise ValueError(f"{item.name}: a new item needs a price")
            products.append(
                ProductFields(
                    # Keep the saved spelling so a correction updates the same item.
                    name=known["name"] if known else item.name,
                    price=known["price"]
                    if item.price is None and known
                    else to_minor(item.price or 0, currency),
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

    def money(minor: int) -> float:
        return to_major(minor, currency)

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
