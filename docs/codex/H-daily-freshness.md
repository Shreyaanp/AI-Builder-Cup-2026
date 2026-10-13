# Task H — Daily freshness: today-only changes, expiry and "last confirmed"

Read `docs/codex/CONVENTIONS.md` first, then `docs/codex/V1_FLOW_ACCEPTANCE_TESTS.md` sections D05,
D06 and H, `backend/app/merchant.py` + `merchant_firestore.py` (`set_availability`, inventory,
`public_projection`), `backend/app/coordinator.py` (propose_products / ProductInput),
`src/features/v1/screens/ShopScreen.tsx`, `src/features/public/PublicShop.tsx`.

## Goal

Owners update what is true **today** in one tap or one sentence, and customers see what was last
confirmed and when — without stale facts posing as current.

## Model

- Shop timezone: IANA zone on the business (default from the browser at shop creation, e.g.
  `Asia/Kolkata`; editable in Edit details). All "today" logic uses it (H10).
- Product availability gains `sold_out_until` (date in shop timezone, inclusive) in addition to
  `available`. "Sold out today" sets it to today; after that date the item is shown available
  again automatically but labelled "not confirmed today" until the owner touches it (H03 — never
  auto-promise restock). Keep backwards compatibility with existing `available` booleans.
- Hours exceptions: `{date, closed | open, close}` list on the business, e.g. "today closes at
  14:00" (H01). Regular hours unchanged. Overnight intervals allowed (H10).
- Every owner-confirmed change records `confirmed_at` (UTC) per product and for hours (H09).
- Revision checks: stale/older updates are rejected (H04) via the existing revision mechanism.

## Owner UX

- In My shop product rows the existing Available switch becomes "Available today" with a menu:
  sold out today / sold out until… / available. Keep one-tap for "sold out today".
- "Today's hours" action in My shop: closed today / closing early at… / opening late at…, with a
  review sheet before saving (uses proposals, not a direct write).
- Coach: extend `ProductInput` with optional `sold_out_until` ("today" understood by the tool as
  the shop's local date) and add an hours-exception proposal tool; update the instruction minimally.
  Exceptions are proposals that the owner confirms.

## Customer page

- Shows today's hours (exception applied, with "Today: closes at 2 PM" note), per-item
  "Sold out today", and a quiet "Updated 2 h ago" / "Confirmed today" freshness line; items whose
  sold-out date passed show "Availability not confirmed today".

## Tests

- Backend unit tests for timezone/date boundary logic (midnight, overnight, other device timezone),
  expiry, exceptions not touching regular hours (H05), stale update rejection, both adapters.
- Coach tool tests (offline) for `sold_out_until=today` and hours-exception proposals.
- Playwright `tests/freshness.spec.ts`: mark chai sold out today → public page shows it with the
  confirmed-today line; set closing early → public page shows today's hours note; using a fixed
  clock (Playwright `page.clock`) jump past midnight → "not confirmed today", not "available".
