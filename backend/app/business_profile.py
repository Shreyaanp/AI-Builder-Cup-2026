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
from .vendor_profile import BusinessTypeProfile, food_segment, menu_non_veg

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

PROFILE_QUESTIONS = {
    "tailor": [
        ("services", "Services", "Which tailoring services do you offer?"),
        ("turnaround", "Turnaround", "How long do alterations or new garments usually take?"),
        ("measurements", "Measurements", "How do customers arrange measurements or fittings?"),
    ],
    "salon": [
        ("services", "Services", "Which salon services do you offer?"),
        *(q for q in CATALOGUE[0][2] if q[0] != "service_prices"),
    ],
    "retail": [
        ("categories", "Categories", "Which product categories do you carry?"),
        *CATALOGUE[-1][2],
    ],
    "grocer": [
        ("categories", "Categories", "Which grocery categories do you carry?"),
        ("selling_units", "Selling units", "Do you sell by piece, pack or weight?"),
        ("delivery_radius", "Home delivery area", "How far do you deliver to homes?"),
        ("special_orders", "Special orders", "Can customers order items you don't stock?"),
    ],
    "service": [
        ("services", "Services", "Which services do you offer?"),
        ("service_area", "Service area", "Which areas do you serve?"),
        ("appointment", "Appointments", "Do customers need an appointment?"),
    ],
}


Question = tuple[str, str, str]
DIET: Question = (
    "diet",
    "Food choices",
    "Is your menu vegetarian only, non-vegetarian, or both?",
)
MEAT: Question = ("serves_meat", "Meat", "Do you serve any meat?")
# Per food sub-segment (vendor_profile.SEGMENTS). Diet, meat and halal questions appear only where
# they fit: never for drinks or bakes unless the owner said they sell meat, never "vegetarian?"
# at a meat counter. Halal itself stays a common fact gated by vendor_profile.halal_allowed.
SEGMENT_QUESTIONS: dict[str, list[Question]] = {
    "unknown": [
        # One natural question instead of every diet question; the answer sets the segment.
        ("food_style", "What you serve", "Do you serve meals, or mostly tea and snacks?"),
        ("signature_dish", "Signature dish", "What is your signature dish or drink?"),
        ("seating", "Seating", "Is there seating, or takeaway only?"),
    ],
    "beverage": [
        ("signature_dish", "Signature drink", "What is your most popular drink?"),
        ("milk_options", "Milk options", "Do you have dairy and plant milk, like oat or soy?"),
        ("sugar_free", "Sugar-free", "Can customers ask for sugar-free or less sugar?"),
        ("takeaway_cups", "Takeaway", "Do you do takeaway cups or parcels?"),
    ],
    "bakery": [
        ("bakes", "Bakes", "Which cakes or bakes do you make?"),
        ("eggless", "Eggless options", "Do you have eggless cakes or bakes?"),
        ("custom_orders", "Custom orders", "Can customers request custom designs or sizes?"),
    ],
    "snack": [
        ("signature_dish", "Signature snack", "What do people come back for most?"),
        ("seating", "Seating", "Is there seating, or takeaway only?"),
        ("price_range", "Price range", "What does a typical snack cost?"),
    ],
    "restaurant": [
        ("cuisine", "Cuisine", "What cuisine or style of food do you serve?"),
        DIET,
        (
            "jain_allergens",
            "Jain and allergens",
            "Do you have Jain options, or allergens customers should know about?",
        ),
        (
            "dine_in_delivery",
            "Dine-in or delivery",
            "Do customers eat in, take away, or order delivery?",
        ),
        ("seating", "Seating", "How many people can you seat?"),
        ("signature_dish", "Signature dish", "What is your signature dish?"),
    ],
    "butcher": [
        ("cuts", "Meat and cuts", "Which meats and cuts do you sell?"),
        ("selling_units", "Selling units", "Do you price cuts per piece or by weight?"),
        ("sourcing", "Sourcing", "Where do you source your meat?"),
    ],
}


def food_questions(profile: BusinessTypeProfile, menu: list[str] | None = None) -> list[Question]:
    segment = food_segment(profile, menu)
    questions = list(SEGMENT_QUESTIONS[segment])
    food = profile.food
    meat = bool(food and food.serves_meat)
    if segment == "restaurant" and not (food and food.serves_meat is not None):
        questions.insert(2, MEAT)
    elif segment == "snack" and (meat or menu_non_veg(menu or [])):
        # Veg/non-veg is worth asking only when the menu (or owner) suggests meat or eggs.
        questions.insert(0, DIET)
    return questions


def plan_keys(profile: BusinessTypeProfile) -> set[str]:
    """Every key this profile's plan can ever ask (answered and conditional ones included)."""
    if profile.kind != "food":
        empty = BusinessTypeProfile(kind=profile.kind, subtype=profile.subtype)
        return {q.key for q in typed_plan(empty).questions}
    # Diet and meat are never *asked* of a tea stall, but an owner may still volunteer them
    # ("we sell keema samosa too"), which is how meat-dependent questions become relevant.
    return {q[0] for q in food_questions(profile, ["chicken"])} | {
        "diet",
        "serves_meat",
        "food_style",
    }


def typed_plan(profile: BusinessTypeProfile, menu: list[str] | None = None) -> QuestionPlan:
    kind = profile.kind
    questions = PROFILE_QUESTIONS.get(kind, GENERIC[1])
    label = profile.subtype or {
        "food": "food & drink",
        "salon": "beauty salon",
        "retail": "retail shop",
        "grocer": "grocer",
        "tailor": "tailor",
        "service": "service business",
    }.get(kind, "local business")
    if kind == "food":
        questions = food_questions(profile, menu)
    block = getattr(profile, "retail" if kind == "grocer" else kind, None)
    return QuestionPlan(
        business_type=label[:60],
        questions=[
            PlannedQuestion(key=k, label=lb, question=q)
            for k, lb, q in questions
            if not (block and getattr(block, k, None) not in (None, "", [], "unknown"))
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
        # Bounded cache of generic plans; typed plans use the validated profile directly.
        self._cache: OrderedDict[str, QuestionPlan] = OrderedDict()

    async def plan(
        self,
        category: str,
        name: str = "",
        location: str = "",
        profile: BusinessTypeProfile | None = None,
        menu: list[str] | None = None,
    ) -> QuestionPlan:
        if profile and profile.kind != "generic":
            return typed_plan(profile, menu)
        # Name/location can change relevance. Never share a cached answer across those inputs.
        key = repr((category, name, location))
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
