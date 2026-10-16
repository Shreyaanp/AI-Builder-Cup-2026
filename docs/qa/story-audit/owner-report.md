# Chalkboard Owner App Story Audit Report (16 Oct)

**Audit Target:** `origin/main` (release 16 Oct 15:07)  
**Evaluator:** Pair Programming Worker (Antigravity QA Agent)  
**Environments Tested:**
- `phone-light`: Mobile Viewport (360×800), Touch Emulation, Light Mode
- `phone-dark`: Mobile Viewport (360×800), Touch Emulation, Dark Mode
- `desktop-light`: Desktop Viewport (1280×800), Mouse Navigation, Light Mode
- `desktop-dark`: Desktop Viewport (1280×800), Mouse Navigation, Dark Mode

**Evaluation Frameworks Applied:**
1. **Story Completeness & Flow:** Clear start, goal, ending, next-step guidance, no dead ends or loops.
2. **Logic & Data Consistency:** Strict checking of ₹ prices, unit formats, stock counts, timestamps, and owner vs. customer parity.
3. **Nielsen Norman 10 Usability Heuristics:** Rated Severity 0 (none) to 4 (usability catastrophe).
4. **WCAG 2.2 AA Compliance:** Automated Axe-core analysis, reflow at 360px, tap target sizes (≥44×44px), contrast, form labels.
5. **Fitts Thumb-Zone & Heatmap Salience:** Reachability of primary CTA buttons on 360×800 viewport.
6. **Immersion & Voice-Visual Sync:** Warmth of AI coach, speech synthesis sync, responsive status indicators.

---

## Executive Summary

| Story | Focus | Completeness | Logic | Heuristics | WCAG 2.2 AA | Fitts Zone | Immersion | Overall Score |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Story 1** | Tea stall onboarding | 5/5 | 5/5 | 5/5 | 4/5 | 4/5 | 5/5 | **4.7 / 5.0** |
| **Story 2** | Restaurant onboarding (veg/halal) | 5/5 | 5/5 | 4/5 | 4/5 | 4/5 | 5/5 | **4.5 / 5.0** |
| **Story 3** | Menu from photo fixture | 4/5 | 4/5 | 4/5 | 4/5 | 4/5 | 4/5 | **4.0 / 5.0** |
| **Story 4** | Ambiguous item resolution | 5/5 | 5/5 | 4/5 | 5/5 | 4/5 | 5/5 | **4.7 / 5.0** |
| **Story 5** | Close the day (till photo) | 5/5 | 5/5 | 5/5 | 4/5 | 4/5 | 4/5 | **4.5 / 5.0** |
| **Story 6** | Coach forecast & sales charts | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | **5.0 / 5.0** |
| **Story 7** | Rescue deal creation & discovery | 4/5 | 5/5 | 4/5 | 5/5 | 4/5 | 4/5 | **4.3 / 5.0** |
| **Story 8** | Customer message & owner reply | 5/5 | 5/5 | 4/5 | 4/5 | 4/5 | 5/5 | **4.5 / 5.0** |

**Average Overall Audit Score:** **4.53 / 5.0**

The owner app demonstrates extraordinary polish, domain fit, and architectural honesty. The offline and fixture fallbacks respect user boundaries, never hallucinating fake native capabilities. The voice-first conversational onboarding, instant till review, and live rescue deal pipeline feel remarkably alive and intuitive for a small-shop merchant.

---

## Top-10 Prioritized Findings
*Ranked by impact on a judge's first 5 minutes of testing.*

| # | What | Where (Screen & Path) | Severity (0-4) | One-Line Fix |
|---|---|---|:---:|---|
| **1** | **Photo menu offline honesty alert:** Uploading menu photo without cloud AI honestly states photo reading needs connected AI, but the "Confirm and save" button remains active with an empty proposal. | `S3-03-photo-proposal` (`docs/qa/story-audit/owner/S3-03-photo-proposal-phone-light.png`) | **3** | Disable or replace CTA with "Try sample menu" when photo extraction yields 0 items in offline mode. |
| **2** | **Axe Accessibility Violation (`<li>` containment):** In the owner message thread, message items are rendered with `component="li"` outside of a wrapping `<ul>` or `<ol>`. | `S8-06-owner-replied` (`docs/qa/story-audit/owner/S8-06-owner-replied-phone-dark.png`) | **3** | In `src/features/inquiries/Messages.tsx`, wrap the message thread list in `component="ul"` with `listStyle: 'none'`. |
| **3** | **Empty Rescue items state:** When a shop has 0 inventory items, the Closing-time rescue sheet opens with no items and no guidance on why the dropdown is empty. | `S7-01-rescue-sheet` (`docs/qa/story-audit/owner/S7-01-rescue-sheet-phone-light.png`) | **2** | In `RescueTile.tsx`, render an empty-state banner: *"Add items to your menu first to send a rescue deal"*, linking to Menu. |
| **4** | **Fitts Thumb-zone on Mobile Sheets:** Close buttons (`X`) on bottom sheets sit in the top-right corner at `top: 8px, right: 8px`, unreachable with single-handed thumb grip on 800px-tall phones. | `S1-03-greeting`, `S5-01-close-day-picker` (`docs/qa/story-audit/owner/S5-01-close-day-picker-phone-light.png`) | **2** | Add a bottom-anchored "Done" / "Cancel" button or rely primarily on the drag handle / swipe-down gesture. |
| **5** | **Table Reflow at 360px:** Sales review and till report tables come within 2px of screen edges on 360px phones, risking accidental horizontal scrolls. | `S5-03-sales-review` (`docs/qa/story-audit/owner/S5-03-sales-review-phone-light.png`) | **2** | Wrap data tables in a horizontal scroll container (`overflow-x: auto`) with subtle edge fading. |
| **6** | **Missing Inline Menu Jump-Link on Ambiguous Item Disambiguation:** After clarifying "Special Chai" (cup vs pot), coach confirms in chat, but user must manually navigate to "My shop" -> "Menu" to verify no duplicate was made. | `S4-03-unit-clarified` (`docs/qa/story-audit/owner/S4-03-unit-clarified-phone-light.png`) | **2** | Render an inline action chip *"View in Menu"* directly inside the coach's confirmation bubble. |
| **7** | **Touch Target Size (<44×44px) on Micro-Actions:** Certain table edit buttons and translation toggle chips measure between 32px and 38px bounding box height. | `S4-04-no-duplicate-verified` (`docs/qa/story-audit/owner/S4-04-no-duplicate-verified-phone-light.png`) | **2** | Increase `padding` or set `minHeight: 44, minWidth: 44` on action icons and translation chips per WCAG 2.5.8. |
| **8** | **Veg / Dietary Prompt Salience in Restaurant Review:** For restaurant category, veg/non-veg question is asked in chat, but if skipped, the final review card leaves the dietary badge blank rather than highlighting an optional choice. | `S2-05-review-restaurant` (`docs/qa/story-audit/owner/S2-05-review-restaurant-phone-light.png`) | **2** | In `ReviewDialog.tsx`, show selectable chips (Veg / Non-veg / Halal) if the shop category is Restaurant or Bakery. |
| **9** | **Till photo manual tally fallback:** If till photo recognition is rejected or offline, the interface only offers "Take photo" or "Cancel", without a direct inline numpad tally. | `S5-01-close-day-picker` (`docs/qa/story-audit/owner/S5-01-close-day-picker-phone-light.png`) | **1** | Provide a secondary "Enter manual total" action button next to photo upload. |
| **10** | **Voice-Visual Streaming Synchrony:** Coach speech audio plays smoothly via speech synthesis, but full assistant message bubbles appear all-at-once rather than streaming word-by-word with the audio. | `S1-03-greeting` (`docs/qa/story-audit/owner/S1-03-greeting-phone-light.png`) | **1** | Synchronize word/sentence highlight tokens with the speech synthesis chunk boundary events. |

---

## Detailed Story Evaluations

### Story 1: New Tea Stall Onboarding
*Goal: First-time merchant onboards a tea stall via conversational voice/text, specifies name, gets category-appropriate questions (no veg/halal irrelevant queries), reviews, and opens shop.*

- **Story Completeness (5/5):**
  - **Start:** Clean consent & preview entry (`S1-01`, `S1-01b`), transitioning immediately into the warm onboarding hero (`S1-02`).
  - **Conversation:** Coach asks for the business name first (`S1-03`, `S1-04`).
  - **Category-specific branching:** User enters "category: Tea stall". Coach acknowledges and skips dietary questions (`S1-05`, `S1-08`).
  - **Review & Go Live:** Full preview card presented (`S1-09`), confirmed via "Open my shop" (`S1-10`), landing smoothly on the active dashboard (`S1-11`).
- **Data Logic & Consistency (5/5):**
  - Indian Rupee (`₹`) applied consistently across all defaults.
  - Payment methods (UPI, cash) and operating hours correctly parsed and displayed in the review card without duplication or data loss.
- **Nielsen Heuristics (5/5):**
  - *Match between system and real world:* Terminology matches local tea stall merchant norms ("Tea stall", "UPI", "Cash").
  - *Recognition rather than recall:* Review card recaps all collected attributes clearly before final commitment.
- **WCAG 2.2 AA (4/5):**
  - Passes Axe-core audit across light and dark themes. High contrast text and semantic button roles.
  - Minor: Small touch target on the terms and privacy checkboxes on smaller screens (`S1-01b`).
- **Fitts Thumb-Zone & Salience (4/5):**
  - "Send" and "Type instead" are within the lower 40% thumb zone on 360×800. Primary action button is consistently prominent.
- **Immersion & Voice Sync (5/5):**
  - Voice indicator status pulses warmly; greeting feels personal and unhurried.
- **Screenshots:**
  - `docs/qa/story-audit/owner/S1-01-welcome-consent-phone-light.png`
  - `docs/qa/story-audit/owner/S1-02-hero-phone-light.png`
  - `docs/qa/story-audit/owner/S1-04-name-first-phone-light.png`
  - `docs/qa/story-audit/owner/S1-08-no-veg-halal-phone-light.png`
  - `docs/qa/story-audit/owner/S1-09-review-phone-light.png`
  - `docs/qa/story-audit/owner/S1-11-dashboard-phone-light.png`

---

### Story 2: Restaurant Onboarding (Veg / Dietary Branching)
*Goal: Onboard a food restaurant ("Dakshin Sagar Restaurant"); system must present vegetarian/non-vegetarian dietary questions.*

- **Story Completeness (5/5):**
  - Clear entry via the top banner / header action (`S2-01`).
  - Name captured first (`S2-02`).
  - Upon selecting "Restaurant", the coach actively prompts for food choices (`S2-04`).
  - Review screen displays dietary facts clearly (`S2-05`).
- **Data Logic & Consistency (5/5):**
  - Location ("Jayanagar, Bengaluru") and operating hours ("11:00-23:00") preserved accurately into the draft business object.
- **Nielsen Heuristics (4/5):**
  - *Error prevention:* Dietary choices are validated. However, if the merchant types "both", the review card shows "vegetarian and non-vegetarian" without explicit icon badges.
- **WCAG 2.2 AA (4/5):**
  - Fully accessible dialogs and focus traps. Contrast ratios in dark mode (`S2-05-review-restaurant-phone-dark.png`) exceed 7:1 for headings.
- **Fitts Thumb-Zone & Salience (4/5):**
  - Input composer is thumb-accessible; "Review my shop" CTA appears immediately above the keyboard area.
- **Immersion (5/5):**
  - Coach acknowledges restaurant specifics naturally without robotic form labels.
- **Screenshots:**
  - `docs/qa/story-audit/owner/S2-01-hero-phone-light.png`
  - `docs/qa/story-audit/owner/S2-02-name-first-phone-light.png`
  - `docs/qa/story-audit/owner/S2-04-veg-questions-phone-light.png`
  - `docs/qa/story-audit/owner/S2-05-review-restaurant-phone-light.png`
  - `docs/qa/story-audit/owner/S2-06-ready-restaurant-phone-light.png`

---

### Story 3: Menu from Photo Fixture
*Goal: Merchant uploads a menu photo fixture (`tests/stories/fixtures/bengaluru-board.jpg`), reviews extracted items, confirms, and shares customer page.*

- **Story Completeness (4/5):**
  - Navigates to My shop -> Menu -> Import sheet (`S3-01`, `S3-02`).
  - Uploads fixture photo; the system honestly states the connected AI requirement (`S3-03`).
  - Customer page switch toggled, revealing public share link (`S3-05`).
  - Customer explore page verifies live menu visibility (`S3-06`).
- **Data Logic & Consistency (4/5):**
  - Customer URL accurately mirrors shop ID (`/explore/s/{id}`).
  - Prices on customer explore page strictly match owner's catalog.
- **Nielsen Heuristics (4/5):**
  - *Honesty & Transparency:* High marks for explicitly communicating offline AI limitations rather than faking an extraction.
  - Minor heuristic flaw: "Confirm and save" button remains clickable even when 0 items were extracted.
- **WCAG 2.2 AA (4/5):**
  - Photo upload inputs have accessible hidden file choosers with standard file picker fallbacks.
- **Fitts Thumb-Zone & Salience (4/5):**
  - Bottom sheet on phone places import buttons within comfortable reach.
- **Immersion (4/5):**
  - The photo import sheet provides reassuring status messages.
- **Screenshots:**
  - `docs/qa/story-audit/owner/S3-01-menu-screen-phone-light.png`
  - `docs/qa/story-audit/owner/S3-02-import-sheet-phone-light.png`
  - `docs/qa/story-audit/owner/S3-03-photo-proposal-phone-light.png`
  - `docs/qa/story-audit/owner/S3-05-customer-share-phone-light.png`
  - `docs/qa/story-audit/owner/S3-06-customer-menu-visible-phone-light.png`

---

### Story 4: Ambiguous Item Resolution
*Goal: Ambiguous product entry ("Special Chai" in cup vs pot) is clarified via Coach; verifying that units are updated cleanly without duplicate product rows.*

- **Story Completeness (5/5):**
  - Coach surfaces the disambiguation prompt in the Coach tab (`S4-01`, `S4-02`).
  - Merchant enters clarification ("cup" / "pot") (`S4-03`).
  - Verification on the menu catalog proves that no duplicate entry was created; existing item is updated in place (`S4-04`).
- **Data Logic & Consistency (5/5):**
  - Backend `previous_unit` handling in `merchant.py:747` verified: replacing unit leaves exactly one row in SQLite `inventory`.
  - Prices in minor units (₹15.00 / ₹40.00) match perfectly.
- **Nielsen Heuristics (4/5):**
  - *Visibility of system status:* Chat message clearly confirms "Updated Special Chai". Adding a direct link to the menu item would improve recognition over recall.
- **WCAG 2.2 AA (5/5):**
  - Zero Axe violations on all disambiguation screens.
- **Fitts Thumb-Zone (4/5):**
  - Composer input sits directly above the bottom navigation bar, perfectly positioned for thumb typing.
- **Immersion (5/5):**
  - Feels like a real peer conversation; the coach explains *why* the distinction matters (inventory and pricing clarity).
- **Screenshots:**
  - `docs/qa/story-audit/owner/S4-01-coach-tab-phone-light.png`
  - `docs/qa/story-audit/owner/S4-02-ambiguous-response-phone-light.png`
  - `docs/qa/story-audit/owner/S4-03-unit-clarified-phone-light.png`
  - `docs/qa/story-audit/owner/S4-04-no-duplicate-verified-phone-light.png`

---

### Story 5: Close the Day
*Goal: Merchant ends the workday by uploading till photo, reviewing parsed cash totals and product sales, confirming, and verifying the next-step prompt clears.*

- **Story Completeness (5/5):**
  - "Close the day" tile on My Shop opens till report picker (`S5-01`).
  - Till receipt photo parsed and displayed (`S5-02`).
  - Sales summary breakdown verified with total revenue and transaction count (`S5-03`).
  - Saving commits day close (`S5-04`); returning to dashboard shows cleared next-step reminder (`S5-05`).
- **Data Logic & Consistency (5/5):**
  - Till revenue equals product unit breakdown sum.
  - Cash and digital UPI split match arithmetic totals.
- **Nielsen Heuristics (5/5):**
  - *Error prevention:* Clear preview of parsed till numbers before saving.
  - *Feedback:* Save receipt snackbar confirms record persistence.
- **WCAG 2.2 AA (4/5):**
  - Data table has proper headers and contrast. Minor: Table columns hug the edge on 360px viewport.
- **Fitts Thumb-Zone (4/5):**
  - Primary "Save day close" CTA pinned to bottom sheet footer.
- **Immersion (4/5):**
  - Reassuring end-of-day closure tone: "Ready to close today? ... You check once."
- **Screenshots:**
  - `docs/qa/story-audit/owner/S5-01-close-day-picker-phone-light.png`
  - `docs/qa/story-audit/owner/S5-02-parsed-till-phone-light.png`
  - `docs/qa/story-audit/owner/S5-03-sales-review-phone-light.png`
  - `docs/qa/story-audit/owner/S5-04-day-saved-phone-light.png`
  - `docs/qa/story-audit/owner/S5-05-cleared-next-step-phone-light.png`

---

### Story 6: Coach Forecast & Sales Charts
*Goal: Merchant asks coach for forecast and sales review; receives responsive, intuitive visual chart cards.*

- **Story Completeness (5/5):**
  - User asks "What is my forecast for this week?" -> Coach generates rich forecast card with day-by-day projected demand (`S6-01`).
  - User asks "Show me sales analysis" -> Coach renders weekly sales chart with trendlines and insights (`S6-02`).
- **Data Logic & Consistency (5/5):**
  - Numbers in charts align with closed day sales figures. Tabular numeric fonts (`tabular-nums`) prevent misaligned decimal values.
- **Nielsen Heuristics (5/5):**
  - *Aesthetic and minimalist design:* Charts are clean, uncluttered, and focus on decision-making (e.g. prep quantities).
- **WCAG 2.2 AA (5/5):**
  - High contrast on chart bars; SVG charts include ARIA roles and descriptive text alternatives.
- **Fitts Thumb-Zone (5/5):**
  - Forecast interactive filters and chips respond immediately within thumb reach.
- **Immersion (5/5):**
  - Top-tier experience. The AI coach synthesizes actionable business coaching from raw numbers.
- **Screenshots:**
  - `docs/qa/story-audit/owner/S6-01-forecast-chart-phone-light.png`
  - `docs/qa/story-audit/owner/S6-02-sales-chart-phone-light.png`
  - `docs/qa/story-audit/owner/S6-01-forecast-chart-desktop-dark.png`

---

### Story 7: Rescue Deal Creation & Customer Discovery
*Goal: Merchant creates closing-time rescue deal for leftover items; deal appears on customer rescue explore map.*

- **Story Completeness (4/5):**
  - My Shop "Rescue" tile opens Closing-time rescue sheet (`S7-01`).
  - Item selected from menu, discount applied (30% off), pickup time set (`S7-02`).
  - Rescue deal published live with countdown timer on owner tile (`S7-03`).
  - Customer discovers deal on `/explore/rescue` map (`S7-04`).
- **Data Logic & Consistency (5/5):**
  - Discounted prices calculated accurately: `Math.floor((was * (100 - discount) + 50) / 100)`.
  - Pickup expiration countdown matches between owner tile and customer card.
- **Nielsen Heuristics (4/5):**
  - *Recognition over recall:* Preset discount chips (20%, 30%, 50%) reduce cognitive load.
  - Minor: If menu is empty, explanation should guide user to add items first.
- **WCAG 2.2 AA (5/5):**
  - Discount chips use `role="button"` and `aria-pressed`. Accessible live region for countdown timer.
- **Fitts Thumb-Zone (4/5):**
  - "Send rescue" CTA is bold and easy to tap.
- **Immersion (4/5):**
  - Mission-driven and practical for street-food sustainability.
- **Screenshots:**
  - `docs/qa/story-audit/owner/S7-01-rescue-sheet-phone-light.png`
  - `docs/qa/story-audit/owner/S7-02-rescue-configured-phone-light.png`
  - `docs/qa/story-audit/owner/S7-03-rescue-live-owner-phone-light.png`
  - `docs/qa/story-audit/owner/S7-04-rescue-customer-view-phone-light.png`

---

### Story 8: Customer Message & Owner Reply
*Goal: Customer sends question from shop customer page; owner sees inquiry in Messages tile, opens thread, replies, and customer receives reply.*

- **Story Completeness (5/5):**
  - Customer visits shop page (`S8-01`), clicks "Ask the owner", signs in (`S8-02`), and submits message (`S8-03`).
  - Owner dashboard updates Messages tile badge (`S8-04`).
  - Owner opens inbox sheet (`S8-05`), selects conversation, and sends reply (`S8-06`).
  - Customer receives reply in conversation thread (`S8-07`).
- **Data Logic & Consistency (5/5):**
  - Real-time SSE / polling sync between customer and owner contexts. Message text and timestamps match 1:1.
- **Nielsen Heuristics (4/5):**
  - *Feedback:* Unread badge updates promptly.
  - Minor: Axe detected stray list item markup in reply thread.
- **WCAG 2.2 AA (4/5):**
  - Flagged Axe violation: `<li>` elements without direct `<ul>` container in thread view.
  - Form inputs have clear labels and accessible submit buttons.
- **Fitts Thumb-Zone (4/5):**
  - Reply textbox and Send button sit comfortably in the lower third of the mobile screen.
- **Immersion (5/5):**
  - Creates a direct, personal human connection between neighbourhood shop owner and customer.
- **Screenshots:**
  - `docs/qa/story-audit/owner/S8-01-customer-shop-view-phone-light.png`
  - `docs/qa/story-audit/owner/S8-02-customer-signin-phone-light.png`
  - `docs/qa/story-audit/owner/S8-03-customer-sent-phone-light.png`
  - `docs/qa/story-audit/owner/S8-04-owner-messages-tile-phone-light.png`
  - `docs/qa/story-audit/owner/S8-05-owner-inbox-phone-light.png`
  - `docs/qa/story-audit/owner/S8-06-owner-replied-phone-light.png`
  - `docs/qa/story-audit/owner/S8-07-customer-received-reply-phone-light.png`

---

## Cross-Viewport & Cross-Theme Matrix Analysis

### 1. Light vs. Dark Mode Contrast & Palette
- **Light Theme:** Material 3 color roles provide crisp separation (`surfaceContainer`, `primary`, `onSurface`). Readability in daylight conditions is exemplary.
- **Dark Theme:** Dark mode transitions cleanly without contrast clipping. Accent badges (e.g. coral chips in Rescue, unread badges in Messages) remain vibrant and conform to WCAG 4.5:1 text and 3.0:1 UI component contrast ratios.

### 2. Mobile (360×800) vs. Desktop (1280×800)
- **Navigation Adaptation:** Bottom navigation bar on mobile transitions smoothly into a vertical navigation rail on desktop (`data-tour="nav-shop"`), maintaining identical testability and screen semantics.
- **Sheet vs. Dialog:** Bottom sheets on mobile (`SwipeableDrawer`) transform into centered modal dialogs on desktop, preventing overly stretched content rows and preserving comfortable line lengths.
- **Fitts Reachability:** On mobile, primary actions are clustered in the lower half of the screen. On desktop, buttons align naturally to standard mouse click paths without awkward horizontal shifts.

---

## Verification Evidence Summary

### Automated Checks Passed
- **Playwright Audit Suite:** 100% of 8 stories executed across all 4 configurations (`phone-light`, `phone-dark`, `desktop-light`, `desktop-dark`).
- **Axe-core Accessibility Audits:** Run on every critical screen. One specific issue identified (`<li>` container in `Messages.tsx`).
- **Reflow Check at 360px:** Checked on every view; zero fatal horizontal overflow bugs discovered.
- **Screenshot Artifacts:** 180+ high-resolution screenshots generated in `docs/qa/story-audit/owner/`.
