# Onboarding flow review

Date: 2026-10-18. Local fixture mode only. The browser blocked all non-local requests.

## Run setup

- Web `http://127.0.0.1:4261`, API `http://127.0.0.1:4361`.
- Backend health reported offline coach, local auth, fixture moderation, and SQLite.
- Phone emulation used touch input and reduced motion.

## Verified

- `tests/onboarding-v2.spec.ts` plus `tests/new-shop.spec.ts`: 18 phone cases passed before the font regression was added. This includes the 390 px typed onboarding journey, `bas` stop/continue, photo skip, review, live creation, and axe checks in light and dark.
- After adding the font regression, all 9 cases in `tests/new-shop.spec.ts` reported `ok`, including light and dark axe checks and the new font check. The Playwright runner was interrupted during shutdown before it printed its final summary.
- `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_onboarding_v2.py -k hindi_onboarding_offline -q`: 1 passed, 9 deselected.
- `npx eslint vite.config.ts tests/new-shop.spec.ts`: passed. `npx prettier --check vite.config.ts tests/new-shop.spec.ts docs/qa/onboarding-flow-review.md`: passed. `git diff --check`: passed.
- The 390 px English run reached the storefront photo step. Captures are under `docs/qa/onboarding-flow/` (hero, follow-up, and photo).
- No prices are shown during shop setup or review, so there was no currency display to misformat. Hindi UI text was visually inspected at 360 px, and the Hindi backend fixture completed onboarding. The temporary browser driver did not complete a Hindi typed journey, so that end-to-end result is not claimed.

## Findings and open risks

1. **Linked font requests initially failed in Vite.** `node_modules` resolves outside the worktree, so Vite's default filesystem allowlist returned 403 for local `@fontsource` files. `vite.config.ts` now allows the real linked dependency path. The focused browser regression passed after Vite's initial dependency optimization completed. A cold start can delay the first page request while that optimization runs.
2. **Voice-to-text transition remains unverified.** `tests/new-shop-voice.spec.ts` timed out after reconnect while waiting for Send; its snapshot still showed �Listening� just talk� and a disabled Send button after choosing �Type instead�. Reproduce with `npx playwright test tests/new-shop-voice.spec.ts --project=phone --grep "every voice-mode" --workers=1`, then reconnect and switch to typing. This transition is separate from typing from the start.
3. **Hindi UI journey was not fully validated end to end.** The Hindi visual capture and backend fixture passed independently, but the temporary browser driver switched into voice/location prompts before completing all typed steps. No Hindi mixed-language defect was confirmed.
4. **360 px overflow was visually inspected, not measured.** The `scrollWidth` assertion in existing onboarding specs is at 390 px; no complete, metric-backed 360 px typed run was retained.
5. **The CI browser job omits the phone project.** `npm run rules` fails the layout rule because `.github/workflows/checks.yml` does not run the phone project. This is outside the onboarding implementation; the local phone project was run manually.

The direct typed-from-start regression suite passed. No onboarding UI change was made because the temporary captures did not confirm a product defect.
