# Owner shop creation and measured location — local evidence

Implemented in this worktree on 15 October 2026. Uncommitted; no push, release, cloud mutation,
billing change, paid inference or external-service validation.

## Implemented behavior

- First-shop onboarding and every Add shop entry open the same coach in a distinct New shop
  mode. A step banner and cancel action identify the separate draft. The small form alternative
  remains available. Cancelling preserves the current shop and its unsent daily-coach note.
- Camera and voice are prominent starting actions. Photos feed the existing extraction pipeline,
  then the coach asks the next missing question. A menu without a readable shop name retains
  its priced items while the coach prepares a suggested name, description and category.
- Text and voice carry explicit new-shop context. New-shop sessions cannot resume as another
  shop or an ordinary coach session. Tools accumulate details, menu items and customer facts
  into a draft without creating a business. One sealed review ends the journey. Approval switches
  the workspace and shows a ready moment with a sharing action. Gallery reuse stays opt-in.
- Use my current location explains the reason before requesting a fresh high-accuracy browser
  measurement. It is available during creation, in both Shop details sheets, and in review.
  Permission denial and unavailable/timeout outcomes retain address and photo-GPS alternatives.
- The backend validates owner-supplied coordinates and reported accuracy before sealing. Reverse
  lookup supplies an address when available; it never replaces the measured coordinates with a
  geocoded point. Offline/unavailable lookup keeps coordinates. Review shows Your location and
  rounded-up reported accuracy. No location is silently saved. Ownership and revision checks
  happen before preparation; the existing exact-digest approval remains the only write boundary.
- All new UI copy is supplied in the 15 owner locales. Existing Chalkboard semantic roles,
  readable labels, touch targets, safe areas and reduced motion are retained. Reply scrolling
  responds to keyboard/viewport resizing. The composer appears only once shop loading settles.

## Verification evidence

- Backend: 618 passed, 164 skipped. Includes new-shop text/voice ownership, accumulating tools,
  no writes before approval, device validation, measured-point preservation, mock reverse lookup,
  and existing streaming/disconnect/session tests. Ruff and mypy pass; Ruff format check passes.
- Targeted browser regression run: 24 passed. Includes S1, both photo-reuse paths, no-name menu,
  cancelled second-shop drafts, location approval/denial, voice/composer stability and keyboard
  resizing. New flow passes axe in light and dark.
- `npm run check` passed: lint, TypeScript/build, hook enforcement and all browser tests.
  Phone: 205 passed, 6 skipped. Desktop: 135 passed, 76 skipped. Story walkthroughs are included.
- `npm run test:qa` passed: 122 expected outcomes, zero unexpected failures or flaky cases.
  This includes the two pre-existing expected failures for the Tamil offline-coach case (Q1),
  retained as required by PLAN-V2. Server/offline retry checks now assert the guided question.
- The focused backend voice/stream/disconnect run passed all 26 cases; its voice test requires
  an actual sealed proposal from the offline socket text control. This is transport/tool evidence,
  not microphone ASR evidence. Final screenshot capture passed its phone scenario at 390×844.
- Final log review found malformed coordinate-free synthetic touches in the existing mic
  long-press fixture. The fixture now supplies touch coordinates and asserts no page errors;
  its focused phone run passed. Application gesture handling was unchanged.
- Tests use local-only browser networking, offline backend modes and fresh SQLite databases on
  WEB_PORT=3437 / API_PORT=3537. The live-owner probe is excluded from the default suite because it
  requires private scratch photos and calls a provider. Runtime caches are excluded from lint,
  formatting and Vite watching.

Phone screenshots: [light](stories/new-shop-light.png), [dark](stories/new-shop-dark.png),
[light review](stories/new-shop-review-light.png), [dark review](stories/new-shop-review-dark.png),
[ready](stories/new-shop-ready.png).

## Unvalidated behavior

Browser emulation is not a physical-phone test. Actual camera capture, GPS quality/permission UX,
microphone ASR and live Gemini coaching quality remain unvalidated. Reverse-geocoding success
and failure are tested with mocked transport; no real Maps key or external service was used.
The skipped backend cases remain skipped in this offline environment. Translation completeness
is enforced by TypeScript; this does not establish native-speaker review of every translation.

## Files changed

```text
.prettierignore
PROJECT_MEMORY.md
STORIES.md
backend/app/agent.py
backend/app/contracts.py
backend/app/coordinator.py
backend/app/discover.py
backend/app/main.py
backend/app/merchant.py
backend/app/streaming.py
backend/tests/test_new_shop.py
docs/OWNER-NEW-SHOP.md
docs/PLAN-V2.md
docs/openapi.json
docs/qa/results.json
docs/stories/RESULTS.json
docs/stories/S1-1-voice.png
docs/stories/S1-1.png
docs/stories/S1-2.png
docs/stories/S1-3.png
docs/stories/S1-4.png
docs/stories/S1-5.png
docs/stories/S1-6-facts.png
docs/stories/S1-6-photo-pin.png
docs/stories/S1-6.png
docs/stories/S1-7-customer.png
docs/stories/S1-7.png
docs/stories/S1-A6-offer.png
docs/stories/S1-A6-review.png
docs/stories/S1-A8-existing-offer.png
docs/stories/S1-A8-new-offer.png
docs/stories/new-shop-dark.png
docs/stories/new-shop-light.png
docs/stories/new-shop-ready.png
docs/stories/new-shop-review-dark.png
docs/stories/new-shop-review-light.png
eslint.config.js
playwright.config.ts
src/api/generated.d.ts
src/api/stream.ts
src/features/tour/Tour.tsx
src/features/v1/AppShell.tsx
src/features/v1/CurrentLocation.tsx
src/features/v1/ReviewDialog.tsx
src/features/v1/ShopCard.tsx
src/features/v1/ShopTiles.tsx
src/features/v1/WorkspaceProvider.tsx
src/features/v1/api.ts
src/features/v1/locales/bn.ts
src/features/v1/locales/fil.ts
src/features/v1/locales/hi.ts
src/features/v1/locales/id.ts
src/features/v1/locales/ja.ts
src/features/v1/locales/kn.ts
src/features/v1/locales/ko.ts
src/features/v1/locales/mr.ts
src/features/v1/locales/ms.ts
src/features/v1/locales/ta.ts
src/features/v1/locales/te.ts
src/features/v1/locales/th.ts
src/features/v1/locales/vi.ts
src/features/v1/locales/zh-Hans.ts
src/features/v1/screens/CoachScreen.tsx
src/features/v1/screens/GoogleScreen.tsx
src/features/v1/screens/ShopScreen.tsx
src/features/v1/strings.ts
src/features/v1/useVoice.ts
src/features/v1/workspaceContext.ts
tests/bugs-b37.spec.ts
tests/bugs-b8-b12.spec.ts
tests/close-day.spec.ts
tests/customer.spec.ts
tests/demo-flow.spec.ts
tests/forecast.spec.ts
tests/global-facts.spec.ts
tests/i18n.spec.ts
tests/import.spec.ts
tests/new-shop.spec.ts
tests/phone-regressions.spec.ts
tests/phone-shell.spec.ts
tests/planning.spec.ts
tests/qa/coach.spec.ts
tests/qa/onboarding.spec.ts
tests/qa/shop-details.spec.ts
tests/rewards.spec.ts
tests/sourcing.spec.ts
tests/stories/a8.spec.ts
tests/stories/s1.spec.ts
tests/stories/support.ts
tests/v1-a11y.spec.ts
tests/v1.spec.ts
vite.config.ts
```
