# Account 2 status — My shop bugs B26–B28 and B16

**Branch:** `fix/myshop`, from `origin/main` at `0694fac`, pushed to `origin/fix/myshop` only.
No features beyond the brief, and no AI co-author trailers.

**Codex's areas:** nothing in `discover.py`, `Discover.tsx` or `business_profile.py`. In
`merchant.py` the change is minimal: one optional `ProductFields.previous_unit` field and a
few lines in the SQLite commit (B28).

## Commits

| Bug | Commit(s)                                                             | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B26 | `e32d23c`                                                             | **Header removed:** the repeated shop name and the "Draft" / "Check pending" chip are gone (a visually hidden `h1` remains), so the tiles move up. A pending check now shows as a small chip inside the **Readiness** tile. "Draft" was the same on every shop and said nothing, so it was dropped (the unused string too).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B27 | `2b5d22e`                                                             | **Grid:** `repeat(auto-fill, minmax(min(100%, 168px), 1fr))` with `grid-auto-flow: row dense`, which gives 2 columns at 390 px, 2 at 600 px (beside the rail) and 4 on a desktop.<br>**Spans:** each tile's span follows its content (`tileSpan.ts`: two columns only when the text would wrap past two lines in one).<br>**Menu tile:** takes the whole row, with its category groups side by side. Readiness spans two columns while it shows a bar, and becomes one thin full row once complete.<br>**Narrow screens:** a container query gives two-column tiles the full row when only one column fits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B28 | `f936d17` (backend), `2016755` (frontend), `5227db9` (demo-flow spec) | **Categories:** every _new_ item gets one, whether from a photo, an import, the coach or the owner's form, and the owner reviews it with the rest of the proposal.<br>• Photo reads keep the section the model read; a menu photo for an existing shop used to drop it.<br>• The coach's empty category no longer leaves a new item uncategorised.<br>• `/proposals` fills a suggestion.<br>• Imports without a category column are sorted by Gemini (`ColumnMapper.categorise`); offline, or if that fails, the broader multi-language keyword guess is used.<br>• Saved items keep their own category; existing uncategorised items use **"Sort my menu"** (`POST /businesses/{id}/sort-menu`), a sealed inventory proposal opened in the review sheet, never a silent write.<br>**Menu layout:** each category is a section with a grid of compact cards (2 per row on a phone, 3 in the desktop dialog) showing the name, the unit, a sold-out chip and the price.<br>**Inline price:** tapping the price edits it in place (decimal keypad). Enter or blur prepares the exact proposal, one tap on "Save S$2.20" approves that digest (`ws.confirm`), and Esc cancels without closing the sheet.<br>**Units:** a dropdown of the 19 fixed units, translated in all 10 locales.<br>• Legacy spellings map on load ("pcs" shows as piece). Other free text shows as "tray (current)" until replaced.<br>• Photo reads (an enum in the schema), the coach (a normalising validator) and imports all output fixed units.<br>• Picking a new unit replaces the saved item instead of duplicating it (`previous_unit`, applied in both stores).<br>**Sheet buttons:** "Import" (the accessible name keeps the full description) and "Add product" sit on one aligned row; the import choices open in the sheet body. |
| B16 | `67412d7`                                                             | **The coach's one attach button (paperclip) opens a menu:**<br>• **Take photo** (phones only, `capture="environment"`)<br>• **Photo library**<br>• **Document (PDF, Excel, CSV)**, shown once a shop exists. It goes to `POST /businesses/{bid}/import` through the shared `useImport` hook, the same flow as `ImportMenu`: a menu opens the review, and sales open the sales summary.<br>**One file input:** it stays a single input with `accept`/`capture` switched per choice, so existing specs still find it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Screenshots (`docs/bugs/`, 390×844 unless noted)

- **B26:** `B26.png`, `B26-before.png`.
- **B27:** `B27.png`, `B27-600.png` (600×844) and `B27-desktop.png` (1280×1000), with before shots `B27-before.png` and `B27-desktop-before.png`.
- **B28:**
  - `B28.png`: the menu sheet
  - `B28-price.png`: the one-tap confirm
  - `B28-units.png`: the unit dropdown
  - `B28-sort.png`: Sort my menu on a legacy menu
  - `B28-before.png`
- **B16:** `B16.png`, after only. Before, there was no menu to show.

## Tests

**Phone (Playwright):** new `tests/myshop.spec.ts`, 9 tests. Each was run against the old frontend first, where it fails, and passes with the fix. axe (wcag2a/aa/21aa) is clean on My shop, the menu sheet (including the Sort prompt, the price confirm and the import panel) and the attach menu.

- **B26:** no repeated name or chip, and the tiles start at the top. A pending check shows in the Readiness tile.
- **B27:** at 390, 600 and 1280 px:
  - the column counts are right and nothing overflows;
  - no text is truncated;
  - tiles wider than one column use more than 65% of their width (one-column tiles more than 45%).

  The old grid fails it (Shop details used 55% of a full-width tile).

- **B28:**
  - categories, the 2-per-row grid and the sold-out mark;
  - Sort my menu as a reviewed proposal;
  - inline price: Enter prepares, one tap saves, Esc cancels, an invalid entry shows a hint;
  - the unit dropdown: a legacy unit is replaced without a duplicate, and a new item offers 19 options;
  - the compact action row.
- **B16:** the choices with and without a shop. A CSV document reaches the import review (one request), a sales CSV opens its summary, and the picker returns to photos.

**Backend:** new `backend/tests/test_menu_sorting.py`, 30 tests:

- unit synonyms and keyword categories;
- coach, photo, import and form categorisation;
- Sort my menu (only uncategorised items, nothing saved before approval);
- unit replacement on SQLite **and** the Firestore emulator;
- the Gemini categoriser with a stub client, and its fallback.

**Changed tests**, all for the new UI or rules:

- `test_product_categories`: an empty category keeps the saved one.
- `test_merchant_routes`: the form's product gains a suggested category.
- Playwright:
  - `import`: open Import first;
  - `v1`: the top bar names the shop;
  - `v1-a11y`: the unit dropdown and the price button;
  - `bugs-b8-b12` B12: the menu cards;
  - `demo-flow`: the price and sold-out mark on the card;
  - `phone-shell` B7 and `phone-regressions` PHONE-2: the new attach labels.

**Results on this machine** (1 worker, ports 3210/3310; the other checkout's 3200/3300 servers were left running):

- **Main Playwright group, phone + desktop: 212 passed, 50 skipped (phone-only tests on desktop):**
  - `myshop`, `phone-shell`, `phone-regressions`, `v1`, `v1-a11y`, `bugs-b8-b12`
  - `import`, `identity`, `coach-reliability`, `planning`, `forecast`, `rewards`
  - `i18n`, `google-sim`, `discover`, `frontdoors`, `streaming`
- **Port-swapped copies**, because these hard-code 3200: `customer` 10 passed, `starter` 12 passed, `demo-flow` 2 passed (after its B28 update).
- **Backend:** `pytest` on the 9 touched suites passes 166 with the Firestore emulator. `ruff check`, `ruff format --check` and `mypy app` pass.
- **Frontend:** `tsc -b`, `eslint src tests --max-warnings 0` and `prettier --check src tests` pass. The API contract is regenerated.

## Skills

I followed `material-design-3-ui` (and `web-interface-guidelines`) and designed phone-first at
390×844. Neither was wrong here.

The item cards use the outlined/filled container roles. The sold-out state is shown by text (the
"Sold out" chip), not by colour alone. Every target is at least 48dp. The price button's
accessible name includes the visible price (WCAG 2.5.3).

## Open questions

1. **Desktop grid gap:** with a typical tile set there can still be one empty cell at the end of a
   row (beside Plan tomorrow in `B27-desktop.png`). Dense packing fills holes when a smaller tile
   exists, but a fixed set can't fill every width exactly.
2. **Offline categories for non-food shops:** without Gemini, items like a hardware shop's land
   in "Other" (a category, not "Uncategorised"). With Gemini, imports and Sort my menu pick real
   sections ("Tools", "Paint").
3. **Firestore product ids:** a unit replacement deletes the old document and writes the new
   key, so that item's id changes on Firestore (SQLite keeps it). Planning data keyed by the old
   id would not follow.
4. **Outside this brief:** GoogleScreen's copy-ready listing still prints raw units. It's not in
   B26–B28, so I left it.
5. **Inline price confirm:** it is one tap on the exact sealed proposal, without the full review
   sheet. Say if prices must always go through the review sheet; that is a one-line change to
   `ws.review`.

---

# Earlier: phone shell bugs B1–B7 (merged)

**Branch:** `fix/phone-shell`, from `origin/main` at `bf8a0a1`, in account 2's worktree. No
features. Nothing touches ShopTiles, GoogleScreen, the recap, hours or product categories.
`GoogleSimulator.tsx` gets one line (B4: Back closes the wizard).

The demo-shops and launch-video status from the parked `feat/demo-shops` branch lives in this
same file on that branch. If both branches merge, keep both sections.

## Commits

| Bug | Commit    | Root cause → fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `d21d076` | `Sheet.tsx` overrode the drawer paper's `position: fixed` with `relative` (for the close button). The sheet fell into normal flow at the **top** of the screen. Removed the override; the fixed paper already contains the close button. Content now scrolls inside the 90dvh cap, so the title and actions stay on screen.                                                                                                                                                                                                                                                               |
| B2  | `81d58e2` | `AppShell` hid the bottom navigation whenever a text field had **focus**. "Something changed" focuses the composer, and focus stays after the keyboard is dismissed, so the navigation never came back. It now hides only while the keyboard is really up: the window is more than 120px shorter than its full height at the same width (the page uses `interactive-widget=resizes-content`).                                                                                                                                                                                             |
| B3  | `2a04652` | **Lines:** MUI's autosize textarea measures the _placeholder_ in a hidden copy, so a long translated hint (Tamil) made the empty composer two lines tall. Replaced it with a plain textarea sized from its own text: one line, growing to 6.<br>**Press to talk:** the long-press tooltip popped over the composer, and "Listening…" added a line above it, which jumped the layout. Now voice swaps contents in place: mute takes the photo button's slot, and the status takes the text slot. The mic shows its state with the icon and a filled container. Touch tooltips are off.     |
| B4  | `c5b66dd` | New `backStack.ts`: every open sheet or dialog in the owner app owns one same-URL history entry. Back pops it and closes the top one. Closing in-app removes the entry again.<br>**Unsaved input:** a typed composer draft, a changed edit form or an open review shows an in-app "Discard changes?" (Keep editing / Discard), and `beforeunload` guards leaving the page.<br>**Scope:** owner app only (`BackHistory` context in `V1App`). The customer pages keep their own URL history, e.g. Discover's `?view=map`, which a second history owner broke.<br>Copy is in all 10 locales. |
| B5  | `3d41db0` | Removed the "What's new at …" line. With a shop there's a visually hidden `h1` instead; before a shop exists, the greeting stays. The + is in the top bar next to settings, on the coach only. Its sheet state moved to the workspace (`coachActions`). The unused `coachGreetingShop` string was removed from all locales.                                                                                                                                                                                                                                                               |
| B6  | `0f6e975` | **Fits without scrolling:** the setup card is one line plus a progress bar, and "Setup complete" becomes one small chip linking to the customer page. The suggestions sit right under the shop card. On phones only one attention card shows at a time (today's menu → Monday recap → pending), and each one also lives on My shop. Desktop shows them all. `v1.spec` confirms today's menu first on phones.                                                                                                                                                                              |
| B7  | `525f602` | **Phones:** every coach photo entry opens a small menu with "Take photo" (`capture="environment"`) and "Upload photo". That covers the composer button, the "Add my menu" / board-photo chips, the start card's "Take a photo" and requests from other screens.<br>**Desktop** (no camera capture): goes straight to the file picker.<br>**One input:** it keeps a single file input and sets `capture` per choice, so existing specs that use `input[type=file]` still work.                                                                                                             |

## Screenshots (390×844, `docs/bugs/`)

- **Before and after:** `B1`, `B2`, `B3` (Tamil), `B3-voice`, `B4`, `B5`, `B6` and `B6-done` are each paired with a `-before` copy.
- **What the before shots show:**
  - B4: Back left the app to a blank page.
  - B6: the view needed scrolling.
- **B7:** after only. Before, the button opened the file picker directly, so there was no screen to capture.

## Tests

New `tests/phone-shell.spec.ts`: one phone test per bug at 390×844.

- **Checked both ways:** each test was run against the old code first, where it failed, and passes with the fix.
- **axe:** each test runs axe on the touched screen (wcag2a/aa/21aa):
  - the sheet
  - the coach after "Something changed"
  - the composer while recording
  - the Discard prompt
  - the coach with the + in the top bar
  - the coach with the setup chip
  - the photo menu

Changed tests:

- **`phone-regressions` PHONE-2:** "Add photo" → "Upload photo" → file chooser.
- **`v1.spec`, customer facts and busy-hours sweep:** on phones, confirm today's menu first, then the next card shows.

Results on this machine, 1 worker, on ports 3210/3310. Ports 3200/3300 belong to another checkout's dev servers, which I left running.

- **First group, 195 passed, 23 skipped (phone-only tests on desktop):**
  - `phone-shell`, `phone-regressions`, `v1`, `v1-a11y` (light and dark, every screen)
  - `identity`, `import`, `coach-reliability`, `i18n`, `google-sim`
  - `discover`, `frontdoors`, `streaming`, `planning`, `rewards`, `forecast`
  - `starter` is the exception: it failed in this group and is listed below.
- **Port-swapped copies, all pass:** `customer`, `demo-flow` and `starter` hard-code `127.0.0.1:3200`, so they ran as temporary copies.
  - `customer`: 10 passed
  - `demo-flow`: 2 passed
  - `starter`: 12 passed. In the first group it failed only because it treats non-3200 URLs as external.
- **Static checks:** `tsc -b`, `eslint src --max-warnings 0` and `prettier --check` pass.

## Skills

I loaded `material-design-3-ui` (plus its feedback-and-overlays reference) and
`web-interface-guidelines` before changing components. Neither was wrong for this work. One
tension: M3 says not to stack a modal on another modal. The Discard prompt does sit over the
edit form or review, but that is the standard confirmation case, and the guidelines require a
warning on unsaved changes.

## Open questions

1. **B6, card order on phones:** today's menu check comes before the "Customers ask" card and the
   busy-hours sold-out sweep, so at lunch the owner taps "Yes, all good" before seeing the sweep.
   Say if the sweep should go first.
2. **B4, a draft on another tab:** a typed coach draft also guards Back on other tabs (the coach
   stays mounted with its draft), so Back on My shop asks "Discard changes?" while a draft exists.
3. **Unused copy:** `frontdoors` copy `celebration` ("Your shop page is ready to share!") is no
   longer shown. Its locale rows are positional, so I left it in place.
4. **B13–B15:** only a real phone can confirm B2 (the keyboard height rule) and B7 (the camera
   opening directly).
