# Bring PR #50 (release 2) up to date with main after #47 (account 4)

You are in ~/work/chalkboard-release2 on release/stable-2-main (PR #50). Main gained #47 (owner audit fixes,
7349b1f: phone sheets close from the bottom row / 48px X, no dead ends after failed reads, Close the day typed
path, 360px close-day, menu links, dietary info). GitHub reports a conflict in src/features/v1/screens/CoachScreen.tsx.

1. `git fetch origin && git merge origin/main`. Keep BOTH: #47's behaviour and release 2's payment-link card +
   #46's "cards appear when the voice reaches them" rule. Check every other file #47 touched still works with
   release 2 (sheets on Grow cards: Payments & rides, Purchase orders, Your week, Connect your system must use
   #47's phone close row too).
2. Regenerate openapi.json / generated.d.ts if the backend changed.
3. Verify, ALL in the foreground (never background; if a command could exceed 10 minutes, split it into
   file batches): Ruff, mypy, backend pytest, lint, build, hooks, `npx prettier --check .`, then the full
   browser suite for phone and desktop with `--workers=1` in batches (tests/stories/ and tests/*.spec.ts).
   Rerun a failing file alone once; report flakes separately. Regenerate docs/stories/RESULTS.json.
4. Commit (plain message, no AI trailers), `git push origin release/stable-2-main` (no force), summarise.
   No parallel sub-agents.
