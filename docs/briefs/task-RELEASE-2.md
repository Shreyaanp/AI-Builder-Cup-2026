# Stable release 2: combine the remaining PRs on top of stable release 1 (account 4)

Create the worktree: `git -C "<repo>" worktree add ~/work/chalkboard-release2 -b release/stable-2
origin/release/stable-1` (already done if it exists; then just work in it). Ports WEB_PORT=3751 API_PORT=3851.

Apply these PRs IN THIS ORDER as 3-way patches on top of the previous result, committing after each one
(plain message "Release 2: apply #<n> <branch>", no AI trailers):

git diff origin/main...origin/<branch> --binary | git apply --3way --index

1. feat/supply-chain (#19) 2. feat/connect-system (#15) 3. feat/guide-payments-landing (#28)
2. feat/google-services (#27) 5. fix/devops-hardening (#31) 6. fix/agy-qa-2 (#18)
3. feat/maps-grounding (#30) 8. feat/recs-ai (#29) 9. feat/search-engine (#33)
4. feat/shop-playbook (#32)

Resolve every conflict before the next apply, keeping BOTH features:

- agent.py / coordinator.py / main.py / merchant*.py: union of tools, routes and behaviour; never drop one.
  Voice-everything (already in stable-1) must expose tools for the new features (supply chain orders,
  payments links, playbook) — add thin tool wrappers if missing.
- Payments/rides links live on Grow. Playbook's Today hints now have a real Today page (stable-1): wire
  them into Today's personal line and "Needs you now" ordering; Grow card order uses the playbook.
- Search engine, maps grounding and recs all touch the customer ask/answers: one answer flow — our
  shops ranked by the search engine first, grounded Google places on the map, "Similar nearby" from
  recs when its switch is on else embeddings.
- Screenshots (*.png): take the incoming version. docs/openapi.json and src/api/generated.d.ts:
  regenerate from the combined backend (never hand-merge). Handoff markdown: keep both.
- QA-finding PR #18: keep only fixes still valid on the merged code.

Verify (machine is shared: `--workers=1`; NEVER run commands in the background; run in the foreground
and wait): Ruff, mypy, full backend pytest, `npm run lint`, build, hooks, `npx prettier --check .`, then
the browser specs of these features plus tests/new-shop*.spec.ts and tests/stories/. Rerun a timed-out
file alone before calling it a failure. Fix real failures.

Done: push `release/stable-2`; write docs/handoff/release-stable-2.md (per PR: conflicts and resolution;
checks with numbers; open risks); `gh pr create --base release/stable-1` titled "Stable release 2: supply
chain, connect, payments, Google services, devops, maps, recs, search, playbook". No parallel sub-agents.
