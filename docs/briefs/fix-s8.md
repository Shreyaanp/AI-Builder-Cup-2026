# S8 · Explain stamps and prove reward eligibility before celebration

Owner area: **passport/games**. Dispatcher: Claude. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 12 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s8/phone-light/run.json), [video](../stories/director/s8/phone-light/walk.webm), [contract](../../STORIES.md#s8--passport-stamps-quests-and-scratch-rewards).

- Unsigned stamp is on-phone only; verified signed visit, reward threshold, quests and scratch keyboard alternative need further evidence. No QR signing key was read or copied.

## Smallest fix / next proof

Put scan location, threshold, storage scope and reward terms before the first celebration. Provide keyboard/tap equivalent for scratch/drag. Do not label unsigned device progress as verified visits. Add duplicate/reload and eligible/ineligible reward walks.

Locate: src/features/rewards/StampCard.tsx; src/features/passport/StampMoment.tsx; src/features/passport/Passport.tsx:46. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Instructions prominent before first stamp.
- [ ] Unsigned device stamp does not imply verified visit.
- [ ] Scratch has non-drag alternative.
- [ ] Demo perks are not real entitlements.
- [ ] Social participation is opt-in and resettable; no identity/location leakage.
- [ ] Gifted progress is not a verified visit; freezes and contributions are idempotent.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
