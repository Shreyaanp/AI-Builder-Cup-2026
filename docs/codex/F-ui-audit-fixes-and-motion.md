# Task F — Fix the UI audit and add Material 3 motion

Read `docs/codex/CONVENTIONS.md`, then `docs/codex/UI-AUDIT-2026-10-14.md` (49 findings + motion
plan), `.agents/skills/material-design-3-ui/SKILL.md` (+ references/motion.md,
feedback-and-overlays.md, forms-and-input.md) and `.agents/skills/web-interface-guidelines/SKILL.md`.

## Scope

Fix every **High** (1–16) and **Medium** (17–44) finding and Low 45–49, except these
deliberate scope limits:

- #36 currency: add `currency` (ISO 4217, default from the browser region at shop creation, e.g.
  INR for en-IN/hi-IN, USD for en-US) and `locale` to the business fields in BOTH stores and the
  proposal models; `formatPrice(minor, currency, locale)` with correct minor-unit precision; price
  inputs show the shop's currency symbol. Keep storage as integer minor units.
- #28 routing: use the URL hash or search param for the destination (`?tab=shop`) with
  `history.pushState` + `popstate`; no router library. Restore per-destination scroll and move
  focus to the destination heading on user navigation.
- #43/#44 performance: lazy-load the classic App, non-initial destinations and FaceDialog; cap
  rendered chat history (latest 40, "Show earlier") and paginate product lists over 50. Do not
  add a virtualization library.
- #37 public language: language switch on the public page (en/hi), initial from `?lang=` or
  `navigator.languages`.
- #4/#5/#17 review sheet: show target shop name, operation, before → after per changed field
  (fetch current values from workspace state), "Will be cleared" rows, accurate visibility copy
  (private only / also visible on your customer page when shared / never Google), and a
  "Refresh proposal" path on 409.
- #6 cancel keeps the draft: editors re-open with the same values; photo proposals keep the
  extracted values in workspace state until discarded.

## Motion (from the audit's plan)

- Add `motion` tokens to `src/design/theme.ts`: durations (short 150, medium 200/300, long 400)
  and easings (standard `cubic-bezier(0.2,0,0,1)`, emphasized decelerate
  `cubic-bezier(0.05,0.7,0.1,1)`, emphasized accelerate `cubic-bezier(0.3,0,0.8,0.15)`), wire them
  into MUI `transitions` so Dialog/Drawer/Snackbar use them.
- Implement exactly the transitions listed in the audit's Motion plan (destination fade-through,
  editor→review sequencing, save feedback reveal, next-step crossfade, composer state crossfade,
  completed-message reveal, public refresh reveal). transform/opacity only, never layout props,
  no `transition: all`.
- Add a brief "changed" highlight on product rows/fields that were just saved (tonal background
  fading out over 1.2 s; static highlight under reduced motion).
- Reduced motion: zero durations, `scrollIntoView({behavior:'auto'})`, all state still
  communicated by text/focus.

## Tests

- Update/extend Playwright specs: shop switch never shows the previous shop's products or
  messages (#1, #2); cancel review → editor reopens with values (#6); failed `/businesses` shows
  error + Retry, not the empty state (#8); public page transient 500 keeps content with a stale
  notice, 404 shows unavailable (#10, #11); face deletion requires confirmation (#16); destination
  in URL survives reload and Back (#28); reduced-motion run passes (`page.emulateMedia({
reducedMotion: 'reduce' })`).
- Keep `tests/v1-a11y.spec.ts`, `tests/demo-flow.spec.ts`, `tests/v1.spec.ts` green (update
  selectors only when the UI legitimately changed, never weaken assertions).
- Backend tests for currency/locale on both stores.
- Final message: map every finding number to fixed / partially fixed (why) / not fixed (why).
