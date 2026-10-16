# Orchestrator handoff (read this, then run the loop)

You coordinate workers; you write NO feature code. Read docs/TODO.md (what is left), docs/OWNER-NOTES.md
(owner intent, top = newest) and docs/PLAN-V2.md "Final push plan". Deadline: submit by Sun 18 Oct
20:00 IST (module closes Mon 19 Oct ~00:45). Feature cutoff: Fri 16 Oct midnight IST.

## Workers (all on this Windows PC; repo C:\Users\pshre\OneDrive\Pictures\Documents\AI Builder Cup\niva-starter)

- devtool.exe: C:\Users\pshre\.vscode\extensions\dev-tooling-extension-2.1.300-win32-x64\resources\native-binary\devtool.exe
- node: C:\Users\pshre\AppData\Local\AIBuilderCupTools\node-v24.21.0-win-x64 (prepend to PATH)
- **Account 3 / account 4** (full capacity, max 2 sessions each, resume after every 5-hour reset):
  `$env:TOOL_CONFIG_DIR="$env:USERPROFILE\.tool-account3"` (or 4), then
  `Start-Process devtool.exe -ArgumentList '-p','"<one-line prompt: read docs/briefs/<task>.md and do it end to end; no parallel sub-agents>"','--dangerously-skip-permissions' -WorkingDirectory <worktree> -RedirectStandardOutput $env:TEMP\account3-<name>.log -WindowStyle Hidden`.
  A log with "You've hit your session limit · resets HH:MM" = schedule a resume then.
  Account 3: Today (~/work/chalkboard-today), tabs (~/work/chalkboard-tabs), search (~/work/chalkboard-customer).
  Account 4: trust/face (~/work/chalkboard-trust), games (~/work/chalkboard-games).
- **Account 2**: sunset after its last two tasks (in-chat camera/map on feat/onboarding-inchat; supply chain). Its
  remaining budget can run THIS orchestrator.
- **Codex** (2 runs always): `& "...\AI Builder Cup\.tooling\skills\codex-delegate\delegate.ps1" -Dir <repo> -Mode write -Worktree -Effort high -TaskFile <brief>`
  (resume in an existing worktree with -Dir <worktree>). Queue (briefs in the session scratchpad
  C:\Users\pshre\AppData\Local\Temp\devtool\c--Users-pshre-OneDrive-Pictures-Documents-AI-Builder-Cup\73a4fe6d-3da9-4cd8-ae1e-9c94ed6962c5\scratchpad\):
  task-INTEGRATE-PRS, task-GUIDE-PAYMENTS-LANDING, task-SHOP-PLAYBOOK, task-VOICE-EVERYTHING,
  task-GOOGLE-SERVICES, task-DEVOPS. Copy them into the repo docs/briefs/ if the scratchpad is gone.
- **Antigravity** (cheapest model only, testing/finding issues): skill `.tooling\skills\agy-delegate\agy-delegate.ps1 -TaskFile <brief> -Branch fix/<name> -Model gemini-3.8-flash-low -Effort low`.

## Merging and releasing

- Each PR: CI green + impact comment, no AI co-author lines (a shared commit-msg hook strips them), then
  `gh pr merge <n> --squash --body ""`. Order: #13 → #12 → #4 → #11 → the rest.
- Release only after a green regression: `powershell -File <scratchpad>\regression.ps1` (176 flows + live
  Achernar voice + voice-back TTS). Release: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ship.ps1 -SkipChecks`,
  then verify `RELEASE_COMMIT` and env (the ship script does not apply runtime config; set
  FORECAST_BACKEND=bigquery, GOOGLE_TEXT_MODEL=gemini-3.5-flash with `gcloud run services update ogoogle-ai --region asia-south1 --update-env-vars ...` if missing).
- Saturday: `gcloud run services update ogoogle-ai --region asia-south1 --min-instances=1` until judging ends.
- Before submitting: tag `submission-2026-10-18`, then rewrite main history to drop the old
  "Co-Authored-By: the assistant" lines (owner approved) with workers paused, force-push, verify GitHub.
