# S18 · Join connector mapping, diff and import receipt

Owner area: **supply chain**. Dispatcher: the assistant. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s18/phone-light/run.json), [video](../stories/director/s18/phone-light/walk.webm), [contract](../../STORIES.md#s18--connect-an-existing-pos-or-erp-export).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

Expose Connect your system, inspect one synthetic export, highlight uncertain required fields and units, then review a diff before import. Record malformed/no-op/duplicate import outcomes. No live ERP connection is needed for this fix.

Locate: connector worker; existing import review. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] No synthetic mapping called AI-verified.
- [ ] No credentials or merchant data in preference storage.
- [ ] No live system contact in recording.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
