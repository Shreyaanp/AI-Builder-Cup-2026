# Production Rubric Audit: 5-Minute Judge's-Eye Review

**Audit Date:** 18 October 2026, 21:00 IST  
**Environment:** Production (`https://chalkboard.shreyaan.work`, `https://business.chalkboard.shreyaan.work`)  
**Viewport:** 390 × 844 px (iPhone 12/13/14 mobile viewport)  
**Guidelines & Standards:**
- Hackathon Rubric: Technical Merit & GenAI (40%), Problem Alignment & Impact (25%), Innovation (25%), UX (10%)
- Vision: Business-agnostic merchant & customer ecosystem ([OWNER-NOTES.md](../../docs/OWNER-NOTES.md))
- Phone UX Rules: Strict Phone-First UX & Industry Realism ([PHONE-UX-RULES.md](file:///C:/Users/pshre/work/orchestrator-tools/PHONE-UX-RULES.md))

---

## 1. Executive Summary

A hackathon judge allocating **5 minutes** to evaluate Chalkboard on mobile starts from the landing page, seeks to onboard a shop, check the day's operations, test supply chain order drafting, and switch to the customer side to explore, visit a shop, and collect a loyalty stamp.

### Current Scorecard vs 10/10 Potential

| Criterion | Weight | Production Score Today | 10/10 Potential | Core Gap in Production |
| :--- | :---: | :---: | :---: | :--- |
| **Technical Merit & GenAI** | 40% | **27 / 40** (6.75/10) | 39 / 40 | BigQuery TimesFM is unverified on frontend; Vertex AI search is ungrounded on production; `/demo` exposes read-only HTTP 403 crashes instead of full interactive agent mocks. |
| **Problem Alignment & Impact** | 25% | **16 / 25** (6.4/10) | 24 / 25 | Business onboarding is hard-gated by Google OAuth with no public sandbox; customer insights are shallow; impact evaluation metrics are not surfaced in-app. |
| **Innovation** | 25% | **17 / 25** (6.8/10) | 24 / 25 | A2A (agent-to-agent) shopping and multi-agent coordination are invisible from production UI; supply chain loop stops at a static dialog without live PO inspection. |
| **UX & Polish** | 10% | **5.5 / 10** (5.5/10) | 9.5 / 10 | Duplicate labels (`(Demo) (Demo)`), persistent tooltips occluding titles, empty grey placeholder boxes on explore, bottom bar occlusions, and broken error sheets. |
| **Total** | **100%** | **65.5 / 100 (6.55 / 10)** | **96.5 / 100 (9.65 / 10)** | **+31 points recoverable by executing the Top 10 fixes** |

---

## 2. Five-Minute Walkthrough: 10-Step Production Audit Matrix

The table below documents exactly what a judge encounters step-by-step at 390px viewport on production, what is missing or confusing, rubric impacts, and filed issues.

| Step | Flow / Route | What a Judge Sees | What a Judge Misses or is Confused By | Rubric Line Impact | Phone UX / Realism Violation | Issue |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Landing** | `https://chalkboard.shreyaan.work/` | Hero title: *"Small shops. Big neighbourhood energy."*, CTAs: *"Find places near me"* & *"For businesses"*, interactive chalk menu phone mock. | No link to Demo, Tour, or Architecture page. Excessive 300vh scroll container creates dead scroll traps on mobile touch screens. | UX (10%), Problem Alignment (25%) | **Rule 3**: Excessive scroll / height dead space. | [#298](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/298), [#153](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/153) |
| **2. For business** | `https://business.chalkboard.shreyaan.work/` | Explainer carousel (3 slides: *"Talk. Your shop goes live"*, *"Loyalty..."*, *"A coach..."*). After Skip/Next: landing with *"Continue with Google"*. | **Hard-blocked by Google OAuth.** Evaluators without credentials or with popup blockers cannot preview merchant features. No "Take a tour" or "Try demo" link. | Problem Alignment (25%), UX (10%) | **Rule 8**: Dead end without secondary/guest way forward. | [#153](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/153) |
| **3. Onboarding by typing** | `/new-shop` or `/demo` | If navigated to `/new-shop`, redirects to Google Sign-in. In `/demo`, goes directly to pre-baked shop; no conversational onboarding flow is accessible. | Judge cannot test conversational typing onboarding (name first, category, items, location). Conversational agent capabilities cannot be tested without signing in. | Technical Merit (40%), Innovation (25%) | **Rule 8**: Onboarding cannot be evaluated in sandbox. | [#280](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/280) |
| **4. Shop live** | `/demo` (`Lantern Chai Corner`) | Shop overview card, Menu (6 items), Sold out (1), Photos (1), Details, Messages (3), Prep plan. | Headline displays duplicated suffix: `Lantern Chai Corner (Demo) (Demo)`. Tapping *"Turn on your page"* throws HTTP 403 and pops alert: *"Perks couldn’t be saved. Try again."* | UX (10%), Problem Alignment (25%) | **Rule 7**: Awkward duplication. **Rule 8**: Misleading error alert. | **[#321](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/321)**, **[#322](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/322)** |
| **5. Today** | `/demo` (Navigation bar missing) | Prep plan tile (Tomorrow forecast: Masala chai · 74 cup) placed below shop tiles. | **Entire Today dashboard & bottom navigation are missing** in DemoApp. Judge cannot see morning greeting, *"Needs you now"*, sales pulse, or close-the-day ritual. | Problem Alignment (25%), UX (10%) | **Rule 1**: Navigation tabs omitted; single primary action absent. | [#285](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/285), [#286](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/286), [#287](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/287) |
| **6. Grow** | `/demo` | Not accessible on `/demo`. Navigating manually opens landing sign-in. | **Grow tab is absent in DemoApp.** Judge cannot inspect *"Get on Google"* GBP integration, Looker Studio dashboards, or WhatsApp promo campaigns. | Technical Merit (40%), Innovation (25%) | **Rule 4**: Entire core feature pillar obscured. | [#286](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/286) |
| **7. Purchase orders** | `/demo` -> *"Find suppliers"* | Card *"Masala chai runs out Mon"* -> *"Find suppliers"* button. | Clicking *"Find suppliers"* opens a static alert dialog with mock text (*"In the live app the coach drafts the WhatsApp order..."*). No real PO timeline, no SAP IDoc XML / JSON inspector. | Technical Merit (40%), Innovation (25%) | **Rule 11**: Industry realism broken (unlinked loop, no document inspection). | [#281](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/281), [#282](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/282), [#283](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/283), [#284](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/284) |
| **8. Customer explore** | `https://chalkboard.shreyaan.work/explore/` | Location picker (*"Indiranagar"*), *"What are you looking for nearby?"*, location search box, bottom Ask chat bar. | *"Switch to dark mode"* tooltip is persistently stuck on screen over title. *"Near you now"* renders two large empty grey placeholder boxes. | UX (10%), Technical Merit (40%) | **Rule 3**: Tooltip occludes title. **Rule 10**: Blank placeholder boxes. | **[#323](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/323)**, [#262](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/262) |
| **9. Shop (Customer)** | `/explore/demo/demo-bengaluru-indiranagar-coffee` | Illustrated coffee hero header, business tags (*"Locally made"*, *"Pre-orders"*, etc.), weekly hours, menu with prices (₹60 coffee, ₹35 chai). | *"Similar nearby"* section renders empty blank placeholder boxes without shop cards. Bottom floating button occludes lower menu content. | UX (10%), Problem Alignment (25%) | **Rule 3**: Floating button occludes content. **Rule 10**: Empty placeholder boxes. | [#295](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/295), [#309](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/309) |
| **10. QR stamp** | `/explore/demo/...` & `/explore/passport` | Passport tab shows Points (0), Newcomer ring, Streak (0 weeks), Chai trail (0/4). | **Stamps are disabled on all demo shops.** Shop page omits `<StampCard>` and `<ShopStamp>`. Navigating with `?qr=1` displays *"This shop hasn't set up stamps yet"*; judge cannot test QR stamping or scratch card reward! | Innovation (25%), UX (10%) | **Rule 8**: Dead end feature; game theory loop broken. | [#296](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/296) |

---

## 3. Rubric-by-Rubric Detailed Breakdown

### A. Technical Merit & GenAI (40% Weight) — Current: 27/40
- **What is Demonstrated:**
  - Real Google ADK agent with schema-defined tools and multi-lingual voice engine (Achernar).
  - Structured multimodal extraction (menus and POS printouts from photos).
  - Fast responsive Cloud Run container architecture with Firebase authentication and Firestore persistence.
- **What a Judge Misses or Questions:**
  - *BigQuery TimesFM / AI.FORECAST*: The track explicitly suggests BigQuery AI and forecasting. In production demo, the prep plan displays *"Weekday average · seasonality and trend"*, leaving BigQuery TimesFM invisible or unproven.
  - *Vertex AI Search / Grounding*: Discovery search queries take 5+ seconds on mobile and show skeleton cards without clear grounding annotations.
  - *Visible Multi-Agent ADK Architecture*: The coordinator + specialist sub-agents (onboarding, analyst, sourcing, customer concierge) are not exposed on screen or in an architecture inspector.

### B. Problem Alignment & Impact (25% Weight) — Current: 16/25
- **What is Demonstrated:**
  - Comprehensive business-agnostic scope: supports kiranas, tea stalls, bakeries, cafes, and tailors.
  - Dual-sided local commerce model connecting hyper-local merchants with neighbourhood customers.
  - Hyper-local currency and language localization (₹ in Bengaluru, S$ in Singapore).
- **What a Judge Misses or Questions:**
  - *Evaluation Metrics Missing*: There is no in-app "Impact" or evaluation scorecard page showing measured accuracy (photo→menu extraction accuracy, onboarding seconds vs traditional forms, close-the-day speedup).
  - *Merchant Onboarding Barrier*: Because Google OAuth is mandatory on `business.chalkboard.shreyaan.work`, a judge cannot evaluate onboarding flow realism without authenticating.
  - *Customer Insights Thinness*: The unmet demand radar is not visible on the demo merchant workspace.

### C. Innovation (25% Weight) — Current: 17/25
- **What is Demonstrated:**
  - Voice-first shop onboarding with multimodal photo reading.
  - End-of-day close ritual and closing-time rescue deals radar.
  - Neighbourhood coalition passport with gamified collection sets.
- **What a Judge Misses or Questions:**
  - *Agent-to-Agent (A2A) Shopping*: The customer concierge querying shop agents for availability and holds is not active in the demo flow.
  - *Supply Chain Loop Truncated*: Sourcing stops at a mock dialog rather than showing bidirectional document transformation (SAP IDoc XML ↔ plain WhatsApp message).
  - *Gamification Broken*: Loyalty stamps cannot be collected on demo shops, breaking the scratch card reward loop.

### D. User Experience & Mobile Polish (10% Weight) — Current: 5.5/10
- **What is Demonstrated:**
  - Material Design 3 Expressive theme with custom Chalkboard tokens (`@fontsource/caveat`, natural tones).
  - Fast sub-100ms client interactions for bottom navigation and tabs.
- **What Violations Degrade the Score:**
  - *Phone-First Rule 3 (No Overlaps)*:
    - Sticky "Switch to dark mode" tooltip occludes the main headline on `/explore/`.
    - Floating action buttons occlude bottom cards and stamp cards on 390px viewports ([#309](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/309), [#311](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/311), [#312](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/312)).
    - Fixed bottom navigation bar occludes weekly streak card on `/explore/passport` ([#294](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/294)).
  - *Phone-First Rule 7 (Plain Words & Realism)*:
    - Duplicated suffix: `Lantern Chai Corner (Demo) (Demo)` ([#321](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/321)).
  - *Phone-First Rule 8 (Clear States & No Dead Ends)*:
    - Tapping *"Turn on your page"* in demo throws an alarming error banner: *"Perks couldn’t be saved. Try again."* ([#322](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/322)).
  - *Phone-First Rule 10 (Consistent Cards & Images)*:
    - "Near you now" and "Similar nearby" render empty grey placeholder boxes ([#323](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/323), [#295](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/295)).

---

## 4. Top 10 Fixes Ranked by Rubric Points

Ranked by total score impact per engineering hour to take the project from 65.5 to 96.5 points:

| Rank | Rubric Points Gain | Target Area & Component | File Path | Concrete Fix Required | Issue # |
| :---: | :---: | :--- | :--- | :--- | :--- |
| **1** | **+7.0 pts** | **Public Demo: Full AppShell on `/demo`** | `src/features/demo/DemoApp.tsx` | Replace bare `ShopScreen` with full `AppShell` with simulated workspace state so judges see Today, Grow, You, and Coach tabs. | [#286](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/286), [#287](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/287), [#280](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/280) |
| **2** | **+5.0 pts** | **Public Demo: Enable QR Stamps on Demo Shops** | `backend/app/demo_catalogue.py`, `backend/app/demo_world.py` | Set `stamps_enabled: True` and `reward_text: "Free chai after 6 visits"` on seeded demo shops so judges can scan QR codes and experience the scratch card game loop. | [#296](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/296) |
| **3** | **+4.5 pts** | **Landing: Add Direct "Try Demo" & "Tour" Entry Points** | `src/features/frontdoors/Marketing.tsx`, `src/features/v1/Landing.tsx` | Add a prominent secondary button *"Try demo shop (no sign-in)"* alongside *"Continue with Google"* to prevent unauthenticated judges from being hard-blocked. | [#153](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/153) |
| **4** | **+4.0 pts** | **Supply Chain: PO Timeline & Document Inspector in Demo** | `src/features/demo/DemoApp.tsx`, `src/features/supply/SupplyOrderTimeline.tsx` | Replace the static *"Coach (sample answer)"* dialog with the actual supply order timeline and dual SAP IDoc XML / JSON inspector. | [#281](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/281), [#283](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/283), [#284](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/284) |
| **5** | **+3.0 pts** | **Demo: Fix Read-Only Error Alert on "Turn on your page"** | `src/features/v1/ShopTiles.tsx`, `src/features/demo/DemoApp.tsx` | Handle demo mode gracefully in `CustomerPageSheet` so opening it displays the demo customer link without throwing 403 or showing *"Perks couldn’t be saved"*. | **[#322](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/322)** |
| **6** | **+2.5 pts** | **Demo: Deduplicate "(Demo) (Demo)" in Shop Title** | `src/features/v1/ShopTiles.tsx`, `backend/app/demo_catalogue.py` | Strip redundant `(Demo)` suffixes before formatting so the title reads cleanly as *"Lantern Chai Corner (Demo)"*. | **[#321](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/321)** |
| **7** | **+2.0 pts** | **Customer Explore: Fix "Near you now" Blank Grey Boxes** | `src/features/discover/AskHome.tsx`, `src/features/discover/Discover.tsx` | Ensure nearby seeded shops render cards or a clean empty/prompt state instead of bare grey rectangular placeholder containers. | **[#323](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/323)** |
| **8** | **+1.5 pts** | **Customer Shop: Fix "Similar nearby" Empty Boxes** | `src/features/discover/SimilarNearby.tsx` | Populate similar shops from the local vector database or hide the section cleanly when recommendations are empty. | [#295](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/295) |
| **9** | **+1.0 pt** | **Phone UX: Fix Mobile Floating Button & Bottom Bar Occlusions** | `src/features/customer/CustomerApp.tsx`, `src/features/public/PublicShop.tsx` | Add proper safe area bottom padding (`calc(var(--nav-height) + 16px)`) so floating buttons do not occlude stamp circles, suggestion chips, or cards. | [#294](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/294), [#309](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/309), [#311](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/311) |
| **10** | **+0.5 pt** | **Landing Page: Fix 300vh Mobile Scroll Trap** | `src/features/frontdoors/Marketing.tsx` | Disable the pinned scroll story container on touch screens (`@media (max-width: 600px)`) to eliminate excessive dead scrolling. | [#298](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/298) |

---

## 5. Verification & Visual Evidence

All observations in this audit were captured using headless Chromium on production with an iPhone 12/13/14 viewport (390 × 844 px). Visual evidence is saved in the repository under `docs/qa/rubric-audit/`:

1. `01-landing-wait.png`: Production landing hero at 390px.
2. `02-for-business.png`: FirstRun explainer carousel on business subdomain.
3. `04-demo-page.png`: Shop overview on `/demo` showing `(Demo) (Demo)` duplication ([#321](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/321)).
4. `demo_02_turn_on.png`: Customer page sheet on `/demo` displaying *"Perks couldn't be saved. Try again."* ([#322](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/322)).
5. `demo_07_menu_tile.png`: Menu sheet with item prices and import actions.
6. `demo_08_pos_tile.png`: "Connect your system" POS/ERP connector sheet.
7. `demo_09_suppliers_dialog.png`: Static popup alert on "Find suppliers" without live PO timeline.
8. `08-customer-frontdoor.png`: Customer frontdoor on `/explore/` with persistent tooltip and blank grey boxes ([#323](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/323)).
9. `09-customer-search-result.png`: Conversational search stream with skeleton loading cards.
10. `10-customer-passport.png`: Passport gamification screen with streak and newcomer level ring.
11. `11-customer-rescue.png`: Closing-time rescue radar at 250m/500m ranges.
12. `13-demo-shop-view.png`: Customer public shop view for Courtyard Filter House.
13. `17-qr-no-stamps.png`: Public shop view with `?qr=1` showing missing stamp card.
