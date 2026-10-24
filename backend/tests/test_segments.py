"""Food sub-segments and the owner's own goals: never ask a question that does not fit."""

from typing import Any

import pytest

from app.agent import instruction
from app.coordinator import (
    FactInput,
    MerchantContext,
    ProductInput,
    current,
    get_question_plan,
    propose_business,
    propose_customer_facts,
    propose_products,
)
from app.merchant import MerchantRepository, customer_facts
from app.vendor_profile import (
    BusinessTypeProfile,
    food_segment,
    infer_profile,
    menu_non_veg,
    segment_from_menu,
)
from tests.pins import pin_shop
from tests.test_merchant_store import store  # noqa: F401

DIET_QUESTIONS = {"diet", "serves_meat", "halal", "vegetarian_options", "jain_allergens"}


def save(context: MerchantContext, result: dict[str, Any]) -> None:
    assert result["status"] == "needs_review", result
    proposal = context.proposals[result["proposal_id"]]
    receipt = context.store.commit(context.uid, proposal["id"], proposal["digest"])
    context.business_id = receipt["business_id"]


async def keys_for(
    store: MerchantRepository,  # noqa: F811
    category: str,
    profile: dict[str, Any],
    menu: list[str] = (),  # type: ignore[assignment]
) -> set[str]:
    context = MerchantContext(store, "alice", None, [])
    token = current.set(context)
    try:
        save(
            context,
            propose_business(
                "Owner's real name",
                category=category,
                profile=BusinessTypeProfile.model_validate(profile),
            ),
        )
        if menu:
            save(context, propose_products([ProductInput(name=n, price=20) for n in menu]))
        return {q["key"] for q in (await get_question_plan())["pending"]}
    finally:
        current.reset(token)


@pytest.mark.parametrize(
    "category,profile,menu,asked,never",
    [
        (
            "Tea stall",
            {"kind": "food", "food": {"halal_relevant": True}},
            ["Masala chai", "Bun maska"],
            {"milk_options", "sugar_free", "takeaway_cups"},
            DIET_QUESTIONS | {"cuisine", "seating"},
        ),
        (
            "Juice bar",
            {"kind": "food", "food": {}},
            [],
            {"milk_options", "sugar_free"},
            DIET_QUESTIONS,
        ),
        (
            "Bakery",
            {"kind": "food", "food": {"halal_relevant": True}},
            [],
            {"bakes", "eggless", "custom_orders"},
            DIET_QUESTIONS,
        ),
        (
            "Snack stall",
            {"kind": "food", "food": {}},
            ["Vada pav", "Bhel puri"],
            {"signature_dish", "seating"},
            DIET_QUESTIONS,
        ),
        (
            "Snack stall",
            {"kind": "food", "food": {}},
            ["Chicken roll", "Egg puff"],
            {"diet"},
            {"halal", "vegetarian_options", "jain_allergens"},
        ),
        (
            "Biryani restaurant",
            {"kind": "food", "food": {"halal_relevant": True}},
            [],
            {"cuisine", "diet", "serves_meat", "jain_allergens", "dine_in_delivery", "seating"},
            {"halal", "milk_options"},
        ),
        (
            "Biryani restaurant",
            {"kind": "food", "food": {"serves_meat": True, "halal_relevant": True}},
            [],
            {"halal", "diet", "jain_allergens"},
            {"serves_meat"},
        ),
        (
            "Butcher",
            {"kind": "food", "food": {"halal_relevant": True}},
            [],
            {"cuts", "selling_units", "halal"},
            {"vegetarian_options", "diet", "seating", "jain_allergens"},
        ),
        (
            "Kirana store",
            {"kind": "grocer", "retail": {}},
            [],
            {"categories", "delivery", "delivery_radius"},
            DIET_QUESTIONS | {"cuisine"},
        ),
        (
            "Food",
            {"kind": "food", "food": {}},
            [],
            {"food_style"},
            DIET_QUESTIONS | {"cuisine"},
        ),
    ],
)
async def test_each_segment_asks_only_what_fits(
    store: MerchantRepository,  # noqa: F811
    category: str,
    profile: dict[str, Any],
    menu: list[str],
    asked: set[str],
    never: set[str],
) -> None:
    keys = await keys_for(store, category, profile, menu)
    assert asked <= keys, keys
    assert not never & keys, never & keys


async def test_tea_stall_selling_meat_snacks_gets_halal_only_with_relevance(store) -> None:  # noqa: F811
    profile = {"kind": "food", "food": {"segment": "beverage", "serves_meat": True}}
    assert "halal" not in await keys_for(store, "Tea stall", profile)
    profile["food"]["halal_relevant"] = True  # type: ignore[index]
    keys = await keys_for(store, "Tea stall", profile)
    assert "halal" in keys and not {"diet", "vegetarian_options"} & keys


async def test_unsure_segment_asks_one_question_then_follows_the_answer(store) -> None:  # noqa: F811
    context = MerchantContext(store, "alice", None, [])
    token = current.set(context)
    try:
        save(context, propose_business("Owner's real name", category="Food stall"))
        pending = (await get_question_plan())["pending"]
        typed = [q for q in pending if q["record_with"] == "custom_facts"]
        assert typed[0]["question"] == "Do you serve meals, or mostly tea and snacks?"
        assert not DIET_QUESTIONS & {q["key"] for q in pending}
        save(
            context,
            propose_customer_facts(
                custom_facts=[
                    FactInput(key="food_style", label="What you serve", value="Mostly chai")
                ]
            ),
        )
        fields = store.context("alice", context.business_id)["business"]["fields"]
        assert fields["profile"]["food"]["segment"] == "beverage"
        keys = {q["key"] for q in (await get_question_plan())["pending"]}
        assert {"milk_options", "takeaway_cups"} <= keys and "food_style" not in keys
        # The internal segment question is not a customer fact.
        assert "food_style" not in str(customer_facts(fields))
        result = propose_customer_facts(vegetarian_options=True)
        assert result["status"] == "invalid"
    finally:
        current.reset(token)


@pytest.mark.parametrize(
    "category,segment",
    [
        ("Tea stall", "beverage"),
        ("Chai tapri", "beverage"),
        ("Kopi stall", "beverage"),
        ("Home baker", "bakery"),
        ("Mithai shop", "bakery"),
        ("Street food snacks", "snack"),
        ("Biryani restaurant", "restaurant"),
        ("Dhaba", "restaurant"),
        ("Halal butcher", "butcher"),
        ("Food", "unknown"),
    ],
)
def test_offline_segment_inference_uses_the_owners_words(category, segment) -> None:
    profile = infer_profile(category)
    assert profile.kind == "food" and food_segment(profile) == segment
    if segment == "butcher":
        assert profile.food and profile.food.serves_meat is True


def test_menu_evidence() -> None:
    assert segment_from_menu(["Masala chai", "Filter coffee", "Lassi", "Samosa"]) == "beverage"
    assert segment_from_menu(["Chai", "Thali", "Biryani"]) == "unknown"
    assert menu_non_veg(["Egg puff"]) and not menu_non_veg(["Veg puff", "Eggless cake"])
    assert food_segment(BusinessTypeProfile(kind="food"), ["Chai", "Coffee", "Kopi"]) == "beverage"
    with pytest.raises(ValueError):
        BusinessTypeProfile.model_validate(
            {"kind": "food", "food": {"segment": "butcher", "diet": "veg_only"}}
        )


async def test_owner_goals_are_asked_once_skippable_and_private(store) -> None:  # noqa: F811
    context = MerchantContext(store, "alice", None, [])
    token = current.set(context)
    try:
        save(
            context,
            propose_business(
                "Owner's real name",
                category="Tea stall",
                profile=BusinessTypeProfile(kind="food", food={"segment": "beverage"}),
            ),
        )
        pending = (await get_question_plan())["pending"]
        assert [q["key"] for q in pending[:3]] == ["focus", "busy_hours", "regulars"]
        assert all(q["skippable"] for q in pending[:3])
        assert [q["key"] for q in pending].count("busy_hours") == 1
        assert propose_customer_facts(focus="more profit")["status"] == "invalid"
        context.repairs = 0
        result = propose_customer_facts(
            focus="less waste", focus_note="Milk going sour", skip=["regulars"]
        )
        assert result["changes"] == [
            "What matters most: (empty) → less_waste",
            "In your words: (empty) → Milk going sour",
            "Not asking again: regulars",
        ]
        # Nothing changes until the owner confirms the review.
        assert (
            "understanding" not in store.context("alice", context.business_id)["business"]["fields"]
        )
        save(context, result)
        keys = [q["key"] for q in (await get_question_plan())["pending"]]
        assert "focus" not in keys and "regulars" not in keys and keys[0] == "busy_hours"
        save(context, propose_customer_facts(regulars="Auto drivers at dawn"))
        fields = store.context("alice", context.business_id)["business"]["fields"]
        assert fields["understanding"] == {
            "focus": "less_waste",
            "focus_note": "Milk going sour",
            "regulars": "Auto drivers at dawn",
            "skipped": [],
        }
        pin_shop(store, "alice", context.business_id)
        store.share("alice", context.business_id, True)
        public = str(store.public_shop(context.business_id))
        assert "Auto drivers" not in public and "less_waste" not in public
    finally:
        current.reset(token)


def test_coach_instruction_carries_the_segment_rules() -> None:
    text = instruction(None)  # type: ignore[arg-type]
    assert "Do you serve meals, or mostly tea and snacks?" in text
    assert "never veg/non-veg or halal" in text and "skippable questions" in text
