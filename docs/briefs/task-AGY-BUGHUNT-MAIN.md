# Bug hunt on main: owner + customer browser suite (Antigravity, assistant model)

Branch fix/bughunt-main from origin/main. Ports WEB_PORT=3801 API_PORT=3901, RECALL_PATH=data/test-vectors.
NEVER run commands in the background; run every test in the foreground and wait; `--workers=1`. No parallel
sub-agents. Plain commit messages, no AI trailers.

Goal: the owner says "no bugs at all". Find and fix real bugs on main before the release.

1. Run the browser suite (not tests/qa/, another worker owns that) on desktop, then phone:
   `npx playwright test --project=desktop --workers=1`, then `--project=phone`. Rerun each failing
   file alone once to separate flakes from real failures.
2. For every real failure: find the root cause in app code, fix it with the smallest change, add or tighten
   a test. For flakes: note file, test and symptom in the findings doc (do not "fix" by adding sleeps).
3. Also click through by hand (Playwright codegen or a short script) at 360px: owner onboarding by text,
   Today, Shop/Grow/You tabs, Close the day, rescue deal from Grow, customer Ask → shop page → stamp.
   Any console error, dead end, cut-off text or wrong currency (₹ for India) is a bug.
4. Do NOT touch: tests/qa/** (QA-stability worker), GrowScreen.tsx playbook ordering or search/maps/recs
   code (release 2 is landing those), docs/stories/*.png (revert regenerated screenshots before committing).
5. Write docs/qa/bughunt-main-2026-10-16.md: table of finding → severity (1-4) → real/flaky → fixed (commit)
   or why not. Then backend `cd backend && uv run ruff check app && uv run mypy app && uv run pytest -q`,
   `npx tsc -b`, `npx eslint src --max-warnings 0`, `npx prettier --check .`. Push and open the PR.
