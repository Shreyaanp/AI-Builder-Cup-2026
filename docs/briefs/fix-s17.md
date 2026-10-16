# S17 · Make agent availability and accepted holds visibly distinct

Owner area: **customer**. Dispatcher: Claude. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s17/phone-light/run.json), [video](../stories/director/s17/phone-light/walk.webm), [contract](../../STORIES.md#s17--ai-concierge-asks-shop-agents).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

Expose a concrete item/quantity/deadline request. Display shop-sourced freshness and partial failures, then exact user approval and owner acceptance/rejection. A recommendation or demo reply never means a confirmed hold.

Locate: customer concierge worker; src/features/public/CustomerConversation.tsx. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] No agent-to-agent completion claim from canned cards.
- [ ] No hold without exact user approval.
- [ ] Owner controls acceptance.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
