# Demo accounts and data (production)

All records below are fictional and labelled "(Demo)". Seeded on 2026-10-18 against project
`ichiropractic`, namespace `ogoogle_ai_v1`, after release `36368f0b` reached 100% of traffic
(revision `ogoogle-ai-00079-pjc`). The seeds are idempotent; a second run reported
"already up to date" for every shop.

Local source update (2026-10-18): the size-based supply model below is not deployed or
reseeded in production. The orchestrator owns release and production reseeding.

Money is stored in minor units: Masala chai `2000` shows as ₹20.00, Kopi `170` shows as S$1.70.

## 1. Which login, which button

| Use                       | Login                                                                           | Where                                      |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| Owner video               | Google sign-in as `shreyaan.9it@gmail.com` (UID `gGvGP8eVQeM7UM3DUKLCpYpIRnT2`) | `https://chalkboard.shreyaan.work/`        |
| Customer video, anonymous | none                                                                            | `https://chalkboard.shreyaan.work/explore` |

Production does not build tour shops on tap. `POST /api/v1/demo/workspace` returns 409
("The owner has not prepared this demo account yet") unless the shops already exist, so only
accounts seeded with `--owner-uid` can take the tour. The owner account above is prepared; any
other account is not.

The previously seeded owner account holds four shops (switch under You → Your shops):

| Shop                              | Business ID                            | Why it is there                          |
| --------------------------------- | -------------------------------------- | ---------------------------------------- |
| Lantern Chai Corner (Demo) (Tour) | `5e2f910d-36e2-5036-91f2-f8000a5ad94a` | Bengaluru tour shop, INR, private        |
| Sunny Side Kopitiam (Demo) (Tour) | `d99fb68c-2940-5f1f-84c8-197de71b73a1` | Singapore tour shop, SGD, private        |
| Sunny Side Kopitiam (Demo)        | `demo-katong-kopitiam`                 | Singapore supply-chain showcase (public) |
| Courtyard Filter House (Demo)     | `demo-bengaluru-indiranagar-coffee`    | Bengaluru supply-chain showcase (public) |

Tour button: **You → Help → Take the tour**. The first-run offer card says "See it working
first" with a "Take the tour" button; a brand-new shop screen offers the same. The tour picks the
world from the phone's time zone: `Asia/Kolkata` gives Bengaluru, everything else (including
`Asia/Singapore`) gives Singapore. To film the other world, change the device time zone, or
select the other shop under You → Your shops and tap Take the tour again.

The tour is eight steps: shop at a glance, menu by category, tomorrow's prep plan, close the day,
find suppliers, just talk or type, get on Google, share your page. It ends with "Start my own
shop" or "Keep exploring".

Bottom tabs: Coach, Shop, Grow, You.

## 2. What each tour shop contains

Both worlds have the same shape.

|                      | Bengaluru: Lantern Chai Corner                                                                                            | Singapore: Sunny Side Kopitiam                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Currency, zone       | INR, Asia/Kolkata                                                                                                         | SGD, Asia/Singapore                                                                                                               |
| Sales                | 56 days (2026-08-23 to 2026-10-17), 336 rows, about ₹3.17 lakh                                                            | 56 days, 336 rows, about S$27,366                                                                                                 |
| Menu                 | Masala chai ₹20/cup, Ginger chai ₹25/cup, Bun maska ₹35, Samosa ₹20, Tea dust ₹320/kg, Ragi biscuit ₹15 (sold out)        | Kopi S$1.70, Kopi O S$1.50, Kaya toast set S$5.20, Soft-boiled eggs S$1.80, Kopi powder S$18/kg, Curry puff S$1.80 (sold out)     |
| Customer chats       | 3: Priya unread, Wei and Asha replied                                                                                     | same 3                                                                                                                            |
| Reviews              | 2 (4.5 average), marked Demo                                                                                              | same                                                                                                                              |
| Rescue deal (today)  | Bun maska ₹24.50, was ₹35, 6 left                                                                                         | Kaya toast set S$3.64, was S$5.20, 6 left                                                                                         |
| Prep plan / playbook | stored offline playbook                                                                                                   | same                                                                                                                              |
| Purchase order       | PO 4500000001: forecast-based Tea dust, Milk 30 litres, Sugar 10 kg, ten 50-cup packs, from Sri Lakshmi Provisions (Demo) | PO 4500000001: forecast-based Kopi powder, Evaporated milk 24 packs, Sugar 10 kg, ten 50-cup packs, from Ah Huat Provision (Demo) |
| PO documents         | WhatsApp draft, text confirmation, dispatch note and bill; invoiced, awaiting receipt; cash on delivery                   | same, in SGD                                                                                                                      |
| Gallery              | 1 photo                                                                                                                   | 1 photo                                                                                                                           |

The older showcase PO snapshot was 10 kg from Lantern Tea Wholesale / Dawn Bean Supply
(₹2,240 / S$126; ORDERS, ORDRSP, DESADV, INVOIC). It is retained here as legacy seed history;
the current post-reseed PO details above apply to the tour shops.

Eight Bengaluru and five Singapore public tour shops exist as well (ids `demo-story-*`, owner
`chalkboard-tour-story-owner`), plus two suppliers, so Explore and the stamp passport have
neighbours to show.

## 3. Module by module

Taps assume the owner account, one of the two Tour shops selected.

**Onboarding.** Sign out of a spare account, or use a fresh Google account, to show the first-run
flow: the "See it working first" card and "Take the tour". The owner account already has shops, so
it does not show the empty "add your shop" screen. For the full create-a-shop flow, tap
You → Your shops → add a shop.

**Today (Coach tab).** Opens on the selected shop. Data: yesterday and today aggregates
(`shop_daily` rows: 32 to 50 views, 7 to 8 stamps, 3 to 5 returning customers), the three
customer chats, the stored playbook. Tap Coach → the shop card.

**Shop tab.** Tiles for the customer page (QR, share link, hours, photo), menu with the sold-out
item (Ragi biscuit or Curry puff), and customer questions. Tap Shop → Menu to show prices and the
sold-out flag. Tap a price to edit; nothing changes until confirmed.

**Grow tab.** Tiles in this order (the playbook may reorder): prep plan, close the day, orders,
supply, plan, rescue, radar, payments, Google, Stamps & perks, week, recap. Showable data:

- Prep plan: a forecast from the 56 sales days.
- Close the day: 8 weeks of per-item sales behind it.
- Rescue: the live rescue deal above.
- Stamps & perks: reward text ("A free chai" in Bengaluru), 8 stamps needed.
- Recap and week pulse: built from the 56 days.

**Supply by business size (local source; production reseed pending).** All partners are fictional
and all sends are simulated. JSON is the internal representation, not an external channel.
Existing shop IDs and tour PO 4500000001 remain unchanged.

| Shop / business ID                                                        | Supplier and channel                                                | Order story                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lantern Chai Corner (Demo) (Tour), `5e2f910d-36e2-5036-91f2-f8000a5ad94a` | Sri Lakshmi Provisions (Demo), local wholesaler; WhatsApp text only | Tea dust (at least 5 kg), Milk 30 litres at INR 54/litre, Sugar 10 kg at INR 44/kg, cups ten 50-cup packs at INR 40/pack; next day, cash on delivery                                                                                         |
| Sunny Side Kopitiam (Demo) (Tour), `d99fb68c-2940-5f1f-84c8-197de71b73a1` | Ah Huat Provision (Demo), local wholesaler; WhatsApp text only      | Kopi powder (at least 5 kg), evaporated milk 24 packs at SGD 1.65, sugar 10 kg at SGD 1.90/kg, cups ten 50-cup packs at SGD 2.50/pack; next day, cash on delivery                                                                            |
| Sunny Side Kopitiam (Demo), `demo-katong-kopitiam`                        | Ah Huat Provision (Demo); WhatsApp text only                        | W-SGD-2210 received, receipt sent; W-SGD-2211 bread and cups awaiting receipt; 1-2 days, cash on delivery                                                                                                                                    |
| Courtyard Filter House (Demo), `demo-bengaluru-indiranagar-coffee`        | Sri Lakshmi Provisions (Demo); WhatsApp text only                   | W-INR-2210 milk, coffee blend, sugar, cups received with receipt sent; W-INR-2211 milk and cups awaiting receipt; 1-2 days, cash on delivery                                                                                                 |
| FreshMart (Demo), `demo-chain-freshmart`, 3 outlets, Bengaluru            | Anand Distributors (Demo), regional distributor; email/CSV POs      | PO-FM-2210: rice 100 kg at INR 58/kg, dal 50 kg at INR 155/kg, oil 60 litres at INR 124/litre; receipt sent. PO-FM-2211: CSV change CH-FM-2211 cuts oil from 60 to 48 litres, moves delivery to day 3; acceptance pending. 7-day credit.     |
| Metro Foods (Demo), `demo-chain-metro-foods`, 24 outlets, Mumbai          | Bharat FMCG Distribution (Demo); SAP IDoc                           | 4500091500: noodles 4,800 packs at INR 11.50, biscuits 3,600 packs at INR 16, oil 1,200 litres at INR 112; ORDERS05, ORDRSP, DELVRY07/ASN, INVOIC02, receipt sent. 4500091501: tea and detergent, awaiting receipt. 30-day credit, 1-2 days. |

After release and reseed with `--owner-uid`, select the shop under **You > Your shops**,
then **Grow > Supply chain** (or **Purchase orders**):

Legacy public showcase PO records from the earlier seed:

|           | Order 1                                                                                  | Order 2                                                     |
| --------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Partner   | Sunrise Supply (Demo), JSON                                                              | Harbour Trade (Demo), IDoc                                  |
| SGD shop  | 4500091500, 15 Kopi at S$1.70 = S$20.40, status received                                 | 4500091501, 16 Kopi O at S$1.50 = S$24.00, status confirmed |
| INR shop  | 4500091400, 15 Filter coffee at ₹60 = ₹720, status received                              | 4500091401, 16 Masala chai at ₹35 = ₹560, status confirmed  |
| Documents | FORECAST (received), ORDERS, ORDER_CHANGE (quantity and date, processed), RECEIPT (sent) | ORDERS, DESADV (pending)                                    |

- Tour shops: PO 4500000001 shows a WhatsApp draft and text replies, awaiting Mark as received.
  No SAP. The AI draft and all supplier replies are offline simulations.
- Small public showcases: Received shows the first text order; Coming in shows the second.
- FreshMart: Received shows PO-FM-2210; Needs me now shows the pending CSV change for PO-FM-2211.
- Metro Foods: Received shows the completed distributor loop. Partner documents contains
  Metro Store 14 (Demo)'s SAP forecast 5500000301, order 4700001201 and change 4700001202.
  The change is accepted (2,000 packs to 1,500, a day later). Must send shows its prepared ASN;
  View as SAP shows DELVRY07.
- Partner sends next document (demo) uses the shop's channel (text, CSV or IDoc). After the
  forecast, order and change are present, it returns DEMO_DONE.

Reruns preserve processed documents and receipts; they do not reset filmed journeys.
An untouched legacy tour SAP fixture is rebuilt as text; received or advanced orders are kept.
Older public showcase SAP/JSON records are retained alongside the new orders. The orchestrator
must review legacy fixture cleanup before filming production; reseeding alone does not remove them.

Other currency showcases retain their IDs: `demo-bangkok-kitchen`, `demo-tokyo-coffee`,
`demo-jakarta-warung`, `demo-kuala-lumpur-kopi`. Their text channel is updated, but only INR and
SGD plans have tailored prices; local price plans are still needed before filming other regions.

Legacy showcase tap paths:

| Tap                                  | What you should see                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbound: Coming in / Received        | Order SO-SGD-2210 (SGD) or SO-INR-2210 (INR) from Sunrise Supply (Demo), JSON, goods receipt sent, status closed. Orders 4500091500 and 4500091501 (INR: 4500091400, 4500091401) as in the table above.                          |
| Inbound: partner documents           | Inbox of 4 entries: FORECAST 5500000301, ORDERS 4700001201, ORDER_CHANGE 4700001202 (Harbour Café (Demo), SAP IDoc) and ORDERS SO-…-2210 (Sunrise Supply, JSON).                                                                 |
| Outbound: Must send                  | Order 4700001201 (shop ships to Harbour Café): shipping notice DESADV prepared, not yet sent. Tap it for the preview, "View as SAP" for the DELVRY07 document.                                                                   |
| Order timeline                       | Open any order: Created → Changed → Shipped → Received → Closed. 4700001201 shows Changed (the change was accepted). SO-…-2210 shows Received and Closed.                                                                        |
| Close the day                        | Grow → Close the day shows "Before you close: 2 not sent" (the DESADV for 4700001201 and the goods receipt for 4500091500, INR 4500091400) with Send all. After Send all it shows "Everything is sent"; reseed to bring it back. |
| "Partner sends next document (demo)" | Plays forecast → order → change on a demo shop. Once all three are in, it answers DEMO_DONE.                                                                                                                                     |
| Coach chat                           | Try "show inbound", or "received everything except 5 milk" on an order awaiting receipt; a supply card appears.                                                                                                                  |

Caveats found while reseeding:

- The Inbox and Tasks lists mark ORDERS 4700001201 and SO-…-2210 as status "problem". Open one
  to see what the shop says before filming.
- Orders 4500091400/01 and 4500091500/01 (seeded before this release) had documents without an
  `at` timestamp, which made the supply board fail for those shops. On 2026-10-18 the missing
  `at` was filled in directly in Firestore (backup of the four orders: `legacy-po-backup.json` in the
  seeding session's temp folder). New code should tolerate such documents; check that a fix has
  landed before relying on this for other accounts.
- Seeding logs `community_index_missing kind=supply_po`; the board still loads.

The other four currencies have the same legacy showcase on shops the owner account does not own
(THB `demo-bangkok-kitchen`, JPY `demo-tokyo-coffee`, IDR `demo-jakarta-warung`, MYR
`demo-kuala-lumpur-kopi`). Attach the account with
`seed_demo_shops --city <city> --owner-uid <uid>` if needed.

**POS import.** Not seeded. There is no demo POS file in the data set. Use the 56 days of sales
that already exist, or upload a till report photo under Grow → Close the day.

**Customer app (no login).** `https://chalkboard.shreyaan.work/explore`, allow location or pick
a place:

- Bengaluru: search near Indiranagar (12.9688, 77.6382). First hit: Lantern Chai Corner (Demo),
  0 m, "Demo shop" chip, Ragi biscuit shown as sold out.
- Singapore: near Katong (1.3050, 103.9050). First hit: Sunny Side Kopitiam (Demo), 60 m.
- Tap the shop for the menu, reviews (2, 4.5 average), rescue deal and the "Ask" box. Tap Ask
  and send a question; the seeded chats show the Asha and Wei replies.

**Stamps and passport.** Seeded only for a fresh demo customer account, not for the owner's
Google account: it already holds real points and stamps, and the seed refuses to overlay those.
To film the passport, create a new customer account and run
`python -m scripts.seed_tour_story --project ichiropractic --customer-uid <that uid>`. That
fills a "Demo neighbour" passport: five Bengaluru visits, five Singapore visits, scratch tickets,
one collected rescue deal, three followed shops and a chat with each world's first shop.

**Hindi.** You → Settings → Language → हिन्दी (Hindi). Tabs read कोच, दुकान, बढ़ाएँ, आप. The
tour copy and Purchase orders title (खरीद ऑर्डर) are translated. Use the Bengaluru shop for the
best fit (INR, chai).

**Singapore.** Select Sunny Side Kopitiam (Demo) (Tour) under You → Your shops, or set the
device zone to Asia/Singapore before taking the tour. English, SGD, `en-SG` formatting.

## 4. Public demo shops (no login needed)

28 original `demo-*` shops, plus two chain showcases in local source, across Singapore (6), Bengaluru (4), Delhi (3), Mumbai (3), Kuala Lumpur (3),
Jakarta (3), Tokyo (3), Bangkok (3), each with 42 days of sales, 3 customer inquiries and 6 to 10
menu items. 13 `demo-story-*` shops (8 Bengaluru, 5 Singapore) plus 2 suppliers
(`demo-story-bengaluru-supplier`, `demo-story-singapore-supplier`) from the tour story.

## 5. What was not verified

- Owner-only screens were read from the database (shops, 56 sales days, chats, POs and their
  documents, rescue deals) but not clicked through the live app: no owner session token was
  used.
- Public API checked live on the production domain: both tour shops, a showcase shop, the
  supplier, reviews (2 each, 4.5 average), and discovery near Bengaluru and Singapore.
- Tap paths and tile names come from the source (tab bar, Grow tiles, You settings, the tour
  strings), not from a recorded run. Check "Mark as received", the Shop tab tile contents and
  the Hindi tour copy on a phone before the take.
- Seeding logged `community_index_missing kind=supply_po` while writing the tour POs. The POs
  exist in the database; whether the Purchase orders list in the app finds them through a
  missing Firestore index is the first thing to check on the Grow tab before filming.

## 6. Re-running the seeds

From `backend/`, with application default credentials for `ichiropractic`:

```
python -m scripts.seed_demo_shops --project ichiropractic --seed-owner-uid chalkboard-demo-owner
python -m scripts.seed_tour_story --project ichiropractic --owner-uid <uid>
```

`--seed-owner-uid chalkboard-demo-owner` is required: the existing production `demo-*` shops
belong to that owner, and the script's default (`demo-world-owner`) is refused with a 404.
The supply seed includes FreshMart and Metro Foods, respects `--city`, and attaches the
chains when `--owner-uid` is given. The dry run lists them too. Add `--dry-run` to either to print the plan without writing. `--reset` on the tour seed restores
only labelled tour fixtures.

Reseed of 2026-10-18 (after release `8eef6519`, revision `ogoogle-ai-00082-njj`): run from
`backend/` of a checkout at `8eef6519` or newer, because the supply seed moved into
`app/demo_supply_seed.py`. Command: `uv run python -m scripts.seed_demo_shops --project ichiropractic --seed-owner-uid chalkboard-demo-owner`
(set `PYTHONPATH=.` for ad-hoc scripts). Do not add `--owner-uid` unless you want one shop per city
attached to that account. A second run reported "already up to date" for all 28 shops.
