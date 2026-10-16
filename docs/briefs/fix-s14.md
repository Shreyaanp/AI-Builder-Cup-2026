# S14 · Provide supplier context and aggregate-only demand

Owner area: **supply chain**. Dispatcher: Claude. Priority: **P2**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 1 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s14/phone-light/run.json), [video](../stories/director/s14/phone-light/walk.webm), [contract](../../STORIES.md#s14--supplier-radar-and-offer).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

A supplier should deliberately enter supplier mode, see only eligible aggregates, and review offer terms before sending. Add empty/threshold/offline paths and link incoming orders.

Locate: supply-chain worker; My shop supplier view. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Real shops opt in to aggregate needs.
- [ ] Supplier flag is not verified authority.
- [ ] Sending offer needs explicit approval.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
