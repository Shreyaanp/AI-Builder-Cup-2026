# Judge's-Eye Production Audit against Hackathon Rubric

**Evaluation Date:** 18 October 2026  
**Evaluator Perspective:** Hackathon Judge (Retail & Commerce: Intelligent Customer and Business Experiences)  
**Viewport:** 390 × 844 px (iPhone / Pixel mobile standard, per `PHONE-UX-RULES.md`)  
**Production Targets:**  
- Customer Portal: `https://chalkboard.shreyaan.work`  
- Business Portal: `https://business.chalkboard.shreyaan.work`  
**Time Box:** 5 minutes end-to-end walk  

---

## 1. Executive Summary & Honest Judge Score

Chalkboard presents an ambitious, hyper-local commerce network connecting micro-merchants (tea stalls, kiranas, hawkers) with neighbourhood customers through Google GenAI. However, when an independent hackathon judge walks the production deployment with a 5-minute timer at 390 px, critical gaps in session architecture, authentication barriers, and mobile viewport collisions severely dilute the score.

### Score Breakdown (Weighted Total: 6.2 / 10)

| Criterion | Weight | Current Score | Target (10/10) Gap |
| :--- | :---: | :---: | :--- |
| **Technical Merit & GenAI** | 40% | **6.5 / 10** | Core Gemini Live voice & vision tools exist, but `/demo` crashes with HTTP 410 on Cloud Run multi-instance; TimesFM demand forecasting is inactive in public demo; Vertex Search is absent; multi-agent ADK architecture is hidden. |
| **Problem Alignment & Impact** | 25% | **6.5 / 10** | Strong alignment with un-digitized micro-retailers. Lacks verified impact metrics (e.g. seconds saved, extraction accuracy) on an in-app Impact dashboard; fraud protection is not demonstrated in the live flow. |
| **Innovation** | 25% | **6.5 / 10** | Standout concepts (voice onboarding, neighbourhood passport, closing-time rescue deals, supplier reorders). Misses full loop visibility: judge cannot experience PO translation or agent-to-agent negotiation in the unauthenticated flow. |
| **UX & Phone-First Polish** | 10% | **5.0 / 10** | High visual appeal in branding and typography, but several strict `PHONE-UX-RULES.md` violations: fixed bottom nav bars occluding content cards, sticky dark-mode tooltips stuck on touch viewports, blank placeholder boxes, and a 300vh dead scroll gap. |

---

## 2. 5-Minute Judge Journey: What the Judge Sees vs Misses

```mermaid
flowchart LR
    Landing["1. Landing<br/>(chalkboard.shreyaan.work)"] --> ForBiz["2. For Business<br/>(business.chalkboard.shreyaan.work)"]
    ForBiz --> Onboarding["3. Onboarding<br/>(By typing / Voice)"]
    Onboarding --> ShopLive["4. Shop Live<br/>(Celebration / Status)"]
    ShopLive --> Today["5. Today Tab<br/>(Pulse / Morning Brief)"]
    Today --> Grow["6. Grow Tab<br/>(Payments / Features)"]
    Grow --> PO["7. Purchase Orders<br/>(Supply Chain / Rules)"]
    PO --> CustExplore["8. Customer Explore<br/>(/explore/)"]
    CustExplore --> CustShop["9. Customer Shop<br/>(/explore/s/...)"]
    CustShop --> QRStamp["10. QR Stamp & Passport<br/>(?source=qr)"]
```

### Step 1: Landing (`https://chalkboard.shreyaan.work/`)
* **What the Judge Sees:**
  - Distinctive brand identity with dynamic title: *"Small shops. Big neighbourhood energy."*
  - Animated phone mockup with typewriter text (`"Kopi is $1.80..."`).
  - Clear primary actions: *"Find places near me"* (filled) and *"For businesses"* (outlined).
* **What the Judge Misses / Is Confused By:**
  - **Dead Scroll Area (`.lp-story` 300vh):** On a 390px phone, the scroll-story container has a hardcoded CSS height of `300vh` (~2,532px). After reading the three steps, the judge must scroll through ~2,000 pixels of empty whitespace before reaching *"What's fresh around the corner?"* (Issue [#298](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/298)).
  - **Hidden Trust Highlights:** Informational badges (*"Voice in 9 languages"*, *"You confirm every change"*) are hidden via `@media (max-width: 599px) { display: none; }`, robbing phone evaluators of key technical selling points.

### Step 2: For Business (`https://business.chalkboard.shreyaan.work/`)
* **What the Judge Sees:**
  - Three-slide carousel: *"Talk. Your shop goes live."* with Skip and Next buttons.
  - Sign-in page with *"Continue with Google"* and bottom *"Get started"*.
* **What the Judge Misses / Is Confused By:**
  - **SEV-1 Authentication Wall:** There is NO guest, demo, or tour entry point on the sign-in page. Both *"Continue with Google"* and *"Get started"* trigger a Google OAuth popup. An evaluator without test credentials cannot access the business portal.
  - **SEV-1 Demo Crash (`/demo` HTTP 410):** When an evaluator navigates directly to `/demo`, the app immediately displays: *"This demo has ended. Try again."* Tapping *"Try again"* generates a new workspace, but subsequent calls to `/api/v1/demo/sessions/{id}` fail with `410 DEMO_EXPIRED` (Issue [#293](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/293)). Root cause: multi-instance Cloud Run containers do not share the in-memory `public_demos` Python dictionary.

### Step 3: Onboarding by Typing
* **What the Judge Sees:**
  - Blocked by the sign-in requirement and `/demo` crash on production.
* **What the Judge Misses / Is Confused By:**
  - The judge cannot test business-type profile tailoring (e.g., verifying that a vegetarian shop is never asked halal questions, or testing typing fallback when the mic is blocked).

### Step 4: Shop Live
* **What the Judge Sees:**
  - Blocked on production unauthenticated flow.
* **What the Judge Misses / Is Confused By:**
  - In demo mode (`DemoApp.tsx`), the "Congratulations, your shop is live" celebration is entirely bypassed.

### Step 5: Today Tab (Coach / Dashboard)
* **What the Judge Sees:**
  - Blocked on `/demo` because `DemoApp.tsx` renders `<ShopScreen />` only, omitting `<AppShell />` and navigation tabs (Issue [#286](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/286), [#287](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/287)).
* **What the Judge Misses / Is Confused By:**
  - The judge misses the core "Today" rituals: morning brief with weather insights, daily coach line, unmet-demand radar card, and sales pulse charts.

### Step 6: Grow Tab
* **What the Judge Sees:**
  - Inaccessible in public demo mode.
* **What the Judge Misses / Is Confused By:**
  - Deep links for payments (UPI/PhonePe QR) and delivery rides (Rapido/Uber/Porter).
  - Google Business profile assistance and features checklist.

### Step 7: Purchase Orders & Supply Chain
* **What the Judge Sees:**
  - Tapping the supplier card in demo mode triggers: *"Demo only. Changes are turned off."* (Issue [#281](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/281)).
* **What the Judge Misses / Is Confused By:**
  - Dual document inspector (SAP IDoc XML ↔ plain JSON/WhatsApp).
  - Business rules engine (MOQ, credit terms, lead times, substitutions).
  - Realistic reordering flows for micro-merchants (violating Rule 11 of `PHONE-UX-RULES.md`).

### Step 8: Customer Explore (`https://chalkboard.shreyaan.work/explore/`)
* **What the Judge Sees:**
  - Hero with neighbourhood selector (*"Indiranagar"*), search bar, and bottom navigation (*Ask*, *Rescue*, *Passport*, *Chats*, *Saved*).
  - Browse feed displaying local Bengaluru shops (*Tiffin Window*, *Kapi & Ketli*, *Mallige Blooms*).
* **What the Judge Misses / Is Confused By:**
  - **Occluded Navigation Card:** The *"Today’s 7 near you"* card is partially cut off and occluded by the fixed bottom navigation bar on 390px screens.
  - **Persistent Dark Mode Tooltip:** The tooltip *"Switch to dark mode"* stays persistently stuck on initial load, directly covering the main heading *"What are you looking for nearby?"*.
  - **Blank Skeletons:** Under *"Near you now"*, two large empty gray rectangles render without text or images.
  - **Google Places 404 Errors:** Calls to `/api/v1/place-photo?name=places/...` return HTTP 404, causing photo cards to show broken image state (Issue [#297](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/297)).

### Step 9: Customer Shop (`https://chalkboard.shreyaan.work/explore/s/demo-story-bengaluru-chai`)
* **What the Judge Sees:**
  - Rich shop details for *Lantern Chai Corner (Demo)*: menu photo, verified owner badge, bio, tags (Locally made, No delivery, Cash, UPI), menu list with prices.
  - Interactive stamp card (*"2 of 10 stamps"*).
  - Community tips from neighbours.
* **What the Judge Misses / Is Confused By:**
  - **Blank Similar Nearby Boxes:** At the bottom, the *"Similar nearby"* section displays two completely blank gray rectangular placeholder boxes with no shop names, photos, or touch feedback (Issue [#295](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/295)).
  - Confusing chip *"Menu not confirmed yet"* rendered alongside *"Verified owner · Demo shop"*.

### Step 10: QR Stamp & Passport (`?source=qr` & `/explore/passport`)
* **What the Judge Sees:**
  - Visiting with `?source=qr` increments the shop stamp card from 2 to 3 stamps immediately.
  - Passport screen displays loyalty tier (*Newcomer*), collection quests (*Mithai and lights*, *Chai trail*).
* **What the Judge Misses / Is Confused By:**
  - **Occluded Weekly Streak Card:** The fixed bottom nav bar directly overlays and hides the *"Weekly streak: 0 weeks"* card, *"How it works"*, and streak freeze disclaimer (Issue [#294](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/294)).
  - **Desynchronized Stamp Book:** Even though the shop stamp card advanced to 3 stamps, the Passport still displays *"0 Points"* and *"Your first stamp is one QR away"* (Issue [#296](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/296)).

---

## 3. Rubric Evaluation Table

| Rubric Criteria & Weight | Score | What a Judge Sees | What a Judge Misses or Is Confused By |
| :--- | :---: | :--- | :--- |
| **Technical Merit & GenAI**<br>*(Weight: 40%)* | **6.5 / 10** | • Gemini Live voice agent and Multimodal vision tools in repository.<br>• Clean FastAPI backend with structured Pydantic models.<br>• Automated Playwright regression harness and axe-core accessibility tests. | • **Cloud Run Session Loss:** Public demo crashes with HTTP 410 on multi-instance Cloud Run.<br>• **Inactive Suggested Tech:** BigQuery `AI.FORECAST` (TimesFM) is off in demo; Vertex AI Search not active.<br>• **Hidden ADK Architecture:** Multi-agent coordinator/specialist hierarchy is not visible in-app. |
| **Problem Alignment & Impact**<br>*(Weight: 25%)* | **6.5 / 10** | • Addresses the real pain point of informal, un-digitized mom-and-pop shops.<br>• Multilingual localization (15 languages including Hindi, Tamil, Bengali).<br>• Local currency and payment support (UPI, SGD). | • **No Visible Impact Metrics:** Lacks an in-app "Impact" dashboard showing real accuracy, time-saved benchmarks, or user volume.<br>• **Broken Fraud Story:** Duplicate face check and suspicious listing detection are absent from the judge flow. |
| **Innovation**<br>*(Weight: 25%)* | **6.5 / 10** | • Voice-first onboarding with reactive audio feedback.<br>• Neighbourhood passport coalition loyalty with collection sets.<br>• Closing-time rescue deals radar.<br>• Vendor-to-vendor sourcing ideas. | • **Inaccessible Supply Chain Loop:** Reorder drafting, supplier rules, and SAP IDoc / EDI translation are locked behind "Demo only" alerts.<br>• **Agent-to-Agent (A2A):** Shop agent endpoints and concierge holds cannot be executed by an evaluator. |
| **UX & Phone-First Polish**<br>*(Weight: 10%)* | **5.0 / 10** | • Material 3 Expressive theme with custom Chalkboard brand tokens.<br>• Responsive 390px layout on primary views.<br>• Immediate stamp increments upon QR trigger. | • **Bottom Nav Collisions:** Bottom bar occludes "Today's 7" on Ask and "Weekly streak" on Passport.<br>• **Stuck Tooltips:** Desktop hover tooltips anchor persistently on mobile touch screens.<br>• **Blank Skeletons:** Multiple sections show empty grey boxes (Shop similar nearby, Explore near you now).<br>• **Dead Space:** 300vh scroll container leaves ~2,000px gap on mobile landing. |

---

## 4. `PHONE-UX-RULES.md` & Industry Realism Audit

| Rule # | Requirement | Production Status | Evidence / Violations |
| :---: | :--- | :---: | :--- |
| **1** | One purpose per screen, thumb zone primary action (≥ 48px) | ⚠️ Partial | Business sign-in offers two duplicate Google OAuth buttons. Customer Explore chat bar sits well in thumb zone. |
| **2** | 8-pt spacing scale only, 16px side margins, no touching edges | ⚠️ Partial | Padding is mostly clean, but `.lp-story` has a 300vh height creating an enormous ~2,000px void on mobile phones. |
| **3** | No horizontal scroll at 360px, nothing cut off, nothing overlapping | ❌ **FAIL** | **Violations:**<br>1. Ask screen: Bottom nav bar overlaps "Today's 7" card.<br>2. Passport screen: Bottom nav bar overlaps "Weekly streak" card.<br>3. Ask screen: Desktop "Switch to dark mode" tooltip overlaps page title. |
| **4** | Max ~5 items expanded; cards not tables; drill down with sheets | ✅ Pass | Shop menu items, Browse results, and Passport collection sets use card structures. |
| **5** | Theme tokens only, max 3 text sizes, body ≥ 16px, tabular numbers | ✅ Pass | Strict semantic Material 3 tokens; numbers are tabular. |
| **6** | Contrast WCAG AA in light & dark, never colour alone | ✅ Pass | Tested with axe-core; color contrast meets AA across surfaces. |
| **7** | Plain words, short labels (≤3 words), user's language, local currency | ✅ Pass | Currency matches location (₹ in Bengaluru, S$ in Singapore); short action labels. |
| **8** | Immediate feedback (<100ms), skeletons not spinners, clear error states | ⚠️ Partial | QR stamp increments in <100ms. However, empty skeleton cards linger indefinitely without error states in "Similar nearby". |
| **9** | Motion 150-250ms ease-out, respect reduced motion | ✅ Pass | CSS transitions respect `prefers-reduced-motion: reduce`. |
| **10** | Images real/faithful, consistent aspect ratio, never stretched | ⚠️ Partial | Google Places photos return HTTP 404 on explore feed; "Similar nearby" cards display blank shapes. |
| **11** | Industry Realism (size-appropriate workflows) | ⚠️ Partial | A tea stall using SAP IDoc XML violates micro-retail realism. Wholesale replenishment must prioritize WhatsApp/call simulation over ERP IDocs. |

---

## 5. Top 10 Fixes Ranked by Score Impact

| Rank | Fix / Initiative | Target Criteria | Points Impact | Description & Action |
| :---: | :--- | :---: | :---: | :--- |
| **1** | **Fix Cloud Run Multi-Instance Demo Sessions** | Technical (40) | **+12 pts** | Move `public_demos` from in-memory dictionary to Firestore or use signed stateless JWT sessions. Eliminates the Sev-1 HTTP 410 crashes on `/demo`. |
| **2** | **Add One-Tap "Take Tour / Demo" to Business Landing** | UX (10), Problem (25) | **+8 pts** | Place a prominent *"Try Demo Shop (No Sign-in)"* button alongside *"Continue with Google"* on `business.chalkboard.shreyaan.work` so judges can evaluate unblocked. |
| **3** | **Expose Full Tabs (`Today`, `Grow`, `PO`) in Demo Mode** | Technical (40), Innov. (25) | **+8 pts** | Update `DemoApp.tsx` to render the full `AppShell` with simulated read-only Today pulse, Grow features, and Purchase Order timeline rather than isolating `<ShopScreen />`. |
| **4** | **Fix Bottom Navigation Overlap on 390px Screens** | UX (10) | **+5 pts** | Add `padding-bottom: calc(80px + env(safe-area-inset-bottom))` to scroll containers in `Ask` and `Passport` so cards are never occluded by fixed navigation bars. |
| **5** | **Sync QR Stamp Scan to Customer Passport State** | Innovation (25), UX (10) | **+5 pts** | Ensure `/explore/s/...` stamp actions write to the local passport store (`niva.stamps.v1`) so points and quests update immediately when visiting `/explore/passport`. |
| **6** | **Fix Similar Nearby and Skeletons on Shop Page** | UX (10) | **+4 pts** | Populate the "Similar nearby" carousel with real category recommendations or unmount the section cleanly if no similar shops exist. |
| **7** | **Fix Google Places Photo Proxy 404 Errors** | Technical (40), UX (10) | **+4 pts** | In `backend/app/places.py`, ensure valid Places API photo references are passed, or return a clean SVG shop category placeholder when Places photos fail. |
| **8** | **Disable Hover Tooltips on Mobile Viewports** | UX (10) | **+3 pts** | Update `HoverTip.tsx` to check viewport width (`< 900px`) in addition to `(hover: none)`, preventing desktop tooltip bubbles from anchoring over mobile titles. |
| **9** | **Remove 300vh Dead Scroll Height on Mobile Landing** | UX (10) | **+3 pts** | In `landing.css`, restrict `.lp-story { height: 300vh; }` to desktop screens (`@media (min-width: 900px)`), setting mobile to `height: auto` with natural card stacking. |
| **10** | **Publish Public Evals / Impact Page (`/impact`)** | Problem (25) | **+3 pts** | Expose the measured accuracy and benchmark harness (photo-to-menu parsing, voice latency, seconds saved) on an accessible `/impact` link for judges. |

---

## 6. GitHub Issues Filed During This Audit

| Issue # | Type | Title | Status | Link |
| :---: | :---: | :--- | :---: | :--- |
| **#293** | `bug` | Production: `/demo` crashes with HTTP 410 DEMO_EXPIRED due to in-memory session loss across Cloud Run instances | **NEW** | [#293](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/293) |
| **#294** | `bug` | Customer Passport: Fixed bottom navigation bar occludes 'Weekly streak' card on 390px mobile | **NEW** | [#294](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/294) |
| **#295** | `bug` | Customer Shop: 'Similar nearby' section renders empty blank placeholder boxes without shop cards | **NEW** | [#295](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/295) |
| **#296** | `bug` | Customer Passport: QR stamp scan does not synchronize stamps or points to customer passport | **NEW** | [#296](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/296) |
| **#297** | `bug` | Customer Explore: Google Places photo requests fail with HTTP 404 in discover feed | **NEW** | [#297](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/297) |
| **#298** | `bug` | Landing page: Pinned scroll story container allocates 300vh creating excessive dead space on mobile phones | **NEW** | [#298](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/298) |

*(Note: Prior relevant issues inspected: #153, #204, #241, #243, #262, #280–#289).*
