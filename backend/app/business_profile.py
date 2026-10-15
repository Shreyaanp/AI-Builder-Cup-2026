"""Question plans: what customers of *this kind* of business ask, so the coach can ask the owner.

Vendor-agnostic onboarding. Gemini proposes a short checklist for the shop's category (a salon
gets walk-ins and per-service prices, a tuition centre gets levels and trial lessons). The plan
is only a list of questions to ask; answers still become owner-confirmed `custom_facts`.
Offline mode uses a small deterministic catalogue so tests and local dev never call a model.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from typing import Any

import structlog
from pydantic import BaseModel, Field

from .gemini_schema import gemini_schema, parse_reply
from .settings import Settings

log = structlog.get_logger()

PLAN_SIZE = 8
CACHE_SIZE = 256


class PlannedQuestion(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9_]{1,40}$", description="snake_case fact key")
    label: str = Field(max_length=80, description="Short label customers see, e.g. 'Walk-ins'")
    question: str = Field(max_length=200, description="How to ask the owner, in plain English")


class QuestionPlan(BaseModel):
    business_type: str = Field(max_length=60, description="Canonical type, e.g. 'hair salon'")
    questions: list[PlannedQuestion] = Field(max_length=PLAN_SIZE)


# Deterministic catalogue (offline mode, and a fallback when the model is unavailable).
# Food & drink facts already have dedicated fields (halal, delivery, payment…), so these
# plans only cover what those fields don't.
CATALOGUE: list[tuple[str, str, list[tuple[str, str, str]]]] = [
    (
        r"salon|barber|hair|nail|beauty|spa|lash|brow",
        "beauty salon",
        [
            ("walk_ins", "Walk-ins", "Do you take walk-ins, or appointments only?"),
            ("booking", "How to book", "How do customers book: phone, WhatsApp or a booking app?"),
            (
                "service_prices",
                "Popular services",
                "What are your most popular services and prices?",
            ),
            ("stylists", "Team", "How many stylists or therapists work here?"),
            ("products_used", "Products used", "Which product brands do you use?"),
        ],
    ),
    (
        r"tuition|tutor|school|academy|class|lesson|enrichment|coding|music",
        "education centre",
        [
            ("levels", "Levels taught", "Which levels or ages do you teach?"),
            ("subjects", "Subjects", "Which subjects do you teach?"),
            ("class_size", "Class size", "How big is a typical class?"),
            ("trial_lesson", "Trial lesson", "Do you offer a trial lesson? Is it free?"),
            ("fees", "Fees", "What are the fees, per lesson or per month?"),
        ],
    ),
    (
        r"repair|fix|service centre|mechanic|workshop|phone shop|laptop|aircon|plumb|electric",
        "repair service",
        [
            ("repairs_offered", "Repairs offered", "Which devices or jobs do you repair?"),
            ("turnaround", "Turnaround", "How long does a typical repair take?"),
            ("warranty", "Warranty", "Do you give a warranty on repairs? For how long?"),
            ("quote", "Quotes", "Do you give a free quote or diagnosis?"),
            ("house_calls", "House calls", "Do you come to the customer?"),
        ],
    ),
    (
        r"cater|buffet|bento|event",
        "catering",
        [
            ("price_per_pax", "Price per person", "What is your price per person (pax)?"),
            ("minimum_order", "Minimum order", "What is the minimum order?"),
            ("lead_time", "Order ahead", "How many days ahead must customers order?"),
            ("packages", "Packages", "Which packages or menus do you offer?"),
            ("setup", "Setup & delivery", "Do you deliver and set up? Any fee?"),
        ],
    ),
    (
        r"grocer|mart|minimart|provision|kiosk|convenience|retail|store|shop",
        "retail shop",
        [
            ("best_sellers", "Popular items", "What do customers buy most often?"),
            ("brands", "Brands", "Which brands do you carry that people look for?"),
            ("special_orders", "Special orders", "Can customers order items you don't stock?"),
            ("returns", "Returns", "What is your return or exchange policy?"),
        ],
    ),
]
FOOD = (
    r"food|kopi|coffee|cafe|café|tea|bakery|bake|cake|hawker|stall|restaurant|eat|kitchen|"
    r"noodle|rice|bar|drink|juice|dessert|"
    r"食|餐|咖啡|面包|茶|อาหาร|กาแฟ|ขนมปัง|ชา|カフェ|パン|コーヒー|レストラン|"
    r"음식|카페|커피|식당|빵|makan|kedai kopi|warung|restoran|roti|minuman|"
    r"nhà hàng|quán|cà phê|trà|bánh mì|kainan|karinderya|pagkain|kape|panaderya|tsaa|"
    r"உணவு|காபி|தேநீர்|பேக்கரி|dhaba|mess|tiffin|chai|भोजन|खाना|चाय|ढाबा|मिठाई|टिफिन|नाश्ता",
    "food & drink",
    [
        ("signature_dish", "Signature dish", "What is your signature dish or drink?"),
        ("price_range", "Price range", "What is a typical price range per person?"),
        ("seating", "Seating", "Is there seating, or takeaway only?"),
        ("spice_allergens", "Allergens", "Any common allergens customers should know about?"),
    ],
)
GENERIC = (
    "local business",
    [
        ("services", "What we offer", "What are your main products or services?"),
        ("price_range", "Price range", "What is a typical price range?"),
        ("booking", "How to book or order", "How do customers book or order?"),
        ("languages", "Languages spoken", "Which languages can customers use with you?"),
    ],
)

PROMPT = """You help a small local business in Asia Pacific get its listing right.
Given its name, category and location, return the business_type (a short canonical type) and up
to {size} questions its CUSTOMERS most often ask before visiting or buying, phrased as questions
to ask the OWNER. Skip facts that are already covered elsewhere: name, hours, location, phone,
prices of individual menu items, halal, vegetarian options, delivery, pre-orders, payment methods
and busy hours. Prefer facts that change a customer's decision. keys are snake_case, labels are
short (max 4 words). English only; the coach translates when asking."""


def _catalogue(category: str, name: str) -> QuestionPlan:
    text = f"{category} {name}".casefold()
    for pattern, kind, questions in [*CATALOGUE, FOOD]:
        if re.search(pattern, text):
            return QuestionPlan(
                business_type=kind,
                questions=[PlannedQuestion(key=k, label=lb, question=q) for k, lb, q in questions],
            )
    kind, questions = GENERIC
    return QuestionPlan(
        business_type=kind,
        questions=[PlannedQuestion(key=k, label=lb, question=q) for k, lb, q in questions],
    )


class QuestionPlanner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: Any = None
        # Keyed by normalised category: the same type of business gets the same plan.
        self._cache: OrderedDict[str, QuestionPlan] = OrderedDict()

    async def plan(self, category: str, name: str = "", location: str = "") -> QuestionPlan:
        key = re.sub(r"\s+", " ", (category or name).casefold()).strip()[:80] or "unknown"
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        plan = await self._generate(category, name, location)
        self._cache[key] = plan
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return plan

    async def _generate(self, category: str, name: str, location: str) -> QuestionPlan:
        if self.settings.coach_mode != "gemini":
            return _catalogue(category, name)
        try:
            from google import genai
            from google.genai import types

            if self._client is None:
                self._client = (
                    genai.Client(
                        vertexai=True,
                        project=self.settings.google_cloud_project,
                        location=self.settings.google_cloud_location,
                    )
                    if self.settings.gemini_backend == "vertex"
                    else genai.Client(api_key=self.settings.google_api_key.get_secret_value())
                )
            response = await self._client.aio.models.generate_content(
                model=self.settings.google_text_model,
                contents=f"name: {name}\ncategory: {category}\nlocation: {location}",
                config=types.GenerateContentConfig(
                    system_instruction=PROMPT.format(size=PLAN_SIZE),
                    response_mime_type="application/json",
                    response_json_schema=gemini_schema(QuestionPlan),
                    temperature=0.2,
                    max_output_tokens=800,
                ),
            )
            plan = parse_reply(QuestionPlan, response)
            if plan is not None and plan.questions:
                return plan
        except Exception:
            # Never block onboarding on the planner; the catalogue is a sound default.
            log.warning("question_plan_failed")
        return _catalogue(category, name)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aio.aclose()
