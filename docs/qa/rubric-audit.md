# Production Rubric Audit: A Judge’s-Eye Review

**Target:** Production (`https://chalkboard.shreyaan.work`, `https://business.chalkboard.shreyaan.work`)  
**Viewport:** 390 × 844 px (Mobile phone viewport, touch interaction, light default theme)  
**Evaluator Persona:** Hackathon Judge with a strict 5-minute evaluation window  
**Rubric:**
1. **Technical Merit & GenAI (40%)**
2. **Problem Alignment & Impact (25%)**
3. **Innovation (25%)**
4. **UX & Polish (10%)**

---

## 1. Executive Summary & Honest Judge Scorecard

In a rapid 5-minute judge walk, Chalkboard demonstrates deep architecture and strong design sensibility. However, critical gaps between backend capability and evaluator visibility dilute its score on production. Evaluators without pre-configured accounts hit sign-in walls, key Google AI technologies (TimesFM, Vertex AI Search, Multi-Agent ADK) operate silently without in-app proof or attribution, and lingering production data inconsistencies (e.g. INR symbols appearing in Singapore search results) distract from the experience.

| Criterion | Weight | Current Production Score | Potential Score | Primary Blockers on Production |
| :--- | :---: | :---: | :---: | :--- |
| **Technical Merit & GenAI** | 40% | **27 / 40** | **38 / 40** | No live attribution of TimesFM / BigQuery AI; multi-agent ADK coordination not visible on screen; Vertex AI search engine uncredited; no in-app evaluation / accuracy numbers. |
| **Problem Alignment & Impact** | 25% | **16 / 25** | **24 / 25** | Food-heavy landing distracts from business-agnostic vision (retail, services, tailors); no measured impact metrics page (minutes saved, photo accuracy); fraud checks deferred. |
| **Innovation** | 25% | **18 / 25** | **24 / 25** | Voice mode and counter QR stamp are powerful but hidden behind auth / disabled stamps on production demo shops; A2A shopping not surfaced in 5-minute walk. |
| **UX & Polish** | 10% | **6.5 / 10** | **9.5 / 10** | Unauthenticated business landing blocks preview with Google OAuth (#153); "Step 1 of 5" misleading stepper (#204); mixed currencies in search results (#203); silent QR stamp failure (#205). |
| **TOTAL** | **100%** | **67.5 / 100 (6.8 / 10)** | **95.5 / 100 (9.6 / 10)** | **+28.0 points reachable with top 10 targeted fixes.** |

---

## 2. 5-Minute Judge Journey: Screen-by-Screen Walkthrough Table

The audit walked the exact judge path specified in the task brief:
`Landing` → `For business` → `Onboarding by typing` → `Shop live` → `Today` → `Grow` → `Purchase orders` → `Customer explore` → `Shop` → `QR stamp`.

| Step # & Screen | Rubric Line | What a Judge SEES | What a Judge WOULD MISS or BE CONFUSED BY | Evidence / Issues |
| :--- | :--- | :--- | :--- | :--- |
| **1. Landing Page**<br>`chalkboard.shreyaan.work/` | Problem & Impact (25%)<br>UX (10%) | - Hero: *"Small shops. Big neighbourhood energy."*<br>- Prominent dual CTAs: **Find places near me** and **For businesses**.<br>- 3-step value story: *Send a photo*, *Talk it through*, *Share your page*.<br>- Bento cards highlighting local voices across APAC, hands-free voice, one-tap sold-out, and auto-generated weekly recap. | - **Food-centric copy**: Copy mentions "menus" and "storefront", obscuring the **business-agnostic vision** (tailors, salons, grocers, repair shops) emphasized in owner notes.<br>- **No Judge Quick-Tour**: A judge must click through separate paths; there is no 60-second guided interactive demo walk button.<br>- **Zero tech attribution**: No mention of Gemini 3.5, Google ADK, or Vertex AI on the public storefront. | Screenshot:<br>`01-landing-phone.png`<br>Clean responsive layout at 390px. |
| **2. For Business (Sign-in)**<br>`business.chalkboard.shreyaan.work/` | Technical Merit (40%)<br>UX (10%) | - Screen title: *"Chalkboard"*, *"Your shop, online in one conversation"*.<br>- Primary CTA: **Continue with Google**.<br>- Secondary CTA: **Get started**.<br>- 3-step explainer cards: Snap your chalkboard, Check and confirm, Share your live page. | - **FATAL EVALUATION BLOCKER**: Clicking *Get started* triggers Google OAuth popup (#153). Judges evaluating in automated/sandboxed browsers or without linked credentials are completely blocked from seeing the owner workspace.<br>- **Misleading Stepper**: Masthead displays **"Step 1 of 5"** on an unauthenticated sign-in screen before any interaction has occurred (#204).<br>- No instant local preview / demo shop entry point. | Issues:<br>[#153](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/153)<br>[#204](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/204)<br>Screenshots:<br>`02-business-landing.png`<br>`03-after-get-started.png` |
| **3. Onboarding by Typing**<br>`/new-shop` flow | Technical Merit (40%)<br>Innovation (25%) | - Full-screen conversational AI onboarding flow.<br>- Gemini coach greets with opening question, prompting for name and category.<br>- Real-time updating **"Shop so far"** card showing parsed fields dynamically.<br>- Inline options to speak or type freely. | - Saying or typing *"I'm finished"* or *"I'm done"* does not reliably advance directly to review across all languages without explicit button taps (#191).<br>- Typing non-food businesses (e.g. hair salon, hardware) historically triggered food questions (halal/veg) unless business-type profiles are strictly enforced.<br>- Long shop names truncate or overlap the header "Review my shop" button (#109). | Issues:<br>[#191](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/191)<br>[#141](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/141)<br>[#109](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/109) |
| **4. Shop Live**<br>Ready Celebration | Innovation (25%)<br>UX (10%) | - Dedicated celebration view: *"Congratulations, [Shop Name] is live!"*<br>- Rendered public URL link (`/s/[id]`).<br>- Generated QR code image for counter display.<br>- Direct CTA: **"Continue with my shop"** and **"Open my shop page"**. | - Unclear whether the shop is immediately queryable by the customer AI concierge or Google Maps.<br>- The distinction between local preview publishing and Google Business Profile publication is subtle. | Fixed in #180.<br>Verified in acceptance tests. |
| **5. Today Dashboard**<br>`/?tab=coach` (Today) | Technical Merit (40%)<br>Problem & Impact (25%) | - Personalized daily coach greeting.<br>- **Needs you now** action items (max 3 pending tasks).<br>- **Your shop today** pulse: yesterday sales, demand requests, regular stamps, forecast card.<br>- Collapsible interaction during voice/chat conversations. | - **BigQuery TimesFM invisible**: The forecast chart looks like a simple heuristic/moving average; judges cannot see that it is powered by **Google Cloud BigQuery AI TimesFM** demand forecasting.<br>- If no demo sales history is loaded, Today cards appear empty or sparse.<br>- No explicit metric badge for "forecast confidence" or "accuracy". | Owner Notes (16 Oct).<br>Needs BigQuery AI badge / attribution card. |
| **6. Grow Screen**<br>`/?tab=grow` (Playbook & Radar) | Problem & Impact (25%)<br>Innovation (25%) | - **Shop Playbook**: Structured goals, key metrics, vocabulary, target segments.<br>- **Unmet-Demand Radar**: Shows what neighbours searched for nearby that were unavailable.<br>- Sourcing suggestions and group-buy opportunities with nearby merchants. | - Demand radar signals look static unless the judge realizes they are live customer search misses.<br>- Sourcing opportunities default to food staples (flour, chai, sugar); non-food retail misses tailored supplier cards.<br>- Missing a 1-click "Stock this item" action connecting demand radar directly to purchase order drafting. | Track H / Track K.<br>Moat Flywheel: Demand Radar → PO → Supplier. |
| **7. Purchase Orders**<br>`/?tab=supply` | Technical Merit (40%)<br>Innovation (25%) | - Linked supply chain loop: Forecast drafts PO → supplier confirmation → ASN/dispatch → invoice.<br>- AI document translation between incompatible systems (SAP IDoc XML ↔ JSON/CSV).<br>- Uncertainty flags on ambiguous fields.<br>- Plain-language cards on mobile: *"PO 4500012345: 20 kg flour by Fri. Accept?"*. | - Without sample SAP documents pre-loaded, a judge won't witness the XML-to-JSON AI translation.<br>- Lack of visible schema diff or AI translation confidence pill showing the multi-format translation engine in action.<br>- Past bugs with null backorders / numeric PO formatting (#119, #120). | Issues:<br>[#119](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/119)<br>[#120](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/120) |
| **8. Customer Explore**<br>`chalkboard.shreyaan.work/explore/` | Technical Merit (40%)<br>UX (10%) | - Instant AI concierge: *"What are you looking for nearby?"* with conversational search box.<br>- Neighbourhood selector: default **Tiong Bahru**.<br>- **Today's 7 near you** carousel highlighting unique neighbourhood finds.<br>- Clean bottom navigation: *Ask*, *Rescue*, *Passport*, *Chats*, *Saved*. | - **MIXED CURRENCY BUG**: Asking for items (e.g. *"Where can I get fresh sourdough loaf?"*) in Tiong Bahru returns result cards mixing **SGD (S$12.00)** and **INR (₹150.00, ₹450.00)** (#203).<br>- **Vertex AI Search invisibility**: The concierge search doesn't indicate that embeddings / semantic vector search is running.<br>- Location permission denial shows an inline fallback, but search chips can crowd 360px screens (#123). | Issue:<br>[#203](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/203)<br>Screenshots:<br>`04-customer-explore.png`<br>`10-ask-final-answer.png` |
| **9. Customer Shop Page**<br>`/explore/s/[id]` | Problem & Impact (25%)<br>UX (10%) | - Shop header with status ("Closed now" / "Open"), category, operating hours.<br>- Honest demo banner: *"Demo shop: Sample shop for this prototype — not a real business."*<br>- Menu with sections, item prices, availability badges.<br>- Instant interaction: *Follow*, *Directions (Google Maps safe hand-off)*, *Chat with the shop*. | - **MISSING STAMPS ON PROD**: Demo shops have `stamps_enabled: false` on production, completely hiding the loyalty stamp card, welcome stamp peek, and game perks (#125).<br>- **Floating Chat Bar Occlusion**: Fixed "Chat with the shop" button can cover bottom menu items on smaller phone viewports (#126). | Issues:<br>[#125](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/125)<br>[#126](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/126)<br>Screenshot:<br>`05-customer-shop.png` |
| **10. QR Stamp & Passport**<br>`/explore/passport`<br>`?source=qr` | Innovation (25%)<br>UX (10%) | - **Gamified Passport**: Level status (*Newcomer*, *Regular*, *Local Hero*), points counter, progression bar.<br>- **Weekly Streak**: Counter, freeze protection tokens.<br>- **Collection Sets**: Hyperlocal street quests (e.g. *Chai trail: 4 different tea or coffee spots*).<br>- Impact metrics: Meals rescued, estimated CO₂e prevented. | - **SILENT QR SCAN FAILURE**: Visiting `/explore/s/[shop]?source=qr` fails silently without feedback because demo shop stamps are disabled on production (#205).<br>- "Try a demo stamp" button is missing on the shop page because `stamps_enabled` is false.<br>- Evaluator cannot test the variable-reward scratch card or celebration moment without a valid signed QR key. | Issue:<br>[#205](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/205)<br>Screenshots:<br>`06-customer-passport.png`<br>`07-shop-source-qr.png` |

---

## 3. Rubric Analysis: What Judges See vs What They Miss

### A. Technical Merit & GenAI (40% Weight · Today: 27/40 · Target: 38/40)
- **What a Judge Sees:**
  - Real Google ADK agent loop with function calling and structured Pydantic outputs.
  - Streaming Gemini chat and responsive voice mode architecture.
  - Natural-language semantic search on the customer front door.
  - Robust multi-language support (15 locales, Indian and Southeast Asian languages).
- **What a Judge Misses or Doubts:**
  - **No TimesFM Attribution:** BigQuery AI forecasting (`ML.FORECAST` with TimesFM) is the standout retail planning technology requested in the hackathon track. On screen, the forecast looks like a generic chart; there is no *"Powered by BigQuery TimesFM"* chip or technical summary card.
  - **Multi-Agent Architecture Hidden:** The coordinator and specialist sub-agents (onboarding specialist, demand analyst, procurement buyer, customer concierge) execute invisibly. Judges cannot tell whether it is a single monolithic prompt or a modular multi-agent system.
  - **Vertex AI Search / Embeddings:** Conversational search answers queries, but does not surface semantic similarity scores, grounding chips, or Vertex AI attribution.
  - **No Evaluation / Evals Screen:** Hackathon judges look for quantitative technical rigor. There is no in-app evaluation harness dashboard (e.g. photo OCR extraction accuracy, menu parsing F1 score, voice latency percentiles).

### B. Problem Alignment & Impact (25% Weight · Today: 16/25 · Target: 24/25)
- **What a Judge Sees:**
  - Direct relevance to small corner merchants: hyper-fast onboarding, digital presence without tech expertise, one-tap sold-out toggles.
  - Three-sided ecosystem: Customer discovery + Merchant operations + Supplier procurement loop.
  - Food rescue deals connecting closing-time surpluses to budget-conscious neighbours.
- **What a Judge Misses or Doubts:**
  - **Narrow Food Impression:** Despite the "business-agnostic platform" vision in `docs/OWNER-NOTES.md`, the landing page and demo worlds lean heavily on bakeries and tea stalls. A retail, tailoring, or hardware merchant story is not immediately visible.
  - **Unmeasured Impact:** No concrete numbers on the screen showing economic impact (e.g., *"Merchants save 28 minutes daily"*, *"84% reduction in end-of-day food waste"*).
  - **Fraud / Trust Verification Incomplete:** Verified owner face check and suspicious listing detection are either optional or mocked, weakening the trust layer narrative.

### C. Innovation (25% Weight · Today: 18/25 · Target: 24/25)
- **What a Judge Sees:**
  - Voice-first conversational onboarding replacing lengthy administrative forms.
  - Closing-time rescue deals preventing neighbourhood food waste.
  - Cross-neighbourhood coalition passport with streak freezes and street quests.
  - Plain-language supply chain cards bridging disparate ERP systems.
- **What a Judge Misses or Doubts:**
  - **Agent-to-Agent (A2A) Shopping:** The concept of every shop being an ADK agent endpoint queried autonomously by customer concierges is mentioned in the review notes, but not demonstrated as an active flow.
  - **Counter QR Stamp Experience:** Because production demo shops have stamps toggled off, judges cannot experience the QR stamp scan celebration or the scratch card reward mechanism.

### D. User Experience (10% Weight · Today: 6.5/10 · Target: 9.5/10)
- **What a Judge Sees:**
  - Material 3 theme adapted for dual audiences: calm for merchants, lively and gamified for customers.
  - 390px mobile viewport compliance with zero horizontal scroll bleed.
  - Clean iconography, accessible contrast ratios, and reduced-motion awareness.
- **What a Judge Misses or Gets Frustrated By:**
  - **Sign-in Wall (#153):** Inability to enter the business workspace as a guest or reviewer.
  - **Confusing Stepper Label (#204):** "Step 1 of 5" appearing on the initial sign-in screen.
  - **Mixed Currencies (#203):** INR and SGD symbols mixed on search results in Singapore.
  - **Silent QR Drop (#205):** `?source=qr` parameters vanishing without feedback.

---

## 4. Top 10 Fixes by Points (Ranked by Score Impact per Hour)

| Rank | Fix Title | Rubric Category & Points Gained | Problem Summary | Concrete Implementation Plan | Issue Ref |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **1** | **Add Guest / Demo Walkthrough Entry Point on Business Landing** | **UX (10%)<br>Problem (25%)<br>+4.5 Points** | Unauthenticated judges on production cannot access owner workspace without personal Google OAuth; popup blocking stops evaluation. | Add a prominent button alongside "Continue with Google": *"Preview sample shop (Demo Tour)"* that launches a sandboxed session with pre-seeded Bengaluru/Singapore owner data. | [#153](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/153) |
| **2** | **Enable Stamps & Demo QR Scan on Production Demo Shops** | **Innovation (25%)<br>UX (10%)<br>+3.5 Points** | `stamps_enabled: false` on production demo shops disables the loyalty stamp card, hides the "Try a demo stamp" button, and makes `?source=qr` fail silently. | Ensure all demo world shops have `stamps_enabled: true` with valid `reward_text`. Deploy commit `bce52dd0` to production Cloud Run so judges can scan and stamp. | [#125](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/125)<br>[#205](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/205) |
| **3** | **Surface BigQuery AI TimesFM Attribution & Model Pill in Coach** | **Technical Merit (40%)<br>+4.0 Points** | Demand planning is a core track criterion. Judges cannot tell that Today's forecast is generated by BigQuery AI TimesFM rather than basic moving averages. | Add a visible badge on the forecast chart: *"Forecasted by BigQuery AI (TimesFM)"* with an expand drawer showing forecast horizon, confidence interval, and data points used. | New |
| **4** | **Fix Mixed Currency (₹ in Singapore) on Discover Ask Results** | **UX (10%)<br>Technical (40%)<br>+2.5 Points** | Asking the AI concierge in Tiong Bahru returns demo shops displaying ₹ (INR) prices alongside S$ (SGD), breaking suspension of disbelief for judges. | Enforce consistent regional currency (`SGD` for Singapore, `INR` for Bengaluru) across all generated demo cells and Ask response formatters. | [#203](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/203) |
| **5** | **Add Public "Impact & AI Architecture" Page for Judges** | **Technical Merit (40%)<br>Problem (25%)<br>+3.5 Points** | Judges have 5 minutes and need immediate technical evidence of GenAI models, accuracy evals, latency, and economic impact metrics. | Add an `/impact` route linked from the footer and landing hero showing live evaluation benchmarks (photo parsing accuracy, voice latency, minutes saved per shop, CO₂ prevented). | New |
| **6** | **Make Multi-Agent ADK Coordination Visible on Screen** | **Technical Merit (40%)<br>Innovation (25%)<br>+3.0 Points** | Specialist sub-agents (Onboarding, Analyst, Sourcing Buyer, Concierge) work behind the scenes without visual representation. | Render a subtle "Agent Activity" chip or status pill (e.g. *"Analyst Agent reviewing demand"* / *"Buyer Agent matching suppliers"*) in chat responses to showcase the multi-agent ADK setup. | New |
| **7** | **Remove Misleading "Step 1 of 5" Stepper from Sign-In Masthead** | **UX (10%)<br>+1.5 Points** | Landing page at `business.chalkboard.shreyaan.work` displays "Step 1 of 5" before any login or wizard step has started. | Remove the static stepper badge from the unauthenticated landing view, displaying it only after sign-in when the onboarding journey actually begins. | [#204](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/204) |
| **8** | **Showcase Business-Agnostic Breadth on Landing & Demo Switcher** | **Problem & Impact (25%)<br>+2.5 Points** | Current landing hero and demo shops are almost exclusively food/bakery focused, contradicting the owner's platform vision. | Add a 3-way toggle on landing/explore (*Corner Grocer*, *Artisan Bakery*, *Neighborhood Tailor / Repair*) demonstrating that the platform supports any local service or retail shop. | New |
| **9** | **Complete "I'm Finished" Voice/Typing Intent Transition in Onboarding** | **Innovation (25%)<br>UX (10%)<br>+1.5 Points** | When an owner says "I'm finished", "I'm done", or "Stop", the coach acknowledges but does not always transition directly to "Review my shop". | Map conversational termination intents across all 15 supported languages directly to the `onComplete` review transition. | [#191](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/191)<br>[#141](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/141) |
| **10** | **Surface AI Document Translation Diff in Supply Chain POs** | **Technical Merit (40%)<br>Innovation (25%)<br>+1.5 Points** | Plain-language PO cards hide the impressive AI translation engine bridging SAP IDoc XML to JSON. | Add a "View original supplier document" toggle on purchase order cards showing side-by-side IDoc XML vs extracted plain English with confidence flags. | New |

---

## 5. Summary of Captured Production Evidence

All audit screenshots have been captured at **390 × 844 px** and committed under `docs/qa/rubric-audit/`:
- `01-landing-phone.png` — Main consumer/business landing hero and bento features.
- `02-business-landing.png` — Business sign-in screen showing the misleading "Step 1 of 5" badge.
- `03-after-get-started.png` — Business landing after clicking "Get started" (OAuth popup wall).
- `04-customer-explore.png` — Customer Ask home with neighbourhood selector and Today's 7.
- `05-customer-shop.png` — Crumb & Courtyard Bakery demo shop without loyalty stamps.
- `06-customer-passport.png` — Customer neighbourhood passport with streak and quests.
- `07-shop-source-qr.png` — QR scan entry (`?source=qr`) failing to trigger stamp dialog.
- `08-ask-typed.png` — Typing conversational inquiry into the Ask concierge.
- `09-ask-result.png` — Initial loading state of the Ask search.
- `10-ask-final-answer.png` — Mixed currency results card (₹ alongside S$) in Tiong Bahru.
- `11-rescue-page.png` — Closing-time rescue page empty state and Too Good To Go carbon metrics.
