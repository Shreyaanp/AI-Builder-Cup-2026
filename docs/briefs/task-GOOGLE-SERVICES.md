# More Google services, used properly (Codex)

Branch `feat/google-services` from origin/main; commit small (no AI trailers), push, `gh pr create`.
Each item behind a feature switch, with an honest fallback, tests, and a line in docs/architecture.md.
GCP credit is limited: batch and cache. Ports WEB_PORT=3737 API_PORT=3837.

1. **Document AI** (Invoice Parser / Expense/Receipt parser, processor in a supported region): use it for
   till receipts in Close the day and supplier invoices in the supply chain (feat/supply-chain may merge
   first; integrate with its document model if present), with Gemini vision as fallback; compare both on
   the fixture images and record accuracy in docs/impact/document-ai.md. Create the processor via
   gcloud/REST (owner approved new Google services; small usage).
2. (Dropped: Vertex AI Agent Engine. The in-process ADK agent stays; owner OK.)
3. **Analytics on BigQuery**: export owner insights + impact metrics (sales, questions, stamps, page views,
   forecast vs actual, latency) to a BigQuery dataset (scheduled, aggregated, no personal data). In the
   app, owner analytics come from these tables as our own chart cards (Today pulse, "how was this week").
   For judges: a Looker Studio impact dashboard template on the same dataset + exact setup steps for the
   owner (Looker Studio is configured in the browser; embed/link it from docs).
   Run backend tests and `npm run check`; handoff docs/handoff/google-services.md.
