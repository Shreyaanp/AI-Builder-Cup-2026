# Supply chain: business rules, forecast-drafted POs and the AI document translator

Track O (account 2, session 2). Branch `feat/supply-chain`. Brief: `docs/briefs/task-SUPPLY-CHAIN.md`.

## What the owner gets

A shop (buyer) and its suppliers trade through Chalkboard even when each side runs a different
system. On the phone:

1. **Rules per supplier** (My shop → Purchase orders → a supplier → Rules, or by voice/text in the
   coach): MOQ, pack size and lead time per item, price tiers by quantity, allowed substitutes,
   payment terms (cash / 7 / 30 days) with a credit limit, an approval limit, opt-in auto-send
   (only under the limit, only to a supplier already used), partial deliveries and back-orders,
   and the supplier's system (SAP IDoc, CSV, chat text, JSON). A rule change made in the coach
   comes back as a card the owner confirms with one tap.
2. **The forecast drafts the PO.** TimesFM (or the weekday average) + stock + rules pick the best
   supplier (arrives before the run-out date, credit left, best tier price), round up to MOQ and
   whole packs, and explain why in one line. Broken rules (below MOQ, over the credit limit, lead
   time misses the need date, new supplier, over the approval limit) show on the card with
   one-tap fixes.
3. **Documents:** PO (ORDERS) → confirmation (ORDRSP, partials, back-orders, substitutions) →
   dispatch (DESADV) → invoice (INVOIC, matched three ways). Each step is a state on the order
   and a row on the PO card's timeline.
4. **Translator:** every document goes out in the supplier's format and comes back translated
   into the canonical model. Gemini (structured output) when live, deterministic parsers offline
   or when the model fails or takes over 40s. Uncertain fields (unknown unit codes, day/month
   dates such as 05/11, item codes, totals that do not add up) become flags the owner settles with
   a tap. "View as SAP IDoc / JSON" shows both sides plus the field mapping, hidden by default.
5. **Simulation, labelled.** Demo suppliers answer through a simulator that writes realistic
   documents in their format (real IDoc segments: ORDERS05, ORDRSP, DELVRY07, INVOIC02). No live
   SAP or EDI connection, and no money moves.

## Code

| Area                                                                                                                 | Files                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Canonical model, IDoc/CSV/text/JSON writers and parsers, review and flags, Gemini reader                             | `backend/app/supply_docs.py`, samples in `backend/app/supply_samples/`                                         |
| Rules: tiers, MOQ/pack rounding, checks with fixes, credit fit, rule changes                                         | `backend/app/supply_rules.py`                                                                                  |
| The loop: drafting, state machine, simulator, inbound docs, three-way match, store (SQLite + Firestore)              | `backend/app/supply_chain.py`                                                                                  |
| Routes (`/businesses/{id}/supply/...`)                                                                               | `backend/app/supply_routes.py`                                                                                 |
| Coach tools (`get_supplier_rules`, `set_supplier_rules`, `draft_reorder`, `get_purchase_orders`) and offline replies | `backend/app/supply_tools.py`, `backend/app/supply_offline.py`                                                 |
| Frontend: tile, sheet, rules screen, PO card with timeline and translation view, rule-change card, 15-locale copy    | `src/features/supply/`                                                                                         |
| Coach wiring (`purchase_order`, `supply_rules` stream events)                                                        | `src/features/v1/screens/CoachScreen.tsx`                                                                      |
| Tests                                                                                                                | `backend/tests/test_supply_chain.py` (SQLite and Firestore emulator), `tests/stories/s11-supply-chain.spec.ts` |
| Screenshots                                                                                                          | `docs/stories/supply-*.png` (phone and desktop, light and dark)                                                |

## Checks (16 Oct)

- Backend: 678 passed, 166 skipped (SQLite). `test_supply_chain.py` 36/36 with the Firestore
  emulator (`FIRESTORE_EMULATOR_HOST=127.0.0.1:8577`). ruff, ruff format, mypy clean.
- Story S11 (forecast → PO → ORDRSP partial → ASN → invoice, IDoc ↔ JSON, axe): passes on phone
  and desktop.
- `npm run check`: lint, build and hooks are clean. CI on PR #19 is fully green (backend, frontend,
  six browser shards, container). Locally, the full suite ran while about six other sessions
  were running Playwright, so page loads timed out. One real regression from this branch was
  fixed: the tile text contained "coach" and clashed with the Coach nav button.
- `npm run test:qa` (fresh `.cache/qa`): 162 passed on the first run. The 14 failures (cold page
  loads under load) all passed on rerun, so 176/176.
- **Live Gemini** (Vertex, `ichiropractic`, `gemini-3.5-flash`): all 8 sample documents read by the
  model (8/8), most in 2–3s. The model correctly reads the partial (15 kg now, 5 kg back-ordered) and
  flags `BAG`, the ambiguous `05/11` and unknown item codes. Three bugs found and fixed here:
  - Unbounded thinking used ~3,600 of the 4,000 output tokens and cut the JSON short.
    Now `thinking_level=LOW` and 6,000 tokens.
  - At temperature 0 the model sometimes printed a price as `62.0000000000000140…` until it ran
    out of tokens. The prompt now limits numbers to four decimals.
  - Some calls hung for minutes, so the read is now capped at 40s with parser fallback.
  - The model's flags on standard codes (KGM, NT07) are dropped because the tables read those
    with certainty.

## Not done / next

- No live SAP, EDI or AS2. Inbound documents come from the simulator or are pasted in. A real
  connector would post to `/supply/orders/{id}/inbound`.
- Hosted Firestore needs two new composite indexes, `supply_po` and `supply_rules` (`scope` ASC,
  `created` DESC). They are in `firestore.indexes.json` but not yet created in the cloud project,
  for example:
  `gcloud firestore indexes composite create --project=ichiropractic --collection-group=supply_po --query-scope=COLLECTION --field-config=field-path=scope,order=ascending --field-config=field-path=created,order=descending`
  (repeat for `supply_rules`).
