# Task I — Demand planning with labelled synthetic history

Read `docs/codex/CONVENTIONS.md` first, then `../V1_FLOW_ACCEPTANCE_TESTS.md` section I (if not
reachable, the essentials are below), `src/features/v1/screens/ShopScreen.tsx`,
`backend/app/merchant.py`, `backend/app/coordinator.py`.

## Goal

"Plan tomorrow" for one product: an honest baseline forecast and a capacity-bounded preparation
suggestion. Numbers come from deterministic code, never from the LLM. Synthetic data is always
labelled "Demo data — not your real sales".

## Data

- Daily observations per product: date, status ∈ {complete, closed, missing, stockout}, sold
  (int, units of that product), optional waste. Separate fields — never conflate closed/missing
  with zero (I03) and flag stockout days as limited sales (I04).
- Owner can (a) load a synthetic demo history for a chosen product (14 days, includes one closed
  day, one missing day and one stockout; seeded/deterministic), labelled demo; or (b) enter
  today's sold count. Store under the business (both adapters; erase_owner removes it).
- Units stay per product (I06). Duplicate entry for the same date replaces it, keeping an
  audit of the previous value (I05).

## Forecast (backend `app/planning.py`, pure functions + tests)

- Baseline = mean of the most recent N (default 4) **complete** same-weekday-agnostic days
  before the forecast date; requires ≥3 complete days, otherwise "not enough history" (I01).
- Report method, window dates, n days used, unit, data source (demo/owner) (I02).
- Fixture: complete days [80,100,90,110] → 95 (I02). Show observed min–max as "range seen",
  never as a prediction interval.
- Preparation: needed = max(0, ceil(baseline) − ready_stock); suggestion = min(needed, capacity);
  gap = needed − suggestion; explain gap (I10): baseline 95, stock 20, capacity 60 → 60, gap 15.
- Backtest helper: chronological, train only before each cutoff (I08); MAE vs naive last-value;
  all-zero actuals keep MAE defined and avoid percentage errors (I09); if worse than naive, say so
  and prefer naive.
- Owner may accept/edit/decline the plan; accepted plan is a private note only — never changes
  stock, prices, public page or Google (I11). Stale (>1 day old) plans show as stale (I12).

## API + UI

- Router `/api/v1/businesses/{id}/planning/...` (consented owner; 404 other owners).
- Frontend: new `src/features/planning/PlanTomorrow.tsx` card, inserted in `ShopSummary` (non
  compact) under products with a one-line edit; M3 card with product select, ready stock and
  capacity inputs, result with plain-language explanation, method details in an expander,
  demo-data label chip. Hindi strings real.
- Optional (only if time): an ADK tool `explain_plan` the coach can call to read (not compute)
  the latest plan; numbers still come from planning.py.

## Tests

- Backend unit tests for every I-ID listed; store tests on both adapters; route tests.
- Playwright `tests/planning.spec.ts`: load demo history, see 95-style explanation with the demo
  label, capacity-bounded suggestion with gap explanation, decline leaves products/public page
  unchanged; axe zero violations on the card.
