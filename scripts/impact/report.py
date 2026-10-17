"""Derive the deck report from saved samples; no app imports, network or credentials."""

# Markdown prose and table rows are intentionally longer than Python's source line limit.
# ruff: noqa: E501

from __future__ import annotations

import hashlib
import json
import statistics
from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/impact"


def percentile(values: list[float], share: float) -> float:
    ordered = sorted(values)
    rank = (len(ordered) - 1) * share
    low = int(rank)
    return ordered[low] + (ordered[min(low + 1, len(ordered) - 1)] - ordered[low]) * (rank - low)


def times(rows: list[dict[str, Any]]) -> str:
    values = [row["elapsed_ms"] / 1000 for row in rows]
    return f"{percentile(values, 0.5):.2f} / {percentile(values, 0.95):.2f} s"


def ms(pair: dict[str, Any]) -> str:
    return f"{pair['p50_ms']:.1f} / {pair['p95_ms']:.1f} ms" if pair["n"] else "Unavailable"


def ratio(numerator: int, denominator: int) -> str:
    return (
        f"{numerator}/{denominator} ({numerator / denominator:.1%})"
        if denominator
        else "N/A (0 matches)"
    )


def validate_samples(result: dict[str, Any], browser: dict[str, Any]) -> None:
    """Check provenance, complete sample groups and independently recalculate scores."""
    fixtures = ROOT / "scripts/impact/fixtures.json"
    assert hashlib.sha256(fixtures.read_bytes()).hexdigest() == result["fixtures_sha256"]
    inputs = json.loads(fixtures.read_text(encoding="utf-8"))
    assert len(result["photos"]) == len(inputs["shops"]) == 3
    for photo in result["photos"]:
        assert hashlib.sha256((ROOT / photo["fixture"]).read_bytes()).hexdigest() == photo["sha256"]
        shop = next(s for s in inputs["shops"] if s["id"] == Path(photo["fixture"]).stem)
        assert photo["ground_truth"] == shop["menu"]
        remaining = {name.casefold(): Decimal(price) for name, price in photo["ground_truth"]}
        tp = exact = 0
        for item in photo["predicted"]:
            name = item["name"].strip().casefold()
            if name in remaining:
                tp += 1
                exact += Decimal(str(item["price"])) == remaining.pop(name)
        assert (photo["tp"], photo["fp"], photo["fn"], photo["price_exact"]) == (
            tp,
            len(photo["predicted"]) - tp,
            len(remaining),
            exact,
        )
    for flow in ("text_instant", "text_agent"):
        rows = [row for row in result["latency"]["samples"] if row["flow"] == flow]
        assert len(rows) == 80
        for row in rows:
            assert 0 < row["first_visible_ms"] <= row["complete_ms"]
            if row["first_delta_ms"] is not None:
                assert row["first_visible_ms"] <= row["first_delta_ms"] <= row["complete_ms"]
        for metric in ("first_visible_ms", "first_delta_ms", "complete_ms"):
            values = [row[metric] for row in rows if row[metric] is not None]
            stored = result["latency"][flow][metric]
            assert stored["n"] == len(values)
            if values:
                assert abs(stored["p50_ms"] - statistics.median(values)) <= 0.00051
                p95 = statistics.quantiles(values, n=100, method="inclusive")[94]
                assert abs(stored["p95_ms"] - p95) <= 0.00051
        values = result["latency"]["existing_stats_samples_ms"][flow]
        stored = result["latency"]["existing_stats"][flow]
        assert stored["n"] == len(values) == len(rows)
        assert abs(stored["p50_ms"] - statistics.median(values)) <= 0.05001
        assert abs(stored["p95_ms"] - percentile(values, 0.95)) <= 0.05001
    assert [q["q"] for q in result["search"]["queries"]] == [
        q["q"] for q in inputs["search"]["queries"]
    ]
    for query, expected in zip(
        result["search"]["queries"], inputs["search"]["queries"], strict=True
    ):
        assert query["relevant"] == expected["relevant"]
        assert len(query["ranked"]) == len(set(query["ranked"]))
        hits = sum(label in query["relevant"] for label in query["ranked"][:5])
        assert query["hits_at_5"] == hits
        assert query["precision_at_5"] == hits / 5
    for key, queries in (
        ("macro_precision_at_5", result["search"]["queries"]),
        (
            "positive_macro_precision_at_5",
            [q for q in result["search"]["queries"] if q["relevant"]],
        ),
    ):
        assert (
            abs(result["search"][key] - statistics.mean(q["precision_at_5"] for q in queries))
            < 1e-12
        )
    recorded = result["recorded"]
    assert (
        hashlib.sha256((ROOT / recorded["source"]).read_bytes()).hexdigest() == recorded["sha256"]
    )
    for key, samples in (
        ("complete", "samples"),
        ("multi_turn_complete", "multi_turn_samples"),
    ):
        values = [r["complete_ms"] for r in recorded[samples]]
        assert recorded[key]["n"] == len(values)
        for share, metric in ((0.5, "p50_ms"), (0.95, "p95_ms")):
            assert abs(recorded[key][metric] - percentile(values, share)) <= 0.00051
    for shop in inputs["shops"]:
        for mode in ("voice", "manual"):
            group = [
                r
                for r in browser["rows"]
                if r.get("shop") == shop["id"] and r["flow"] == f"onboarding_{mode}"
            ]
            assert sorted(r["repeat"] for r in group) == list(range(browser["runs"]))
    typed = [r for r in browser["rows"] if r["flow"] == "close_day_typed"]
    assert len(typed) == 1 and typed[0]["status"] == "unavailable" and typed[0]["text_inputs"] == 0
    for row in browser["rows"]:
        if "elapsed_ms" in row:
            assert row["elapsed_ms"] > 0
            assert all(0 <= action["at_ms"] <= row["elapsed_ms"] for action in row["actions"])
        if row["flow"].startswith("onboarding_"):
            assert row["persisted"] and row["public"] is False
        elif row["flow"] == "close_day_photo":
            assert row["persisted_lines"] == 2


def main() -> None:
    result = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
    browser = json.loads((OUT / "browser-results.json").read_text(encoding="utf-8"))
    assert result["commit"] == browser["commit"], "Measurements came from different revisions"
    assert result["fixtures_sha256"] == browser["fixtures_sha256"], "Fixture inputs changed"
    validate_samples(result, browser)
    rows = browser["rows"]
    runs = browser["runs"]
    assert len([r for r in rows if r["flow"] == "onboarding_voice"]) == 3 * runs
    assert len([r for r in rows if r["flow"] == "onboarding_manual"]) == 3 * runs
    assert len([r for r in rows if r["flow"] == "close_day_photo"]) == runs
    voice = [r for r in rows if r["flow"] == "onboarding_voice"]
    manual = [r for r in rows if r["flow"] == "onboarding_manual"]
    close = [r for r in rows if r["flow"] == "close_day_photo"]
    photos = result["photos"]
    tp, fp, fn, exact = (
        sum(row[key] for row in photos) for key in ("tp", "fp", "fn", "price_exact")
    )
    search = result["search"]
    latency = result["latency"]
    recorded = result["recorded"]

    def counts(group: list[dict[str, Any]]) -> str:
        counts = [Counter(action["kind"] for action in r["actions"]) for r in group]
        assert all(c == counts[0] for c in counts), (
            "Input counts varied: report raw samples instead"
        )
        labels = {
            "tap": ("tap", "taps"),
            "utterance": ("utterance", "utterances"),
            "text_entry": ("text entry", "text entries"),
            "file_selection": ("file selection", "file selections"),
        }
        return ", ".join(
            f"{number} {labels[kind][number != 1]}" for kind, number in counts[0].items()
        )

    lines = [
        "# Impact measurements",
        "",
        f"Measured locally at {result['measured_at_utc']} and {browser['measured_at_utc']}, "
        f"from `{result['commit']}` (the local `origin/main` reference; no fetch). "
        f"{result['platform']}; Python {result['python']}. Uncommitted measurement scripts only.",
        "",
        "## Twenty-second judge summary",
        "",
        f"Local automated runs saved a private shop in {times(voice).split(' / ')[0]} s via voice fixtures "
        f"and {times(manual).split(' / ')[0]} s via the manual form (medians); "
        f"photo day-close took {times(close).split(' / ')[0]} s. "
        f"Search precision@5 was {search['macro_precision_at_5']:.1%} on synthetic queries. "
        "These are workflow fixtures, not measured owner savings or live AI accuracy. "
        "Offline menu extraction ignores image content.",
        "",
        "| Measurement | n | Measured result (p50 / p95 where applicable) |",
        "| --- | ---: | --- |",
        f"| Voice-fixture onboarding | {len(voice)} | {times(voice)} |",
        f"| Manual-form onboarding | {len(manual)} | {times(manual)} |",
        f"| Photo → menu, offline | {len(photos)} images | Precision {tp / (tp + fp):.1%}; recall {tp / (tp + fn):.1%}; exact-price coverage {exact / (tp + fn):.1%} |",
        f"| Close the day, photo | {len(close)} | {times(close)} |",
        "| Close the day, typed | 0 | No typed control in this flow |",
        f"| Coach first output, instant / fixture agent | {latency['text_instant']['first_visible_ms']['n']} each | "
        f"{ms(latency['existing_stats']['text_instant'])}; {ms(latency['existing_stats']['text_agent'])} |",
        f"| Local keyword search P@5 | {len(search['queries'])} queries | {search['macro_precision_at_5']:.1%} all; "
        f"{search['positive_macro_precision_at_5']:.1%} positive queries |",
        "",
        "## Method and provenance",
        "",
        "Only loopback HTTP/WebSocket traffic and local files were used. Python denies external sockets and DNS; "
        "the browser blocks external requests and host resolution. Settings dotenv loading is disabled before app import, "
        "Vite uses `envDir: false`, and child environments are allowlisted. No credentials, remote services, paid models, "
        "cloud resources or billing were used. Installed dependencies were reused without downloads. "
        "Playwright ran in the foreground with one worker and owned/cleaned up its test servers on "
        "WEB_PORT=3791, API_PORT=3891, RECALL_PATH=data/test-vectors; there are no detached server commands.",
        "",
        "Browser timing uses `performance.now()` from before the first timed tap until the success state is visible; "
        "backend timing uses `time.perf_counter()`. All successful measured repetitions are retained, including the first; "
        "there are no discarded warmups. Debugging smoke runs are excluded from the final complete run. "
        "Percentiles use linear interpolation at `(n−1) × p`, matching `app.latency.percentile`. "
        "No CPU/network throttle, physical phone or human task study was used. A phone viewport is emulation. "
        "Small-sample p95 values are descriptive, not reliable population tails.",
        "",
        "Raw per-run times, fixture responses, input traces and hashes are in [results.json](results.json) "
        "and [browser-results.json](browser-results.json). Hand-authored inputs and search relevance labels are in "
        "[fixtures.json](../../scripts/impact/fixtures.json).",
        "",
        "## 1. Onboarding",
        "",
        "Start: tap **Add shop details** from an already consented empty workspace. End: **Your shop is ready**, "
        "with a backend assertion that exactly one owned shop saved the expected name, category, address and hours. "
        "“Shop live” means this private local saved state: the shop remains non-public, with no Google publication. "
        "Sign-in/consent, menu items, phone, payment, delivery, permissions and public sharing are outside the comparison.",
        "",
        "Both arms save the same four fields. The manual arm traverses the existing guided form and skips optional fields. "
        "The voice arm uses a silent synthetic mic and four scripted `field: value` transcripts, injected as text controls "
        "into the real offline WebSocket. The actual ADK fixture/tool proposals, review and save run normally. "
        "No proposal or successful save is mocked. This does not test natural speech, ASR, audio duration or transcription accuracy.",
        "",
        "Taps are executed UI activations (including field focus). An utterance is one fixture turn. "
        "Each `fill()` is also recorded as one text entry with character count; individual keystrokes, reading, thinking, "
        "speech and OS permission/keyboard interactions have no simulated duration. Input counts describe this script, "
        "not a universal minimum. Do not turn this comparison into a human time-saving claim.",
        "",
        "| Shop | Mode | n | p50 / p95 | Owner input operations per run |",
        "| --- | --- | ---: | --- | --- |",
    ]
    for shop in ("tea", "bakery", "restaurant"):
        for mode in ("voice", "manual"):
            group = [r for r in rows if r.get("shop") == shop and r["flow"] == f"onboarding_{mode}"]
            lines.append(f"| {shop} | {mode} | {len(group)} | {times(group)} | {counts(group)} |")
    lines += [
        "",
        "## 2. Photo → menu accuracy",
        "",
        "No annotated menu-photo corpus exists in this checkout. The existing `bengaluru-board.jpg` GPS fixture "
        "is a plain colour image, not a readable menu. Three synthetic menu images and their ground truth were "
        "hand-authored for this measurement (tea stall, bakery, restaurant); Pillow renders the exact printed labels/prices "
        "from the saved input. They are clean digital boards, not real camera photographs. "
        "All three were uploaded to the actual `/api/v1/photos?currency=SGD` route without response stubs.",
        "",
        "Names match by trimmed case-insensitive exact text, one-to-one, with no fuzzy matching; each wrong/duplicate "
        "prediction is an FP and each missed truth item an FN. Precision = TP/(TP+FP); recall = TP/(TP+FN). "
        "Price exact-match compares decimal SGD major units on correctly matched names. We also report exact-price "
        "coverage over every truth item so missed items cannot inflate the price score. Zero matched items means N/A.",
        "",
        "| Fixture | Truth / extracted items | TP / FP / FN | Precision | Recall | Exact price / matched | Exact price / all truth |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in photos:
        lines.append(
            f"| {Path(row['fixture']).stem} | {len(row['ground_truth'])} / {len(row['predicted'])} | "
            f"{row['tp']} / {row['fp']} / {row['fn']} | {ratio(row['tp'], len(row['predicted']))} | "
            f"{ratio(row['tp'], len(row['ground_truth']))} | {ratio(row['price_exact'], row['tp'])} | "
            f"{ratio(row['price_exact'], len(row['ground_truth']))} |"
        )
    lines += [
        f"| **Micro total** | {tp + fn} / {tp + fp} | {tp} / {fp} / {fn} | "
        f"{ratio(tp, tp + fp)} | {ratio(tp, tp + fn)} | {ratio(exact, tp)} | {ratio(exact, tp + fn)} |",
        "",
        "Offline mode always returns **Chai, 15**, and labels it “Offline fixture: no model read this photo.” "
        "Any match is coincidental fixture overlap. These figures test scoring and transport only; "
        "they establish neither OCR/Gemini accuracy nor real menu coverage.",
        "",
        "## 3. Close the day",
        "",
        f"Photo path: **Close the day → Till or POS report → select local fixture → Review → Save day → Day closed**. "
        f"n={len(close)}, p50/p95 {times(close)}; {counts(close)} per run. "
        "The file-selection operation is counted separately: native picker taps, taking a photograph and finding a file "
        "are not exercised. Shop setup and navigation to Grow are excluded. Persistence is checked after the timed "
        "success state: both expected sales lines must exist, with none saved before approval.",
        "",
        "The offline reader ignores the photo and generates counts from the shop's saved inventory. "
        "The image is only a valid transport fixture, not a recognised till slip. No typed path exists inside "
        "Close the day in this revision. A browser probe records its available buttons and zero text inputs. "
        "Typed time/taps: **unavailable, n=0**. The separate pasted import flow is a different journey; "
        "we do not silently substitute it or invent a comparison.",
        "",
        "## 4. Coach latency: current offline run and recorded timings",
        "",
        "The current offline run reuses the eight requests from `backend/scripts/latency_bench.py`, "
        "ten sessions per arm. The instant arm enables the rule path; the other disables it and uses the ADK fixture model. "
        "In-memory ADK sessions and temporary SQLite merchant storage are used; this is server-side runtime overhead, "
        "excluding HTTP, browser rendering and session creation. The fixture's scripted streaming delays "
        "are included; these durations do not estimate Gemini inference or real token generation.",
        "",
        "| Source / flow | n | First visible output p50 / p95 | First text delta p50 / p95 | Complete p50 / p95 |",
        "| --- | ---: | --- | --- | --- |",
    ]
    for flow in ("text_instant", "text_agent"):
        data = latency[flow]
        lines.append(
            f"| New offline run: {flow} | {data['first_visible_ms']['n']} | "
            f"{ms(latency['existing_stats'][flow])} | {ms(data['first_delta_ms'])} "
            f"(n={data['first_delta_ms']['n']}) | {ms(data['complete_ms'])} |"
        )
    lines += [
        f"| Recorded Gemini single-scenario turns | {recorded['complete']['n']} | Unavailable | Unavailable | {ms(recorded['complete'])} |",
        f"| Recorded Gemini multi-turn conversation | {recorded['multi_turn_complete']['n']} | Unavailable | Unavailable | {ms(recorded['multi_turn_complete'])} |",
        "",
        "The existing `app.latency.stats` first-output samples and its p50/p95 summaries are saved verbatim in "
        "`results.json` and supply the first-output column above. They are **first visible output**, "
        "which can be a review card or complete reply, not necessarily "
        "a token. The harness separately records the first `delta` when one actually occurs and completion at "
        "`turn_complete`. The existing stats do not contain completion timings. "
        "`voice_first_audio` is unmeasured offline: there is no recognised speech or generated reply audio.",
        "",
        "Recorded figures are freshly recalculated locally from the checked-in "
        "`coach-eval-gemini-3.5-flash.json`, described by the existing latency report as a 15 Oct developer-machine "
        "live Gemini evaluation. This task made no new Gemini call and does not independently verify those historical "
        "runs. All timed standalone records, including the multimodal outlier and failures, are retained; "
        "the multi-turn parent has no duration, so its timed children are reported separately. "
        "Historical first-token/first-output timestamps do not exist and cannot be reconstructed from total duration. "
        "The old aggregate `latency-offline.json` is not copied as a fresh measurement.",
        "",
        "## 5. Search quality",
        "",
        "There was no `docs/impact/search-eval.md` or dedicated search-eval runner in this revision. "
        "This saved fallback eval calls the real `/api/v1/discover/ask` endpoint in `keywords` mode against "
        f"{search['corpus_n']} locally seeded shared shops. It uses the existing intent parser, matcher and ranker; "
        "no alternate search implementation is introduced. The primary `best` local group is scored; "
        "the separate offline Google-place fixture groups and client cache ranking are outside this eval.",
        "",
        "Ten queries and relevance labels were hand-authored before the run: item/category, budget, halal, vegetarian, "
        "locally made, sold-out and no-match cases. A relevant result must satisfy the requested available item and "
        "confirmed facts/budget; labels never come from the ranker's own output. Corpus variants are synthetic and "
        "closely related, so this is a small diagnostic, not a representative benchmark. "
        "Precision@5 = relevant unique primary results in the first five / **5**, even if fewer results are returned. "
        "Missing slots count as zero. No-match queries therefore score zero even when abstention is correct; "
        "positive-query P@5 is reported separately, with all negatives visible below.",
        "",
        "| Query | Relevant in corpus | Returned @5 | Relevant @5 | P@5 |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for row in search["queries"]:
        lines.append(
            f"| {row['q']} | {len(row['relevant'])} | {row['returned_at_5']} | "
            f"{row['hits_at_5']} | {row['precision_at_5']:.1%} |"
        )
    lines += [
        "",
        f"Macro P@5: **{search['macro_precision_at_5']:.1%}** across all queries; "
        f"**{search['positive_macro_precision_at_5']:.1%}** across queries with relevant shops. "
        "All ranked labels, expected labels, parsed intents and timings are saved for inspection.",
        "",
        "## Files changed, rerun and limits",
        "",
        "Added `scripts/impact/` (offline entry point, browser measurements/config, report generator, "
        "hand-authored inputs and three generated menu fixtures), and `docs/impact/measurements.md`, "
        "`results.json`, `browser-results.json`, `verification.md`. Updated `graphify-out/` using the required "
        "AST-only graph refresh. Application code and dependency locks are unchanged. "
        "Leave these changes uncommitted for the orchestrator.",
        "",
        "Use the existing installed Node dependencies, Python 3.13 backend environment and Chrome. "
        "No install/download command is part of the rerun. From the repository root, in PowerShell:",
        "",
        "```powershell",
        "$env:WEB_PORT='3791'; $env:API_PORT='3891'; $env:RECALL_PATH='data/test-vectors'",
        "$env:UV_OFFLINE='1'; $env:PYTHONUTF8='1'",
        "& backend/.venv/Scripts/python.exe scripts/impact/offline.py measure",
        "$env:IMPACT_RUNS='5'",
        "node node_modules/@playwright/test/cli.js test -c scripts/impact/playwright.config.ts --workers=1",
        "& backend/.venv/Scripts/python.exe scripts/impact/report.py",
        'node node_modules/prettier/bin/prettier.cjs --write "docs/impact/measurements.md" "docs/impact/results.json" "docs/impact/browser-results.json"',
        "```",
        "",
        "For Linux/macOS use `.venv/bin/python` and equivalent environment assignment. "
        "Both reserved ports must be free; existing servers are never reused. "
        "A complete browser run overwrites its output and the generator rejects missing sample groups. "
        "Raw data are the evidence; generated prose is a summary.",
        "",
        "Tests run, exact commands and results from the resumed run are recorded in "
        "[verification.md](verification.md). That dated record is separate from the measurements; "
        "rerunning this generator does not rerun those checks.",
        "",
        "Open risks: no human onboarding baseline, physical-phone/microphone/ASR test, live photo recognition, "
        "live coach timing, public listing/publishing validation, durable cloud-storage timing, typed Close the day "
        "journey or representative search ground truth. Automated action speed and fixture delays must not appear "
        "in the deck as measured owner time savings or live-model performance.",
        "",
    ]
    (OUT / "measurements.md").write_text("\n".join(lines), encoding="utf-8")
    print("Generated docs/impact/measurements.md from saved samples.")


if __name__ == "__main__":
    main()
