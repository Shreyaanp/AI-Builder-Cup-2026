# Device introductions and separate app sessions

18 October 2026, branch fix/session-split (#304, #305, #306). No deploy, cloud changes, paid models or external-service validation.

## Implementation

- `src/auth/appSide.ts`, `src/auth/IdentityProvider.tsx`, `src/features/customer/account.tsx`: separate named Firebase apps (`ogoogle-owner-…` and `ogoogle-customer-…`). Existing shared Firebase identities are not migrated into either app.
- `src/app/AppProviders.tsx`, `src/app/history.ts`: separate display-preference and history cache keys. Only old nonpersonal language/appearance preferences migrate.
- `src/auth/clearSession.ts`: remove the current side's local/session storage, IndexedDB records, caches and push subscription; unregister its worker before replacing the current URL with its front door. Preserve the other app's known caches and Firebase records when both apps run on one origin. Empty Firebase stores before requesting deletion, including when an SDK connection blocks deletion.
- `src/auth/Farewell.tsx`, `src/auth/farewellNote.ts`: the front door shows one line after sign-out ("You are signed out.") or deletion ("Account deleted. You are signed out."), in all 15 languages, once. The note is a nonpersonal session flag written after cleanup.
- `src/features/v1/screens/PrivacyScreen.tsx`: successful server erasure uses the same Firebase sign-out and browser cleanup. Failed/partial erasure keeps the existing retry flow.
- `src/features/first-run/seen.ts`, `FirstRun.tsx`: check the per-app seen marker before showing the introduction. Completion and Skip persist in local storage and a host-only, nonpersonal cookie. The cookie survives account-cache cleanup.
- `src/features/customer/Profile.tsx`, `src/features/v1/screens/YouScreen.tsx`: replay lives in Help; the customer profile no longer shows the business demo loader.

## Why the introduction came back

On main the seen marker lived only in local storage, and no code cleared it. A probe on main's code in Chromium (reload, Browse, Saved, a shop link, /discover, ?app=customer, a new tab) never showed it twice. It returns when the browser loses or refuses local storage: private modes where the write throws (the marker was never saved), Safari's script-storage expiry, in-app browsers. The fix also reads a device cookie and keeps it through sign-out and deletion.

## Tests changed

- `tests/session-boundaries.spec.ts`: 390 px completion/Skip, new-tab recovery after clearing caches, replay, identity isolation in both directions, history cache isolation, both sign-outs, account erasure, push/worker cleanup, separate Firebase IndexedDB records, the one-line confirmation and that a reload does not repeat it. The Firebase stubs match Vite's per-port cache folder (`.vite-<port>`), so they apply in every checkout.
- `tests/first-run.spec.ts`: reset both device markers only when simulating a fresh device.
- `tests/tour-story.spec.ts`: assert absence of the demo entry, including Hindi/Chinese; seed story fixtures through the local API. The passport sections are always-open regions; the text and link assertions are unchanged.
- `tests/v1.spec.ts`: after account deletion, choose the language again before verifying renewed consent.
- `tests/voice-language.spec.ts`: language persistence in the owner's scoped preference key.

## Verification

All browser runs: `WEB_PORT=5371`, `API_PORT=5471`, `PLAYWRIGHT_LOCAL_ONLY=true`, `--workers=1`.

- `npm run lint`, `npm run build` (tsc -b and vite), `npm run test:hooks`, `npm run rules`: pass.
- `tests/session-boundaries.spec.ts` and `tests/first-run.spec.ts`: 24 of 24 pass (phone and desktop).
- `tests/tour-story.spec.ts`, `tests/voice-language.spec.ts`, `tests/region.spec.ts`, `tests/v1.spec.ts` (delete data), `tests/tour-narration.spec.ts`: pass, except region "Hindi copy keeps interface terms in Devanagari", which fails the same way on main (static copy check outside this change).
- `tests/customer-last-overlaps.spec.ts` shop-page bar check: flaky on main too (passes the first time, fails on repeats by 2 px).

## UI review and limits

- Help in the customer profile has a heading and the replay action; no demo loader. Overflow checks pass at 390 and 1440 px, light and dark.
- The confirmation uses the app's existing toast placement (above the bottom bar on phones) and theme roles; no new motion.
- Firebase SDK/OAuth and push are substituted in end-to-end tests. IndexedDB and Cache Storage use the real browser. Live Google sign-in, real push delivery, physical phones and Safari storage expiry remain unvalidated. New Firebase app names mean existing users sign in once more.
