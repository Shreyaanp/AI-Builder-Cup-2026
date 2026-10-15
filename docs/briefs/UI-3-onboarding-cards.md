# UI-3 — Onboarding that builds the cards (Phase 3; full stack)

Same rules as UI-1/UI-2 (branch `ui/coach-screen`, no main/push/release, no AI co-author,
report in `docs/briefs/UI-3-REPORT.md`, shots in `docs/briefs/ui-3-shots/`). UI-1 and UI-2 are
merged into main; your branch is up to date with main (78fe3b9).

This task touches the backend too. Follow `docs/codex/CONVENTIONS.md` for backend rules:
repository methods in BOTH `MerchantStore` (SQLite) and `FirestoreMerchantStore`, owner-scoped
routes, regenerate the API contract after API changes, AI only proposes and the owner confirms.

## 0. Answers to your UI-2 questions (do these first, small)

- **QR code: yes.** Add a QR code for the customer page link in the Customer page tile's sheet
  (with "Download / Share" — share the PNG via the Web Share API where available; the artifact
  "download" restriction does not apply here, this is the real app). Use one small, well-known
  dependency pinned to an exact version (e.g. `qrcode`), lazy-loaded so it doesn't grow the main
  bundle. Print-friendly: large, high-contrast, shop name under it ("Scan for today's menu").
- **Desktop side pane: bring it back** at ≥1200px (the coach stays one-card on phone). Use the new
  tiles in the pane rather than the old `ShopSummary`.
- **"Change a price" chip:** keep it as a chat starter (fine as is).

## 1. Shop facts customers ask about (AI + sealed proposals)

Add optional shop facts to `BusinessFields` (backend/app/merchant.py): `halal` (yes / no /
muslim-owned / not-stated), `vegetarian_options` (bool|None), `delivery` (none / own / grab /
foodpanda / other + free text ≤80), `preorders` (bool|None + lead time text ≤80),
`payment_methods` (list from: cash, paynow, card, grabpay, nets, other), `busy_hours` (text ≤80).
Keep them optional so existing shops validate. Include them in `public_projection` (customer page
and customer Q&A grounding read from it), the review sheet, the shop details tile/sheet, and the
customer page (small chips: "Halal", "PayNow", "Delivery via Grab"…).

Coach (`backend/app/agent.py` INSTRUCTION + `coordinator.propose_business`): after the shop name
and basics are saved, the coach asks these **one at a time, briefly**, in the owner's language,
and records answers with `propose_business` (owner confirms each, as today). The owner can skip
("later"). Update `backend/scripts/coach_eval.py` with 2 scenarios (do not run live; the lead runs
it). Offline coach fixture: handle at least "halal yes" so the browser test can cover it.

## 2. Cards after registration (rules only, no AI)

On the coach screen (below the single shop card, max ONE extra card at a time, dismissible) and in
My shop tiles, show the most important pending item, in this order:
1. Unanswered customer messages ("2 customers are waiting").
2. Sold-out sweep (see 3).
3. Missing customer facts ("Customers ask: halal? payment?") → opens the coach with that question.

## 3. Sold-out sweep card

During the shop's busy hours (from `busy_hours` if parseable, else 11:00–14:00 and 17:00–20:00
local time) show "Still have kaya toast?" for the top available item(s), with **Yes** / **Sold
out** buttons. "Sold out" uses the existing availability switch call
(`useWorkspace().setAvailability`). "Yes" hides that item until the next sweep window. Max one
sweep card; remember dismissals in localStorage per shop and day.

## Motion & UI

Reuse UI-1 `Sheet` and motion tokens; cards enter with `enterRise`. All new strings in
`strings.ts` + real translations in all 9 locales. Customer-page chips also in `PublicShop.tsx`
translations (and `customerLocales.ts` if they live there).

## Checks (targeted)

Backend: `uv run ruff check . && uv run ruff format --check . && uv run mypy app &&
uv run pytest -q tests/test_merchant_store.py tests/test_coach_tools.py tests/test_merchant_routes.py`
(store tests need the Firestore emulator: Java is at
`C:\Users\pshre\AppData\Local\AIBuilderCupTools\java21\jdk-21.0.12.1+1-jre\bin`, run
`gcloud emulators firestore start --host-port=127.0.0.1:8085` and set
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`; if you can't, say so in the report).
Contract: from backend `uv run python -m scripts.export_contract`, then
`npx openapi-typescript docs/openapi.json -o src/api/generated.d.ts`.
Frontend: tsc, eslint, prettier, `CI=1 npx playwright test tests/v1.spec.ts tests/phone-regressions.spec.ts tests/customer.spec.ts --project=phone`
**and** `--project=desktop` for the same specs (desktop was skipped last time).
