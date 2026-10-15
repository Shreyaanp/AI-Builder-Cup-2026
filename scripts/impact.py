"""Review impact report: which code a change touches, beyond the files in the diff.

Uses the graphify knowledge graph (graphify-out/graph.json; refresh with `graphify update .`).
For every symbol defined in a changed file, walk *backwards* through callers, importers and
users (calls, imports, references, uses, inherits) up to --depth hops, then report the affected
areas (graph communities), files outside the diff, and the tests that exercise them. Reviewers
check every listed area; a change whose impact reaches an area with no test is flagged.

Usage:  python scripts/impact.py [BASE_REF] [--depth N] [--out FILE]
        (BASE_REF defaults to origin/main; run with the graphify interpreter or any Python 3.11+)
"""

from __future__ import annotations

import argparse
import json
import subprocess
from collections import defaultdict, deque
from pathlib import Path

DEPENDS = {"calls", "imports", "imports_from", "references", "uses", "inherits", "indirect_call"}
TEST_MARKERS = ("tests/", "backend/tests/", ".spec.ts", "test_")


def changed_files(base: str, head: str) -> list[str]:
    out = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...{head}"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    if head == "HEAD":  # include uncommitted work when reviewing the current checkout
        out += subprocess.run(
            ["git", "diff", "--name-only", "HEAD"], capture_output=True, text=True, check=True
        ).stdout
    return sorted({line.strip() for line in out.splitlines() if line.strip()})


def is_test(path: str) -> bool:
    return any(marker in path for marker in TEST_MARKERS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base", nargs="?", default="origin/main")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--depth", type=int, default=2)
    parser.add_argument("--graph", default="graphify-out/graph.json")
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    graph = json.loads(Path(args.graph).read_text(encoding="utf-8"))
    nodes = {n["id"]: n for n in graph["nodes"]}
    users: dict[str, set[str]] = defaultdict(set)  # target -> sources that depend on it
    contains: dict[str, set[str]] = defaultdict(set)
    for edge in graph.get("links") or graph.get("edges") or []:
        if edge.get("relation") in DEPENDS:
            users[edge["target"]].add(edge["source"])
        if edge.get("relation") in {"contains", "method"}:
            contains[edge["source"]].add(edge["target"])

    changed = changed_files(args.base, args.head)
    changed_set = set(changed)
    seeds = {nid for nid, n in nodes.items() if n.get("source_file") in changed_set}

    depth: dict[str, int] = {nid: 0 for nid in seeds}
    queue = deque(seeds)
    while queue:
        current = queue.popleft()
        if depth[current] >= args.depth:
            continue
        for user in users.get(current, ()):  # who depends on this symbol
            if user not in depth:
                depth[user] = depth[current] + 1
                queue.append(user)

    affected = {nid: d for nid, d in depth.items() if d > 0}
    by_file: dict[str, int] = {}
    for nid, d in affected.items():
        source = nodes.get(nid, {}).get("source_file") or ""
        if source and source not in changed_set:
            by_file[source] = min(d, by_file.get(source, 99))
    # Unnamed (small) communities are named after the folder most of their code lives in.
    folders: dict[object, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for node in nodes.values():
        if node.get("source_file"):
            folder = "/".join(node["source_file"].split("/")[:-1]) or "(root)"
            folders[node.get("community")][folder] += 1

    def area(node: dict) -> str:
        name = node.get("community_name") or ""
        if name and not name.startswith("Community "):
            return name
        counts = folders.get(node.get("community")) or {"other": 1}
        return max(counts, key=lambda k: counts[k])

    areas: dict[str, set[str]] = defaultdict(set)
    for nid in list(seeds) + list(affected):
        node = nodes.get(nid, {})
        name = area(node)
        if node.get("source_file"):
            areas[name].add(node["source_file"])

    tests = sorted(f for f in by_file if is_test(f)) + sorted(f for f in changed if is_test(f))
    code_files = sorted((f for f in by_file if not is_test(f)), key=lambda f: (by_file[f], f))
    untested_areas = sorted(
        name for name, files in areas.items() if not any(is_test(f) for f in files)
    )

    lines = [
        f"## Impact review vs `{args.base}` (graphify, depth {args.depth})",
        "",
        f"- Changed files: {len(changed)} · symbols in them: {len(seeds)}",
        f"- Code outside the diff that depends on them: {len(code_files)} files",
        f"- Tests that exercise the affected code: {len(set(tests))}",
        "",
        "### Affected areas (check each one)",
        *[f"- **{name}** ({len(files)} files)" for name, files in sorted(areas.items())],
        "",
        "### Files outside the diff that may break (nearest first)",
        *[f"- `{f}` (hop {by_file[f]})" for f in code_files[:60]],
        *(["- …"] if len(code_files) > 60 else []),
        "",
        "### Tests to run",
        *[f"- `{f}`" for f in sorted(set(tests))[:60]],
        "",
        "### Areas reached with no test in the graph",
        *([f"- {name}" for name in untested_areas] or ["- none"]),
        "",
    ]
    report = "\n".join(lines)
    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
