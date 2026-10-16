# Integrate open PRs onto main (Codex, full access)

PR #3 (voice-mode new-shop onboarding) just merged into main. Bring these PR branches up to date
with origin/main, resolve conflicts correctly, make CI green, push. Do them in this order, one at a
time, each in its own checkout of the branch (git worktree or switch), never force-pushing main:

1. **#13 feat/business-profiles** (was based on feat/new-shop-flow; now based on main): merge
   origin/main, resolve, run backend tests + `npm run check` subset, push. Its failing check: find it
   with `gh pr checks 13` / `gh run view --log-failed` and fix the cause.
2. **#12 fix/unit-ambiguity**: it added its own `new_shop`/`new_shop_draft` fields and draft logic to
   MerchantContext/propose_products because main lacked them; main now has PR #3's real versions.
   Merge origin/main and keep main's (PR #3's) new-shop implementation, re-applying only the
   ambiguous-unit change (AmbiguousUnitError, _format_unit_options, the `len(matching) > 1` ask path,
   the _invalid field handling) on top. Tests in backend/tests/test_coach_tools.py must pass.
3. **#4 feat/rescue-ui** (owner approved merging): merge origin/main, resolve, keep main's later
   behaviour where both changed the same thing, run tests, push.
4. **#11 feat/customer-ai-first**: find and fix its failing check (frontend job), merge origin/main
   if needed, push.
   Rules: resolve conflicts by understanding both sides (main has later fixes: typed stream kinds in
   src/api/stream.ts, backStack hand-off + route guard, mic restore wait, chart cards, TimesFM). Keep
   every test green; run `npx prettier --check .` (CI fails on formatting). Plain commit messages, no AI
   trailers. Ports WEB_PORT=3677 API_PORT=3777, RECALL_PATH=data/test-vectors; if browser tests time
   out from machine load, rerun those files alone. Report per PR: conflicts resolved, checks run, push.

5. SKIP THIS ITEM: Antigravity owns it (branch fix/regression-items, 16 Oct 07:55).
   Regression on main 16 Oct 04:00 (after PR #3): 172/176. Investigate and fix (app if real, test if
   timing): tests/qa onboarding "Tamil owner sheet ... return keyboard focus" (phone), and tests/qa
   shop-details "Share customer page" switch not checked (phone). The two "Continue local preview"
   timeouts were machine load; rerun alone to confirm.
