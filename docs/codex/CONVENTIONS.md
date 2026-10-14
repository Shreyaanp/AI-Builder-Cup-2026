# Conventions for delegated feature work (read before any task in docs/codex/)

This repo is oGoogle AI: a React + MUI (Material 3) PWA in `src/` and a Python FastAPI + Google ADK
backend in `backend/`. Product rules (also in AGENTS.md, rules in ../rules.md if present):

- The AI and the app only **prepare** changes; the owner saves by confirming an exact sealed proposal
  (see `backend/app/merchant.py` propose/commit with digest + revision). Never add a path that
  writes owner data without that confirmation, except explicit owner switches that already exist
  (sold-out switch, share switch).
- Every external/Google integration that is not really connected must be **visibly labelled** as
  simulated/not connected on every consequential screen. Never claim Google publication,
  verification, ownership or live Maps presence.
- Market: **Asia Pacific & Japan, demo in Singapore — not India.** Use Singapore/APAC examples
  (kopi, kaya toast, hawker stalls, SGD), never Indian ones. All user-facing copy goes in an
  English source dictionary plus a `Partial<Record<Locale, …>>` translations registry, read via
  `useLocale()` from `src/state/hooks.ts` (locales in `src/i18n/locales.ts`: en, zh-Hans, ms, ta,
  ja, ko, id, th, vi, fil). Missing keys fall back to English. No Hindi strings. Prices via
  `formatPrice`/`currencySymbol` in `src/features/v1/format.ts` (no hard-coded currency).
- Material 3: use theme roles (`useTheme().material.*`), M3 type variants (`titleLarge`,
  `bodyMedium`, `labelMedium` …), shape scale from `src/design/theme.ts`, 48dp targets, visible
  focus, no colour-only state, reduced motion respected. Phone-first; check 412px width.
- Also follow `.agents/skills/web-interface-guidelines/SKILL.md` for every UI change (forms, focus,
  loading/empty/error states, motion on transform/opacity only, safe areas, `…` and tabular
  numbers), and the vendored performance/best-practices skills when touching loading or security.
- Backend: owner-scoped everything (`consented_owner` for writes, `owner` for reads in
  `merchant_routes.py`). Add methods to the `MerchantRepository` protocol and implement them in
  BOTH `MerchantStore` (SQLite) and `FirestoreMerchantStore`. Validate IDs (see
  `document_id` in merchant_firestore.py). Prices are integer minor units (paise) in storage.
- Prefer NEW files for new features (backend `app/<feature>.py` + router included in `main.py`,
  frontend `src/features/<feature>/…`). Keep edits to shared files (`AppShell.tsx`,
  `ShopScreen.tsx`, `PublicShop.tsx`, `merchant.py`, `main.py`, `strings.ts`) small and clearly
  commented so parallel work merges cleanly.
- Tests are required: backend pytest (store tests must run on both adapters via the `store`
  fixture in `backend/tests/test_merchant_store.py`; route tests with the `join()` consent helper
  from `backend/tests/test_photos.py`), and Playwright specs in `tests/` for the user flow.
- After backend API changes regenerate the contract: from `backend/`:
  `uv run python -m scripts.export_contract`, then from repo root
  `npx openapi-typescript docs/openapi.json -o src/api/generated.d.ts`.
- Checks that must pass before you finish (repo root unless noted):
  backend: `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy app`,
  `uv run pytest -q`; frontend: `npx tsc -b`, `npx eslint . --max-warnings 0 --ignore-pattern
"public/mediapipe/**" --ignore-pattern "public/models/**"`, `npx prettier --check src tests docs`,
  and the relevant Playwright specs with `CI=1 npx playwright test <files>`.
- Do not commit. Do not add AI/Codex co-author trailers. No secrets, no network calls to real
  Google APIs, no paid model calls in tests (the offline coach and fixture moderation exist).
- Final message: files changed, what each acceptance ID maps to, checks run with results, and
  any limitation or open question.
