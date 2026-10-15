# Account 3 status: customer side, AI-first (16 Oct 2026)

Brief: `docs/briefs/task-CUSTOMER-AI-FIRST.md`. Branch `feat/customer-ai-first`, PR into main.
Ports used: web 3477, API 3577.

## What changed

**Front door = a conversation** (`src/features/discover/AskHome.tsx`, `AnswerCards.tsx`,
`askThread.ts`, `conversationCopy.ts`).

- Opens on "What are you looking for nearby?", the area as a 48-px button (change it inline), one
  line saying how many shops it checks there, up to four chips built from the area's **own** shops
  (most common item names, "Deals tonight" when a rescue is live, "Open now nearby", "Locally
  made"; the visitor's onboarding interests and generic suggestions fill gaps), and one calm
  "Today's 7 near you" card. Composer (text + browser speech where available) pinned above the
  nav, in the thumb zone.
- Each question becomes a turn: the customer's bubble, a thinking state (typing dots, rotating
  lines, two forming cards), then the answer: shop cards with the **exact matched item and its
  price** (handwritten), a rescue deal strip or "Locally made", open/closed, distance (or distance
  from the station), "Demo shop"; a mini map drawn locally from the answer's coordinates (no map
  SDK, numbered pins match the cards, tap a pin to show its card); Google places as a quiet
  three-row list; the honest "Sample neighbourhood · demo shops are generated" note once per page.
- **Follow-ups keep context**: "Cheaper?", "Open now?", "Near the MRT?" (Singapore; "Near a
  station?" elsewhere in English, localised everywhere), "Any deals?", plus one AI follow-up.
  Typed follow-ups work too ("open now?", "cheaper", "near the MRT", and common words in the
  supported languages). The applied refinements show as one grey line ("Cheapest first · Open now ·
  Near Tiong Bahru MRT"). Only the latest answer offers chips.
- States: thinking with **Stop**, failed (**Try again / Cancel**), **offline** (said plainly,
  retried automatically when the connection returns), stopped, empty ("Nothing nearby matches
  'kopi' yet" + Browse everything). Never a dead end.
- Today's 7 opens **inside the thread** (the existing deck), not as a dashboard section.
- The conversation is kept for the tab (sessionStorage, last 12 turns); **back from a shop or a
  chat returns to the same place** (`customerBack` in `frontdoors/navigation.ts` goes back in
  history when the visit came from inside the app; shared links still open their own target).
  View transitions: the card photo morphs into the shop hero; pages cross-fade/slide; all off under
  reduced motion.
- "New conversation" resets the thread.

**Backend (customer APIs only)** (`backend/app/discover_ask.py`):

- `POST /api/v1/discover/ask` accepts `context` (the previous answer's intent) and `refine`
  (`price | distance | transit | open | deals | local`, sent by chips so every language refines
  the same way). Deterministic `follow_up()` merges a follow-up into the previous search (keeps the
  subject, adds the refinement; a new subject keeps dietary needs); the Gemini prompt also gets
  the previous search. New intent fields `sort`, `near`, `deals`.
- "Near the MRT": nearest station from Google Places when live; offline, a small table of
  approximate public station positions for the demo neighbourhoods, labelled demo; results within
  1 km of it, distances from it. No station → "No station nearby · closest first".
- Picks carry live rescue deals (`deal`), from the existing rescue feed (demo rescues labelled).
- `GET /api/v1/discover/suggest?lat&lng`: the area's top item names, shop/open/locally-made/deal
  counts (no model call; rate limited `discover:suggest`).
- OpenAPI and `src/api/generated.d.ts` regenerated.

**Heatmap audit** (`tests/heatmap/`, `scripts/heatmap-report.mjs`, `docs/qa/customer-heatmap.md`,
`docs/qa/heatmap/`): before (`0078ab9`) vs after for 10 screens + 2 new, phone/desktop × light/dark,
with overlays. Fixes: 48-px targets everywhere it found small ones (front-door chips, theme/profile
buttons, shop actions, shop-chat chips and field, chat header, quest stops), 16-px shop gutter,
spacing on the 4/8 grid in shop/chat/Saved, calmer demo label and closed dot on the shop page,
one Today heading, calmer Today entry.

**Other**: welcome/first visit unchanged in structure (location → one-tap interests); the picked
interests now seed the front-door chips.

## Tests

- New `tests/customer-ask.spec.ts`: front door (real local chips, Today's 7 in the thread, axe),
  a real pinned shop answering with its exact item and price + map + **back returns to the same
  place**, **follow-up context** (request bodies carry `context`/`refine`; cheaper → open now →
  station), errors (retry, cancel, offline auto-retry, stop), empty state, axe light/dark ×
  phone/desktop with screenshots.
- Backend: `test_follow_up_keeps_the_subject_and_adds_the_refinement`, station anchor + cheaper,
  chip refinements in any language, first-chip filters, suggestions from the area's shops.
- Updated: `tests/stories/s3.spec.ts`, `s8-passport.spec.ts`, `customer-flow.spec.ts`,
  `customer-chat.spec.ts`, `frontdoors.spec.ts`, `story-page-recovery.spec.ts`,
  `tests/qa/discovery.spec.ts`.
- Screenshots: `docs/stories/customer-ai-*.png` (front door, thinking, answer, follow-ups, error,
  offline, empty, answer phone/desktop × light/dark) plus the refreshed `customer-*` journey shots.

## Results

See the PR description for the final numbers of `npm run check`, `npm run test:qa` (fresh DBs)
and the backend suite.

## Not done / honest limits

- Browser emulation only; no physical phone. Speech uses the browser's own recognition where it
  exists (owner voice hook untouched, as the brief required).
- Offline station positions are approximate and only for the demo neighbourhoods; live uses Places.
- Answer cards add words per first screen (45 → 89 on a phone) because they now carry item, price,
  deal, distance and open state; density stays spread (see the audit).
- `customer-chat.spec.ts` needs the seeded Singapore demo shops and skips otherwise (unchanged).
