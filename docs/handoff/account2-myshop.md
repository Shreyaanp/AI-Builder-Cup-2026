# Account 2: bug fixes B26–B28 and B16 (My shop, feature freeze)

Read `BUGS.md` on origin/main first. Build no features: fix only these bugs.

## Setup and ground rules

- Branch: `git fetch origin; git switch -c fix/myshop origin/main`. Push only that branch.
- Never push to main. Every push to main now **auto-releases** to production. Account 1 merges.
- Never add AI co-author trailers to commits.
- Codex is on `fix/global-facts`: payment and delivery free text in `merchant.py`, finder
  categories in `discover.py`/`Discover.tsx`, and `business_profile.py`. Avoid those areas. If you
  must touch `merchant.py`, keep the change minimal.
- Load `.agents/skills/material-design-3-ui` and follow it. Design phone-first at 390×844; desktop
  must still look good.

## B26: remove the My shop page header

At the top of My shop, the shop name is shown again (it's already in the top bar) along with a
"Draft" or "Check pending" chip. Remove that whole block so the tile grid moves up. If the pending
or draft state matters, it belongs as a small status inside the relevant tile.

## B27: the bento grid isn't data-friendly

Tiles like "Shop details" span the full width while their content ends at about 75%, leaving dead
space. Make the grid size to the content:

- a dynamic grid where each tile's width follows how much it shows (e.g. CSS grid with `auto-fill`
  / `minmax`, and spans chosen per tile from content length);
- no tile with a large empty area, and no truncated data;
- check it at 390px, 600px and desktop widths.

## B28: the menu

1. **Automatic categories.** Items currently land in "Uncategorised". Every item added by photo,
   import or the coach must get a category automatically. Check the extraction and import paths:
   `photos.py` prompt and schema, `imports.py`, and the `propose_products` tool.

   Existing uncategorised items need a fix too: an owner-reviewed "Sort my menu" proposal is fine.
   It must stay a proposal reviewed before saving, never a silent write.

2. **Menu layout.** Category sections, each a grid of compact item cards (2 per row on phone, 3+ on
   wider screens) with the name and price easy to scan. Sold-out items are visibly marked.
3. **Inline price edit.** Tapping a price edits it in place, not in a modal: a numeric keypad on
   phones, Enter or blur to save, Esc to cancel. It still follows the owner-confirmation rule the
   app uses for prices. Use the existing proposal/review flow in its lightest form; if a full review
   sheet is required by the rules, keep it to one tap to confirm.
4. **Units are a dropdown, not free text.** Use a fixed list: item, piece, cup, glass, bottle,
   plate, bowl, set, portion, slice, pack, box, dozen, kg, g, litre, ml, hour, service. Translate
   the labels into all 10 locales.

   Legacy free-text units must still display. Map known synonyms on load, otherwise show the text
   as-is until the owner picks one. The coach and extraction should output one of these values.

5. **Menu sheet buttons on phone.** The bottom-sheet buttons "Import sales or menu (Excel, photo,
   notes)" and "Add product" are oversized and misaligned. Shorten the import label (e.g. "Import")
   and keep both buttons on one row in a compact, aligned layout.

## B16 (still open from the last brief)

In the coach composer, add one attach button with a small menu:

- **Take photo**;
- **Photo library**;
- **Document** (PDF/Excel/CSV), routed to `POST /businesses/{bid}/import`. Reuse the
  `ImportMenu.tsx` flow.

## Proof and report

For each bug:

- a 390×844 screenshot in `docs/bugs/B<n>.png` (also `B27-desktop.png`);
- a targeted phone Playwright test;
- axe clean on My shop and the menu sheet;
- backend tests for categorisation and units.

Report in `docs/handoff/account2-status.md`: the commit for each ID, the tests and their results.
