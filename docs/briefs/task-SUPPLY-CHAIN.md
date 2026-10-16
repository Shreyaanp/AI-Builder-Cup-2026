# Track O: supply-chain loop with business rules and AI document translation (account 2, session 2)

Branch `feat/supply-chain` in this worktree (from origin/main). Read first: docs/OWNER-NOTES.md
(16 Oct ~02:30 supply chain), docs/PLAN-V2.md ("Final push plan"), docs/HACKATHON-REVIEW.md,
docs/research/owner-supplier.md, docs/REVIEW.md, AGENTS.md, and the existing sourcing code
(backend/app/sourcing.py, sourcing_routes.py, sourcing_offline.py, src/features/sourcing/).
Setup: `npm ci`, `uv sync --project backend`; node is at
C:\Users\pshre\AppData\Local\AIBuilderCupTools\node-v24.21.0-win-x64 (add to PATH).
Ports WEB_PORT=3507 API_PORT=3607; RECALL_PATH=data/test-vectors.
Others own: owner onboarding (NewShopFlow, useVoice: account 2 session 1), customer UI
(src/features/customer, discover, passport, frontdoors: account 3), coach chart cards (done).
Plan the whole story first (plan mode), then build it end to end.

## The owner (from the supply-chain industry) wants
A small shop (buyer) and its suppliers trade through Chalkboard even when each side runs a
different system. The full loop, linked, on the phone, dead simple:
1. **Business rules per supplier relationship** (all must-haves): MOQ and lead time per item;
   price tiers by quantity; credit terms (cash / 7 / 30 days) with a credit limit; approval
   limits (orders above an amount, or to a new supplier, need the owner's tap); substitutions
   (allowed substitutes), partial deliveries and back-orders. Stored per buyer–supplier pair,
   editable by voice/text through the coach and in a simple screen.
2. **Forecast drafts the PO**: TimesFM forecast (BigQuery, now on) + stock + rules → the coach
   proposes a reorder to the best supplier (price tier, lead time vs need date, MOQ rounding,
   credit headroom), explaining why in one line. Owner approves (or it auto-sends under the
   approval limit, only if the owner enabled that).
3. **Document flow**: PO → order confirmation (ORDRSP, with changes/partials) → dispatch notice
   (ASN/DESADV) → invoice (INVOIC), each a state on the order with a timeline card.
4. **AI document translator**: each party has a "system format" (e.g. buyer: plain chat/JSON;
   supplier: SAP IDoc XML ORDERS05/ORDRSP/DESADV/INVOIC, or CSV, or a WhatsApp-style text).
   Gemini (structured output via backend/app/gemini_schema.py) translates every document into
   the receiver's format, field-mapped, and FLAGS uncertain fields (units, dates, item codes) for
   a human tap. Keep a canonical internal document model; translators in/out per format.
   Ship realistic sample files (real IDoc segment structure) and a supplier "simulator" side so
   the demo runs end to end. Label it honestly as a simulation (no live SAP).
5. **On the phone**: plain-language cards ("PO 4500012345 · 20 kg flour · deliver Fri ·
   ₹1,840 · 7-day credit. Accept?"), a document timeline, and "view as SAP XML / JSON" toggles
   that show the translation side by side (impressive for the demo, hidden by default).
6. Rules are enforced everywhere: the coach and screens warn when an order breaks a rule
   (below MOQ, beyond credit limit, lead time misses the need date) with one-tap fixes.

## Definition of done
Backend models/routes/tests (rules, document state machine, translators both ways with
fixtures for each IDoc type, rule enforcement, both SQLite and Firestore stores), coach tools
for rules and reorder, frontend screens and cards, all 15 locales, phone 390x844 + desktop, light
+ dark, axe clean, motion via src/design/chalkMotion.ts (owner app: calm, cut to the chase).
A story test tests/stories/s11-supply-chain.spec.ts runs forecast → PO → ORDRSP (partial) → ASN →
invoice with format translation; screenshots docs/stories/supply-*.png. Live check against
real Gemini for the translator (GCP token: see docs/PLAN-V2.md workers section). Run backend
tests, `npm run check`, `npm run test:qa` (fresh DBs). Commit small (no AI co-author trailers),
push, `gh pr create` into main, write docs/handoff/supply-chain.md. Summarise.
