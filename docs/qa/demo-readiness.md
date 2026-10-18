# Production Demo Readiness Audit

**Environment**: Production (`https://chalkboard.shreyaan.work` and `https://business.chalkboard.shreyaan.work`)  
**Viewport**: Mobile phone 390px (390 × 844)  
**Date**: 18 Oct 2026  
**Scope**: Verification of all customer and owner demo features for submission video recording.

---

## Feature Evaluation Matrix

| Feature                                   |   Result    | Note                                                                                                         | Screenshot                                                                                                                                                                                                                                                                                       |
| :---------------------------------------- | :---------: | :----------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Customer: landing "/"**                 |  **PASS**   | Clean responsive hero, value proposition, feature highlights, and Google Sign-in CTA.                        | [customer-01-landing.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-01-landing.png)                                                                                                                                                                |
| **Customer: /landing-preview**            |  **PASS**   | Full landing page proposal with preview banner and interactive comparison.                                   | [customer-02-landing-preview.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-02-landing-preview.png)                                                                                                                                                |
| **Customer: /how-it-works**               |  **PASS**   | Video walkthroughs autoplay smoothly in phone frames on scroll with player controls.                         | [customer-03-how-it-works.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-03-how-it-works.png)                                                                                                                                                      |
| **Customer: /features**                   |  **PASS**   | Comprehensive 6-pillar feature grid with crisp icons, plain-language copy, and deep links.                   | [customer-04-features.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-04-features.png)                                                                                                                                                              |
| **Customer: Ask "chai near me"**          |  **PASS**   | Dock composer accepts natural language queries with mic and send controls.                                   | [customer-05-ask.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-05-ask.png)                                                                                                                                                                        |
| **Customer: results**                     |  **PASS**   | Gemini-grounded results render interactive Google Map with shop pins and citation cards.                     | [customer-06-results.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-06-results.png)                                                                                                                                                                |
| **Customer: Browse**                      |  **PASS**   | "What's around me?" feed returns categorized nearby shops, distance tags, and map toggle.                    | [customer-07-browse.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-07-browse.png)                                                                                                                                                                  |
| **Customer: shop page**                   |  **PASS**   | Complete shop view with hours, demo disclaimer, 8-item menu with prices, and action chips.                   | [customer-08-shop-page.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-08-shop-page.png)                                                                                                                                                            |
| **Customer: Follow**                      |  **PASS**   | Clicking "+ Follow" updates immediately to "✓ Following" with haptic feedback.                               | [customer-09-follow.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-09-follow.png)                                                                                                                                                                  |
| **Customer: QR stamp (demo stamp)**       |  **PASS**   | Stamp tap increments count to 3/10 and triggers animated "+50 demo points" celebration modal.                | [customer-10-qr-stamp.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-10-qr-stamp.png)                                                                                                                                                              |
| **Customer: Passport**                    |  **PASS**   | Gamified passport displays progress ring (50 pts), "Newcomer" tier, next reward, and perks.                  | [customer-11-passport.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-11-passport.png)                                                                                                                                                              |
| **Customer: guest chat with shop**        |  **PASS**   | Guest inquiry bottom sheet provides quick query chips, custom input, and instant shop answers.               | [customer-12-guest-chat.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-12-guest-chat.png)                                                                                                                                                          |
| **Customer: Hindi + Tamil switch**        |  **PASS**   | Header picker switches app language instantly to हिन्दी and தமிழ் across all navigation and cards.           | [customer-13-hindi.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-13-hindi.png), [customer-13-tamil.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/customer-13-tamil.png)                                     |
| **Owner: Today (forecast card, AI chip)** | **PARTIAL** | Tomorrow prep plan forecast card and "Find suppliers" AI chip render; full Today tab needs sign-in.          | [owner-14-today-forecast.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-14-today-forecast.png), [owner-14-ai-chip-dialog.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-14-ai-chip-dialog.png)             |
| **Owner: coach chat (text)**              |  **FAIL**   | Interactive text coach chat is omitted from `/demo` (lives in AppShell Coach tab; requires Google sign-in).  | [owner-15-coach-chat-missing.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-15-coach-chat-missing.png) (Issue [#280](https://github.com/Shreyaanp/niva-starter/issues/280))                                                                           |
| **Owner: Shop/menu**                      |  **PASS**   | Menu tile opens 6-item catalog with minor-unit pricing, sold-out flags, and edit/import buttons.             | [owner-16-shop-menu.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-16-shop-menu.png)                                                                                                                                                                  |
| **Owner: edit details**                   |  **PASS**   | Displays address, category, and Google Maps handoff; "Edit" correctly enforces read-only mode toast.         | [owner-17-edit-details.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-17-edit-details.png), [owner-17-shop-details-sheet.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-17-shop-details-sheet.png)         |
| **Owner: Supply: purchase orders**        |  **FAIL**   | Inbound/outbound PO tracking board is not accessible in `/demo` (lives under Grow tab).                      | [owner-18-supply-missing.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-18-supply-missing.png) (Issue [#281](https://github.com/Shreyaanp/niva-starter/issues/281))                                                                                   |
| **Owner: reorder draft (WhatsApp)**       | **PARTIAL** | Tapping "Find suppliers" chip shows sample Coach dialog describing wholesaler WhatsApp reorder.              | [owner-19-reorder-draft-sample.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-19-reorder-draft-sample.png) (Issue [#282](https://github.com/Shreyaanp/niva-starter/issues/282))                                                                       |
| **Owner: order timeline**                 |  **FAIL**   | PO lifecycle timeline (Created → Changed → Shipped → Received → Closed) is unavailable in `/demo`.           | [owner-20-order-timeline-missing.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-20-order-timeline-missing.png) (Issue [#283](https://github.com/Shreyaanp/niva-starter/issues/283))                                                                   |
| **Owner: SAP document view**              |  **FAIL**   | SAP IDoc XML / JSON dual document viewer is located inside Supply POs, missing in `/demo`.                   | [owner-21-sap-view-missing.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-21-sap-view-missing.png) (Issue [#284](https://github.com/Shreyaanp/niva-starter/issues/284))                                                                               |
| **Owner: POS import screen**              |  **PASS**   | "Connect your system POS / ERP" tile opens full modal supporting 8 POS formats, file upload, and photo scan. | [owner-22-pos-import.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-22-pos-import.png)                                                                                                                                                                |
| **Owner: close the day**                  |  **FAIL**   | "Close the day" evening summary workflow is a tile in Grow tab, not included in `/demo`.                     | [owner-23-close-day-missing.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-23-close-day-missing.png) (Issue [#285](https://github.com/Shreyaanp/niva-starter/issues/285))                                                                             |
| **Owner: Grow**                           |  **FAIL**   | Grow navigation tab is not rendered in `/demo` (DemoApp does not have bottom navigation tabs).               | [owner-24-grow-missing.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-24-grow-missing.png) (Issue [#286](https://github.com/Shreyaanp/niva-starter/issues/286))                                                                                       |
| **Owner: You/settings**                   |  **FAIL**   | You/settings navigation tab is not rendered in `/demo`.                                                      | [owner-25-you-settings-missing.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-25-you-settings-missing.png) (Issue [#287](https://github.com/Shreyaanp/niva-starter/issues/287))                                                                       |
| **Owner: reminders toggle**               |  **FAIL**   | Web push reminder toggle (under You → Settings) is absent from `/demo`.                                      | [owner-26-reminders-toggle-missing.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-26-reminders-toggle-missing.png) (Issue [#288](https://github.com/Shreyaanp/niva-starter/issues/288))                                                               |
| **Owner: guided tour start + Next/Skip**  |  **PASS**   | Intro explainer starts automatically with 3 illustrated cards, Next navigation, and working Skip.            | [owner-27-guided-tour-card1.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-27-guided-tour-card1.png), [owner-27-guided-tour-card2.png](file:///C:/Users/pshre/work/agy-fix-demo-readiness-1632/docs/qa/demo-readiness/owner-27-guided-tour-card2.png) |

---

## SAFE TO FILM

These features are fully functional, verified on production at 390px mobile viewport, and safe to record for the submission video:

1. **Customer Frontdoors**:
   - Landing page (`/`) — Crisp value prop and responsive mobile layout.
   - Landing proposal preview (`/landing-preview`) — Clean dual comparison.
   - How It Works (`/how-it-works`) — Autoplaying phone demo videos.
   - Features directory (`/features`) — Full 6-pillar breakdown with links.
2. **Customer Discovery & AI Search**:
   - Ask AI search ("chai near me") — Smooth prompt entry and submission.
   - Search results view — Interactive Google Map with pins, Chalkboard shop badges, distance, pricing, and external citations.
   - Browse feed (`/explore/browse`) — Filterable shop cards with categorized pills and map view toggle.
3. **Customer Shop & Engagement**:
   - Shop page (`/explore/s/demo-bengaluru-indiranagar-coffee`) — Hours, full menu, payment methods, delivery tags.
   - Shop Following — Instant toggle to "✓ Following".
   - Stamp Card & Rewards — QR visit stamping with animated "+50 demo points" celebration modal.
   - Customer Passport (`/explore/passport`) — Animated progress ring, Newcomer tier status, perks, and streak tracking.
   - Guest shop inquiry — Bottom sheet inquiry with quick chips and AI answer assistance.
   - Multilingual localization — Instant switching between English, हिन्दी (Hindi), and தமிழ் (Tamil).
4. **Owner Public Demo (`/demo`)**:
   - Guided onboarding tour — 3-card explainer with Next and Skip controls.
   - Tomorrow prep plan forecast tile — Daily forecast quantities with demand trend lines.
   - AI supplier recommendation chip — Explains wholesaler sourcing in popup dialog.
   - Shop menu sheet — 6 categorized items with minor-unit pricing and sold-out indicator.
   - Shop details & Google Maps handoff — Location preview with read-only protection.
   - POS / ERP connector screen — Comprehensive connector modal (Petpooja, Tally, Zoho, Square, Loyverse, Shopify, SAP, file upload, photo scan).

---

## AVOID IN VIDEO

Do **not** attempt to film these workflows from the public `/demo` route without being logged into the prepared owner Google account (`shreyaan.9it@gmail.com`):

1. **Owner Coach Chat Text Interface**:
   - `/demo` does not provide an interactive text input for Coach chat (only renders the Shop screen and Prep plan tile).
2. **Supply Chain Management**:
   - Purchase orders inbound/outbound list, order timeline (Created → Changed → Shipped → Received → Closed), and SAP IDoc/XML inspection views are not mounted in `/demo`.
3. **Grow Tab & Evening Workflows**:
   - The entire Grow tab (including "Close the day" till reconciliation) is omitted from `/demo`.
4. **Owner Settings & Web Push Reminders**:
   - You tab and Reminders toggle are inaccessible without full account authentication.
5. **Private Tour Shops via Direct URL**:
   - Do not navigate directly to private tour shop URLs (such as `5e2f910d-36e2-5036-91f2-f8000a5ad94a`) anonymously; use seeded public demo shops like `demo-bengaluru-indiranagar-coffee` or `demo-katong-kopitiam`.
