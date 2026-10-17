# Comparison: Customer App Immersive (PR #105) vs Production

Testing environment: 390 × 844 px (phone, touch enabled, light mode, `en-SG` locale, Asia/Singapore timezone).

- **App A (Test / PR #105):** `https://test---ogoogle-ai-5dnlvslisq-el.a.run.app/explore` (with `?app=customer` override)
- **App B (Production):** `https://chalkboard.shreyaan.work/explore`

---

## Comparison Table

| Step | App A (PR #105 Test) | App B (Production) | Rating for A | Issues / Broken in A |
| :--- | :--- | :--- | :--- | :--- |
| **1. First Open** | Sticky unified `TopBar` with inline profile/language/theme buttons. Clean "Near you now" swipeable photo carousel. Redundant "Today's 7" banner removed from above cards. *(Note: Direct URL without `?app=customer` routes to business onboarding).* | Floating language and theme buttons. Single static outline placeholder box with redundant "Today's 7" banner above it. | **BETTER** | **Does not open** on direct URL without `?app=customer` (routes to `business` landing because `src/app/router.ts` checks `*.run.app` before `/explore`). Works when opened with `?app=customer`. |
| **2. Ask "chai near me"** | Input field accepts text smoothly. Suggestion chip shows Singapore currency formatting (`S$3`). Send button activates with high-contrast accent styling. | Input field accepts text. Suggestion placeholder shows generic `$3`. Send button activates. | **BETTER** | None. Input and focus states are responsive and clean. |
| **3. Results** | Smooth skeleton cards during query evaluation. Cards show clear badges, category tags, localized `S$6.00` price, and bottom-left chat reset button. Map view shows fallback placeholder ("Map unavailable · straight-line distances"). | Query evaluation loader. Cards show generic `$6.00` price. Live Google Map rendered with zoom controls. | **SAME / BETTER** | Map renders fallback banner on test instance (Google Maps API key / grounding not enabled on test Cloud Run service). |
| **4. Browse everything nearby** | Page loads with shape skeletons (no jarring splash screen). Header features unified sticky bar with `← Back`. Clean horizontal chip filters (`Open now`, `Halal if known`, `Budget`, `All places`). Map/List toggle in thumb-zone pill. | Full-screen splash screen ("Getting things ready…") blocks UI during load. Four massive, space-consuming square category tiles take half the viewport. Horizontal trending cards cut off at screen edge. | **BETTER** | None. Tapping `← Back` in app bar smoothly returns to Ask home without jump. |
| **5. Open a shop page** | Full-bleed edge-to-edge 16:10 hero image under status bar. Frosted 48 px circle buttons for Back, Language, and Theme float over photo. Shop name rises like an elevated sheet with curved corners. Action buttons (Follow, Stamp card, Directions) in a single row. | Small square thumbnail icon on left. Cramped header text with floating icons. Action buttons stack vertically into 3 rows, pushing menu down by ~150 px. | **BETTER** | None. Visually stunning, modern, and phone-first. |
| **6. Scroll it** | Back, Language, and Theme frosted circle buttons remain pinned at top left and right, ensuring the user can always navigate back from any scroll depth. | Back button scrolls completely off screen with the page header, trapping the user unless they scroll all the way back to the top. | **BETTER** | Minor visual overlap: content scrolling past top-left passes under the frosted Back circle button. |
| **7. Stamp card / welcome stamps** | Stamp moment opens as a genuine mobile bottom sheet (`v1/Sheet`) anchored to screen bottom at 844 px with drag handle. "+ Follow" and "★ Stamp card · 3 of 10 stamps" share a single swipeable row. Stamp card clearly displays 2 welcome star stamps and 1 checkmark visit stamp. | Stamp moment opens as a centered desktop dialog floating in the middle of the screen. Shop action buttons stack into 3 vertical rows. Stamp card displays 3 stamps. | **BETTER** | None. Sheet interaction, bottom anchoring, and 2 welcome stamps work seamlessly. |
| **8. Passport** | Controls (profile, language, theme) live inside the sticky TopBar above the "Your passport" title (`y=68`), providing clean whitespace and zero overlap. **Fixes #101.** | Floating profile, language, and theme buttons sit directly on top of the "On this phone" chip, cutting off and obscuring the text (`...is p...`). | **BETTER** | None. Completely fixes production bug #101. |
| **Back after each step** | Consistent, predictable Back navigation across all screens (`Browse → Ask`, `Shop → Browse`, `Passport → Ask`). Preserves scroll position and context. | Shop page lacks persistent Back button when scrolled down. Navigation relies on inconsistent floating controls. | **BETTER** | None. Back navigation is reliable across all steps. |

---

## Detailed Findings

1. **Routing defect on Cloud Run test URL (`does not open`):**
   - Direct navigation to `https://test---ogoogle-ai-5dnlvslisq-el.a.run.app/explore` redirects to the business onboarding landing page ("Your shop, online in one conversation").
   - Cause: in `src/app/router.ts`, `if (url.hostname === 'business.chalkboard.shreyaan.work' || url.hostname.endsWith('.run.app')) return 'business'` takes precedence over `if (/^\/(explore(?:\/|$)|discover\/?$|s\/)/.test(url.pathname)) return 'customer'`.
   - On production (`chalkboard.shreyaan.work`), the hostname does not end with `.run.app`, so `/explore` works. But any Cloud Run test URL ending with `.run.app` requires `?app=customer` to open the customer app.

2. **Visual & Layout Improvements in PR #105:**
   - **Fixes #101**: On the Passport page, the profile, language, and theme buttons are integrated into `TopBar.tsx` above the title, completely eliminating the production bug where controls collided with the "On this phone" chip.
   - **Hero Image & Sheet Structure**: Shop page photo is full-bleed edge-to-edge (16:10 ratio) under the status bar, with an elevated sheet for shop details.
   - **Mobile Bottom Sheet**: The stamp moment uses the mobile-native `v1/Sheet` bottom sheet anchored to 844 px instead of an awkward desktop dialog.
   - **Persistent Navigation**: Back button stays pinned in frosted 48 px circles during shop scroll.
   - **Skeleton States**: Content skeletons replace the jarring full-screen splash during Browse loading.
   - **Thumb Zone Design**: Browse List/Map toggle pill and action rows are placed in accessible phone thumb zones.

---

VERDICT: BETTER
