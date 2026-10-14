# Account 2 status — phone shell bugs B1–B7

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
