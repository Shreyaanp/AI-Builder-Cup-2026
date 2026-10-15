# S4 · Keep supplier comparison readable without crowding the composer

Owner area: **coach**. Dispatcher: Claude. Priority: **P2**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 20 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s4/phone-light/run.json), [video](../stories/director/s4/phone-light/walk.webm), [contract](../../STORIES.md#s4--forecast--source--sell).

- Forecast trigger and stock receipt hand-off are outside this sourcing-only walk; supplier replies are fixtures.

## Smallest fix / next proof

On phone, readiness and daily-check blocks reduce supplier-card space and a horizontal next-card preview clips content by design. Prioritize the supplier choice and one concise explanation; preserve reachable Send. Add an explicit receipt hand-off rather than treating Confirmed as restocked.

Locate: src/features/v1/screens/CoachScreen.tsx:708; src/features/sourcing/SourcingCards.tsx; src/features/sourcing/Orders.tsx. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Send is physically reachable after supplier results.
- [ ] No supplier contact before approval.
- [ ] Demo replies clearly labelled.
- [ ] Order confirmation never means goods received.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
