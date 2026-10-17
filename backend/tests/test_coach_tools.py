import asyncio
import hashlib
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException
from google.adk.events import Event
from google.genai import types

from app.agent import instruction, ui_language
from app.coordinator import (
    MAX_REPAIRS,
    SUSPICIOUS_PRICE_RATIO,
    FactInput,
    MerchantContext,
    ProductInput,
    current,
    get_business_context,
    get_insights,
    get_question_plan,
    propose_business,
    propose_customer_facts,
    propose_products,
    remember_note,
    request_registration,
    ui_currency,
)
from app.merchant import BusinessFields, MerchantStore, NewShopDraft, ProductFields, ProposalRequest
from app.streaming import public_events
from scripts.coach_eval import Turn, no_internal_leaks, prepared_not_saved, sane_prices


@pytest.fixture
def ctx(tmp_path: Path) -> Iterator[MerchantContext]:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    context = MerchantContext(store, "alice", None, [])
    token = current.set(context)
    try:
        yield context
    finally:
        current.reset(token)


@pytest.fixture
def saved_shop(ctx: MerchantContext) -> MerchantContext:
    proposal = ctx.store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ram Tea Stall", category="Tea", location="Market Road", hours="7–21"
            ),
            products=[ProductFields(name="Chai", price=1500, unit="cup", stock=10)],
        ),
    )
    ctx.business_id = ctx.store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    return ctx


@pytest.fixture
def multi_unit_shop(ctx: MerchantContext) -> MerchantContext:
    proposal = ctx.store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ah Kow Kopitiam", category="Cafe", location="Chinatown", hours="7–21"
            ),
            products=[
                ProductFields(name="Kaya toast", price=250, unit="plate", stock=20),
                ProductFields(name="Kaya toast", price=600, unit="box", stock=15),
            ],
        ),
    )
    ctx.business_id = ctx.store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    return ctx


def assert_sealed(proposal: dict[str, Any]) -> None:
    snapshot = json.dumps(proposal["snapshot"], sort_keys=True, ensure_ascii=False)
    assert proposal["digest"] == hashlib.sha256(snapshot.encode()).hexdigest()


@pytest.mark.parametrize("shared", [False, True])
def test_context_exposes_only_readable_shop_and_major_unit_products(saved_shop, shared):
    ctx = saved_shop
    ctx.store.share("alice", ctx.business_id, shared)
    ctx.recalled.append("Owner prefers morning opening.")
    result = get_business_context()
    assert result == {
        "shop": {
            "name": "Ram Tea Stall",
            "category": "Tea",
            "location": "Market Road",
            "hours": "7–21",
            "phone": "",
            "currency": "SGD",
            "profile": {"version": 1, "kind": "generic", "subtype": ""},
        },
        "customer_page_shared": shared,
        "products": [
            {"name": "Chai", "price": 15.0, "unit": "cup", "stock": 10, "available": True}
        ],
        "relevant_history": ctx.recalled,
        "remembered_notes": [],
        "customer_facts_to_ask": [
            "payment_methods",
            "delivery",
            "vegetarian_options",
            "locally_made",
            "preorders",
            "busy_hours",
        ],
    }
    assert isinstance(result["products"][0]["price"], float)
    serialized = json.dumps(result)
    for internal in ("1500", "alice", "revision", "owner", ctx.business_id):
        assert internal not in serialized


def test_new_shop_returns_id_and_keeps_sealed_proposal_private(ctx):
    result = propose_business(name="New Tea Stall", location="Market Road")
    assert set(result) == {"status", "proposal_id", "changes"}
    assert result["status"] == "needs_review"
    assert result["changes"] == ["New shop: New Tea Stall"]
    assert set(ctx.proposals) == {result["proposal_id"]}
    proposal = ctx.proposals[result["proposal_id"]]
    assert set(proposal) == {"id", "digest", "expires", "snapshot"}
    assert proposal["snapshot"]["business"]["name"] == "New Tea Stall"
    assert proposal["snapshot"]["kind"] == "business"
    assert_sealed(proposal)
    assert ctx.store.list_businesses("alice") == []
    assert "proposal" not in result
    assert "revision" not in json.dumps(result)


def test_hours_only_edit_preserves_saved_fields(saved_shop):
    result = propose_business(name="", hours="8–20")
    proposal = saved_shop.proposals[result["proposal_id"]]
    assert proposal["snapshot"]["business"] == {
        "name": "Ram Tea Stall",
        "category": "Tea",
        "location": "Market Road",
        "hours": "8–20",
        "phone": "",
        "currency": "SGD",
    }
    assert result["changes"] == ["hours: 7–21 → 8–20"]
    assert_sealed(proposal)
    assert get_business_context()["shop"]["hours"] == "7–21"


@pytest.mark.parametrize("currency, expected", [(None, "JPY"), ("MYR", "MYR"), ("invalid", "JPY")])
def test_new_shop_currency_uses_phone_fallback(ctx, currency, expected):
    token = ui_currency.set("JPY")
    try:
        result = (
            propose_business(name="New Tea Stall")
            if currency is None
            else propose_business(name="New Tea Stall", currency=currency)
        )
        proposal = ctx.proposals[result["proposal_id"]]
        assert proposal["snapshot"]["business"]["currency"] == expected
    finally:
        ui_currency.reset(token)


@pytest.mark.parametrize("currency", ["", "MYR"])
def test_existing_shop_keeps_currency_with_phone_fallback(saved_shop, currency):
    token = ui_currency.set("JPY")
    try:
        result = propose_business(name="", hours="8–20", currency=currency)
        proposal = saved_shop.proposals[result["proposal_id"]]
        assert proposal["snapshot"]["business"]["currency"] == "SGD"
        assert get_business_context()["shop"]["currency"] == "SGD"
    finally:
        ui_currency.reset(token)


def test_bare_string_items_are_repairable_not_a_crash(saved_shop):
    # Seen live: the model sent ["Chai"] instead of objects, which crashed the whole turn.
    result = propose_products(["Chai"])  # type: ignore[list-item]
    assert result["status"] == "invalid"
    assert saved_shop.proposals == {}


def test_sold_out_by_name_keeps_saved_price_and_unit(saved_shop):
    result = propose_products([ProductInput(name="chai", available=False)])
    product = saved_shop.proposals[result["proposal_id"]]["snapshot"]["products"][0]
    assert product == {
        "name": "Chai",
        "price": 1500,
        "unit": "cup",
        "stock": 10,
        "available": False,
    }
    assert result["changes"] == ["Chai: sold out"]
    assert propose_products([ProductInput(name="Bun")])["status"] == "invalid"


def test_ambiguous_name_missing_unit_asks(multi_unit_shop):
    # When an item exists in several units and the caller omits unit (defaults to "item"):
    result = propose_products([ProductInput(name="Kaya toast", price=3.5)])
    assert result["status"] == "invalid"
    assert result["repairs_left"] == MAX_REPAIRS
    assert len(result["errors"]) == 1
    error = result["errors"][0]
    assert error["field"] == "unit"
    assert "plate" in error["problem"] and "box" in error["problem"]
    assert "Kaya toast" in error["problem"]
    assert multi_unit_shop.proposals == {}

    # Repeated calls exhaust repairs and return ask_owner
    propose_products([ProductInput(name="Kaya toast", price=3.5)])
    final = propose_products([ProductInput(name="Kaya toast", price=3.5)])
    assert final["status"] == "ask_owner"
    assert "Ask the owner" in final["instruction"]


def test_ambiguous_name_exact_unit_updates_the_right_one(multi_unit_shop):
    # Updating plate price
    result = propose_products([ProductInput(name="Kaya toast", price=3.0, unit="plate")])
    assert result["status"] == "needs_review"
    assert result["changes"] == ["Kaya toast: price 2.5 → 3 per plate"]
    proposal = multi_unit_shop.proposals[result["proposal_id"]]
    assert proposal["snapshot"]["products"][0]["unit"] == "plate"
    assert proposal["snapshot"]["products"][0]["price"] == 300

    # Updating box price
    result_box = propose_products([ProductInput(name="Kaya toast", price=7.0, unit="box")])
    assert result_box["status"] == "needs_review"
    assert result_box["changes"] == ["Kaya toast: price 6 → 7 per box"]
    proposal_box = multi_unit_shop.proposals[result_box["proposal_id"]]
    assert proposal_box["snapshot"]["products"][0]["unit"] == "box"
    assert proposal_box["snapshot"]["products"][0]["price"] == 700


def test_ambiguous_name_unit_synonyms_resolve(multi_unit_shop):
    # "plates" maps to "plate"
    result = propose_products([ProductInput(name="kaya toast", price=2.8, unit="plates")])
    assert result["status"] == "needs_review"
    assert result["changes"] == ["Kaya toast: price 2.5 → 2.8 per plate"]

    # "boxes" maps to "box"
    result_box = propose_products([ProductInput(name="kaya toast", price=6.5, unit="boxes")])
    assert result_box["status"] == "needs_review"
    assert result_box["changes"] == ["Kaya toast: price 6 → 6.5 per box"]


def test_ambiguous_shop_new_item_still_allowed(multi_unit_shop):
    result = propose_products([ProductInput(name="Kopi", price=1.8, unit="cup")])
    assert result["status"] == "needs_review"
    assert result["changes"] == ["New item: Kopi, 1.8 per cup"]
    proposal = multi_unit_shop.proposals[result["proposal_id"]]
    assert proposal["snapshot"]["products"][0]["name"] == "Kopi"
    assert proposal["snapshot"]["products"][0]["price"] == 180


def test_sold_out_ambiguity_asks(multi_unit_shop):
    # Ambiguous sold-out without unit asks which unit rather than saying "new item needs a price"
    result = propose_products([ProductInput(name="Kaya toast", available=False)])
    assert result["status"] == "invalid"
    assert len(result["errors"]) == 1
    error = result["errors"][0]
    assert error["field"] == "unit"
    assert "plate" in error["problem"] and "box" in error["problem"]
    assert "a new item needs a price" not in error["problem"]

    # Specifying unit marks that specific unit sold out
    box_result = propose_products([ProductInput(name="Kaya toast", unit="box", available=False)])
    assert box_result["status"] == "needs_review"
    assert box_result["changes"] == ["Kaya toast: sold out"]
    proposal = multi_unit_shop.proposals[box_result["proposal_id"]]
    product = proposal["snapshot"]["products"][0]
    assert product["unit"] == "box"
    assert product["price"] == 600
    assert product["available"] is False


def test_new_shop_draft_path_ambiguity(ctx):
    ctx.new_shop = True
    ctx.new_shop_draft = NewShopDraft(
        business=BusinessFields(name="Draft Shop", category="Cafe", location="Bedok"),
        products=[
            ProductFields(name="Kaya toast", price=250, unit="plate"),
            ProductFields(name="Kaya toast", price=600, unit="box"),
        ],
    )
    result = propose_products([ProductInput(name="Kaya toast", price=3.5)])
    assert result["status"] == "invalid"
    assert "plate" in result["errors"][0]["problem"] and "box" in result["errors"][0]["problem"]


def test_zero_decimal_shop_uses_whole_yen(ctx):
    result = propose_business(name="Ramen Ichi", location="Shibuya", currency="jpy")
    proposal = ctx.proposals[result["proposal_id"]]
    assert proposal["snapshot"]["business"]["currency"] == "JPY"
    ctx.business_id = ctx.store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    result = propose_products([ProductInput(name="Ramen", price=980, unit="bowl")])
    products = ctx.proposals[result["proposal_id"]]["snapshot"]["products"]
    assert products[0]["price"] == 980
    assert result["changes"] == ["New item: Ramen, 980 per bowl"]
    # An edit that does not mention currency keeps the saved one.
    edit = propose_business(name="", hours="11–22")
    assert ctx.proposals[edit["proposal_id"]]["snapshot"]["business"]["currency"] == "JPY"


def test_multiple_products_use_one_sealed_inventory_proposal(saved_shop):
    result = propose_products(
        [ProductInput(name="Samosa", price=12.5, unit="plate"), ProductInput(name="Bun", price=10)]
    )
    assert result["status"] == "needs_review"
    assert set(saved_shop.proposals) == {result["proposal_id"]}
    proposal = saved_shop.proposals[result["proposal_id"]]
    assert proposal["snapshot"]["kind"] == "inventory"
    assert proposal["snapshot"]["business_id"] == saved_shop.business_id
    assert [p["price"] for p in proposal["snapshot"]["products"]] == [1250, 1000]
    assert [p["name"] for p in proposal["snapshot"]["products"]] == ["Samosa", "Bun"]
    assert result["changes"] == ["New item: Samosa, 12.5 per plate", "New item: Bun, 10 per item"]
    assert "proposal" not in result
    assert "1250" not in json.dumps(result)
    assert_sealed(proposal)
    assert len(get_business_context()["products"]) == 1


def test_correction_preserves_saved_spelling_unit_stock_and_reports_sold_out(saved_shop):
    result = propose_products([ProductInput(name="chai", price=12.5, unit="CUP", available=False)])
    product = saved_shop.proposals[result["proposal_id"]]["snapshot"]["products"][0]
    assert product == {
        "name": "Chai",
        "price": 1250,
        "unit": "cup",
        "stock": 10,
        "available": False,
    }
    assert result["changes"] == ["Chai: price 15 → 12.5 per cup", "Chai: sold out"]
    assert result["warnings"] == []


@pytest.mark.parametrize("price, warned", [(150, True), (16, False)])
def test_price_jump_warning(saved_shop, price, warned):
    assert 150 / 15 > SUSPICIOUS_PRICE_RATIO
    assert 16 / 15 < SUSPICIOUS_PRICE_RATIO
    result = propose_products([ProductInput(name="Chai", price=price, unit="cup")])
    assert result["status"] == "needs_review"
    assert bool(result["warnings"]) is warned
    if warned:
        assert result["warnings"] == [
            "Chai: price changes from 15 to 150. Ask the owner to confirm this is correct."
        ]


@pytest.mark.parametrize("name, price, field", [("", 15, "name"), ("Chai", -1, "price")])
def test_invalid_fields_exhaust_repairs_in_same_context(saved_shop, name, price, field):
    for attempt in range(1, MAX_REPAIRS + 1):
        result = propose_products([ProductInput(name=name, price=price, unit="cup")])
        assert result["status"] == "invalid"
        assert result["repairs_left"] == MAX_REPAIRS - attempt + 1
        assert any(e["field"] == field and e["problem"] for e in result["errors"])
    result = propose_products([ProductInput(name=name, price=price, unit="cup")])
    assert result["status"] == "ask_owner"
    assert "Ask the owner" in result["instruction"]
    assert saved_shop.repairs == MAX_REPAIRS + 1
    assert saved_shop.proposals == {}


def test_products_without_business_require_shop_first(ctx):
    assert propose_products([ProductInput(name="Chai", price=15)])["status"] == "needs_business"
    assert ctx.proposals == {}
    assert ctx.repairs == 0


@pytest.mark.parametrize("tool", [get_business_context, propose_business, request_registration])
def test_other_owner_cannot_read_propose_business_or_register(saved_shop, tool):
    token = current.set(MerchantContext(saved_shop.store, "bob", saved_shop.business_id, []))
    try:
        with pytest.raises(HTTPException) as caught:
            tool(name="Stolen shop") if tool is propose_business else tool()
        assert caught.value.status_code == 404
        assert caught.value.detail == "Business not found."
        assert current.get().proposals == {}
    finally:
        current.reset(token)


def test_other_owner_cannot_propose_products(saved_shop):
    ctx = MerchantContext(saved_shop.store, "bob", saved_shop.business_id, [])
    token = current.set(ctx)
    try:
        result = propose_products([ProductInput(name="Chai", price=12, unit="cup")])
        assert result["status"] == "invalid"
        assert result["errors"] == [{"field": "record", "problem": "Business not found."}]
        assert "Ram Tea Stall" not in json.dumps(result)
        assert "1500" not in json.dumps(result)
        assert ctx.proposals == {}
    finally:
        current.reset(token)


@pytest.mark.parametrize("known", [True, False])
def test_function_response_resolves_only_known_review_proposal(saved_shop, known):
    result = propose_products([ProductInput(name="Chai", price=12.5, unit="cup")])
    proposal_id = result["proposal_id"] if known else "unknown-id"
    event = Event(
        author="business_coach",
        content=types.Content(
            role="user",
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(
                        name="propose_products",
                        response={"status": "needs_review", "proposal_id": proposal_id},
                    )
                )
            ],
        ),
    )
    visible = public_events(event)
    if known:
        assert len(visible) == 1
        assert visible[0].kind == "proposal"
        assert visible[0].data == saved_shop.proposals[proposal_id]
        assert_sealed(visible[0].data)
    else:
        assert visible == []


@pytest.mark.parametrize("partial, kind", [(True, "delta"), (False, "reply")])
def test_model_text_excludes_thought_parts(ctx, partial, kind):
    event = Event(
        author="business_coach",
        partial=partial,
        content=types.Content(
            role="model",
            parts=[
                types.Part(text="hidden reasoning", thought=True),
                types.Part(text="Please review "),
                types.Part(text="the prepared changes."),
            ],
        ),
    )
    visible = public_events(event)
    assert len(visible) == 1
    assert visible[0].kind == kind
    assert visible[0].text == "Please review the prepared changes."
    assert "hidden reasoning" not in visible[0].model_dump_json()
    event.content.parts = [types.Part(text="hidden reasoning", thought=True)]
    assert public_events(event) == []


@pytest.mark.parametrize(
    ("language", "pinned"),
    [("hi", "Hindi (hi-IN)"), ("es", "English (en-US)"), ("ta-IN", "Tamil (ta-IN)")],
)
def test_instruction_pins_the_app_language(ctx, language, pinned):
    token = ui_language.set(language)
    try:
        assert f"Always speak and write in {pinned}." in instruction(object())
    finally:
        ui_language.reset(token)


@pytest.mark.parametrize("reply", ["taiyar kar diya hai", "I have prepared"])
def test_eval_accepts_prepared_language(ctx, reply):
    assert prepared_not_saved(Turn(reply=reply))


@pytest.mark.parametrize(
    "reply",
    [
        "I've added chai",
        "maine add kar diya",
        "मैंने चाय दर्ज कर दी",
    ],
)
def test_eval_rejects_completed_change_claims(ctx, reply):
    assert not prepared_not_saved(Turn(reply=reply))


@pytest.mark.parametrize("reply", ["Available: True", "[language=en] Hello", "proposal_id: draft"])
def test_eval_rejects_internal_leaks(ctx, reply):
    assert not no_internal_leaks(Turn(reply=reply))


@pytest.mark.parametrize("price, sane", [(15, True), (1500, False)])
def test_eval_prices_are_major_units(ctx, price, sane):
    turn = Turn(
        tools=[{"name": "propose_products", "args": {"items": [{"name": "Chai", "price": price}]}}]
    )
    assert sane_prices(turn) is sane


def commit(ctx: MerchantContext, result: dict[str, Any]) -> None:
    proposal = ctx.proposals[result["proposal_id"]]
    receipt = ctx.store.commit("alice", proposal["id"], proposal["digest"])
    # A newly created shop becomes the active one, as in the app.
    ctx.business_id = ctx.business_id or receipt["business_id"]


def test_customer_fact_is_a_reviewed_edit_that_keeps_everything_else(saved_shop):
    result = propose_customer_facts(halal="Yes", payment_methods=["cash", "PayNow"])
    assert result["status"] == "needs_review"
    assert result["changes"] == [
        "halal: (empty) → yes",
        "payment_methods: (empty) → ['cash', 'paynow']",
    ]
    proposal = saved_shop.proposals[result["proposal_id"]]
    assert proposal["snapshot"]["business"] == {
        "name": "Ram Tea Stall",
        "category": "Tea",
        "location": "Market Road",
        "hours": "7–21",
        "phone": "",
        "currency": "SGD",
        "halal": "yes",
        "payment_methods": ["cash", "paynow"],
    }
    assert_sealed(proposal)
    # Nothing is saved until the owner confirms.
    assert "halal" not in get_business_context()["shop"]
    commit(saved_shop, result)
    context = get_business_context()
    assert context["shop"]["halal"] == "yes"
    assert context["customer_facts_to_ask"] == [
        "delivery",
        "vegetarian_options",
        "locally_made",
        "preorders",
        "busy_hours",
    ]
    # A later basics edit (or another fact) never wipes confirmed facts.
    edit = propose_business(name="", hours="8–20")
    business = saved_shop.proposals[edit["proposal_id"]]["snapshot"]["business"]
    assert business["halal"] == "yes"
    assert business["payment_methods"] == ["cash", "paynow"]
    assert business["hours"] == "8–20"
    fact = propose_customer_facts(vegetarian_options=False)
    business = saved_shop.proposals[fact["proposal_id"]]["snapshot"]["business"]
    assert business["vegetarian_options"] is False
    assert business["halal"] == "yes"


@pytest.mark.parametrize("fact", [{"halal": "maybe"}, {"delivery": "x" * 41}])
def test_unknown_fact_value_is_repairable(saved_shop, fact):
    result = propose_customer_facts(**fact)
    assert result["status"] == "invalid"
    assert saved_shop.proposals == {}


def test_coach_preserves_global_fact_names(saved_shop):
    result = propose_customer_facts(payment_methods=["UPI", "PhonePe"], delivery="Swiggy")
    assert result["status"] == "needs_review"
    proposal = saved_shop.proposals[result["proposal_id"]]
    assert proposal["snapshot"]["business"]["payment_methods"] == ["UPI", "PhonePe"]
    assert proposal["snapshot"]["business"]["delivery"] == "Swiggy"
    assert "payment_methods" not in get_business_context()["shop"]
    commit(saved_shop, result)
    assert get_business_context()["shop"]["delivery"] == "Swiggy"


def test_no_facts_to_ask_without_a_shop(ctx):
    assert get_business_context()["customer_facts_to_ask"] == []


def test_question_plan_fits_the_business_type(ctx):
    created = propose_business(name="Glow Hair Studio", category="Hair salon", location="Bugis")
    commit(ctx, created)
    plan = asyncio.run(get_question_plan())
    assert plan["business_type"] == "beauty salon"
    keys = [question["key"] for question in plan["pending"]]
    assert "walk_ins" in keys and "booking" in keys
    # One list: common facts first (no food facts for a salon), then salon questions.
    assert keys[0] == "payment_methods"
    assert not {"halal", "delivery", "vegetarian_options"} & set(keys)
    assert plan["pending"][0]["record_with"] == "payment_methods"
    assert plan["pending"][-1]["record_with"] == "custom_facts"


def test_custom_fact_answers_merge_by_key_and_leave_the_plan(ctx):
    commit(ctx, propose_business(name="Glow Hair Studio", category="Hair salon"))
    first = propose_customer_facts(
        custom_facts=[FactInput(key="walk_ins", label="Walk-ins", value="Appointments only")],
    )
    assert first["changes"] == ["Walk-ins: (empty) → Appointments only"]
    commit(ctx, first)
    second = propose_customer_facts(
        custom_facts=[
            {"key": "walk_ins", "label": "Walk-ins", "value": "Walk-ins welcome"},
            {"key": "booking", "label": "How to book", "value": "WhatsApp"},
        ],
    )
    assert second["changes"] == [
        "Walk-ins: Appointments only → Walk-ins welcome",
        "How to book: (empty) → WhatsApp",
    ]
    commit(ctx, second)
    saved = get_business_context()["shop"]["custom_facts"]
    assert [fact["key"] for fact in saved] == ["walk_ins", "booking"]
    pending = [q["key"] for q in asyncio.run(get_question_plan())["pending"]]
    assert "walk_ins" not in pending and "booking" not in pending
    bid = ctx.business_id
    ctx.store.share("alice", bid, True)
    public = ctx.store.public_shop(bid)
    assert public is not None
    assert {"key": "booking", "label": "How to book", "value": "WhatsApp"} in public["facts"][
        "custom"
    ]


def test_question_plan_needs_a_shop_first(ctx):
    assert asyncio.run(get_question_plan())["status"] == "needs_business"


def test_location_validation_runs():
    # Regression: a merge once made this validator unreachable.
    with pytest.raises(ValueError):
        BusinessFields(name="Pin", lat=1.28)
    with pytest.raises(ValueError):
        BusinessFields(name="Zone", timezone="Not/AZone")


def test_remember_note_is_private_deduplicated_and_in_context(saved_shop):
    assert remember_note("Closed on Mondays during Ramadan")["status"] == "remembered"
    assert remember_note("closed on mondays during ramadan")["status"] == "already_remembered"
    assert remember_note("   ")["status"] == "invalid"
    assert get_business_context()["remembered_notes"] == ["Closed on Mondays during Ramadan"]
    for index in range(40):
        remember_note(f"Note {index}")
    notes = saved_shop.store.context("alice", saved_shop.business_id)["business"]["coach_notes"]
    assert len(notes) == 30 and notes[-1]["text"] == "Note 39"
    # Notes are the coach's private memory: never on the customer page.
    saved_shop.store.share("alice", saved_shop.business_id, True)
    public = saved_shop.store.public_shop(saved_shop.business_id)
    assert "Note 39" not in json.dumps(public)


def test_insights_without_sales_suggest_importing(saved_shop):
    insights = get_insights()
    assert insights["has_sales_data"] is False
    assert insights["unanswered_customer_messages"] == 0
    assert insights["revenue"] == 0
    assert get_insights.__doc__ and "importing" in get_insights.__doc__


def test_tools_need_a_shop(ctx):
    assert remember_note("x")["status"] == "needs_business"
    assert get_insights()["status"] == "needs_business"


def test_instruction_carries_a_shop_snapshot_to_save_a_tool_round_trip(ctx, saved_shop) -> None:
    from app.agent import instruction

    text = instruction(None)  # type: ignore[arg-type]
    assert "Current shop (saved" in text
    assert "Ram Tea Stall" in text and "Chai 15/cup" in text
    ctx.business_id = None  # no saved shop yet: no snapshot
    assert "Current shop (saved" not in instruction(None)  # type: ignore[arg-type]


def test_new_shop_records_items_before_the_name_but_never_opens_unnamed(ctx):
    # Owner feedback (16 Oct): the coach asks for the real name and never invents one, so items
    # mentioned first are recorded on an unnamed draft; opening it still requires a name.
    ctx.new_shop = True
    result = propose_products([ProductInput(name="Masala chai", price=15, unit="cup")])
    assert result["status"] == "needs_review"
    proposal = ctx.proposals[result["proposal_id"]]
    assert proposal["snapshot"]["business"]["name"] == ""
    assert [p["name"] for p in proposal["snapshot"]["products"]] == ["Masala chai"]
    with pytest.raises(HTTPException) as refused:
        ctx.store.commit("alice", proposal["id"], proposal["digest"])
    assert refused.value.status_code == 422
    named = propose_business(name="Sharma Chai Corner")
    sealed = ctx.proposals[named["proposal_id"]]
    assert [p["name"] for p in sealed["snapshot"]["products"]] == ["Masala chai"]
    assert ctx.store.commit("alice", sealed["id"], sealed["digest"])["business_id"]
