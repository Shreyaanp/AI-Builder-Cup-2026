# Owner phone UX sweep

Scope: Today, Shop menu and item editing, and Supply orders / purchase order details at 360, 390,
and 412 px in light and dark themes and English and Hindi. The browser fixtures use the local
offline app. This is viewport emulation, not a physical phone test.

## Changes

- Raised the inline menu price Save and Cancel targets from 40 px to 48 px.
- Raised secondary text in menu, business detail, hours, and supply screens from the 14 px body
  role to the 16 px body role.
- Replaced Supply's initial order loading spinner with two content shaped skeleton rows.
- Added `tests/owner-phone-sweep.spec.ts`, which checks horizontal document overflow and visible
  text/control intersections while walking the requested owner screens across the matrix.

## Larger items observed

- The technical SAP/IDoc views use compact 12 px monospace text. They are deliberately dense
  document views and need a separate readability decision before changing their presentation.
- Technical and metadata views can use more than three text roles; the sweep keeps changes limited
  to the concrete target and loading-state violations above.

## Verification record

- `tests/owner-phone-sweep.spec.ts` covers 360, 390 and 412 px in English/Hindi and light/dark.
  Its overlap assertion clips element bounds through scroll containers so content outside the
  visible scrollport is not reported as an overlap.
- The complete offline Playwright matrix passed: **12/12** with `WEB_PORT=4891`, `API_PORT=4991`
  and one worker. A Vite dependency-optimizer `EPERM` and dynamic-import console error appeared
  during startup; all 12 screen journeys still completed successfully.
- Earlier attempts exposed a false overlap on clipped coach controls and stale Vite server
  connections. The assertion was corrected and the final clean-start matrix passed.
- `npm run rules`, ESLint, TypeScript/Vite build, hook checks and Prettier checks passed. The build
  retains its existing large-chunk advisory.
- `npm run check` reached the browser suite (1,372 cases, one worker) after lint/build/hooks passed.
  I stopped it after 449 cases because the long run had unrelated failures in critical-flow startup,
  discovery, landing checks and region onboarding. The owner phone sweep itself passed all 12 cases
  again within this run. No landing source files were changed.
- No physical-device test, human Hindi review, or full accessibility audit was performed.
