# S10 · Connect a useful rich coach answer to one next action

Owner area: **coach**. Dispatcher: Claude. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 12 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s10/phone-light/run.json), [video](../stories/director/s10/phone-light/walk.webm), [contract](../../STORIES.md#s10--morning-brief-and-rich-coaching).

- No seeded sales history: this records the insufficient-history boundary, not a rich forecast or daily brief.

## Smallest fix / next proof

The recorded no-history boundary cannot establish a morning brief or rich analysis. Use synthetic history to show conclusion, units, method/range and accessible text summary. One next action should lead to supplier/menu context; insufficient data stays honest.

Locate: src/features/v1/CoachChart.tsx; src/features/forecast/PrepPlan.tsx; src/features/v1/screens/CoachScreen.tsx. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Chart never relies only on colour.
- [ ] Offline method not called TimesFM.
- [ ] Summary usable without chart.
- [ ] One best action outranks decorative metrics.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
