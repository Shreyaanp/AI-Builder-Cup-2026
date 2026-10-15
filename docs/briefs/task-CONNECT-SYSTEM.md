# Track N: "Connect your system" (Antigravity worker)

Ports WEB_PORT=3557 API_PORT=3657, RECALL_PATH=data/test-vectors. Setup: `npm ci`,
`uv sync --project backend`. Read docs/OWNER-NOTES.md (16 Oct ~02:30) and the existing import code
(backend/app/imports.py, ingestion.py, sales.py; src/features/v1/ImportMenu.tsx, useImport.ts).
Do not touch: onboarding (NewShopFlow, VoiceStage, useVoice), customer UI, supply chain, trust/face.

## Owner's words
"Shops that already use software (POS/billing/ERP: Petpooja, Tally, Zoho, Square, Shopify, SAP…)
should plug it in instead of re-entering data. We offer a product that integrates your system
into our smart system." UI/UX impeccably simple, phone first, owner app calm.

## Build
1. A "Connect your system" journey (from My shop and the coach): pick your system (logos/names as
   text, no trademark art), then either upload an export (CSV/XLSX/JSON/XML) or paste a sample.
2. **AI mapping**: Gemini (structured output via backend/app/gemini_schema.py helpers) maps the
   source columns/fields to our schema (menu items, prices, units, stock, daily sales), shows the
   mapping as plain-language rows with confidence, and lets the owner fix any row with one tap.
   The owner confirms once; the mapping is saved per shop + source.
3. **Sync**: later uploads from the same source reuse the saved mapping automatically and go through
   the existing review-before-save import (never silent writes). Show "last synced" and a diff.
4. Fixtures for 4 realistic exports (a POS menu CSV, a Tally-style sales XML, a Shopify-style
   products CSV, a Petpooja-style JSON) with tests. Offline fixture mode must work without Gemini.
## Done
Backend tests (mapping, reuse, validation, both stores), frontend journey, 15 locales, phone +
desktop, light + dark, axe clean, a story test tests/stories/s14-connect.spec.ts, screenshots
docs/stories/connect-*.png, `npm run check`. Write docs/handoff/connect-system.md.
