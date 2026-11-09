"""Chat and screens are one app (owner, 9 Nov: "the chat flow and the manual flow need to be in
sync"). Sold out, back in stock, a count and a note do the same thing whether the owner taps a
screen or the coach's card saves it: the same rules, the same records, the same list."""

import asyncio
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.coordinator import MerchantContext, current, propose_products, remember_note
from app.merchant import MerchantRepository, MerchantStore, StockRequest
from app.stock_alerts import StockAlertInput
from tests.test_imports import make_shop
from tests.test_merchant_store import store as merchant_store
from tests.test_photos import app, join  # noqa: F401
from tests.test_stock_alerts import setup_shop

store = merchant_store


def sold_out_days(repo: MerchantRepository, bid: str) -> int:
    return sum(repo.recap_signals("owner", bid)["sold_out"].values())


def coach_saves(repo: MerchantRepository, bid: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    """The coach's card, approved by the owner: propose_products, then the review's Save."""
    ctx = MerchantContext(repo, "owner", bid, [])
    token = current.set(ctx)
    try:
        result = propose_products(items)  # type: ignore[arg-type]
    finally:
        current.reset(token)
    assert result["status"] == "needs_review", result
    proposal = ctx.proposals[result["proposal_id"]]
    repo.commit("owner", proposal["id"], proposal["digest"])
    return result


def item(repo: MerchantRepository, bid: str) -> dict[str, Any]:
    return repo.inventory("owner", bid)[0]


def test_coach_back_in_stock_tells_waiting_customers_like_the_switch(
    store: MerchantRepository,
) -> None:
    bid, _ = setup_shop(store)  # Kaya toast is sold out
    device = uuid4()
    store.subscribe_stock(bid, StockAlertInput(device_id=device, name="Kaya toast", unit="set"))
    assert not store.stock_alerts(bid, str(device))[0]["ready"]
    coach_saves(store, bid, [{"name": "Kaya toast", "available": True}])
    assert item(store, bid)["available"] is True
    assert store.stock_alerts(bid, str(device))[0]["ready"]


def test_coach_sold_out_counts_for_the_prep_plan_like_the_switch(
    store: MerchantRepository,
) -> None:
    bid, pid = setup_shop(store)
    store.set_availability("owner", bid, pid, True)
    before = sold_out_days(store, bid)
    coach_saves(store, bid, [{"name": "Kaya toast", "available": False}])
    assert item(store, bid)["available"] is False
    assert sold_out_days(store, bid) == before + 1
    # The switch counts the same way: one more sold-out on the day.
    store.set_availability("owner", bid, pid, True)
    store.set_availability("owner", bid, pid, False)
    assert sold_out_days(store, bid) == before + 2


def test_zero_left_from_the_minus_button_is_a_counted_sold_out(store: MerchantRepository) -> None:
    bid, pid = setup_shop(store)
    store.set_availability("owner", bid, pid, True)
    before = sold_out_days(store, bid)
    store.edit_item("owner", bid, pid, StockRequest(stock=0).apply)
    assert item(store, bid)["available"] is False
    assert sold_out_days(store, bid) == before + 1
    device = uuid4()
    store.subscribe_stock(bid, StockAlertInput(device_id=device, name="Kaya toast", unit="set"))
    store.edit_item("owner", bid, pid, StockRequest(add=20).apply)
    assert item(store, bid)["available"] is True
    assert store.stock_alerts(bid, str(device))[0]["ready"]


def test_coach_count_follows_the_menu_rule(store: MerchantRepository) -> None:
    """ "Kaya toast: 0 left" in chat is sold out, and "made 20" is back, exactly as − / + save."""
    bid, pid = setup_shop(store)
    store.set_availability("owner", bid, pid, True)
    result = coach_saves(store, bid, [{"name": "Kaya toast", "stock": 0}])
    assert item(store, bid)["stock"] == 0
    assert item(store, bid)["available"] is False
    # The review card says it the way the menu does (OB-310).
    assert result["changes"] == ["Kaya toast: not counted → sold out"]
    coach_saves(store, bid, [{"name": "Kaya toast", "stock": 20}])
    assert item(store, bid)["stock"] == 20
    assert item(store, bid)["available"] is True


def test_coach_count_has_the_menu_bounds(tmp_path: Any) -> None:
    repo = MerchantStore(str(tmp_path / "m.sqlite3"))
    bid, _ = setup_shop(repo)
    token = current.set(MerchantContext(repo, "owner", bid, []))
    try:
        result = propose_products([{"name": "Kaya toast", "stock": -3}])  # type: ignore[list-item]
    finally:
        current.reset(token)
    assert result["status"] != "needs_review"
    assert item(repo, bid).get("stock") is None


def test_a_note_typed_in_my_shop_is_the_coachs_note(tmp_path: Any) -> None:
    repo = MerchantStore(str(tmp_path / "m.sqlite3"))
    bid, _ = setup_shop(repo)
    ctx = MerchantContext(repo, "owner", bid, [])
    token = current.set(ctx)
    try:
        said = remember_note("Supplier comes on Tuesdays")
        again = remember_note("supplier comes on tuesdays")
    finally:
        current.reset(token)
    assert said["status"] == "remembered"
    assert again["status"] == "already_remembered"
    # The confirmation links to where the note lives, and the app reloads to show it.
    card = ctx.cards[said["card_id"]]
    assert card == (
        "action",
        {
            "target": "details",
            "label": "See it in My shop",
            "business_id": bid,
            "offer": True,
            "changed": True,
        },
    )
    notes = (repo.context("owner", bid)["business"] or {})["coach_notes"]
    assert [n["text"] for n in notes] == ["Supplier comes on Tuesdays"]


def test_notes_route_uses_the_coachs_rule(app: Any) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        path = f"/api/v1/businesses/{bid}/notes"
        saved = client.post(path, json={"text": "  Closed   on Mondays in Ramadan "})
        assert saved.status_code == 200, saved.text
        assert saved.json()["status"] == "remembered"
        assert [n["text"] for n in saved.json()["notes"]] == ["Closed on Mondays in Ramadan"]
        twice = client.post(path, json={"text": "closed on mondays in ramadan"})
        assert twice.json()["status"] == "already_remembered"
        assert client.post(path, json={"text": "   "}).status_code == 422
        assert client.post(path, json={}).status_code == 422
        # The list the screen shows is the one the coach reads on its next answer.
        [shop] = [b for b in client.get("/api/v1/businesses").json() if b["id"] == bid]
        assert [n["text"] for n in shop["coach_notes"]] == ["Closed on Mondays in Ramadan"]
        forget = shop["coach_notes"][0]["id"]
        assert client.delete(f"{path}/{forget}").json() == {"notes": []}


def test_coach_snapshot_knows_a_count_tapped_on_the_menu(tmp_path: Any) -> None:
    from app.agent import shop_snapshot

    repo = MerchantStore(str(tmp_path / "m.sqlite3"))
    bid, pid = setup_shop(repo)
    repo.set_availability("owner", bid, pid, True)
    repo.edit_item("owner", bid, pid, StockRequest(stock=4).apply)
    token = current.set(MerchantContext(repo, "owner", bid, []))
    try:
        snapshot = shop_snapshot()
    finally:
        current.reset(token)
    assert "Kaya toast 2.4/set (4 left)" in snapshot


@pytest.mark.parametrize("available", [True, False])
def test_unchanged_switch_records_nothing(store: MerchantRepository, available: bool) -> None:
    bid, pid = setup_shop(store)
    store.set_availability("owner", bid, pid, available)
    before = sold_out_days(store, bid)
    coach_saves(store, bid, [{"name": "Kaya toast", "price": 3}])
    assert item(store, bid)["available"] is available
    assert sold_out_days(store, bid) == before


# --- The Buy stock screen's supplier search, with the coach model down -----------------------


@pytest.fixture
def owner_shop(tmp_path: Any) -> Iterator[MerchantContext]:
    repo = MerchantStore(str(tmp_path / "m.sqlite3"))
    bid, _ = setup_shop(repo)
    ctx = MerchantContext(repo, "owner", bid, [])
    token = current.set(ctx)
    try:
        yield ctx
    finally:
        current.reset(token)


@pytest.mark.parametrize(
    ("said", "item", "quantity"),
    [
        ("My milk is running low. Find suppliers.", "milk", None),
        ("I need 1,000 kg flour. Find suppliers.", "flour", 1000.0),
        ("I need 2 crates (24 packets) milk. Find suppliers.", "2 crates (24 packets) milk", None),
        ("मेरा दूध कम हो रहा है। सप्लायर खोजें।", "दूध", None),
        ("मुझे 20 kg आटा चाहिए। सप्लायर खोजें।", "आटा", 20.0),
    ],
)
def test_screen_supplier_search_needs_no_model(
    owner_shop: MerchantContext,
    monkeypatch: pytest.MonkeyPatch,
    said: str,
    item: str,
    quantity: Any,
) -> None:
    import app.instant as instant

    asked: list[tuple[str, Any, str]] = []

    async def search(what: str, qty: Any = None, unit: str = "") -> dict[str, Any]:
        asked.append((what, qty, unit))
        card = "c1"
        owner_shop.cards[card] = ("suppliers", {"item": what, "suppliers": [{"id": "s1"}]})
        return {"status": "found", "card_id": card, "suppliers": [{"id": "s1"}]}

    monkeypatch.setattr(instant, "find_suppliers", search)
    result = asyncio.run(instant.route(said, owner_shop))
    assert result is not None and result.intent == "find_suppliers"
    assert asked == [(item, quantity, "kg" if quantity else "")]
    assert [event.kind for event in result.events] == ["sourcing", "suppliers"]
    assert (item in result.reply) and ("सप्लायर" in result.reply) == said.startswith("म")


def test_screen_supplier_search_says_when_none_found(
    owner_shop: MerchantContext, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.instant as instant

    async def none(what: str, qty: Any = None, unit: str = "") -> dict[str, Any]:
        return {"status": "none_found"}

    monkeypatch.setattr(instant, "find_suppliers", none)
    result = asyncio.run(instant.route("My saffron is running low. Find suppliers.", owner_shop))
    assert result is not None and result.events[0].kind == "sourcing"
    assert result.reply == "I found no supplier near you for saffron. Try another name for it."


def test_screen_supplier_search_real_tool_offline(owner_shop: MerchantContext) -> None:
    """The real search, offline (fixture suppliers): the vendor list the screen shows."""
    from app.instant import route

    result = asyncio.run(route("My milk is running low. Find suppliers.", owner_shop))
    assert result is not None
    assert [event.kind for event in result.events][:1] == ["sourcing"]


def test_said_in_chat_the_note_shows_in_my_shop(app: Any) -> None:  # noqa: F811
    """Chat → screen: "remember that…" saves the note, links to Shop details, and the shop the
    app reloads lists it."""
    from tests.test_merchant_routes import stream_events

    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        events = stream_events(
            client, {"message": "Remember that the milkman comes at 6.", "business_id": bid}
        )
        [action] = [e["data"] for e in events if e["kind"] == "action"]
        assert action["target"] == "details" and action["changed"] is True
        reply = " ".join(str(e.get("text", "")) for e in events if e["kind"] == "reply")
        assert "remember" in reply.casefold()
        [shop] = [b for b in client.get("/api/v1/businesses").json() if b["id"] == bid]
        assert [n["text"] for n in shop["coach_notes"]] == ["the milkman comes at 6"]


def test_which_items_are_sold_out_reads_the_switch(owner_shop: MerchantContext) -> None:
    """Screen → chat: the switch the owner just tapped is in the coach's next answer."""
    from app.instant import route

    repo, bid = owner_shop.store, owner_shop.business_id or ""
    for said in ("Which items are sold out?", "What is sold out?"):
        result = asyncio.run(route(said, owner_shop))
        assert result is not None and result.reply == "Sold out right now: Kaya toast."
    pid = repo.inventory("owner", bid)[0]["id"]
    repo.set_availability("owner", bid, pid, True)
    result = asyncio.run(route("Which items are sold out?", owner_shop))
    assert result is not None and result.reply == "Nothing is marked sold out right now."
