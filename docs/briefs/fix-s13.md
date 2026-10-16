# S13 · Finish group-buy close into an individually approved order

Owner area: **supply chain**. Dispatcher: the assistant. Priority: **P2**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s13/phone-light/run.json), [video](../stories/director/s13/phone-light/walk.webm), [contract](../../STORIES.md#s13--group-buy-to-individual-order).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

Expose a group invitation and own quantity, show deadline/tier terms, and require explicit own-order approval at close. A missed tier must offer fallback/cancel. Do not collect money.

Locate: supply-chain worker; sourcing Orders. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Never auto-order at deadline.
- [ ] No private member forecasts shown.
- [ ] No platform payment guarantee.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
