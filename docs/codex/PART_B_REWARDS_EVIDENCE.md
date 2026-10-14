# Part B — Customer rewards and stock reminders

Local verification on 14 October 2026. No commits, publication or cloud mutations.

## Implemented acceptance cases

- **B1: stamp card and reward.** `src/features/rewards/storage.ts` persists separate
  per-shop cards; only `source=qr` earns a stamp, once per calendar day in the shop's
  timezone. The generated owner QR includes that query parameter. Cards show ten
  stamp slots, a count, the owner-confirmed reward, and “Show this to the shop”.
  Five and ten stamps receive a one-shot celebration and permanent milestone badges.
  `reward_text` is optional, trimmed, limited to 80 characters, and saved or cleared
  through the existing sealed owner proposal/approval flow. An empty reward remains
  omitted from serialization so existing proposal digests retain their shape.
- **B2: on-device badges.** Three consecutive calendar visit days, five distinct
  shop pages, and an early visit (before 09:00 in the shop timezone) earn badges.
  They appear in the shop footer and discovery's “Your usuals”. The copy describes
  visits and local browser storage; it makes no purchase or anti-fraud claim.
  Motion uses transform/opacity and is disabled with reduced motion.
- **B3: seven-day reminders.** Sold-out rows offer a bell button. The reminder is
  saved locally first, then registered anonymously on the backend with a random
  browser identifier and the shop/item identity. Local menu comparison announces
  an item on a later visit or refresh when it is available, including when server
  registration is unavailable. Both SQLite and Firestore validate public shops and
  sold-out items, deduplicate subscriptions, bound capacity, enforce expiry, and
  delete subscriptions with the shop. The owner's direct availability switch marks
  matching live subscriptions ready inside the same transaction. Public registration
  and lookup routes use the existing rate limiter. Firestore also serializes local
  subscription transactions and updates shared subscription metadata to protect
  capacity across processes.
- **B4: localization and checks.** English source copy plus complete translations
  for zh-Hans, ms, ta, ja, ko, id, th, vi and fil. The browser suite checks these
  nine translated cards on phone and desktop, alongside owner approval, daily
  stamps, independent cards, milestone/streak badges, reduced motion, reminder
  persistence/expiry, unavailable registration, blocked storage, overflow and axe.

## Verification evidence

- Backend `ruff check .`, `ruff format --check .`, and `mypy app`: passed.
- Targeted pytest: **117 passed, 1 skipped**. Files: `test_stock_alerts.py`,
  `test_merchant_store.py`, `test_sharing_routes.py`, `test_limits.py` and
  `test_limit_routes.py`. Both repository adapters ran; Firestore used only the
  local emulator at `127.0.0.1:8085` with anonymous credentials and a demo project.
- Offline contract export and `openapi-typescript`: regenerated `docs/openapi.json`
  and `src/api/generated.d.ts`.
- `tsc -b`, ESLint with zero warnings, Prettier on `src tests docs`, and
  `git diff --check`: passed. `graphify update .` ran using AST extraction only.
- Final targeted Playwright: **90 passed**, no retries, across phone and desktop.
  Files: `rewards.spec.ts`, `customer.spec.ts`, `discover.spec.ts`,
  `frontdoors.spec.ts`, `identity.spec.ts` and `v1.spec.ts`. The local-only browser
  configuration blocked external DNS. Temporary configuration and outputs are
  under the ignored `artifacts/part-b/` directory.
- `npm run check`: lint, production build and hook checks passed; its unmodified
  full browser run reported **197 passed, 15 skipped, 2 failed**. The failures were
  the phone hosted-sign-in and busy-hours sold-out scenarios. Both subsequently
  passed in the final targeted local-only run. This is not a green full-suite claim.
- Extra customer bundle check: **fails** its 150 KiB gzip budget. A separate
  frontend build of tracked `HEAD` measured **241.7 KiB**; this change measured
  **249.0 KiB**, a **7.3 KiB** increase. No performance-budget claim is made.

Installed tooling was reused locally; dotenv loading was disabled in the Python
verification launchers. No dependency or lockfile changes were needed.

## Files changed

- `src/features/rewards/Rewards.tsx`, `storage.ts`, `strings.ts` (new).
- `src/features/public/PublicShop.tsx`.
- `src/features/frontdoors/CustomerApp.tsx`.
- `src/features/discover/Discover.tsx`.
- `src/features/v1/EditDialogs.tsx`, `ReviewDialog.tsx`, `ShopQr.tsx`,
  `ShopTiles.tsx`, `api.ts`.
- `backend/app/stock_alerts.py` (new), `merchant.py`, `merchant_firestore.py`,
  `merchant_routes.py`, `limits.py`.
- `backend/tests/test_stock_alerts.py` and `tests/rewards.spec.ts` (new).
- `docs/openapi.json` and `src/api/generated.d.ts` (regenerated).
- This evidence record (new). The ignored AST graph was refreshed; test-generated
  tracked screenshots were restored.

## Limitations and open risks

- Delivery is explicitly **in-page**, not Web Push. There is no VAPID/push transport
  in this implementation and no service-worker notification delivery. A future
  configured transport needs separate implementation and provider/browser validation.
- Seven-day expiry is enforced on use; expired server rows are removed on
  subscription, lookup or availability activity. No scheduled cloud TTL was configured.
- Local cards/reminders reset when browser data is cleared. They are neither
  authenticated purchases nor fraud-resistant redemption records. The shop decides
  whether to honour the card. Badges and clocks are on-device.
- The full-suite failures and the existing bundle-budget breach remain separate
  review concerns. Phone emulation does not establish physical-device or real push
  permission/delivery behaviour. Translation rendering passed; native-speaker review
  remains unvalidated.
