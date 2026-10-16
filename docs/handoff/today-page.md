# Today page (Coach tab first view)

Branch `feat/today-page`. Brief: `docs/briefs/task-TODAY-PAGE.md`. The approved design artifact
could not be opened from this account, so the build follows the brief's written spec. Theme,
the tab name "Coach", the conversation, composer, voice and review cards are unchanged; the nav
and the Shop/Grow/You pages were not touched.

## What the owner sees

Order from the top (anything complete goes away):

1. **Greeting**: "Good morning/afternoon/evening, <first name>" in the owner's language. The
   first name comes from the Google account (Firebase `displayName`); none (local preview) →
   the name is omitted. The top bar still names the shop.
2. **One coach line** (only when something true can be said), rules first, in this order:
   a festival within 14 days for the shop's country ("Diwali in 3 days: plan your stock"),
   live rain ≥ 60 % (Open-Meteo; the offline fixture only speaks for labelled demo shops),
   or "usually your busiest day: 60 chai last Saturday" (busiest weekday over 4 weeks).
   Structured kinds, phrased client-side in 15 locales; no model call, so nothing to cache.
3. **Setup bar** "Shop setup 4/6" only while setup is unfinished (same six checks as
   readiness).
4. **Day one** (a shop with no data yet and setup unfinished): "Let's get <shop> online", the
   next step (Scan / Add / Share) and a "Talk to me" mic button. The pulse replaces it once data
   exists.
5. **Needs you now** (Caveat title): max 3 live items, most urgent first: customers waiting →
   Reply; "Still the same menu today?" Yes / Changed (once a day, needs a menu); low stock or
   forecast shortfall → Order (asks the coach); sold out today → Back in stock / See; missing
   setup steps; what customers ask (only once the page is shared) → Answer. Each row leaves
   with a check and a short slide when done, the next one rises in. Only the top row's button
   is filled (one primary action; none on day one, where the start card has it). Empty →
   "All set for today" (not shown on day one).
6. **Pulse**: "Yesterday: ₹4,200 · 38 saw your page · 3 asked" (or "Today so far") and
   "Today: about 45 Masala chai, busiest 5 – 7 pm". Each number only if it exists (never 0 for
   "no record"). Tapping it asks the coach "How did yesterday go?" (insights chart card).

While chatting, the card shrinks to a slim pill "N things need you" under the app bar (hidden
when N = 0); tapping it opens the same rows inline ("Hide" closes).

## Code

- `backend/app/shop_today.py`: `GET /api/v1/businesses/{id}/today` (owner only, `owner:read`
  limit): yesterday/today pulse, today's top forecast item (same TimesFM/weekday forecaster and
  prep buffer as the morning brief), low stock (≤ 5 left or runs out within 2 days of forecast),
  coach line. Daily totals `shop_daily` (`views`, `stamps`, `returning`) in the existing
  feature-docs store, keyed `<shop>:<day>`, atomic on SQLite and Firestore, erased with the
  owner. Customer page opens are counted in `GET /public/shops/{id}`; stamps in
  `POST /customer/passport/stamps` (returning = a stamped visit that is not the first). No
  person, device or address is stored; counting never blocks the customer request.
- `src/features/v1/today/todayPlan.ts`: **`todayPlan()` is the only place that decides what
  shows** (items, order, numbers, day one). `metricsFor(shop)` picks the pulse metrics by
  business type; when the shop playbook API lands (feat/shop-playbook), read its key metrics and
  watch-list there.
- `TodayView.tsx` (view, rows, pulse, pill), `useTodayPlan.ts`, `useToday.ts` (fetch; reloads on
  shop revision, stock and menu confirmation, and every 5 min), `todayCopy.ts` (15 locales).
- `CoachScreen.tsx`: the empty-thread view is `TodayView` for a shop (the no-shop start is
  unchanged); the sticky dense shop card + freshness while chatting became `NeedsPill`. Removed
  from the Coach first view: big ShopCard, the three shortcut chips, FreshnessCard, RecapTile,
  PendingCard, the setup step line. They remain on My shop. Chips after a coach reply stay.
- `src/auth`: `Identity.name` (first name) added, optional.

## Tests

- Backend `tests/test_shop_today.py`: empty numbers stay missing, owner-only, pulse from sales,
  page opens and questions, atomic counter + erasure, coach line rules.
- `tests/today.spec.ts` (phone + desktop): day one, needs (order, one primary, leave on done),
  all set + pulse → coach, collapse to pill while chatting, Hindi and Japanese in dark; axe on
  every state. Screenshots: `docs/stories/today-*.png`.
- Updated for the new first view: phone-shell B1/B2/B4/B6/B7, v1 (customer facts and sweep now
  on My shop), import (daily check), stories S2 and A9 (pill).

## Not done / follow-ups

- Gemini phrasing of the coach line was not added (rules + localized templates are cheaper and
  exact); add it later behind the cache if wanted.
- Page-open counts include the owner's own visits to their page (public route has no
  identity); a bot-heavy page would inflate them.
- Festival days are a small fixed table (Diwali, Loy Krathong, New Year JP, Pongal, Chinese New
  Year, Ramadan) for 2026-27.
