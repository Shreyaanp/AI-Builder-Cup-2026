# Device introductions and separate app sessions

Local checkout only, 18 October 2026. No commit, publication, cloud changes, paid models or external-service validation.

## Implementation

- `src/auth/appSide.ts`, `src/auth/IdentityProvider.tsx`, `src/features/customer/account.tsx`: separate named Firebase apps (`ogoogle-owner-…` and `ogoogle-customer-…`). Existing shared Firebase identities are not migrated into either app.
- `src/app/AppProviders.tsx`, `src/app/history.ts`: separate display-preference and history cache keys. Only old nonpersonal language/appearance preferences migrate.
- `src/auth/clearSession.ts`: remove the current side's local/session storage, IndexedDB records, caches and push subscription; unregister its worker before replacing the current URL with its front door. Preserve the other app's known caches and Firebase records when both apps run on localhost. Empty Firebase stores before requesting deletion, including when an SDK connection blocks deletion.
- `src/features/v1/screens/PrivacyScreen.tsx`: successful server erasure uses the same Firebase sign-out and browser cleanup. Failed/partial erasure retains the existing retry flow.
- `src/features/first-run/seen.ts`, `FirstRun.tsx`: check the per-app seen marker before displaying the introduction. Completion and Skip persist in local storage and a host-only, nonpersonal cookie. The cookie survives account-cache cleanup.
- `src/features/customer/Profile.tsx`, `src/features/v1/screens/YouScreen.tsx`: replay lives in Help; the customer profile no longer exposes the business demo loader.

## Tests changed

- `tests/session-boundaries.spec.ts`: 390 px completion/Skip, new-tab recovery after clearing caches, replay, identity isolation in both directions, actual history cache isolation, both sign-outs, successful account erasure, push/worker cleanup and separate Firebase IndexedDB records.
- `tests/first-run.spec.ts`: explicitly reset both device markers only when simulating a fresh device. Existing locale, accessibility, width and replay assertions remain.
- `tests/tour-story.spec.ts`: assert absence of the demo entry, including Hindi/Chinese; seed story fixtures through the local API and open existing disclosures before checking their contents.
- `tests/v1.spec.ts`: after account deletion, choose the language again before verifying renewed consent.
- `tests/voice-language.spec.ts`: verify language persistence in the owner's scoped preference key.
- `tests/customer-pacing.spec.ts`: repair merged Node-project import/type errors; retain every behavioral assertion.

## Verification evidence

- Product rules, lint, production build and hook enforcement passed during the broader check.
- The broader 104-case browser run reported 68 passed, 24 failed and 12 skipped. It collected earlier test versions before the demo-removal and post-deletion test updates. Remaining observed customer-flow issues include eight results versus an expected five, location selection before Ask, and assertions expecting collapsed details to be visible.
- Regression probes: restoring a shared Firebase app name restored cross-app sign-in; removing the cookie marker brought the introduction back after clearing local storage. Both corresponding checks failed for those behaviors. Fixes restored afterwards.
- Final focused `npm run check -- -- --workers=1 tests/session-boundaries.spec.ts tests/first-run.spec.ts tests/voice-language.spec.ts`: lint, build and hook enforcement passed; browser results were 25 passed and one owner first-run loading-splash timeout. All 18 new session-boundary cases passed, including both shared-IndexedDB cases in each project. The unchanged owner first-run assertions passed on explicit rerun in both projects.
- Follow-up checks passed for translated demo-entry absence (four cases), post-deletion language/consent setup (two cases), and the seeded customer story on desktop. The final seeded-story phone run hit the existing load-error boundary before reaching the profile; it remains a recorded failure. No assertions or timeouts were relaxed.
- Final scoped ESLint, product rules and `git diff --check` passed. The broader check is not green; this report does not claim a full-suite pass.

All browser runs use `WEB_PORT=5351`, `API_PORT=5451`, `PLAYWRIGHT_LOCAL_ONLY=true`, offline backend fixtures and `--workers=1`.

## UI review and limits

- `src/features/customer/Profile.tsx:138`: Help has a semantic heading and the replay action; no demo loader. Light/dark screenshots at 390 and 1440 px are under `output/playwright/customer-profile-*.png`. Reviewed the phone screenshots; automated overflow checks passed.
- `src/features/first-run/FirstRun.tsx:11`: completed introductions are gated before render; the existing phone-width, locale and axe checks passed. First-run screenshots are under `output/playwright/first-run-*.png`.
- Reused Material typography/components, existing translated Help text and theme roles. No motion was introduced. This is a focused review, not a complete accessibility or performance audit.
- Firebase SDK/OAuth and push behavior are substituted in end-to-end tests. IndexedDB and Cache Storage use the real browser. Live Google sign-in, real push delivery, physical phones and older browser support remain unvalidated. New Firebase app names require existing users to sign in again.
