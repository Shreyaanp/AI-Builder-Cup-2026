"""Request-local ADK tools; caller identity never comes from model arguments.

Tools only read and *propose*. Saving happens when the owner confirms the exact digest in the UI.

Self-repair: invalid arguments come back as structured `invalid` results naming each field and
how to fix it, so the model can correct itself. After MAX_REPAIRS failed attempts in one turn
the tool returns `ask_owner` and the model must ask instead of guessing again.
"""

import re
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from .business_profile import FOOD, QuestionPlanner
from .forecast import ForecastService
from .merchant import (
    FACT_KEYS,
    BusinessFields,
    DayHours,
    MerchantRepository,
    ProductFields,
    ProposalRequest,
)
from .money import DEFAULT_CURRENCY, to_major, to_minor
from .product_categories import suggest_category
from .recap import recap_facts

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


class FactInput(BaseModel):
    """One answer to a question from get_question_plan."""

    key: str = Field(description="The question's key from get_question_plan, e.g. walk_ins")
    label: str = Field(description="The question's label, e.g. Walk-ins")
    value: str = Field(description="The owner's answer in their own words, short")


# Set at startup (main.py); tests and offline runs fall back to the deterministic catalogue.
question_planner: QuestionPlanner | None = None
forecaster: ForecastService | None = None


async def get_forecast() -> dict[str, Any]:
    """Forecast next seven days per item from approved sales. Use for 'how much kopi should I
    prep tomorrow?'. Explain the method and intervals, and ask for bulk imports if insufficient.
    Quantities are demand estimates, not an automatic stock or preparation change."""
    import anyio

    from .sales import today_for
    from .settings import Settings

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    context = await anyio.to_thread.run_sync(ctx.store.context, ctx.uid, ctx.business_id)
    rows = await anyio.to_thread.run_sync(ctx.store.sales_history, ctx.uid, ctx.business_id)
    service = forecaster or ForecastService(Settings(_env_file=None))  # type: ignore[call-arg]
    result = await service.forecast(
        rows, today_for(context["business"]["fields"]), context["inventory"]
    )
    return result.model_dump(mode="json")


def _planner() -> QuestionPlanner:
    global question_planner
    if question_planner is None:
        from .settings import Settings

        question_planner = QuestionPlanner(Settings(_env_file=None))  # type: ignore[call-arg]
    return question_planner


async def get_question_plan() -> dict[str, Any]:
    """Everything customers usually ask that the shop has not answered yet, in asking order.
    Call it whenever the owner invites questions or the basics are saved. Ask ONE pending
    question at a time, in the owner's language. Record each answer with propose_customer_facts:
    if record_with is a fact name, pass that argument; if it is custom_facts, pass
    custom_facts=[{key, label, value}]. The owner may skip any."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {
            "status": "needs_business",
            "instruction": "Ask for the shop name first and use propose_business.",
        }
    shop = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    fields = shop["fields"] if shop else {}
    plan = await _planner().plan(
        fields.get("category", ""), fields.get("name", ""), fields.get("location", "")
    )
    answered = {fact["key"] for fact in fields.get("custom_facts", [])}
    # One list in asking order: common facts still missing (recorded with their own argument of
    # propose_customer_facts), then what customers of this business type ask (custom_facts).
    common = [
        {"key": key, "question": COMMON_QUESTIONS[key], "record_with": key}
        for key in ASK_ORDER
        if fields.get(key) in (None, "", [])
        and (key not in FOOD_ONLY_FACTS or serves_food(fields))
        and key in COMMON_QUESTIONS
    ]
    typed = [
        {**question.model_dump(), "record_with": "custom_facts"}
        for question in plan.questions
        if question.key not in answered
    ]
    pending = common + typed
    return {
        "business_type": plan.business_type,
        "pending": pending,
        "answered": len(answered),
        "instruction": "Ask one pending question at a time; stop when the owner wants to."
        if pending
        else "All common customer questions are answered.",
    }


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
    category: str | None = Field(
        default=None,
        max_length=80,
        description="Item category; omit to keep the saved category, empty to clear it",
    )


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
            in {
                "name",
                "category",
                "location",
                "hours",
                "weekly_hours",
                "phone",
                "currency",
                "custom_facts",
            }
            | set(FACT_KEYS)
        }
        if shop
        else None,
        "customer_page_shared": bool(shop and shop.get("public")),
        "products": [
            {
                "name": product["name"],
                **({"category": product["category"]} if product.get("category") else {}),
                "price": to_major(product["price"], currency),
                "unit": product["unit"],
                "stock": product.get("stock"),
                "available": product.get("available", True),
            }
            for product in data["inventory"]
        ],
        "relevant_history": ctx.recalled,
        # Durable notes the owner asked the coach to keep (visible and deletable in My shop).
        "remembered_notes": [note["text"] for note in (shop or {}).get("coach_notes") or []],
        # Customer facts not stated yet, in the order the coach should ask about them. Food facts
        # (halal, vegetarian, delivery, pre-orders) only make sense for food and drink shops.
        "customer_facts_to_ask": [
            key
            for key in ASK_ORDER
            if shop
            and shop["fields"].get(key) in (None, "", [])
            and (key not in FOOD_ONLY_FACTS or serves_food(shop["fields"]))
        ],
    }


COMMON_QUESTIONS = {
    "halal": "Is your food halal?",
    "payment_methods": "Which payments do you accept (cash, PayNow, card…)?",
    "delivery": "Do you deliver, for example by Grab or foodpanda?",
    "vegetarian_options": "Do you have vegetarian options?",
    "preorders": "Can customers order ahead?",
    "busy_hours": "When are you busiest?",
}
NOTE_LIMIT = 30
FOOD_ONLY_FACTS = {"halal", "vegetarian_options", "delivery", "preorders"}


def serves_food(fields: dict[str, Any]) -> bool:
    # Unknown type yet: ask everything; food questions drop once the category says otherwise.
    if not (fields.get("category") or "").strip():
        return True
    text = f"{fields.get('category', '')} {fields.get('name', '')}".casefold()
    return bool(re.search(FOOD[0], text))


def remember_note(note: str) -> dict[str, Any]:
    """Save one short, durable fact the owner wants you to remember about the shop or how to work
    with them (e.g. "closed on Mondays during Ramadan", "reply to me in Hindi", "supplier delivers
    on Tuesdays"). Only what the owner said. Never passwords, card numbers, IDs or customers'
    personal details. Tell the owner you'll remember it; they can delete notes in My shop."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    text = " ".join((note or "").split())[:200]
    if not text:
        return {"status": "invalid", "instruction": "Pass the note as a short sentence."}
    shop = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    notes = list((shop or {}).get("coach_notes") or [])
    if any(saved["text"].casefold() == text.casefold() for saved in notes):
        return {"status": "already_remembered"}
    notes.append({"id": uuid4().hex[:8], "text": text, "created": date.today().isoformat()})
    ctx.store.set_notes(ctx.uid, ctx.business_id, notes[-NOTE_LIMIT:])
    return {"status": "remembered", "notes": len(notes[-NOTE_LIMIT:])}


def get_insights() -> dict[str, Any]:
    """How the shop is doing this week, from its own data: imported sales (top sellers, slow
    movers, revenue vs last week), sold-out count, customer questions and unanswered messages,
    and when the menu was last confirmed. Call it when the owner asks how business is going or
    what to do next, then give 2-3 short, concrete suggestions grounded only in these numbers.
    If has_sales_data is false, suggest importing a POS or Excel sales export."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    signals = ctx.store.recap_signals(ctx.uid, ctx.business_id)
    sales = ctx.store.sales_history(ctx.uid, ctx.business_id)
    year, week, _ = date.today().isocalendar()
    facts = recap_facts(f"{year}-W{week:02d}", sales, signals)
    currency = facts["currency"]
    for key in ("revenue", "previous_revenue", "revenue_change"):
        facts[key] = to_major(int(facts[key]), currency)
    for group in ("top_sellers", "slow_movers"):
        facts[group] = [
            {**row, "revenue": to_major(int(row["revenue"]), currency)} for row in facts[group]
        ]
    open_threads = [
        thread
        for thread in signals["questions"]
        if not thread.get("done") and thread.get("status") != "closed"
    ]
    waiting = [
        thread
        for thread in open_threads
        if (thread.get("messages") or [{"author": "customer"}])[-1]["author"] == "customer"
    ]
    recent = [
        str((thread.get("messages") or [{"text": thread.get("message", "")}])[-1]["text"])[:100]
        for thread in waiting[-5:]
    ]
    shop = ctx.store.context(ctx.uid, ctx.business_id)["business"] or {}
    return {
        **facts,
        "has_sales_data": bool(sales),
        "unanswered_customer_messages": len(waiting),
        "recent_customer_questions": recent,
        "menu_last_confirmed": shop.get("last_confirmed"),
    }


def _propose_shop(
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
    custom_facts: list[FactInput] | None = None,
    weekly_hours: list[DayHours] | None = None,
) -> dict[str, Any]:
    """Shared sealed-proposal logic for shop basics and customer facts."""
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
    if weekly_hours is not None:
        given["weekly_hours"] = weekly_hours
    if custom_facts:
        # Merge by key: an answer replaces the earlier answer to the same question only.
        merged = {fact["key"]: fact for fact in given.get("custom_facts", [])}
        for fact in TypeAdapter(list[FactInput]).validate_python(custom_facts):
            merged[fact.key.strip().lower()] = {
                "key": fact.key.strip().lower(),
                "label": fact.label,
                "value": fact.value,
            }
        given["custom_facts"] = list(merged.values())
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
            if key != "custom_facts"
            and value != existing["fields"].get(key, "" if key not in FACT_KEYS else None)
        ]
        + [
            f"{fact['label']}: {before.get(fact['key']) or '(empty)'} → {fact['value']}"
            for before in [
                {f["key"]: f["value"] for f in existing["fields"].get("custom_facts", [])}
            ]
            for fact in fields.model_dump().get("custom_facts", [])
            if before.get(fact["key"]) != fact["value"]
        ]
        if existing
        else [f"New shop: {fields.name}"]
    )
    return {"status": "needs_review", "proposal_id": proposal["id"], "changes": changes}


def propose_business(
    name: str,
    category: str = "",
    location: str = "",
    hours: str = "",
    phone: str = "",
    currency: str = "",
    weekly_hours: list[DayHours] | None = None,
) -> dict[str, Any]:
    """Prepare the shop's basic details (new shop, or edits to the active shop) for the owner to
    review. Nothing is saved until the owner confirms. Leave a field empty if the owner did not
    say it; for an existing shop pass name="" and only what changed. currency is the ISO 4217
    code (SGD, JPY, MYR…) for a new shop, only when the owner states or clearly implies it.
    weekly_hours: one record per stated weekday (day: mon/tue/wed/thu/fri/sat/sun,
    closed: boolean, open/close: HH:MM). Overnight closing belongs to the opening day.
    Leave it unset to preserve saved hours; an empty list returns to free-text hours."""
    return _propose_shop(
        name=name,
        category=category,
        location=location,
        hours=hours,
        phone=phone,
        currency=currency,
        weekly_hours=weekly_hours,
    )


def propose_customer_facts(
    halal: str = "",
    vegetarian_options: bool | None = None,
    delivery: str = "",
    delivery_note: str = "",
    preorders: bool | None = None,
    preorder_lead_time: str = "",
    payment_methods: list[str] | None = None,
    busy_hours: str = "",
    custom_facts: list[FactInput] | None = None,
) -> dict[str, Any]:
    """Prepare facts customers ask about for the owner to review, only as the owner states
    them; pass just the facts that changed. halal: yes, no, muslim_owned or not_stated.
    vegetarian_options, preorders: true/false. delivery: none, own, grab, foodpanda or other
    (delivery_note up to 80 characters, e.g. "within 3 km"). preorder_lead_time e.g. "1 day
    ahead". payment_methods from cash, paynow, card, grabpay, nets, other. busy_hours e.g.
    "12:00-13:30". custom_facts: answers to get_question_plan questions (key, label, value)."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {
            "status": "needs_business",
            "instruction": "Ask for the shop name first and use propose_business.",
        }
    return _propose_shop(
        name="",
        halal=halal,
        vegetarian_options=vegetarian_options,
        delivery=delivery,
        delivery_note=delivery_note,
        preorders=preorders,
        preorder_lead_time=preorder_lead_time,
        payment_methods=payment_methods,
        busy_hours=busy_hours,
        custom_facts=custom_facts,
    )


def propose_products(items: list[ProductInput]) -> dict[str, Any]:
    """Prepare additions or corrections to the active shop's products and prices, including
    marking items sold out (available=false), for the owner to review. Use one call for all
    items mentioned together. Prices are in the shop's currency (major units). category is
    the owner's menu section, or a suggested group for a new item; empty clears it."""
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
                    available=item.available
                    if "available" in item.model_fields_set or not known
                    else known.get("available", True),
                    category=item.category
                    if item.category is not None
                    else known.get("category", "")
                    if known
                    else suggest_category(item.name),
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
        if known.get("category", "") != product.category:
            changes.append(
                f"{product.name}: category {known.get('category') or '(empty)'} → "
                f"{product.category or '(empty)'}"
            )
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
