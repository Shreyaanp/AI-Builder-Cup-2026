# Track Q: customer gamification built on game theory (account 3, session 3)

Branch `feat/customer-games` in this worktree (from origin/main). Read first: docs/OWNER-NOTES.md,
docs/PLAN-V2.md ("Final push plan"), docs/HACKATHON-REVIEW.md, docs/research/customer.md,
docs/research/visual-motion.md, docs/REVIEW.md, AGENTS.md, and the passport/rewards code
(src/features/passport/*, backend passport modules and routes, tests/stories/s8-passport.spec.ts,
tests/rewards.spec.ts). Setup: `npm ci`, `uv sync --project backend`; node at
C:\Users\pshre\AppData\Local\AIBuilderCupTools\node-v24.21.0-win-x64 (add to PATH).
Ports WEB_PORT=3527 API_PORT=3627; RECALL_PATH=data/test-vectors.
Plan the whole design first (plan mode), then build it end to end.

**Coordination:** account 3 session 1 is redesigning the customer front door on
`feat/customer-ai-first` (src/features/discover/AskHome.tsx, conversation, customer chats,
frontdoors). Do NOT edit those files. You own the game layer: passport, stamps, rewards, quests,
streaks, scratch cards, boards, perks (src/features/passport/*, backend passport/rewards) and new
game components. Expose small entry points (a component + a hook) that the front door can mount;
document them in docs/handoff/customer-games.md so the assistant can wire them in after both merge.

## Owner's words

"Gamify the customer portal properly: use game theory to make it very intuitive." "I like the
scratch card / stamp card concept but make it more prominent and make it obvious how it works."
Customer app = the flashy, delightful one (Chalkboard theme, GSAP chalk motion,
src/design/chalkMotion.ts, reduced motion respected).

## Design (each mechanic grounded in game theory / behavioural design, documented)

1. **Variable reward**: a scratch card after a verified stamp (scratch with finger/mouse,
   canvas, haptic where available); outcomes from a transparent, server-decided table (perks,
   bonus points, "try again tomorrow"); never pay-to-play, never misleading odds (show them).
2. **Endowed progress**: new stamp cards start with progress (e.g. 2/10 "welcome stamps").
3. **Loss aversion done kindly**: streaks with a freeze token earned by activity; a gentle
   "keep your streak" nudge, never guilt.
4. **Collection sets**: themed sets (Chai trail, Locally made, Night market, festival trails)
   that unlock a badge and a shop perk when complete.
5. **Cooperative goal (public-goods game)**: a street/neighbourhood weekly goal ("500 visits →
   everyone who helped unlocks X"), showing the shared bar and your contribution; cooperation
   over cut-throat competition.
6. **Social proof, opt-in**: "12 neighbours tried this", opt-in boards (existing), friends later.
7. **Reciprocity**: shops reward tips/follows/repeat visits with small perks configured by the
   owner (backend + a tiny owner setting, calm owner UI).
8. **Clarity**: every mechanic has a one-glance "how it works" (3 steps, illustrated), progress
   always visible, the next reward always named ("2 more stamps → free bun maska").
9. **Anti-abuse**: one stamp per shop per day (existing), signed QR, rate limits, server-side
   outcome decisions; honest demo labels.

## Definition of done

Backend models/routes/tests (outcome table, sets, co-op goals, freeze tokens, perks; SQLite and
Firestore), frontend components with distinctive motion (scratch reveal, set completion,
co-op bar fill, streak flame), all 15 locales, phone 390x844 + desktop, light + dark, axe clean.
Story test tests/stories/s13-games.spec.ts (stamp → scratch → reward → set progress → co-op
contribution → streak freeze), screenshots docs/stories/games-*.png and a short screen recording
(Playwright video) of the main moment. docs/research/gamification.md explains each mechanic and
its theory. Run backend tests, `npm run check`, `npm run test:qa` (fresh DBs). Commit small (no AI
co-author trailers), push, `gh pr create` into main, write docs/handoff/customer-games.md. Summarise.
