"""Offline coach evals in CI (OB-173, #532): every case's expected trajectory against the real
tools. Known failures are xfail with their issue number and stay here until the fix lands
(strict: a known case that starts passing fails the run, so its `known` goes in the same PR)."""

from __future__ import annotations

import inspect
import re
from pathlib import Path

import pytest

from app.agent import make_agent

from .cases import CASES, WRITES, Case
from .harness import EXTRA, run_case, settings_for
from .seeds import SEEDS


def marks(case: Case) -> list[pytest.MarkDecorator]:
    return [pytest.mark.xfail(reason=case.known, strict=True)] if case.known else []


@pytest.mark.parametrize("case", [pytest.param(c, id=c.id, marks=marks(c)) for c in CASES])
async def test_case(case: Case, tmp_path: Path) -> None:
    result = await run_case(case, "offline", tmp_path)
    assert result.passed, "\n".join(result.failures())


def tool_names() -> set[str]:
    return {tool.__name__ for tool in make_agent(settings_for("offline")).tools}  # type: ignore[union-attr]


def test_cases_are_a_usable_set() -> None:
    ids = [case.id for case in CASES]
    assert len(ids) == len(set(ids)), "case ids must be unique"
    assert 25 <= len(CASES) <= 40
    assert sum(case.id.startswith("hinglish") for case in CASES) <= 5
    groups = {case.group for case in CASES}
    for group in ("ambiguous", "unsupported", "no_action", "suppliers", "purchase_orders"):
        assert group in groups
    assert any(len(case.turns) >= 3 for case in CASES), "keep a multi-turn chain"


def test_cases_name_real_tools_seeds_and_checks() -> None:
    """A renamed tool must break the suite, not silently turn a forbid into a no-op."""
    tools = tool_names()
    assert set(WRITES) <= tools, set(WRITES) - tools
    for case in CASES:
        assert case.seed in SEEDS, case.id
        for turn in case.turns:
            assert {call.name for call in turn.calls} <= tools, case.id
            assert set(turn.forbid) <= tools, case.id
            assert not turn.extra or turn.extra in EXTRA, case.id
            for pattern in [*turn.reply_has, *turn.reply_not]:
                re.compile(pattern)


def test_known_failures_name_their_issue() -> None:
    for case in CASES:
        assert not case.known or re.search(r"#\d+", case.known), case.id


def test_cases_use_synthetic_data_only() -> None:
    """No production data: phone numbers in cases and seeds are the reserved +91 90000 range or
    the owner's example number."""
    for module in ("cases", "seeds"):
        source = inspect.getsource(__import__(f"evals.coach.{module}", fromlist=["_"]))
        for number in re.findall(r"\+91 ?\d{5} ?\d{5}", source):
            assert number.replace(" ", "")[3:8] in {"90000", "98480"}, number
