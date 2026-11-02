"""OB-250: opening Purchase orders never changes data, a wrong-size draft is withdrawn only by an
owner action, and a clash with the owner's own edit never leaves two drafts for one item."""

from datetime import date

import pytest

from app import supply_chain, supply_coming
from app.merchant import MerchantStore, ProductFields
from app.supply_offline import TOO_BIG_REPLY, supply_reply
from tests.test_ob239_made_or_bought import draft, neighbour, open_shop
from tests.test_ob242_supply_units import (  # noqa: F401 - shared fixtures
    TEA_DUST,
    allow_auto_send,
    client,
    current_forecast,
    http_wrong_draft,
    product,
    seed_wrong_draft,
    settings,
    slow_tea_stall,
    store,
    tea_stall,
)


def test_ob250_opening_purchase_orders_twice_changes_nothing(client) -> None:  # noqa: F811
    base, repo, bid, wrong = http_wrong_draft(client)
    before = supply_chain.all_orders(repo, bid)
    first = client.get(base)
    second = client.get(base)
    assert first.status_code == second.status_code == 200
    assert supply_chain.all_orders(repo, bid) == before
    for response in (first, second):
        shown = next(po for po in response.json()["orders"] if po["id"] == wrong["id"])
        assert shown["blocked"] and shown["checks"][0]["code"] == "too_big"
        assert shown["version"] == wrong["version"]


def test_ob250_a_flagged_draft_still_cannot_be_approved(client) -> None:  # noqa: F811
    base, repo, bid, wrong = http_wrong_draft(client)
    client.get(base)
    url = f"{base}/orders/{wrong['id']}"
    response = client.post(f"{url}/approve", json={"version": wrong["version"]})
    assert response.status_code == 409 and response.json()["detail"] == "TOO_BIG", response.text
    held = next(po for po in supply_chain.all_orders(repo, bid) if po["id"] == wrong["id"])
    assert held["status"] == "draft" and not held["sent"]


def test_ob250_the_next_reorder_withdraws_what_the_overview_flagged(client) -> None:  # noqa: F811
    base, repo, bid, wrong = http_wrong_draft(client)
    client.get(base)
    assert client.post(f"{base}/reorder", json={"quantity": None}).status_code == 200
    after = next(po for po in supply_chain.all_orders(repo, bid) if po["id"] == wrong["id"])
    assert after["status"] == "cancelled" and after["reason"]["withdrawn"] == "too_big"
    assert not after["sent"]
    assert wrong["id"] not in {po["id"] for po in client.get(base).json()["orders"]}


def test_ob250_the_flag_offers_the_amount_real_use_calls_for(store) -> None:  # noqa: F811
    bid, wrong = slow_tea_stall(store)
    inventory = store.context("alice", bid)["inventory"]
    shown = supply_coming.flag_wrong_sizes(
        store, bid, [wrong], inventory, current_forecast(store, bid), date.today()
    )[0]
    fix = shown["checks"][0]["fix"]
    assert fix["kind"] == "quantity" and fix["line"] == wrong["lines"][0]["line"]
    assert 0 < fix["value"] < 540
    fixed = supply_chain.apply_fix(store, "alice", bid, wrong["id"], wrong["version"], fix)
    assert fixed["reason"]["owner_quantity"] and fixed["lines"][0]["quantity"] == fix["value"]


def open_orders(repo: MerchantStore, bid: str, item: str) -> list[dict]:
    """Open (or sent) orders for the item: never two for the same need."""
    return [
        po
        for po in supply_chain.all_orders(repo, bid)
        if po["status"] != "cancelled" and po["reason"].get("item") == item
    ]


def owner_edits_first(monkeypatch, po_id: str, value: float) -> list[dict]:
    """Stage the clash: the owner sets `value` on the card (as apply_fix saves it) just before
    the reorder's own write of that draft lands, so the reorder's write loses the race."""
    real_save = supply_coming._save
    edited: list[dict] = []

    def save(repo, bid: str, changed: dict) -> dict:
        if changed["id"] == po_id and not edited:
            mine = repo.feature_docs.get(supply_chain.ORDERS, supply_chain._key(bid, po_id))
            mine["lines"][0]["quantity"] = value
            mine["reason"]["owner_quantity"] = True
            edited.append(real_save(repo, bid, mine))
        return real_save(repo, bid, changed)

    monkeypatch.setattr(supply_coming, "_save", save)
    return edited


def test_ob250_the_owners_edit_during_a_withdrawal_stays_the_one_draft(
    client,  # noqa: F811
    monkeypatch,
) -> None:
    base, repo, bid, wrong = http_wrong_draft(client)
    item = wrong["reason"]["item"]
    edited = owner_edits_first(monkeypatch, wrong["id"], 50)
    response = client.post(f"{base}/reorder", json={"quantity": None})
    assert response.status_code == 200, response.text
    assert edited, "the clash was not staged"
    left = open_orders(repo, bid, item)
    assert [po["id"] for po in left] == [wrong["id"]], left
    assert left[0]["lines"][0]["quantity"] == 50 and left[0]["reason"]["owner_quantity"]


def owner_pays_cash_first(
    monkeypatch, repo: MerchantStore, bid: str, po_id: str, times: int = 1
) -> list:
    """Stage the review's clash: the owner taps Pay cash this time on the card (apply_fix, its
    own write) just before the reorder's withdrawal of that draft lands, `times` times over."""
    real_save = supply_coming._save
    paid: list[dict] = []

    def save(saved_in, bid_: str, changed: dict) -> dict:
        if changed["id"] == po_id and changed["status"] == "cancelled" and len(paid) < times:
            mine = supply_chain.get_po(repo, "alice", bid, po_id)
            paid.append(
                supply_chain.apply_fix(repo, "alice", bid, po_id, mine["version"], {"kind": "cash"})
            )
        return real_save(saved_in, bid_, changed)

    monkeypatch.setattr(supply_coming, "_save", save)
    return paid


@pytest.mark.parametrize("item", ["Tea dust", ""])
def test_ob250_paying_cash_during_a_withdrawal_never_sends_the_wrong_size(
    store,  # noqa: F811
    monkeypatch,
    item: str,
) -> None:
    # The review's repro: auto-send on, the limit above the total, 540 kg of tea dust.
    bid, wrong = slow_tea_stall(store)
    paid = owner_pays_cash_first(monkeypatch, store, bid, wrong["id"])
    result = draft(store, bid, item)
    assert paid, "the clash was not staged"
    assert result["status"] == "check" and result["reason"] == "month", result
    after = supply_chain.get_po(store, "alice", bid, wrong["id"])
    assert not after["sent"] and not after["auto_sent"]
    assert after["status"] == "cancelled" and after["reason"]["withdrawn"] == "too_big"
    assert not any(po["sent"] for po in open_orders(store, bid, "Tea dust"))


def test_ob250_paying_cash_during_a_no_use_withdrawal_never_sends_it(
    store,  # noqa: F811
    monkeypatch,
) -> None:
    bid = tea_stall(store)
    wrong = seed_wrong_draft(store, bid)
    allow_auto_send(store, bid, wrong["supplier"]["id"])
    paid = owner_pays_cash_first(monkeypatch, store, bid, wrong["id"])
    result = draft(store, bid, "Tea dust")
    assert paid, "the clash was not staged"
    assert result["status"] == "check" and result["reason"] == "no_history", result
    after = supply_chain.get_po(store, "alice", bid, wrong["id"])
    assert not after["sent"] and not after["auto_sent"]
    assert after["status"] == "cancelled" and after["reason"]["withdrawn"] == "no_use"


def test_ob250_a_withdrawal_that_keeps_losing_sends_nothing(store, monkeypatch) -> None:  # noqa: F811
    bid, wrong = slow_tea_stall(store)
    paid = owner_pays_cash_first(monkeypatch, store, bid, wrong["id"], times=99)
    result = draft(store, bid, "Tea dust")
    assert len(paid) == supply_coming.WITHDRAW_TRIES
    assert result["status"] == "check" and result["reason"] == "month", result
    assert result["quantity"] == 540 and "order" not in result
    after = supply_chain.get_po(store, "alice", bid, wrong["id"])
    assert after["status"] == "draft" and not after["sent"] and not after["auto_sent"]
    assert [po["id"] for po in open_orders(store, bid, "Tea dust")] == [wrong["id"]]


def test_ob250_a_wrong_size_never_goes_out_by_itself_whatever_led_there(
    store,  # noqa: F811
    monkeypatch,
) -> None:
    # Belt and braces: even if the draft slipped past the withdrawal, the auto-send checks it.
    bid, wrong = slow_tea_stall(store)
    real = supply_coming.wrong_size
    calls: list[str] = []

    def misses_once(*args):
        calls.append("")
        return "" if len(calls) == 1 else real(*args)

    monkeypatch.setattr(supply_coming, "wrong_size", misses_once)
    result = draft(store, bid, "Tea dust")
    assert result["status"] == "drafted" and result["existing"], result
    order = result["order"]
    assert not order["sent"] and order["blocked"] and order["checks"][0]["code"] == "too_big"
    after = supply_chain.get_po(store, "alice", bid, wrong["id"])
    assert after["status"] == "draft" and not after["sent"] and not after["auto_sent"]


def test_ob250_a_card_refreshed_or_fixed_still_shows_the_flag(client) -> None:  # noqa: F811
    base, repo, bid, wrong = http_wrong_draft(client)
    url = f"{base}/orders/{wrong['id']}"
    read = client.get(url).json()
    assert read["blocked"] and read["checks"][0]["code"] == "too_big", read
    paid = client.post(f"{url}/fix", json={"version": wrong["version"], "fix": {"kind": "cash"}})
    assert paid.status_code == 200, paid.text
    assert paid.json()["blocked"] and paid.json()["checks"][0]["code"] == "too_big"
    stored = next(po for po in supply_chain.all_orders(repo, bid) if po["id"] == wrong["id"])
    assert "too_big" not in {check["code"] for check in stored["checks"]}


def test_ob250_the_owners_edit_while_settling_keeps_theirs(store, monkeypatch) -> None:  # noqa: F811
    bid = open_shop(
        store,
        "Sharma Chai Corner",
        "Tea stall",
        [product("Tea dust", "kg"), product("Milk", "litre", 0)],
        [("Tea dust", 0.3, 32000), ("Milk", 15, 6000)],
    )
    wholesale = [*TEA_DUST, ProductFields(name="Milk", price=5000, unit="litre", stock=5000)]
    neighbour(store, bid, "demo-ob242-tea", "Tea Wholesale (Demo)", "Wholesale", wholesale, True)
    milk = draft(store, bid, "Milk")["order"]
    assert milk["status"] == "draft" and not milk["reason"]["owner_quantity"], milk
    # Made when something else was on order, so settling sizes it again and writes it.
    milk = supply_chain._save(store, bid, {**milk, "reason": {**milk["reason"], "on_order": 999}})
    edited = owner_edits_first(monkeypatch, milk["id"], 7)
    context = store.context("alice", bid)
    known = supply_coming.coming_orders(store, "alice", bid)
    supply_coming.settle_drafts(
        store,
        "alice",
        bid,
        context["inventory"],
        current_forecast(store, bid),
        date.today(),
        known,
        "",
    )
    assert edited, "the clash was not staged"
    left = open_orders(store, bid, "Milk")
    assert [po["id"] for po in left] == [milk["id"]], left
    assert left[0]["lines"][0]["quantity"] == 7 and left[0]["reason"]["owner_quantity"]


@pytest.mark.parametrize("language", list(TOO_BIG_REPLY))
def test_ob250_the_offline_coachs_too_big_refusal_speaks_each_language(language: str) -> None:
    result = {"status": "too_big", "message": "x", "message_hi": "y"}
    assert supply_reply("approve_and_send_po", result, language) == TOO_BIG_REPLY[language]


def test_ob250_the_too_big_refusal_in_hindi_and_the_english_fallback() -> None:
    result = {"status": "too_big", "message": "x", "message_hi": "y"}
    assert "बहुत बड़ा" in (supply_reply("approve_and_send_po", result, "hi-IN") or "")
    assert "离线教练" in (supply_reply("approve_and_send_po", result, "zh-Hans") or "")
    fallback = supply_reply("approve_and_send_po", result, "de") or ""
    assert "bigger than you use" in fallback and "sent nothing" in fallback


def test_ob250_a_confirmation_without_a_price_keeps_the_ordered_one() -> None:
    assert supply_chain.agreed_price({"price": 2400, "confirmed_price": None}) == 2400
    assert supply_chain.agreed_price({"price": 2400}) == 2400
    assert supply_chain.agreed_price({"price": 2400, "confirmed_price": 2350}) == 2350
    assert supply_chain.agreed_price({"price": 2400, "confirmed_price": 0}) == 0
