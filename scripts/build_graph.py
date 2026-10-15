"""Build the code knowledge graph used by reviews (graphify, code only, no LLM, no API key).

Scope: frontend (src/), backend (backend/app, backend/scripts) and tests (tests/, backend/tests).
Docs and screenshots are left out on purpose: reviews need code dependencies, not prose.
Writes graphify-out/graph.json (git-ignored). Run with the interpreter that has graphifyy:
    python scripts/build_graph.py            # local: uv tool install graphifyy==0.9.89
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.detect import detect
from graphify.export import to_json
from graphify.extract import collect_files, extract

KEEP = ("src/", "backend/app/", "backend/scripts/", "backend/tests/", "tests/")
SKIP = ("node_modules/", ".venv/", "output/", "graphify-out/", "dist/")


def main() -> int:
    root = Path(".")
    found = detect(root)
    code: list[Path] = []
    for raw in found["files"].get("code", []):
        path = Path(raw)
        rel = path.resolve().relative_to(root.resolve()).as_posix()
        if rel.startswith(KEEP) and not any(part in rel for part in SKIP):
            code.extend(collect_files(path) if path.is_dir() else [path])
    extraction = extract(code, cache_root=root, root=root, parallel=False)
    graph = build_from_json(extraction, root=".", directed=True)
    communities = cluster(graph)
    # Name each community after the folder most of its code lives in (no LLM needed).
    labels = {}
    for cid, members in communities.items():
        folders = Counter(
            "/".join((graph.nodes[m].get("source_file") or "other").split("/")[:-1]) or "(root)"
            for m in members
            if m in graph.nodes
        )
        labels[cid] = folders.most_common(1)[0][0] if folders else f"Community {cid}"
    Path("graphify-out").mkdir(exist_ok=True)
    to_json(graph, communities, "graphify-out/graph.json", community_labels=labels, force=True)
    print(
        json.dumps(
            {
                "files": len(code),
                "nodes": graph.number_of_nodes(),
                "edges": graph.number_of_edges(),
                "communities": len(communities),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
