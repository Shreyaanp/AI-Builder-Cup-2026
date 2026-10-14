# B8–B12 local fix report

Implemented in this worktree on 14 October 2026. No commits were created: the task's final
“Do not commit” rule takes precedence over its earlier request for one commit per bug.
`BUGS.md` remains open pending the required fixing commits and user sign-off.

| Bug | Implementation                                                                                                                                                                                                                                                                                                                                 | Commit            | 390×844 proof      | Targeted phone test and axe |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------ | --------------------------- |
| B8  | My shop pending cards use a compact row; freshness actions use less space; complete readiness collapses to a small line. Customer-page copy and link use smaller semantic type. The shared coach card retains its existing default layout.                                                                                                     | None; uncommitted | [B8.png](B8.png)   | Passed; zero axe violations |
| B9  | One simulation notice at “Practice the steps”. Repeated simulator flags removed across locales. Modal titles explicitly say practice; fictional accounts, codes and receipts remain distinct from real Google handoffs.                                                                                                                        | None; uncommitted | [B9.png](B9.png)   | Passed; zero axe violations |
| B10 | AI attribution and offline-template labels are separate chips with spacing.                                                                                                                                                                                                                                                                    | None; uncommitted | [B10.png](B10.png) | Passed; zero axe violations |
| B11 | Validated weekday open/close records and closed-day flags, with free-text fallback. Editor, exact review and public page show them; readiness and shop-local `open_now` use them. Overnight intervals belong to their opening day, including a tail into a closed day. Coach proposals accept typed weekday records. Contract regenerated.     | None; uncommitted | [B11.png](B11.png) | Passed; zero axe violations |
| B12 | Product categories in sealed storage, editor, coach proposals and photo/import drafts. Automatic suggestions are reviewed before saving; imports preserve existing categories when unspecified. Compact category groups appear on My shop and the public page; uncategorised groups and sold-out items sort last. Copy covers all ten locales. | None; uncommitted | [B12.png](B12.png) | Passed; zero axe violations |

Both adapters already persist the complete sealed field dictionaries. The shared validated
models and public projection carry the new fields through SQLite and Firestore without adding
storage columns or repository methods. Adapter tests are parameterised over both implementations.

## Verification evidence

- `npm exec --no -- playwright test tests/bugs-b8-b12.spec.ts tests/google-sim.spec.ts tests/phone-regressions.spec.ts tests/v1.spec.ts --project=phone --retries=0`: **30 passed**. The five bug cases each run axe and save a 390×844 screenshot; B11/B12 also check the public page. Simulator facts/review run additional axe scans.
- B8/B10 regression checks against the original three UI files: **both failed as expected**. Original pending height was 132px against the 80px limit; original recap labels had zero separation. All fixed files were restored, then the final 30-test run passed.
- Backend `python -m pytest -q --basetemp=.cache/pytest-final`: **316 passed, 68 skipped**. Includes owned proposals, disconnect/session cleanup, midnight boundaries, category persistence and offline photo/import paths. One existing ADK experimental-schema warning.
- Targeted backend hours/categories/coach run: **72 passed, 3 skipped**. The three skips are the Firestore variants without an emulator.
- Backend Ruff check, Ruff format check and mypy: **passed**.
- Frontend lint, production build (including TypeScript), hook enforcement and Prettier checks: **passed** on the final source.
- OpenAPI export and TypeScript contract generation: **passed**. `graphify update .` rebuilt the local graph without model calls.
- `npm run check`: lint/build/hooks passed; the full browser suite ended with **206 passed, 21 skipped, 1 failed**. The failure is `tests/identity.spec.ts:36`, classic-app hosted sign-in on the phone project: the Google sign-in button did not become available. It also failed in an isolated phone rerun; the desktop case passed. Sign-in code was left outside this B8–B12 freeze scope.
- Unrelated reference screenshots generated by the full suite were restored. The other worker's Sheet, composer, top bar, CoachScreen and camera files have no changes from this batch.

## Open risks

- `FIRESTORE_EMULATOR_HOST` is unset here. The SQLite cases passed; actual Firestore persistence remains unvalidated in this worktree. The adapter fixture accepts configured loopback emulator hosts and never falls back to production.
- Browser emulation is not a physical-phone test. Live Gemini/photo extraction accuracy is unvalidated; offline fixtures and deterministic category suggestions provide local evidence only.
- The full frontend check remains red on the separate classic hosted-sign-in case above.
- No push, deployment, cloud-resource, billing or IAM changes were made.

## Files changed

- `backend/app/coordinator.py`
- `backend/app/discover.py`
- `backend/app/imports.py`
- `backend/app/ingestion.py`
- `backend/app/merchant.py`
- `backend/app/merchant_routes.py`
- `backend/app/photos.py`
- `backend/app/product_categories.py`
- `backend/tests/test_discover.py`
- `backend/tests/test_imports.py`
- `backend/tests/test_merchant_store.py`
- `backend/tests/test_photos.py`
- `backend/tests/test_product_categories.py`
- `backend/tests/test_sharing_routes.py`
- `backend/tests/test_shop_hours.py`
- `docs/bugs/B10.png`
- `docs/bugs/B11.png`
- `docs/bugs/B12.png`
- `docs/bugs/B8-B12-REPORT.md`
- `docs/bugs/B8.png`
- `docs/bugs/B9.png`
- `docs/openapi.json`
- `src/api/generated.d.ts`
- `src/features/google-sim/GoogleSimulator.tsx`
- `src/features/google-sim/strings.ts`
- `src/features/public/PublicShop.tsx`
- `src/features/sales/ShopInsights.tsx`
- `src/features/shop/CategoryGroups.tsx`
- `src/features/shop/Hours.tsx`
- `src/features/shop/groupProducts.ts`
- `src/features/shop/hoursModel.ts`
- `src/features/shop/strings.ts`
- `src/features/v1/EditDialogs.tsx`
- `src/features/v1/PendingCard.tsx`
- `src/features/v1/ReviewDialog.tsx`
- `src/features/v1/ShopTiles.tsx`
- `src/features/v1/api.ts`
- `src/features/v1/locales/fil.ts`
- `src/features/v1/locales/id.ts`
- `src/features/v1/locales/ja.ts`
- `src/features/v1/locales/ko.ts`
- `src/features/v1/locales/ms.ts`
- `src/features/v1/locales/ta.ts`
- `src/features/v1/locales/th.ts`
- `src/features/v1/locales/vi.ts`
- `src/features/v1/locales/zh-Hans.ts`
- `src/features/v1/screens/GoogleScreen.tsx`
- `src/features/v1/shopProgress.tsx`
- `src/features/v1/strings.ts`
- `tests/bugs-b8-b12.spec.ts`
- `tests/google-sim.spec.ts`
- `tests/phone-regressions.spec.ts`
- `tests/v1.spec.ts`
