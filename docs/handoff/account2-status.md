# Account 2 status: Source supplies in the coach chat (Forecast → Source → Sell)

**Brief:** `docs/handoff/account2-sourcing.md` · **Story:** STORIES.md S4.
**Branch:** `feat/sourcing`, from `origin/main`, with `origin/main` merged in at `f9d1d16`
(B40 demo world, STORIES.md). Pushed to `origin/feat/sourcing` only. No AI co-author trailers.
The previous status (My shop bugs B26–B28, B16) is in git history at `c0e3e5d`.

**Status: done.** The story works end to end on a phone in the offline coach, and is wired for
Gemini text and voice. Live Gemini and live voice were **not** run (no model key in this session);
see "Not verified" below.

## Commits

| Commit    | What                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0827985` | Backend: `sourcing.py`, five coach tools, prompt rules (sourcing and voice), offline script, stream events, supplier fields and `supplier_orders` in both stores, order routes, pytest.                                  |
| `813331a` | UI: searching radar, supplier carousel, order card with one-tap Send, reply announcement, Orders tile and sheet with the supplier thread, Prep plan Running low tile, sourcing copy in 10 locales, regenerated contract. |
| `aa1848d` | Tests: the phone browser story (`tests/sourcing.spec.ts`) and 8 live eval scenarios in `scripts/coach_eval.py`.                                                                                                          |
| `f9d1d16` | Merge `origin/main` (clean).                                                                                                                                                                                             |
| `13cd0fd` | STORIES S4 steps 1 and 8: "Mark as received" opens a stock update in the usual review, and the Prep plan says "<item> runs out <day>".                                                                                   |

## How it works

**Tools** (`coordinator.py`, registered in `agent.py` for text and voice):

- `find_suppliers(item, quantity?, unit?)`: searches shared shops within 15 km of the shop pin that
  are flagged `supplier`, or that sell the item in a bulk unit (kg, g, litre, ml, pack, box, dozen,
  bottle). Results are ranked by distance (50%), price per requested unit (40%) and availability.
  It returns up to 5 cards plus `cheapest_id` and `nearest_id`.
- `prepare_order(supplier_id, items[], note?, delivery?, replaces_order_id?)`: builds a **draft**
  order (lines, estimated total in the shop currency, the supplier's next delivery slot). Nothing is
  sent.
- `get_orders()`, `message_supplier(order_id, text)`, `cancel_order(order_id)`. The message and the
  sent-order cancellation are prepared as **pending**, and the owner taps Send. A draft that was
  never sent is simply dropped.

**One tap:** `POST /businesses/{id}/orders/{oid}/send` with the order `version` (stale taps get a
409). Other routes: list, read, discard, messages (the owner typing in the thread is its own
confirmation), read, received.

**Supplier conversation:**

- **Demo suppliers** answer 4 s after a send. The reply is created lazily on the next read, with no
  background task that a scaled-to-zero Cloud Run instance could lose. It is always marked
  `auto: true` and shown as "Automatic demo reply". The replies are deterministic and plausible:
  - "Confirmed: 20 kg Wheat flour, 5 kg Sugar, ₹1,145. Delivering today at 16:00."
  - an out-of-stock line asks whether to send the rest
  - Sunday gets "we don't deliver on Sunday"
  - "by 8am" gets "Yes, we can deliver by 8:00"
  - a cancellation is acknowledged
- **Real Chalkboard suppliers** get the request in their existing **Messages inbox**, as an inquiry
  from "<shop> (order request)" with the ordering shop's phone as the contact. Their replies are
  mirrored back into the order thread through the inquiry's customer token, which reuses
  `threads.py` and the inbox unchanged. The token never reaches the browser (`public_order`).

**Demo suppliers anywhere:** when nothing within range stocks the item, `SupplierGenerator`
creates 4 suppliers near the pin:

- **Source:** Gemini with a JSON schema in Gemini mode, and the deterministic fixture offline or on
  any failure.
- **Roles:** dry goods; dairy and fresh; cash and carry with packaging, cleaning and stationery;
  coffee and tea. This covers the brief's common categories in one cheap call.
- **Requested item:** at least three of them always stock it.
- **Local feel:** names, currency and price level come from the shop's currency (INR, SGD, MYR,
  IDR, JPY and THB have their own tables; others use approximate rates).
- **Storage:** through `seed_demo_shop` (labelled `demo`, owned by a fixed demo owner,
  `demo-sup-<cell>-<n>` IDs, one set per ~2 km cell), so they persist and nearby shops reuse them.
  They are hidden from the customer Explore list.

**UI (phone first):**

- **Searching:** a radar pulse with shimmering placeholders where the cards land.
- **Supplier cards:** stagger in as a snap-scrolling carousel that bleeds to the screen edge so
  the next card peeks. Each card has a rank, name, Demo chip, distance and delivery, price per
  unit, the estimate for the quantity, "Also stocks", the minimum order and **Choose** (which
  starts "Order from number N: …" in the composer).
- **Order card:** lines, estimated total, localised delivery time and the hint "Nothing is sent
  until you tap Send. No payment". Send makes the card lift while a paper plane flies off, then
  shows "Sent to … / Waiting for the supplier…". The supplier's reply fades in on the card, and
  the coach announces it in the chat.
- **Orders tile (My shop):** shows the open count, the latest status and an unread badge. Its
  sheet lists the orders, opens the thread (bubbles, auto-reply labels, composer) and has
  **Mark as received**.
- **Motion:** all of it uses the theme's M3 tokens (emphasized-decelerate enter) and turns off
  under reduced motion.

## Decisions I made

1. **Separate copy module** (`src/features/sourcing/copy.ts`): all 10 current locales, with an
   English fallback for any locale added later. Codex's Hindi, Bengali, Telugu, Marathi and Kannada
   have not reached main yet, so they show English sourcing strings until someone adds them there.
   `choose`, `chooseDraft`, `sendTo` and `runsOut` are English in every locale for now.
2. **Lazy demo replies** instead of a background timer (see above). The coach chat polls the order
   for up to 45 s after Send, and the open thread polls every 2 s.
3. **Supplier fields** `supplier`, `supplies[]` and `min_order` were added to `BusinessFields`. The
   delivery terms reuse `delivery_note`. Lead time and delivery time are `custom_facts` on demo
   suppliers. All of these are omitted from records when unset, so existing digests are unchanged.
4. **No shop pin:** the search uses the currency's city centre (INR → Bengaluru, SGD → Singapore…)
   and the cards say "Distances are approximate".
5. **Only bulk units count** for a non-supplier shop, so a café selling coffee by the cup is not
   offered as a coffee supplier.
6. **Running low / runs out (Prep plan):** there is no ingredient inventory, and the demo shops have
   no stock counts. So the tile shows only for menu items with a stock count: the first forecast day
   on which the week's demand passes the stock ("Croissant runs out Thu"), or a stock of at most 5
   when there is no forecast. **Find suppliers** sends "My <item> is running low…" to the coach in
   one tap (`startCoachDraft(text, { send: true })`). For the flour demo, say it to the coach.
7. **Mark as received** opens a normal inventory proposal (stock plus the delivered quantity, back
   in stock) for menu items that match the delivered lines. The owner confirms it like any change.
8. **Voice:** the same tools are registered for `make_agent(live=True)`, and the instruction now has
   a Voice section ("you have exactly the same tools… never say you can't access the menu"). Cards
   from a voice turn render in the chat because the voice socket uses the same `receive`.

## Tests

- **Backend:** `pytest` **465 passed**, 85 skipped (Firestore-emulator tests). `ruff check`,
  `ruff format --check` and `mypy app` are clean. `tests/test_sourcing.py` (9 tests) covers:
  - units and local names (atta, chini)
  - demo generation once, then reuse
  - one-tap send with the lazy demo reply and the stale-version 409
  - change, Sunday question and cancel
  - a real supplier's inbox round trip
  - the offline phrasings, the stream events and receive → stock review
  - HTTP end to end, from "running low" to the typed follow-up
- **Frontend:** `tsc -b`, `npm run build` and `npm run test:hooks` pass, and Prettier is clean.
  `eslint` passes on tracked code. Locally, `npm run lint` also scans the git-ignored
  `docs/launch/source/dist` vendor bundle (`gsap.min.js`) and fails there; that is not part of the
  repo.
- **Browser (phone, Pixel 7):** `tests/sourcing.spec.ts` passes. Full phone suite: **157 passed**, 3 skipped,
  9 failed:
  - **B27 tile grid** (`myshop.spec.ts:120`): it measured the Prep plan tile while the forecast
    was still loading, under 4 parallel workers. Run alone it **passes 3 of 3**, so I treat it as a
    timing flake, not a regression.
  - **The other 8 couldn't run correctly here.** They hard-code `http://127.0.0.1:3200`:
    - customer pages: `customer.spec.ts` ×2, `demo-flow`, `i18n:80`, `v1-a11y` customer page ×2 and
      `v1:172`
    - the network allow-list: `starter:83`

    Another session owned 3200 and 3300, so I ran on 3210 and 3310, and those links went to the
    other session's server and database. **They need a rerun on the standard ports** (the normal
    `npm run test:ui`). None of them touches sourcing code.
- **Live eval** (`scripts/coach_eval.py`, needs a Gemini key): 8 new sourcing scenarios, not run in
  this session.
- I ran everything against my own servers (`127.0.0.1:3210` and `3310`), because another session
  owned 3200 and 3300.

## Not verified (needs a person or a key)

- Live Gemini text: whether the model calls `find_suppliers` / `prepare_order` as the prompt says.
  Run `scripts/coach_eval.py`.
- Live voice: the instruction and tool registration are in place, but I could not reproduce or
  confirm account 1's "I can't access your menu". The declarations are the same Python functions as
  text mode, and the Voice section of the prompt tells the model to call them.
- Gemini-generated demo suppliers: the schema and fallback are tested offline only.
- A real phone: the screenshots come from Chrome at 390×844 with touch emulation.
- The Firestore adapter's `supplier_orders` / `save_supplier_order`: written to mirror SQLite, and
  type-checked, but not run against the emulator.

## Screenshots (`docs/bugs/`, 390×844, offline coach, en-IN)

- `SRC-0-searching.png`: radar and placeholders.
- `SRC-1-suppliers.png`: the carousel with Demo chips.
- `SRC-2-order-request.png`: the order card before the tap.
- `SRC-3-sending.png`: the send flight, card sent and waiting.
- `SRC-4-supplier-replied.png`: the confirmed card with the automatic demo reply, announced in the
  chat.
- `SRC-5-supplier-thread.png`: the thread with "Can you deliver by 8am?" and its reply.
- `SRC-6-orders-tile.png`, `SRC-7-orders-sheet.png`, `SRC-8-received.png`: My shop.

## Demo script (say or type these, in order)

1. Sign in, then create the shop: "Shop name: Asha Bakery; category: Bakery; location: Indiranagar,
   Bengaluru". Confirm the review.
2. **"My flour is running low."** The radar appears and 3 demo supplier cards slide in. The coach
   says they are demo suppliers.
3. **"The second one looks good, order 20 kg flour and 5 kg sugar from them."** The order request
   card appears.
4. Tap **Send** (one tap). The card flies into "Sent", and about 4 s later the supplier's
   automatic demo reply appears on the card and in the chat.
5. **"Can you deliver by 8?"**: the coach prepares a message to the supplier on the order card,
   and you tap Send (offline too). Or tap **Open conversation** and type it. Either way, the
   supplier replies "Yes, we can deliver by 8:00".
6. **My shop → Orders:** the tile shows "1 open · Confirmed". Open it, open the order, then
   **Mark as received**.
7. **By voice:** tap the mic and say "My sugar is running low" (Gemini mode). The same cards appear.

**Extra phrasings** (handled by the prompt; the offline script also handles them):

- "order 2 kg flour from the cheapest one"
- "change the quantity to 15" (on a draft)
- "order the same as last time"
- "ask them if they deliver on Sunday"
- "cancel that order"

## Resume steps

```
git fetch origin && git switch feat/sourcing && git pull
cd backend && uv run pytest tests/test_sourcing.py -q
npm run dev:backend & npm run dev        # then follow the demo script at 390×844
npx playwright test tests/sourcing.spec.ts --project=phone
GEMINI_BACKEND=vertex GOOGLE_CLOUD_PROJECT=... uv run python -m scripts.coach_eval   # live eval
```

Next, if wanted: Hindi and other new-locale sourcing copy once Codex's locales land; an ingredient
stock list so "flour runs out Thursday" can come from real stock; live voice verification.
