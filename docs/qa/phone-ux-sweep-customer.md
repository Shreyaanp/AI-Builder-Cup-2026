# Customer phone UX sweep

## Scope

Ask, Results, Browse, shop hero/menu/chat, stamp QR sheet, Passport and Profile. The phone sweep checks horizontal overflow and fixed overlays at 360, 390 and 412 px in light and dark themes, in English, Hindi and Tamil, using offline fixtures. It opens the Profile and QR sheets and checks their viewport width.

## Changes

- Shop the customer top bar against the solid theme surface while it sticks during scroll.
- Browse reserves another 16 px below the last result so its fixed Map view action clears the final row.
- Results map pin borders, open/closed rings, location marker and focus treatment use active semantic theme roles instead of literal colors. The open-state ring stays the customer success tone.
- Added `tests/customer-phone-sweep.spec.ts` for the requested 360 px horizontal overflow and fixed-overlay check. It also verifies that any sticky bar has a fully opaque background.
- The QR rejection case in `tests/customer-no-overlap.spec.ts` now also asserts no horizontal overflow while the stamp sheet is open.
- Similar-nearby loading cards stay inside their own horizontal scroll area instead of widening the shop page.
- The shared compact sheet follows the visual viewport width, including when a phone browser's layout viewport is wider.
- Ask keeps extra bottom clearance below the final prompt; Browse loading reserves room for its fixed Map view action.

## Evidence

The initial 136-case phone run passed 131 cases and found five fixed-bar overlaps. The five affected Ask/Browse cases passed in a focused rerun after adding bottom clearance. The 360 px light Hindi Ask case first hit a cold navigation timeout; it passed on a warm retry with the layout assertion unchanged. Shop, Results, Profile and QR passed all 18 width/theme/language combinations. The QR rejection assertion passed at 360 and 390 px. Browser emulation does not establish physical-phone behavior.

## Open coverage

- QR camera permission states, offline operation on a physical phone, and screen-reader behavior remain outside this automated layout check.
