# Evaluation numbers (18 October 2026)

Three evaluations were run for the scorecard, kept cheap: the golden upload dataset offline (no
network) and live on 20 provider cases, plus a live re-run of the onboarding eval on 8 businesses.
All inputs are synthetic. Earlier live evaluations are summarised at the end.

## 1. Golden upload dataset (PR #188, branch `test/golden-dataset`, commit `6a282a8b`)

63 cases covering every upload and import path: menu photos in English, Hindi, Tamil and Chinese
(clean, rotated, low light), receipts and invoices as PNG and PDF, POS and accounting exports
(Tally, Shopify, Square, Zoho, Petpooja, Loyverse, generic CSV, XLSX and JSON), broken files, and
SAP-style supply documents. PR #188 is open (not merged); it was run from its branch. See
[its README](https://github.com/Shreyaanp/AI-Builder-Cup-2026/blob/test/golden-dataset/backend/tests/golden/README.md).

### Offline: the parsers and the model contracts

```powershell
$env:UV_OFFLINE = '1'; uv run --project backend python -m tests.golden.run
```

| Group                                                   | Result      | Field precision / recall |
| ------------------------------------------------------- | ----------- | ------------------------ |
| Structured imports and supply documents (deterministic) | **41 / 41** | 1.000 / 1.000            |
| Menu and document cases against recorded model replies  | **22 / 22** | 1.000 / 1.000            |
| Wanted fields the app does not extract yet              | 0 / 30 met  | tracked separately       |

The offline media score checks that the app maps a model's reply correctly. It is not OCR
accuracy; that is the live run below. Raw output: [golden/offline-2026-10-18.txt](golden/offline-2026-10-18.txt).

### Live: real Gemini and Document AI on 20 cases

`--live` on 16 menu photos (Gemini 3.5 Flash on Vertex, the app's real `ingestion.extract`) and 4
receipts and invoices (Document AI Expense and Invoice parsers, the app's `DocumentAIReader`).
Two rotated English menus were left out to stay at 20 provider calls. Run time 175 s. Raw output:
[golden/live-2026-10-18.txt](golden/live-2026-10-18.txt).

**Menu photo → items (Gemini), 16 photos:**

| Measure                          | Result                         |
| -------------------------------- | ------------------------------ |
| Photos read                      | 15 / 16 (1 refused, see below) |
| Every expected field exact       | 9 / 15                         |
| Number of items right            | 15 / 15                        |
| Prices right (to the minor unit) | **30 / 30**                    |
| Sizes right                      | 30 / 30                        |
| Categories right                 | 30 / 30                        |
| Item names exactly as printed    | 18 / 30 (60%)                  |

All six partial cases miss only on item names: the price, size and category of each item were
right. Five of the six are Hindi, Tamil or Chinese menus, so the likely cause is the model
returning a translated or transliterated name instead of the printed script. The runner does not
print the model's names, so this cause is not confirmed. The clean Hindi chai menu was refused
(`ImportRejected`): the app said it could not read the photo rather than inventing items.

**Receipts and invoices (Document AI alone), 4 documents:**

| Field        | Right |
| ------------ | ----- |
| Total        | 4 / 4 |
| Status, kind | 4 / 4 |
| Supplier     | 2 / 4 |
| Date         | 2 / 4 |
| Line items   | 0 / 4 |
| Currency     | 0 / 4 |

This calls Document AI directly with no fallback, which is the worst case. In the app, Close the
day uses Document AI's reading only when it is complete and otherwise asks Gemini. That pipeline
scored 26 / 26 lines on six other documents on 16 Oct ([document-ai.md](document-ai.md)).
**Currency is never set** by the Document AI mapping on these synthetic INR documents, so that is a
real gap.

The 41 structured cases also pass in live mode (they never call a model).

## 2. Onboarding: does the coach understand any business?

[backend/scripts/onboarding_eval.py](../../backend/scripts/onboarding_eval.py) plays an owner
through the real text coach (`/api/v1/coach/stream`, new-shop mode) on live Gemini 3.5 Flash. A
Gemini judge grades every question outside the core five.

**Full run, 17 Oct (40 businesses, Hindi and English)**, [qa/onboarding-eval.md](../qa/onboarding-eval.md):

| Pass bar                              | Result                              |
| ------------------------------------- | ----------------------------------- |
| Zero irrelevant questions             | 0 irrelevant of 215 questions: PASS |
| At least 95% of business kinds right  | 39 / 40 = 98%: PASS                 |
| Every stop word ends the conversation | 40 / 40: PASS                       |

**Re-run on current main, 18 Oct (8 businesses: 1, 2, 7, 8, 16, 18, 25, 33)**, raw:
[onboarding-rerun-2026-10-18.json](onboarding-rerun-2026-10-18.json):

| Business           | Kind (wanted)     | Questions | Extras | Result                                        |
| ------------------ | ----------------- | --------: | -----: | --------------------------------------------- |
| helmet (hi)        | service (service) |         6 |      0 | PASS                                          |
| helmet-en          | service (service) |         4 |      0 | PASS                                          |
| tea (hi)           | none (food)       |         0 |      0 | Ended after the first reply, no kind recorded |
| pharmacy (en)      | product (product) |         7 |      1 | PASS                                          |
| chai-recharge (hi) | none (mixed)      |         0 |      0 | Ended after the first reply, no kind recorded |
| vague-en           | product (product) |         3 |      0 | PASS                                          |
| dhaba (hi)         | food (food)       |         7 |      1 | PASS                                          |
| tiffin (en)        | food (food)       |         7 |      0 | FAIL: asked "delivery or opening hours"       |

Summary: kind right for 6 / 8; for the other 2 no kind was recorded at all. 1 irrelevant question
out of 34; every stop word worked (8 / 8). The 17 Oct 98% result does **not** fully hold on current
main:

- **Two Hindi conversations ended after the coach's first reply** (tea, chai-recharge, under 4 s,
  no question counted). The likely cause is a change since 17 Oct, such as #200/#201 (finishing by
  intent). This needs a look before the demo; it was not investigated further here.
- **"Delivery" slipped into an hours question** for a tiffin service. The eval forbids the word
  in onboarding. For a tiffin service, "delivery hours" is reasonable, so the question is whether
  the rule or the coach should change.
- One Vertex `429 RESOURCE_EXHAUSTED` during the run (helmet); the coach's retry absorbed it.

## 3. Earlier live evaluations (for the scorecard)

| Evaluation                                     | Result                                                                         | Source                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Semantic search, 25 labelled queries, 20 shops | Precision@5 0.728 → **0.902** (live `gemini-embedding-2`); empty answers 2 → 0 | [search-eval.md](search-eval.md)                                     |
| Close the day reader, 6 documents, 26 lines    | App pipeline 26 / 26 lines, 15 / 15 amounts, 6 / 6 dates                       | [document-ai.md](document-ai.md)                                     |
| Coach scenarios on Gemini 3.5 Flash            | 25 / 27                                                                        | [coach-eval-gemini-3.5-flash.json](coach-eval-gemini-3.5-flash.json) |
| Coach latency, recorded Gemini turns           | complete reply p50 4.7 s / p95 9.3 s (26 turns)                                | [measurements.md](measurements.md)                                   |
