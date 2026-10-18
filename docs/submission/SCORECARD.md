# Chalkboard scorecard (18 October 2026)

Re-scored against the rubric in [HACKATHON-REVIEW.md](../HACKATHON-REVIEW.md): Technical merit
and GenAI 40%, Problem alignment and impact 25%, Innovation 25%, UX 10%. Evidence was checked on
18 Oct against `main` (`e3625576`), production (Cloud Run `ogoogle-ai-00079-pjc`, serving
`36368f0b`, latest release `release-2026-10-18-01`) and fresh measurements. "Live" below means
the switch is on in the running revision, not just present in code.

## Score today: 7.7 / 10 (was 6.5 on 16 Oct)

| Criterion (weight)                 |  16 Oct |   Today | Weighted |
| ---------------------------------- | ------: | ------: | -------: |
| Technical merit and GenAI (40%)    |       7 |     8.0 |     3.20 |
| Problem alignment and impact (25%) |     6.5 |     7.0 |     1.75 |
| Innovation (25%)                   |       7 |     8.0 |     2.00 |
| UX (10%)                           |     5.5 |     7.0 |     0.70 |
| **Total**                          | **6.7** | **7.7** | **7.65** |

## Technical merit and GenAI (40%): 8 / 10

What a judge can verify:

- **Architecture that is shown, not claimed.** One diagram of what runs, in
  [architecture.md](../architecture.md) and in the app at **/architecture**, generated from one
  file ([diagram.ts](../../src/architecture/diagram.ts)) with a test that keeps them equal.
- **Google ADK agent with 34 tools**, the same agent on text and voice:
  `business_coach` in [agent.py](../../backend/app/agent.py); text over SSE
  ([streaming.py](../../backend/app/streaming.py)), voice over Gemini Live
  ([voice.py](../../backend/app/voice.py)). Tools only read and propose; the owner approves.
- **Live Google AI on the running revision** (runtime switches checked 18 Oct): Gemini 3.5 Flash
  (text, structured output, menu and receipt reading), Gemini Live 3.8 (voice), `gemini-embedding-2`
  with Firestore vector search, BigQuery `AI.FORECAST` (TimesFM) for demand
  ([forecast.py](../../backend/app/forecast.py)), Document AI Expense and Invoice parsers
  ([document_ai.py](../../backend/app/document_ai.py)), Gemini grounding with Google Maps
  (`MAPS_GROUNDING=live`), Cloud Vision SafeSearch, Cloud TTS.
- **The AI adapts to any business**: a Gemini profile of the business drives the questions,
  categories and coaching ([business_understanding.py](../../backend/app/business_understanding.py),
  [playbook.py](../../backend/app/playbook.py)); see
  [architecture.md](../architecture.md#how-the-ai-adapts-to-any-business).
- **Scalable by design and measured**: stateless Cloud Run (1 to 10 instances, concurrency 40),
  Firestore state, Cloud Armor at the edge, Secret Manager for keys, keyless (WIF) CI/CD. Load test
  on 18 Oct: **9,428 requests, 0 errors, 155 req/s, p50 154 ms, p95 573 ms, 2 → 4 instances**
  ([scalability.md](../impact/scalability.md)).
- **Evaluation numbers** ([evaluation.md](../impact/evaluation.md)): golden upload dataset
  **41/41** structured and **22/22** contract cases offline; live menu photos **30/30 prices**,
  15/15 item counts, 9/15 fully exact; semantic search **P@5 0.728 → 0.902**; onboarding kind
  **39/40** with 0 irrelevant questions of 215 (17 Oct).

Holding it back: one agent, not a visible multi-agent design; Recommendations AI is off
(`RECS_ENABLED` not set); the nightly BigQuery export is paused; live Document AI alone misses
currency and line items (the app falls back to Gemini); the 18 Oct onboarding re-run found a Hindi
early-end problem; the explore list reads all shops (p50 3.9 s under load).

## Problem alignment and impact (25%): 7 / 10

Against the Retail and Commerce track:

| Track item              | Today                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery               | AI front door and explore list with real shop data plus Google places ([discover_ask.py](../../backend/app/discover_ask.py), [discover.py](../../backend/app/discover.py)); semantic search P@5 0.902             |
| Conversational shopping | Customer ask in the customer's language, answers only from shop records; shop chat with owner replies                                                                                                             |
| Personalization         | Per-shop playbook drives Today, Grow and the coach; customer preferences and follows shape Today's finds ([today.py](../../backend/app/today.py))                                                                 |
| Demand planning         | TimesFM forecasts live (`FORECAST_BACKEND=bigquery`), with 90% intervals and a labelled fallback                                                                                                                  |
| Inventory and supply    | Reorder rules, purchase orders as SAP IDocs, inbound and outbound timeline (#169, #171), POS imports (#155), import from a photo of a screen (#190)                                                               |
| Customer insights       | Today pulse, "Your week" from BigQuery analytics ([analytics.py](../../backend/app/analytics.py)), Looker Studio on the same dataset                                                                              |
| Fraud                   | Listing checks for shared phones, copied photos and menus, impossible prices and brand impersonation, with a Gemini second look ([fraud.py](../../backend/app/fraud.py)); optional owner face check fixed in #184 |

Impact evidence: onboarding to a live shop in about 60 s (#91), voice onboarding with 4 taps
instead of 16 ([measurements.md](../impact/measurements.md)), Close the day reads 26/26 receipt
lines ([document-ai.md](../impact/document-ai.md)). Holding it back: all impact numbers come from
synthetic shops and fixtures, not real owners; the analytics export that feeds insights is paused.

## Innovation (25%): 8 / 10

Voice-first onboarding in the owner's language that understands any business (a helmet station is
never asked "is it halal?"); Close the day from a photo; rescue deals; vendor-to-vendor sourcing;
neighbourhood passport and stamps; AI front door for customers; try the demo shop with no sign-up
(#197); printable QR poster and WhatsApp share (#198). Holding it back: shop-to-shop agent
hand-off (A2A) and the demand-radar-to-supplier loop are planned, not built.

## UX (10%): 7 / 10

Phone-first PWA in 15 languages; flow fixes across owner, customer, POS, Hindi and Singapore
(#181, #189, #193); the three critical flows have acceptance tests (#157); phone load speed (#185);
360 px accessibility (#166); mobile back behaves like an app (#144, #195). Holding it back: voice
stability (#202) and bad-network states (#192) are still open PRs; the two Hindi onboarding
conversations that ended early would hurt a live demo.

## Top 10 gaps, ranked by (weight × points gained) / effort

Points gained are on that criterion's 10-point scale; effort is focused hours. Score =
weight (%) × points ÷ hours.

| #   | Gap                                                                                                                                                                          | Criterion | Points | Hours | Score |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -----: | ----: | ----: |
| 1   | **Merge the golden dataset (#188)** and show its numbers in the deck: 63 cases, 41/41 and 22/22 offline, 30/30 live prices                                                   | Technical |    0.5 |   0.5 |  40.0 |
| 2   | **Resume the nightly analytics export** (`chalkboard-analytics-export` is paused) so BigQuery and Looker Studio show current days. Owner decision: it was paused on purpose? | Impact    |    0.3 |  0.25 |  30.0 |
| 3   | **Close the Cloud Armor bypass**: ingress `all` lets the `run.app` URL skip the 300/min limit. Check what uses that URL first (submission link, CI smoke)                    | Technical |    0.2 |   0.5 |  16.0 |
| 4   | **Fix Hindi onboarding ending after the first reply** (tea, chai-recharge in the 18 Oct re-run), then re-run the 40-business eval                                            | Technical |    0.5 |   1.5 |  13.3 |
| 5   | **Turn on Recommendations AI** once "Similar items" finishes training ([status](../impact/recommendations-ai.md)); embeddings serve until then                               | Technical |    0.3 |   1.0 |  12.0 |
| 6   | **Visible multi-agent ADK**: a coordinator with onboarding, shop, supply and sourcing sub-agents, using the four tool groups that already exist                              | Technical |    1.0 |   4.0 |  10.0 |
| 7   | **Impact from real owners**: time to a live shop and Close-the-day minutes for 3 real shops on production, replacing fixture numbers in the deck                             | Impact    |    0.7 |   2.0 |   8.8 |
| 8   | **Document AI mapping**: set currency from the shop and fix line-item mapping (0/4 live on the golden receipts); the Gemini fallback already covers the app                  | Technical |    0.2 |   1.0 |   8.0 |
| 9   | **Keep menu names in the printed script** (names 18/30 exact live; prices 30/30). Ask the extractor for the original script, keep a translation separately                   | Technical |    0.2 |   1.0 |   8.0 |
| 10  | **Land the open UX PRs** after review: voice stability (#202) and bad-network states (#192)                                                                                  | UX        |    0.7 |   1.0 |   7.0 |

Just below the line: explore list reads every shop (geohash index, 40 × 0.3 ÷ 3 = 4.0); context
caching to cut coach p95 of 9.3 s (40 × 0.3 ÷ 2 = 6.0).

## Evidence index

- Architecture and the AI adapting to any business: [architecture.md](../architecture.md), page `/architecture`
- Scalability: [impact/scalability.md](../impact/scalability.md), raw [run](../impact/scalability-load-run.json) and [edge](../impact/scalability-load-edge.json)
- Evaluation: [impact/evaluation.md](../impact/evaluation.md), raw [golden live](../impact/golden/live-2026-10-18.txt), [golden offline](../impact/golden/offline-2026-10-18.txt), [onboarding re-run](../impact/onboarding-rerun-2026-10-18.json)
- Google AI calls and switches: [google-ai.md](../google-ai.md)
- Earlier measurements: [measurements.md](../impact/measurements.md), [search-eval.md](../impact/search-eval.md), [document-ai.md](../impact/document-ai.md)
