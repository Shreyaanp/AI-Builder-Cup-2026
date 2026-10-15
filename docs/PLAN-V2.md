# Chalkboard V2 plan: the single source of truth (decided 15 Oct 2026)

Read this first after any context reset. Submission is **18 Oct 2026** (product + demo video).
The product is a **showcase of what Chalkboard looks like at scale**, not a production launch:
generated demo data is fine and expected, as long as it is labelled as demo.

## Owner decisions (15 Oct, verbatim intent)

1. **Order of work:** V1 stable and bug-free first ("get V1 out without any bugs"), then refine,
   then add logic and features. The owner tests and reports bugs; UI/UX flow beats extra features.
2. **Build all six features:** unmet-demand radar, closing-time rescue deals, neighbourhood
   passport, morning brief, group buying, price check. Plus a **supplier radar** (suppliers see
   what nearby merchants need; group-buy requests suppliers can respond to).
3. **Customer side fully gamified with real motion graphics** and a real reason to come back.
   The current customer page is not acceptable. Do not auto-dump things on the page: show a
   curated series ("near you") of genuinely surprising, worthwhile neighbourhood finds.
4. **No more black-and-white.** Redo the theme for the whole app (customer and owner): colourful,
   2026, hand-crafted feel, every element considered. Material 3 base is fine but must not be dull.
5. **Demo data generator:** when a user opens the app (customer or owner), Gemini generates
   believable shops, menus, updates, deals, tips and activity **around the user's real location**,
   merged with Google Places where available, so the app looks like it does at peak usage.
   Always labelled demo. Other local-info APIs are allowed if free.
6. **UX heat-map thinking:** every screen designed around where attention and thumbs go.
7. **Motion tools allowed:** GSAP, three.js, HyperFrames, OpenMontage and similar; copying good
   open components/patterns is fine (respect licences).
8. **Never let a worker idle:** Codex and account 2 always have a task; resume automatically when
   a usage limit resets. Keep this file and STORIES.md current so work continues after compaction.
9. **Product demo video** must be excellent; it is made once features are near complete.
10. Earlier standing decisions still apply: works globally (Singapore/APAC only as demo default),
    15 languages including Indian ones, honest labels, no payments/checkout, never claim Google
    publishing, no the assistant co-author trailers in commits, free-tier constraints.
11. **Rejected:** multilingual offline coach replies (QA Q1, won't fix).

## Build order (agreed)

| Day    | Work                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 15 Oct | Finish QA fixes (V1 stable); research tracks A–C; owner picks a visual direction; new theme across the app; demo data generator |
| 16 Oct | Passport + rescue (customer); morning brief + radar (owner); generator polish                                                   |
| 17 Oct | Group buying, price check, supplier radar; full UX pass; owner testing round; fix findings                                      |
| 18 Oct | Demo video, final checks, submission                                                                                            |

Cut order if late: group buying first.

## Research tracks (no product code; outputs in docs/research/)

- **A · Visual identity and motion** → `docs/research/visual-motion.md` + mockups. Starting idea:
  lean into the name, a chalkboard-green base with chalk-pastel accents (sunflower, coral, mint,
  sky), one colour per feature, hand-drawn touches, motion: chalk redraws, stamp thud + dust,
  badge unlock, sketching "thinking" state; reduced motion respected.
- **B · Customer gamification and neighbourhood discovery** → `docs/research/customer.md`.
- **C · Owner + supplier features** → `docs/research/owner-supplier.md`.

## Feature definitions of done

Each feature: works end to end on phone (390×844) and desktop, all 15 languages, light and dark,
honest demo labels, reduced motion, axe clean, a story walkthrough test, live on the site.

- **Neighbourhood passport:** area pages; stamps from QR visit, rescue, helpful tip, first try;
  quests (e.g. breakfast crawl, seasonal trails); levels Newcomer → Regular → Local Hero; weekly
  streaks; opt-in leaderboard; badges unlock owner-chosen perks.
- **Closing-time rescue:** forecast leftovers → owner one-tap offer to followers with countdown;
  customer rescue map pulses near closing; impact meter ("you saved 12 meals").
- **Unmet-demand radar:** owner sees what customers nearby asked the AI for that nobody sells
  (from discover/ask queries, anonymised, aggregated).
- **Morning brief:** one swipeable card: prep plan, weather, low stock, best action today.
- **Price check:** item price vs similar shops nearby (median/range).
- **Group buying:** nearby shops pool supplier orders for bulk price.
- **Supplier radar:** suppliers see aggregated merchant demand and group-buy requests.
- **Demo data generator:** see decision 5.
- **Theme overhaul:** see decision 4 and track A.

## Workers and recovery

- Account 2: headless `devtool -p` with `TOOL_CONFIG_DIR=%USERPROFILE%\.tool-account2` in
  `%USERPROFILE%\work\chalkboard-ui`; devtool.exe is under
  `%USERPROFILE%\.vscode\extensions\dev-tooling-extension-*\resources\native-binary\`. Logs in
  `%TEMP%\account2-*.log`; status in `docs/handoff/account2-status.md`.
- Codex: `.tooling\skills\codex-delegate\delegate.ps1 -Mode write -Worktree -Effort high
-TaskFile <task>`; worktrees in `%USERPROFILE%\.codex\worktrees\`; Codex never commits.
- Ports: me 3427/3527, Codex 3437/3537, account 2 3447/3547.
- Release: `powershell -File scripts\ship.ps1 -SkipChecks` after CI is green on main.

## Status log (newest first)

- 15 Oct: live `e6722cb`, which carries customer sign-in/chats/follow/tips, Firestore fixes,
  locally made badge and the Q8 fix. QA machine (`npm run test:qa`, 118 cases) found 14 issues.
  In progress: Codex → owner QA fixes (Q6, Q7, Q12–Q14); account 2 → customer QA fixes (Q2–Q5,
  Q9–Q11). Next: research tracks A–C, then theme + generator.
