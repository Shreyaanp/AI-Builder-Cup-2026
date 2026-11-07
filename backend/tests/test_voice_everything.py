"""Everything by voice: new coach tools, the instant path, starter templates, context caching
and latency measurement. Offline only; no model is called."""

import asyncio
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.agent import INSTRUCTION, instruction, make_agent, turn_instruction
from app.app_guide import FEATURES, explain_app, guide_reply
from app.coordinator import MerchantContext, current
from app.customer import InquiryInput
from app.discover import open_now
from app.instant import IntentIndex, route
from app.latency import LatencyStats, percentile
from app.main import create_app
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.sales import today_for
from app.settings import Settings
from app.starter_templates import business_type, starter_items
from app.streaming import public_events, text_runner, uses_context_cache
from app.voice_tools import (
    SCREENS,
    get_customer_messages,
    open_screen,
    prepare_customer_reply,
    propose_stamp_card,
    set_open_today,
    suggest_starter_items,
)
from tests.pins import SHOP_PIN, pin_shop
from tests.test_merchant_routes import approve, stream_events
from tests.test_photos import join


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
def shop(ctx: MerchantContext) -> MerchantContext:
    proposal = ctx.store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ram Tea Stall",
                category="Tea stall",
                location="Market Road",
                hours="7am-9pm",
                currency="INR",
                timezone="Asia/Kolkata",
            ),
            products=[
                ProductFields(name="Masala chai", price=1500, unit="cup"),
                ProductFields(name="Samosa", price=2000, unit="piece"),
            ],
        ),
    )
    ctx.business_id = ctx.store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    return ctx


def saved(ctx: MerchantContext) -> dict:
    return ctx.store.context(ctx.uid, ctx.business_id)["business"]["fields"]


def approve_in_store(ctx: MerchantContext, proposal_id: str) -> None:
    proposal = ctx.proposals[proposal_id]
    ctx.store.commit(ctx.uid, proposal["id"], proposal["digest"])


# --- Tools -------------------------------------------------------------------------------


def test_closed_today_is_a_review_and_only_closes_today(shop):
    result = set_open_today(open_today=False)
    assert result["status"] == "needs_review"
    today = today_for(saved(shop)).isoformat()
    assert result["changes"] == [f"Closed today ({today})"]
    # Prepared only: nothing changes until the owner confirms.
    assert not saved(shop).get("closed_on")
    approve_in_store(shop, result["proposal_id"])
    assert saved(shop)["closed_on"] == today
    assert set_open_today(open_today=False) == {"status": "no_change", "closed_today": True}
    # Customers see the shop closed today, and open again by hours the next day.
    noon = datetime.fromisoformat(f"{today}T12:00:00+05:30")
    assert open_now("7am-9pm", "Asia/Kolkata", noon, closed_on=today) is False
    assert open_now("7am-9pm", "Asia/Kolkata", noon, closed_on="2000-01-01") is True
    reopened = set_open_today(open_today=True)
    approve_in_store(shop, reopened["proposal_id"])
    assert not saved(shop).get("closed_on")


def test_stamp_card_is_reviewed_and_validated(shop):
    result = propose_stamp_card("Free masala chai", 6)
    assert result["status"] == "needs_review"
    snapshot = shop.proposals[result["proposal_id"]]["snapshot"]["business"]
    assert (snapshot["reward_text"], snapshot["stamps_needed"]) == ("Free masala chai", 6)
    assert saved(shop).get("reward_text") is None
    assert propose_stamp_card("Free chai", 40)["status"] == "invalid"
    assert propose_stamp_card("  ")["status"] == "invalid"


def test_customer_messages_and_prepared_reply_never_send(shop):
    pin_shop(shop.store, "alice", shop.business_id)
    shop.store.share("alice", shop.business_id, True)
    shop.store.add_inquiry(
        shop.business_id,
        InquiryInput(name="Priya Shah", contact="+6591234567", message="Do you deliver?"),
    )
    found = get_customer_messages()
    assert found["waiting"] == 1
    thread = found["threads"][0]
    # First name only; contact details never reach the model.
    assert thread["customer"] == "Priya"
    assert "+65" not in str(found)
    reply = prepare_customer_reply(thread["thread_id"], "Yes, after 6 pm within 2 km.")
    assert reply["status"] == "needs_owner_tap"
    kind, card = shop.cards[reply["card_id"]]
    assert (kind, card["target"], card["thread_id"]) == ("action", "reply", thread["thread_id"])
    # Nothing was sent: the customer is still waiting.
    assert get_customer_messages()["waiting"] == 1
    assert prepare_customer_reply("missing", "Hi")["status"] == "invalid"


@pytest.mark.parametrize("screen", sorted(SCREENS))
def test_open_screen_cards(shop, screen):
    result = open_screen(screen)
    assert result["status"] == "opened"
    assert shop.cards[result["card_id"]] == (
        "action",
        {"target": screen, "label": SCREENS[screen], "business_id": shop.business_id},
    )
    assert open_screen("everything")["status"] == "invalid"


def test_privacy_screen_insists_on_confirmation(shop):
    result = open_screen("privacy")
    assert "confirm" in result["instruction"]


def test_open_screen_needs_a_shop_except_photo_and_privacy(ctx):
    assert open_screen("share")["status"] == "needs_business"
    assert open_screen("photo")["status"] == "opened"


def test_action_cards_reach_the_stream(shop):
    from google.adk.events import Event
    from google.genai import types

    result = open_screen("close_day")
    event = Event(
        author="business_coach",
        content=types.Content(
            role="model",
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(name="open_screen", response=result)
                )
            ],
        ),
    )
    [visible] = public_events(event)
    assert visible.kind == "action" and visible.data["target"] == "close_day"


def test_app_guide_answers_how_to_questions():
    answer = guide_reply("How do I share my page with customers?")
    assert answer and answer.startswith("Share your page and QR")
    assert guide_reply("Samosa is sold out") is None
    assert explain_app("where is close the day")["features"][0]["title"] == "Close the day"
    everything = explain_app("")
    assert len(everything["features"]) == sum(f.audience == "owner" for f in FEATURES)
    assert {f.audience for f in FEATURES} == {"owner", "customer"}


def test_starter_templates_are_suggestions_without_prices(shop):
    assert business_type("Tailor and alterations") == "tailor"
    result = suggest_starter_items()
    assert result["business_type"] == "tea shop"
    names = [item["name"] for item in result["suggestions"]]
    assert "Masala chai" not in names and "Samosa" not in names  # already on the menu
    assert "Cutting chai" in names
    assert all("price" not in item for item in result["suggestions"])
    assert starter_items("Quantum consulting")["suggestions"] == []


def test_new_tools_are_registered_and_explained():
    settings = Settings(_env_file=None, v1_enabled=True)  # type: ignore[call-arg]
    names = {tool.__name__ for tool in make_agent(settings).tools}  # type: ignore[union-attr]
    assert {
        "set_open_today",
        "propose_stamp_card",
        "get_customer_messages",
        "prepare_customer_reply",
        "open_screen",
        "explain_app",
        "suggest_starter_items",
        # Release 2 features by voice: payment links, purchase orders, the shop playbook.
        "prepare_payment_link",
        "draft_reorder",
        "get_purchase_orders",
        "get_shop_playbook",
    } <= names
    for name in ("set_open_today", "open_screen", "explain_app", "prepare_customer_reply"):
        assert name in INSTRUCTION


# --- Instant path --------------------------------------------------------------------------


def run(text: str, ctx: MerchantContext, index: IntentIndex | None = None):
    return asyncio.run(route(text, ctx, index))


def test_instant_sold_out_and_price_change_prepare_one_review(shop):
    result = run("Samosa is sold out", shop)
    assert result and result.intent == "upkeep"
    [event] = result.events
    products = {p["name"]: p for p in event.data["snapshot"]["products"]}
    assert products["Samosa"]["available"] is False
    assert "prepared" in result.reply and "Confirm" in result.reply
    priced = run("Masala chai is 18 rupees now", shop)
    assert priced and "15 → 18" in priced.reply
    # A bare count is not a price change; questions go to the model.
    assert run("Samosa 20", shop) is None
    assert run("How many samosa should I make?", shop) is None


def test_instant_closed_today_and_status(shop):
    closed = run("We're closed today", shop)
    assert closed and closed.intent == "open_today" and closed.events[0].kind == "proposal"
    hours = run("What are my hours?", shop)
    assert hours and hours.reply == "Your hours: 7am-9pm."
    assert run("Any messages?", shop).reply.startswith("No customer is waiting")
    assert run("What's sold out?", shop).reply == "Nothing is marked sold out right now."


@pytest.mark.parametrize(
    ("text", "target"),
    [
        ("Share my page", "share"),
        ("show my QR code", "share"),
        ("Close the day", "close_day"),
        ("Get me on Google", "google"),
        ("Delete my data", "privacy"),
        ("Connect my POS", "import"),
        ("Open payments", "payments"),
        ("Show purchase orders", "supply"),
    ],
)
def test_instant_opens_screens(shop, text, target):
    result = run(text, shop)
    assert result and result.events[0].kind == "action"
    assert result.events[0].data["target"] == target


def test_instant_leaves_payment_links_to_the_payment_tool(shop):
    # "Send ... link" is the customer page, except a payment or UPI link.
    assert run("Send a payment link for 240 to the customer", shop) is None
    assert run("share a UPI link for 50", shop) is None


def test_shop_playbook_by_voice_is_read_only(shop):
    from app.voice_tools import get_shop_playbook

    assert get_shop_playbook()["status"] == "not_ready"


def test_instant_guide_and_fallbacks(shop, ctx):
    guide = run("How do I set up a stamp card?", shop)
    assert guide and guide.intent in {"app_guide", "screen:stamps"}
    # Other languages, long messages, open questions and new shops go to the model.
    assert run("समोसा खत्म हो गया", shop) is None
    assert run("Tell me a story about my shop and how it could grow next year", shop) is None
    shop.new_shop = True
    assert run("Samosa is sold out", shop) is None
    shop.new_shop = False


def test_instant_embedding_match_is_cached_and_read_only(shop):
    calls: list[str] = []

    def embed(text: str) -> list[float]:
        calls.append(text)
        # Toy vectors: one dimension per known phrase family; unrelated text is all zeros.
        return [
            1.0 if "customer" in text and ("write" in text or "wrote" in text) else 0.0,
            1.0 if "run out" in text or "ran out" in text else 0.0,
        ]

    index = IntentIndex(embed)
    result = run("Did a customer write anything", shop, index)
    assert result and result.intent == "messages"
    first = len(calls)
    assert run("Did a customer write anything", shop, index).intent == "messages"
    assert len(calls) == first  # exemplars and the query are cached
    # A paraphrase never triggers a write, and unsure matches fall back to the model.
    assert run("hello there", shop, index) is None


def test_instant_path_over_http_keeps_history_and_measures(tmp_path: Path):
    settings = Settings(
        app_env="test",
        v1_enabled=True,
        coach_mode="offline",
        auth_mode="local",
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        _env_file=None,
    )
    app = create_app(settings, InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                "business": {"name": "Ram Tea Stall"},
                "products": [{"name": "Samosa", "price": 2000, "unit": "piece"}],
            },
        ).json()
        bid = approve(client, proposal)["business_id"]
        events = stream_events(client, {"message": "Samosa is sold out", "business_id": bid})
        kinds = [event["kind"] for event in events]
        assert kinds[-1] == "turn_complete" and "proposal" in kinds and "reply" in kinds
        sid = next(e["session_id"] for e in events if e.get("session_id"))
        history = client.get(f"/api/v1/conversations/{sid}").json()
        texts = str(history)
        assert "Samosa is sold out" in texts and "prepared" in texts
        flows = client.get("/api/v1/latency").json()["flows"]
        assert flows["text_instant"]["n"] >= 1


# --- Context caching and latency -----------------------------------------------------------


def gemini_settings(**changes: object) -> Settings:
    values: dict[str, object] = {
        "coach_mode": "gemini",
        "gemini_backend": "vertex",
        "google_cloud_project": "demo-project",
        "google_text_model": "gemini-3.5-flash",
        "google_live_model": "gemini-3.8-live",
        "v1_enabled": True,
        **changes,
    }
    return Settings(_env_file=None, **values)  # type: ignore[call-arg, arg-type]


def test_context_cache_switch_moves_rules_to_a_static_instruction():
    assert not uses_context_cache(Settings(_env_file=None))  # type: ignore[call-arg]
    assert not uses_context_cache(gemini_settings())
    assert not uses_context_cache(
        gemini_settings(context_cache_enabled=True, gemini_backend="api_key", google_api_key="k")
    )
    settings = gemini_settings(context_cache_enabled=True, context_cache_ttl_seconds=600)
    assert uses_context_cache(settings)
    runner = text_runner(settings, InMemorySessionService())
    assert runner.context_cache_config is not None
    assert runner.context_cache_config.ttl_seconds == 600
    agent = runner.app.root_agent
    assert agent.static_instruction == INSTRUCTION
    # The per-turn part no longer repeats the long rules; without caching nothing changes.
    assert INSTRUCTION not in turn_instruction()
    assert make_agent(gemini_settings()).static_instruction is None
    assert make_agent(gemini_settings()).instruction is instruction
    plain = text_runner(gemini_settings(), InMemorySessionService())
    assert plain.context_cache_config is None


def test_latency_percentiles_and_window():
    assert percentile([], 0.5) == 0.0
    assert percentile([10, 20, 30, 40], 0.5) == 25
    stats = LatencyStats(window=3)
    for ms in (100, 200, 300, 400):
        stats.record("text_agent", ms)
    summary = stats.summary()["text_agent"]
    assert summary["n"] == 3 and summary["p50_ms"] == 300 and summary["p95_ms"] == 390


def test_closed_on_reaches_customers(tmp_path: Path):
    store = MerchantStore(str(tmp_path / "m.sqlite3"))
    today = datetime.now(UTC).date().isoformat()
    proposal = store.propose(
        "bob",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Shut Shop", hours="0:00-23:59", timezone="UTC", **SHOP_PIN
            ),
        ),
    )
    bid = store.commit("bob", proposal["id"], proposal["digest"])["business_id"]
    store.share("bob", bid, True)
    assert "closed_on" not in store.public_shop(bid)
    fields = {**store.context("bob", bid)["business"]["fields"], "closed_on": today}
    update = store.propose(
        "bob",
        ProposalRequest(
            kind="business",
            business_id=bid,
            revision=store.context("bob", bid)["business"]["revision"],
            business=BusinessFields.model_validate(fields),
        ),
    )
    store.commit("bob", update["id"], update["digest"])
    assert store.public_shop(bid)["closed_on"] == today


# --- Customer commands ---------------------------------------------------------------------


def test_customer_commands_answer_without_a_model(tmp_path: Path):
    from app.discover_ask import customer_command
    from tests.test_discover import settings as discover_settings
    from tests.test_discover import shared_shop

    store = MerchantStore(str(tmp_path / "shops.sqlite3"))
    bid = shared_shop(store)
    shops = store.shared_shops()
    here = (1.2847, 103.832, 4000)
    assert customer_command("Show my stamps", shops, *here).kind == "my_stamps"
    directions = customer_command("Directions to Fixture Kopi Shop", shops, *here)
    assert directions.shop_id == bid and "destination=1.2847,103.832" in directions.maps_url
    assert customer_command("follow the fixture kopi shop", shops, *here).kind == "follow"
    ask = customer_command("Ask Fixture Kopi if they have kaya toast?", shops, *here)
    assert ask.kind == "ask_owner" and ask.question == "if they have kaya toast"
    # Unknown shops and ordinary searches stay searches.
    assert customer_command("Directions to Nowhere Cafe", shops, *here) is None
    assert customer_command("cheap kopi near me", shops, *here) is None
    app = create_app(discover_settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        found = client.post(
            "/api/v1/discover/ask", json={"q": "my stamps", "lat": 1.2847, "lng": 103.832}
        ).json()
        assert found["mode"] == "command" and found["command"]["kind"] == "my_stamps"


def test_icon_tools_only_open_the_icon_page(shop):
    from app.voice_tools import make_my_icon, use_photo_as_icon

    for tool, mode in ((make_my_icon, "generate"), (use_photo_as_icon, "photo")):
        result = tool()
        assert result["status"] == "opened"
        kind, card = shop.cards[result["card_id"]]
        assert (kind, card["target"], card["mode"]) == ("action", "icon", mode)
        assert card["business_id"] == shop.business_id
