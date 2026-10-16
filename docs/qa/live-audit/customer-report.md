# Live Customer App Audit Report · Chalkboard

**Audit Date:** 16 October 2026, 15:35 IST  
**Target Environment:** Live Production ([https://chalkboard.shreyaan.work](https://chalkboard.shreyaan.work))  
**Target Release:** Commit `63f81a2` (16 Oct 15:07)  
**Auditor:** Antigravity QA (Independent testing pass — no app code changed)  
**Viewports Tested:** 
- Mobile Phone: 360 × 800 (Chromium, Pixel 7 density)
- Desktop: 1280 × 800
- Color Schemes: Light and Dark (`colorScheme`)
- Locales: English (`en-IN` / `en-SG`), Hindi (`hi-IN`), Tamil (`ta-IN`)

---

## Executive Summary

Chalkboard is an AI-first neighbourhood concierge and shop directory built for the Google AI Builder Cup. This audit evaluates the live customer-facing web experience end-to-end as a first-time user walking five fundamental user journeys.

Overall, Chalkboard delivers a distinct, warm, and highly delightful neighbourhood aesthetic ("Chalkboard green" palette, Caveat handwritten accents, tactile die-cut badges, and respectful reduced-motion choreography). The transition from AI instant answers to authenticated merchant inquiries ("Ask the owner") is best-in-class in its transparency and UX progressive disclosure.

However, several friction points significantly degrade the first 5 minutes for a hackathon judge:
1. **AI Discover response latency (12–16 seconds)** leaves the user looking at a pulse message without visual progression or skeleton cards.
2. **Missing in-app language picker** on the customer front door means judges testing Indian language capabilities cannot switch without modifying browser or storage settings.
3. **Logic and demo-world inconsistencies**: A bicycle repair shop ("Flat Tyre Patch") is offered as an end-of-day *food rescue deal* under "Meals rescued", and mixed currencies (₹ and SGD) appear side-by-side in the same search result set.

---

## Top 10 Issues Ordered by Impact on a Judge’s First 5 Minutes

| # | What | Where | Evidence Screenshot | Severity | One-Line Fix |
|---|------|-------|---------------------|----------|--------------|
| **1** | **Excessive latency on AI query (12–16s)** without progress meter or streaming skeleton cards | Front Door Ask (`/explore/`) | `docs/qa/live-audit/customer/s1-06-ask-loading-phone-light.png` | **3** (Major) | Stream Gemini intent tokens or display instant local catalogue cards while remote embeddings resolve. |
| **2** | **No customer-facing language picker** in the header or profile | Customer Header (`/explore/`) | `docs/qa/live-audit/customer/s1-04-frontdoor-phone-light.png` | **3** (Major) | Place a language switcher icon button beside the theme toggle in `AppearanceToggle.tsx`. |
| **3** | **Currency mixing in query results** (₹220 and SGD 5.20 side-by-side) | Discover Results (`/explore/?q=...`) | `docs/qa/live-audit/customer/desktop-03-results-light.png` | **3** (Major) | Normalize currency strictly to the active neighbourhood/city rather than leaking unanchored shop currencies. |
| **4** | **Bicycle repair ("Flat Tyre Patch") sold as food rescue deal** | Rescue Tab (`/explore/rescue`) | `docs/qa/live-audit/customer/s3-01-rescue-loaded-phone-dark.png` | **3** (Major) | Restrict rescue deal generation to food, beverage, and bakery business categories. |
| **5** | **Location selector chip says "you" instead of area name** | Front Door Header (`/explore/`) | `docs/qa/live-audit/customer/s1-04-frontdoor-phone-light.png` | **2** (Moderate) | Render the geocoded neighbourhood name (e.g. "Indiranagar") with fallback to "Nearby", never the word "you". |
| **6** | **Search placeholder displays dollar sign ("$3") on Indian locale** | Ask Input Box (`/explore/`) | `docs/qa/live-audit/customer/s1-04-frontdoor-phone-light.png` | **2** (Moderate) | Localize placeholder price to active market currency (`₹50` for INR, `$3` for SGD). |
| **7** | **AI-generated descriptions remain in English in Tamil & Hindi views** | Shop Profile & Categories | `docs/qa/live-audit/customer/s5-08-tamil-shop-phone-dark.png` | **2** (Moderate) | Pass active customer language to `demoWorld` prompt so generated shop bios match the UI locale. |
| **8** | **Tamil typography line-wrap and chip truncation** on 360px screen | Shop Menu Header & Chips | `docs/qa/live-audit/customer/s5-08-tamil-shop-phone-dark.png` | **2** (Moderate) | Adjust Tamil font line-height and allow chips to wrap gracefully without trailing ellipsis. |
| **9** | **Duplicate identical shop cards** (`(Tour)` and `(Demo)`) in search results | Discover Results Carousel | `docs/qa/live-audit/customer/s1-07-ask-results-phone-light.png` | **2** (Moderate) | Deduplicate shops by normalized name and location coordinates before rendering group results. |
| **10** | **Sticky bottom action bar occludes last menu item** at 200% zoom | Shop View (`/explore/s/...`) | `docs/qa/live-audit/customer/wcag-reflow-200pct-shop.png` | **1** (Low) | Increase content container padding-bottom to `calc(88px + env(safe-area-inset-bottom))`. |

---

## Detailed Story Evaluations

### Story 1: Land → Ask "I want filter coffee nearby" → Read Answer → Open Shop → See Menu/Prices

- **User Flow**:
  1. User lands on `https://chalkboard.shreyaan.work/` — clear value proposition ("Small shops. Big neighbourhood energy.").
  2. Taps "Find places near me" → 2-step onboarding guides location permission ("Use my location") and interest tags ("Coffee & tea", "Bakery").
  3. AI Front Door loads (`/explore/`) with prompt suggestions ("Coffee near me", "Fresh bread") and "Today's 7 near you" discovery deck.
  4. User enters query: `"I want filter coffee nearby"` into bottom input box and submits.
  5. Loading state: `"You asked: I want filter coffee nearby"` with `"Understanding what you need…"`.
  6. Results display: Numbered card carousel (Card 1: *Kapi & Ketli*, ₹15.00, Rescue deal badge), minimap with numbered pins (1, 2, 3), Google Maps fallback recommendations, and quick followup chips.
  7. User clicks *Kapi & Ketli* → Opens shop view (`/explore/s/demo-w-401dd4ab3b-0`).
  8. Full menu displays with prices (`₹15.00 / cup`), hours (`06:00–21:00`), status (`Open now`), facts, stamp card preview, and neighbour tips.

- **Story Score**: **4.0 / 5.0**

#### Framework Analysis:
- **Story Completeness (4.5/5)**: Clean start-to-finish progression. The user is never stranded. Followup chips ("Cheaper?", "Open now?") provide an immediate next step.
- **Logic (3.5/5)**:
  - Prices in ₹ (`₹15.00 / cup`) match across discovery carousel and shop menu.
  - Distances (`250 m`) match the map pins.
  - *Defect*: Search placeholder prompts `Try “coffee under $3”` when system is set to INR.
  - *Defect*: Both `Courtyard Filter House (Tour)` and `Courtyard Filter House (Demo)` appear with identical ₹60 prices at 0 m distance.
- **Nielsen's Heuristics Violations**:
  - *H1 (Visibility of system status) - Severity 3*: 12.3s to 16.4s response latency with only static text ("Understanding what you need…"). No skeleton cards or intermediate progress indicator.
  - *H2 (Match between system & real world) - Severity 2*: Location chip displays `"you"` instead of city/neighbourhood.
  - *H4 (Consistency & standards) - Severity 2*: Currency placeholder mismatch (`$3` vs `₹`).
- **WCAG 2.2 AA Quick Checks (4/5)**:
  - Contrast: Minimum 4.5:1 achieved for primary text on `surfaceContainer` (`#f7faf3`).
  - Target sizes: Card link (304 × 314px), Send button (48 × 48px), chips (min 40px height).
  - Truncation: Category chip `Ca...` and text `Chai & Filter Coffe...` truncated on 360px viewport.
- **Thumb-Zone / Fitts' Law (4.5/5)**:
  - Input field and send button are comfortably positioned at the bottom within natural thumb reach.
- **Heatmap Proxy (4/5)**:
  - Eye lands first on the bold heading "What are you looking for nearby?", then moves to the suggestion chips. The bottom input bar competes slightly with the bottom navigation tabs.
- **Immersion & Delight (4.5/5)**:
  - Delightful handwritten font (Caveat) for shop descriptions ("Boils its signature ginger-cardamom chai..."), subtle chalk textures, and warm pastel palette create an authentic local vibe.
- **Performance Felt (3/5)**:
  - Landing page loads in ~1.5s.
  - Query roundtrip takes **12.3s – 16.4s**, which feels sluggish on mobile networks.

---

### Story 2: Ask a Shop a Question → Instant Answer → "Ask the Owner"

- **User Flow**:
  1. On shop page (`/explore/s/demo-w-401dd4ab3b-0`), floating action button "Chat with the shop" sits docked at the bottom.
  2. Tapping button slides up a bottom sheet (`ShopChat`) with title "Chat with the shop" and intro: *"Get an instant answer from the shop’s listed details, or send a message the owner replies to."*
  3. Pre-populated suggestion chips appear: "Price", "Hours", "Location", and "👤 Ask the owner".
  4. User enters question: `"Is the filter coffee freshly brewed?"` and taps send (`aria-label="Ask the shop assistant"`).
  5. Instant answer arrives in ~3.0s: *"Information about whether the filter coffee is freshly brewed is not listed. Please contact the shop directly to check."* with footnote *"Instant answer · Answer based on the shop's listed details"*.
  6. Directly beneath the AI bubble, button `"👤 Ask the owner"` is presented.
  7. Tapping `"Ask the owner"` transitions cleanly to the handover form:
     - Heading: *"Ask the owner"*
     - Explanation: *"Owners reply to a real person, so messages need a Google account. Browsing, asking the AI and instant answers stay open to everyone."*
     - CTA: `"Continue with Google"`, Secondary: `"Cancel"`. (Stopped at sign-in as instructed).

- **Story Score**: **4.8 / 5.0**

#### Framework Analysis:
- **Story Completeness (5/5)**: Seamless narrative arc. Starts with an AI triage layer, gracefully falls back to human escalation, and sets honest expectations about authentication.
- **Logic (5/5)**:
  - AI does NOT hallucinate unavailable information; it accurately states that fresh-brewed status is unconfirmed and routes the user to the owner.
- **Nielsen's Heuristics Violations**:
  - *H3 (User control and freedom) - Severity 1*: While `Cancel` button exists in the handover form, the bottom sheet lacks a dedicated swipe-down indicator/drag affordance (relies on top-right close 'X').
- **WCAG 2.2 AA Quick Checks (5/5)**:
  - Touch targets: "Chat with the shop" button (52px height), Send button (48 × 48px), "Ask the owner" chip (48px height), Google sign-in button (48px height).
  - Accessible names and aria-labels verified (`aria-label="Ask the shop assistant"`).
- **Thumb-Zone / Fitts' Law (5/5)**:
  - Both "Chat with the shop" and the in-sheet input bar sit in prime thumb zone (bottom 25% of viewport).
- **Heatmap Proxy (5/5)**:
  - In sheet, the chat message bubble immediately captures visual focus with distinct pastel green (`primaryContainer`), followed by the "Ask the owner" action button.
- **Immersion & Delight (5/5)**:
  - Fluid bottom sheet spring animations and conversational tone establish high credibility and warmth.
- **Performance Felt (4.5/5)**:
  - Sheet opens in ~200ms; instant answer returns in ~3.0s.

---

### Story 3: Rescue Tab → Understand a Deal → Act on It

- **User Flow**:
  1. User selects "Rescue" tab from bottom navigation → Navigates to `/explore/rescue`.
  2. Screen presents header: "Rescue — Leftovers from shops near [Area], at closing time."
  3. Header features impact meter: *"Meals rescued: 0 · An estimate from Too Good To Go’s published life-cycle study."*
  4. Interactive chalk map renders with radar circles (250m, 500m) and pulsing pins indicating ending deals.
  5. Deal card 1: *Bluemoon Artisan Bakes (Demo rescue)*
     - Item: "Pandan Chiffon Slice"
     - Price: `₹84.00`, crossed-out `₹120.00`, badge `30% off`
     - Inventory: `Left: 6`, Distance: `450 m away`, Countdown: `Ends in 1h 22m`
     - CTA: `"🍃 Hold one for me"`
  6. Deal card 2: *Eng Hin Bicycle Repair (Demo rescue)* — "Flat Tyre Patch" at ₹105 (was ₹150, 30% off, Left: 6).
  7. Tapping `"Hold one for me"` opens bottom sheet (`HoldSheet`):
     - Heading: *"Sign in to hold a rescue"*
     - Subtitle: *"Holds go through your chat with the shop, so the owner knows who is coming."*
     - CTAs: `"Continue with Google"`, `"Cancel"`.

- **Story Score**: **4.2 / 5.0**

#### Framework Analysis:
- **Story Completeness (4.5/5)**: Direct path from discovery to action. The hold sheet explains pickup logistics and counter collection.
- **Logic (3/5)**:
  - *Severe Semantic Defect*: A bicycle repair shop offers a "Flat Tyre Patch" under "Leftovers from shops near closing time" and counts toward "Meals rescued".
  - *Positive*: Price calculations (₹120 → ₹84 = exactly 30% off) and inventory countdowns are consistent.
- **Nielsen's Heuristics Violations**:
  - *H2 (Match between system & real world) - Severity 3*: Non-food businesses in a food-waste rescue feature confuse user mental models.
  - *H1 (Visibility of system status) - Severity 2*: On first load, "Looking for leftovers nearby…" displays without skeleton cards for 4–5 seconds.
- **WCAG 2.2 AA Quick Checks (4.5/5)**:
  - Countdown timer and distance badges have legible contrast.
  - "Hold one for me" button meets 48px height requirement.
- **Thumb-Zone / Fitts' Law (4.5/5)**:
  - "Hold one for me" button spans full card width within lower two-thirds of phone screen.
- **Heatmap Proxy (4/5)**:
  - Red-coral rescue button (`#7a271a`) provides strong salience against muted card background.
- **Immersion & Delight (4.5/5)**:
  - Radar pulse animation conveys urgency and neighbourhood vitality; chalk rings fit thematic identity.
- **Performance Felt (4/5)**:
  - Map and cards render smoothly once API completes (~3.5s).

---

### Story 4: Stamps / Rewards: Understand How It Works Without Being Told

- **User Flow**:
  1. User selects "Passport" tab from navigation → `/explore/passport`.
  2. First viewport shows "Your passport" (Caveat hand font) with badge "On this phone":
     - **Level Card** (Warm sunflower yellow): Circular level progress ring (`0`), level title "Newcomer", and milestone *"300 more points to Regular"*.
     - **Weekly Streak Card**: 7 daily bubbles + 1 freeze bubble (`Weekly streak: 0`).
     - **Stamp Book**: 12 circular dashed stamp slots with prompt *"Your first stamp is one QR away. Scan the QR at a shop’s counter. Stamps need you at the shop."*
     - **Quests Section**: "Breakfast crawl" and "Bakery trail" progress cards.
     - **Neighbourhood Board**: Community leaderboard.
  3. User visits shop page (`/explore/s/demo-w-401dd4ab3b-0`) → scrolls to "Stamp card":
     - Displays 8 punch slots with note: *"Scan the shop’s QR for one stamp per day. This card is stored on this phone."*
     - Includes testing affordance: `"Try a demo stamp"`.
  4. Tapping `"Try a demo stamp"`:
     - Triggers animated pop celebration with die-cut sticker badge!
     - Headline: *"First try!"* (handwritten), *"Kapi & Ketli (Demo)"*, *"+50 demo points"*.
     - Explanation: *"Kept on this phone. Sign in to keep it everywhere."*
     - CTAs: `"Sign in"`, `"Done"`.

- **Story Score**: **4.7 / 5.0**

#### Framework Analysis:
- **Story Completeness (5/5)**: High clarity. Immediate feedback loop from shop stamp to neighbourhood passport.
- **Logic (4.5/5)**:
  - Points earned (+50) update phone state instantly.
  - *Minor gap*: Kapi & Ketli shop card states "The owner has not set a reward yet", leaving the 8th stamp payoff unspecified.
- **Nielsen's Heuristics Violations**:
  - *H6 (Recognition rather than recall) - Severity 1*: Relationship between 1 Stamp and 50 Points could be explicitly annotated in the stamp book.
- **WCAG 2.2 AA Quick Checks (5/5)**:
  - Sunflower level card achieves strong contrast for dark text on yellow container (`#ffdf9e`).
  - Stamp punch targets exceed 44 × 44px.
- **Thumb-Zone / Fitts' Law (4.5/5)**:
  - "Done" and "Sign in" modal buttons are placed in prime thumb reach.
- **Heatmap Proxy (5/5)**:
  - Level ring and "+50 demo points" die-cut badge draw instant eye focus.
- **Immersion & Delight (5/5)**:
  - The "stamp thud" and sticker badge celebration provide a genuine dopamine moment reminiscent of physical loyalty cards.
- **Performance Felt (5/5)**:
  - Zero latency for stamp animation and local storage persistence.

---

### Story 5: Switch Language (Hindi, Tamil) and Theme; Repeat Story 1 Quickly

- **User Flow**:
  1. System preferences configured to **Hindi (`hi-IN`)** and Light mode:
     - Front door updates completely: *"आस-पास क्या खोज रहे हैं?"*, *"Tiong Bahru के आस-पास कुछ भी पूछें।"*
     - Prompt chips: *"आस-पास कॉफ़ी"*, *"ताज़ा ब्रेड"*, *"अभी खुला किराना"*, *"कुछ मीठा"*.
     - Bottom navigation: *"पूछें"*, *"रेस्क्यू"*, *"पासपोर्ट"*, *"चैट"*, *"सहेजे गए"*.
     - Ask query in Hindi: `"फ़िल्टर कॉफ़ी"` → Results render in Hindi: *"आज Tiong Bahru estate के पास"*, *"नमूना मोहल्ला · डेमो दुकानें बनाई गई हैं"*.
     - Shop view translates: *"मेन्यू और दाम"*, *"उपलब्ध"*, *"रास्ता"*.
  2. System preferences configured to **Tamil (`ta-IN`)** and **Dark mode**:
     - Chalkboard dark green palette (`#0b1a13` surface, gold accent `#ffc107`).
     - Front door translates: *"அருகில் என்ன தேடுகிறீர்கள்?"*, *"Tiong Bahru அருகில் எதையும் கேளுங்கள்."*
     - Bottom navigation: *"கேளுங்கள்"*, *"மீட்பு"*, *"பாஸ்போர்ட்"*, *"அரட்டைகள்"*, *"சேமித்தவை"*.
     - Ask query: `"பில்டர் காபி"` → Results render.
     - Shop view translates: *"உணவுப் பட்டியலும் விலைகளும்"*, *"பின்தொடர்"*, *"வழிகாட்டிகள்"*.
     - Bottom CTA: *"💬 கடையுடன் பேசுங்கள்"*.

- **Story Score**: **4.1 / 5.0**

#### Framework Analysis:
- **Story Completeness (3.5/5)**:
  - *Critical Discovery Defect*: There is NO language switcher in the customer UI. The user cannot change language on `/explore/` without changing their device settings or developer storage.
- **Logic (4/5)**:
  - Indian rupee symbol (`₹`) is properly retained across Hindi and Tamil.
  - Numbers in Tamil/Hindi UI use Western Arabic digits (1, 2, 3), which is standard and legible across APAC.
- **Nielsen's Heuristics Violations**:
  - *H7 (Flexibility and efficiency of use) - Severity 3*: Lack of user-accessible language selector prevents multilingual users from switching on shared or travel devices.
  - *H4 (Consistency & standards) - Severity 2*: Mixed English text in Indic views — shop descriptions and category tags remain in untranslated English.
- **WCAG 2.2 AA Quick Checks (4/5)**:
  - Dark mode contrast: 11.2:1 for white text on dark green surface, 7.8:1 for gold buttons on dark green surface (passes AAA).
  - *Reflow issue*: Tamil text `"உணவுப் பட்டியலும் விலைகளும்"` forces the item count `"· 4"` onto a lonely second line.
  - *Chip truncation*: Tamil chips truncate with ellipsis (`உள்ளூர் த...`) on 360px viewport.
- **Thumb-Zone / Fitts' Law (5/5)**:
  - Bottom action button `"கடையுடன் பேசுங்கள்"` has prominent 52px height and full thumb reachability.
- **Heatmap Proxy (4.5/5)**:
  - Dark mode with gold accents directs focus straight to actionable elements.
- **Immersion & Delight (4.5/5)**:
  - Chalkboard aesthetic translates exceptionally well into dark mode, feeling like a night-time chalkboard outside a local tavern.
- **Performance Felt (4/5)**:
  - Localized string resolution occurs synchronously with no layout flashes.

---

## Story Scorecard Summary

| Story | User Journey | Score (1–5) | Key Strength | Key Area for Improvement |
|---|---|:---:|---|---|
| **S1** | Discover Filter Coffee & View Shop | **4.0** | Rich shop menu, clear prices & tags | High latency (12–16s) & placeholder currency mismatch |
| **S2** | Ask Shop Question & Handover to Owner | **4.8** | Best-in-class explanation of sign-in rationale | Sheet drag-to-dismiss affordance |
| **S3** | Browse Rescue Deals & Hold Portion | **4.2** | Urgent radar pulse & complete deal breakdown | Non-food bicycle repair deal in food rescue |
| **S4** | Loyalty Passport & QR Stamps | **4.7** | Tactile stamp celebration & game theory loop | Point vs stamp conversion explanation |
| **S5** | Multilingual (HI/TA) & Dark Theme | **4.1** | Atmospheric dark theme & native typography | No customer-facing language switcher |
| **Avg** | **Overall Customer Experience** | **4.36 / 5.0** | **Strong visual identity & thoughtful human escalations** | **Latency, demo data hygiene & UI controls** |

---

## Verification Summary

### What Was Verified Live:
1. **End-to-end customer navigation** on production deployment `https://chalkboard.shreyaan.work` (Commit `63f81a2`).
2. **Phone viewport (360 × 800)** and **Desktop viewport (1280 × 800)** across both **Light and Dark** themes.
3. **Full multi-turn search**: Landing → Onboarding → AskHome query `"I want filter coffee nearby"` → Gemini intent extraction → Grouped carousel & Google Places fallback → Public shop page.
4. **Instant Q&A triage**: Shop chat query → instant answer resolution → "Ask the owner" escalation modal with honest Google sign-in explanation.
5. **Rescue tab operations**: Radar map rendering, countdown timer ticks, was/now pricing, inventory count, and "Hold one for me" sign-in sheet.
6. **Passport & Gamification**: 12-slot stamp book, weekly streak, level progression, and "Try a demo stamp" celebration modal with points increment.
7. **Multilingual localization**: Full Hindi (`hi-IN`) and Tamil (`ta-IN`) UI chrome, typography, and search query handling.
8. **WCAG 2.2 Reflow**: 200% zoom check at 640px viewport width.
9. **50+ screenshots** archived into `docs/qa/live-audit/customer/`.

### What Remains Unvalidated:
1. **Live OAuth Google Sign-in**: Authentication was audited up to the sign-in modal/sheet; completing live Google credentials was not performed to preserve account separation.
2. **Physical Camera / QR Scanner**: QR scanning was verified via the software demo trigger; camera hardware capture on physical mobile devices was not validated.
3. **Physical Speech Input (Microphone)**: Live mic speech recognition was tested via textual simulation; physical ambient microphone noise handling was not evaluated.
