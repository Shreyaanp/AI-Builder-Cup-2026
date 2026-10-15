# Chalkboard V2 plan: the single source of truth (decided 15 Oct 2026)

Read this first after any context reset. Submission is **18 Oct 2026** (product + demo video).
The product is a **showcase of what Chalkboard looks like at scale**, not a production launch:
generated demo data is fine and expected, as long as it is labelled as demo.

## Owner decisions (15 Oct, verbatim intent)

- **FEATURE FREEZE (15 Oct ~19:00):** no new features. Only fix flows, experiences and error
  handling. Account 1 orchestrates only (limits low); workers do the fixes on fix/ branches with
  PRs per docs/REVIEW.md.

0. **Demo revamp (later):** the demo must showcase how to use every feature we build.
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
    publishing, no Claude co-author trailers in commits, free-tier constraints.
11. **Rejected:** multilingual offline coach replies (QA Q1, won't fix).

## New-shop onboarding (owner answers, 15 Oct ~20:00)

- Kill the "Add my shop" form modal and whatever opens after the tour. No modal or sheet.
- Big animated hero ("Let's open your shop"), then a full-screen AI chat.
- The AI speaks first (voice greeting, captions, mute), asks one thing at a time.
- Entry points: "+" in the header, end of the tour, empty My shop.
- Owner's key point: the agent drives. Every agent reply and action appears in the chat; when the
  owner does not answer, the agent still responds in the chat (suggests a default, moves on).
- Full brief: scratchpad task-NEW-SHOP-OWNER-ANSWERS.md, being built by account 2 on PR #3.

## Visual decision (owner, 15 Oct afternoon)

- **Direction 1 · Chalkboard** (docs/research/visual-motion.md, mockups/direction-1.html) plus two
  touches from Direction 2: chunky press-down buttons and die-cut sticker badges in the passport.
- Motion libraries allowed: GSAP (gated with gsap.matchMedia for reduced motion), three.js where it
  earns its place, other open libraries; self-host fonts via @fontsource.
- **Light and dark are interchangeable**; dark mode must be genuinely pleasing (current dark is not).
  One default theme on first load, consistent across landing page, owner and customer.
- **Owner (vendor) app: calm, simple, no information overload, peak UX but not flashy.**
  **Customer app: flashy, animated, gamified, peak UX.**

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

- **Branches and review (owner decision 15 Oct):** every feature on its own feat/<name> branch,
  merged only through a pull request with green checks and the graphify impact comment
  (docs/REVIEW.md, scripts/build_graph.py, scripts/impact.py, npm run graph / npm run impact).
- Account 2: headless `claude -p` with `CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude-account2` in
  `%USERPROFILE%\work\chalkboard-ui`; claude.exe is under
  `%USERPROFILE%\.vscode\extensions\anthropic.claude-code-*\resources\native-binary\`. Logs in
  `%TEMP%\account2-*.log`; status in `docs/handoff/account2-status.md`.
- Codex: `.claude\skills\codex-delegate\delegate.ps1 -Mode write -Worktree -Effort high
-TaskFile <task>`; worktrees in `%USERPROFILE%\.codex\worktrees\`; Codex never commits.
- Ports: me 3427/3527, Codex 3437/3537, account 2 3447/3547.
- Release: `powershell -File scripts\ship.ps1 -SkipChecks` after CI is green on main.

## Status log (newest first)

- 15 Oct ~19:00: live 224a2f5. Mic "Too many requests" root cause: 20-conversation cap per account
  (every mic press made a new conversation); now the oldest are cleared, 400 events per
  conversation. Voice sessions now log ready/rejected/closed. Delete-my-data 500: face worker
  auth fixed earlier; GCS 403 fixed by granting the runtime account roles/storage.objectUser on
  gs://ichiropractic-shop-photos. Open PRs: #2 sign-in screen (needs impact run, then merge),
  #3 new-shop flow (Codex making it a grand full-screen flow, task-NEW-SHOP-GRAND.md), #4 rescue
  UI (account 2, review impact then merge). Account 2 now on fix/erase-hardening.
  Follow-ups: voice should continue the current conversation instead of a new one per press.
- 15 Oct (evening): owner asked: everything running, use Codex, basic owner features must work
  for real (photo/menu upload to register, images, voice) and revamp the demo LATER so it
  showcases how to use every feature. Live: 40b7dec (uploads refused by the 16 KB body guard,
  numbers-as-text readers, 3/3 live Gemini owner runs). On main a164b7e: passport + Today's 7
  merged, owner backends (radar/rescue/brief) merged, delete-my-data fixed (face worker 401).
  New owner bugs being fixed: real GPS location for the shop pin, and a guided AI "new shop" flow
  instead of the manual form (Codex, task-NEW-SHOP.md). Account 2: rescue/radar/brief UI
  (feat/rescue-ui). Next for me: ship a164b7e, keep live owner checks green.
- 15 Oct (late): owner reported broken photo upload, slow mic, "too many requests", and an
  overloaded shop page. Fixed and live (0cdc4b1): Vertex rejects list-length limits in response
  schemas (photos, Close the day, imports, suppliers, demo world all 400ed) so every call now uses
  app/gemini_schema.py (stripped schema + full validation; guard test); stale live streams are
  replaced instead of refused; voice limit 30/10 min; voice sessions start with the 16 most recent
  turns. Demo world generator live with real Gemini (DEMO_WORLD_ENABLED=true on Cloud Run).
  Calmer shop page on main (d063575). Passport + Today's 7 merged on branch merge/passport;
  account 2 is fixing 31 stamp/QR tests there plus an s8 passport walkthrough and dark mode.
  Codex hit its usage limit; WIP saved on wip/owner-backends, auto-resume scheduled 16:47.
- 15 Oct (evening): all QA findings fixed except Q1 (won't fix) and merged. Chalkboard theme
  foundation on main (41f65fb): src/design/chalkboard.ts (roles + theme.chalk feature tones:
  sunflower passport/rewards, coral rescue, mint fresh/local, sky chats, lilac AI insights),
  chalkMotion.ts (useChalkTimeline GSAP gated for reduced motion; dealIn, chalkWrite, stampThud,
  popIn), Caveat hand font (HAND_FONT), chunky buttons, light default first load. In progress:
  Codex → owner backends (radar, rescue, morning brief); account 2 → passport + Today's 7 backend
  then UI on the theme. Next for me: per-screen polish (customer shop page, owner tiles), owner UI
  for radar/rescue/brief once Codex lands, enable DEMO_WORLD_ENABLED in production.
- 15 Oct (afternoon): research done: docs/research/visual-motion.md (+ 3 mockups, recommends
  Direction 1 Chalkboard with Direction 2 buttons/stickers), customer.md (Today's 7 feed, passport
  rules, rescue, generator), owner-supplier.md (radar k-anonymity, rescue, brief, price check, group
  buying, supplier radar). Waiting on owner: pick visual direction. Demo world generator on main
  (c100540; enable in prod with DEMO_WORLD_ENABLED=true). Q8 fixed and live.
- 15 Oct: live `e6722cb`, which carries customer sign-in/chats/follow/tips, Firestore fixes,
  locally made badge and the Q8 fix. QA machine (`npm run test:qa`, 118 cases) found 14 issues.
  In progress: Codex → owner QA fixes (Q6, Q7, Q12–Q14); account 2 → customer QA fixes (Q2–Q5,
  Q9–Q11). Next: research tracks A–C, then theme + generator.
