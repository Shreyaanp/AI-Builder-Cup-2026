# Customer phone UX sweep

## Scope

Ask, results, Browse, shop hero/menu/chat, stamp QR sheet, Passport and Profile. The new 360 px phone spec checks horizontal overflow and fixed overlays on Ask, Browse, Passport, shop and QR entry; it opens Profile and checks its sheet width. Results, 360/390/412 widths and light/dark have existing focused specs. Language coverage for Hindi and Tamil currently comes from the shop heading capture; this is not a full-screen multilingual matrix.

## Changes

- Shop the customer top bar against the solid theme surface while it sticks during scroll.
- Browse reserves another 16 px below the last result so its fixed Map view action clears the final row.
- Results map pin borders, open/closed rings, location marker and focus treatment use active semantic theme roles instead of literal colors. The open-state ring stays the customer success tone.
- Added `tests/customer-phone-sweep.spec.ts` for the requested 360 px horizontal overflow and fixed-overlay check. It also verifies that any sticky bar has a fully opaque background.
- The QR rejection case in `tests/customer-no-overlap.spec.ts` now also asserts no horizontal overflow while the stamp sheet is open.

## Evidence

Implementation findings and changes are listed above. `npm run rules` passed and `npm run build` passed. An earlier focused browser run passed 21 cases, including the 360/390 chat bar, Ask nav, Browse skeleton, Passport loading, QR rejection, and results layouts at 360/390/412 in light and dark. Two light Browse cases timed out during that run. The final 360 px sweep could not complete the QR route: Vite reported `EPERM` renaming `node_modules/.vite/deps`, followed by failed dynamic imports and the app load boundary. This leaves the added QR overflow assertion and final sweep unverified in this run. Browser emulation does not establish physical-phone behavior.

## Open coverage

- Full 360/390/412 × light/dark × English/Hindi/Tamil coverage across every listed customer screen is not yet provided by one matrix. Existing specs cover overlapping subsets.
- QR camera permission states, offline operation on a physical phone, and screen-reader behavior remain outside this automated layout check.
