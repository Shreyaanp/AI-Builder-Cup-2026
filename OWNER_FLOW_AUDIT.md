# Owner phone flow audit

## Setup and evidence

- Ran the app locally in offline fixture mode on web `4281` and API `4381`; Playwright requests were restricted to localhost.
- Used touch phone emulation at 360 px and 390 px, in light and dark themes. Screenshots for Today, Shop/menu, Grow/rescue, You/privacy, coach/photo, and Close the day are in `output/playwright/owner-flow-audit/`.
- Audited an India fixture. Menu prices displayed as rupees (for example, `₹18.00` and `₹25.00`). The data deletion screen was viewed; deletion was not triggered.
- No horizontal overflow, clipped controls, or browser console errors were recorded after the fix in the four viewport/theme runs. This is browser emulation, not a physical-phone test.

## Fixed

Linked `node_modules` resolves outside the Vite project root. Vite returned 403 for the Google Sans Flex font files, silently falling back to a system font. `vite.config.ts` now allows the real dependency directory while retaining strict file serving and workspace-root detection. `tests/linked-fonts.spec.ts` checks that the font file loads successfully.

## Verified owner paths

- Full visual audit: 4/4 combinations passed (360/390 px × light/dark), zero recorded console errors or font 403s.
- `tests/linked-fonts.spec.ts`: phone and desktop passed during `npm run check`.
- `tests/today.spec.ts`: Today, needs-now list, pulse and close-day entry passed on phone and desktop; language variants passed.
- `tests/owner-tabs.spec.ts`, `tests/rename-shop.spec.ts`, `tests/photo-routing.spec.ts`, `tests/close-day.spec.ts`, `tests/grow-playbook-guard.spec.ts`, `tests/playbook.spec.ts`, and `tests/region.spec.ts`: relevant phone cases passed during `npm run check`.
- `tests/myshop.spec.ts -g 'tap a price|one attach button'`: 2 passed on phone, serial rerun.
- `tests/stories/s9-rescue.spec.ts`: 2 passed on phone, light and dark, serial rerun.
- ₹ currency display and Japanese/India language settings passed in the relevant region and localization cases.

## Remaining failures and exact reproduction

1. **Daily upkeep story gets stuck on the price button.** With the local offline servers active:

   ```powershell
   $env:WEB_PORT='4281'; $env:API_PORT='4381'; $env:PLAYWRIGHT_LOCAL_ONLY='true'; $env:PLAYWRIGHT_WORKERS='1'
   npm run test:ui -- tests/stories/s2.spec.ts --project=phone --workers=1
   ```

   The story reaches step 6, opens Shop → Menu, then times out clicking `Edit price: Kopi, ₹20.00`; Playwright reports the button outside the viewport. The standalone inline price test passes. The failure screenshot is under `test-results/stories-s2-S2-·-daily-upkeep-and-customer-page-connection-phone/`.

2. **Analytics yesterday total disagrees with its expected fixture value.** Run:

   ```powershell
   $env:WEB_PORT='4281'; $env:API_PORT='4381'; $env:PLAYWRIGHT_LOCAL_ONLY='true'; $env:PLAYWRIGHT_WORKERS='1'
   npm run test:ui -- tests/analytics.spec.ts --project=phone --workers=1
   ```

   The “Your week” sheet displays `$75.60`; the test expects `$73.80`. This is outside the requested owner flow and was left unchanged.

3. **Full-suite stability remains open.** `npm run check` completed lint, hooks and production build, then reported 776 passed, 66 failed, 160 skipped, plus 5 errors outside tests. Many failures were timeouts/navigation or heavy axe checks under three workers. Re-run an affected test serially before treating it as a product defect. Relevant owner-flow examples are listed above.

## Verification limits

- Offline fixtures do not validate live Gemini/ASR behavior.
- Touch emulation does not validate a physical handset, OS keyboard or real photo-library handoff.
- Build output retained its existing warning that some chunks exceed 500 kB.
