"""Coach evals from the command line (OB-173, #532). Run from backend/.

Offline (free, what CI runs as pytest):
  uv run python -m evals.coach
Live (real Gemini, by hand; each case 3 times, reports pass^3):
  GEMINI_BACKEND=api_key GOOGLE_API_KEY=... uv run python -m evals.coach --live
  GEMINI_BACKEND=vertex GOOGLE_CLOUD_PROJECT=... uv run python -m evals.coach --live  (ADC)
Options: --trials N, --only id,group,... (substring match), --model ID (default
COACH_EVAL_MODEL or gemini-3.5-flash-lite), --out results.json, --concurrency N.
Synthetic shops in a temporary SQLite store; never production data.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from .cases import CASES, Case
from .harness import CaseResult, Mode, run_case, settings_for


async def trials(
    case: Case, mode: Mode, count: int, root: Path, model: str, gate: asyncio.Semaphore
) -> list[CaseResult]:
    results = []
    for trial in range(count):
        async with gate:
            folder = root / f"{case.id}-{trial}"
            folder.mkdir()
            try:
                results.append(await run_case(case, mode, folder, model))
            except Exception as error:  # a seed or provider failure fails this trial only
                results.append(CaseResult(case, mode, [], error=repr(error)[:300]))
    return results


def row(case: Case, results: list[CaseResult]) -> dict[str, Any]:
    return {
        "case": case.id,
        "group": case.group,
        "known": case.known,
        "passes": sum(r.passed for r in results),
        "trials": len(results),
        "pass_all": all(r.passed for r in results),
        "runs": [
            {
                "passed": r.passed,
                "failures": r.failures(),
                "turns": [
                    {
                        "say": record.say,
                        "calls": record.calls,
                        "cards": record.cards,
                        "reply": record.reply,
                        "checks": checks,
                    }
                    for record, checks in r.turns
                ],
            }
            for r in results
        ],
    }


async def main(args: argparse.Namespace) -> list[dict[str, Any]]:
    mode: Mode = "live" if args.live else "offline"
    settings_for(mode, args.model)  # a missing key or project fails here, not 3x per case
    count = args.trials or (3 if args.live else 1)
    cases = [
        case
        for case in CASES
        if not args.only or any(part in f"{case.id} {case.group}" for part in args.only.split(","))
    ]
    gate = asyncio.Semaphore(args.concurrency)
    # Windows keeps SQLite files locked briefly; leftover temp files are harmless.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
        results = await asyncio.gather(
            *(trials(case, mode, count, Path(directory), args.model, gate) for case in cases)
        )
    rows = [row(case, found) for case, found in zip(cases, results, strict=True)]
    for entry in rows:
        mark = "PASS" if entry["pass_all"] else "XFAIL" if entry["known"] else "FAIL"
        print(f"{mark:5} {entry['passes']}/{entry['trials']}  {entry['case']}")
        if not entry["pass_all"]:
            failures = {f for run in entry["runs"] for f in run["failures"]}
            for failure in sorted(failures):
                print(f"        - {failure}")
            if entry["known"]:
                print(f"        known: {entry['known']}")
    total = len(rows)
    trial_passes = sum(e["passes"] for e in rows)
    trial_count = sum(e["trials"] for e in rows)
    print(f"\nBy group (pass^{count}):")
    for group in sorted({e["group"] for e in rows}):
        members = [e for e in rows if e["group"] == group]
        print(f"  {group:16} {sum(e['pass_all'] for e in members)}/{len(members)}")
    unknown = [e["case"] for e in rows if not e["pass_all"] and not e["known"]]
    print(
        f"\n{mode}{f' ({args.model})' if args.live else ''}: "
        f"pass^{count} {sum(e['pass_all'] for e in rows)}/{total}, "
        f"per-trial {trial_passes}/{trial_count}; "
        f"new failures: {', '.join(unknown) or 'none'}"
    )
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(prog="python -m evals.coach")
    parser.add_argument("--live", action="store_true", help="real Gemini (costs money)")
    parser.add_argument("--trials", type=int, default=0, help="runs per case (live default 3)")
    parser.add_argument("--only", default="", help="comma-separated case id or group parts")
    parser.add_argument(
        "--model", default=os.environ.get("COACH_EVAL_MODEL", "gemini-3.5-flash-lite")
    )
    parser.add_argument("--out", default="", help="write every turn as JSON")
    parser.add_argument("--concurrency", type=int, default=4)
    parsed = parser.parse_args()
    if not parsed.live:
        # Whatever the shell says, offline never calls a model.
        os.environ["COACH_MODE"] = "offline"
    output = asyncio.run(main(parsed))
    if parsed.out:
        Path(parsed.out).write_text(
            json.dumps(output, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
        )
