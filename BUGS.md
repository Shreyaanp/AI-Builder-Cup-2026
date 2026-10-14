# Bug tracker — FEATURE FREEZE (Oct 14)

No new features until every open item is closed. This file is the single source of truth.

**Closing rules:** an item closes only with:

- the fixing commit;
- a phone screenshot at 390×844 in `docs/bugs/<id>.png`;
- targeted tests passing.

The user signs off each batch. New bugs are added at the bottom with the next ID.

Each fix lives on the owner's branch. Account 1 (Claude lead) reviews, merges to main and releases.

| ID  | Bug                                                                                                                                                                                                 | Owner                 | Branch                  | Status             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------- | ------------------ |
| B1  | Bottom slide-in sheet is broken/mispositioned on phone                                                                                                                                              | Account 2             | `fix/phone-shell`       | merged — releasing |
| B2  | Bottom navigation disappears after tapping "Something changed" (freshness)                                                                                                                          | Account 2             | `fix/phone-shell`       | merged — releasing |
| B3  | Coach composer: not single-line, press-to-talk glitchy and jumps the layout                                                                                                                         | Account 2             | `fix/phone-shell`       | merged — releasing |
| B4  | Back button doesn't close sheets/dialogs first; no "Discard changes?" or leave-page confirm with unsaved input                                                                                      | Account 2             | `fix/phone-shell`       | merged — releasing |
| B5  | Top bar: remove "What's new at …" line; move + (new chat) to top-right next to settings                                                                                                             | Account 2             | `fix/phone-shell`       | merged — releasing |
| B6  | Coach first view scrolls; suggestions too low; completed setup ("5 of 5") should collapse to a small chip                                                                                           | Account 2             | `fix/phone-shell`       | merged — releasing |
| B7  | No "Take photo" (camera) option — upload only                                                                                                                                                       | Account 2             | `fix/phone-shell`       | merged — releasing |
| B8  | My shop: pending/notification cards too thick; completed setup header too big; "customer page ready to share" / "Open customer page" text too large                                                 | Codex                 | `fix/shop-polish`       | merged — releasing |
| B9  | Google page repeats "simulation/simulated" — say it once, clearly, at the practice section                                                                                                          | Codex                 | `fix/shop-polish`       | merged — releasing |
| B10 | Recap shows "Written by AIOffline template" (labels run together)                                                                                                                                   | Codex                 | `fix/shop-polish`       | merged — releasing |
| B11 | Only opening hours — no closing hours (needs structured open/close per day, keep free-text fallback, `open_now`)                                                                                    | Codex                 | `fix/shop-polish`       | merged — releasing |
| B12 | Menu not grouped into categories (product `category` field in DB; compact category boxes on public page and My shop; coach/photo assign categories)                                                 | Codex                 | `fix/shop-polish`       | merged — releasing |
| B13 | Face scan untested on a real phone                                                                                                                                                                  | User test → Account 1 | —                       | open               |
| B14 | Reading a real POS/notebook photo (live Gemini) untested                                                                                                                                            | User test → Account 1 | —                       | open               |
| B15 | Camera upload untested on a real phone                                                                                                                                                              | User test → Account 1 | —                       | open               |
| B16 | No way to upload a document or picture from the coach — composer needs one attach button: Take photo, Photo library, Document (PDF/Excel/CSV) — routed to the photo pipeline or the import endpoint | Account 2             | `fix/phone-shell`       | open               |
| B17 | A photo's map location (EXIF GPS) is thrown away — read it before stripping, propose it as the shop's pin for the owner to confirm (never saved without review; GPS never stored in the image)      | Account 1             | `fix/photo-location`    | merged — releasing |
| B18 | Customer onboarding step 1/2: "Use my location" doesn't work on phone                                                                                                                               | Account 1             | `fix/customer-location` | merged — releasing |

## Parked until the freeze ends

- Launch video (`feat/demo-shops` @ `b4cefa8`).
- Seeding demo shops in production.
- Landing hero animation.
- Web Push.
