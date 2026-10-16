# Hackathon review: where Chalkboard scores and how to reach 10/10 (16 Oct 2026)

**Track:** Retail & Commerce: Intelligent Customer and Business Experiences (discovery,
personalization, conversational shopping, demand planning, inventory, customer insights, fraud;
suggested: Vertex AI Search, BigQuery/BigQuery AI, Looker, Cloud Run, Cloud Storage, Cloud SQL).
**Submission (18 Oct):** live Cloud Run URL, public GitHub, demo video < 3 min, deck as PDF, English.
**Rubric:** Technical merit & GenAI 40% · Problem alignment & impact 25% · Innovation 25% · UX 10%.

## Honest score today: about 6.5 / 10

| Criterion (weight)               | Today | Why                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical merit & GenAI (40%)    | 7     | Real ADK agent with tools, Gemini Live voice, Gemini vision extraction, structured output, embeddings memory, SafeSearch, Maps, Firestore, Cloud Run, keyless CI. Missing: the track's suggested tech (TimesFM/BigQuery AI is OFF, no Vertex AI Search), no visible multi-agent design, fraud check not working, no published evaluation numbers. |
| Problem alignment & impact (25%) | 6.5   | Covers discovery, conversational shopping, demand planning, inventory, sourcing. Weak: customer insights are thin, fraud is broken, and there is no measured impact (time to list a shop, accuracy of photo reading, minutes saved per day).                                                                                                      |
| Innovation (25%)                 | 7     | Voice-first shop onboarding, close-the-day from photos, rescue deals, vendor-to-vendor sourcing, neighbourhood passport, AI front door. Needs to be visible and coherent in one story.                                                                                                                                                            |
| UX (10%)                         | 5.5   | Owner feedback: flows hard to follow, customer side not the vision, mic failure handling, spacing. Being fixed tonight.                                                                                                                                                                                                                           |

## What makes it 10/10 (ranked by score impact per hour)

1. **Turn on TimesFM via BigQuery AI.FORECAST** (demand planning is named in the track; BigQuery
   AI is a suggested tech). Code exists; one switch + IAM. Owner decision needed (small BigQuery
   cost; free tier likely covers demo volume).
2. **One semantic search engine on Vertex AI** (embeddings + vector search, or Vertex AI Search)
   for customer product/producer search AND vendor-to-vendor sourcing (owner's track H). Hits
   "discovery", "conversational shopping" and a suggested tech in one move.
3. **Visible multi-agent ADK design**: a coordinator with specialist sub-agents (onboarding,
   insights analyst, sourcing buyer, customer concierge), and agent-to-agent hand-off where the
   customer's concierge asks the shop's agent (instant answers, holds). Show it in the deck.
4. **Fraud that works**: duplicate-owner face check (optional, real flow) plus Gemini checks for
   suspicious listings (same phone/photos across shops, impossible prices). The track names fraud.
5. **Customer insights for owners**: "what people nearby asked for and couldn't find" (radar),
   peak hours, top questions, as chart cards in the coach; optional Looker Studio view on BigQuery.
6. **Personalization**: the customer's taste profile (passport, follows, asks) shapes Today's 7 and
   AI answers ("you like filter coffee: this new stall opened 300 m away").
7. **Measured impact in the product and deck**: an evaluation harness with real numbers
   (photo→menu accuracy, voice onboarding time vs a form, close-the-day minutes), shown on a
   small "Impact" page and in the deck.
8. **Flawless demo path**: seeded demo world, the 3-minute video script that walks owner → customer
   → supplier, zero bugs (regression every 3 h), voice mode and voice back perfect.
9. **Coherent product story**: Features page, AI guide, landing that screams merchant + customer.

## New features worth adding (only if they serve the rubric)

- **Agent-to-agent shopping**: customer says "find me 2 kg fresh paneer by 6 pm"; the concierge
  asks nearby shop agents, gets availability and a hold, owner approves with one tap.
- **Demand radar to supply**: unmet demand nearby → coach suggests stocking it → sourcing from
  another vendor (closes the Forecast → Source → Sell loop on screen).
- **Voice morning brief**: the coach speaks the day's plan (forecast, low stock, waiting customers).
- **Trust badge**: verified-owner (face check) + fresh menu badge on customer cards.

## Moat: why this cannot be copied tomorrow (for the deck)

Features can be copied in a week; what compounds cannot:

1. **Live local availability + unmet-demand data**: owners keep stock/prices fresh daily in seconds
   (voice/photo) because they get forecasts back; every unanswered customer question becomes
   demand data ("12 people within 1 km asked for filter coffee"). Months of fresh hyperlocal
   stock and demand signals are the moat. Demo: demand radar → coach suggests stocking → supplier.
2. **Every shop is an agent (A2A)**: each shop is published as an ADK agent endpoint other AI
   assistants can query and transact with (availability, holds), owner approves in one tap.
   "We make every small shop reachable by AI, with no website and no API." Infrastructure, not an
   app. Planned with track K (agent-to-agent shopping).
3. **Three-sided local network**: customers, shops and suppliers (vendor-to-vendor sourcing
   graph) plus a coalition passport across a whole street; each new shop adds value for all.
4. **Trust layer**: verified-owner badge (optional face check + fresh-menu proof) and fraud
   checks; earned over time, not copyable.
5. **Daily habit and owned data**: close-the-day ritual, voice in the owner's language, their own
   forecasts; switching means losing them.
   Pitch frame: a data flywheel plus an agent network.
