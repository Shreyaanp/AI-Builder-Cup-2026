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
from pydantic import BaseModel, Field, TypeAdapter, ValidationError, field_validator

from .business_profile import QuestionPlanner
from .forecast import ForecastService
from .merchant import (
    FACT_KEYS,
    BusinessFields,
    DayHours,
    MerchantRepository,
    NewShopDraft,
    ProductFields,
    ProposalRequest,
)
from .money import DEFAULT_CURRENCY, to_major, to_minor
from .product_categories import suggest_category
from .product_units import UNITS, normalize_unit
from .recap import recap_facts
from .search_engine import SearchEngine
from .sourcing import OrderItem, SupplierGenerator
from .vendor_profile import (
    BusinessTypeProfile,
    FoodAttributes,
    allowed_facts,
    apply_answers,
    food_segment,
    halal_allowed,
    infer_profile,
    profile_for,
    vocabulary,
)

MAX_REPAIRS = 2
# Customer facts the coach asks about after the basics are saved, most asked first.
ASK_ORDER = (
    "halal",
    "payment_methods",
    "delivery",
    "vegetarian_options",
    "locally_made",
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
    # Supplier results and order cards for the chat, keyed by the card_id the model sees.
    cards: dict[str, tuple[str, dict[str, Any]]] = field(default_factory=dict)
    new_shop: bool = False
    new_shop_draft: NewShopDraft | None = None
    # A new-shop conversation that came back after its socket ended: the coach's last question
    # (see new_shop_resume.progress_note).
    resumed: bool = False
    last_question: str = ""
    # The last new-shop proposal: a replayed or repeated answer returns it unchanged.
    last_proposal: str | None = None
    # The owner asked to end the conversation (end_conversation): the socket closes after the
    # coach's goodbye.
    ended: bool = False
    # A Live voice conversation: tools never hold up the spoken reply (first audio).
    spoken: bool = False


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
    if ctx and ctx.new_shop:
        # Onboarding asks only the core five (and at most two extras from the business's own
        # profile, listed in update_shop's result); type-specific questions come later.
        return {
            "status": "not_in_onboarding",
            "instruction": "Ask only what update_shop lists as still missing.",
        }
    if not ctx or (
        not ctx.business_id and not (ctx.new_shop_draft and ctx.new_shop_draft.business)
    ):
        return {
            "status": "needs_business",
            "instruction": (
                "Nothing was recorded yet: ask the owner for their shop's real name (never invent"
                " or assume one), call propose_business with it, then repeat this call."
            ),
        }
    data = ctx.store.context(ctx.uid, ctx.business_id)
    shop = data["business"]
    fields = (
        shop["fields"]
        if shop
        else (
            ctx.new_shop_draft.business.model_dump()
            if ctx.new_shop_draft and ctx.new_shop_draft.business
            else {}
        )
    )
    menu = [
        p["name"]
        for p in (
            data["inventory"]
            if shop
            else [
                p.model_dump() for p in (ctx.new_shop_draft.products if ctx.new_shop_draft else [])
            ]
        )
    ]
    # Drafts can contain unsolicited items before the name; never treat those as a name.
    for key, question in (
        ("name", "What is your business called?"),
        ("category", "What kind of business do you run?"),
    ):
        if not fields.get(key):
            return {
                "status": f"needs_{key}",
                "pending": [{"key": key, "question": question, "record_with": "propose_business"}],
                "instruction": "Ask this one question before type-specific questions.",
            }
    profile = profile_for(fields)
    plan = await _planner().plan(
        fields.get("category", ""),
        fields.get("name", ""),
        fields.get("location", ""),
        profile,
        menu,
    )
    answered = {fact["key"] for fact in fields.get("custom_facts", [])}
    # One list in asking order: up to three skippable questions about the owner's own goals
    # (they shape the shop playbook), common facts still missing (recorded with their own
    # argument of propose_customer_facts), then what customers of this business type ask.
    understand = pending_understanding(fields) if shop else []
    common = [
        {"key": key, "question": COMMON_QUESTIONS[key], "record_with": key}
        for key in pending_customer_facts(fields)
        if key not in {q["key"] for q in understand}
    ]
    typed = [
        {**question.model_dump(), "record_with": "custom_facts"}
        for question in plan.questions
        if question.key not in answered and question.key not in COMMON_QUESTIONS
    ]
    pending = understand + common + typed
    return {
        "business_type": plan.business_type,
        "profile": profile.model_dump(exclude_none=True),
        "vocabulary": vocabulary(profile),
        "pending": pending,
        "answered": len(answered),
        "instruction": "Ask one pending question at a time; stop when the owner wants to. "
        "For diet record veg_only, vegan, non_veg, both or unknown; for boolean questions "
        "record yes/no only if clear, otherwise keep the owner's words. Questions marked "
        "skippable are about the owner's own goals: say they can skip, and if they do, record "
        "skip=[that key] so it is never asked again."
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
    unit: str = Field(
        default="item",
        description="Selling unit, one of: " + ", ".join(UNITS) + ". Pick the closest one.",
    )
    stock: int | None = Field(default=None, description="Units in stock, only if the owner said")
    available: bool = Field(default=True, description="False when the owner says it is sold out")
    category: str | None = Field(
        default=None,
        max_length=80,
        description="Menu section for the item (e.g. Drinks, Mains, Desserts), in the owner's "
        "language. Always give one for a new item; omit to keep a saved item's category.",
    )

    @field_validator("unit", mode="before")
    @classmethod
    def known_unit(cls, value: object) -> object:
        # Plurals and abbreviations ("pcs", "plates") map to the fixed list.
        return normalize_unit(value) if isinstance(value, str) else value


class AmbiguousUnitError(ValueError):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.field = "unit"


def _format_unit_options(units: list[str]) -> str:
    deduped = list(dict.fromkeys(units))
    if len(deduped) <= 1:
        return f"per {deduped[0]}" if deduped else "per item"
    if len(deduped) == 2:
        return f"per {deduped[0]} or per {deduped[1]}"
    return ", ".join(f"per {u}" for u in deduped[:-1]) + f" or per {deduped[-1]}"


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
    elif hasattr(error, "field"):
        problems = [{"field": str(error.field), "problem": str(error)}]
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
                "profile",
                "understanding",
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
        "customer_facts_to_ask": pending_customer_facts(shop["fields"]) if shop else [],
    }


COMMON_QUESTIONS = {
    "halal": "Is your food halal?",
    "payment_methods": "Which payment methods do you accept? Any local method, card or cash.",
    "delivery": "Do you deliver? If so, what is the service name, or do you deliver yourself?",
    "vegetarian_options": "Do you have vegetarian options?",
    "locally_made": "Do you make what you sell yourself, or source it from local makers?",
    "preorders": "Can customers order ahead?",
    "busy_hours": "When are you busiest?",
}
NOTE_LIMIT = 30


def pending_customer_facts(fields: dict[str, Any]) -> list[str]:
    profile = profile_for(fields)
    allowed = allowed_facts(fields)
    return [
        key
        for key in ASK_ORDER
        if fields.get(key) in (None, "", [])
        and key in allowed
        and (key != "halal" or halal_allowed(fields))
        and not (key == "vegetarian_options" and profile.kind == "food")
        and not (key == "delivery" and profile.retail and profile.retail.delivery)
    ]


UNDERSTAND_QUESTIONS = {
    "focus": (
        "What matters most for the shop right now: more customers, less waste, saving time, "
        "or something else?",
        "focus",
    ),
    "busy_hours": ("When are you busiest?", "busy_hours"),
    "regulars": (
        "Who are your regulars? For example office workers, students or families.",
        "regulars",
    ),
}


def pending_understanding(fields: dict[str, Any]) -> list[dict[str, Any]]:
    """The owner's goals, busiest times and regulars: asked once after the basics, skippable,
    never again once answered or skipped."""
    seen = fields.get("understanding") or {}
    answered = {
        "focus": bool(seen.get("focus")),
        "busy_hours": bool(fields.get("busy_hours")),
        "regulars": bool(seen.get("regulars")),
    }
    return [
        {"key": key, "question": question, "record_with": record_with, "skippable": True}
        for key, (question, record_with) in UNDERSTAND_QUESTIONS.items()
        if not answered[key] and key not in (seen.get("skipped") or [])
    ]


def serves_food(fields: dict[str, Any]) -> bool:
    # Unknown type yet: ask everything; food questions drop once the category says otherwise.
    if not (fields.get("category") or "").strip():
        return True
    profile = profile_for(fields)
    return profile.kind == "food" or (
        profile.kind == "generic" and infer_profile(fields.get("category", "")).kind == "food"
    )


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
    # The last 14 sales days, for the trend chart shown beside the coach's answer.
    by_day: dict[str, int] = {}
    for row in sales:
        by_day[row["date"]] = by_day.get(row["date"], 0) + int(row["revenue"])
    daily = [
        {"date": day, "revenue": to_major(total, currency)}
        for day, total in sorted(by_day.items())[-14:]
    ]
    return {
        **facts,
        "daily_revenue": daily,
        "has_sales_data": bool(sales),
        "unanswered_customer_messages": len(waiting),
        "recent_customer_questions": recent,
        "menu_last_confirmed": shop.get("last_confirmed"),
    }


def _same_new_shop_answer(
    ctx: MerchantContext, business: BusinessFields | None, products: list[ProductFields] | None
) -> dict[str, Any] | None:
    """A new-shop answer already in the draft (said twice, or a tool call replayed after a
    reconnect) changes nothing: the last proposal stands and no new one is sealed."""
    draft = ctx.new_shop_draft
    if not (ctx.new_shop and draft and ctx.last_proposal in ctx.proposals):
        return None

    def key(items: list[ProductFields]) -> list[str]:
        return sorted(item.model_dump_json() for item in items)

    if business != draft.business or (
        products is not None and key(products) != key(draft.products)
    ):
        return None
    return {
        "status": "needs_review",
        "proposal_id": ctx.last_proposal,
        "changes": [],
        "note": "Already recorded; nothing changed. Continue with the next missing detail.",
    }


def _start_new_shop_draft() -> None:
    """A new shop's items and answers can be recorded before the owner has said its name: start
    an unnamed draft (the name is required only when the owner opens the shop)."""
    ctx = current.get()
    if ctx and ctx.new_shop and not (ctx.new_shop_draft and ctx.new_shop_draft.business):
        _propose_shop(name="")


def _propose_shop(
    name: str,
    category: str = "",
    location: str = "",
    hours: str = "",
    phone: str = "",
    currency: str = "",
    halal: str = "",
    vegetarian_options: bool | None = None,
    locally_made: bool | None = None,
    delivery: str = "",
    delivery_note: str = "",
    preorders: bool | None = None,
    preorder_lead_time: str = "",
    payment_methods: list[str] | None = None,
    busy_hours: str = "",
    custom_facts: list[FactInput] | None = None,
    weekly_hours: list[DayHours] | None = None,
    description: str = "",
    profile: BusinessTypeProfile | None = None,
    closed_on: str | None = None,
    reward_text: str | None = None,
    stamps_needed: int | None = None,
    understanding: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Shared sealed-proposal logic for shop basics, customer facts, closed-today and the stamp
    card (None leaves a field as saved; closed_on="" reopens)."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    existing = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    draft_fields = ctx.new_shop_draft.business if ctx.new_shop_draft else None
    previous_category = (
        existing["fields"].get("category", "")
        if existing
        else draft_fields.category
        if draft_fields
        else ""
    )
    given: dict[str, Any] = {
        "name": name,
        "category": category,
        "location": location,
        "hours": hours,
        "phone": phone,
        "currency": (currency or "").strip().upper(),
        "description": description,
    }
    facts: dict[str, Any] = {
        "halal": (halal or "").strip().lower() or None,
        "vegetarian_options": vegetarian_options,
        "locally_made": locally_made,
        "delivery": _known_fact_name(delivery, {"none", "own", "grab", "foodpanda", "other"})
        or None,
        "delivery_note": (delivery_note or "").strip() or None,
        "preorders": preorders,
        "preorder_lead_time": (preorder_lead_time or "").strip() or None,
        "payment_methods": [
            _known_fact_name(m, {"cash", "paynow", "card", "grabpay", "nets", "other"})
            for m in payment_methods
        ]
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
    else:
        draft = ctx.new_shop_draft.business if ctx.new_shop_draft else None
        if ctx.new_shop and draft:
            given = {**draft.model_dump(), **{k: v for k, v in given.items() if v}}
        if not re.fullmatch(r"[A-Z]{3}", given["currency"]):
            given["currency"] = ui_currency.get() or DEFAULT_CURRENCY
        given["demo"] = False
    given.update({key: value for key, value in facts.items() if value is not None})
    if profile is not None:
        given["profile"] = profile
    elif category.strip() and (
        profile_for(given).kind == "generic" or category.strip() != previous_category
    ):
        # Offline fallback and older callers; live Gemini should pass its evidence-based profile.
        given["profile"] = infer_profile(category, description).model_dump(exclude_none=True)
    if weekly_hours is not None:
        given["weekly_hours"] = weekly_hours
    for key, value in (
        ("closed_on", closed_on),
        ("reward_text", reward_text),
        ("stamps_needed", stamps_needed),
    ):
        if value is not None:
            given[key] = value
    if understanding:
        merged_understanding = {**(given.get("understanding") or {}), **understanding}
        merged_understanding["skipped"] = [
            key
            for key in dict.fromkeys(
                [*(merged_understanding.get("skipped") or []), *understanding.get("skip", [])]
            )
            # Answering a question later un-skips it.
            if not (key == "focus" and understanding.get("focus"))
            and not (key == "regulars" and understanding.get("regulars"))
            and not (key == "busy_hours" and facts["busy_hours"])
        ]
        merged_understanding.pop("skip", None)
        given["understanding"] = merged_understanding
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
        active_profile = profile_for(given)
        if active_profile.kind == "food" and not active_profile.subtype:
            active_profile = active_profile.model_copy(
                update={"subtype": given.get("category", "")[:80]}
            )
            given["profile"] = active_profile
        if active_profile.kind == "food" and food_segment(active_profile) != "unknown":
            # Persist the segment the owner's own words gave, so every consumer agrees on it.
            food = active_profile.food or FoodAttributes()
            if food.segment == "unknown":
                active_profile = active_profile.model_copy(
                    update={
                        "food": FoodAttributes.model_validate(
                            {**food.model_dump(), "segment": food_segment(active_profile)}
                        )
                    }
                )
                given["profile"] = active_profile
        if active_profile.kind != "generic":
            active_profile = apply_answers(
                active_profile,
                [
                    fact.model_dump()
                    for fact in TypeAdapter(list[FactInput]).validate_python(custom_facts or [])
                ],
            )
            given["profile"] = active_profile
            if active_profile.retail and facts["delivery"] is not None:
                active_profile.retail.delivery = facts["delivery"]
            allowed = allowed_facts(given)
            for key, value in facts.items():
                if value is not None and key not in allowed:
                    raise ValueError(f"{key} is not relevant to this business profile.")
            # A reviewed type change can remove stale fields; it never silently publishes them.
            for key in FACT_KEYS:
                if key not in allowed:
                    given.pop(key, None)
        fields = BusinessFields.model_validate(given)
        if unchanged := _same_new_shop_answer(ctx, fields, None):
            return unchanged
        proposal = ctx.store.propose(
            ctx.uid,
            ProposalRequest(
                kind="business",
                business_id=ctx.business_id,
                revision=existing["revision"] if existing else 0,
                business=fields,
                products=ctx.new_shop_draft.products if ctx.new_shop and ctx.new_shop_draft else [],
            ),
        )
    except (ValueError, HTTPException) as error:
        return _invalid(error, ctx)
    ctx.proposals[proposal["id"]] = proposal
    if ctx.new_shop:
        ctx.last_proposal = proposal["id"]
        # Skipped steps, the photo and the live shop stay (only the shop's fields change).
        ctx.new_shop_draft = (ctx.new_shop_draft or NewShopDraft()).model_copy(
            update={
                "business": fields,
                "products": TypeAdapter(list[ProductFields]).validate_python(
                    proposal["snapshot"]["products"]
                ),
            }
        )
    changes = (
        [
            f"{key}: {existing['fields'].get(key) or '(empty)'} → {value or '(empty)'}"
            for key, value in fields.model_dump().items()
            if key not in {"custom_facts", "profile", "understanding"}
            and value != existing["fields"].get(key, "" if key not in FACT_KEYS else None)
        ]
        + [
            line
            for before, after in [
                (
                    existing["fields"].get("understanding") or {},
                    fields.model_dump().get("understanding") or {},
                )
            ]
            for line in [
                f"{label}: {before.get(key) or '(empty)'} → {after.get(key) or '(empty)'}"
                for key, label in (
                    ("focus", "What matters most"),
                    ("focus_note", "In your words"),
                    ("regulars", "Regulars"),
                )
                if (before.get(key) or "") != (after.get(key) or "")
            ]
            + [
                f"Not asking again: {key}"
                for key in after.get("skipped") or []
                if key not in (before.get("skipped") or [])
            ]
        ]
        + (
            [
                f"Business profile: {fields.profile.kind} "
                f"({fields.profile.subtype or fields.category})"
            ]
            if not custom_facts and fields.profile != profile_for(existing["fields"])
            else []
        )
        + [
            f"{key}: {existing['fields'][key]} → (not applicable)"
            for key in FACT_KEYS
            if existing["fields"].get(key) not in (None, "", []) and key not in fields.model_dump()
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
    description: str = "",
    profile: BusinessTypeProfile | None = None,
) -> dict[str, Any]:
    """Prepare the shop's basic details (new shop, or edits to the active shop) for the owner to
    review. Nothing is saved until the owner confirms. Leave a field empty if the owner did not
    say it; for an existing shop pass name="" and only what changed. currency is the ISO 4217
    code (SGD, JPY, MYR…) for a new shop, only when the owner states or clearly implies it.
    weekly_hours: one record per stated weekday (day: mon/tue/wed/thu/fri/sat/sun,
    closed: boolean, open/close: HH:MM). Overnight closing belongs to the opening day.
    Leave it unset to preserve saved hours; an empty list returns to free-text hours.
    profile: classify from the owner's words, menu or photos, using kind and its typed block.
    Never infer halal certification. Set food.halal_relevant only for a known relevant region
    and food.serves_meat only with evidence. Unknown attributes stay unset. Owner reviews it."""
    return _propose_shop(
        name=name,
        category=category,
        location=location,
        hours=hours,
        phone=phone,
        currency=currency,
        weekly_hours=weekly_hours,
        description=description,
        profile=profile,
    )


def _known_fact_name(value: str, known: set[str]) -> str:
    value = value.strip()
    return value.lower() if value.lower() in known else value


def propose_customer_facts(
    halal: str = "",
    vegetarian_options: bool | None = None,
    locally_made: bool | None = None,
    delivery: str = "",
    delivery_note: str = "",
    preorders: bool | None = None,
    preorder_lead_time: str = "",
    payment_methods: list[str] | None = None,
    busy_hours: str = "",
    custom_facts: list[FactInput] | None = None,
    focus: str = "",
    focus_note: str = "",
    regulars: str = "",
    skip: list[str] | None = None,
) -> dict[str, Any]:
    """Prepare facts customers ask about for the owner to review, only as the owner states
    them; pass just the facts that changed. Private owner goals (never shown to customers):
    focus is more_customers, less_waste, save_time or other (focus_note: their words, e.g.
    "more office lunch orders"); regulars: who comes back, in their words; skip: the keys of
    skippable plan questions (focus, busy_hours, regulars) the owner chose not to answer.
    halal: yes, no, muslim_owned or not_stated.
    vegetarian_options, locally_made (made in-house or by local makers), preorders:
    true/false. delivery: any service name, max 40 characters; use none for no delivery,
    own for the shop's delivery. Existing grab/foodpanda keys work
    (delivery_note up to 80 characters, e.g. "within 3 km"). preorder_lead_time e.g. "1 day
    ahead". payment_methods: up to 8 names, each max 40 characters, exactly as the owner says
    (e.g. UPI, PayPay, GCash, card, cash). Known keys remain compatible. busy_hours e.g.
    "12:00-13:30". custom_facts: answers to get_question_plan questions (key, label, value)."""
    ctx = current.get()
    _start_new_shop_draft()
    if not ctx or (
        not ctx.business_id
        and not (ctx.new_shop and ctx.new_shop_draft and ctx.new_shop_draft.business)
    ):
        return {
            "status": "needs_business",
            "instruction": (
                "Nothing was recorded yet: ask the owner for their shop's real name (never invent"
                " or assume one), call propose_business with it, then repeat this call."
            ),
        }
    return _propose_shop(
        name="",
        halal=halal,
        vegetarian_options=vegetarian_options,
        locally_made=locally_made,
        delivery=delivery,
        delivery_note=delivery_note,
        preorders=preorders,
        preorder_lead_time=preorder_lead_time,
        payment_methods=payment_methods,
        busy_hours=busy_hours,
        custom_facts=custom_facts,
        understanding={
            key: value
            for key, value in {
                "focus": (focus or "").strip().lower().replace(" ", "_"),
                "focus_note": (focus_note or "").strip(),
                "regulars": (regulars or "").strip(),
                "skip": [k for k in skip or [] if k in UNDERSTAND_QUESTIONS],
            }.items()
            if value
        },
    )


def propose_products(items: list[ProductInput]) -> dict[str, Any]:
    """Prepare additions or corrections to the active shop's products and prices, including
    marking items sold out (available=false), for the owner to review. Use one call for all
    items mentioned together. Prices are in the shop's currency (major units). category is
    the owner's menu section, or a suggested section for a new item. unit is one of the fixed
    selling units."""
    _start_new_shop_draft()
    ctx = current.get()
    if not ctx or (
        not ctx.business_id
        and not (ctx.new_shop and ctx.new_shop_draft and ctx.new_shop_draft.business)
    ):
        return {
            "status": "needs_business",
            "instruction": (
                "Nothing was recorded yet: ask the owner for their shop's real name (never invent"
                " or assume one), call propose_business with it, then repeat this call."
            ),
        }
    try:
        # The model sometimes sends bare strings; validation turns that into a repairable error
        # instead of a crash that ends the owner's turn with no reply.
        items = TypeAdapter(list[ProductInput]).validate_python(items)
        context = ctx.store.context(ctx.uid, ctx.business_id)
        draft = ctx.new_shop_draft if ctx.new_shop else None
        draft_products = [p.model_dump() for p in draft.products] if draft else []
        inventory = draft_products if draft else context["inventory"]
        currency = (
            draft.business.currency
            if draft and draft.business
            else shop_currency(context["business"])
        )
        saved = {(p["name"].casefold(), p["unit"].casefold()): p for p in inventory}
        by_name: dict[str, list[dict[str, Any]]] = {}
        for p in inventory:
            by_name.setdefault(p["name"].casefold(), []).append(p)
        products = []
        for item in items:
            name = item.name.strip().casefold()
            known = saved.get((name, item.unit.strip().casefold()))
            matching = by_name.get(name, [])
            if not known and len(matching) == 1:
                # "Kaya toast is sold out" names the item but rarely its unit.
                known = matching[0]
            elif not known and len(matching) > 1:
                options = _format_unit_options([p["unit"] for p in matching])
                matching_name = matching[0]["name"]
                raise AmbiguousUnitError(f"{matching_name}: which unit? ({options})")
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
                    # Every new item gets a category (given, else suggested; reviewed with the
                    # rest). A saved item keeps its own; uncategorised ones use "Sort my menu".
                    category=(item.category or "").strip()
                    or (known.get("category", "") if known else suggest_category(item.name)),
                )
            )
        if draft:
            merged = {(p.name.casefold(), p.unit.casefold()): p for p in draft.products}
            merged.update({(p.name.casefold(), p.unit.casefold()): p for p in products})
            products = list(merged.values())
            if unchanged := _same_new_shop_answer(ctx, draft.business, products):
                return unchanged
        proposal = ctx.store.propose(
            ctx.uid,
            ProposalRequest(
                kind="business" if draft else "inventory",
                business_id=ctx.business_id,
                revision=context["business"]["revision"] if context["business"] else 0,
                business=draft.business if draft else None,
                products=products,
            ),
        )
    except (ValidationError, HTTPException, ValueError) as error:
        return _invalid(error, ctx)
    ctx.proposals[proposal["id"]] = proposal
    if draft:
        ctx.last_proposal = proposal["id"]
        ctx.new_shop_draft = draft.model_copy(update={"products": products})
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


async def propose_rescue_deal(
    items: list[dict[str, Any]], discount_pct: int, until: str, pickup_note: str = ""
) -> dict[str, Any]:
    """Prepare a rescue review for leftover items (name, qty), discount 20/30/50 percent,
    and a shop-local HH:MM deadline today. Never sends it: the owner must approve the exact
    rescue digest. Use for text or voice such as '6 croissants at 30% off until 20:00'."""
    import anyio

    from . import rescue

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    try:
        context = await anyio.to_thread.run_sync(ctx.store.context, ctx.uid, ctx.business_id)
        # Spoken plurals resolve to the existing spelling; ambiguous names still fail validation.
        resolved = []
        for item in items:
            name = str(item.get("name", ""))
            saved = [
                p
                for p in context["inventory"]
                if p["name"].casefold().rstrip("s") == name.casefold().rstrip("s")
            ]
            resolved.append({**item, "name": saved[0]["name"] if len(saved) == 1 else name})
        body = rescue.RescueInput.model_validate(
            {
                "items": resolved,
                "discount_pct": discount_pct,
                "until": until,
                "pickup_note": pickup_note,
            }
        )
        proposal = await anyio.to_thread.run_sync(
            rescue.prepare, ctx.store, ctx.uid, ctx.business_id, body
        )
    except (ValidationError, HTTPException, ValueError) as error:
        return _invalid(error, ctx)
    card_id = _card(
        ctx, "rescue_proposal", {**proposal.model_dump(mode="json"), "business_id": ctx.business_id}
    )
    return {
        "status": "needs_review",
        "card_id": card_id,
        "instruction": "Ask the owner to review and approve; this rescue is not live.",
    }


# --- Sourcing: find suppliers, prepare order requests, talk to suppliers (sourcing.py) -------

supplier_generator: SupplierGenerator | None = None
# The shared search engine (search_engine.py); set at startup, customers use the same one.
search_engine: SearchEngine | None = None
# Owner of every generated demo supplier; no person signs in as this account.
DEMO_OWNER_UID = "chalkboard-demo-supplier-owner"


def _generator() -> SupplierGenerator:
    global supplier_generator
    if supplier_generator is None:
        from .settings import Settings

        supplier_generator = SupplierGenerator(Settings(_env_file=None))  # type: ignore[call-arg]
    return supplier_generator


def _card(ctx: MerchantContext, kind: str, data: dict[str, Any]) -> str:
    card_id = uuid4().hex[:10]
    ctx.cards[card_id] = (kind, data)
    return card_id


async def find_suppliers(
    item: str, quantity: float | None = None, unit: str = ""
) -> dict[str, Any]:
    """Find suppliers near the shop for a supply that is running low (flour, sugar, milk,
    packaging…), ranked by distance, price and availability. Call it when the owner says an
    item is running low, needs restocking or asks where to buy it, or when a forecast shows a
    shortage. item: one supply in plain words. quantity and unit (kg, g, litre, ml, pack, dozen)
    only if the owner said them. The app shows the suppliers as cards; describe them briefly
    (rank number, name, distance, price) and ask which one to order from. If
    generated_demo_suppliers is true, say honestly that these are demo suppliers."""
    from . import sourcing

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    if not (item or "").strip():
        return {"status": "invalid", "instruction": "Ask the owner which item they need."}
    result = await sourcing.find(
        ctx.store,
        ctx.uid,
        ctx.business_id,
        item.strip()[:80],
        quantity,
        unit,
        _generator(),
        DEMO_OWNER_UID,
        search_engine,
    )
    if not result["suppliers"]:
        return {
            "status": "none_found",
            "instruction": "Tell the owner no supplier near them stocks this item and ask if "
            "another name or a related item would work.",
        }
    return {"status": "found", "card_id": _card(ctx, "suppliers", result), **result}


def prepare_order(
    supplier_id: str,
    items: list[OrderItem],
    note: str = "",
    delivery: str = "",
    replaces_order_id: str = "",
) -> dict[str, Any]:
    """Prepare an order request to one supplier for the owner to confirm with one tap. Nothing is
    sent until they tap Send. supplier_id comes from find_suppliers (rank 1 = first card) or
    get_orders ("the same as last time"). items: every item the owner named, each with quantity
    and unit exactly as said (20 kg flour, 500 g yeast, 2 litre oil). note: anything to tell the
    supplier. delivery: only if the owner asked for a time. To change a draft that is not sent
    yet (e.g. "change the quantity to 15"), call again with replaces_order_id."""
    import time as clock

    from . import sourcing

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    try:
        items = TypeAdapter(list[OrderItem]).validate_python(items)
        if not items:
            raise ValueError("items: name at least one item with a quantity")
        shop = ctx.store.public_shop(supplier_id) if supplier_id else None
        if not shop:
            raise ValueError("supplier_id: use an id returned by find_suppliers or get_orders")
    except (ValidationError, ValueError) as error:
        return _invalid(error, ctx)
    own_fields = ctx.store.context(ctx.uid, ctx.business_id)["business"]["fields"]
    pin = sourcing.shop_pin(own_fields)
    distance = (
        round(sourcing.haversine(pin.lat, pin.lng, shop["lat"], shop["lng"]), 1)
        if shop.get("lat") is not None and shop.get("lng") is not None
        else None
    )
    now = clock.time()
    order = sourcing.new_order(shop, pin, items, note, delivery, distance, now)
    if replaces_order_id:
        order["replaces"] = replaces_order_id
    ctx.store.save_supplier_order(ctx.uid, ctx.business_id, order)
    missing = [line["name"] for line in order["lines"] if line["price"] is None]
    return {
        **sourcing.summary(order),
        "card_id": _card(ctx, "order", sourcing.public_order(order)),
        "status": "needs_owner_tap",
        **(
            {
                "not_stocked": missing,
                "instruction": "Tell the owner these items are not stocked by this supplier "
                "and offer to find another supplier for them.",
            }
            if missing
            else {}
        ),
    }


def get_orders() -> dict[str, Any]:
    """The shop's recent order requests to suppliers, newest first, with status (draft, sent,
    confirmed, needs_reply, cancelled) and the supplier's last message. Use it for "order the
    same as last time", "did they reply?", "change the quantity", "cancel that order" or before
    messaging a supplier."""
    from . import sourcing

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    found = sourcing.orders(ctx.store, ctx.uid, ctx.business_id)
    return {"orders": [sourcing.summary(order) for order in found[:8]]}


def message_supplier(order_id: str, text: str) -> dict[str, Any]:
    """Prepare a message to the supplier of a sent order ("ask them if they deliver on Sunday",
    "can you deliver by 8?", "please make the flour 15 kg"). Write it as the owner would, short
    and polite, in English unless the owner asks otherwise. The owner taps Send to deliver it."""
    import time as clock

    from . import sourcing

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    text = " ".join((text or "").split())[:500]
    try:
        order = sourcing.get_order(ctx.store, ctx.uid, ctx.business_id, order_id)
    except HTTPException as error:
        return _invalid(error, ctx)
    if not text:
        return {"status": "invalid", "instruction": "Pass the message text."}
    if order["status"] in {"draft", "replaced", "cancelled"}:
        return {
            "status": "not_sent",
            "instruction": "This order is not sent (or is cancelled). For a draft, call "
            "prepare_order again with replaces_order_id instead.",
        }
    now = clock.time()
    order["pending"] = {"kind": "text", "text": text, "created": now}
    order = sourcing.save(ctx.store, ctx.uid, ctx.business_id, order, now)
    return {
        "status": "needs_owner_tap",
        "card_id": _card(ctx, "order", sourcing.public_order(order)),
        "message": text,
    }


def cancel_order(order_id: str) -> dict[str, Any]:
    """Cancel an order request. A draft that was never sent is dropped at once; for a sent order
    a cancellation message is prepared and the owner taps Send."""
    import time as clock

    from . import sourcing

    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    try:
        order = sourcing.get_order(ctx.store, ctx.uid, ctx.business_id, order_id)
    except HTTPException as error:
        return _invalid(error, ctx)
    now = clock.time()
    if order["status"] == "draft":
        order["status"] = "replaced"
        sourcing.save(ctx.store, ctx.uid, ctx.business_id, order, now)
        return {"status": "dropped", "instruction": "Say the draft is discarded; nothing was sent."}
    if order["status"] in {"replaced", "cancelled"}:
        return {"status": "already_cancelled"}
    order["pending"] = {
        "kind": "cancel",
        "text": "Sorry, please cancel this order.",
        "created": now,
    }
    order = sourcing.save(ctx.store, ctx.uid, ctx.business_id, order, now)
    return {
        "status": "needs_owner_tap",
        "card_id": _card(ctx, "order", sourcing.public_order(order)),
    }
