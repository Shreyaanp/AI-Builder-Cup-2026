# UI-2 report — Phone declutter + My shop as tiles

Branch `ui/coach-screen`, built on UI-1. No backend or API changes. No change to the bottom
navigation bar or to the proposal/confirm flow. No new dependencies.

## Merge with main (done first, on request)

`main` (41a5013, 3764680) was merged in as `13763c5`. The only conflict was in `CoachScreen.tsx`:

- **Main's change:** "+" became an actions dialog (Add shop details / Add product / New
  conversation), covered by the new `PHONE-2` test.
- **UI-1's change:** "+" and history moved into a ⋮ menu.
- **Resolution:** one "+" button (label "New conversation", as main has it) opens the shared
  `Sheet`, named "New conversation". It holds main's three actions plus the earlier-conversations
  list, so every coach action is still in one place. Main's currency and history-refresh fixes are
  kept.
- **Test change:** one line in `tests/phone-regressions.spec.ts`. `PHONE-2` tapped the old
  next-step button "Add now"; UI-1 folded that into the shop card, so it now taps "Add your
  opening hours" (same intent: the next step opens Edit details).
- **Checks on the merge:** v1, v1-a11y and phone-regressions all passed on phone (34/34).

## What changed

1. **Coach = conversation first.**
   - There was no planning/"Today" card on the coach page; planning already lived in My shop.
   - The only other card was the ≥1200px desktop side pane (`ShopSummary`). I removed it, along
     with `ShopSummary`.
   - The coach now shows at most one compact card: UI-1's shop card, which is the one-line pinned
     version during a conversation.
   - Screenshot `after-3-coach-conversation-*`: shop card, conversation, chips, composer.
2. **Dynamic suggestion chips** (`CoachScreen.tsx`, marked "rules only (no AI)" in a code comment).
   - **Where:** under the latest coach reply, and under the shop card on an empty thread.
   - **No shop:** "Send a photo of your board" opens the photo picker. "Tell me your shop name"
     starts a `Shop name: ` note, which the offline coach parses.
   - **Shop, no items:** "Add my menu" opens the photo picker.
   - **Items exist:** "Something sold out?" opens the sold-out sheet. "Change a price" starts a note.
   - **Shop not shared:** "Share my customer page" opens the customer page sheet.
   - **Unread customer messages:** "Reply to customers (n)" opens the messages sheet and comes first.
   - At most 3 chips. Before any shop exists, the empty screen still shows only UI-1's start card,
     as UI-1 required.
3. **My shop = tiles** (`ShopTiles.tsx`, `screens/ShopScreen.tsx`).
   - **Layout:** a 2-column grid on phone (3 at ≥900px). Rounded 20dp tiles show an icon and
     label, one big value, and a little supporting detail.
   - **Sheets:** every tile opens a bottom sheet using UI-1's `Sheet` and motion.

   | Tile           | Shows                                              | Sheet                                    |
   | -------------- | -------------------------------------------------- | ---------------------------------------- |
   | Shop details   | Open now / Closed now, hours · category · location | All fields + Edit details                |
   | Menu           | Item count, top 3 items with prices, "View all"    | Compact rows (tap to edit) + Add product |
   | Sold out today | "1 sold out" + names                               | One-tap availability switches            |
   | Customer page  | Shared / Not shared                                | Switch, link, Share / Copy / Open        |
   | Messages       | Unread count ("1 new")                             | The existing inbox; Mark as done         |
   | Plan tomorrow  | "How much to prepare"                              | The existing planning card, unchanged    |
   | Readiness      | "5 of 6 ready" + bar                               | Checklist, Edit details, Google          |
   - **"Open now":** worked out only when the hours text is one plain daily range ("07:00–15:00",
     "7am-3pm", overnight ranges). Anything else shows the hours text instead of guessing
     (`openNow` in `shopProgress.tsx`).
   - **Unread count:** comes from the existing owner inbox endpoint (`useUnread.ts`). It refreshes
     when the Messages sheet closes.
   - **Small shared-file edits:**
     - `Sheet` can omit its own title, so the Messages and Plan sheets are named by their existing
       headings and nothing is duplicated.
     - `PlanTomorrow` got one `id` attribute on its heading.

4. **Google screen** (`screens/GoogleScreen.tsx`, restyle only).
   - **Tiles:** a Readiness tile (bar plus what is still missing → checklist sheet) and a "Finish
     on Google" tile (steps, the Live labels, Add on Google, Find & claim on Maps, Copy listing).
   - **Simulator:** `GoogleSimulator` is untouched and stays inline below the tiles, inside a
     tonal container. Its "Simulated — not connected to Google" flag is always visible on the page,
     and its wizard never stacks on a sheet.
   - **Honesty line:** "Chalkboard never publishes to Google for you." stays on the page.

**Copy:** 22 new keys, in English plus real translations in all 9 locales. The planning tile
reuses the planning module's own title.

**Bug found while testing:** the customer-page switch used to be disabled while saving. A
disabled control drops keyboard focus out of the sheet, so Esc stopped working. It now ignores
repeat taps while saving instead.

## Tests updated (labels moved into tiles/sheets)

`v1`, `v1-a11y` (`sharedShop` now returns the share URL), `phone-regressions`, `demo-flow`,
`i18n`, `planning` and `customer` now open the right tile first: Menu, Customer page, Sold out
today, Messages, Plan tomorrow, or Finish on Google. The assertions themselves are unchanged.

## Screenshots (`docs/briefs/ui-2-shots/`, 412×915, light + dark)

The `before-*` shots were taken at `13763c5` (UI-1 + main, before UI-2) with the same script and
data. That data is a shop with 4 items, 1 sold out, 1 unread message, not shared.

| Shot                       | before                         | after                           |
| -------------------------- | ------------------------------ | ------------------------------- |
| 1 coach, no shop           | yes                            | yes                             |
| 2 coach with shop          | yes                            | yes                             |
| 3 coach conversation       | yes                            | yes                             |
| 4 My shop (+ `-full` page) | yes, about 2000px of scrolling | yes, tiles fit about one screen |
| 5 menu sheet               | —                              | yes                             |
| 6 sold-out sheet           | —                              | yes                             |
| 7 messages sheet           | —                              | yes                             |
| 8 Google (+ `-full` page)  | yes                            | yes                             |
| 9 Google steps sheet       | —                              | yes                             |

I looked at every shot and fixed what looked off before this report:

- a redundant "1 / 1 sold out" and "1 / 1 new" on two tiles
- a cut-off card field with no ellipsis
- the honesty line repeated inside the steps sheet

The throwaway shot script is not committed.

## Checks run

- `npx tsc -b`: pass
- `npx eslint src --max-warnings 0`: pass
- `npx prettier --check src tests`: pass
- `CI=1 npx playwright test tests/v1.spec.ts tests/v1-a11y.spec.ts --project=phone`, plus
  `tests/phone-regressions.spec.ts`: **34/34 passed**, on the final code.
- `demo-flow`, `i18n`, `planning`, `customer` and `google-sim` on phone: **22/22 passed**. This
  ran before the last two cosmetic edits (tile values, ellipsis), which only change displayed
  text; `customer`'s `/^Messages 1/` still matches "Messages 1 new".
- **Not run:** the desktop project, the backend suites, `npm run check`. No physical phone test.

## Open questions

1. **QR code.** The brief mentions "QR/link" for the customer page. I only show the link: a QR
   code needs either a new dependency or a hand-written encoder, so I left it for a decision.
2. **Desktop side pane.** The ≥1200px shop pane next to the coach was removed to keep the coach
   to one card. Say if desktop should keep it.
3. **Chip wording.** "Change a price" starts a `Change a price: ` note rather than opening a
   sheet. A price editor would need picking an item first, and the conversation is the faster
   path.
