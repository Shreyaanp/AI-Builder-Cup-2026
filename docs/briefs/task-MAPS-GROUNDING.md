# Maps grounding + interactive results map (account 3, blast session)

Own worktree: `git worktree add ~/work/chalkboard-maps -b feat/maps-grounding origin/feat/customer-ai-first`
(PR #11, not merged yet; if it has merged, base on origin/main). Ports WEB_PORT=3481 API_PORT=3581.
Read docs/OWNER-NOTES.md (16 Oct ~06:00), AGENTS.md, .agents/skills/personalization and content-design.
Others own (do not touch): search ranking engine (feat/search-engine), Recommendations AI
(feat/recs-ai), owner onboarding, supply chain, trust, games, Today, tabs.

**Headless rules:** never run commands in the background; run tests in the foreground and wait. The
machine is shared by 8+ sessions: run ONLY your own spec files with `--workers=1`; never the full
`npm run check` until your last step, and then rerun timed-out files alone. Plain commit messages, no
AI co-author lines. Commit small and push often.

## Build

1. **Gemini grounding with Google Maps** (top priority): the customer AI answers questions about the
   AREA with Google's live local knowledge ("is there parking near X?", "what's open near the metro?",
   "best filter coffee near me") via Gemini's Google Maps grounding tool on Vertex. Show Google's
   required attribution. Cache per query+area (GCP credit is limited). Behind a feature switch with an
   honest fallback. Our own shops stay ranked first for products we have.
2. **Interactive results map**: when the customer asks "I want coffee", show a real interactive map
   (Google Maps JS with the existing browser key) with every matching place pinned (our shops +
   grounded Google places, visually distinct), pins and cards linked both ways (tap pin → highlight
   card, tap card → focus pin), user location, open-now state on pins, smooth motion; phone-first
   sheet layout (map on top, cards in a draggable bottom sheet).
3. Fix the Browse "Map view" blank grid (QA sweep 1 finding 15).
4. Honest fallback when Maps is unavailable: list + straight-line distances. No Routes API.

## Done

Backend tests (grounding call shaping, cache, attribution, fallback, switch off), a story test,
15 locales, phone + desktop, light + dark, axe clean, screenshots docs/stories/maps-*.png, handoff
docs/handoff/maps-grounding.md. Push, `gh pr create --base main` (note it builds on #11). Summarise.
