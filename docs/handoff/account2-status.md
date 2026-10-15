# Account 2 status: customer sign-in, WhatsApp-style chats, following shops

**Brief:** `docs/handoff/account2-customer.md` · **Audit gap:** A5 · **Story:** STORIES.md (Oct 15
customer decisions).
**Branch:** `feat/customer-chat`, from `origin/main` at `cf63808`. Pushed to
`origin/feat/customer-chat` only. The previous status (sourcing, S4) is in git history at
`432933c`.

**Status: done.** The customer story works end to end on a phone (390×844-class Pixel 7
emulation), in local auth mode with the offline AI. Live Google sign-in and live Gemini moderation
were **not** run; see "Not verified" below.

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
  in `starter:83`. They need a rerun on the standard ports, or the same `baseURL` fix I applied to
  `customer.spec.ts`.
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
- `FirestoreDocuments` (the customer data store when hosted): type-checked and mirrors SQLite,
  but it was not run against the emulator.
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
- run the Firestore adapter against the emulator.
