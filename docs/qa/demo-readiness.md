# Production Demo Readiness Audit

**Evaluated Date:** 2026-10-18  
**Production Targets:**
- Customer App: `https://chalkboard.shreyaan.work`
- Owner App: `https://business.chalkboard.shreyaan.work` / `https://chalkboard.shreyaan.work/demo`
- Device Profile: Mobile phone, 390px viewport width (Pixel 7 / iPhone 14 standard)

---

## 1. Feature Readiness Scorecard

| Feature | Result | Note | Screenshot |
|---|:---:|---|---|
| Customer: landing `"/"` | **PASS** | Hero section renders clean value proposition, call-to-action buttons, and mobile navigation without overflow. | [`docs/qa/demo-readiness/customer-01-landing.png`](demo-readiness/customer-01-landing.png) |
| Customer: `/landing-preview` | **PASS** | Interactive product preview mockup and setup progress indicators load smoothly. | [`docs/qa/demo-readiness/customer-02-landing-preview.png`](demo-readiness/customer-02-landing-preview.png) |
| Customer: `/how-it-works` (videos play) | **PASS** | Both vendor and customer walkthrough demo videos (`vendor-en.mp4`, `customer-en.mp4`) autoplay with audio muted upon viewport intersection. | [`docs/qa/demo-readiness/customer-03-how-it-works.png`](demo-readiness/customer-03-how-it-works.png) |
| Customer: `/features` | **PASS** | Complete product feature catalog renders structured capability breakdowns and deep links. | [`docs/qa/demo-readiness/customer-04-features.png`](demo-readiness/customer-04-features.png) |
| Customer: Ask `"chai near me"` | **PASS** | Conversational composer accepts search prompt with active neighbourhood indicator and send trigger. | [`docs/qa/demo-readiness/customer-05-ask-chai.png`](demo-readiness/customer-05-ask-chai.png) |
| Customer: results | **PASS** | Grounded Maps search returns interactive map pins, photo cards, distance indicators, and matched local chai stalls. | [`docs/qa/demo-readiness/customer-06-results.png`](demo-readiness/customer-06-results.png) |
| Customer: Browse | **PASS** | Catalog renders 37 verified and nearby local shops with category and attribute filter chips (Open, Halal, Budget). | [`docs/qa/demo-readiness/customer-07-browse.png`](demo-readiness/customer-07-browse.png) |
| Customer: shop page | **PASS** | Seeded demo shop page (`Lantern Chai Corner`) displays operating hours, location details, verified trust chip, and structured menu. | [`docs/qa/demo-readiness/customer-08-shop-page.png`](demo-readiness/customer-08-shop-page.png) |
| Customer: Follow | **PASS** | Follow action button updates state dynamically between "Follow" and "Following" with persistent preference. | [`docs/qa/demo-readiness/customer-09-follow.png`](demo-readiness/customer-09-follow.png) |
| Customer: QR stamp (demo stamp button) | **PASS** | "Try a demo stamp" button triggers the stamp modal and increments customer loyalty card progress. | [`docs/qa/demo-readiness/customer-10-qr-stamp.png`](demo-readiness/customer-10-qr-stamp.png) |
| Customer: Passport | **PASS** | Passport dashboard displays weekly streaks, neighbourhood goals, stamp book collection sets, and perk tiers. | [`docs/qa/demo-readiness/customer-11-passport.png`](demo-readiness/customer-11-passport.png) |
| Customer: guest chat with a shop | **PASS** | "Chat with the shop" bottom action opens `ShopChat` sheet, allowing guest inquiry transmission. | [`docs/qa/demo-readiness/customer-12-guest-chat.png`](demo-readiness/customer-12-guest-chat.png) |
| Customer: Hindi + Tamil switch | **PASS** | Language switcher seamlessly renders Hindi (`हिन्दी`) and Tamil (`தமிழ்`) across navigation, headers, and buttons. | [`docs/qa/demo-readiness/customer-13-hindi.png`](demo-readiness/customer-13-hindi.png), [`docs/qa/demo-readiness/customer-13-tamil.png`](demo-readiness/customer-13-tamil.png) |
| Owner (public demo `/demo`): Today (forecast card, AI chip) | **PARTIAL** | Forecast card ("Prep plan Tomorrow") with predicted quantities and AI seasonality indicator is visible; full Today tab/view is omitted in `DemoApp`. | [`docs/qa/demo-readiness/owner-14-today-forecast.png`](demo-readiness/owner-14-today-forecast.png) |
| Owner (public demo `/demo`): coach chat (text) | **FAIL** | Conversational coach chat input is absent on `/demo` because `DemoApp.tsx` only mounts `ShopScreen` and `PrepPlanTile` ([#280](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/280)). | [`docs/qa/demo-readiness/owner-15-coach-chat.png`](demo-readiness/owner-15-coach-chat.png) |
| Owner (public demo `/demo`): Shop/menu | **PASS** | Menu tile opens modal listing categories, item prices, units, and sold-out flags. | [`docs/qa/demo-readiness/owner-16-shop-menu.png`](demo-readiness/owner-16-shop-menu.png) |
| Owner (public demo `/demo`): edit details | **PASS** | Details sheet opens with shop hours, address, and category; edit actions are safeguarded with "Demo only. Changes are turned off." | [`docs/qa/demo-readiness/owner-17-edit-details.png`](demo-readiness/owner-17-edit-details.png) |
| Owner (public demo `/demo`): Supply: purchase orders inbound/outbound | **FAIL** | Tapping supplier tile raises "Demo only. Changes are turned off." toast; PO inbound/outbound list is unreachable on `/demo` ([#281](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/281)). | [`docs/qa/demo-readiness/owner-18-supply-po.png`](demo-readiness/owner-18-supply-po.png) |
| Owner (public demo `/demo`): reorder draft (WhatsApp to wholesaler) | **FAIL** | Reorder draft and wholesaler WhatsApp preview action are inaccessible on `/demo` ([#282](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/282)). | [`docs/qa/demo-readiness/owner-19-reorder-draft.png`](demo-readiness/owner-19-reorder-draft.png) |
| Owner (public demo `/demo`): order timeline | **FAIL** | Multi-stage purchase order timeline is omitted from `/demo` view ([#283](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/283)). | [`docs/qa/demo-readiness/owner-20-order-timeline.png`](demo-readiness/owner-20-order-timeline.png) |
| Owner (public demo `/demo`): SAP document view | **FAIL** | Dual SAP IDoc XML / JSON translation viewer is omitted from `/demo` ([#284](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/284)). | [`docs/qa/demo-readiness/owner-21-sap-document.png`](demo-readiness/owner-21-sap-document.png) |
| Owner (public demo `/demo`): POS import screen | **PASS** | "Connect your system POS / ERP" tile opens dialog for till photo upload and ERP mapping. | [`docs/qa/demo-readiness/owner-22-pos-import.png`](demo-readiness/owner-22-pos-import.png) |
| Owner (public demo `/demo`): close the day | **FAIL** | "Close the day" workflow is under Grow tab, which is not mounted on `/demo` ([#285](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/285)). | [`docs/qa/demo-readiness/owner-23-close-the-day.png`](demo-readiness/owner-23-close-the-day.png) |
| Owner (public demo `/demo`): Grow | **FAIL** | Grow tab is missing on `/demo` due to omitted `AppShell` bottom navigation ([#286](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/286)). | [`docs/qa/demo-readiness/owner-24-grow.png`](demo-readiness/owner-24-grow.png) |
| Owner (public demo `/demo`): You/settings | **FAIL** | You/settings tab is missing on `/demo` ([#287](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/287)). | [`docs/qa/demo-readiness/owner-25-you-settings.png`](demo-readiness/owner-25-you-settings.png) |
| Owner (public demo `/demo`): reminders toggle | **FAIL** | Web push opening/closing reminders toggle is in You -> Settings, which is unreachable on `/demo` ([#288](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/288)). | [`docs/qa/demo-readiness/owner-26-reminders-toggle.png`](demo-readiness/owner-26-reminders-toggle.png) |
| Owner (public demo `/demo`): guided tour start + Next/Skip | **FAIL** | Guided tour launcher button is not exposed in standalone `/demo` view ([#289](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/289)). | [`docs/qa/demo-readiness/owner-27-guided-tour.png`](demo-readiness/owner-27-guided-tour.png) |

---

## 2. SAFE TO FILM (Submission Video Recommendations)

The following customer and owner features are completely verified, robust, and safe for recording the video demo on production:

### Customer Flow (`https://chalkboard.shreyaan.work/explore`)
1. **Landing & Explainer Pages:**
   - Landing page (`/`) with value proposition and clear navigation.
   - `/landing-preview` showing real mockups and interactive user flows.
   - `/how-it-works` showcasing live, autoplaying vendor and customer demo videos (`vendor-en.mp4` and `customer-en.mp4`).
   - `/features` highlighting comprehensive platform capabilities.
2. **AI & Grounded Discovery:**
   - Conversational Ask input ("What are you looking for nearby?").
   - Searching **"chai near me"** returns interactive Google Maps integration, high-resolution photo cards, distance indicators, and verified local shop listings.
   - **Browse catalog** (`/explore/browse`) with 37 discovered shops and reactive category/attribute filter chips (Open, Halal, Budget).
3. **Shop Interaction & Loyalty:**
   - Detailed Shop Page (`/explore/s/demo-story-bengaluru-chai` or `Lantern Chai Corner`) displaying opening hours, location details, verified trust badges, and categorized menus.
   - **Follow / Unfollow** toggle with real-time optimistic UI update.
   - **Demo QR Stamp** ("Try a demo stamp") displaying stamp animation and stamp card accumulation.
   - **Passport** (`/explore/passport`) showing weekly streak, neighbourhood goals, stamp book, and perks.
   - **Guest Chat:** Direct inquiry from the shop page opening `ShopChat`.
4. **Multilingual APAC Localization:**
   - Instant language switching to **Hindi (`हिन्दी`)** and **Tamil (`தமிழ்`)** with native typography and zero horizontal layout distortion at 390px.

### Owner Flow (`https://business.chalkboard.shreyaan.work/demo`)
1. **Menu & Product Upkeep:** Full interactive Menu sheet with categories, pricing, units, and sold-out indicators.
2. **Shop Overview & Details:** Reviewing opening hours, phone, and location with demo protection safeguards ("Demo only. Changes are turned off.").
3. **POS & Till Screen Import:** "Connect your system POS / ERP" sheet presenting till report photo upload and mapping options.
4. **Tomorrow Forecast Card:** Tomorrow's Prep Plan card showing itemized unit predictions and AI seasonality/trend indicators.
5. **Full Authenticated Owner Workspace (if filming as authenticated owner):**
   - For filming Coach chat, Grow, Supply chain, and Guided Tour, log in via Google sign-in as `shreyaan.9it@gmail.com` on `https://chalkboard.shreyaan.work/` (as documented in `docs/demo/DEMO-ACCOUNTS.md`), which unlocks the full 4-tab `AppShell` and seeded 8-week sales history.

---

## 3. AVOID IN VIDEO (When using Public Demo `/demo`)

Do **NOT** attempt to show the following features on the public unauthenticated `/demo` URL (`https://business.chalkboard.shreyaan.work/demo`), as they are not mounted in `DemoApp.tsx`:

1. **Coach Chat via Text:** Do not look for a text input dock on `/demo`; conversational chat is not rendered ([#280](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/280)).
2. **Supply Orders Inbound/Outbound:** Do not click "Find suppliers" on `/demo` expecting the PO manager; it raises a read-only toast alert ([#281](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/281)).
3. **Reorder Draft (WhatsApp to Wholesaler):** Cannot be triggered or reviewed from `/demo` ([#282](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/282)).
4. **Order Timeline:** Supply chain timeline component is omitted on `/demo` ([#283](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/283)).
5. **SAP IDoc XML / JSON Document View:** Enterprise document inspection is absent on `/demo` ([#284](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/284)).
6. **Close the Day:** Evening till closeout cannot be accessed from `/demo` ([#285](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/285)).
7. **Grow Navigation Tab:** Omitted from `/demo` shell ([#286](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/286)).
8. **You / Settings Tab:** Omitted from `/demo` shell ([#287](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/287)).
9. **Reminders Toggle:** Web push notification toggle cannot be reached from `/demo` ([#288](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/288)).
10. **Guided Tour:** "Take the tour" 8-step spotlight walkthrough launcher is not present on `/demo` ([#289](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/289)).
