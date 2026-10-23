"""The eval checks themselves: each one can fail (a check that always passes measures nothing)."""

from __future__ import annotations

from pathlib import Path

from .cases import ANY, WRITES, Call, Case, Turn
from .harness import TurnRecord, approval_card, matches, pin_moves, run_case

NAMES = {"thread": "t-1", "soon": "21:30"}


def test_matches_patterns() -> None:
    assert matches({"amount": 240}, {"amount": "240"}, NAMES)
    assert not matches({"amount": 240}, {"amount": "24"}, NAMES)
    assert matches({"hours|weekly_hours": ANY}, {"weekly_hours": [{"day": "mon"}]}, NAMES)
    assert not matches({"hours|weekly_hours": ANY}, {"hours": ""}, NAMES)
    assert matches({"name": "~vada pav"}, {"name": "Vada Pav"}, NAMES)
    assert matches({"thread_id": "$thread"}, {"thread_id": "t-1"}, NAMES)
    assert not matches({"thread_id": "$thread"}, {"thread_id": "t-2"}, NAMES)
    assert matches({"until": "{soon}"}, {"until": "21:30"}, NAMES)
    assert matches({"open_today": False}, {"open_today": False}, NAMES)
    assert not matches({"open_today": False}, {"open_today": True}, NAMES)
    items = [{"name": "Masala chai", "price": 22}, {"name": "Samosa", "available": False}]
    assert matches({"items": [{"name": "~samosa", "available": False}]}, {"items": items}, NAMES)
    assert not matches({"items": [{"name": "~samosa", "price": 22}]}, {"items": items}, NAMES)


def test_approval_cards() -> None:
    assert approval_card("proposal", {})
    assert approval_card("action", {"target": "reply"})
    assert approval_card("supply", {"view": "order"})
    assert not approval_card("suppliers", {})
    assert not approval_card("action", {"target": "screen"})
    assert not approval_card("supply", {"view": "coming"})


def test_pin_moves_needs_new_coordinates() -> None:
    before = {"lat": 17.4483, "lng": 78.3915}
    moved = TurnRecord("x", proposals=[{"snapshot": {"business": {"lat": 17.44, "lng": 78.38}}}])
    same = TurnRecord("x", proposals=[{"snapshot": {"business": dict(before)}}])
    assert pin_moves(moved, before) and not pin_moves(same, before)


async def test_a_question_that_acts_fails(tmp_path: Path) -> None:
    """Negative control: the replay prepares a card on a question; forbid and card both catch it."""
    acts = Call("propose_products", replay={"items": [{"name": "Masala chai", "price": 25}]})
    case = Case(
        "control_acting_on_a_question",
        "control",
        "harness self-test",
        "chai_stall",
        [Turn("What is the price of masala chai?", calls=[acts], forbid=WRITES, card=False)],
    )
    result = await run_case(case, "offline", tmp_path)
    failures = result.failures()
    assert any("must not call propose_products" in f for f in failures), failures
    assert any("no approval card" in f for f in failures), failures


async def test_refused_arguments_fail(tmp_path: Path) -> None:
    """Negative control: arguments the tool refuses fail the case even though the call was made."""
    bad = Call("prepare_payment_link", {"amount": -5}, replay={"amount": "-5"})
    case = Case(
        "control_refused",
        "control",
        "harness self-test",
        "chai_stall",
        [Turn("Make a payment link", calls=[bad], card=True)],
    )
    result = await run_case(case, "offline", tmp_path)
    assert any("prepare_payment_link accepts the arguments" in f for f in result.failures())
