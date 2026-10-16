# Handoff: more Google services (Document AI, BigQuery analytics, Looker Studio)

Branch `feat/google-services`. Brief: `docs/briefs/task-GOOGLE-SERVICES.md` (item 2, Agent Engine,
dropped by the owner). Every item is behind a switch with a fallback; see
[architecture.md](../architecture.md).

## 1. Document AI for receipts and supplier invoices

- `backend/app/document_ai.py`: REST adapter for `processors:process` (Google default credentials),
  maps entities to lines, joins two-row receipt items, splits "22 x Egg Tart", caches by image hash.
  `ParsedDocument.complete()` is the gate: every line has a quantity (and an amount on a till
  receipt) and no merged rows. Otherwise, or on any provider error, Close the day falls back to
  Gemini vision; stock-count sheets always go to Gemini.
- Close the day `/day/read` now returns `reader: "document_ai" | "gemini" | "fixture"` (the
  existing `fixture` flag is unchanged, so the UI needed no change).
- `supply_reading()` maps a parsed invoice to the supply chain's canonical invoice reading
  (`supply_docs.Reading` fields on `feat/supply-chain`, not merged yet). The supply chain reads
  typed/IDoc/CSV text only today; when it gains photo upload, call
  `DocumentAIReader.read(image, "invoice")` and pass `supply_reading(parsed)` to its `review()`.
- **GCP (done)**: processors in `us` (Expense parser is not offered in asia-south1):
  receipts `c55114827549fb20` (pretrained-expense-v1.4.2), invoices `cb3082fc49117ceb`
  (pretrained-invoice-v2.0). `roles/documentai.apiUser` granted to `ogoogle-runtime`. A test
  processor created in asia-south1 was deleted.
- **Accuracy**: [impact/document-ai.md](../impact/document-ai.md). On 6 fixture photos (26 lines)
  Gemini alone read 26/26, Document AI alone 23/26, the app pipeline 26/26 (Document AI used for
  3/6). Document AI adds invoice number, PO ref and total. Honest caveat: clean rendered photos only.
- Switch: `DOCUMENT_AI_ENABLED`, `DOCUMENT_AI_LOCATION`, `DOCUMENT_AI_RECEIPT_PROCESSOR`,
  `DOCUMENT_AI_INVOICE_PROCESSOR` (set in `deployment/runtime-config.py`).

## 3. Analytics on BigQuery

- `backend/app/analytics.py`:
  - **Export** (`POST /api/v1/internal/analytics/export?days=2`, Google OIDC token from the
    scheduler service account only): one row per shop and day in `chalkboard_analytics.shop_daily`
    (sales, items, customer questions, page views from the request-log sink, stamps/returning from
    the Today page counters when `feat/today-page` lands, forecast-vs-actual backtest). Load jobs
    per day partition with WRITE_TRUNCATE (free, idempotent). Recreates the views `impact_daily`,
    `forecast_accuracy`, `latency_daily` (latency from the existing `chalkboard-requests` log sink,
    without IPs, user agents or query strings).
  - **Owner read** (`GET /api/v1/businesses/{id}/analytics`): last 14 days from `shop_daily`
    (cached 1 hour), days the export has not reached yet filled from the records; falls back to
    the records entirely when BigQuery is off or fails (`source: "live"`, no page views).
  - **Erasure**: new step `analytics` deletes the account's shops' rows (labels in 15 locales).
- New store method `analytics_shops(limit)` on both adapters (export only).
- **App card**: "Your week" tile on My shop (`src/features/analytics/WeekPulse.tsx`, copy in 15
  locales): yesterday's pulse (sales, page visits, questions, stamps: each only if it exists),
  this week vs last week bar chart with a screen-reader table, forecast accuracy, source label.
  Hidden until there is data. Screenshots: `docs/stories/analytics-week-{phone,desktop}.png`.
  The Today page pulse (`feat/today-page`, not merged) can use the same endpoint's `yesterday`.
- **GCP (done)**: `shop_daily` and the three views exist and are **backfilled for 30 days**
  (102 shops, 3,060 rows; run locally against production Firestore, read-only). Service account
  `ogoogle-analytics-scheduler` created. Cloud Scheduler job `chalkboard-analytics-export`
  (asia-south1, 00:30 UTC daily) created **PAUSED**, because the endpoint is not deployed yet.
  The runtime account already had dataset WRITER and `bigquery.jobUser`.
- Switch: `ANALYTICS_BACKEND=bigquery`, `ANALYTICS_EXPORT_CALLER`, `ANALYTICS_EXPORT_AUDIENCE` (set
  in `deployment/runtime-config.py`).

### Looker Studio

[impact/looker-studio.md](../impact/looker-studio.md): a one-click link that creates the report on
`impact_daily`, then exact steps for three pages (Impact, Forecast, Speed) and sharing. Looker Studio
has no API for building reports, so the owner does this in the browser (about 10 minutes).

## Owner to-do after merge

1. Release (the runtime config adds the new switches).
2. Resume the export:
   `gcloud scheduler jobs resume chalkboard-analytics-export --location asia-south1 --project ichiropractic`
   and run it once: `gcloud scheduler jobs run chalkboard-analytics-export --location asia-south1 --project ichiropractic`
   (expect HTTP 200 and `analytics_exported` in the logs).
3. Build the Looker Studio report from [impact/looker-studio.md](../impact/looker-studio.md) and put
   its link in PRODUCT-STATUS and the submission.

## Checks (16 Oct 2026)

- Backend: `ruff check`, `ruff format --check`, `mypy` clean; `pytest` **656 passed, 165 skipped**
  (new: `test_document_ai.py` 6, `test_analytics.py` 7).
- Frontend: `npm run lint`, `npm run build`, `npm run test:hooks`, `npm run format:check` pass.
  UI: only this branch's spec, `tests/analytics.spec.ts`, `--workers=1`: 2 passed (phone, desktop;
  axe WCAG 2 AA clean on the sheet). The full Playwright suite was not run here (headless
  orchestration rule: own specs only), so `npm run check` as a whole is unvalidated.
- Live: Document AI on all 6 fixtures (twice), BigQuery export/backfill, views queried, owner read
  path against the real table, erasure DELETE dry run.
- Not validated: a deployed release (OIDC call from Cloud Scheduler to Cloud Run), real
  phone-camera receipts, the Looker Studio report itself.
