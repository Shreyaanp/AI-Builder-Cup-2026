# Owner tabs: Shop, Grow, You

Branch `feat/owner-tabs` (from main at `69e6e5e`, merged with `6944987`). Brief:
`docs/briefs/task-OWNER-TABS.md`. Theme untouched: same Chalkboard tokens, fonts and component
styles. Only structure, content and flow changed. Coach is unchanged, apart from one routing word
(see below).

## What changed

- **Bottom row: Coach · Shop · Grow · You.** Google and Privacy are no longer tabs. They are
  sub-pages (`screens/SubPage.tsx`) that keep their parent tab selected and have a "← Grow" /
  "← You" link. Phone Back returns to the parent tab instead of leaving the app.
  `Destination` gained `grow`, `you` and `PARENT_TAB`.
- **Shop** (`ShopTiles.tsx`): leads with **"This is your page"**: the customer-facing card with
  shared/not-shared status, one primary **Share page** (or **Turn on your page** when off), and
  "Customer page" for the link, QR and switch. After it come the pending card, then Menu (it
  reads **Services** for salons, tailors, repair and similar shops, by category), Sold out today,
  Shop details (hours, address), Photos (count; opens the Google guide's photos) and Messages. The
  "Still the same menu today?" check stays here. Tools moved to Grow. All existing sheets and
  editors are kept.
- **Grow** (`screens/GrowScreen.tsx`): every owner tool as a card with its live status. Prep plan
  and Close the day lead; Close the day comes first after 17:00. Then Orders, Plan tomorrow,
  **Rescue deals** ("n deals live", or the coach drafts one from `/rescue`), **Get on Google**
  ("n details missing" plus a progress bar; opens the guided flow), **Stamps & perks** (reward
  text and stamp count; opens the details editor), Weekly recap. **Payments & rides and POS have
  no card**: neither feature exists on main, and the brief says to hide them until it does.
- **You** (`screens/YouScreen.tsx`): profile row (shop initial, name, category, shop count), the
  **Verify it's you** card (opens the existing FaceDialog via `setFaceOpen`; FaceDialog and face
  code are untouched; it shows "Check pending" when a shop awaits review), Settings (Language,
  Look, Coach voice / read aloud), Your shops (switch, New shop), **Privacy & your data**
  (sub-page), Help (Take the tour, Install app), Sign out (Firebase only). The settings gear and
  popover are gone from the top bar.
- **Privacy sub-page**: agreement, delete face data, delete all my data. "Start check" moved to
  You's Verify card. A coach `verification_required` event now opens You instead of Privacy
  (`CoachScreen.tsx`, one word).
- Copy: `tabsCopy.ts`, all 15 locales.
- Tour: prep, close-day and orders spotlights are on Grow; the Google step spotlights the Grow card.

## Fixes found on the way

- Sub-pages clip horizontal overflow: the Google step's slide-in widened a phone's layout
  viewport to 428 px (axe "must not overflow" failed).
- The page card's buttons use `disableFocusRipple` (the theme draws the focus outline). Focus
  returns to them after a sheet closes, and the pulsing ripple never let animations settle.

## Tests

- Updated for the new names and places: phone-shell, myshop, v1, v1-a11y (now also Grow and
  You), settings-install, i18n, close-day, forecast, planning, sourcing, import, bugs-b8-b12,
  phone-regressions, stories (s1, s7, a11, a12, a8, s5…) and QA (`tamil()` now switches on You
  and returns to the tab it was on).
- New `tests/owner-tabs.spec.ts`: Shop, Grow, You and Privacy in light and dark, on phone and
  desktop, with axe, a no-overflow check, Back from the sub-pages, and Services wording.
  Screenshots: `docs/stories/tabs-{shop,grow,you,privacy}-{light,dark}[-desktop].png`.
- Results (local, offline fixtures):
  - lint, build, hook rules and prettier pass.
  - Backend: **643 passed**, 165 skipped.
  - QA (`test:qa`): **178/178** (74 + 104 in two runs; the 2 cold-start `goto` timeouts in the
    first run passed on re-run).
  - v1-a11y: **44/44**; owner-tabs and settings-install: **18/18**.
  - Full `test:ui` (3 workers, under heavy machine load): 380 passed, 37 failed. Every failure
    re-checked: tab-related ones were fixed and pass on re-run. The rest also fail on a clean
    origin/main worktree run the same way (new-shop-voice states/reconnect, B3 composer:
    VoiceStage's infinite orb keeps axe waiting, demo-flow share switch, flaky global-facts)
    or were load timeouts.

## UX review checklist

| #   | Item               | Result                                                                                                 |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | 3-second test      | Pass: Shop = "This is your page" + Share; Grow = tool cards; You = account and settings                |
| 2   | One primary action | Pass: Share page (Shop), Verify (You); Grow cards are equal entries by design                          |
| 3   | No TMI             | Pass: one-line statuses; privacy detail sits one level down                                            |
| 4   | Eye strain         | Pass: one tinted focal card on Shop; tokens unchanged; axe clean in both themes                        |
| 5   | States             | Pass: loading, error and no-shop reuse ShopGate (Shop and Grow); 0/1/many shops; long names wrap       |
| 6   | Personal           | Partial: Services vs Menu by category; evenings lead with Close the day; no owner name exists to greet |
| 7   | Motion             | Pass: existing enterRise; reduced motion respected (QA runs with reduce)                               |
| 8   | Reachability, Back | Pass: 48 px rows; Back closes sheets first, then leaves sub-pages to their tab                         |
| 9   | Story completeness | Pass: Grow → Google → back to Grow; You → Privacy → back; coach verify opens You                       |
| 10  | Languages          | Pass: Tamil QA (close day, Google, privacy, menu, sourcing) axe clean, no overflow                     |

## Follow-ups (not done here)

- `legal.ts` and `consentRights` still say "the Privacy tab". The legal text is versioned, so I
  left it for whoever owns consent versions: it should read "You → Privacy & your data".
- Frontdoors copy "share your page from My shop" should read "Shop".
- Payments & rides and Connect your POS cards: add them to `GrowScreen` once track P / the
  connect system lands (`Tile` with live status; no "coming soon").
- The Coach tab and its Today design are untouched, pending the owner's decision.
