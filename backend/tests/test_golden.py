"""CI gate: real deterministic import parsers with frozen expected contracts."""

import socket
from types import SimpleNamespace

import pytest

from app.connector import _heuristic_connector_mapping, apply_mapping, parse_any
from app.imports import menu_items
from tests.golden.run import ROOT, cases, evaluate, offline_guard, read_json, score

STRUCTURED = [p for p in cases() if read_json(p)["adapter"] in {"connector", "supply"}]


@pytest.mark.parametrize("path", STRUCTURED, ids=lambda p: p.parent.name)
def test_structured_golden(path):
    with offline_guard():
        actual = evaluate(path)
    expected = read_json(path.parent / "expected.json")
    assert score(expected, actual) == (1, 1), (expected, actual)


def test_network_guard_and_scoring_detect_regressions():
    with offline_guard(), pytest.raises(RuntimeError, match="Network disabled"):
        socket.getaddrinfo("example.invalid", 443)
    assert score({"price": 1550}, {"price": 1551}) != (1, 1)
    assert score({"rows": [1, 1]}, {"rows": [1]}) != (1, 1)
    assert score({"price": 15}, {"price": 15.0}) == (1, 1)
    assert score({"sku": "TEA-01"}, {}) != (1, 1)


@pytest.mark.parametrize("name,count,skipped", [("missing-price", 0, 1), ("duplicate-rows", 1, 0)])
def test_broken_rows_downstream(name, count, skipped):
    path = ROOT / "cases" / name
    with offline_guard():
        headers, rows = parse_any((path / "input.csv").read_bytes(), "text/csv")
        mapping = _heuristic_connector_mapping(headers, rows, name)
        _, _, columns = apply_mapping(mapping, headers, rows)
        items, dropped = menu_items(rows, columns)
    assert len(items) == count
    assert dropped == skipped


async def test_unconfigured_live_mode_skips_without_network(monkeypatch):
    from app import settings
    from tests.golden.run import live_evaluate

    monkeypatch.setattr(
        settings, "Settings", lambda **kwargs: SimpleNamespace(coach_mode="offline")
    )
    with offline_guard():
        assert await live_evaluate(cases()[0]) is None


def test_live_provider_failure_is_advisory_and_redacted(monkeypatch, capsys):
    from tests.golden import run

    async def failed(path):
        raise RuntimeError("synthetic provider diagnostic must not appear")

    monkeypatch.setattr("sys.argv", ["golden", "--live"])
    monkeypatch.setattr(run, "cases", lambda: cases()[:1])
    monkeypatch.setattr(run, "live_evaluate", failed)
    assert run.main() == 0
    output = capsys.readouterr().out
    assert "RuntimeError" in output
    assert "synthetic provider diagnostic" not in output
