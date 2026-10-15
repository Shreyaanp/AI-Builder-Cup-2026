# S20 · Expose Features and AI examples without hidden execution

Owner area: **my shop**. Dispatcher: Claude. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 1 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s20/phone-light/run.json), [video](../stories/director/s20/phone-light/walk.webm), [contract](../../STORIES.md#s20--features-ai-guide-payment-and-rider-handoffs).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

Main navigation still names Google. Complete a Features entry with Google as one capability and concrete AI examples. Preview must not execute a tool. Payment/rider hand-offs show exact recipient/amount/provider and leave the external transaction to that provider.

Locate: src/features/v1/AppShell.tsx:68; Features worker. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Director never follows external links.
- [ ] No money handling or claimed booking.
- [ ] Examples do not execute on mere preview.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
