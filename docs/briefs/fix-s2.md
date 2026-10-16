# S2 · Reduce competing preamble above the daily edit

Owner area: **coach**. Dispatcher: the assistant. Priority: **P2**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; recorded subset. 4/4 variants; 24 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s2/phone-light/run.json), [video](../stories/director/s2/phone-light/walk.webm), [contract](../../STORIES.md#s2--daily-upkeep-by-text-or-voice).

The recorded happy-path subset does not validate the entire state matrix.

## Smallest fix / next proof

The phone transcript starts below progress, readiness and daily-check surfaces. Collapse redundant setup/readiness once the shop exists; keep the daily check dismissible and the edited values in view. Preserve the current successful two-change review.

Locate: src/features/v1/screens/CoachScreen.tsx:708; src/features/coach/InputDock.tsx:161. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Inventory unchanged before approval.
- [ ] Cancel saves nothing.
- [ ] Stop and retry preserve text.
- [ ] Cross-context public refresh tested separately from local rendering.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
