"""The supplier chat answers only messages clearly about the supplier list (OB-265 review on #718).

After a supplier search, everyday owner messages with words like compare, cheapest, sasta, save,
remove or first still go to their own paths (menu, price change, expense, sales, photos), on the
live coach and the public demo, in English, Hinglish and Hindi. Save and remove never fire from
them. The real follow-ups ("which is cheapest?", "save the second one", "pehla wala") still work.
"""

import asyncio
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from app import supplier_book, supply_chain
from app.agent import ui_language
from app.coordinator import MerchantContext, current, find_suppliers
from app.instant import route
from app.merchant import MerchantStore
from app.supplier_chat import answer
from tests.test_merchant_routes import settings  # noqa: F401 - shared fixture
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo_no_paid_ai import live_parent_demo, no_paid_calls  # noqa: F401
from tests.test_supply_one_system import open_shop
from tests.test_supply_one_system_chat import events_of

SUPPLIER_INTENTS = {"compare_suppliers", "save_supplier", "remove_supplier", "prepare_order"}

# The review's table, plus the same messages in Hinglish and Hindi.
NOT_ABOUT_SUPPLIERS = [
    # Writes the owner never asked for.
    "remember the first customer wants extra sugar",
    "remove the first item from my menu",
    "pehle customer ko yaad rakho extra cheeni",
    "menu se pehla item hatao",
    "पहले ग्राहक को याद रखो चीनी ज़्यादा",
    "मेनू से पहला आइटम हटाओ",
    # Sales.
    "compare sales with last month",
    "pichle mahine se sales compare karo",
    "पिछले महीने से बिक्री की तुलना करो",
    # Price changes.
    "samosa sasta karo",
    "समोसा सस्ता करो",
    "make samosa cheaper",
    # Menu questions.
    "what's the cheapest item on my menu?",
    "which dish is cheapest?",
    "menu mein sabse sasta item kaunsa hai",
    "मेनू में सबसे सस्ता आइटम कौन सा है",
    "is milk cheaper than last week?",
    # Photos.
    "save the second photo",
    "doosri photo save karo",
    "दूसरी फोटो सेव करो",
    # Expenses.
    "remember 300 rupees milk expense",
    "first 300 ka kharcha save karo",
    "पहला 300 का खर्चा सेव करो",
]


@pytest.fixture
def listed(tmp_path: Path) -> Iterator[tuple[MerchantStore, str, MerchantContext, dict[str, Any]]]:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    bid = open_shop(store)
    ctx = MerchantContext(store, "alice", bid, [])
    token = current.set(ctx)
    try:
        found = asyncio.run(find_suppliers("Milk"))
        assert found["status"] == "found", found
        yield store, bid, ctx, found
    finally:
        current.reset(token)


def rules(store: MerchantStore, bid: str) -> list[dict[str, Any]]:
    return store.feature_docs.scoped(supply_chain.RULES, bid, 50)


@pytest.mark.parametrize("language", ["en", "hi"])
@pytest.mark.parametrize("text", NOT_ABOUT_SUPPLIERS)
def test_live_coach_leaves_everyday_messages_to_their_own_path(listed, text, language) -> None:
    store, bid, ctx, _found = listed
    token = ui_language.set(language)
    try:
        result = asyncio.run(route(text, ctx, None, ()))
    finally:
        ui_language.reset(token)
    assert result is None or result.intent not in SUPPLIER_INTENTS, (text, result)
    assert rules(store, bid) == []
    assert all(kind != "order" for kind, _ in ctx.cards.values())


@pytest.mark.parametrize("text", NOT_ABOUT_SUPPLIERS)
def test_save_and_remove_never_fire_from_an_everyday_message(listed, text) -> None:
    store, bid, ctx, found = listed
    # With a supplier already saved, nothing removes it either.
    supplier_book.save(store, "alice", bid, found["suppliers"][0]["id"])
    before = rules(store, bid)
    assert answer(ctx, text, ordering=True) is None
    assert rules(store, bid) == before


def test_an_everyday_message_ends_the_follow_up(listed) -> None:
    """After "compare sales", a bare "which is cheapest?" is no longer about the old list..."""
    _store, _bid, ctx, _found = listed
    assert answer(ctx, "compare sales with last month") is None
    assert answer(ctx, "which is cheapest?") is None
    # ...but naming suppliers still is.
    said = answer(ctx, "which supplier is cheapest?")
    assert said is not None and said.intent == "compare_suppliers"


@pytest.mark.parametrize(
    ("text", "intent"),
    [
        ("which is cheapest?", "compare_suppliers"),
        ("Which one is cheapest and which is nearest?", "compare_suppliers"),
        ("compare them", "compare_suppliers"),
        ("sabse sasta kaun hai", "compare_suppliers"),
        ("सबसे सस्ता कौन है?", "compare_suppliers"),
        ("save the second one", "save_supplier"),
        ("pehla wala save karo", "save_supplier"),
        ("पहला वाला सेव करो", "save_supplier"),
    ],
)
def test_real_follow_ups_after_the_list_still_work(listed, text, intent) -> None:
    store, bid, ctx, _found = listed
    said = answer(ctx, text)
    assert said is not None and said.intent == intent, text
    if intent == "save_supplier":
        assert len([row for row in rules(store, bid) if row.get("saved")]) == 1


@pytest.mark.parametrize(
    "text",
    [
        "save the cheapest supplier",
        "remember the nearest vendor",
        "sasta wala supplier save karo",
        "सबसे सस्ता सप्लायर सेव करो",
        "compare suppliers",
    ],
)
def test_clear_supplier_words_work_without_the_follow_up(listed, text) -> None:
    _store, _bid, ctx, _found = listed
    assert answer(ctx, "what did I sell today?") is None  # ends the follow-up window
    said = answer(ctx, text)
    assert said is not None and said.intent in {"save_supplier", "compare_suppliers"}, text


def test_naming_a_supplier_works_without_the_follow_up(listed) -> None:
    store, bid, ctx, found = listed
    assert answer(ctx, "what did I sell today?") is None
    name = found["suppliers"][1]["name"].removesuffix(" (demo)")
    said = answer(ctx, f"save {name}")
    assert said is not None and said.intent == "save_supplier"
    assert [row["supplier"]["id"] for row in rules(store, bid)] == [found["suppliers"][1]["id"]]


def test_live_route_still_answers_the_follow_up(listed) -> None:
    _store, _bid, ctx, _found = listed
    result = asyncio.run(route("which is cheapest?", ctx, None, ()))
    assert result is not None and result.intent == "compare_suppliers"


@pytest.mark.parametrize("text", NOT_ABOUT_SUPPLIERS)
def test_public_demo_leaves_everyday_messages_to_their_own_path(live_parent_demo, text) -> None:  # noqa: F811
    client, _app, session, bid = live_parent_demo
    url = f"/api/v1/demo/sessions/{session}/coach"
    found = events_of(client.post(url, json={"message": "Find suppliers for milk"}))
    assert "suppliers" in [event["kind"] for event in found]
    events = events_of(client.post(url, json={"message": text}))
    kinds = [event["kind"] for event in events]
    assert "supplier_saved" not in kinds and "suppliers" not in kinds, (text, kinds)
    assert "order" not in kinds
    reply = " ".join(event.get("text") or "" for event in events if event["kind"] == "reply")
    assert "Cheapest:" not in reply and "My suppliers" not in reply, (text, reply)
    base = f"/api/v1/demo/sessions/{session}/api/businesses/{bid}/supply"
    assert not [row for row in client.get(base).json()["suppliers"] if row.get("saved")]


def test_public_demo_follow_ups_still_work(live_parent_demo) -> None:  # noqa: F811
    client, _app, session, _bid = live_parent_demo
    url = f"/api/v1/demo/sessions/{session}/coach"
    events_of(client.post(url, json={"message": "Find suppliers for milk"}))
    compared = events_of(client.post(url, json={"message": "sabse sasta kaun hai"}))
    assert "Cheapest:" in next(e["text"] for e in compared if e["kind"] == "reply")
    saved = events_of(client.post(url, json={"message": "pehla wala save karo"}))
    assert "supplier_saved" in [e["kind"] for e in saved]
