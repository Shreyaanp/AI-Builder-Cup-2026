# Bug tracker — FEATURE FREEZE (Oct 14)

No new features until every open item is closed. This file is the single source of truth.

**Closing rules:** an item closes only with:

- the fixing commit;
- a phone screenshot at 390×844 in `docs/bugs/<id>.png`;
- targeted tests passing.

The user signs off each batch. New bugs are added at the bottom with the next ID.

Each fix lives on the owner's branch. Account 1 (Claude lead) reviews, merges to main and releases.

| ID  | Bug                                                                                                                                                                                                                          | Owner                 | Branch                  | Status             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------- | ------------------ |
| B1  | Bottom slide-in sheet is broken/mispositioned on phone                                                                                                                                                                       | Account 2             | `fix/phone-shell`       | live               |
| B2  | Bottom navigation disappears after tapping "Something changed" (freshness)                                                                                                                                                   | Account 2             | `fix/phone-shell`       | live               |
| B3  | Coach composer: not single-line, press-to-talk glitchy and jumps the layout                                                                                                                                                  | Account 2             | `fix/phone-shell`       | live               |
| B4  | Back button doesn't close sheets/dialogs first; no "Discard changes?" or leave-page confirm with unsaved input                                                                                                               | Account 2             | `fix/phone-shell`       | live               |
| B5  | Top bar: remove "What's new at …" line; move + (new chat) to top-right next to settings                                                                                                                                      | Account 2             | `fix/phone-shell`       | live               |
| B6  | Coach first view scrolls; suggestions too low; completed setup ("5 of 5") should collapse to a small chip                                                                                                                    | Account 2             | `fix/phone-shell`       | live               |
| B7  | No "Take photo" (camera) option — upload only                                                                                                                                                                                | Account 2             | `fix/phone-shell`       | live               |
| B8  | My shop: pending/notification cards too thick; completed setup header too big; "customer page ready to share" / "Open customer page" text too large                                                                          | Codex                 | `fix/shop-polish`       | live               |
| B9  | Google page repeats "simulation/simulated" — say it once, clearly, at the practice section                                                                                                                                   | Codex                 | `fix/shop-polish`       | live               |
| B10 | Recap shows "Written by AIOffline template" (labels run together)                                                                                                                                                            | Codex                 | `fix/shop-polish`       | live               |
| B11 | Only opening hours — no closing hours (needs structured open/close per day, keep free-text fallback, `open_now`)                                                                                                             | Codex                 | `fix/shop-polish`       | live               |
| B12 | Menu not grouped into categories (product `category` field in DB; compact category boxes on public page and My shop; coach/photo assign categories)                                                                          | Codex                 | `fix/shop-polish`       | live               |
| B13 | Face scan untested on a real phone                                                                                                                                                                                           | User test → Account 1 | —                       | open               |
| B14 | Reading a real POS/notebook photo (live Gemini) untested                                                                                                                                                                     | User test → Account 1 | —                       | open               |
| B15 | Camera upload untested on a real phone                                                                                                                                                                                       | User test → Account 1 | —                       | open               |
| B16 | No way to upload a document or picture from the coach — composer needs one attach button: Take photo, Photo library, Document (PDF/Excel/CSV) — routed to the photo pipeline or the import endpoint                          | Account 2             | `fix/phone-shell`       | open               |
| B17 | A photo's map location (EXIF GPS) is thrown away — read it before stripping, propose it as the shop's pin for the owner to confirm (never saved without review; GPS never stored in the image)                               | Account 1             | `fix/photo-location`    | live               |
| B18 | Customer onboarding step 1/2: "Use my location" doesn't work on phone                                                                                                                                                        | Account 1             | `fix/customer-location` | live               |
| B19 | Phone photos over 5 MB / 40 MP are rejected (most modern phone photos) — accept up to 20 MB, decode big JPEGs at reduced scale (GPS pin kept)                                                                                | Account 1             | `fix/photo-size`        | live               |
| B20 | Payment and delivery options are a fixed Singapore list (PayNow, NETS, GrabPay, Grab, foodpanda) — keep as suggestions, allow any name (UPI, PayPay, Swiggy…)                                                                | Codex                 | `fix/global-facts`      | live               |
| B21 | Only 16 currencies; unknown countries got SGD — every country's currency, default from the phone's timezone/region                                                                                                           | Account 1             | `fix/global-location`   | live               |
| B22 | Shop finder categories are Singapore food types (kopi, hawker) — generic, local categories                                                                                                                                   | Codex                 | `fix/global-facts`      | live               |
| B23 | Budget filter only understands SGD                                                                                                                                                                                           | Codex                 | `fix/global-facts`      | live               |
| B24 | "Food business?" detected from English keywords only — any language                                                                                                                                                          | Codex                 | `fix/global-facts`      | live               |
| B25 | Customer results must be precise around the customer anywhere: high-accuracy GPS, remembered location, auto-locate when allowed, nearest first, all local shop types (not only food)                                         | Account 1             | `fix/global-location`   | live               |
| B26 | My shop repeats the shop name with a "Check pending"/Draft chip at the top — remove it, tiles move up                                                                                                                        | Account 2             | `fix/myshop`            | open               |
| B27 | My shop bento grid isn't data-friendly (full-width tiles with ~25% dead space) — content-sized dynamic grid                                                                                                                  | Account 2             | `fix/myshop`            | open               |
| B28 | Menu: items land "Uncategorised" (auto-categorise on photo/import/coach + reviewed "sort my menu"); category grid 2–3 per row; tap price to edit inline; unit is a dropdown; oversized Import/Add buttons in the phone sheet | Account 2             | `fix/myshop`            | open               |
| B29 | Prep plan tile fails: its rate limit (10/hour) blocks the tile after a few loads                                                                                                                                             | Account 1             | `fix/prep-plan`         | live               |
| B30 | Customer page: black-and-white (monochrome) look; remove the top "Back · Chalkboard" bar                                                                                                                                     | Codex                 | `fix/customer-page`     | live               |
| B31 | Stamp card incomplete: owner sets stamps needed; progress; claim + staff reset; honest device-only label                                                                                                                     | Codex                 | `fix/customer-page`     | live               |
| B32 | Customer page menu is a long list — same compact category grid as My shop                                                                                                                                                    | Account 2             | `fix/myshop`            | open               |
| B33 | Face registration: "Evaluation did not finish" — every capture 500 (bytearray body with AsyncClient)                                                                                                                         | Account 1             | `fix/voice-face`        | live               |
| B34 | Voice: "Voice connection ended" at once — Live model rejects custom thinking level                                                                                                                                           | Account 1             | `fix/voice-face`        | live               |
| B35 | Landing page on phones: remove humanStack/LOCAL LIFE pill; broken For business button; too-large fonts; badly sized cards                                                                                                    | Codex                 | `fix/landing-mobile`    | live               |
| B36 | Install app should be in Settings                                                                                                                                                                                            | Codex                 | `fix/landing-mobile`    | live               |
| B37 | Google tab means nothing today: one end-to-end onboarding flow (details → photos → profile on our side → last step "Verified by Google: waiting for Google API access"), no practice simulator, less text                    | Account 1             | `fix/google-flow`       | merged — releasing |
| B38 | Customer pages (explore, shop page, menu) need a light/dark switch                                                                                                                                                           | Codex                 | `fix/customer-page`     | live               |

## First story audit · 2026-10-15

Details, ranked demo impact, proposed sizes and phone evidence: [docs/stories/AUDIT.md](docs/stories/AUDIT.md).
These are local findings; existing release statuses above are unchanged. Fixed-local entries are
not closed: fixing commits and user batch sign-off remain pending the conflicting commit instructions.

| ID  | Bug                                                                                                                           | Owner                                           | Status                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| B39 | S2/1–2: offline daily price/sold-out utterance produces no review proposal (A1)                                               | Tool/coach owner; coordinate sourcing ownership | open                                                              |
| B40 | S2/3: already-open customer page stays stale until Refresh/tab return (A3)                                                    | unassigned                                      | open                                                              |
| B41 | S1/6, S3/2, S7/3: default offline typed-city lookup is Singapore-area-only; eight-city catalogue is not a seeded preview (A2) | unassigned                                      | open                                                              |
| B42 | S3/5: offline halal answer says Not listed despite a confirmed fact (A4)                                                      | unassigned; coordinate locale worker            | open                                                              |
| B43 | S3/6: anonymous owner messaging contradicts required customer sign-in (A5)                                                    | identity owner                                  | open                                                              |
| B44 | S1/6: existing-shop menu-photo proposal loses EXIF GPS (A6; B17 follow-up)                                                    | photo/backend owner                             | open                                                              |
| B45 | S1 → S5 → S3: coach photo is not reused in gallery; customer page ignores owner gallery (A8)                                  | unassigned                                      | open                                                              |
| B46 | S2/5: daily freshness check hides in a non-empty coach thread (A9)                                                            | unassigned                                      | open                                                              |
| B47 | S5/4: copied Google details omit structured weekly hours                                                                      | story audit                                     | fixed locally; regression passed, sign-off pending                |
| B48 | S3/4: unavailable shared page has no route back to nearby shops                                                               | story audit                                     | fixed locally; regression passed, sign-off pending                |
| B49 | S3/3: known-halal discovery filter removes confirmed halal shops                                                              | story audit                                     | fixed locally; SQLite regression passed, sign-off pending         |
| B50 | S7/1: Tamil offline reply is English; planned Indian languages incomplete (A7)                                                | locale worker; offline coach owner              | open                                                              |
| B51 | S1/4: extraction uncertainty is behind the review sheet and cleared after creating the shop (A10)                             | unassigned                                      | open                                                              |
| B52 | S7/1, S3/8, S5/3: Tamil clipping, customer theming and inert preview affordances (A11)                                        | coordinate locale/UI owners                     | open                                                              |
| B53 | Coach smooth scroll ignores reduced-motion preference; Google wait pulse paints indefinitely; step focus has no outline (A12) | UI owner                                        | open                                                              |
| B54 | S3/6: English chat timestamps use US date order on an Indian phone                                                            | story audit                                     | fixed locally; visible-thread regression passed, sign-off pending |

## Parked until the freeze ends

- Launch video (`feat/demo-shops` @ `b4cefa8`).
- Seeding demo shops in production.
- Landing hero animation.
- Web Push.

## Next features — discuss after the bug-free release (user, Oct 15)

- **Food pictures on menus (decided):** owner adds a photo per item (camera/gallery, moderated); AI crops dishes from a menu photo; no image → category stock photo (Swiggy-style). Cards must look great.
- **Customer experience, AI-first and fun:** entry = talk to the AI, which curates nearby shops with strong animation (searching → results), Google places + our data, images; gamified/swipeable (Tinder-style) discovery; motion everywhere (reduced-motion respected).
- **Hyper-personalisation:** everything tuned to the customer's needs and local vendors.
- **Demo life:** auto-created sample data for a new visitor and vendor bots that act like shops, so the hackathon demo shows the full experience.
- **Real actions:** call the shop, ask for delivery, from the customer page.
- **Generalised business tool:** retailers, street vendors, merchants — broad but still useful.
- **Ease of use and new My shop ideas:** to discuss.
