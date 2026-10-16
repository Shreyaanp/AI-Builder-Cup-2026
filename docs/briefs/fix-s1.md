# S1 · Make onboarding entry points lead into one name-first full-screen journey

Owner area: **owner onboarding**. Dispatcher: Claude. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 28 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s1/phone-light/run.json), [video](../stories/director/s1/phone-light/walk.webm), [contract](../../STORIES.md#s1--owner-opens-and-shares-a-shop).

- This main checkout uses the existing coach/photo review. The full-screen name-first voice/camera/map onboarding contract needs the onboarding branch and physical-device review.

## Smallest fix / next proof

Empty My shop currently offers the existing editor/photo path. Route +, tour end and empty state to the guided journey, preserve the draft on Back, and offer Type instead on mic errors. Do not change review approval semantics.

Locate: src/features/v1/screens/ShopScreen.tsx:94; src/features/v1/EditDialogs.tsx; onboarding branch. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] All three entry points reach the same journey.
- [ ] Never infer owner authority from Google sign-in.
- [ ] No edit is saved before review approval.
- [ ] Vegetarian shops never receive an irrelevant halal question.
- [ ] Back and IME do not lose the draft.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
