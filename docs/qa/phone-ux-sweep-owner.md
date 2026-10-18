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

- The focused Playwright spec uses `WEB_PORT=4891`, `API_PORT=4991`, and one worker. English/light
  and Hindi/light passed at 360 px after the final text-size changes. English/dark passed at 360 px
  before those text-size changes.
- The full matrix run passed English/light and English/dark at 360 px, then the offline app failed
  to load the Hindi screen and its API port became unavailable. Later attempts also hit an
  intermittent Vite `V1App.tsx` dynamic-import failure. The final English/dark rerun did not reach
  the screen, and 390/412 px plus Hindi/dark remain unvalidated.
- `npm run rules`, scoped ESLint, Prettier check, and `npm run build` passed. Build retains its
  existing large-chunk advisory.
- No physical-device, human language review, or full accessibility audit was performed.
