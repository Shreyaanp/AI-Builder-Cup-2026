# Orchestrator handoff (read this, then run the loop)

You coordinate workers; you write NO feature code. Read docs/TODO.md (what is left), docs/OWNER-NOTES.md
(owner intent, top = newest) and docs/PLAN-V2.md "Final push plan". Deadline: submit by Sun 18 Oct
20:00 IST (module closes Mon 19 Oct ~00:45). Feature cutoff: Fri 16 Oct midnight IST.

## Workers (all on this Windows PC; repo C:\Users\pshre\OneDrive\Pictures\Documents\AI Builder Cup\niva-starter)

- claude.exe: C:\Users\pshre\.vscode\extensions\anthropic.claude-code-2.1.300-win32-x64\resources\native-binary\claude.exe
- node: C:\Users\pshre\AppData\Local\AIBuilderCupTools\node-v24.21.0-win-x64 (prepend to PATH)
- **Account 3 / account 4** (full capacity, max 2 sessions each, resume after every 5-hour reset):
  `$env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude-account3"` (or 4), then
  `Start-Process claude.exe -ArgumentList '-p','"<one-line prompt: read docs/briefs/<task>.md and do it end to end; no parallel sub-agents>"','--dangerously-skip-permissions' -WorkingDirectory <worktree> -RedirectStandardOutput $env:TEMP\account3-<name>.log -WindowStyle Hidden`.
  A log with "You've hit your session limit · resets HH:MM" = schedule a resume then. Headless sessions EXIT if they
  start a command in the background and wait for it: every prompt must say "never run commands in the background;
  run tests in the foreground and wait". A log ending in "I'll wait…" means it exited early: relaunch with "continue".
  Account 3: Today (~/work/chalkboard-today), tabs (~/work/chalkboard-tabs), search (~/work/chalkboard-customer).
  Account 4: trust/face (~/work/chalkboard-trust), games (~/work/chalkboard-games).
- **Account 2**: sunset after its last two tasks (in-chat camera/map on feat/onboarding-inchat; supply chain). Its
  remaining budget can run THIS orchestrator.
- **Codex** (2 runs always): `& "...\AI Builder Cup\.claude\skills\codex-delegate\delegate.ps1" -Dir <repo> -Mode write -Worktree -Effort high -TaskFile <brief>`
  (resume in an existing worktree with -Dir <worktree>). Queue (briefs in the session scratchpad
  C:\Users\pshre\AppData\Local\Temp\claude\c--Users-pshre-OneDrive-Pictures-Documents-AI-Builder-Cup\73a4fe6d-3da9-4cd8-ae1e-9c94ed6962c5\scratchpad\):
  task-INTEGRATE-PRS, task-GUIDE-PAYMENTS-LANDING, task-SHOP-PLAYBOOK, task-VOICE-EVERYTHING,
  task-GOOGLE-SERVICES, task-DEVOPS. Copy them into the repo docs/briefs/ if the scratchpad is gone.
- **Antigravity** (cheapest model only, testing/finding issues): skill `.claude\skills\agy-delegate\agy-delegate.ps1 -TaskFile <brief> -Branch fix/<name> -Model gemini-3.8-flash-low -Effort low`.

## Merging and releasing

- Each PR: CI green + impact comment, no AI co-author lines (a shared commit-msg hook strips them), then
  `gh pr merge <n> --squash --body ""`. Order: #13 → #12 → #4 → #11 → the rest.
- Release only after a green regression: `powershell -File <scratchpad>\regression.ps1` (176 flows + live
  Achernar voice + voice-back TTS). Release: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ship.ps1 -SkipChecks`,
  then verify `RELEASE_COMMIT` and env (the ship script does not apply runtime config; set
  FORECAST_BACKEND=bigquery, GOOGLE_TEXT_MODEL=gemini-3.5-flash with `gcloud run services update ogoogle-ai --region asia-south1 --update-env-vars ...` if missing).
- Saturday: `gcloud run services update ogoogle-ai --region asia-south1 --min-instances=1` until judging ends.
- Before submitting: tag `submission-2026-10-18`, then rewrite main history to drop the old
  "Co-Authored-By: Claude" lines (owner approved) with workers paused, force-push, verify GitHub.

## State at handoff (Fri 16 Oct 07:30 IST)

- Running (headless, logs in %TEMP%): account 3 Today (account3-today-r2.log, ~/work/chalkboard-today) and
  tabs (account3-tabs-r.log, ~/work/chalkboard-tabs); account 4 trust (account4-trust-r.log) and games
  (account4-games-r.log); account 2 in-chat (account2-inchat-r2.log) and supply chain (account2-supply-r.log).
  Next for account 3: search engine (~/work/chalkboard-customer, docs/briefs/task-SEARCH-ENGINE.md; its first
  step starts Recommendations AI training).
- **Codex resumes at 08:04 IST** (its limit reset): launch TWO runs: docs/briefs/task-INTEGRATE-PRS.md (new
  worktree) and docs/briefs/task-GUIDE-PAYMENTS-LANDING.md (resume its worktree if one exists on branch
  feat/guide-payments-landing under %USERPROFILE%\.codex\worktrees, else new). Then the rest of the queue.
- Open PRs: #4 rescue, #11 customer AI-first, #12 unit fix, #13 business profiles (Codex integrates these),
  #14 story director docs, #15 connect your system, #16/#18 QA findings, #17 manual test script.
- **Manual test cases for the owner:** PR #17, file docs/qa/manual-test-script.md (branch fix/manual-tests);
  merge it so it is on main. Verify its steps against the current app first.
- Last regression on main: 172/176 (2 load timeouts + Tamil keyboard focus + share switch, queued to Codex).
- Design canvas for the owner tabs/Today: https://claude.ai/artifact/HMmcAECR75pfTFdQ7LbskH
- Run your own loop every ~30 min (e.g. `/loop`), and a regression after each code merge before releasing.

## Never start duplicates (lesson, 16 Oct 07:45)

A headless log having text does NOT mean the session exited (it prints progress lines). Before relaunching
ANY worker, check the process is gone:
`Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | % { "$($_.ProcessId) $($_.CreationDate) $($_.CommandLine)" }`
(the command line contains the brief name, e.g. task-TODAY-PAGE.md). Relaunch only if no process for that
brief exists. One session per worktree, always. Same for codex.exe and agy.exe.
