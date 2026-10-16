# S9 · Expose one complete rescue-to-collection route

Owner area: **customer**. Dispatcher: the assistant. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; entry blocked. 4/4 variants; 4 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s9/phone-light/run.json), [video](../stories/director/s9/phone-light/walk.webm), [contract](../../STORIES.md#s9--closingtime-rescue-and-collection).

- No named entry is exposed in main My shop/navigation for this contract. Feature branch or discoverable entry is required; do not infer backend absence.

## Smallest fix / next proof

The main navigation boundary does not establish an owner-posted offer → customer hold → collection. Connect this one route with honest demo labels, real expiry and availability, sign-in at hold, explicit owner confirmation, and one idempotent collection reward.

Locate: src/features/passport/TodayDeck.tsx; customer rescue worker. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Forecast is estimate.
- [ ] Hold is not payment or guaranteed fulfilment.
- [ ] Expired/sold-out races tested.
- [ ] No invented environmental savings.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
