# Track R: UX research + story director (Codex)

Work from origin/main in your worktree. Do not change product source code; you produce research,
contracts, recordings and fix briefs (the assistant dispatches the fixes). You may add test/recording
scripts under tests/stories/director/ and docs. Read docs/OWNER-NOTES.md, docs/PLAN-V2.md,
docs/HACKATHON-REVIEW.md, STORIES.md, docs/research/*, AGENTS.md first.
Ports WEB_PORT=3537 API_PORT=3637 (fresh DBs), RECALL_PATH=data/test-vectors.

## Why

The app is getting complex. The owner wants every story complete and immersive, and the UI/UX
newly researched for components and aesthetic (phone first; owner app calm and cut to the chase;
customer app flashy and delightful; less eye strain).

## Deliver

1. **docs/research/ux-2026.md**: current research on component patterns and aesthetics relevant
   to us (Material 3 Expressive, motion/shape systems, conversational UI, voice UI, bottom sheets
   vs full-screen journeys, card density, typography for Indic/CJK scripts, accessibility), with
   concrete recommendations mapped to our components (src/design/*, MUI theme).
2. **Story contracts** in STORIES.md for every owner and customer story: persona, trigger, steps,
   each screen's state matrix (loading/empty/error/offline/success), the one motion moment, the
   emotional beat, the hand-off to the next story, and acceptance checks.
3. **Story walker**: Playwright scripts that walk each story on phone 390x844 and desktop, light and
   dark, recording video + screenshots (docs/stories/director/<story>/), plus an attention/density
   heatmap per key screen (element density, competing accents, spacing rhythm, contrast).
4. **Scorecard** docs/qa/story-scorecard.md: each story scored 1-5 on completeness, clarity,
   immersion/motion, consistency, eye strain, with evidence links; and **fix briefs**
   docs/briefs/fix-<story>.md, each small, concrete and owned by one area (owner onboarding,
   coach, my shop, customer, passport/games, supply chain, trust).
   Run against the current main and again against the open PR branches if time allows.
