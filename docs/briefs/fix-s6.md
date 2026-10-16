# S6 · Verify optional identity and partial erasure recovery independently

Owner area: **trust**. Dispatcher: Claude. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 24 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s6/phone-light/run.json), [video](../stories/director/s6/phone-light/walk.webm), [contract](../../STORIES.md#s6--optional-identity-and-privacy).

- Optional face capture, biometric matching and liveness are untested; face worker intentionally unavailable.

## Smallest fix / next proof

Cancel, failed request, named pending stores (injected partial receipt), retry and public removal are recorded. Complete the optional-identity slice: worker failure leaves Skip reachable and ordinary editing usable, without changing authority/publishing status. Separately verify a real local partial-store failure, since the partial receipt here is injected.

Locate: src/features/v1/screens/PrivacyScreen.tsx:70; src/features/v1/FaceDialog.tsx. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Cancel keeps records.
- [ ] Delete removes public synthetic shop.
- [ ] Partial status never says complete.
- [ ] No biometric capture or accuracy claim in director run.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
