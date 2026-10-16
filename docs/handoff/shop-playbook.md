# Shop playbook: what Chalkboard knows about a shop

16 October 2026. Branch `feat/shop-playbook`, brief `docs/briefs/task-SHOP-PLAYBOOK.md`.

## Implemented

- **Understand** (`1c3e2f0`): after the basics, onboarding asks up to three skippable
  questions: what matters most now (more customers / less waste / save time / own words),
  busiest times, who the regulars are. Answers go through the review boundary and are
  stored as `understanding` on the business. They stay private to the owner.
- **Food sub-segments** (`6d65af0`): beverage, bakery, snack, restaurant, butcher and grocer
  each get only the questions that fit. When the segment is unclear, the owner gets one
  natural question. Tests per segment prove irrelevant questions never appear (for
  example, a tea stall never gets a veg or halal question).
- **Playbook** (`backend/app/playbook.py`): a versioned, bounded template (summary, goals,
  priorities, key metrics, watch list, customer segments, vocabulary/units, tone, next
  tools). It is built by ONE Gemini structured-output call and validated, bounded and
  relevance-filtered (no halal/vegetarian topics where they do not fit). The inputs are
  the profile, onboarding answers, menu, location/hours and recent sales/questions.
  Offline/test runs use a deterministic fixture per segment, labelled "made without AI".
  Rebuilds happen only when the playbook is missing or unreadable, when the
  profile/menu/answers change materially (input digest), or weekly. Rebuilds are
  rate-limited (`limits.py`). Stored in SQLite and Firestore with lazy migration.
- **Owner edits**: edit or remove any item, edit the summary, remove words. Edited items
  are marked "Your words". Edited and removed items survive a regenerate, and removed
  items never come back.
- **Consumers**:
  - `GET /businesses/{id}/playbook/today` and `view.today` give the pulse order, line topics,
    "needs you now" order, metrics and units.
  - `view.grow` orders the My shop tool tiles (close day, prep plan, orders, plan
    tomorrow) in `ShopTiles.tsx`. The tiles keep their slots, so without a playbook the
    order is unchanged.
  - The coach shop snapshot carries `coach_summary` (at most 900 characters, owner data,
    not instructions).
- **Screen**: "What Chalkboard knows about your shop" is under Privacy (You) and opens a
  sheet (`src/features/v1/playbook/`). The wording is honest: metrics without a Today number
  say "Not tracked yet". The screen covers 15 locales.

## Evidence

- Backend: `backend/tests/test_playbook.py` covers generation, bounds, the single Gemini
  call, refresh rules, edits, migration in both stores, consumers, routes and the coach
  snapshot. Full backend suite: 724 passed, 202 skipped.
- Coach eval: `backend/scripts/coach_eval.py` has a tea-stall scenario with a seeded playbook.
- UI: `tests/playbook.spec.ts` covers phone and desktop in light and dark, axe clean, with
  no horizontal scroll. It checks the grow tile order, editing, removal that survives a
  regenerate, and word removal. Screenshots are in `docs/stories/playbook-*.png`.
- `npm run lint`, `npm run build` and `npm run test:hooks` pass. Only the playbook spec was
  run from the UI suite in this worktree (shared machine). The full `npm run test:ui` is
  left to the integration run.

## Not done / next

- The v1 app has no Today page yet. The Today hints are served and tested, but nothing on
  screen reads them until a Today/pulse surface lands. Use `usePlaybook().view.today`.
- Grow has no Rescue, Google, perks or recap tiles on this branch. Once those tiles exist,
  add them to `byGrowOrder` in `ShopTiles.tsx`.
