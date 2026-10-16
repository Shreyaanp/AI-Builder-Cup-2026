# S5 · Contain Google step motion without expanding the mobile viewport

Owner area: **my shop**. Dispatcher: Claude. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 20 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s5/phone-light/run.json), [video](../stories/director/s5/phone-light/walk.webm), [contract](../../STORIES.md#s5--assisted-get-on-google).

- Official links inspected without external navigation; actual owner submission and Google access unvalidated.

## Smallest fix / next proof

Phone recordings are 390×844 raster, but the CSS layout viewport expands to 405–406px on checklist, preview and hand-off checkpoints in both themes; photos and the final reduced-motion checkpoint return to 390px. The translateX step entrances are the leading source hypothesis, not a proven root cause. Reproduce at animation start/middle/end; constrain the transition layer without clipping focus outlines, then verify the CSS viewport stays 390px and controls do not shrink. Preserve the truthful Google access/owner-submission boundary.

Locate: src/features/v1/screens/GoogleScreen.tsx:182; transition wrapper and cbStepFromRight/Left definitions. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] No claim of Google affiliation or automatic publication.
- [ ] Hours/currency/photos match saved shop.
- [ ] External links inspected, never opened in this run.
- [ ] Back returns to prior step.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
