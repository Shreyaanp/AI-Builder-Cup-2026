# Mobile Navigation and Back Button Audit

**Date**: 17 October 2026  
**Auditor**: Antigravity Worker (Gemini Flash)  
**Branch**: `fix/mobile-nav-audit`  
**Viewport**: 390 × 844 px (Mobile phone emulation)  
**Ports**: `WEB_PORT=3931`, `API_PORT=4031`  
**GitHub Issue**: [#96](https://github.com/Shreyaanp/chalkboard/issues/96)

---

## Executive Summary

An end-to-end mobile navigation and browser back/forward/reload audit was conducted across both the **Owner Workspace** (`V1App`) and **Customer Portal** (`CustomerApp`) at 390px phone width.

Key architectural takeaways:
1. **Owner App Tab Navigation**: All tab switching (`Today` / `Shop` / `Grow` / `You`) and subpages (`Get on Google`, `Privacy`) rely on in-memory React state (`useState<Destination>('coach')`) on the root URL `/`. Tab transitions do not push history entries. As a consequence, pressing the browser/system Back button pops the root navigation and **exits the application completely to `about:blank` or the initial landing page**.
2. **Owner App Reloads**: Refreshing the browser on any owner tab resets the application to the Landing screen (`Continue local preview`) in local mode, or defaults back to `Coach` (Today), losing active subpages, selected shops, and tabs.
3. **Owner App Transience**: In-progress coach chat messages and turns are transient in-memory component state; any reload wipes all conversation turns.
4. **Owner App Sheets & Menus**: While edit/detail modals (`BusinessDialog`, `ProductDialog`, `FaceDialog`) implement `useBackClose`, top-level overlays such as the **"+" Coach Actions bottom sheet** and the **"Choose Shop" dropdown menu** do not bind to `useBackClose`, causing Back to navigate history rather than dismiss the overlay.
5. **Customer App Ask Search**: Submitting a search query on Ask Home (`/explore/`) renders result cards dynamically without pushing URL query state or history. Pressing Back immediately exits `/explore/` rather than clearing the search, and reload completely wipes results.
6. **Customer App Overlays**: Overlays like `ProfileSheet` and `PlaceSearch` do not trap or integrate with history; pressing Back exits the app rather than dismissing the sheet.
7. **Customer Deep Links**: Direct access to `/explore/s/<id>` has no history predecessor; pressing browser Back exits to a blank splash screen (`Getting things ready...`) rather than safely falling back to `/explore/`.

---

## Audit Findings Table

| ID | App | Flow / Screen | Steps to Reproduce | Expected Behavior | Actual Behavior | Defect Type | Screenshot |
|---|---|---|---|---|---|---|---|
| **NAV-01** | Owner | Bottom Tabs Navigation | 1. Open Owner App at `/`<br>2. Navigate Coach → Shop → Grow → You<br>3. Press system Back (`page.goBack()`) | Back returns to previous tab (You → Grow → Shop → Coach) | Exits owner workspace completely to `about:blank` / landing screen | **Exits app** | [`o01-tab-back-exits-workspace.png`](./o01-tab-back-exits-workspace.png) |
| **NAV-02** | Owner | Bottom Tabs Reload | 1. Navigate to "Shop" (or "Grow" / "You") tab<br>2. Refresh page (`page.reload()`) | Reload keeps user on active tab ("Shop") | Resets to Landing screen; re-entering defaults back to Coach (Today) | **Loses state** | [`o01-tab-reload-resets-to-coach.png`](./o01-tab-reload-resets-to-coach.png) |
| **NAV-03** | Owner | SubPages (Grow → Google) | 1. On Grow tab, tap "Get on Google"<br>2. Refresh page (`page.reload()`) | Reload keeps user on "Get on Google" subpage | Resets to Landing / Coach tab; subpage state is lost | **Loses state** | [`o02-subpage-google-reload.png`](./o02-subpage-google-reload.png) |
| **NAV-04** | Owner | Top Bar "+" Actions Sheet | 1. Tap "+" button in top bar<br>2. Coach Actions bottom sheet opens<br>3. Press Back | Back closes the sheet and stays on current screen | Back triggers browser history pop; sheet does not intercept Back | **Fails to close sheet** | [`o03-actions-sheet-back.png`](./o03-actions-sheet-back.png) |
| **NAV-05** | Owner | Choose Shop Dropdown | 1. Tap "Choose shop: Courtyard Chai"<br>2. Shop dropdown menu opens<br>3. Press Back | Back closes dropdown menu | Back triggers browser history pop instead of dismissing menu | **Fails to close sheet** | [`o03-choose-shop-menu-back.png`](./o03-choose-shop-menu-back.png) |
| **NAV-06** | Owner | Coach Chat Turns on Reload | 1. On Coach tab, send message ("What is popular this week?")<br>2. Coach reply card appears<br>3. Refresh page (`page.reload()`) | Chat conversation turns persist across reload | In-memory chat turns are wiped; coach resets to blank greeting | **Loses state** | [`o05-coach-chat-reload-state-lost.png`](./o05-coach-chat-reload-state-lost.png) |
| **NAV-07** | Customer | Ask Home → Search Results | 1. On `/explore/`, tap suggestion chip or type query<br>2. Result cards render<br>3. Press Back | Back clears search results and restores Ask prompt | Back navigates out of `/explore/` entirely and exits app | **Exits app** | [`c01-ask-results-back.png`](./c01-ask-results-back.png) |
| **NAV-08** | Customer | Ask Results Reload | 1. Search on `/explore/`<br>2. Results render<br>3. Refresh page (`page.reload()`) | Reload preserves query and result cards | URL has no search param; reload wipes query and cards | **Loses state** | [`c01-ask-results-reload-wiped.png`](./c01-ask-results-reload-wiped.png) |
| **NAV-09** | Customer | Browse Map Toggle Back | 1. Navigate to `/explore/browse`<br>2. Toggle "Map" view button<br>3. Press Back | Back returns from Map view to List view | Back navigates out of Browse instead of toggling Map | **Skips screen** | [`c02-browse-map-back.png`](./c02-browse-map-back.png) |
| **NAV-10** | Customer | Browse Filter Back | 1. On `/explore/browse`, tap a category chip (e.g. "Cafe")<br>2. Press Back | Back reverts filter to all categories | Uses `replaceState`; Back exits Browse completely to splash | **Exits app** | [`c02-browse-filter-back.png`](./c02-browse-filter-back.png) |
| **NAV-11** | Customer | Shop Direct Deep Link Back | 1. Directly open `/explore/s/demo-courtyard-chai`<br>2. Shop details render<br>3. Press browser Back | Back navigates safely to Ask Home (`/explore/`) | Browser pops to non-existent history, landing on blank splash screen | **Blank/stale page** | [`c03-shop-deeplink-browser-back-exits.png`](./c03-shop-deeplink-browser-back-exits.png) |
| **NAV-12** | Customer | Profile Sheet Back | 1. On `/explore/`, tap Profile icon in header<br>2. Profile sheet opens<br>3. Press Back | Back closes Profile sheet and remains on `/explore/` | Back pops browser history, exiting customer app to `about:blank` | **Fails to close sheet** | [`c05-profile-sheet-back.png`](./c05-profile-sheet-back.png) |

---

## Detailed Observations & Evidence

### 1. Owner Workspace (`V1App`)

- **Tab Routing Architecture**:
  In `src/features/v1/WorkspaceProvider.tsx`, `destination` is defined as:
  ```ts
  const [destination, setDestination] = useState<Destination>('coach')
  ```
  Neither `ws.go(destination)` nor bottom tab button clicks update `window.history` or URL search params. The URL remains `/`. Consequently:
  - System Back button has no stack frames to pop within the workspace, immediately exiting to `about:blank` ([`o01-tab-back-exits-workspace.png`](./o01-tab-back-exits-workspace.png)).
  - Reloading `/` resets `destination` to `'coach'`, losing the user's active screen ([`o01-tab-reload-resets-to-coach.png`](./o01-tab-reload-resets-to-coach.png)).

- **SubPage State**:
  In `AppShell.tsx`, `Get on Google` (`google`) and `Privacy Notice` (`privacy`) are rendered via `<SubPage parent="grow">`. Like the top-level tabs, their state is driven solely by `destination`. Reload resets them to Coach ([`o02-subpage-google-reload.png`](./o02-subpage-google-reload.png)).

- **Overlays & Back Button Trap**:
  - `EditDialogs.tsx` and `ReviewDialog.tsx` correctly use `useBackClose(open, onClose, dirty)` from `backStack.ts`. When an edit form has unsaved modifications, pressing Back successfully renders the `<DiscardPrompt>` dialog ([`o04-edit-details-discard-prompt.png`](./o04-edit-details-discard-prompt.png)).
  - However, the top-bar "+" Coach Actions sheet (`CoachScreen.tsx:272`) and Choose Shop menu (`AppShell.tsx`) do not register with `useBackClose`. Pressing Back does not close them ([`o03-actions-sheet-back.png`](./o03-actions-sheet-back.png), [`o03-choose-shop-menu-back.png`](./o03-choose-shop-menu-back.png)).

### 2. Customer Portal (`CustomerApp`)

- **Customer Navigation Tabs**:
  `CustomerNav.tsx` uses `customerNavigate` which pushes `{ inApp: true }` onto browser history. As a result, navigating between `Ask` → `Passport` → `Rescue` → `Saved` preserves history, and pressing Back steps backward across tabs as expected ([`c04-tabs-back-step-1.png`](./c04-tabs-back-step-1.png)). Reloading `/explore/passport` preserves the Passport screen ([`c04-passport-reload-preservation.png`](./c04-passport-reload-preservation.png)).

- **Ask Home Search & Results**:
  In `src/features/discover/AskHome.tsx`, submitting a search performs a state update inside AskHome without updating URL query parameters (`?q=...`) or pushing a history entry. Therefore:
  - Back button pops the route before `/explore/`, exiting Ask Home ([`c01-ask-results-back.png`](./c01-ask-results-back.png)).
  - Reloading `/explore/` resets search state to the initial empty search bar ([`c01-ask-results-reload-wiped.png`](./c01-ask-results-reload-wiped.png)).

- **Browse View Mode & Filters**:
  In `src/features/discover/Discover.tsx`, filter chip selections update query parameters via `replaceState`. When a user applies a filter and hits Back, instead of reverting to the unfiltered list, it pops the entire Browse screen back to the previous app entry or splash screen ([`c02-browse-filter-back.png`](./c02-browse-filter-back.png)).

- **Deep Link Navigation**:
  When a customer directly opens a shared shop link (`/explore/s/<id>`), `history.state` has no `inApp` flag. While the in-app back arrow link has a fallback href, pressing the mobile device's native browser Back button has no previous in-app history, causing an immediate exit to a blank splash screen ([`c03-shop-deeplink-browser-back-exits.png`](./c03-shop-deeplink-browser-back-exits.png)).

- **Customer Dialogs & Sheets**:
  `ProfileSheet` and `PlaceSearch` dialogs are implemented as plain MUI modals without history interception. Pressing Back pops the underlying page and exits the app to `about:blank` ([`c05-profile-sheet-back.png`](./c05-profile-sheet-back.png)).

---

## Recommended Fix Strategy (For Implementation PRs)

1. **Owner App History Sync**:
   - In `WorkspaceProvider.tsx`, synchronize `destination` with URL search params (e.g. `/?tab=shop`, `/?tab=grow`, `/?sub=google`).
   - Use `history.pushState` on tab selection so system Back steps through tabs.
   - On initial load and reload, initialize `destination` from `new URLSearchParams(location.search).get('tab')`.
2. **Coach Actions & Menus Back Handler**:
   - Wrap `coachActions` and shop picker in `useBackClose(open, onClose)` so Back closes the overlay first.
3. **Ask Home Search State in URL**:
   - When a search is triggered in `AskHome`, push `history.pushState(..., '', '/explore/?q=' + encodeURIComponent(query))`.
   - On `popstate`, if query is removed, revert to initial Ask prompt.
4. **Deep Link Fallback**:
   - On shop detail and passport pages, if `history.length <= 1` or `!history.state?.inApp`, bind `popstate` to route to `/explore/` or `/explore/browse` rather than allowing the browser to exit.
5. **Customer Sheet Back Handling**:
   - Add a lightweight `useBackClose` equivalent for `ProfileSheet` and `PlaceSearch` in the Customer app.
