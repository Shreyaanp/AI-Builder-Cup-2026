"""Compare Document AI with Gemini vision on the committed receipt and invoice photos.

Both readers see the same sanitised JPEG the app sends. Scores per document: lines found (item
name matches the truth), quantity right, amount right (till receipts) and date right, plus extra
lines that are not on the paper and the wall time, for each reader alone and for the app's
pipeline (Document AI when its reading is complete, otherwise Gemini). Live calls; small, one pass:

    uv run python scripts/document_ai_eval.py --project ichiropractic \
        --receipt-processor c55114827549fb20 --invoice-processor cb3082fc49117ceb
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.day_close import DOCUMENT_AI, HINTS, PROMPT, DayRead, _ReadSpec, lenient_read  # noqa: E402
from app.document_ai import DocumentAIReader  # noqa: E402
from app.photos import sanitize  # noqa: E402
from app.settings import Settings  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "documents"
REPORT = Path(__file__).resolve().parents[2] / "docs" / "impact" / "document-ai.json"


def same_item(a: str, b: str) -> bool:
    a, b = " ".join(a.casefold().split()), " ".join(b.casefold().split())
    return a == b or SequenceMatcher(None, a, b).ratio() >= 0.85


def score(truth: dict[str, Any], read: DayRead | None) -> dict[str, Any]:
    lines = read.lines if read else []
    used: set[int] = set()
    found = quantity = amount = 0
    for expected in truth["lines"]:
        match = next(
            (
                i
                for i, line in enumerate(lines)
                if i not in used and same_item(line.item, expected["item"])
            ),
            None,
        )
        if match is None:
            continue
        used.add(match)
        found += 1
        got = lines[match]
        quantity += got.quantity is not None and abs(got.quantity - expected["quantity"]) < 1e-6
        amount += got.amount is not None and abs(got.amount - expected["amount"]) < 0.005
    return {
        "lines": len(truth["lines"]),
        "found": found,
        "quantity_right": quantity,
        "amount_right": amount if truth["kind"] == "sales" else None,
        "extra_lines": len(lines) - len(used),
        "date_right": bool(read and read.date == truth["date"]),
    }


async def gemini_read(client: Any, model: str, image: bytes, hint: Any) -> DayRead | None:
    from google.genai import types

    response = await client.aio.models.generate_content(
        model=model,
        contents=types.Content(
            role="user",
            parts=[
                types.Part.from_bytes(data=image, mime_type="image/jpeg"),
                types.Part(text=PROMPT.format(hint=HINTS[hint])),
            ],
        ),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=_ReadSpec.model_json_schema(),
            temperature=0,
            max_output_tokens=4000,
        ),
    )
    return lenient_read(response.text or "", hint)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--receipt-processor", required=True)
    parser.add_argument("--invoice-processor", required=True)
    parser.add_argument("--location", default="us")
    parser.add_argument("--model", default="gemini-3.5-flash")
    args = parser.parse_args()

    from google import genai

    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        google_cloud_project=args.project,
        document_ai_enabled=True,
        document_ai_location=args.location,
        document_ai_receipt_processor=args.receipt_processor,
        document_ai_invoice_processor=args.invoice_processor,
    )
    document_ai = DocumentAIReader(settings)
    gemini = genai.Client(vertexai=True, project=args.project, location="global")
    results = []
    for truth in json.loads((FIXTURES / "truth.json").read_text(encoding="utf-8")):
        image = sanitize((FIXTURES / truth["file"]).read_bytes())
        hint = truth["kind"]
        row: dict[str, Any] = {"file": truth["file"], "kind": hint}
        started = time.monotonic()
        parsed = await document_ai.read(image, DOCUMENT_AI[hint])
        row["document_ai_ms"] = round((time.monotonic() - started) * 1000)
        doc_read = (
            DayRead.model_validate(
                {
                    "kind": hint,
                    "date": parsed.date,
                    "lines": [
                        line.model_dump(include={"item", "quantity", "amount"})
                        for line in parsed.lines
                    ],
                }
            )
            if parsed
            else None
        )
        row["document_ai"] = score(truth, doc_read)
        if parsed and hint == "delivery":
            row["document_ai"]["invoice_number_right"] = parsed.number == truth.get("number")
            row["document_ai"]["total_found"] = parsed.total is not None
        started = time.monotonic()
        try:
            gem_read = await gemini_read(gemini, args.model, image, hint)
        except Exception as error:  # report, do not stop the comparison
            print(f"gemini failed on {truth['file']}: {type(error).__name__}")
            gem_read = None
        row["gemini_ms"] = round((time.monotonic() - started) * 1000)
        row["gemini"] = score(truth, gem_read)
        # What the app does: Document AI when its reading is complete, else Gemini.
        used_document_ai = parsed is not None and parsed.complete()
        row["pipeline_reader"] = "document_ai" if used_document_ai else "gemini"
        row["pipeline"] = row["document_ai"] if used_document_ai else row["gemini"]
        row["pipeline_ms"] = row["document_ai_ms"] + (0 if used_document_ai else row["gemini_ms"])
        results.append(row)
        print(json.dumps(row))

    def total(reader: str, key: str, kind: str | None = None) -> int:
        return sum(r[reader][key] or 0 for r in results if kind is None or r["kind"] == kind)

    summary = {
        reader: {
            "lines": total(reader, "lines"),
            "found": total(reader, "found"),
            "quantity_right": total(reader, "quantity_right"),
            "sales_lines": total(reader, "lines", "sales"),
            "amount_right": total(reader, "amount_right", "sales"),
            "extra_lines": total(reader, "extra_lines"),
            "dates_right": sum(r[reader]["date_right"] for r in results),
            "median_ms": sorted(r[f"{reader}_ms"] for r in results)[len(results) // 2],
        }
        for reader in ("document_ai", "gemini", "pipeline")
    }
    summary["pipeline"]["read_by_document_ai"] = sum(
        r["pipeline_reader"] == "document_ai" for r in results
    )
    REPORT.write_text(
        json.dumps(
            {
                "model": args.model,
                "location": args.location,
                "documents": results,
                "summary": summary,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
