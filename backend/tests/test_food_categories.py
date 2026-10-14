import asyncio

import pytest

from app.business_profile import QuestionPlanner
from app.coordinator import (
    ASK_ORDER,
    MerchantContext,
    current,
    get_business_context,
    get_question_plan,
    serves_food,
)
from app.merchant import BusinessFields, MerchantRepository, ProposalRequest
from app.settings import Settings
from tests.test_merchant_store import store as store

FOOD_CATEGORIES = [
    "Coffee",
    "食堂",
    "餐馆",
    "咖啡",
    "面包",
    "茶馆",
    "kedai kopi",
    "makan",
    "restoran",
    "உணவு",
    "காபி",
    "தேநீர்",
    "カフェ",
    "パン",
    "レストラン",
    "음식",
    "카페",
    "커피",
    "warung makan",
    "roti",
    "อาหาร",
    "กาแฟ",
    "ขนมปัง",
    "nhà hàng",
    "quán",
    "cà phê",
    "kainan",
    "karinderya",
    "kape",
    "dhaba",
    "mess",
    "tiffin",
    "chai",
    "चाय",
    "ढाबा",
    "भोजन",
]


@pytest.mark.parametrize("category", FOOD_CATEGORIES)
def test_food_categories_keep_food_questions_in_all_languages(category: str) -> None:
    assert serves_food({"category": category, "name": "Local business"})
    plan = asyncio.run(QuestionPlanner(Settings(_env_file=None)).plan(category))
    assert plan.business_type == "food & drink"


@pytest.mark.parametrize("category", ["Pharmacy", "Hardware store", "Hair salon", "Clothing store"])
def test_non_food_categories_still_skip_food_questions(category: str) -> None:
    assert not serves_food({"category": category, "name": "Local business"})


def test_multilingual_food_plan_asks_halal_and_vegetarian_both_adapters(
    store: MerchantRepository,
) -> None:
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business", business=BusinessFields(name="Local business", category="อาหาร")
        ),
    )
    bid = store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    token = current.set(MerchantContext(store, "alice", bid, []))
    try:
        assert get_business_context()["customer_facts_to_ask"] == list(ASK_ORDER)
        keys = [question["key"] for question in asyncio.run(get_question_plan())["pending"]]
        assert {"halal", "vegetarian_options"} <= set(keys)
    finally:
        current.reset(token)
