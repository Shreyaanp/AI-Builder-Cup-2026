# Chalkboard pitch deck (content)

12 slides, English, exported to PDF for the submission. Rubric: technical merit and GenAI 40%,
problem alignment and impact 25%, innovation 25%, UX 10% (`docs/HACKATHON-REVIEW.md`).

House rules for this deck:

- Every number names its source file. Numbers come only from `docs/impact/*`, the evals and the QA
  records. The offline photo → menu figure is never used.
- Only Google services marked **live** in `docs/google-ai.md` are named as used. Services that are
  built but not verified live are kept in the speaker notes, labelled as such.
- `[NEED SOURCE]` marks a claim we want but can't back yet. Remove the line or find the source
  before export.
- Screenshots: phone frames at 390 px wide, light theme. Where a screenshot still shows offline
  fixture text ("Offline template", "Sample answer", "(Demo)"), use a frame from the video take
  instead.

---

## 1 · Chalkboard

**Every small shop, one conversation from online.**

- For the tea stall, the tailor and the kirana shop down the road
- The owner talks in their own language; customers find them, ask, and come back
- Built on Gemini on Vertex AI, live today

**Visual:** full-bleed chalk-green (`#1F5C42`) with the logo and the line in Caveat. Right side: two
phones, owner Today (`docs/qa/manual-v2/01-today.png`) and customer Ask
(`docs/ux/front-door-after/open-390x844-light.png`).

**Speaker notes:** "Chalkboard is a phone app for two people: the person who runs a small shop, and
the person standing outside it wondering what's inside. I'll show you both."

---

## 2 · The shop everyone knows and nobody can find

- Most neighbourhood shops have no website, no online menu and no time to make one [NEED SOURCE:
  share of Indian micro-retailers without an online listing]
- The tools that exist assume a laptop, English and an afternoon of forms
- Customers end up asking around, or walking past shops that had exactly what they wanted

**Visual:** a photo of a real stall (from the video B-roll) next to an empty search results screen.
One big line, no chart, until we have a sourced number.

**Speaker notes:** "Ask anyone where to get good chai near them and they'll name a stall. Search
for it and it isn't there. The owner isn't lazy: every tool built for them starts with a form,
in English, on a laptop. They have a phone, a queue, and five minutes."

Before export: find one sourced number for this slide (for example a government MSME or retail
survey) or keep the slide qualitative.

---

## 3 · What Chalkboard does

- **Owners talk, the shop builds itself.** Voice in Hindi, Tamil, English and more; nothing to fill in
- **Customers ask like they'd ask a friend.** Answers come from shops' real menus, prices and hours
- **The day keeps it fresh.** Sold out, back in stock, tomorrow's prep, close the day from a till photo

**Visual:** three columns with one phone screen each: onboarding (frame from the video), customer
answer (`docs/ux/front-door-after/answer-390x844-light.png`), Today
(`docs/qa/manual-v2/01-today.png`).

**Speaker notes:** "Three things. Getting a shop online should take one conversation. Finding a shop
should feel like asking a neighbour. And the information has to stay true, so the daily jobs feed
it: what sold out, what to make tomorrow, how the day went."

---

## 4 · Owner story: from talking to live

- One sentence fills several fields: "मेरी दुकान अम्मा टी पॉइंट है, हम चाय और मैगी बेचते हैं"
- Name, what you sell, where you are: the shop is live. Hours and a photo are optional extras
- It only asks what fits the business: 0 irrelevant questions out of 215 across 40 test businesses
  (`docs/qa/onboarding-eval.md`)

**Visual:** three frames from the video take, left to right: talking with the shop card filling,
the pin on the map, "Review my shop" summary. Caption under each.

**Speaker notes:** "This is Gemini Live, in Hindi, on a normal phone. The owner never sees a form.
Corrections replace silently: if they say the name again, it just changes. Say 'बस' and it stops,
with nothing lost. We tested the questions on forty different businesses, a helmet shop, a tailor,
a pharmacy, a tuition centre, with Gemini grading every question: none was irrelevant. And in eleven
live Hindi runs over the real voice socket, all eleven shops went live with no drops and no
repeated question (`docs/qa/onboarding-live-check.md`)."

Depends on #91 being merged and live. If it isn't by export, use `docs/stories/new-shop-*` frames
and drop the eval line.

---

## 5 · Customer story: find, ask, come back

- Open a link, no install, no sign-up. Ask "चाय पास में" and get shops with the item, price and distance
- Tap a shop: menu in your language, chat answers instantly from the menu
- Scan the counter QR: a stamp, a scratch card, a reason to come back

**Visual:** three phones: Ask answer (`docs/ux/front-door-after/answer-390x844-light.png`), Hindi
shop page (`docs/qa/hindi/22-shop-page.png`), "First try! +50 points" scratch
(`docs/stories/games-phone-light-3-scratch.png`).

**Speaker notes:** "The customer side is one question box. The first answer appears in about a
tenth of a second, because we answer from our own shops first and let Gemini finish the sentence.
The shop page translates itself; the owner's item names stay as they wrote them. The stamp card is
the habit: one stamp a day, welcome stamps so the first visit already feels like progress, and a
scratch card with the odds printed on it."

---

## 6 · Google AI we actually use

- **Gemini 3.5 Flash on Vertex AI:** the coach and its tools, customer search intent, reading till
  slips and photos
- **Gemini Live (3.8 live) + Cloud Text-to-Speech:** the voice conversation and one consistent
  voice (Achernar) reading replies aloud
- **BigQuery AI.FORECAST (TimesFM):** seven-day demand per item, with 90% intervals

**Visual:** four tiles with the Google product names. Under them, a thin row: Firebase
Authentication · Firestore · Cloud Run. Nothing else on the slide.

**Speaker notes:** "These are the ones running in the product. Everything here is checked against
the code and the release settings in `docs/google-ai.md`." If asked about others: "We've also built
Vertex AI embeddings for search, Cloud Vision SafeSearch on photos, Maps Platform, Document AI for
receipts, Gemini grounding with Maps and a Recommendations AI catalogue of 479 products. They're
in the code behind switches, but we haven't verified them live, so we don't count them."

---

## 7 · How it's built

- One Cloud Run service: React on the front, FastAPI and a Google ADK coach agent behind it
- The coach only proposes; the owner approves every change before it's saved
- Firestore holds shops, chats and memory; every AI feature has a switch and an offline fallback

**Visual:** the diagram from `docs/architecture.md`, redrawn in brand colours: Phone → Cloud Run
(FastAPI + ADK) → Gemini / Gemini Live / Cloud TTS / BigQuery TimesFM / Firestore / Firebase Auth.
Grey out boxes that are not live (embeddings, SafeSearch, Maps, Cloud Storage), or leave them off.

**Speaker notes:** "Simple on purpose. One service, two front doors: the owner app and the customer
app share it. The ADK agent works through tools, and every tool that changes the shop produces a
review card instead of writing directly. That's how we let an AI touch a real business without it
going wrong quietly. When a provider is slow or down, each feature falls back to something labelled
and honest, never a blank screen."

---

## 8 · The retail track, feature by feature

- **Discovery and conversational shopping:** Ask, then chat with the shop; meaning-based search
- **Demand planning and inventory:** TimesFM forecasts, sold-out and back-in-stock in one tap,
  close the day from a till photo
- **Insights, personalisation, fraud:** a per-shop playbook Gemini writes, weekly recap, listing
  fraud checks

**Visual:** a table, one row per track item: feature · where it is in the app · evidence.

| Track item              | Feature                                              | Evidence                                                              |
| ----------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| Discovery               | Ask with meaning-based search                        | P@5 0.73 → 0.90 (`docs/impact/search-eval.md`)                        |
| Conversational shopping | Chat with the shop, instant answers                  | First answer 132 ms p50 (`docs/impact/customer-latency.md`)           |
| Demand planning         | TimesFM 7-day forecast in the coach                  | Live TimesFM result with 90% intervals (`docs/PLAN-V2.md`, 16 Oct)    |
| Inventory               | Close the day from a till photo                      | Gemini read 26/26 lines, 15/15 amounts (`docs/impact/document-ai.md`) |
| Customer insights       | Today pulse, weekly recap in the owner's language    | Live Hindi recap (`docs/qa/hindi-e2e.md`)                             |
| Personalisation         | Shop playbook built by Gemini per shop               | `docs/handoff/shop-playbook.md`                                       |
| Fraud                   | Listing checks: copied menus, odd prices, same phone | `docs/handoff/trust-fraud.md`                                         |

**Speaker notes:** "We built against the track list, not around it. Each row is something you can
tap in the app today, with the measurement next to it."

---

## 9 · What we measured

- Customers see the first answer in 0.13 s instead of 11.5 s (p50, `docs/impact/customer-latency.md`)
- Search finds the right shop more often: precision@5 0.73 → 0.90 with Vertex AI embeddings, and no
  empty answers (`docs/impact/search-eval.md`)
- The coach passed 25 of 27 live scenarios in 8 languages (`docs/impact/coach-eval-gemini-3.5-flash.json`)

**Visual:** five number tiles, big number + one line each:

| Number      | Line                                            | Source                                         |
| ----------- | ----------------------------------------------- | ---------------------------------------------- |
| 0 / 215     | irrelevant onboarding questions, 40 businesses  | `docs/qa/onboarding-eval.md` (#91)             |
| 11 / 11     | live Hindi voice onboardings went live, 0 drops | `docs/qa/onboarding-live-check.md` (#91)       |
| 25 / 27     | live coach scenarios passed, 8 languages        | `docs/impact/coach-eval-gemini-3.5-flash.json` |
| 0.13 s      | first customer answer, p50 (was 11.5 s)         | `docs/impact/customer-latency.md`              |
| 0.73 → 0.90 | search precision@5, 25 labelled queries         | `docs/impact/search-eval.md`                   |

**Speaker notes:** "These are small, honest tests, and we've written down their limits next to each
one. The search test is 20 fictional shops and 25 hand-labelled queries. The latency figure is the
first answer on screen, from our own shops, before Gemini's longer reply streams in. What we can't
claim yet is owner time saved in the real world: that needs real shops over weeks, and it's the
first thing the pilot measures."

Do not add the onboarding fixture times from `docs/impact/measurements.md` (they are scripted
automation, not owner time) or any photo → menu figure.

---

## 10 · Why this gets harder to copy over time

- **Fresh local data.** Owners update stock and prices daily because they get forecasts back; every
  unanswered customer question becomes demand data for that street
- **A network, not an app.** Customers, shops and the suppliers they buy from, on one search;
  every new shop makes the street more useful
- **Trust that's earned.** Fraud checks on listings and owners who verify; built up shop by shop

**Visual:** a simple loop diagram: owner updates → customers find and ask → unanswered questions →
coach suggests what to stock → owner updates.

**Speaker notes:** "The features can be copied in a week. What can't is months of fresh,
street-level stock and demand data, and the habit of opening Chalkboard every morning. The owner
gets something back every day, a forecast or a 'people nearby asked for this', so they keep it
true. That loop is the business."

---

## 11 · What's next

- **Every shop as an agent:** other AI assistants can ask a shop's agent what's in stock and hold
  it, with the owner approving in one tap
- **Suppliers in the loop:** forecast → purchase order → delivery → invoice, across different
  systems, translated for the owner
- **Faster voice:** first reply under 0.8 s (1.5–2.5 s today, `docs/qa/onboarding-live-check.md`)

**Visual:** a three-step timeline: Now (owners + customers) → Next (suppliers, agents) → Later
(a whole street on one network). Optional screenshot: `docs/stories/supply-1-draft.png`.

**Speaker notes:** "We're honest about what's next. The supplier flow is built with real document
formats but runs on sample files, not a live supplier system. The agent-to-agent piece is designed,
not shipped. And the voice is good but not yet instant; that's an engineering trade-off we're
working through. Recommendations AI has our catalogue and starts serving similar items once the
model trains."

---

## 12 · Try it

- Owners: **business.chalkboard.shreyaan.work** · Customers: **chalkboard.shreyaan.work**
- [OWNER: the ask, e.g. "We want 20 shops on one street for a four-week pilot" or "Help us reach
  shop owners in …"]
- Code: github.com/Shreyaanp/AI-Builder-Cup-2026

**Visual:** two QR codes (owner app, customer app) on chalk-green, the logo, the line from slide 1.

**Speaker notes:** "Scan either one now. If you run a shop, or know someone who does, we'd like to
hear from you." [OWNER: confirm the ask and the contact line.]
