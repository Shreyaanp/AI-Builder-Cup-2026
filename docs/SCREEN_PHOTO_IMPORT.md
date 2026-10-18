# Screen and printout photo import

The connector accepts up to eight camera/gallery photos (20 MB combined), then uses the existing
mapping review and sealed inventory/sales approval flow. Analysis saves neither a mapping nor
inventory. Uncertain rows are excluded, with per-cell flags returned alongside the original
readings. Only repeated header rows are dropped; identical sales are retained because they may
be separate receipts. Owners should avoid overlapping photos of the same sales rows.

Gemini uses the existing column mapper client and `GOOGLE_TEXT_MODEL`, with a strict table/cell
schema, bounded output and timeouts. Each cell includes its value, confidence and unreadable flag.
Confidence below 0.85 or an unreadable cell excludes its entire row. Known currency mismatches or
mixed currencies are rejected; an unknown currency needs owner checking. SKU is retained in the
reading/export; the existing inventory mapping does not save SKU as a product field.

Document AI is attempted when Gemini identifies clean print but finds no usable rows. Its actual
entity confidence and date confidence are retained; missing confidence is zero. This fallback
does not run in offline mode. A provider failure that prevents page classification fails closed.

## Offline evidence

`node scripts/render-screen-photos.mjs` renders four synthetic HTML reports with local Playwright:
Tally, Excel, Petpooja and a printed receipt list. Perspective, moire, glare and blur are CSS effects;
one Excel price is masked. Source HTML, photos and expected readings are under
`backend/tests/fixtures/screen-photos/`. Image hashes select the explicit offline readings in
`backend/app/fixtures/screen_photos.json`; other offline images fail instead of producing sample rows.
These fixtures test the integration, not model accuracy.

Validated locally:

- Ruff check and format; mypy: no issues in 108 source files.
- Targeted pytest: 48 passed, one existing skip; includes currency, repeated headers, multi-photo
  merging, uncertain cells, ownership, no writes before approval, fallback confidence and cancellation.
- Frontend lint, TypeScript/production build and hook enforcement passed during `npm run check`.
- OpenAPI and TypeScript contracts regenerated offline; changed-file formatting and diff checks pass.
- `graphify update .` ran with AST extraction only.
- Phone photo specs: two passed, including review/confirmation, no horizontal overflow and recovery.
  Screenshot: `output/playwright/screen-photos-review.png` (emulated phone, fallback fonts).
- Final scoped `npm run check -- -- tests/screen-photos.spec.ts tests/pos-connect.spec.ts
--project=phone --workers=1 --reporter=line`: lint, build and hooks passed; three browser cases
  passed. The POS-menu case failed before the connector at local-preview entry after Vite reported
  a failed dynamic import of `V1App.tsx`. The POS-sales case and both photo cases passed.
- The POS-menu case passed in an isolated rerun with the same ports and offline settings. All four
  targeted phone cases therefore have passing evidence; the scoped check itself retains its
  startup failure and is not reported as an entirely green run.

`npm run rules` fails its existing layout check: the CI workflow does not contain the expected
explicit phone-project matrix. Other rules passed. The initial browser attempts were blocked by
startup/port collisions; the existing POS spec also needed a specific file-input selector after
camera/gallery inputs were added. The complete unfiltered browser suite has not been validated.

## Review limits

No paid models, external services, cloud changes, deployment or commits were used. Live vision and
Document AI accuracy, real camera permissions, glare recovery and physical phones remain untested.
This checkout's dependency link causes Vite to reject local font paths outside its serving allow
list, so browser rendering uses fallback fonts. No full accessibility or all-locale claim is made.
New controls use the existing sheet/theme, semantic typography, 48 px targets, local component
state, localized copy in all 15 locales and no added animation. Phone/desktop light/dark and Indic/CJK
visual review remain separate evidence requirements before publication.
