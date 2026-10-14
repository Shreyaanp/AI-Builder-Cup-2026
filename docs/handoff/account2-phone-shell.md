# Account 2: bug fixes B1–B7 (feature freeze)

Read `BUGS.md` on origin/main first. Build no features. Fix only B1–B7.

## Setup and ground rules

- Branch: `git fetch origin; git switch -c fix/phone-shell origin/main` in your worktree.
- Push only to that branch. Never push to main, release, or add AI co-author trailers.
- Codex is fixing B8–B12 on `fix/shop-polish`. Don't touch ShopTiles, GoogleScreen, the recap,
  hours, or product categories.
- Load `.agents/skills/material-design-3-ui` and the web-interface guidelines before you change any
  component. If the skill is wrong, say so in the status file.

## The bugs

- **B1:** fix the root cause in `src/features/v1/Sheet.tsx` and its layout.
- **B2:** after "Something changed" (the freshness card), the navigation must stay. Find what hides
  it (sheet or keyboard state, a `position` or `height` bug) and fix that.
- **B3:** the composer is single-line and grows only for multi-line text. Press-to-talk should be
  an icon state with no overlay and no layout jump.
- **B4:** the back button closes the top sheet or dialog first, using history state. With unsaved
  input (a draft or an open review), back shows an in-app "Discard changes?" and leaving the page
  triggers `beforeunload`.
- **B5:** remove the "What's new at …" line and put the + button at the top-right next to
  settings.
- **B6:** the coach's first view fits without scrolling and the suggestions sit higher. When setup
  is complete, its card collapses to one small chip.
- **B7:** wherever a photo is accepted in your files (the coach composer and the photo button),
  offer "Take photo" (`capture="environment"`) and "Upload".

## Proof for each bug

- a 390×844 screenshot in `docs/bugs/B<n>.png` (before and after if useful);
- a targeted Playwright phone test that would have caught the bug;
- axe passing on the touched screens.

Use 1 worker if the machine is loaded.

Report in `docs/handoff/account2-status.md`: the commit for each bug ID, the tests and their
results.
