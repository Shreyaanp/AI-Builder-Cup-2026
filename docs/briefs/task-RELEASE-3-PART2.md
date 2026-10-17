# Release 3 part 2: bring in everything else, then make #66 merge-ready (account 3)

Same worktree ~/work/chalkboard-release3, branch release/stable-3 (PR #66). Same rules: NEVER run commands in
the background; foreground only, batches under 10 min; `--workers=1`; no parallel sub-agents; plain commits,
no AI trailers; never force. Merge in this order, keeping both sides' intent:

1. origin/main (gained #55 voice language, #53 bug hunt, #57 QA fixes, #42 customer fixes, #49 #51 #48 docs).
2. origin/fix/hindi-e2e (#61), origin/fix/code-quality-audit (#62, docs), origin/fix/welcome-stamps (#63,
   stacked on #56), origin/feat/customer-story (#64), origin/fix/face-check-v2 (#67: note its lowered
   liveness thresholds in the handoff for the owner), origin/fix/customer-layout (only if pushed and green;
   otherwise skip and say so). Do NOT merge wip/customer-places-cache. Do NOT merge fix/voice-reliability
   (onboarding v2 is still being built; it merges later).
3. Regenerate openapi/types if needed; Ruff, mypy, pytest, lint, build, hooks, prettier; FULL browser suite
   phone + desktop in batches; `npm run test:qa`; rerun failures alone (the machine is loaded: a failure that
   passes alone is load, report it as such). Update docs/handoff/release-stable-3.md. Push. Make sure PR #66
   CI is green (fix failures). Summarise: what is in, conflicts, results, anything skipped.
