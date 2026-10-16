# S21 · Show measured impact with inspectable methodology

Owner area: **trust**. Dispatcher: the assistant. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s21/phone-light/run.json), [video](../stories/director/s21/phone-light/walk.webm), [contract](../../STORIES.md#s21--impact-and-evaluation-evidence).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

Expose an Impact entry with dated numerator/denominator, dataset, fixture/live status and local evidence links. Empty/unmeasured values must say so; projected benefits must not resemble observed traction.

Locate: trust/impact worker. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] No fixture result passed off as live accuracy.
- [ ] No projected savings shown as measured impact.
- [ ] Evidence links resolve locally.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
