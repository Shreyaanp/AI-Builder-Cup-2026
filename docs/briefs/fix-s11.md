# S11 · Make aggregated demand an actionable, discoverable journey

Owner area: **my shop**. Dispatcher: the assistant. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s11/phone-light/run.json), [video](../stories/director/s11/phone-light/walk.webm), [contract](../../STORIES.md#s11--unmetdemand-radar-to-menu).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

Provide a named Asked nearby entry, period/radius and banded counts, then one relevant reviewed menu/sourcing proposal. No raw asks or customer identities. Verify sparse, stale, failed and offline data.

Locate: src/features/v1/ShopTiles.tsx; My shop demand worker. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] No identities/raw customer queries exposed.
- [ ] No claim nobody sells it without complete coverage.
- [ ] Privacy thresholds stay explicit.
- [ ] No dietary mismatch.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
