# UI-3 report — Onboarding that builds the cards

Branch `ui/coach-screen`. Nothing pushed or released; no AI co-author trailers.

**Branch base:** the brief said the branch was level with main at `78fe3b9`. Main had since moved
two commits on (`c1fcfb6`, `a6c585f`, the face worker), and they touch `merchant_routes.py`. My
branch was an ancestor of main, so I fast-forwarded to `a6c585f` before starting. Nothing was
rewritten or lost.

## 0. Answers to the UI-2 questions

- **QR code:** shown in the Customer page sheet once the page is shared.
  - **Dependency:** `qrcode@1.5.4` (+ `@types/qrcode@1.5.5` for dev), exact versions. It is
    loaded with a dynamic `import()`. A production build puts it in its own ~23 KB chunk, and the
    main bundle does not contain it.
  - **Print-friendly:** black on white in both themes, a generous quiet zone, medium error
    correction, with the shop name and "Scan for today's menu" under it.
  - **Share QR code:** shares a PNG through the Web Share API (`navigator.canShare({ files })`).
  - **Download QR code:** always available. The PNG is one card: the QR, the shop name and the
    caption.
- **Desktop side pane:** back at ≥1200px beside the coach. It shows the UI-2 tiles and their
  sheets in two columns (`ShopOverview narrow`). It skips the pending card, which the coach
  already shows, so the coach page never has two.
- **"Change a price" chip:** unchanged; it still starts a chat message.

## 1. Shop facts (backend + AI + sealed proposals)

- **The new facts:** optional keys on `BusinessFields`:
  - `halal` (`yes|no|muslim_owned|not_stated`)
  - `vegetarian_options` (bool)
  - `delivery` (`none|own|grab|foodpanda|other`) plus `delivery_note` (≤80 characters)
  - `preorders` (bool) plus `preorder_lead_time` (≤80)
  - `payment_methods` (from `cash|paynow|card|grabpay|nets|other`, duplicates removed)
  - `busy_hours` (≤80)
- **Backward compatible:** a model serializer leaves unset facts out of the record. Existing shops
  and existing sealed snapshots/digests are byte-identical to before, so old tests still hold.
- **No new repository methods:** facts live inside the existing `fields` record, which both
  `MerchantStore` and `FirestoreMerchantStore` already store whole. Both adapters are
  test-covered.
- **Public page:** `public_projection` adds `"facts": {…}` with only the stated facts.
- **Customer Q&A:** the Gemini path now gets `customer_facts`. Its rules say a missing fact is
  "not listed", and a halal answer is the shop's own statement, never "certified". The offline
  fixture still answers these questions with "not listed"; I left fixture wording alone.
- **Coach tool:** `propose_business` accepts each fact.
  - **Edits start from the saved fields:** previously it rebuilt six keys. Without this change, a
    later hours edit from the coach would have wiped confirmed facts. A test covers it.
  - **Bad values:** unknown values come back as repairable `invalid` results, as before.
- **Context:** `get_business_context` adds `customer_facts_to_ask` (still missing, in ask order).
- **Instruction (`agent.py`):** once the basics are saved, ask the first missing fact, one short
  question per turn, in the owner's language. Record answers with `propose_business` (the owner
  confirms). Stop for the rest of the conversation on "later / skip". Never re-ask an answered
  fact.
- **Offline fixture:** "halal yes" or "Halal: no" for a saved shop becomes a one-fact
  `propose_business` edit.
- **`coach_eval.py`:** two new scenarios, not run (live models are the lead's call):
  - `asks_one_customer_fact`: no proposals, reads context, asks about halal, exactly one question.
  - `records_halal_and_payment`: halal yes, cash + PayNow, keeps the shop.
- **Where facts show:**
  - the review sheet ("What customers ask")
  - both shop details sheets (the coach card's and the My shop tile's), each with a "Customers
    ask: payment?" button that starts the chat
  - the customer page, as chips: Halal, Muslim-owned, Delivery via Grab, Pre-orders · 1 day
    ahead, Cash, PayNow…
- **Contract:** regenerated (`docs/openapi.json`, `src/api/generated.d.ts`).

## 2–3. Cards after registration (rules only, no AI) — `PendingCard.tsx`

- **Where:**
  - on the coach, under the single shop card on an empty thread
  - on My shop, above the tiles
- **One card at a time, in this order:**
  1. **Waiting customers:** "N customers are waiting" → Reply opens the messages sheet. The
     coach's "Reply to customers" chip is hidden on an empty thread so it doesn't duplicate the
     card.
  2. **Sold-out sweep:** shown during busy hours. "Still have Kaya toast?" asks about the top 3
     menu items in order.
     - **Busy hours:** taken from `busy_hours` when it parses, else 11:00–14:00 and 17:00–20:00
       on the phone's clock.
     - **Sold out:** calls the existing `setAvailability` switch.
     - **Yes:** hides that item until the next busy window.
  3. **Missing facts:** "Customers ask: halal? payment?" → Answer starts the coach with "Halal: "
     in the composer.
     - **From My shop:** a new `startCoachDraft` in the workspace context switches to Coach first.
     - **Hand-off:** the owner types "yes" and sends, and the coach prepares a proposal to confirm.
- **Dismiss and memory:** every card can be dismissed (✕). Dismissals and "Yes" answers are kept
  in `localStorage` per shop and per day, in this browser only. A higher unread count shows the
  messages card again.
- **Motion:** cards enter with `enterRise`.

## Bug found and fixed

**Lost Send taps (pre-existing).** On a page taller than the screen, tapping Send could do
nothing. While typing, the nav bar is hidden; pressing Send blurred the text box, the nav
reappeared, and the sticky composer jumped 84px, so the tap landed elsewhere. The new card made
this easy to hit, and v1's "switching shops" test failed on it every time.

**Fix (Send and Stop):**

- Pressing the button no longer moves focus, so the tap lands.
- The click then releases focus, so the nav still comes back after sending, as main intends.
- Enter-to-send on desktop is unchanged.

## Copy

- **Owner app:** ~30 new keys in `strings.ts`, with real translations in all 9 locales (fact
  names and values, card text, QR labels).
- **Customer page:** 14 chip keys in `customerCopy.ts` + `customerLocales.ts` (9 locales).
- **Brand names** (PayNow, GrabPay, NETS, GrabFood, foodpanda) are not translated.

## Tests

- **Backend (new or updated):**
  - **Both store adapters:** facts are sealed, saved and published; invalid values are rejected.
  - **Coach tools:** a fact edit is reviewed, keeps every other field, and later edits keep the
    facts; unknown values are repairable; `customer_facts_to_ask` shrinks.
  - **Routes:** the offline coach turns "halal yes" into a proposal, and only after approval does
    the public page show `facts`; bad payment values return 422.
  - **Shape assertions:** two existing exact-payload assertions now include `"facts": {}` and
    `customer_facts_to_ask`.
- **Browser:**
  - **`v1.spec`, customer facts:** facts card → Answer → "Halal: " is pre-filled and focused →
    review shows Halal → details sheet → QR is visible → customer page "Good to know" list shows
    Halal.
  - **`v1.spec`, sweep:** fixed clock 12:30 SGT → "Still have Kopi?" → Sold out flips the real
    availability → Yes on Teh → sweep done, facts card next → still dismissed after reload.
  - **`customer.spec`:** asserts the "1 customer is waiting" card.

## Checks run

- **Backend:** `ruff check`, `ruff format --check`, `mypy app` pass.
  - **Targeted:** `pytest tests/test_merchant_store.py tests/test_coach_tools.py
tests/test_merchant_routes.py` → 98 passed with the Firestore emulator running, so both
    adapters ran (I started it as the brief says and stopped it afterwards).
  - **Full backend suite:** 191 passed. One existing assertion was updated for the new `facts`
    key.
- **Frontend:** `tsc -b`, `eslint src --max-warnings 0`, `prettier --check src tests` pass.
- **Playwright, on alternate ports:**
  - **Why:** ports 3200/3300 were held by dev servers from the other checkout (`niva-starter`).
    I did not stop them; reusing them would have tested the wrong code.
  - **How:** I ran the same specs through a temporary copy of `playwright.config.ts`, plus a Vite
    config and backend launcher on 3210/3310 with `ALLOWED_ORIGINS` set. `customer.spec` and
    `demo-flow.spec` hard-code `127.0.0.1:3200`, so I ran port-swapped temporary copies of those
    two. All temporary files are deleted and nothing in the repo config changed. The lead's CI
    runs the real config.
  - **Phone (required):** `v1` + `phone-regressions` + `customer` → 22/22.
  - **Desktop (required):** same specs → 13 passed, 9 skipped (`phone-regressions` is
    phone-only by design since `b88129e`).
  - **Phone (extra, because the cards are new UI):** `v1-a11y` (axe, light + dark), `demo-flow`,
    `planning`, `i18n`, `google-sim` → 36/36.
  - **After the last change:** after the final display tweak (halal shows "Yes"), only `v1` +
    the shot script were rerun (12/12).

## Screenshots (`docs/briefs/ui-3-shots/`, 412px light + dark; desktop 1440px)

| File                     | What it shows                                 |
| ------------------------ | --------------------------------------------- |
| `1-coach-facts-card`     | Coach with the facts card                     |
| `2-review-halal`         | Review sheet showing the halal answer         |
| `3-my-shop-waiting-card` | My shop with the "1 customer is waiting" card |
| `4-details-sheet-facts`  | Details sheet with facts                      |
| `5-customer-sheet-qr`    | Customer page sheet with the QR code          |
| `6-coach-sweep-card`     | Lunch-time sweep card                         |
| `7-customer-page-chips`  | Customer page with fact chips                 |
| `8-desktop-coach-pane`   | Desktop coach with the tile pane              |

I reviewed each shot. I fixed "Halal / Halal" in the facts list (it now reads Halal: Yes).

## Open questions / limits

1. **Offline customer Q&A:** the fixture does not answer halal/payment questions from facts; it
   still says "not listed". The Gemini path is grounded on them. I can teach the fixture if
   wanted.
2. **Busy windows:** they use the phone's clock and timezone. The shop's own timezone isn't
   stored.
3. **Card placement:** the pending card shows only on an empty coach thread. In a conversation,
   the pinned one-line shop card stays the only card.
4. **Live coach:** not evaluated live (by design). The two eval scenarios are ready for the lead.
