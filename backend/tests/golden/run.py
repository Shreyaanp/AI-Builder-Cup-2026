"""Score frozen expectations against application parsers; no oracle regeneration."""

from __future__ import annotations

import argparse
import asyncio
import json
import socket
from collections import Counter
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.connector import _heuristic_connector_mapping, parse_any, preview_mapped
from app.document_ai import parse_document
from app.imports import ImportRejected, number
from app.money import to_minor
from app.supply_docs import parse, unit_from_code

ROOT = Path(__file__).parent


@contextmanager
def offline_guard():
    """Fail closed if a parser accidentally starts using a network service."""
    original = socket.socket.connect
    original_ex = socket.socket.connect_ex
    original_dns = socket.getaddrinfo

    def denied(*args, **kwargs):
        raise RuntimeError("Network disabled by golden runner")

    socket.socket.connect = denied
    socket.socket.connect_ex = denied
    socket.getaddrinfo = denied
    try:
        yield
    finally:
        socket.socket.connect = original
        socket.socket.connect_ex = original_ex
        socket.getaddrinfo = original_dns


def cases():
    return sorted(ROOT.glob("cases/*/case.json"))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def evaluate(path: Path) -> dict[str, Any]:
    case = read_json(path)
    base = path.parent
    data = (base / case["input"]).read_bytes()
    if case["adapter"] == "supply":
        doc, fmt, ambiguous = parse(data.decode("utf-8"), today=date(2026, 10, 18))
        result = doc.model_dump(mode="json")
        for line in result["lines"]:
            line["unit"] = unit_from_code(line["unit"]) or line["unit"]
        return {"document": result, "format": fmt, "ambiguous": ambiguous}
    if case["adapter"] == "document":
        if case["mime"] == "application/pdf":
            if not data.startswith(b"%PDF-"):
                raise ValueError("Invalid PDF fixture")
        else:
            from app.photos import sanitize

            sanitize(data)
        # Frozen synthetic processor response, NOT OCR of the input image/PDF.
        parsed = parse_document(read_json(base / "response.json"), case["processor"])
        return parsed.model_dump(mode="json")
    if case["adapter"] == "menu":
        from app.photos import PhotoExtraction, sanitize

        sanitize(data)
        parsed = PhotoExtraction.model_validate(read_json(base / "response.json"))
        return {
            "items": [
                {
                    "name": p.name,
                    "price": to_minor(p.price, case["currency"]),
                    "size": p.unit,
                    "category": p.category,
                }
                for p in parsed.products
            ]
        }
    try:
        headers, rows = parse_any(data, case["mime"])
    except ImportRejected as error:
        return {"error": error.code, "status": error.status}
    mapping = _heuristic_connector_mapping(headers, rows, case["source"])
    mapped = preview_mapped(mapping, headers, rows, limit=len(rows))
    for row in mapped:
        for key in ("price", "total"):
            if key in row:
                value = number(row[key])
                row[key] = to_minor(value, case["currency"]) if value is not None else None
        for key in ("stock", "quantity"):
            if key in row:
                row[key] = number(row[key])
    return {"kind": mapping.kind, "count": len(rows), "rows": mapped}


def leaves(value, prefix=""):
    """Path/value multiset: preserves duplicate rows, missing fields and list lengths."""
    if isinstance(value, dict):
        if not value:
            yield prefix, "{}"
        for key, child in value.items():
            yield from leaves(child, f"{prefix}.{key}")
    elif isinstance(value, list):
        yield f"{prefix}.length", str(len(value))
        for index, child in enumerate(value):
            yield from leaves(child, f"{prefix}[{index}]")
    else:
        encoded = (
            str(Decimal(str(value)).normalize())
            if isinstance(value, (int, float)) and not isinstance(value, bool)
            else json.dumps(value, ensure_ascii=False, sort_keys=True)
        )
        yield prefix, encoded


def project(actual, expected):
    """Score the explicit contract fields; keep unexpected rows in scored lists."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        return {k: project(actual[k], v) for k, v in expected.items() if k in actual}
    if isinstance(expected, list) and isinstance(actual, list):
        return [project(v, expected[i]) if i < len(expected) else v for i, v in enumerate(actual)]
    return actual


def score(expected, actual):
    wanted = Counter(leaves(expected))
    found = Counter(leaves(project(actual, expected)))
    hits = sum((wanted & found).values())
    return hits / sum(found.values()) if found else 0, hits / sum(wanted.values())


async def live_evaluate(path):
    # Do not load .env, inspect keys, or construct a client until explicitly opted in.
    from app.imports import ColumnMapper
    from app.ingestion import as_table, extract
    from app.photos import PhotoPipeline
    from app.settings import Settings

    case = read_json(path)
    settings = Settings(_env_file=None)
    if settings.coach_mode != "gemini":
        return None
    data = (path.parent / case["input"]).read_bytes()
    if case["adapter"] == "document":
        from app.document_ai import DocumentAIReader

        reader = DocumentAIReader(settings)
        if not reader.enabled:
            return None
        result = await reader.read(data, case["processor"], case["mime"])
        return result.model_dump(mode="json") if result else {}
    if case["adapter"] == "menu":
        mapper = ColumnMapper(settings)
        try:
            result = await extract(mapper, PhotoPipeline(settings), data, case["mime"])
            _, rows, _, _ = as_table(result)
            return {
                "items": [
                    {
                        "name": r[1],
                        "price": to_minor(float(r[4]), case["currency"]),
                        "size": r[5],
                        "category": r[6],
                    }
                    for r in rows
                ]
            }
        finally:
            await mapper.close()
    return evaluate(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Opt in to provider calls; advisory")
    args = parser.parse_args()
    totals = Counter()
    fields = {}
    for path in cases():
        case = read_json(path)
        group = "structured" if case["adapter"] in {"connector", "supply"} else "fixture"
        try:
            if args.live:
                actual = asyncio.run(live_evaluate(path))
                if actual is None:
                    print(f"SKIP {path.parent.name}: live mode/processor not configured")
                    totals["skipped"] += 1
                    continue
            else:
                with offline_guard():
                    actual = evaluate(path)
            expected = read_json(path.parent / "expected.json")
            precision, recall = score(expected, actual)
            passed = precision == recall == 1
            wanted = Counter(leaves(expected))
            found = Counter(leaves(project(actual, expected)))
            for field in {key for key, _ in wanted | found}:
                values = fields.setdefault(field, [0, 0, 0])
                values[0] += sum(n for (key, _), n in (wanted & found).items() if key == field)
                values[1] += sum(n for (key, _), n in found.items() if key == field)
                values[2] += sum(n for (key, _), n in wanted.items() if key == field)
            print(
                f"{'PASS' if passed else 'FAIL'} {path.parent.name} [{group}] "
                f"precision={precision:.3f} recall={recall:.3f}"
            )
            if not passed:
                print("  missing/wrong:", list((wanted - found).elements()))
            requirements = path.parent / "requirements.json"
            if requirements.exists():
                required = read_json(requirements)
                _, coverage = score(required, actual)
                print(
                    f"  REQUIRED coverage={coverage:.3f} (excluded from contract score): "
                    f"{json.dumps(required, ensure_ascii=False)}"
                )
                totals["requirement_cases"] += 1
                totals["requirement_cases_met"] += int(coverage == 1)
            totals[f"{group}_total"] += 1
            totals[f"{group}_passed"] += int(passed)
        except Exception as error:
            # Provider exceptions may contain sensitive text; emit the class only.
            print(f"FAIL {path.parent.name}: {type(error).__name__}")
            totals["errors"] += 1
    for field, (hits, found, wanted) in sorted(fields.items()):
        print(
            f"FIELD {field} precision={hits / found if found else 0:.3f} "
            f"recall={hits / wanted if wanted else 0:.3f}"
        )
    print("TOTAL", json.dumps(dict(totals), sort_keys=True))
    failed = totals["errors"] or any(
        totals[f"{g}_passed"] != totals[f"{g}_total"] for g in ("structured", "fixture")
    )
    return 0 if args.live else int(bool(failed))


if __name__ == "__main__":
    raise SystemExit(main())
