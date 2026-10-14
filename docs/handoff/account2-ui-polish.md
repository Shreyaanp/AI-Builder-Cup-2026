# Account 2 brief: phone UI/UX polish (do this BEFORE demo shops)

Same ground rules as `account2-demo-shops.md`:
- work on your own worktree and branch (`ui/phone-polish` from `origin/main`) and push the branch;
- don't release;
- never add AI co-author trailers to commits.

Codex is building forecasting/import (`backend/app/imports.py`, `planning*`, `ImportMenu.tsx`) and
rewards, so don't touch those files. Before writing components, load the project's M3 skill
(`.agents/skills/material-design-3-ui`) and the vendored web-interface guidelines. Every component
must follow them. If the skill itself is wrong, write that in your status file. Design phone-first:
desktop already looks good, the phone doesn't. Use one line wherever possible, compact spacing and
no clutter. Test at 390×844.

The user reported each item below on a real phone.

1. **Landing hero phone mock** (`src/features/frontdoors/Marketing.tsx` + `landing.css`). It's static
   and looks flat. Animate the story as a loop:
   - the user bubble types in;
   - "Prepared…" streams in;
   - the "Check before saving" card slides up with a spring;
   - the price changes from $2.00 to $1.80;
   - Kaya toast gets struck through and the "Sold out" chip pops in;
   - the Confirm button is pressed (ripple), a "Saved ✓" snackbar appears, then the loop resets.
   
   Fill the empty lower half of the phone: add a composer bar at the bottom and a status bar at the
   top. Respect `prefers-reduced-motion` by showing the final state. Animate with transform and
   opacity only.
2. **Coach composer on phone**:
   - make it a single-line input that grows only when typing multiple lines;
   - fix the glitchy press-to-talk, which shows too much and jumps the layout. Hold-to-talk should
     be an icon state, not a big overlay.
3. **Bottom sheets on phone are broken**:
   - the slide-in sheet is mispositioned;
   - after tapping "Something changed" (freshness card), the bottom navigation disappears for good.
   
   Fix the root cause in `src/features/v1/Sheet.tsx` and the navigation layout.
4. **Back and quit**:
   - the Android or browser back button should close an open sheet or dialog first, using history
     state;
   - with unsaved input (a draft message, an open review), show a confirm before leaving
     (`beforeunload`) and an in-app "Discard changes?" dialog on back.
5. **Top bar**:
   - remove the "What's new at <shop>" line;
   - move the + (new chat) button to the top-right, next to the settings icon.
6. **Coach first view**:
   - it must not scroll; move the suggestions higher;
   - when every setup step is done (for example "5 of 5"), collapse the progress card to one small
     line or chip.
7. **My shop**:
   - make the notification and pending cards thinner;
   - collapse the setup header to a small line when it's complete;
   - use smaller type for "Your customer page is ready to share" and "Open customer page".
8. **Camera**: wherever a photo is accepted, offer "Take photo" (`capture="environment"`) as well
   as "Upload".
9. **Hours**: the shop has only opening hours. Add structured open and close times per day (keep the
   free-text fallback) in the backend model, the editor, the public page and `open_now`. Write a
   backend test.
10. **Menu categories**:
    - products get a `category` field, stored in the DB and settable by the coach tools and the
      editor;
    - the public page and My shop group items into compact category boxes or cards;
    - the coach and photo extraction assign categories automatically.
11. **Google page**: say "simulation" or "simulated" only ONCE on the page, in one clear label at the
    practice section. Remove the repeated flags inside it, but keep a single visible label so it's
    never mistaken for real. Update the tests accordingly and keep the honesty intact.

Testing:
- run targeted Playwright (phone project) and axe for the screens you touch, plus a backend test
  for items 9 and 10;
- take before and after phone screenshots and save them to `docs/handoff/shots/`;
- report in `docs/handoff/account2-status.md`.

Do the demo shops brief after this.
