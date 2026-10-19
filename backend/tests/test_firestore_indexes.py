"""OB-53: every scoped list query needs its composite index in firestore.indexes.json."""

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "backend" / "app"
QUERY = [("scope", "ASCENDING"), ("created", "DESCENDING")]


def module_constants(path: Path) -> dict[str, str]:
    """Module-level NAME = "string" assignments, so scoped(RULES, ...) resolves to its kind."""
    found: dict[str, str] = {}
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        if (
            isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Constant)
            and isinstance(node.value.value, str)
        ):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    found[target.id] = node.value.value
    return found


def scoped_kinds() -> set[str]:
    # OB-53: two modules can share a constant name (one a kind, one a prompt), and glob
    # order differs between machines. Prefer the calling module's own constant; otherwise take
    # the other modules' values that look like a kind.
    every: dict[str, set[str]] = {}
    for path in APP.glob("*.py"):
        for name, value in module_constants(path).items():
            every.setdefault(name, set()).add(value)
    kinds: set[str] = set()
    for path in APP.glob("*.py"):
        own = module_constants(path)
        names = {
            name: {own[name]} if name in own else {v for v in values if v.isidentifier()}
            for name, values in every.items()
        }
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "scoped"
                and node.args
            ):
                continue
            first = node.args[0]
            candidates = [first.body, first.orelse] if isinstance(first, ast.IfExp) else [first]
            for item in candidates:
                if isinstance(item, ast.Constant) and isinstance(item.value, str):
                    kinds.add(item.value)
                elif isinstance(item, ast.Name) and item.id in names:
                    kinds.update(names[item.id])
    return kinds


def test_ob53_every_scoped_kind_has_a_composite_index() -> None:
    declared = {
        index["collectionGroup"]
        for index in json.loads((ROOT / "firestore.indexes.json").read_text())["indexes"]
        if [(f["fieldPath"], f["order"]) for f in index["fields"]] == QUERY
    }
    kinds = scoped_kinds()
    assert {"trust_review", "tip", "supply_po"} <= kinds  # the scan itself still finds kinds
    assert kinds - declared == set(), "scoped() query without an index in firestore.indexes.json"
