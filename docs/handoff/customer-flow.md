# Customer flow — uncommitted handoff

Fixes only, based on cached `origin/main` / HEAD `c17724f`. `git switch -c fix/customer-flow origin/main` failed because the shared worktree Git index is outside writable permissions. Work is left in this worktree for the assistant to commit. No commit, push, fetch, deployment, cloud changes, paid model calls or external service requests.

See [customer-flow-audit.md](../qa/customer-flow-audit.md) for findings, evidence, screenshot conventions and items needing an owner decision.

## Changes

- Fix stale Ask coordinates and keep the selected session location consistent across Ask/Browse/Passport.
- Give phone Ask results a full-width query row; use shared Chalkboard entrances, finite ambient motion and theme colours.
- Add actionable Follow, thread-load, inline sign-in, tips, Today refresh and passport board error recovery.
- Add Browse Back recovery; preserve trail fragments and scroll to quests.
- Honor dark appearance on landing; clean up the stamp animation's tap-to-skip listener.
- Add customer journey/failure/motion story tests and extend S8 to desktop. Screenshots are under `docs/stories/customer-*.png`.

Owner `NewShopStage` / `newShopCopy`, the voice hook and `docs/handoff/account2-status.md` are outside this change. No backend source or API schema changes.

Files changed:

- `src/features/customer/{Chats,FollowButton,SignIn,Tips}.tsx`, `copy.ts`, `copyLocales.ts`.
- `src/features/discover/{AskHome,Discover}.tsx`.
- `src/features/frontdoors/{CustomerApp,Marketing}.tsx`, `landing.css`, `navigation.ts`.
- `src/features/passport/{Passport,StampMoment,TodayDeck}.tsx`.
- `tests/stories/customer-flow.spec.ts`, `tests/stories/s8-passport.spec.ts`.
- This handoff, `docs/qa/customer-flow-audit.md`, and `docs/stories/customer-*.png` evidence.

## Checks

Customer checks pass. Repository-wide gates are **not green**:

- Final `npm run check` on 3437/3537: **353 passed / 80 skipped / 1 failed**. The failure is owner B27 (`tests/myshop.spec.ts:179`): a content-width check measures the “Preparing forecast” loading state (0.6214 versus 0.65). It also fails in isolation. Owner code/tests were left unchanged.
- All **22 new customer cases passed** in that run. Final enhanced S8 (real offline Ask, QR/stamp/levels/quests, both viewports/themes): **4 passed** separately. Skip opacity is asserted within 500ms; screenshot capture waits for finite CSS transitions and paint before axe.

- Fresh-DB QA on 3437/3537: **129 passed / 3 unexpected desktop owner failures**. The harness already marks Q1 as an expected failure. Serial rerun of the affected tests: **4 passed**; the full QA run is still recorded as non-green.
- Final standalone lint, build, hook enforcement, formatting and whitespace checks passed. The existing >500 kB chunk warning remains. No backend source changes, so no backend test run.
- AST-only `graphify update .` completed and the local impact report was regenerated. 78 customer screenshots are retained; unrelated generated QA/story artifacts were restored.

## Open limits

Local Google sign-in is an explicit stand-in. Live Gemini, hosted Google OAuth, external Maps and real microphone recognition were not exercised. Browser emulation does not establish physical-phone behaviour. The larger product decisions remain listed in the audit rather than implemented during the freeze.
