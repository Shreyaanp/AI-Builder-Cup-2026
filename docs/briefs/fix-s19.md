# S19 · Demonstrate one linked simulated supply-chain document loop

Owner area: **supply chain**. Dispatcher: the assistant. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s19/phone-light/run.json), [video](../stories/director/s19/phone-light/walk.webm), [contract](../../STORIES.md#s19--po--confirmation--dispatch--invoice).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

Start with rules and an owner-approved PO; carry IDs through response, ASN and invoice; surface uncertainty, shortage/substitution/partial and match status. Receipt remains separate from order confirmation and financial settlement. Use synthetic SAP XML/JSON samples.

Locate: supply-chain worker. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] No live SAP or supplier contact.
- [ ] No money processed.
- [ ] Idempotent document replay.
- [ ] MOQ/credit/partial/substitution checks visible.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
