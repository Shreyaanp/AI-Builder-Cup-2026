# Land release 2 on current main (account 4)

You built release/stable-2 on top of release/stable-1 at 2b8e65a. Stable-1 has since been squash-merged
into main (65767d3) together with its CI fixes (31923ff: production settings test; 10e46eb: browser
navigation + the REAL owner RescueTile and MorningBrief wired on Grow), and #41 (customer answers in
under a second: instant local results, streamed Gemini, skeletons, prefetch — fb483b2) merged after.

In this worktree (~/work/chalkboard-release2):

1. `git fetch origin && git switch -c release/stable-2-main && git rebase --onto origin/main 2b8e65a`
   (replays only your 15 commits).
2. Resolve conflicts keeping BOTH sides:
   - src/features/v1/screens/GrowScreen.tsx: keep main's real RescueTile + MorningBrief (owners must be
     able to send a rescue deal from Grow) AND your playbook ordering + payments/guide cards.
   - docs/stories/*.png: take yours (newer) unless the screen came from #41's customer ask flow, then
     regenerate by rerunning that story.
   - Customer ask/answers: #41's instant local results + streaming must stay; layer your search-engine
     ranking, maps grounding and recs on top (our shops ranked by the engine appear instantly).
   - openapi.json / generated.d.ts: regenerate.
3. Your open risk "S9 rescue: tab redesign no longer shows rescue": main now wires RescueTile on Grow —
   verify S9 passes; if the morning brief / "Asked nearby" tile is still missing, put it on Grow (owner
   decision: rescue, morning brief and Asked nearby live on Grow).
4. Test data pollution you found: make customer-ask and S12 specs use unique shop data (or a fresh DB)
   so they pass on reruns.

Verify (NEVER run commands in the background; foreground only; `--workers=1`): Ruff, mypy, backend
pytest, lint, build, hooks, `npx prettier --check .`, then tests/stories/, tests/customer-ask.spec.ts and
your feature specs. Push `release/stable-2-main`, `gh pr create --base main` titled "Stable release 2:
supply chain, connect, payments, Google services, devops, maps, recs, search, playbook" with your
handoff summary. Plain commit messages, no AI trailers. No parallel sub-agents.
