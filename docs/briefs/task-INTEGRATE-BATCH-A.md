# Stable release 1: combine the owner core PRs into one working tree (Codex)

Today's stable release for the owner to test. Build ONE combined working tree; the orchestrator commits
and pushes it as branch `release/stable-1` and opens one PR.

Setup: you are in a fresh worktree. `git fetch origin && git checkout --detach origin/main`.

Apply these PRs IN THIS ORDER, each as a 3-way patch on top of the previous result (no commits needed):

  git diff origin/main...origin/<branch> --binary | git apply --3way --index

  1. feat/today-page (#25)      2. feat/owner-tabs (#24)       3. feat/onboarding-inchat (#21)
  4. feat/trust-fraud (#20)     5. feat/voice-everything (#26) 6. feat/customer-games (#23)
  7. fix/agy-qa-1 (#16)         8. docs/story-director (#14)

After each apply, resolve every conflict before applying the next one:
- Code: keep BOTH features. Today lives on the Coach tab; owner tabs are Shop / Grow / You; ShopTiles
  must contain both the tabs refinement and the in-chat changes; voice-everything coach tools must also
  cover Today, tabs, trust and games. agent.py / coordinator.py / discover_ask.py / AskHome.tsx: merge
  both sides' tools and behaviour, never drop one.
- docs/stories/*.png, docs/bugs/*.png screenshots: take the incoming (newer) version.
- docs/openapi.json and src/api/generated.d.ts: do not hand-merge; regenerate them from the combined
  backend at the end (the repo's contract script).
- Handoff/status markdown: keep both sections.

At the end: regenerate API contracts; `npx --no-install prettier --write` on changed files so
`prettier --check .` passes. Verify (machine is shared: `--workers=1`; never run commands in the
background): Ruff, mypy, full backend pytest, frontend lint + build + hooks, then the browser specs of
these features plus tests/new-shop*.spec.ts and tests/stories/s10*. Rerun a timed-out file alone before
calling it a failure. Fix real failures.

Leave everything uncommitted in the working tree. Write release-stable-1-report.md in the worktree root
(outside the repo is fine): per PR, conflicts and how resolved; checks with numbers; open risks.
