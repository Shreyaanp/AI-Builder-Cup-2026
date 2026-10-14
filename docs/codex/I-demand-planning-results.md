# Task I implementation evidence

Implementation: deterministic private product planning with separate demo/owner histories,
sealed review/confirmation, correction audit, and SQLite/Firestore persistence. The Shop
summary includes an English/Hindi Material card. No coach/model tool was added.

| Acceptance ID | Implementation and executable coverage                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1-I01        | `forecast` withholds a baseline below three complete days; card offers labelled demo. `test_i01_i02_i03_i04_i07_baseline` and planning browser spec.                                                                                      |
| V1-I02        | Mean 95, observed range, dates, cutoff, horizon, item/business/unit/source/version metadata. Same unit test, route test, browser demo flow.                                                                                               |
| V1-I03        | Validated distinct closed/missing/complete-zero observations; only complete days train. Baseline unit test and demo history browser review.                                                                                               |
| V1-I04        | Stockout observations excluded and identified as limited sales. Baseline unit test and browser history labels.                                                                                                                            |
| V1-I05        | Same-source/date replacement retains previous value and correction date. Adapter audit test runs on both stores. No receipt/refund importer is introduced.                                                                                |
| V1-I06        | Business/product keys and separate source histories; units belong to each catalog item. Both adapter isolation tests, route metadata checks, browser product switch.                                                                      |
| V1-I07        | No event/weather/promotion input or uplift is supported; extra request fields rejected. Baseline and route tests; card explains the restriction.                                                                                          |
| V1-I08        | Chronological one-day backtest excludes cutoff/future actuals from training. `test_i08_i09_chronological_zero_and_worse`.                                                                                                                 |
| V1-I09        | MAE remains defined for zero actuals; worse mean explicitly prefers last value. Same unit test; route chooses last value and card labels that fallback.                                                                                   |
| V1-I10        | Ceil, ready-stock subtraction, capacity cap and unmet gap. `test_i10_i12_capacity_stale_and_demo`, route fixture and browser 95/20/60/15 checks.                                                                                          |
| V1-I11        | Sealed accept/edit/decline private notes; inventory, business revision and public projection unchanged. Both adapter tests, route decisions, browser edit/decline comparisons.                                                            |
| V1-I12        | Plans older than one day are marked stale on reads, reviews and approvals; insufficient history withholds advice; request errors clear displayed forecast and preserve inputs. Unit/route staleness tests and browser outage/reload test. |

## Verified locally

- Backend: Ruff check and format check, mypy, and `uv run pytest -q`: **114 passed**
  with the explicitly local Firestore emulator at `127.0.0.1:8085`. ADK emits its existing
  experimental-schema warning. Both planning adapter cases ran without skips.
- Contract: `uv run python -m scripts.export_contract` and
  `npx openapi-typescript docs/openapi.json -o src/api/generated.d.ts` succeeded offline.
- Frontend: `npx tsc -b`, required ESLint command and `npx prettier --check src tests docs`
  passed. Production build and hook-enforcement probe passed.
- `npm run check`: **passed**, including all **42 browser cases**, frontend lint,
  production build and the hook-enforcement probe. Browser external hosts were blocked
  with Chromium host-resolver rules; the mobile Firebase fixture otherwise waits for
  `apis.google.com` rather than establishing its mocked signed-out state.
- `CI=1 npx playwright test tests/planning.spec.ts`: **4 passed** across phone and desktop;
  card axe scan found zero violations. Owner-entry regression deliberately changes the
  browser calendar date; entry uses the server-supplied date. The initial-history outage
  regression failed without a reload button and passed after the English/Hindi retry action.

The full check used local ports 3200/3300 and an isolated Vite cache in ignored
`artifacts/`. The first default-config browser attempt timed out during page loading.
The full browser check passed with external hosts blocked and separately started local servers;
the temporary Playwright overrides were restored. A subsequent planning rerun encountered
a consent-setup error when another process took port 3300; final planning verification uses
isolated ports 3212/3311 with an offline test server and fixture storage. uv/npm caches and test temporary files
also use ignored workspace artifacts because the sandbox denies the default user caches.
The stale-plan route regression failed against the earlier implementation, then passed with
staleness applied to every response. `graphify update .` refreshes the graph using AST only.
No network installation or external provider operation was used. Build and test output
includes existing ADK experimental-schema and Node colour-environment warnings.

## Limits

Synthetic arithmetic and backtests are not measured merchant outcomes or a calibrated
prediction interval. No ingredient, customer-count, fulfillment, publishing or live Google
claim is made. Browser phone emulation is not a physical-phone test. Dates use the server's
calendar; merchant-specific time zones are not introduced. Planning storage is bounded at
500 KB per product; reaching the limit rejects the whole change while retaining history.
During the full browser run, the local server logged a SQLite connection-close
`CancelledError` during a streaming stop. Streaming browser tests and backend disconnect
tests passed; planning does not modify that cleanup code and no fix for that log is claimed.
