# PPT content for the AI Builder Cup template

Paste-ready text for each slide of `Submission Template _ AI Builder Cup.pptx`, in the template's
order. Each slide gives the text, what to put in the picture area, and the source of any number.
Every number is also in `claims-check.md`. Only Google services marked **live** in
`docs/google-ai.md` are named as used.

Brand, if you want the slides to match the app: chalk green `#1F5C42`, mint `#B7EBCF`, chalk yellow
`#FFE08A`, kraft paper `#FBF7EC`, ink `#1B2A22`. The app uses Google Sans Flex for text and Caveat
for handwritten accents.

---

## Slide 1 · Team details

- **Team name:** humanStack
- **Team leader name:** Shreyaan Pradhan (team: Shreyaan Pradhan, Suraj Tiwari)
- **Problem statement:** Retail & Commerce: Intelligent Customer and Business Experiences.
  Neighbourhood shops are where people buy every day, but they are invisible online, and the tools
  built for them start with a form, in English, on a laptop.

## Slide 2 · Organiser note

Delete this slide before submitting.

---

## Slide 3 · Brief about the idea

**Chalkboard: every small shop, one conversation from online.**

A tea stall owner opens Chalkboard on their phone and talks, in Hindi or their own language. In one
short conversation the shop is live: name, what they sell, where they are, their hours. No form.

From then on Chalkboard is their daily coach: what sold out, what to make tomorrow (a real demand
forecast), how the day went from a photo of the till slip, and when to reorder from a supplier.

Customers nearby open a link and ask the way they'd ask a friend: "chai near me under ₹20". They get
real shops with the item, price and distance, can chat with the shop, and scan a QR at the counter
for a stamp card that brings them back.

**Picture:** two phones side by side, owner Today (`docs/qa/manual-v2/01-today.png`) and customer
Ask (`docs/ux/front-door-after/open-390x844-light.png`).

---

## Slide 4 · Opportunities

**How different is it from other ideas?**

- Other tools start with a form. Chalkboard starts with a conversation, by voice, in the owner's
  language, on the phone they already have.
- It doesn't stop at listing the shop. It runs the shop's day: forecasts, stock, closing the day,
  reordering.
- Owners, customers and suppliers are on one app, not three.

**How will it solve the problem?**

- Getting online takes one conversation, so owners who would never fill a form actually do it.
- Owners keep their menu and stock true because they get something back every day: a forecast, a
  "people nearby asked for this".
- Customers find what's really in stock nearby, and the stamp card turns a visit into a habit.

**USP**

- **Voice-first, in the owner's language.** Gemini Live holds a real conversation in Hindi and fills
  the shop from what the owner says.
- **A data loop nobody else has.** Fresh street-level menus and prices, plus every customer
  question that went unanswered, become demand data for that street.
- **The AI proposes, the owner approves.** Every change shows up as a card to accept, so the AI
  never quietly changes a real business.

---

## Slide 5 · List of features

Grouped by the Retail & Commerce track.

| Track item              | Feature                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Onboarding              | Voice setup in the owner's language; one sentence fills several fields; live once name, offer and place are known |
| Discovery               | Customer Ask box that searches by meaning ("something sweet" finds the bakery), with price and distance           |
| Conversational shopping | Chat with the shop: instant answers from the menu; the owner replies to anything else                             |
| Demand planning         | 7-day forecast per item from BigQuery TimesFM, "Plan tomorrow"                                                    |
| Inventory               | Sold out / back in stock in one tap; close the day from a till photo                                              |
| Suppliers               | Purchase order drafted from the forecast, sent to the best supplier, owner approves (sample supplier files)       |
| Customer insights       | Today pulse (yesterday's sales, busiest hours), weekly recap in the owner's language                              |
| Personalisation         | A shop playbook Gemini writes for each shop: its goals, regulars and tone                                         |
| Loyalty                 | Counter QR → stamp, scratch card, neighbourhood passport                                                          |
| Fraud                   | Listing checks: copied menus, impossible prices, the same phone across shops                                      |
| Languages               | 15 languages; Hindi checked end to end                                                                            |

---

## Slide 6 · Process flow

Two flows joined by one loop. Draw it as a circle with the two flows on each side:

```
OWNER                                   CUSTOMER
Talk to the coach (voice, Hindi)        Open the link, ask "chai near me"
        ↓                                       ↓
Shop is live (name, offer, place)  ──→  Shops with item, price, distance
        ↓                                       ↓
Daily: sold out, forecast,              Shop page → chat → instant answer
close the day from a photo                      ↓
        ↓                               Scan counter QR → stamp, scratch card
Reorder: PO drafted from forecast,              ↓
owner approves                          Unanswered questions ("anyone sell
        ↑                               filter coffee?") become demand data
        └──────── coach suggests what to stock ←────────┘
```

Caption: "Owners keep it true because they get something back every day."

---

## Slide 7 · Wireframes (optional)

Delete this slide. Real screens are on slide 11.

---

## Slide 8 · Architecture diagram

Redraw in brand colours (live services only):

```
Phone / browser (React PWA: owner app + customer app)
        │  HTTPS · REST · SSE · WebSocket
        ▼
Cloud Run: one service
  FastAPI + Google ADK coach agent (tools propose, owner approves)
        │
        ├── Gemini 3.5 Flash on Vertex AI: coach, customer search intent, photo and till-slip reading
        ├── Gemini Live on Vertex AI: the voice conversation (audio in, audio out, tools)
        ├── Cloud Text-to-Speech: one voice (Achernar) reading replies aloud
        ├── BigQuery AI.FORECAST (TimesFM): 7-day demand per item
        ├── Firestore: shops, chats, sessions, memory
        └── Firebase Authentication: Google sign-in
```

Three lines under the diagram:

- One Cloud Run service hosts both apps.
- Every AI feature has a switch and a labelled fallback, so a slow provider never means a blank
  screen.
- The coach only proposes changes; the owner approves each one before it is saved.

Source: `docs/architecture.md`, `docs/google-ai.md`.

---

## Slide 9 · Technologies used

**Google AI (live in the product)**

- Gemini 3.5 Flash on Vertex AI
- Gemini Live on Vertex AI (voice)
- Cloud Text-to-Speech (Achernar voice)
- BigQuery AI.FORECAST with TimesFM

**Google Cloud platform**

- Cloud Run · Firestore · Firebase Authentication

**Our stack**

- Google Agent Development Kit (ADK) · FastAPI (Python) · React + TypeScript · Material 3 · GitHub
  Actions CI

Built and behind switches, not yet verified live, so not claimed: Vertex AI embeddings, Cloud
Vision SafeSearch, Maps Platform, Document AI, Gemini grounding with Maps, Recommendations AI. Leave
these off the slide, or add them as one small grey line saying exactly that.

---

## Slide 10 · Estimated implementation cost

**Running cost per active shop per month (estimate).** Fill the price column from Google's pricing
pages or the [pricing calculator](https://cloud.google.com/products/calculator) on the day you
submit, and write that date on the slide. I couldn't read the live price pages from here, so no
price is guessed in this file.

| Item                             | Usage per shop per month (assumption)                            | Unit price (fill in) | Cost |
| -------------------------------- | ---------------------------------------------------------------- | -------------------- | ---- |
| Gemini Live (onboarding, voice)  | One 3-minute setup + 10 minutes of voice a month                 | per 1M audio tokens  |      |
| Gemini 3.5 Flash (coach, search) | 10 coach turns a day (300 a month), ~3K tokens in / 300 out each | per 1M tokens        |      |
| Cloud Text-to-Speech             | 300 replies × ~200 characters = 60K characters                   | per 1M characters    |      |
| BigQuery AI.FORECAST             | One forecast a day per shop (30 a month)                         | per query / per TB   |      |
| Firestore                        | ~2K reads, ~500 writes a day                                     | per 100K ops         |      |
| Cloud Run                        | ~1K requests a day, ~0.3 s each                                  | per vCPU-s, GiB-s    |      |
| **Total per shop per month**     |                                                                  |                      |      |

Where the usage numbers come from:

- 3-minute setup: the longest live Hindi onboarding ran 178 s (`docs/qa/onboarding-live-check.md`).
- 10 coach turns a day, 1K requests a day: our assumptions for an active shop; no real-shop usage
  data yet.
- One forecast a day: the coach caches forecasts per shop (`backend/app/forecast.py`).

**Second line on the slide: what we actually spent building it.** Read it from GCP Billing →
Reports for project `ichiropractic`, from the start of the project to today. [OWNER: fill in]

Optional third line: "Most of the free tier covers a pilot of a few dozen shops." Only keep it if the
filled-in table shows it.

---

## Slide 11 · Snapshots of the prototype

Six phone screens in two rows. Crop out any line that says "Offline", "Sample" or "(Demo)": these are
test-data labels. Better still, swap in frames from your video recording once you have them.

| #   | Screen                               | File                                              | Crop                                |
| --- | ------------------------------------ | ------------------------------------------------- | ----------------------------------- |
| 1   | Voice setup, listening               | `docs/stories/new-shop-2-listening-light.png`     | from "Lovely, masala chai!" down    |
| 2   | Pin the shop on the map              | `docs/stories/new-shop-map-1-small-light.png`     | the "Where is your shop?" card only |
| 3   | Today: "Needs you now" + pulse       | `docs/qa/manual-v2/01-today.png`                  | full                                |
| 4   | Customer Ask, nearby shops           | `docs/ux/front-door-after/open-390x844-light.png` | full                                |
| 5   | Shop page in Hindi with stamp card   | `docs/qa/hindi/22-shop-page.png`                  | full                                |
| 6   | QR stamp: "First try! +50 points"    | `docs/stories/games-phone-light-3-scratch.png`    | top half                            |
| alt | Purchase order drafted from forecast | `docs/stories/supply-1-draft.png`                 | the PO card only                    |

Caption under each, three to five words, e.g. "Talk, don't type", "Pin the door", "What needs you
today", "Ask like a neighbour", "Your language, your prices", "Come back tomorrow".

---

## Slide 12 · Performance report / benchmarking

Five numbers, big, one line each, source in small text under each:

| Number      | Line                                                        | Source                                         |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------- |
| 0 / 215     | irrelevant onboarding questions across 40 kinds of business | `docs/qa/onboarding-eval.md`                   |
| 11 / 11     | live Hindi voice setups went live; 0 dropped, 0 repeated    | `docs/qa/onboarding-live-check.md`             |
| 25 / 27     | live coach test scenarios passed, in 8 languages            | `docs/impact/coach-eval-gemini-3.5-flash.json` |
| 0.73 → 0.90 | search precision@5 after meaning-based search               | `docs/impact/search-eval.md`                   |
| 26 / 26     | till-slip lines Gemini read correctly (15/15 amounts)       | `docs/impact/document-ai.md`                   |

One honest line at the bottom: "Small, labelled tests: 40 scripted businesses, 20 test shops, 6 test
receipts. Real-shop time saved is what our pilot measures next."

Two figures are not on this slide on purpose:

- Customer first answer 0.13 s: local test only (`docs/impact/customer-latency.md`). Add it only as
  "0.13 s in a local test".
- Photo → menu: offline numbers that say nothing about Gemini. Never use them.

The first two rows come from #91. If #91 isn't merged when you submit, replace them with the coach
and search rows only.

---

## Slide 13 · Additional details / future development

**Why it gets harder to copy over time**

- Months of fresh street-level menus, prices and unmet demand that only exist because owners use it
  daily.
- Every new shop makes the street more useful for customers and for the shops buying from each other.

**Next**

- **Every shop as an agent:** other AI assistants ask a shop's agent what's in stock and hold it;
  the owner approves in one tap.
- **Suppliers live:** today the purchase-order flow runs on sample supplier files in real formats;
  next is a live supplier.
- **Faster voice:** first reply under 0.8 s (1.5–2.5 s today, `docs/qa/onboarding-live-check.md`).
- **Recommendations AI:** our catalogue of 479 products is imported; "similar items" turns on once
  the model has trained (`docs/impact/recommendations-ai.md`).
- **Pilot:** [OWNER: e.g. 20 shops on one street for four weeks, measuring time saved and repeat
  visits].

---

## Slide 14 · Links

- **GitHub public repository:** https://github.com/Shreyaanp/AI-Builder-Cup-2026
- **Demo video link (3 minutes):** [OWNER: YouTube or Drive link, under 3:00]
- **Final product link:** https://chalkboard.shreyaan.work (customers) ·
  https://business.chalkboard.shreyaan.work (shop owners)

Before submitting, make sure the repository is public and the history rewrite is done
(`docs/OWNER-NOTES.md`, 16 Oct 03:10).

## Slides 15–16

Organiser images. Keep them as they are.
