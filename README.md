# Chalkboard

**Neighbourhood shops get online by talking to an AI coach; customers find them by asking.**

[Customer site](https://chalkboard.shreyaan.work) ·
[Owner app](https://business.chalkboard.shreyaan.work)

Built for the Google AI Builder Cup, Retail & Commerce track. Speak, type or photograph a menu:
Chalkboard turns it into details the owner can review, share and keep current. Neighbours ask
for what they need, see matching items and prices, and chat with the shop.

## A look inside

Existing story-test captures, with fictional shops and offline fixtures; these are not live-model
or physical-phone evidence.

| Talk to the coach                                                                                                                  | See what needs attention                                                                                                     | Ask for something nearby                                                                                                       | Collect a visit stamp                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| <img src=".github/assets/new-shop-4-speaking-light.png" width="190" alt="Owner onboarding with voice controls and a shop draft" /> | <img src=".github/assets/today-needs-phone.png" width="190" alt="Daily owner view with menu, low-stock and setup actions" /> | <img src=".github/assets/customer-ai-3-answer.png" width="190" alt="Customer answer with a matched item, price and map pin" /> | <img src=".github/assets/S8-3.png" width="190" alt="First shop visit earns a neighbourhood passport stamp" /> |

## The owner story

- Sign in with Google and tell the coach your shop's name and kind of business.
- Talk, type or add a menu photo; review the suggested items, prices, hours and location.
- Confirm and share your Chalkboard page or QR code so neighbours can find you.
- Say “Chai is sold out” or “Change the price”; check the change before saving.
- Close the day from sales or stock photos, see a prep forecast, and ask about suppliers or rescue deals.

## The customer story

- Choose your area and ask for something nearby, such as “coffee under $3”.
- Compare matched items, prices, distance and opening status; refine with “Cheaper?” or “Open now?”.
- Open a shop's page for its menu, directions and answers from its listed facts.
- Follow a shop for updates; sign in with Google to message the owner and return to Chats.
- Scan a shop's QR for passport stamps, explore local picks, or ask to hold a rescue deal.

Demo shops, replies and offers are labelled. Holds and supplier requests do not process payments.
Google sign-in identifies an account; the optional face check does not prove business ownership.
The Google guide hands submission to the owner on Google's pages; Chalkboard does not publish to Google.

## How to run locally

Prerequisites: **Node.js 24**, **Python 3.13** and **uv**. From the repository root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
uv sync --project backend --locked
uv run --directory backend --locked python -m scripts.seed_demo_shops --sqlite data/merchant.sqlite3 --city singapore
```

Keep each server running in its own terminal, both at the repository root.

Terminal 1:

```sh
npm run dev:backend
```

Terminal 2:

```sh
npm run dev
```

Open [Owner](http://127.0.0.1:3200/), [Customer](http://127.0.0.1:3200/explore/) or
[API docs](http://127.0.0.1:3300/docs). For the seeded shops, choose **Tiong Bahru, Singapore**
in the customer area picker and ask for a croissant. Create your own shop in the owner app;
the seeded shops belong to a fictional demo owner.

Use a fresh checkout with no provider configuration. The development launcher selects offline
coach, local sign-in and photo fixtures; no Google credentials are needed. Local voice exercises
transport, not speech recognition. Conversations and shop records use ignored local SQLite files.
Stop each server with Ctrl+C.

If the default ports are occupied, set `WEB_PORT` and `API_PORT` to unused ports in both terminals.

## Tech stack

- React 19, TypeScript, Vite, MUI and shared Material 3 colour roles; PWA manifests and service worker.
- Python 3.13, FastAPI, Google ADK and the Google Gen AI SDK; SSE text and WebSocket voice.
- Gemini on Vertex AI for coaching, photo reading and customer questions; Gemini Live and Cloud TTS prefer Achernar.
- Firebase Google sign-in, Firestore records/conversations/vector recall, Cloud Storage photos and Cloud Vision SafeSearch.
- Cloud Run serves the compiled frontend and API; BigQuery `AI.FORECAST` supplies TimesFM forecasts with a weekday-average fallback.

[Architecture](https://chalkboard.shreyaan.work/architecture) · [Backend guide](backend/README.md) ·
[Contributing](CONTRIBUTING.md)
