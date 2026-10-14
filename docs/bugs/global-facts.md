**B20, B22, B23 and B24 — local implementation and verification, 15 October 2026**

These changes follow the firm global-product rule. Singapore remains a demo/example.
The older Singapore/APAC restriction in `docs/codex/CONVENTIONS.md` does not govern these fixes.

| ID  | Implemented behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Commit      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| B20 | Payment names are free strings, up to eight names of 1–40 characters. Delivery remains one optional free-string name of 1–40 characters, preserving the existing scalar contract. Editor suggestions follow the phone region through the existing timezone/currency resolver. Custom names retain their spelling; legacy keys retain their labels. Coach proposals still require exact owner approval. Customer chips and fixture/live Q&A instructions support the same names. All ten locales have editor guidance. OpenAPI and TypeScript contracts were regenerated offline. | Not created |
| B22 | Ten generic finder/onboarding categories with translated labels, Google Places type mappings and Chalkboard category keyword matching. `kopi`, `hawker`, `cafe`, `café` and `catering` remain accepted aliases. Nearby search uses all mapped types; text search uses the first mapped type, as Google's single `includedType` parameter requires.                                                                                                                                                                                                                               | Not created |
| B23 | Budget thresholds for INR, JPY, USD, EUR, GBP, SGD, MYR, IDR, THB, PHP and VND, converted from stored minor units. Sold-out items do not qualify. Other currencies qualify only through `PRICE_LEVEL_INEXPENSIVE`.                                                                                                                                                                                                                                                                                                                                                               | Not created |
| B24 | Food-category keywords for the ten UI languages and Hindi/Indian terms. Backend coach planning and the frontend missing-fact prompts use matching keyword lists. Non-food control cases still omit food questions.                                                                                                                                                                                                                                                                                                                                                               | Not created |

The request contains both “one commit per ID” and the later “Do not commit” rule.
Clarification was requested; no answer arrived. Changes remain uncommitted under the later rule.
Nothing was pushed or deployed; no external services, paid models, cloud resources, billing or IAM were used.
`BUGS.md` remains open because its closure requirements include fixing commits and user sign-off.

**Verification evidence**

Dependencies came from the local npm cache and an existing local Python environment.
Commands used offline/no-sync execution and workspace-local temporary directories.

- Targeted backend command, from `backend/`:
  `uv run --offline --no-sync python -B -m pytest -q tests/test_merchant_store.py tests/test_merchant_routes.py tests/test_coach_tools.py tests/test_customer.py tests/test_discover.py tests/test_food_categories.py tests/test_streaming.py tests/test_resilience.py -k 'not test_new_shop_opens_in_the_owners_own_timezone' --basetemp=../.cache/pytest-targeted-final`
  — **204 passed, 25 skipped, one deselected**. Covers persistence, legacy keys, name/count limits, sealed coach proposals, offline eval assertions/ADK fixture, public Q&A, categories, multilingual food plans, owned sessions and disconnect cleanup. The deselected test is the independently reproduced baseline timezone failure below.
- `uv run --offline --no-sync python -m ruff check .`, Ruff format check and `mypy app`
  — **passed**; 93 Python files formatted, 43 application files type checked.
- Full backend pytest — **397 passed, 73 skipped, one failed**.
  `test_new_shop_opens_in_the_owners_own_timezone` expects `Asia/Kolkata` but receives `Asia/Singapore`.
  It also fails when all changed backend application files are temporarily restored to `HEAD`.
  The originals were restored only for that verification, then the fixes reinstated.
- Targeted Playwright:
  `npx --offline playwright test tests/global-facts.spec.ts tests/discover.spec.ts tests/frontdoors.spec.ts tests/budget.spec.ts tests/food-categories.spec.ts --project=phone --workers=1 --retries=0`
  — **18 passed**. Includes editor-to-review-to-customer custom-name persistence, validation/focus,
  category aliases/interests, all eleven budget boundaries, sold-out/unknown-currency handling,
  translations and frontend food prompts. Axe checks on the editor, public customer page,
  finder and finder sheet reported **zero violations** for the tested WCAG tags.
- `npm run check` — lint, build and hook enforcement **passed**; full browser suite
  **236 passed, 41 skipped, one failed**. The failing phone test is
  `identity.spec.ts: hosted mode requires Google sign-in before sending a private note`:
  it cannot find the enabled “Sign in with Google” button. It fails in isolation and with
  all changed frontend source files temporarily restored to `HEAD`; the desktop case passes.
  The fixes were reinstated after baseline verification. No sign-in code was changed.
- Fresh ESLint, TypeScript build-mode checking and Prettier checks of `src`, `tests`, `docs`
  — **passed**. Contract generation and `git diff --check` — **passed**.
- Regressions were shown to fail against the old behavior: B20 custom names/count limits;
  B22 generic category mapping; B23 INR budget filtering; B24 multilingual food detection.
- `graphify update .` — **completed**, AST-only. Graph output is ignored by this checkout.
- Finder screenshot: [B22.png](B22.png), **390×844**. The normal horizontal chip row was
  scrolled into view; no screenshot-only styling was applied.

**Files changed**

- B20: `backend/app/{merchant,coordinator,agent,customer}.py`;
  `backend/tests/test_{merchant_store,merchant_routes,coach_tools,customer}.py`;
  `docs/openapi.json`, `src/api/generated.d.ts`;
  `src/features/v1/{api.ts,EditDialogs.tsx,factNames.ts,shopProgress.tsx,strings.ts}`;
  the nine `src/features/v1/locales/*.ts` language dictionaries;
  `src/features/public/PublicShop.tsx`, `tests/global-facts.spec.ts`.
- B22: `backend/app/discover.py`, `backend/tests/test_discover.py`;
  `src/features/discover/{Discover.tsx,categories.ts,strings.ts}`;
  `src/features/frontdoors/CustomerApp.tsx`;
  `tests/{discover,frontdoors}.spec.ts`, `docs/bugs/B22.png`.
- B23: `src/features/discover/{Discover.tsx,budget.ts}`, `tests/budget.spec.ts`.
- B24: `backend/app/business_profile.py`, `backend/tests/test_food_categories.py`;
  `src/features/v1/shopProgress.tsx`, `tests/food-categories.spec.ts`.
- Evidence: this report. Older screenshots regenerated by broader tests were restored to `HEAD`.

**Open risks**

Firestore adapter cases are present in the shared SQLite/Firestore fixture, but
`FIRESTORE_EMULATOR_HOST` is unset and no local emulator JAR was found. Firestore RPC behavior
therefore remains unvalidated here; no cloud database was contacted. The two baseline failures
above remain outside the authorized bug IDs. Keyword classification is heuristic. Phone browser
emulation and axe are not physical-phone, complete accessibility, live Gemini or ASR evidence.
