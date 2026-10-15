# Chalkboard: what is built, what is not, and how Google powers it (15 Oct 2026, evening)

Status words: **Live** = on chalkboard.shreyaan.work now · **In PR** = built and tested, waiting
for merge · **Backend only** = API done, screens in a PR · **Not built** · **Off** = built but
switched off in production.

## The problem and the USP in one line

Small local shops cannot keep their information online, and neighbours cannot find what is
genuinely good nearby. Chalkboard lets an owner run their shop by **talking or snapping a photo**
(Gemini does the typing), and gives customers an **AI front door to their neighbourhood**, with
both sides connected by chat, follows, rescue deals and a stamp passport.

## How we use Google Cloud and Google AI

| Google technology                                                               | What it does in Chalkboard                                                                                                                                      | Status                                                                                     |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Gemini on Vertex AI (gemini-3.5-flash-lite) via the Agent Development Kit (ADK) | The owner's coach: an agent with tools that prepares sealed changes (menu, prices, sold out, facts, orders) the owner confirms with one tap                     | Live                                                                                       |
| Gemini Live (gemini-3.8-live)                                                   | Voice: "Chai is 20 rupees now, samosa sold out" by speaking; the agent calls the same tools                                                                     | Live (cloud mic fix shipped 224a2f5; verify)                                               |
| Gemini vision (structured output)                                               | Menu photo → whole shop and menu; till / delivery / stock photos → Close the day; PDF / Excel / photo imports                                                   | Live                                                                                       |
| Gemini structured output                                                        | Customer AI Ask (intent → real menu matches), instant answers from shop facts, chat translation, morning brief wording, demo neighbourhoods around any location | Live (brief: backend only)                                                                 |
| Vertex text embeddings                                                          | The coach remembers relevant past conversations per shop                                                                                                        | Live                                                                                       |
| Cloud Vision SafeSearch                                                         | Every uploaded photo is moderated before it is kept                                                                                                             | Live                                                                                       |
| Google Maps Platform (Places, Geocoding)                                        | Nearby discovery merges real Google places with Chalkboard shops; addresses and pins                                                                            | Live                                                                                       |
| TimesFM (BigQuery AI.FORECAST)                                                  | Demand forecast for the prep plan, rescue suggestions and morning brief                                                                                         | **Off** (production uses the weekday average; switch FORECAST_BACKEND=bigquery to turn on) |
| Firebase Authentication (Google sign-in)                                        | Owner and customer sign-in                                                                                                                                      | Live                                                                                       |
| Firestore                                                                       | Shops, menus, conversations, community, passport, leases                                                                                                        | Live                                                                                       |
| Cloud Run + Cloud Build + Cloud Storage + Workload Identity Federation          | Hosting, releases, photos, keyless CI deploys                                                                                                                   | Live                                                                                       |
| Google Business Profile                                                         | Guided "Get on Google" flow and preview                                                                                                                         | Live as a **simulator**; real publishing needs Google API approval (never claimed)         |

## Owner (vendor) side

| Feature                                                                                    | Status                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Sign in, consent, privacy, delete all my data                                              | Live (delete: two fixes live; hardening in PR #5)                                                                         |
| Create a shop from a photo, voice or text                                                  | Live, but the old "Add my shop" **modal** is still there; the new guided hero + AI chat onboarding is being built (PR #3) |
| Real GPS shop location with accuracy                                                       | In PR #3                                                                                                                  |
| Coach chat and voice; shop snapshot for faster replies                                     | Live                                                                                                                      |
| My shop tiles, menu by category, inline price edit, sold out, daily "still the same menu?" | Live                                                                                                                      |
| Import menu or sales (Excel, PDF, photo, notes)                                            | Live                                                                                                                      |
| Close the day from photos (till, deliveries, stock)                                        | Live (real phone photos fixed 40b7dec)                                                                                    |
| Prep plan forecast                                                                         | Live (weekday average; TimesFM off)                                                                                       |
| Sourcing: find suppliers, order in chat, follow up                                         | Live (labelled demo suppliers)                                                                                            |
| Messages inbox: reply to customers                                                         | Live                                                                                                                      |
| Customer facts (halal, payment, delivery, locally made…) asked by the coach                | Live                                                                                                                      |
| Shop gallery photos                                                                        | Live (uploads fixed 40b7dec)                                                                                              |
| Share page and QR (signed passport QR)                                                     | Live                                                                                                                      |
| Guided tour on a filled demo shop                                                          | Live (its "Start my own shop" opens the modal; fixed by PR #3)                                                            |
| Get on Google guided flow                                                                  | Live (simulator)                                                                                                          |
| Face check (optional, experimental)                                                        | Live                                                                                                                      |
| Rescue deals (owner sends leftovers to followers)                                          | Backend live; screens in PR #4                                                                                            |
| Morning brief                                                                              | Backend live; screens in PR #4                                                                                            |
| Unmet-demand radar ("Asked nearby")                                                        | Backend live; screens in PR #4                                                                                            |
| Group buying, price check, supplier radar                                                  | **Not built** (cut by the feature freeze)                                                                                 |

## Customer side

| Feature                                                                                       | Status        |
| --------------------------------------------------------------------------------------------- | ------------- |
| AI Ask front door (voice or text)                                                             | Live          |
| Today's 7 neighbourhood finds                                                                 | Live          |
| Browse list, map, filters, open now, halal, budget                                            | Live          |
| Shop page (calm layout, menu first, hours on demand, "why go" line)                           | Live          |
| Instant answers from shop facts                                                               | Live          |
| Sign in to chat with the owner; Chats tab; replies                                            | Live          |
| Follow shops and an updates feed (Saved)                                                      | Live          |
| Neighbour tips (moderated)                                                                    | Live          |
| Neighbourhood passport: stamps, levels, streaks, quests, festival trails, perks, opt-in board | Live          |
| Locally made badge and search                                                                 | Live          |
| Demo world: believable labelled demo shops around any location (Gemini)                       | Live          |
| Rescue tab: countdown deals, "hold one for me" in chat                                        | In PR #4      |
| Push notifications (reply arrived, rescue near you)                                           | **Not built** |
| 15 languages, light and dark, Chalkboard theme                                                | Live          |

## Connecting people (where it is seamless today, where it breaks)

| Connection               | Today                                                                                             | Friction                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Customer → owner         | Ask the AI first, then "Ask the owner" in chat (sign-in needed), question carried through sign-in | Owner only sees it when they open the app; nothing in the coach says "a customer is waiting" |
| Owner → customer         | Reply in Messages; translation exists                                                             | Customer only sees it if they reopen Chats; no badge in Today's 7                            |
| Owner → followers        | Price, sold-out and updates feed; rescue (PR #4)                                                  | Feed is pull-only                                                                            |
| Owner → supplier         | Coach finds suppliers, prepares the order, owner taps Send, chats                                 | Suppliers are demo; no supplier login                                                        |
| Customer → neighbourhood | Today's 7, tips, passport                                                                         | Customer flow still feels less intuitive and animated than wanted                            |

## Not built (by decision)

Group buying, price check, supplier radar, push notifications, real Google Business Profile
publishing (needs approval), payments (out of scope by design), the demo video and demo revamp
(planned after the flow fixes).
