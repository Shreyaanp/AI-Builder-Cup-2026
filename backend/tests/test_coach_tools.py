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
    MerchantContext,
    ProductInput,
    current,
    get_business_context,
    propose_business,
    propose_products,
    request_registration,
    ui_currency,
)
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
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
        },
        "customer_page_shared": shared,
        "products": [
            {"name": "Chai", "price": 15.0, "unit": "cup", "stock": 10, "available": True}
        ],
        "relevant_history": ctx.recalled,
        "customer_facts_to_ask": [
            "halal",
            "payment_methods",
            "delivery",
            "vegetarian_options",
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


@pytest.mark.parametrize("language", ["hi", "es", "ta-IN"])
def test_instruction_uses_current_fallback_language(ctx, language):
    token = ui_language.set(language)
    try:
        assert instruction(object()).endswith(f"App language (fallback only): {language}")
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
    ctx.store.commit("alice", proposal["id"], proposal["digest"])


def test_customer_fact_is_a_reviewed_edit_that_keeps_everything_else(saved_shop):
    result = propose_business(name="", halal="Yes", payment_methods=["cash", "PayNow"])
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
        "preorders",
        "busy_hours",
    ]
    # A later basics edit (or another fact) never wipes confirmed facts.
    edit = propose_business(name="", hours="8–20", vegetarian_options=False)
    business = saved_shop.proposals[edit["proposal_id"]]["snapshot"]["business"]
    assert business["halal"] == "yes"
    assert business["payment_methods"] == ["cash", "paynow"]
    assert business["vegetarian_options"] is False
    assert business["hours"] == "8–20"


@pytest.mark.parametrize("fact", [{"halal": "maybe"}, {"delivery": "drone"}])
def test_unknown_fact_value_is_repairable(saved_shop, fact):
    result = propose_business(name="", **fact)
    assert result["status"] == "invalid"
    assert saved_shop.proposals == {}


def test_no_facts_to_ask_without_a_shop(ctx):
    assert get_business_context()["customer_facts_to_ask"] == []
