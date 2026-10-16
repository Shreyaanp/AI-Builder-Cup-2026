# Account 2 status: passport + Today's 7 (`feat/passport`, merged as `merge/passport`)

## Rescue UI (`feat/rescue-ui`, pull request into `main`)

Branch from `a164b7e`, `origin/main` merged in at `b147f9f` (review pipeline). Reaches `main`
only through the pull request (`docs/REVIEW.md`). `CoachScreen.tsx`, `AppShell.tsx` and
`EditDialogs.tsx` are untouched.

| Part                                                                                                                                                                                                                                                                                                        | Commit    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Read side uses the owners' real deals: Today's 7 and the passport read the rescue store (derived demo fallback gone); collecting at the counter needs the customer's own chat hold and counts its savings; demo shops answer a hold                                                                         | `b3156c6` |
| Customer Rescue tab (`src/features/rescue/`): chalk map with pulsing pins (faster in the last 30 min), countdowns, "Hold one for me" through the signed-in shop chat (no payments), impact meter, holds collected by the counter QR                                                                         | `19f88c0` |
| Owner, calm (`src/features/owner/`): Rescue tile + sheet (`RescueTile.tsx`: quiet "Leftovers?" when idle, 20/30/50 % send, end early), Morning brief card (`MorningBrief.tsx`, up to 4 slides, hide for today), Asked nearby radar tile (`RadarTile.tsx`, banded counts only after 5 people, demo labelled) | `19f88c0` |
| S9 story (`tests/stories/s9-rescue.spec.ts`, `docs/stories/S9-*`): owner sends, customer holds in chat, collects at the counter; light + dark, axe on every screen                                                                                                                                          | `90207bd` |
| A hold message skips the AI instant answer (it quoted the listed, not the rescue, price): `instant_answer` flag, contract regenerated                                                                                                                                                                       | `db78b5c` |
| All rescue, brief and radar strings in 15 languages; struck-through price reads "Was ₹25" to screen readers                                                                                                                                                                                                 | `4c963ab` |

**Checks (15 Oct, after merging `origin/main`):** backend 607 passed / 165 skipped, ruff and mypy
clean; `tsc -b`, eslint (`src tests scripts`), Prettier and hook rules clean; S9 story 2 passed
(light, dark).

- **Full phone suite** (WEB_PORT=3446 API_PORT=3546, run alongside the QA suite): 202 passed,
  3 skipped, 3 failed, all passing on rerun: S2 voice step and B3 composer (`phone-shell:94`)
  timed out under the doubled load (B3 alone: 18.7 s of its 30 s); S8 step 3 had one
  `color-contrast` hit on the stamp moment, which passed light and dark on rerun (caught
  mid-animation). Watch S8/3 if it recurs: `StampMoment.tsx` changed for the leaf stamp.
- **QA suite** (WEB_PORT=3447 API_PORT=3547, fresh `.cache/qa`): 120 passed, 2 failed, then
  **122 passed**. `community.spec.ts:150` counted 4 customer tabs; it now expects 5 (Rescue) and
  checks that Rescue is translated too, except Filipino, which keeps the loanword "Rescue" as its
  passport stamp and quests do.

**Not run:** desktop project of the main suite, live Gemini brief, real-phone GPS. Plain
`npx eslint .` also lints the git-ignored local `docs/launch/source/dist` build (minified GSAP),
which is not part of the repo. Test runs rewrite `docs/stories`/`docs/qa` screenshots (random
shop numbers); I restored them, so the committed S9 shots are from `90207bd`/`db78b5c`.

**Next:** review per `docs/REVIEW.md` (impact comment, light/dark phone + desktop shots), then
`gh pr merge --squash --delete-branch`.

## Camera, map, Google Maps hand-off and a guided form inside the onboarding chat (`feat/onboarding-inchat`) — owner brief 16 Oct

Brief: `docs/briefs/task-ONBOARDING-INCHAT.md`. Branched from `feat/new-shop-flow` after PR #3
merged; `origin/main` merged in. Everything stays inside the voice-mode conversation; the mic keeps
running throughout.

- **Camera card** (`CameraCard.tsx`): when the coach asks for a photo (or the owner taps Photo) a
  viewfinder opens as a card in the conversation, never full screen: the coach's instruction over a
  guide frame ("Fit the whole price board in the frame"), shutter, retake, Use photo, and Upload as
  the fallback. Guided two shots: price board, then shopfront. The reason comes before the camera
  prompt; only video is requested, so the voice mic is untouched. Denied or no camera uses the
  voice-alert pattern (Try again / Upload instead / Close).
- **Map card** (`MapCard.tsx`, `PinMap.tsx`): a small map in the chat with a fixed centre pin (move
  the map under it: drag, pinch, wheel, arrow keys, +/-), "Use my current location", accuracy
  ("within 20 m") and the readable address under the pin (`GET /places/reverse`). "Bigger map"
  opens a full-screen map for careful placing. Google's map when a live browser key exists,
  otherwise OpenStreetMap tiles; offline it keeps a chalk grid and the pin still works. A pin the
  owner moved is saved as `pin_source: pin` (no fake GPS accuracy); an untouched fix stays `device`
  with its accuracy.
- **Google Maps hand-off** (`MapsHandoff.tsx`; on the ready moment and in My shop → details):
  Google's official Maps URL at the pin (`/maps/search/?api=1&query=lat,lng`), where the owner taps
  "Add a missing place". Google has no URL that prefills a new place's name or category, so name,
  category, address, phone and hours are one tap to copy. Says plainly "Not on Google yet" and that
  the owner submits it on Google; never claims we published.
- **Guided form** (`GuidedDetails.tsx`): one question per screen, big targets, Back/Next, progress
  and a step row to jump anywhere, smart defaults. New shop: name, kind, items with prices,
  location (the same map card), hours, phone, payment, delivery; reached by "Type it in instead" in
  the conversation header. Edit details in My shop uses the same journey (plus reward) instead of
  the long dialog. Nothing saves without the usual review.
- Copy: `inChatCopy.ts`, every string × 15 locales (typed `Record<Locale, …>`).

**Checks (16 Oct; ports 3449/3549, test backend on its own fresh data folder because another
session's live server on 3547 holds `backend/data/conversation-vectors`):** backend **643 passed /
165 skipped**, Ruff + mypy clean; ESLint (ignoring the untracked, gitignored `docs/launch/` GSAP
bundle), `tsc -b`, Prettier, hook rules pass. Browser, with the machine at 99% CPU from other
sessions: `tests/new-shop-inchat.spec.ts` passes on phone and desktop, light and dark (axe on
every state), apart from one screenshot timeout in a single run; `tests/new-shop.spec.ts` passes;
the S10 "type it in" and "entries" stories pass. The main S10 story passed every step across
runs (including the Maps hand-off link), but never all in one run: each run timed out somewhere
in the voice/orb steps. `tests/new-shop-voice.spec.ts` (not changed here) fails 8 tests on this
branch, and the same 8 fail in a clean `origin/main` worktree on the same machine at the same
time, so they are load or pre-existing, not this branch; worth a rerun on a quiet machine or CI.
Evidence:
`docs/stories/new-shop-camera-*.png`, `new-shop-map-*.png`, `new-shop-manual-*.png`, `S10-*.png`.

Two test fixes on resume: the hand-pin test dragged the map leftwards and then pressed ArrowLeft,
which cancel out (~4.5 m, under the 10 m "moved" threshold), so it now drags so both go west; S10
expected `77.641235` for the 6-decimal pin, but `77.6412345` is stored as `77.64123449…`, so the
link correctly reads `77.641234`.

**Not validated:** a real phone camera and GPS (Playwright uses a fake camera and a set location),
the live Google map engine (no live browser key here), Google's "Add a missing place" form itself,
native-speaker review of the new strings.

## New-shop onboarding as "voice mode" (`feat/new-shop-flow`, PR #3) — owner brief 16 Oct ~02:00

Brief: `docs/briefs/task-VOICE-MODE-ONBOARDING.md`; design and behaviour in `docs/OWNER-NEW-SHOP.md`.

- **Voice mode** (`NewShopFlow.tsx` `Journey` + new `VoiceStage.tsx`): after the hero, one open
  conversation with the mic always on (pause, never auto-off). Phone first (390×844): shop card →
  conversation (scrolls, content height) → stage (chalk orb + live captions of both sides, fills
  the rest so there is no dead space; the orb shrinks as the chat grows) → quick actions → call
  controls (keyboard, mic pause `aria-pressed`, mute, End voice). Desktop: conversation | stage |
  shop card. The orb reacts to real audio levels (mic analyser, coach playback bus) per frame via
  a CSS variable: listening mint, thinking lilac, speaking sunflower, (re)connecting sky,
  paused/typing quiet; reduced motion keeps colour/shape only. The shop card's places (products
  with prices, location, hours, payment, delivery, other facts) start as dashed outlines and
  stamp in as answers arrive.
- **Voice never silently dies** (`useVoice.ts` conversation mode): mic, audio context and meters
  live for the whole conversation; any socket end reconnects to the same `session_id` with the mic
  open (at once after SESSION_TIMEOUT/idle, backoff 0.5–4 s after failures, 4 tries); turns sent
  while reconnecting wait for the session instead of opening a competing text stream. Backend
  (`voice.py`): new-shop sockets get the full 150 s window (under Cloud Run's 180 s), 40 model calls
  and 40 text turns (press-to-talk keeps 8/12); run-lease TTL follows the 150 s cap.
- **Alerts** (`VoiceAlert`, in the page, dismissible): mic blocked (refused, or already "denied"
  before any socket) with lock icon → Microphone → Allow, Try again / Type instead; no mic;
  connection lost after retries (Reconnect); rate limited (live countdown); voice unavailable
  (carry on typing). 22 new strings × 15 locales (`voiceModeCopy.ts`, Hindi coach feminine).
- **S10 phone failure fixed at the cause:** the story granted only geolocation, which leaves the
  microphone "denied" for the page, so the (correct) preflight reported a blocked mic. It now
  grants the microphone for its stand-in mic and asserts the new controls.

**Checks (16 Oct, fresh SQLite DBs; ports 3449/3549 and QA 3448/3548 because a live Gemini server
from another session holds 3547):** backend **636 passed / 164 skipped**, Ruff + mypy clean; ESLint
(repo, ignoring another session's untracked `tests/zz-mic-probe.mjs`), build, hook rules pass. New
`tests/new-shop-voice.spec.ts` + `tests/new-shop.spec.ts` + S10: **49 passed / 17 skipped (phone-only
language cases on desktop), 0 failed**. Full browser suite: **371 passed / 99 skipped / 8 failed**
under load from other sessions; rerun in isolation everything passes except
`s8-passport` step 4 ("Quests 1 of 3" count 2), which touches no changed file. QA (`npm run test:qa`,
fresh `.cache/qa`): **174 passed / 2 failed**, both `voice-continuity` "mic waits for saved
conversation restoration" — it expects the coach mic disabled while restoring, which commit
`a067256` on this branch (before this task) changed on purpose; not touched here, needs an owner
call. Evidence: `docs/stories/new-shop-{1-hero,2-listening,3-thinking,4-speaking,5-reconnecting,
6-mic-blocked,7-typing,8-review,9-ready}-{light,dark}[-desktop].png` (old `2-chat/3-review/4-ready`
removed), `docs/stories/S10-*.png`. Viewed in a real browser (Chrome via Playwright) at every state,
phone and desktop, light and dark.

**Not validated:** real Gemini Live turn-taking and its own session end, real microphone levels and
echo on a physical phone, native-speaker review of the new strings.

## New-shop flow (`feat/new-shop-flow`, PR #3) — owner answers of 15 Oct

Built from the six owner answers (brief: PLAN-V2 §New-shop onboarding; details in
`docs/OWNER-NEW-SHOP.md`). `origin/wip/new-shop-grand` merged first; kept: GPS shop pins with
accuracy, the location reason/denial handling, the sealed one-review approval, the ready moment,
coach fixes (photo abort, keyboard-resize scroll). Replaced: the stepped coach page, the step
banner, the review portal and the "Fill in a form instead" path.

| Owner answer                           | Built                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Kill the modals                     | "Add my shop" form dialog gone for new shops (the form stays only as **Edit details**); tour end, "+", shop menu, empty My shop, Google empty all open the flow; no dialog/sheet anywhere in it (tests assert `dialog` count 0).                                                                                                                                      |
| 2. Big hero, then chat                 | Full-screen "Let’s open your shop" hero: chalk-drawn shop (stroke draw), written title, sparkles via `useChalkTimeline` (off with reduced motion), then a full-screen conversation.                                                                                                                                                                                   |
| 3. AI speaks first                     | One Gemini Live session (`useVoice` conversation mode): opening sent once the mic is granted, coach greets aloud, mic opens after the greeting; mute button, mic toggle, live captions bar. No mic → same chat by text, replies read by `/tts`.                                                                                                                       |
| 4. Entry points                        | Header "+" (direct, next to settings), tour "Start my own shop", empty My shop "Create your shop". First run after sign-in is main's (start card), not auto-entered.                                                                                                                                                                                                  |
| 5. Agent drives; acts in chat; silence | One question at a time; every proposal is an action card in the chat ("Added to your shop · Shop name: …", "I read your menu: N items", "Saved your location: Near …"); ~9 s silence (or Skip) → coach suggests/leaves it out and moves on (max 2 in a row); live "Your shop so far" card; full-screen review page with one "Open my shop"; full-screen ready moment. |
| 6. Must not break                      | Main coach voice/photo/document, Import, Close the day: their suites pass unchanged.                                                                                                                                                                                                                                                                                  |

Backend (small): `NEW_SHOP_INSTRUCTION` speak-first/silence rules; offline fixture greets first and
remembers skipped questions; voice socket accepts a mid-session `new_shop` draft frame. Removed
`tests/zz-live-owner.spec.ts` (main had already removed it; it needs private photos).

**Checks (fresh SQLite DBs, WEB_PORT=3447 API_PORT=3547):** backend 620 passed / 164 skipped,
Ruff + mypy clean; lint (ESLint over the repo, ignoring the untracked local `docs/launch/source/dist`
build output), build and hook rules pass; full browser suite phone + desktop **348 passed / 84
skipped / 0 failed**; QA suite (`npm run test:qa`, fresh `.cache/qa`) **122 passed**. New:
`tests/stories/s10-new-shop.spec.ts` (hero → greeting → answer → action → silence → location +
photo → review → ready; entries from tour end and empty My shop), `tests/new-shop.spec.ts` (axe
light/dark on phone and desktop, photo, location, denial, Back, separate drafts). Screenshots:
`docs/stories/S10-*.png`, `docs/stories/new-shop-{1-hero,2-chat,3-review,4-ready}-{light,dark}[-desktop].png`.
New strings in all 15 locales (`newShopCopy.ts`).

**Not validated:** real Gemini Live greeting/turn-taking, ASR, speaker echo on a real phone, live
coaching quality, native-speaker review of the new translations.

## Erase hardening (`fix/erase-hardening`, 15 Oct evening; owner rule: no new features)

"Delete all my data" returned 500 in production (face worker, then a GCS 403). Now:

- **Backend** (`backend/app/erasure.py`, route `DELETE /api/v1/me/data`): seven steps (face,
  photos, records, gallery, community, memory, conversations) each run on their own with logging
  (`erase_step_failed`, `erase_finished`). Response: `status` `erased` | `partial`, `erased`,
  `pending`, `retry_saved` and the counts. Never a bare 500.
- **Retry queue**: failed steps are saved per owner (community documents, kind `erase_pending`)
  with the shop IDs they still need, so gallery/community copies are finished even after the shop
  records are gone. Retried on Try again (same DELETE, all steps) and quietly in the background on
  the owner's next `GET /me` (pending steps only, remembered shops only, never `records` — a shop
  saved since must not vanish without a new request). `GET /me` returns `erase_pending`.
- **Privacy screen**: progress bar + "Deleting your data…", success "All your data was deleted.
  Restarting…", partial warning naming what is pending (localized step names) with Try again,
  network failure with Try again; 15 locales; Try again sits under the text (long Tamil copy).
- **Tests**: `backend/tests/test_erasure.py` (face worker down, storage 403, Firestore error on
  records, pending list not saved, conversation delete failing, background retry spares a new
  shop); `tests/qa/privacy.spec.ts` (progress + success and partial + Try again, light and dark,
  phone and desktop, axe via `audit`; network failure).

**Checks (fresh SQLite DBs, WEB_PORT=3447 API_PORT=3547):** backend 614 passed / 164 skipped
(ruff, mypy clean); phone suite 200 passed / 6 skipped / 0 failed; QA suite (fresh `.cache/qa`)
132 passed. `tsc -b` and ESLint clean; contract regenerated. **Not run:** desktop project of the
main suite, a live erase against production GCS/Firestore/face worker.

## Merge follow-up (`merge/passport`, on the calmer shop page `fe27b92`)

Push only `origin/merge/passport`. The 31 phone failures after the merge were all the stamp/QR
flow; decided per case:

| Case                                                                                 | Decision                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?source=qr` without `k` (B31, rewards, translated cards): stamp card region missing | **Regression, product fixed.** A bare QR link opened the stamp moment with an empty key; its failing dialog hid the page (and the Stamp card region) behind a modal. Only a signed QR (`?source=qr&k=…`) opens the moment now; older unsigned posters keep counting on the phone card, as before. |
| S3 step 7 (owner's QR)                                                               | **Intended change, test updated.** `shareSigned()` in `tests/stories/support.ts` takes the key the owner's QR screen fetches (`/businesses/{id}/qr-key`) and scans `?source=qr&k=…`; the step clears the stamp moment, then checks the card.                                                      |
| Signed-in customer's card said "stored on this phone"                                | **Bug, product fixed.** The card is the server's for signed-in customers: "This card is saved to your account." (card + redeem screen, 15 locales, `rewards/cardCopy.ts`). Signed-out wording unchanged.                                                                                          |
| Signed-out second scan the same day showed "First try! +50" again                    | **Bug, product fixed.** `POST /public/passport/check` takes the phone's `receipts` and replays them before judging the scan (already today, first visit, daily cap, level); nothing stored. Contract regenerated; backend test added.                                                             |

Also: S8 passport story (`tests/stories/s8-passport.spec.ts`, screenshots `docs/stories/S8-*`):
owner seeds a shop at its own pin → Today's 7 near it → Go → shop → signed QR → stamp moment →
Passport (level, weekly streak, stamp book, quests) → honest second scan. Runs in light and in
dark (`niva.starter.preferences {appearance:'dark'}`) with a WCAG 2 A/AA axe pass on every screen;
no violations. Shop header wraps before the floating theme button; no leading "·" when a shop has
no hours; stamp moment's points line is a paragraph, not a second h2. QA `shop-details` read a
hard-coded web port 3437; it now uses `WEB_PORT`.

**Checks (fresh SQLite DBs, WEB_PORT=3447 API_PORT=3547):** backend 573 passed / 136 skipped;
full phone suite 200 passed / 6 skipped / 0 failed; QA suite (`npm run test:qa`, fresh `.cache/qa`) 122 passed. **Not run:** desktop project of the main suite, live Google sign-in, real-phone GPS.

**Brief:** PLAN-V2 §customer + `docs/research/customer.md` §2.2, §3. **Branch:** `feat/passport`
from `origin/main` at `3f29084`. Push only `origin/feat/passport`. Ports: web 3447, API 3547,
Firestore emulator 8567 (start: `java -Duser.language=en -cp <gcloud>/platform/cloud-firestore-emulator/cloud-firestore-emulator.jar com.google.cloud.datastore.emulator.firestore.CloudFirestore start --host=127.0.0.1 --port=8567`, Java 21 JRE under `%LOCALAPPDATA%\AIBuilderCupTools\java21`).

## Progress

| Step                                                                                                    | State | Commit                        |
| ------------------------------------------------------------------------------------------------------- | ----- | ----------------------------- |
| 1. Passport backend (`passport.py`, `passport_routes.py`, `rescue_feed.py`) + tests (SQLite + emulator) | done  | `07fc109`, demo QR relax `+1` |
| 2. Today's 7 backend (`today.py`) + tests                                                               | done  | `ab425ac`                     |
| 3. Merge `Chalkboard theme` (41f65fb) from origin/main                                                  | done  | `a9d8725`                     |
| 4. UI: Passport tab, stamp moment, Today's 7 deck, server stamp cards, owner QR key, 15 locales         | done  | see `git log`                 |

**Checks run:** backend 568 passed / 136 skipped (SQLite); passport + Today 45 passed on the
emulator; `tsc -b`, ESLint clean on changed files; QA "customer navigation in 15 languages"
passes phone + desktop with the 4-tab nav. Screenshots checked at 390×844 (Today, passport,
stamp moment). **Not run:** full `npm run check`, axe, the whole QA matrix, Firestore indexes for
new kinds (they use equality/key lookups only), real-phone GPS.

**Open / next:** weather (Open-Meteo), Wikipedia "history" and busiest-hour cards not built;
rescue endpoint not on main yet (adapter falls back to labelled demo rescues); owner perk picker UI
not built (API `GET/PUT /businesses/{id}/perks` exists; demo shops have fixed demo perks); the
Rescue tab of nav option A is left to the rescue UI owner; story walkthrough test for the passport
still to write. Local review: `MERCHANT_DATABASE=data/passport-merchant.sqlite3
DEMO_WORLD_ENABLED=true WEB_PORT=3447 API_PORT=3547 node scripts/backend-dev.mjs` + `npx vite`.

## Resume notes

- **Passport rules** (`backend/app/passport.py`): pure functions over one `PassportState` doc per
  customer (`Documents` kind `passport`, edited atomically). QR key = HMAC of the session signing
  secret (`qr_key`); owner gets it at `GET /businesses/{id}/qr-key`, demo shops publicly at
  `GET /public/shops/{id}/demo-qr`. Demo shop IDs (`demo-*`, generated `demo-w-*`) earn
  `demo_points`; levels use real + demo total, labelled in UI.
- **Signed-out**: `POST /public/passport/check` returns a signed receipt (nothing stored);
  `POST /public/passport/preview` draws the passport from receipts; `POST /customer/passport/merge`
  applies each receipt once ever (`receipt` docs).
- **Rescue**: `rescue_feed.live_rescues` calls Codex's `GET /api/v1/public/rescue` in-process if
  that route exists (lenient `parse_deal`), else derives labelled demo rescues from demo shops'
  closing time. Owner "Collected" tap: call `passport_routes.award_rescue(request, uid, bid, id)`.
- Tips: moderation pass → pencil stamp (`award_tip` in `community_routes.add_tip`); helpful marks
  `POST /customer/shops/{id}/tips/{tip}/helpful`; `Tip.helpful` count added.

---

## Earlier work (previous status)

**Brief:** `docs/handoff/account2-customer.md` · **Audit gap:** A5 · **Story:** STORIES.md (Oct 15
customer decisions).
**Branch:** `feat/customer-chat`, from `origin/main` at `cf63808`. Pushed to
`origin/feat/customer-chat` only. The previous status (sourcing, S4) is in git history at
`432933c`.

**Status: done.** The customer story works end to end on a phone (390×844-class Pixel 7
emulation), in local auth mode with the offline AI. Live Google sign-in and live Gemini moderation
were **not** run; see "Not verified" below.

## Follow-up: QA fixes (`feat/customer-qa`, from `origin/main` at `fe69b03`)

Fixes the customer/community findings in `docs/qa/QA-REPORT.md`: **Q2, Q3, Q4, Q5, Q9, Q10, Q11**,
plus the open 50-conversation cap race noted below. Q8 (legacy anonymous inquiry route) was left
alone, as agreed; its regression is still a strict `xfail`. Pushed to `origin/feat/customer-qa`
only.

| Commit    | What                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `48fa21e` | Q10 + cap race: a per-customer `threadslots` document, changed atomically, picks the single creator of a shop thread and enforces `MAX_THREADS`. Q9: owner erasure calls `Community.erase_shop`.               |
| `eb92d6d` | Q2: `copy.ts` holds the English source; `copyLocales.ts` has full translations for all 14 other locales (`useAccountCopy()`). Q3/Q4/Q5: errors with Try again. Q11: the hidden chat label no longer overflows. |
| `1fd6cec` | QA browser cases for Q2–Q5 and Q11 assert the fixed behaviour and the recovery path.                                                                                                                           |
| `a2f95b7` | New QA case: customer navigation and Saved in all 15 languages; refreshed Q2–Q5 screenshots.                                                                                                                   |

**How Q10 and the cap work.** `start_thread` still takes the fast path when the customer already
has a thread with the shop. Otherwise it calls `Community.reserve_thread`, which updates one
document per customer (`threadslots`, `{shops: {bid: {iid} | {claim, at}}}`) through
`Documents.update`. That is a Firestore transaction, or `BEGIN IMMEDIATE` on SQLite. The update
returns one of three answers:

- `existing`: post to that thread.
- `mine`: create the inquiry, then `add_thread` fills the slot with its ID.
- `wait`: another request holds a fresh claim. Poll every 0.1 s for up to 15 s, then continue its thread.

A new shop over 50 slots gets a 409 inside the transaction, so two instances can never reach 51.
A start that fails releases its claim, and a claim older than 30 s can be taken over. A customer
with no slot document yet has one seeded from their existing threads. `drop_thread` now takes the
shop ID so it frees the slot, and the Chats list drops entries whose inquiry is gone (erased shop)
before checking whether the shop is shared. No new Firestore index is needed: `delete_scope` uses
an equality-only query.

**Results**

- Backend, SQLite: **526 passed, 119 skipped, 1 xfailed (Q8)**. Emulator (`127.0.0.1:8557`,
  Java 21 JRE at `%LOCALAPPDATA%\AIBuilderCupTools\java21\jdk-21.0.12.1+1-jre`): **608 passed,
  37 skipped, 1 xfailed (Q8)**. `ruff check`, `ruff format --check` and `mypy app` are clean.
- `tsc -b --noEmit`, ESLint and Prettier on the changed files are clean.
- QA browser matrix: another worktree held 3437/3537, so I ran the QA specs from an uncommitted
  wrapper config against private servers on 3447/3547. Result: **115 passed, 3 failed**. Every
  Q2–Q5/Q11 case passed on phone and desktop. Two of the failures are `shop-details.spec.ts:4`
  asserting the share link's port is `3437`, so they come from the alternate port. The third was an
  intermittent Tamil 125% desktop overflow in owner Shop details (Q14 family), which passed 4/4 on
  rerun.
- Not verified: translation quality by native speakers. The strings are my own translations, and
  plural rules are simplified to a `One` variant plus `{n}`.

## Follow-up: Firestore (`feat/customer-firestore`, from `feat/customer-chat`)

Customer accounts now run, and are tested, on Firestore as well as SQLite. Pushed to
`origin/feat/customer-firestore` only.

| Commit    | What                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `935ac70` | `community.py` fixes for Firestore (below), `firestore.indexes.json`, and `test_community.py` running every customer test on SQLite and the emulator, plus seven new storage tests.        |
| `93914ba` | `test_customer.py` and `test_threads.py` route tests also run against the emulator (`owner_of` helper replaces two SQLite-only lookups).                                                   |
| `988257f` | The two-instance test sends paired simultaneous edits, as a person's two devices would.                                                                                                    |
| `8d56db5` | Browser tests use the configured `baseURL`; `backend-dev.mjs` sets `CUSTOMER_ORIGIN` from `WEB_PORT`; S3 and S7 updated for the Ask home and sign-in to chat; S3/S7 screenshots refreshed. |

**Differences found and fixed**

1. **Reserved product names broke the updates feed.** The snapshot stored products as a map keyed
   by name, and Firestore rejects field names like `__x__` (400), so Follow and the feed would have
   failed for such a shop. Snapshots now store a list; older map snapshots are still read.
2. **Lost updates across Cloud Run instances.** Profile edits (follow, preferences, searches,
   name), `mark_seen` and the snapshot swap were read-modify-write behind a per-process lock.
   Two instances (or two devices) could overwrite each other. They now use `Documents.update`: a
   Firestore transaction (10 attempts), or `BEGIN IMMEDIATE` in SQLite. A process lock still
   serialises edits within one instance. `mark_seen` no longer brings back a deleted conversation.
3. **Ordering past 500 documents, and read cost.** Scoped lists read up to 500 documents per query
   and sorted in memory. Past 500 the newest could be missing, and every feed call read up to 500
   documents per shop. They now query `scope == x ORDER BY created DESC LIMIT n`.
4. **Duplicate demo updates.** Concurrent first looks seeded random-ID demo updates twice. Demo
   updates now have fixed IDs per week (`demo-<week>-<n>`), keyed per shop.

**Composite indexes (needed in production):** `firestore.indexes.json` at the repo root, all
`scope ASC, created DESC` on the `thread`, `update` and `tip` collection groups. Until they are
built, `FirestoreDocuments.scoped` logs `community_index_missing` and falls back to the old
equality-only query, so nothing breaks. The repo has no `firebase.json`, so create them per
group:

```
gcloud firestore indexes composite create --project=ichiropractic --collection-group=thread --query-scope=COLLECTION --field-config=field-path=scope,order=ascending --field-config=field-path=created,order=descending
```

(repeat with `update` and `tip`). I did **not** create them in the cloud project.

**Results**

- Emulator: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8547` (port 8547, so it doesn't collide with a
  shared 8085), with Java 21 from `%LOCALAPPDATA%\AIBuilderCupTools\java21`.
- Full backend `pytest` against the emulator: **570 passed, 37 skipped**. `ruff check`,
  `ruff format --check` and `mypy app` are clean.
- `test_community.py`: 29 tests (28 pass and 1 skips on SQLite only). Run against the old
  `community.py`, 7 of the new storage tests fail, which shows they catch the bugs.
- The emulator settles lock conflicts by timing out, while production aborts the younger
  transaction at once. A burst of 8 simultaneous edits to one profile could therefore run out of
  retries on the emulator, so the test uses two devices editing at once, over three rounds.
- Full phone browser suite on `WEB_PORT=3447`, `API_PORT=3547`: **177 passed, 3 skipped,
  1 failed**. The failure is `discover:59` (my local Singapore demo seed, below). All eight
  port-3200 failures are fixed.
- ~~Not done: the 50-conversation cap was a count-then-write.~~ Fixed on `feat/customer-qa` (above).

## Commits

| Commit    | What                                                                                                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `62fed86` | Backend: `community.py` (profiles, owned threads, follows, update feed, tips, document store with SQLite and Firestore adapters), `community_routes.py`, the customer auth cookie, personalised `/discover/ask`, pytest.                              |
| `88a8bf0` | Customer app: **Ask · Chats · Saved** bottom navigation, Google sign-in sheet, chat list and thread, Saved (following and updates), tips, profile sheet, motion CSS, regenerated contract.                                                            |
| `249ce26` | Wiring: the For you group and the "Remembered" chip in Ask; Follow and Tips on the shop page; the shop chat's "Ask the owner" now signs in and opens the thread in Chats.                                                                             |
| `c8cfbf4` | Owner Messages shows neighbour tips (average and demo labels).                                                                                                                                                                                        |
| `9610b06` | Phone story test and screenshots `C-1..7`. Demo replies now understand plurals and show prices with their decimals. The owner inbox preview shows the person's last words. The customer tests use sign-in and the worktree's own port. Two axe fixes. |

## How it works

**1. Sign-in to chat (A5)**

- Browsing, Ask and the shop's instant answers stay anonymous.
- Messaging an owner, following across devices and posting tips need Google sign-in:
  - Firebase is used when `/config` says `auth_mode: firebase`, through the same lazy Firebase
    SDK as the owner app;
  - in local and test mode, an explicit signed `customer` cookie stands in for it
    (`POST /customer/session`, which returns 404 when Firebase is on).
- The server checks every request:
  - a customer thread is an ordinary shop inquiry, and `community.py` records which customer
    owns it together with its capability token;
  - the token never reaches the browser;
  - another customer's thread returns 404.
- Anonymous threads created before this change stay readable on the device that has them
  (`CustomerConversation`). New ones need sign-in.

**2. Chats**

- **List:** shop art or photo, last message, time, unread badge, and a Demo shop chip. The Chats
  tab carries the total unread count.
- **Thread:**
  - full screen like WhatsApp, with the shop in the header (a shared-element avatar morph from
    the list);
  - bubbles grouped by author, a send animation and a "Sending…/Delivered/Not sent, tap to retry"
    state;
  - a typing indicator for demo shops, and "Sent. The owner replies here…" for real ones.
- **Labels:** an **AI instant answer** (dashed bubble, "From the shop's listed facts") is posted
  when the shop's facts answer the question. Owner replies are labelled Owner. Demo shops
  (`demo-*` IDs) reply automatically after about 2.5 s with a **Demo reply · Automatic: this is
  a sample shop** that names the item asked about, says if it is sold out, or gives the hours.
- **Live updates:** owner replies arrive over the existing thread signal SSE
  (`…/threads/{id}/stream`), with 5 s polling when the stream fails. Owner close or block shows
  "This conversation is closed."
- **One thread per shop:** starting again continues the same thread.

**3. Follow and the updates feed**

- **Follow:**
  - the button sits on the shop page and on Ask cards;
  - signed in, follows are stored on the server; signed out, they live in `localStorage` and
    merge into the account on sign-in.
- **The feed** (`GET /public/updates?shops=…`) comes from real shop data:
  - each read compares a snapshot of the public shop with the last one, producing price
    drop or new price, back in stock, new item, and menu confirmed today;
  - demo shops also get seeded updates, labelled **Demo update**.
- **Saved** shows a Following row and the Updates feed:
  - the cards stagger in;
  - tapping one uses a view transition into the shop.

**4. Personalisation**

- Ask stores only first-person statements:
  - "I'm vegetarian", "I only eat halal", "my budget is under ₹100", "reply in Hindi";
  - a search for "veg biryani" is not a preference.
- It also keeps recent searches and follows.
- `/discover/ask` boosts matching shops and adds a **For you** group, with a reason on each card
  ("You follow this shop", "Vegetarian options", "Within your budget").
- A "Remembered: …" chip opens the profile sheet, which lists everything stored and clears
  preferences and searches in one tap.

**5. Neighbour tips**

- Up to 280 characters with an optional 1–5 star rating; one tip per customer per shop.
- Moderation:
  - a basic filter always runs (abuse words in English and Hindi, links, phone numbers);
  - Gemini safety runs on top when live, and the tip is refused (503) if that check fails.
- Demo shops get two seeded tips, labelled **Demo tip**.
- The owner sees tips under Messages.

**Motion:**

- M3 emphasized easing for rise, send, receive, pop, typing dots and the nav indicator, plus view
  transitions between screens.
- Everything turns off under `prefers-reduced-motion`; a test checks that no animation is running.

## Decisions I made

1. **Customer data sits beside the merchant store** (`community.py`, with its own small document
   store), so the owner data model and digests are unchanged.
2. **Threads reuse inquiries.** The owner inbox, block, close and translation work unchanged. The
   customer's Google name and email become the inquiry's name and contact.
3. **The demo reply is scheduled in-process** (an asyncio task that holds its own reference). If a
   scaled-to-zero instance drops it, the thread simply has no demo reply; nothing breaks. The
   sourcing flow's lazy-on-read approach would be more robust on Cloud Run, if that is needed.
4. **Copy is English only** (`src/features/customer/copy.ts`). Other locales fall back to it.
5. **The owner inbox preview** shows the latest message from a person, not the AI's instant
   answer.
6. **Small out-of-scope fix:** the shop page's "Good to know" chip row scrolls sideways, so it
   needed `tabIndex={0}` to pass axe (`scrollable-region-focusable`).

## Tests

- **Backend:**
  - `pytest` **485 passed**, 94 skipped (Firestore emulator);
  - `ruff check`, `ruff format --check` and `mypy app` are clean;
  - `tests/test_community.py` has 10 tests: the sign-in gate, owned threads with the AI answer and
    the labelled demo reply, ownership across customers, the follow feed detecting real changes,
    moderated and seeded tips that the owner sees, stated preferences, personalised ask, the
    SQLite document scope, and demo-reply plurals.
- **Frontend:** `tsc -b`, eslint and Prettier are clean on the changed code.
- **Browser (phone):**
  - `tests/customer-chat.spec.ts` covers the whole story with axe on every screen, plus reduced
    motion and personalisation (3 tests);
  - `tests/customer.spec.ts` was rewritten for the signed-in flow: live two-way chat with the
    owner, error recovery, polling fallback and block. It also stopped hard-coding port 3200.
  - Both pass on phone and desktop. Full phone suite: see "Full suite" below.
- **Setup:** the story test needs the Singapore demo shops in the dev database. It skips with a
  hint when they are missing:

  ```
  cd backend && uv run python -m scripts.seed_demo_shops --sqlite data/merchant.sqlite3 --city singapore
  ```

## Full suite

Full phone suite on my own ports (`WEB_PORT=3447`, `API_PORT=3547`): **11 failed**, none in the
customer chat code. My capture cut off the pass/skip totals line.

- **Hard-coded `http://127.0.0.1:3200` (8)**, so they reach another session's server or nothing:
  `demo-flow:28`, `i18n:80`, `stories/s1`, `s2`, `s3`, `s7`, `v1:172`, and the network allow-list
  in `starter:83`. **Fixed in `8d56db5`.** All eight pass. i18n, s1, s2 and v1 only needed the
  dev backend's `CUSTOMER_ORIGIN`. s3 and s7 also had stale steps (`/explore/` is now the Ask
  home, and messaging the owner needs sign-in). `frontdoors.spec.ts` keeps `127.0.0.1:3200` only as
  sample input to the pure `resolveApp` host check.
- **`discover:59` (open now → "No matches")**: caused by my local seeding of the Singapore demo
  shops, because the demo bakery is open now. `demo-shops.spec.ts` keeps demo shops out of the
  shared dev database on purpose, so run the story test against its own database or unseed after.
- **`myshop:120` (B27 tile grid)**: the known parallel-load timing flake from the last status.
- **`story-page-recovery:6`**: stale on main since `/explore/` became the Ask home (`45be345`).
  **Fixed** here, and it now passes.

`tests/customer-chat.spec.ts` (3 tests) and `tests/customer.spec.ts` (10 tests, phone and
desktop) pass.

## Not verified (needs a person or a key)

- Real Google sign-in through Firebase in a hosted build. The code path is the owner app's.
- Gemini safety moderation of tips: only the basic filter and the fixture path ran.
- `FirestoreDocuments` against a real Firestore database: it ran on the emulator only (see
  "Follow-up: Firestore"). The composite indexes still need creating in the cloud project.
- A real phone. The screenshots come from Chrome with Pixel 7 emulation.

## Screenshots (`docs/stories/`, phone, en-SG, offline AI)

- `C-1-ask.png`: Ask with the Ask · Chats · Saved bar.
- `C-2-results.png`: curated results, with the demo bakery first and a Follow button on the card.
- `C-3-shop-followed.png`: the shop page after Follow, signed out (saved on this device).
- `C-4-sign-in.png`: "Ask the owner" asks for Google sign-in and explains why.
- `C-5-thread-demo-reply.png`: the thread, with the AI instant answer then the labelled demo reply.
- `C-6-chats.png`: Chats with the thread, Demo shop chip and last message.
- `C-7-saved-updates.png`: Saved, with the Following row and the Demo update feed.
- `C-8-for-you.png`, `C-9-profile.png`: "Remembered: Vegetarian", the For you group and the
  profile sheet.

## Demo script (phone, 390×844)

1. Open `/explore/`. Ask **"croissant in Tiong Bahru"**. The thinking motion plays, then
   Crumb & Courtyard Bakery (Demo) is the best match.
2. Tap the card. The shop opens with a shared-element transition. Tap **Follow**: signed out, it
   is saved on this device.
3. Tap **Chat with the shop → Hours** for an instant answer with no account.
4. Tap **Ask the owner**. The sheet explains why sign-in is needed; tap **Continue with Google**.
   Type "Do you have butter croissants this afternoon?" and tap **Send message**.
5. The thread opens in Chats: an **AI instant answer**, the typing dots, then the **Demo reply**
   ("Yes, Butter croissant is on today (SGD 4.50 per piece)…").
6. Tap Back: **Chats** lists the thread. Tap **Saved**: the bakery is under Following, and the
   feed shows Menu checked today, Price drop, Back in stock and New on the menu, all labelled Demo
   update.
7. Back on **Ask**, say **"I'm vegetarian, croissant in Tiong Bahru"**. The chip shows "Remembered:
   Vegetarian" and a **For you** group appears. Tap **Manage** to see and clear what is stored.
8. On the shop page, scroll to **Neighbour tips**, post a tip with a rating, then open the owner
   app's **Messages** to see it with the demo tips.

## Resume steps

```
git fetch origin && git switch feat/customer-chat && git pull
cd backend && uv run python -m scripts.seed_demo_shops --sqlite data/merchant.sqlite3 --city singapore
cd backend && uv run pytest tests/test_community.py -q
$env:WEB_PORT='3447'; $env:API_PORT='3547'
npx playwright test tests/customer-chat.spec.ts tests/customer.spec.ts --project=phone
```

Next, if wanted:

- customer copy in the other locales;
- push notifications for owner replies (the unread badge only updates in the app);
- make the demo reply lazy-on-read like the supplier replies, for Cloud Run;
- create the three composite indexes in the cloud project (`firestore.indexes.json`).
