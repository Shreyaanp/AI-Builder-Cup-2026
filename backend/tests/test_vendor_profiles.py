"""Offline classification contracts, relevance, approval and migration for both stores."""

import copy
import hashlib
import json
from typing import Any

import pytest
from fastapi import HTTPException
from google.adk.tools.function_tool import FunctionTool

from app.agent import NEW_SHOP_INSTRUCTION, instruction, new_shop_call, new_shop_reply
from app.business_profile import QuestionPlanner
from app.coordinator import (
    FactInput,
    MerchantContext,
    current,
    get_question_plan,
    propose_business,
    propose_customer_facts,
)
from app.merchant import (
    BusinessFields,
    MerchantRepository,
    MerchantStore,
    NewShopDraft,
    ProposalRequest,
    customer_facts,
)
from app.merchant_firestore import FirestoreMerchantStore
from app.settings import Settings
from app.vendor_profile import BusinessTypeProfile, infer_profile, migrate_profile
from tests.test_merchant_store import store as store

CASES = [
    (
        "Tea stall",
        {"kind": "food", "food": {"serves_meat": False}},
        "menu",
        {"milk_options", "sugar_free", "takeaway_cups"},
    ),
    ("Vegetarian restaurant", {"kind": "food", "food": {"diet": "veg_only"}}, "menu", {"cuisine"}),
    (
        "Halal butcher",
        {
            "kind": "food",
            "food": {
                "diet": "non_veg",
                "serves_meat": True,
                "halal_relevant": True,
            },
        },
        "menu",
        {"halal"},
    ),
    (
        "Tailor",
        {"kind": "tailor", "tailor": {}},
        "services",
        {"services", "turnaround", "measurements"},
    ),
    ("Salon", {"kind": "salon", "salon": {}}, "services", {"services", "booking", "walk_ins"}),
    ("Hardware shop", {"kind": "retail", "retail": {}}, "items", {"categories", "delivery"}),
    (
        "Home baker",
        {"kind": "food", "food": {}},
        "menu",
        {"preorders", "bakes", "eggless", "custom_orders"},
    ),
    (
        "Grocer",
        {"kind": "grocer", "retail": {}},
        "items",
        {"categories", "selling_units", "delivery"},
    ),
    (
        "Plumber",
        {"kind": "service", "service": {}},
        "services",
        {"services", "service_area", "appointment"},
    ),
]


def save(context: MerchantContext, result: dict[str, Any]) -> str:
    assert result["status"] == "needs_review", result
    proposal = context.proposals[result["proposal_id"]]
    receipt = context.store.commit(context.uid, proposal["id"], proposal["digest"])
    context.business_id = receipt["business_id"]
    return receipt["business_id"]


@pytest.mark.parametrize("category,profile,catalogue,expected", CASES)
async def test_each_vendor_gets_only_relevant_questions_and_round_trips(
    store: MerchantRepository,
    category: str,
    profile: dict,
    catalogue: str,
    expected: set[str],
) -> None:
    context = MerchantContext(store, "alice", None, [])
    token = current.set(context)
    try:
        result = propose_business(
            "Owner's actual name",
            category=category,
            location="Singapore",
            profile=BusinessTypeProfile.model_validate(profile),
        )
        assert store.list_businesses("alice") == []
        bid = save(context, result)
        plan = await get_question_plan()
        keys = {q["key"] for q in plan["pending"]}
        assert expected <= keys
        assert plan["profile"]["kind"] == profile["kind"]
        assert plan["vocabulary"]["catalogue"] == catalogue
        if category != "Halal butcher":
            assert "halal" not in keys
        if profile["kind"] != "food":
            assert not {"halal", "vegetarian_options", "diet", "cuisine", "serves_meat"} & keys
        if category == "Vegetarian restaurant":
            assert not {"halal", "vegetarian_options", "diet", "serves_meat"} & keys
        if category == "Halal butcher":
            assert {"cuts", "selling_units", "sourcing"} <= keys
            assert not {"seating", "signature_dish", "price_range"} & keys
        if category in {"Home baker", "Tea stall"}:
            assert not {"seating", "diet", "serves_meat", "cuisine", "vegetarian_options"} & keys
        store.share("alice", bid, True)
        public = store.public_shop(bid)
        assert public and public["facts"]["profile"]["kind"] == profile["kind"]
        assert store.list_businesses("bob") == []
        with pytest.raises(HTTPException):
            store.context("bob", bid)
    finally:
        current.reset(token)


@pytest.mark.parametrize(
    "meat,relevance,expected",
    [
        (None, False, False),
        (True, False, False),
        (False, True, False),
        (True, True, True),
    ],
)
async def test_halal_needs_meat_and_regional_relevance(store, meat, relevance, expected):
    context = MerchantContext(store, "alice", None, [])
    token = current.set(context)
    try:
        save(
            context,
            propose_business(
                "Food vendor",
                category="Food",
                profile=BusinessTypeProfile(
                    kind="food",
                    food={"serves_meat": meat, "halal_relevant": relevance},
                ),
            ),
        )
        keys = {q["key"] for q in (await get_question_plan())["pending"]}
        assert ("halal" in keys) == expected
        result = propose_customer_facts(halal="yes")
        assert result["status"] == ("needs_review" if expected else "invalid")
    finally:
        current.reset(token)


@pytest.mark.parametrize(
    "category,kind",
    [
        ("Tea stall", "food"),
        ("Vegetarian restaurant", "food"),
        ("Halal butcher", "food"),
        ("Tailor", "tailor"),
        ("Hair salon", "salon"),
        ("Hardware shop", "retail"),
        ("Home baker", "food"),
        ("Grocer", "grocer"),
        ("Plumbing service", "service"),
        ("Unfamiliar vendor", "generic"),
    ],
)
def test_offline_fallback_classification(category, kind):
    assert infer_profile(category).kind == kind


async def test_name_then_type_even_when_items_arrive_first(store):
    context = MerchantContext(
        store, "alice", None, [], new_shop=True, new_shop_draft=NewShopDraft()
    )
    token = current.set(context)
    try:
        propose_business("", category="Tailor")
        plan = await get_question_plan()
        assert [q["key"] for q in plan["pending"]] == ["name"]
        propose_business("Actual name")
        assert (await get_question_plan())["profile"]["kind"] == "tailor"
        context.new_shop_draft = NewShopDraft(business=BusinessFields(name="Actual name"))
        assert [q["key"] for q in (await get_question_plan())["pending"]] == ["category"]
        assert "What is your business called?" in new_shop_reply(
            MerchantContext(store, "alice", None, []),
            vague=True,
        )
        assert (
            new_shop_call(
                "I sell chai", MerchantContext(store, "alice", None, [])
            ).function_call.args["name"]
            == ""
        )
        assert "REAL NAME first" in NEW_SHOP_INSTRUCTION
    finally:
        current.reset(token)


async def test_answers_update_typed_profile_and_irrelevant_facts_are_repairable(store):
    context = MerchantContext(store, "alice", None, [])
    token = current.set(context)
    try:
        save(context, propose_business("Fitting Room", category="Tailor"))
        result = propose_customer_facts(
            custom_facts=[
                FactInput(
                    key="turnaround",
                    label="Turnaround",
                    value="Two days",
                )
            ]
        )
        before = store.context("alice", context.business_id)["business"]["fields"]
        assert before["profile"]["tailor"]["turnaround"] == ""
        save(context, result)
        fields = store.context("alice", context.business_id)["business"]["fields"]
        assert fields["profile"]["tailor"]["turnaround"] == "Two days"
        assert "turnaround" not in {q["key"] for q in (await get_question_plan())["pending"]}
        for key in ("halal", "spice_allergens", "walk_ins"):
            result = propose_customer_facts(
                custom_facts=[FactInput(key=key, label=key, value="Yes")]
            )
            assert result["status"] in {"invalid", "ask_owner"}
        assert "Profile and vocabulary" in instruction(None)
        assert '"catalogue": "services"' in instruction(None)
    finally:
        current.reset(token)


def raw_fields(store, bid):
    if isinstance(store, MerchantStore):
        with store.connect() as db:
            return json.loads(
                db.execute("SELECT fields FROM businesses WHERE id=?", (bid,)).fetchone()[0]
            )
    return store.businesses.document(bid).get().to_dict()["fields"]


def test_legacy_migration_preserves_data_revision_and_pending_digest(store):
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Legacy",
                category="Unknown",
                payment_methods=["UPI"],
            ),
        ),
    )
    bid = store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    fields = raw_fields(store, bid)
    fields.pop("profile")
    if isinstance(store, MerchantStore):
        with store.connect() as db:
            db.execute("UPDATE businesses SET fields=? WHERE id=?", (json.dumps(fields), bid))
    else:
        store.businesses.document(bid).update({"fields": fields})
    pending = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business_id=bid,
            revision=1,
            business=BusinessFields(**{**fields, "hours": "9-5"}),
        ),
    )
    snapshot = copy.deepcopy(pending["snapshot"])
    reopened = (
        MerchantStore(store.path)
        if isinstance(store, MerchantStore)
        else FirestoreMerchantStore(
            store.client,
            store.businesses.parent.parent.id,
        )
    )
    read = reopened.context("alice", bid)["business"]
    assert read["fields"] == migrate_profile(fields)
    assert read["revision"] == 1 and "profile" not in raw_fields(store, bid)
    assert migrate_profile(read["fields"]) == read["fields"]
    reopened.commit("alice", pending["id"], pending["digest"])
    assert pending["snapshot"] == snapshot
    assert (
        hashlib.sha256(
            json.dumps(snapshot, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        == pending["digest"]
    )
    assert raw_fields(reopened, bid)["profile"] == {"version": 1, "kind": "generic", "subtype": ""}
    assert reopened.context("alice", bid)["business"]["fields"]["payment_methods"] == ["UPI"]
    assert reopened.commit("alice", pending["id"], pending["digest"])["revision"] == 2


@pytest.mark.parametrize(
    "profile",
    [
        {"version": 2},
        {"kind": "salon", "food": {}},
        {"kind": "food", "food": {"diet": "veg_only", "serves_meat": True}},
        {"kind": "food", "food": {"cuisine": ["x"] * 9}},
    ],
)
def test_profile_boundary_validation(profile):
    with pytest.raises(ValueError):
        BusinessFields(name="Vendor", profile=profile)


def test_profile_tool_schema_builds_offline():
    declaration = FunctionTool(propose_business)._get_declaration()
    assert declaration and declaration.parameters_json_schema
    assert "profile" in declaration.parameters_json_schema["properties"]


async def test_planner_cache_separates_location_and_name():
    planner = QuestionPlanner(Settings(_env_file=None))
    await planner.plan("Food", "First", "Singapore")
    await planner.plan("Food", "Second", "Singapore")
    await planner.plan("Food", "First", "London")
    assert len(planner._cache) == 3


def test_older_client_edits_preserve_the_approved_profile(store):
    first = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Stitch",
                category="Tailor",
                profile={
                    "kind": "tailor",
                    "tailor": {
                        "services": ["Alterations"],
                        "turnaround": "Two days",
                    },
                },
            ),
        ),
    )
    bid = store.commit("alice", first["id"], first["digest"])["business_id"]
    edit = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business_id=bid,
            revision=1,
            business=BusinessFields(name="Stitch", category="Tailor", hours="9-5"),
        ),
    )
    assert edit["snapshot"]["business"]["profile"]["tailor"]["services"] == ["Alterations"]
    store.commit("alice", edit["id"], edit["digest"])
    assert (
        store.context("alice", bid)["business"]["fields"]["profile"]["tailor"]["turnaround"]
        == "Two days"
    )


async def test_diet_correction_removes_inapplicable_halal_only_after_review(store):
    context = MerchantContext(store, "alice", None, [])
    token = current.set(context)
    try:
        save(
            context,
            propose_business(
                "Kitchen",
                category="Restaurant",
                profile=BusinessTypeProfile(
                    kind="food",
                    food={"serves_meat": True, "halal_relevant": True},
                ),
            ),
        )
        save(context, propose_customer_facts(halal="yes"))
        changed = propose_customer_facts(
            custom_facts=[
                FactInput(
                    key="diet",
                    label="Food choices",
                    value="veg_only",
                )
            ]
        )
        assert changed["status"] == "needs_review", changed
        assert store.context("alice", context.business_id)["business"]["fields"]["halal"] == "yes"
        save(context, changed)
        fields = store.context("alice", context.business_id)["business"]["fields"]
        assert "halal" not in fields
        assert fields["profile"]["food"]["diet"] == "veg_only"
        assert fields["profile"]["food"]["serves_meat"] is False
        assert "halal" not in {q["key"] for q in (await get_question_plan())["pending"]}
    finally:
        current.reset(token)


def test_both_stores_still_require_name_at_commit(store):
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="",
                category="Tailor",
                profile={"kind": "tailor"},
            ),
        ),
    )
    with pytest.raises(HTTPException) as rejected:
        store.commit("alice", proposal["id"], proposal["digest"])
    assert rejected.value.status_code == 422
    assert store.list_businesses("alice") == []


async def test_delivery_in_the_profile_is_not_asked_again(store):
    context = MerchantContext(store, "alice", None, [])
    token = current.set(context)
    try:
        save(
            context,
            propose_business(
                "Tools",
                category="Hardware shop",
                profile=BusinessTypeProfile(
                    kind="retail",
                    retail={"categories": ["Tools"], "delivery": "own"},
                ),
            ),
        )
        assert "delivery" not in {q["key"] for q in (await get_question_plan())["pending"]}
        save(context, propose_customer_facts(delivery="Courier"))
        fields = store.context("alice", context.business_id)["business"]["fields"]
        assert fields["delivery"] == fields["profile"]["retail"]["delivery"] == "Courier"
    finally:
        current.reset(token)


async def test_legacy_vegetarian_category_never_gets_irrelevant_food_questions(store):
    context = MerchantContext(store, "alice", None, [])
    created = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Vegetarian",
                category="Vegetarian restaurant",
                halal="yes",
            ),
        ),
    )
    context.business_id = store.commit("alice", created["id"], created["digest"])["business_id"]
    token = current.set(context)
    try:
        keys = {q["key"] for q in (await get_question_plan())["pending"]}
        assert not {"halal", "vegetarian_options"} & keys
        fields = store.context("alice", context.business_id)["business"]["fields"]
        assert fields["profile"]["kind"] == "generic" and fields["halal"] == "yes"
        assert "halal" not in customer_facts(fields)
    finally:
        current.reset(token)
