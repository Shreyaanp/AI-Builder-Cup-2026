# Impact measurements

Measured locally at 2026-10-16T14:57:28Z and 2026-10-16T15:01:15.693Z, from `a1e4f1fe846f3301e5b81ae66b082471f68c1183` (the local `origin/main` reference; no fetch). Windows-11-10.0.26200-SP0; Python 3.13.16. Uncommitted measurement scripts only.

## Twenty-second judge summary

Local automated runs saved a private shop in 1.54 s via voice fixtures and 1.85 s via the manual form (medians); photo day-close took 0.64 s. Search precision@5 was 58.0% on synthetic queries. These are workflow fixtures, not measured owner savings or live AI accuracy. Offline menu extraction ignores image content.

| Measurement                                 |          n | Measured result (p50 / p95 where applicable)              |
| ------------------------------------------- | ---------: | --------------------------------------------------------- |
| Voice-fixture onboarding                    |         15 | 1.54 / 2.58 s                                             |
| Manual-form onboarding                      |         15 | 1.85 / 2.57 s                                             |
| Photo → menu, offline                       |   3 images | Precision 33.3%; recall 11.1%; exact-price coverage 11.1% |
| Close the day, photo                        |          5 | 0.64 / 0.75 s                                             |
| Close the day, typed                        |          0 | No typed control in this flow                             |
| Coach first output, instant / fixture agent |    80 each | 10.7 / 14.3 ms; 66.8 / 359.2 ms                           |
| Local keyword search P@5                    | 10 queries | 58.0% all; 82.9% positive queries                         |

## Method and provenance

Only loopback HTTP/WebSocket traffic and local files were used. Python denies external sockets and DNS; the browser blocks external requests and host resolution. Settings dotenv loading is disabled before app import, Vite uses `envDir: false`, and child environments are allowlisted. No credentials, remote services, paid models, cloud resources or billing were used. Installed dependencies were reused without downloads. Playwright ran in the foreground with one worker and owned/cleaned up its test servers on WEB_PORT=3791, API_PORT=3891, RECALL_PATH=data/test-vectors; there are no detached server commands.

Browser timing uses `performance.now()` from before the first timed tap until the success state is visible; backend timing uses `time.perf_counter()`. All successful measured repetitions are retained, including the first; there are no discarded warmups. Debugging smoke runs are excluded from the final complete run. Percentiles use linear interpolation at `(n−1) × p`, matching `app.latency.percentile`. No CPU/network throttle, physical phone or human task study was used. A phone viewport is emulation. Small-sample p95 values are descriptive, not reliable population tails.

Raw per-run times, fixture responses, input traces and hashes are in [results.json](results.json) and [browser-results.json](browser-results.json). Hand-authored inputs and search relevance labels are in [fixtures.json](../../scripts/impact/fixtures.json).

## 1. Onboarding

Start: tap **Add shop details** from an already consented empty workspace. End: **Your shop is ready**, with a backend assertion that exactly one owned shop saved the expected name, category, address and hours. “Shop live” means this private local saved state: the shop remains non-public, with no Google publication. Sign-in/consent, menu items, phone, payment, delivery, permissions and public sharing are outside the comparison.

Both arms save the same four fields. The manual arm traverses the existing guided form and skips optional fields. The voice arm uses a silent synthetic mic and four scripted `field: value` transcripts, injected as text controls into the real offline WebSocket. The actual ADK fixture/tool proposals, review and save run normally. No proposal or successful save is mocked. This does not test natural speech, ASR, audio duration or transcription accuracy.

Taps are executed UI activations (including field focus). An utterance is one fixture turn. Each `fill()` is also recorded as one text entry with character count; individual keystrokes, reading, thinking, speech and OS permission/keyboard interactions have no simulated duration. Input counts describe this script, not a universal minimum. Do not turn this comparison into a human time-saving claim.

| Shop       | Mode   |   n | p50 / p95     | Owner input operations per run |
| ---------- | ------ | --: | ------------- | ------------------------------ |
| tea        | voice  |   5 | 1.60 / 2.68 s | 4 taps, 4 utterances           |
| tea        | manual |   5 | 2.09 / 2.72 s | 16 taps, 4 text entries        |
| bakery     | voice  |   5 | 1.48 / 2.36 s | 4 taps, 4 utterances           |
| bakery     | manual |   5 | 1.69 / 2.05 s | 16 taps, 4 text entries        |
| restaurant | voice  |   5 | 1.38 / 1.91 s | 4 taps, 4 utterances           |
| restaurant | manual |   5 | 1.85 / 2.35 s | 16 taps, 4 text entries        |

## 2. Photo → menu accuracy

No annotated menu-photo corpus exists in this checkout. The existing `bengaluru-board.jpg` GPS fixture is a plain colour image, not a readable menu. Three synthetic menu images and their ground truth were hand-authored for this measurement (tea stall, bakery, restaurant); Pillow renders the exact printed labels/prices from the saved input. They are clean digital boards, not real camera photographs. All three were uploaded to the actual `/api/v1/photos?currency=SGD` route without response stubs.

Names match by trimmed case-insensitive exact text, one-to-one, with no fuzzy matching; each wrong/duplicate prediction is an FP and each missed truth item an FN. Precision = TP/(TP+FP); recall = TP/(TP+FN). Price exact-match compares decimal SGD major units on correctly matched names. We also report exact-price coverage over every truth item so missed items cannot inflate the price score. Zero matched items means N/A.

| Fixture         | Truth / extracted items | TP / FP / FN | Precision    | Recall      | Exact price / matched | Exact price / all truth |
| --------------- | ----------------------- | ------------ | ------------ | ----------- | --------------------- | ----------------------- |
| tea             | 3 / 1                   | 1 / 0 / 2    | 1/1 (100.0%) | 1/3 (33.3%) | 1/1 (100.0%)          | 1/3 (33.3%)             |
| bakery          | 3 / 1                   | 0 / 1 / 3    | 0/1 (0.0%)   | 0/3 (0.0%)  | N/A (0 matches)       | 0/3 (0.0%)              |
| restaurant      | 3 / 1                   | 0 / 1 / 3    | 0/1 (0.0%)   | 0/3 (0.0%)  | N/A (0 matches)       | 0/3 (0.0%)              |
| **Micro total** | 9 / 3                   | 1 / 2 / 8    | 1/3 (33.3%)  | 1/9 (11.1%) | 1/1 (100.0%)          | 1/9 (11.1%)             |

Offline mode always returns **Chai, 15**, and labels it “Offline fixture: no model read this photo.” Any match is coincidental fixture overlap. These figures test scoring and transport only; they establish neither OCR/Gemini accuracy nor real menu coverage.

## 3. Close the day

Photo path: **Close the day → Till or POS report → select local fixture → Review → Save day → Day closed**. n=5, p50/p95 0.64 / 0.75 s; 4 taps, 1 file selection per run. The file-selection operation is counted separately: native picker taps, taking a photograph and finding a file are not exercised. Shop setup and navigation to Grow are excluded. Persistence is checked after the timed success state: both expected sales lines must exist, with none saved before approval.

The offline reader ignores the photo and generates counts from the shop's saved inventory. The image is only a valid transport fixture, not a recognised till slip. No typed path exists inside Close the day in this revision. A browser probe records its available buttons and zero text inputs. Typed time/taps: **unavailable, n=0**. The separate pasted import flow is a different journey; we do not silently substitute it or invent a comparison.

## 4. Coach latency: current offline run and recorded timings

The current offline run reuses the eight requests from `backend/scripts/latency_bench.py`, ten sessions per arm. The instant arm enables the rule path; the other disables it and uses the ADK fixture model. In-memory ADK sessions and temporary SQLite merchant storage are used; this is server-side runtime overhead, excluding HTTP, browser rendering and session creation. The fixture's scripted streaming delays are included; these durations do not estimate Gemini inference or real token generation.

| Source / flow                           |   n | First visible output p50 / p95 | First text delta p50 / p95 | Complete p50 / p95 |
| --------------------------------------- | --: | ------------------------------ | -------------------------- | ------------------ |
| New offline run: text_instant           |  80 | 10.7 / 14.3 ms                 | Unavailable (n=0)          | 10.8 / 14.4 ms     |
| New offline run: text_agent             |  80 | 66.8 / 359.2 ms                | 76.8 / 305.1 ms (n=50)     | 542.9 / 736.5 ms   |
| Recorded Gemini single-scenario turns   |  26 | Unavailable                    | Unavailable                | 4715.0 / 9327.5 ms |
| Recorded Gemini multi-turn conversation |   6 | Unavailable                    | Unavailable                | 3465.0 / 5297.5 ms |

The existing `app.latency.stats` first-output samples and its p50/p95 summaries are saved verbatim in `results.json` and supply the first-output column above. They are **first visible output**, which can be a review card or complete reply, not necessarily a token. The harness separately records the first `delta` when one actually occurs and completion at `turn_complete`. The existing stats do not contain completion timings. `voice_first_audio` is unmeasured offline: there is no recognised speech or generated reply audio.

Recorded figures are freshly recalculated locally from the checked-in `coach-eval-gemini-3.5-flash.json`, described by the existing latency report as a 15 Oct developer-machine live Gemini evaluation. This task made no new Gemini call and does not independently verify those historical runs. All timed standalone records, including the multimodal outlier and failures, are retained; the multi-turn parent has no duration, so its timed children are reported separately. Historical first-token/first-output timestamps do not exist and cannot be reconstructed from total duration. The old aggregate `latency-offline.json` is not copied as a fresh measurement.

## 5. Search quality

There was no `docs/impact/search-eval.md` or dedicated search-eval runner in this revision. This saved fallback eval calls the real `/api/v1/discover/ask` endpoint in `keywords` mode against 18 locally seeded shared shops. It uses the existing intent parser, matcher and ranker; no alternate search implementation is introduced. The primary `best` local group is scored; the separate offline Google-place fixture groups and client cache ranking are outside this eval.

Ten queries and relevance labels were hand-authored before the run: item/category, budget, halal, vegetarian, locally made, sold-out and no-match cases. A relevant result must satisfy the requested available item and confirmed facts/budget; labels never come from the ranker's own output. Corpus variants are synthetic and closely related, so this is a small diagnostic, not a representative benchmark. Precision@5 = relevant unique primary results in the first five / **5**, even if fewer results are returned. Missing slots count as zero. No-match queries therefore score zero even when abstention is correct; positive-query P@5 is reported separately, with all negatives visible below.

| Query                | Relevant in corpus | Returned @5 | Relevant @5 |    P@5 |
| -------------------- | -----------------: | ----------: | ----------: | -----: |
| chai                 |                  6 |           5 |           5 | 100.0% |
| bakery               |                  6 |           5 |           5 | 100.0% |
| chicken rice         |                  6 |           5 |           5 | 100.0% |
| halal chai           |                  3 |           3 |           3 |  60.0% |
| vegetarian noodles   |                  3 |           3 |           3 |  60.0% |
| homemade kaya bun    |                  3 |           3 |           3 |  60.0% |
| kaya bun under 2     |                  6 |           5 |           5 | 100.0% |
| chicken rice under 1 |                  0 |           0 |           0 |   0.0% |
| sold out special     |                  0 |           0 |           0 |   0.0% |
| bicycle repair       |                  0 |           0 |           0 |   0.0% |

Macro P@5: **58.0%** across all queries; **82.9%** across queries with relevant shops. All ranked labels, expected labels, parsed intents and timings are saved for inspection.

## Files changed, rerun and limits

Added `scripts/impact/` (offline entry point, browser measurements/config, report generator, hand-authored inputs and three generated menu fixtures), and `docs/impact/measurements.md`, `results.json`, `browser-results.json`, `verification.md`. Updated `graphify-out/` using the required AST-only graph refresh. Application code and dependency locks are unchanged. Leave these changes uncommitted for the orchestrator.

Use the existing installed Node dependencies, Python 3.13 backend environment and Chrome. No install/download command is part of the rerun. From the repository root, in PowerShell:

```powershell
$env:WEB_PORT='3791'; $env:API_PORT='3891'; $env:RECALL_PATH='data/test-vectors'
$env:UV_OFFLINE='1'; $env:PYTHONUTF8='1'
& backend/.venv/Scripts/python.exe scripts/impact/offline.py measure
$env:IMPACT_RUNS='5'
node node_modules/@playwright/test/cli.js test -c scripts/impact/playwright.config.ts --workers=1
& backend/.venv/Scripts/python.exe scripts/impact/report.py
node node_modules/prettier/bin/prettier.cjs --write "docs/impact/measurements.md" "docs/impact/results.json" "docs/impact/browser-results.json"
```

For Linux/macOS use `.venv/bin/python` and equivalent environment assignment. Both reserved ports must be free; existing servers are never reused. A complete browser run overwrites its output and the generator rejects missing sample groups. Raw data are the evidence; generated prose is a summary.

Tests run, exact commands and results from the resumed run are recorded in [verification.md](verification.md). That dated record is separate from the measurements; rerunning this generator does not rerun those checks.

Open risks: no human onboarding baseline, physical-phone/microphone/ASR test, live photo recognition, live coach timing, public listing/publishing validation, durable cloud-storage timing, typed Close the day journey or representative search ground truth. Automated action speed and fixture delays must not appear in the deck as measured owner time savings or live-model performance.
