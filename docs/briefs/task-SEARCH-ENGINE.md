# Track H: one search engine + personalised picks (account 3, blast session)

Worktree ~/work/chalkboard-customer. Create branch `feat/search-engine` from `feat/customer-ai-first`
(PR #11, not merged yet; `git fetch && git switch -c feat/search-engine origin/feat/customer-ai-first`).
Read docs/OWNER-NOTES.md, docs/HACKATHON-REVIEW.md, .agents/skills/personalization and content-design
(merge origin/main to get them), AGENTS.md. Ports 3477/3577.
Others own (do not touch): Maps grounding + results map (feat/maps-grounding), Recommendations AI
(feat/recs-ai; call its `similar_items()` behind its switch if it exists, else embeddings only),
owner onboarding, supply chain, trust, games, Today, tabs.

**Headless rules:** never run commands in the background; run tests in the foreground and wait. The
machine is shared by 8+ sessions: run ONLY your own spec files with `--workers=1`; the full
`npm run check` only at the end, rerunning timed-out files alone. Plain commit messages, no AI
co-author lines. Commit small and push often.

## Owner decisions

- ONE engine for customers finding products/producers nearby AND vendor-to-vendor sourcing
  (backend/app/sourcing.py find_suppliers should call the same engine).
- What works immediately:
  1. **Vertex AI text embeddings** (backend/app/memory_vectors.py already uses gemini-embedding-2) of
     every product and shop (name, category, description, menu items), cached per item and re-embedded
     only when it changes (GCP credit is limited: batch, cache, never embed on every request; offline
     fixture embeddings for tests/local).
  2. **Hybrid ranking**: semantic similarity + exact/keyword match + distance + open now + price fit +
     freshness (menu confirmed recently) + the customer's own signals (stamps, follows, asked,
     opened, saved), with weights in one place and unit-tested.
  3. **Google Places popularity** (rating, review count) as a live signal only, shown with
     attribution, never stored (Maps terms).
  4. **Gemini explains each personal pick in one line** ("Because you liked filter coffee at
     Sharma's"), only for the top few, cached; no explanation call per keystroke.
- "Similar nearby" on shop and item pages; personalised Today's 7 ordering; zero-data start
  (location + time + popular nearby).

## Done

Backend engine module + tests (ranking, cold start, personalization, sourcing reuse, both stores),
customer UI using it (front door answers, similar nearby, Today's 7), 15 locales, phone + desktop,
light + dark, axe clean, a story test, screenshots docs/stories/search-*.png, an eval script with a
small labelled set (precision@5 before/after) saved to docs/impact/search-eval.md. Push,
`gh pr create` (base main; note it builds on #11), update docs/handoff/account3-status.md. Summarise.
