# S15 · Connect the saved day to tomorrow without adding a dashboard

Owner area: **my shop**. Dispatcher: Claude. Priority: **P2**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 16 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s15/phone-light/run.json), [video](../stories/director/s15/phone-light/walk.webm), [contract](../../STORIES.md#s15--close-the-day-and-plan-tomorrow).

- Fixture photo count extraction only; real photo accuracy and tomorrow’s populated plan remain unvalidated.

## Smallest fix / next proof

After Day closed, offer one contextual tomorrow/prep action with actual day/units and insufficient-history explanation. Verify zero versus unknown and partial-save retry; preserve idempotency.

Locate: src/features/closeday/CloseDay.tsx; src/features/planning/PlanTomorrow.tsx. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Cancel writes nothing.
- [ ] Zero distinct from unknown.
- [ ] Duplicate confirmation cannot double-count.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
