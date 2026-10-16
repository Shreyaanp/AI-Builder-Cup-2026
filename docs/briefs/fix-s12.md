# S12 · Expose a neutral comparable-price review

Owner area: **my shop**. Dispatcher: the assistant. Priority: **P2**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s12/phone-light/run.json), [video](../stories/director/s12/phone-light/walk.webm), [contract](../../STORIES.md#s12--owner-price-check).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

Add a contextual comparison entry only where supported. Show comparable unit/currency, sample size and demo count; insufficient data stays empty. Any price change uses the existing approval boundary.

Locate: src/features/shop/MenuSheet.tsx; My shop price worker. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] No cheapest ranking for customers.
- [ ] No misleading shop-level Places price as item median.
- [ ] No auto-price changes.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
