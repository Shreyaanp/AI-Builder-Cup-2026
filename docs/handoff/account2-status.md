# Account 2 status: passport + Today's 7 (`feat/passport`, merged as `merge/passport`)

## New-shop flow (`feat/new-shop-flow`, PR #3) — owner answers of 15 Oct

Built from the six owner answers (brief: PLAN-V2 §New-shop onboarding; details in
`docs/OWNER-NEW-SHOP.md`). `origin/wip/new-shop-grand` merged first; kept: GPS shop pins with
accuracy, the location reason/denial handling, the sealed one-review approval, the ready moment,
coach fixes (photo abort, keyboard-resize scroll). Replaced: the stepped coach page, the step
banner, the review portal and the "Fill in a form instead" path.

| Owner answer | Built |
| --- | --- |
| 1. Kill the modals | "Add my shop" form dialog gone for new shops (the form stays only as **Edit details**); tour end, "+", shop menu, empty My shop, Google empty all open the flow; no dialog/sheet anywhere in it (tests assert `dialog` count 0). |
| 2. Big hero, then chat | Full-screen "Let’s open your shop" hero: chalk-drawn shop (stroke draw), written title, sparkles via `useChalkTimeline` (off with reduced motion), then a full-screen conversation. |
| 3. AI speaks first | One Gemini Live session (`useVoice` conversation mode): opening sent once the mic is granted, coach greets aloud, mic opens after the greeting; mute button, mic toggle, live captions bar. No mic → same chat by text, replies read by `/tts`. |
| 4. Entry points | Header "+" (direct, next to settings), tour "Start my own shop", empty My shop "Create your shop". First run after sign-in is main's (start card), not auto-entered. |
| 5. Agent drives; acts in chat; silence | One question at a time; every proposal is an action card in the chat ("Added to your shop · Shop name: …", "I read your menu: N items", "Saved your location: Near …"); ~9 s silence (or Skip) → coach suggests/leaves it out and moves on (max 2 in a row); live "Your shop so far" card; full-screen review page with one "Open my shop"; full-screen ready moment. |
| 6. Must not break | Main coach voice/photo/document, Import, Close the day: their suites pass unchanged. |

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
