# Stable release 1 integration

## Working tree and scope

- Base (prior run): fetched `origin/main`, detached at `63f81a2` on 16 October 2026.
- Eight branch diffs applied in the requested order with binary-safe three-way indexed patches.
- The orchestrator must create `release/stable-1`, review, commit, push and open the PR. This task leaves the combined tree uncommitted.
- Only the explicitly requested Git fetch accessed the remote. Dependency installation used offline caches. Tests use local fixtures; no deployment, cloud/billing/IAM changes or paid inference are authorized here.
- No secret files were inspected. The incoming example configuration change is retained without inspecting its contents.

## Patch integration evidence (preserved from the prior run)

| Order | PR / branch                  | Conflicts and resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | #25 `feat/today-page`        | No feature conflicts. Initial patch capture hit Node's default output buffer; reversed that partial application and reapplied the complete binary diff with a 128 MiB buffer. Today totals, priorities, setup and conversation pill retained.                                                                                                                                                                                                                                                                                                                 |
| 2     | #24 `feat/owner-tabs`        | `ShopTiles.tsx` and `phone-shell.spec.ts`: Shop keeps the refined customer-page-first tiles; planning, closing and rescue remain on Grow, with daily priorities on Coach. Kept Today's setup completion regression and changed its navigation to Shop.                                                                                                                                                                                                                                                                                                        |
| 3     | #21 `feat/onboarding-inchat` | `account2-status.md`, `ShopTiles.tsx`, `workspaceContext.ts`: retained both handoff sections, Maps handoff within the refined Shop view, all owner destinations and the manual onboarding phase. A repeated apply against unresolved index entries made no additional changes.                                                                                                                                                                                                                                                                                |
| 4     | #20 `feat/trust-fraud`       | 69 story PNG conflicts: incoming versions. `ShopTiles.tsx`: retained Grow placement of tools, restored the Shop status chip import. `PrivacyScreen.tsx`: retained the new trust controls inside the tab-based privacy subpage. `myshop.spec.ts`: legacy pending-shop status must not become an identity claim. You uses the real trust card rather than deriving face status from a shop registration.                                                                                                                                                        |
| 5     | #26 `feat/voice-everything`  | `agent.py`: kept business-profile and voice tools. `coordinator.py`: kept profile inference and closed-today/reward proposal fields. `discover_ask.py`: retained contextual refinements/transit anchors plus customer commands. `AskHome.tsx`: preserved the threaded conversation, cancellation/retry and personal picks; integrated spoken command navigation and directions. `navigation.ts`: retained both customer Back and programmatic navigation, including in-app history. Generated contracts held temporarily for regeneration, never hand-merged. |
| 6     | #23 `feat/customer-games`    | 35 story/bug PNG conflicts: incoming versions. `passport_routes.py`: kept Today stamp/returning counters plus scratch, sets and co-op updates. `StampMoment.tsx`: kept rescue context and celebration plus scratch/set game behavior. Generated contracts held temporarily for regeneration.                                                                                                                                                                                                                                                                  |
| 7     | #16 `fix/agy-qa-1`           | Applied cleanly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8     | #14 `docs/story-director`    | Applied cleanly, including its documentation and director artifacts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Integration fixes

- Extended owner voice actions and the maintained app guide for Today, Shop/Grow/You, optional trust checks and game/perk settings. Opening trust does not start a check; opening games does not grant a prize. Today can be opened without deleting the conversation.
- Close-the-day voice navigation now points to Grow, matching the tab refinement.
- Trust story navigation follows You → Privacy & your data.
- Added a browser regression covering the newly combined voice destinations.
- Regenerated `docs/openapi.json` using `backend/scripts/export_contract.py` and `src/api/generated.d.ts` using the repository's OpenAPI TypeScript command.

## Verification evidence

This continuation resumed the existing combined tree without fetching, resetting, checking out a new base or reapplying patches. Everything remains uncommitted. Implementation evidence below is separate from the earlier branch handoffs and director archive.

| Check                     | Completed result                                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruff lint                 | Passed: backend app, tests, scripts and entry points.                                                                                                                                                                            |
| Ruff formatting           | Passed: 159 files.                                                                                                                                                                                                               |
| mypy                      | Passed: 79 source files.                                                                                                                                                                                                         |
| Full backend pytest       | **788 passed, 199 skipped**, 2 ADK experimental warnings; 293.27 seconds. Skips are not validated behavior.                                                                                                                      |
| Frontend lint/build/hooks | Passed, including a completed `npm run check` for the desktop remainder. Build transformed 3,090 modules. Hook probe rejected both invalid examples and accepted the valid example.                                              |
| API contracts             | Regenerated OpenAPI from the combined backend, then generated TypeScript with openapi-typescript 7.13.0. No hand merge.                                                                                                          |
| Browser selection         | **114 passed, 34 intentional skips**, all **148 registered cases accounted for**, with no unresolved failed or missing case. Results combine the feature run and targeted reruns; this is not one all-green 148-case invocation. |
| Prettier                  | Full `npx --no-install prettier --check .` passed; the finalized report is formatted and checked again below.                                                                                                                    |
| Whitespace/conflicts      | `git diff --check HEAD` clean; no unresolved index entries.                                                                                                                                                                      |

Final graph refresh: `graphify update .` passed with **6,391 nodes, 19,397 edges and 285 communities**. AST extraction only; no API/model call. Generated graph files are ignored.

Browser case coverage, deduplicated by project, file and test title against Playwright's registered list:

| Spec                     | Phone passed | Desktop passed | Desktop skipped |
| ------------------------ | ------------ | -------------- | --------------- |
| myshop.spec.ts           | 9            | 0              | 9               |
| new-shop-inchat.spec.ts  | 5            | 5              | 0               |
| new-shop-voice.spec.ts   | 23           | 8              | 15              |
| new-shop.spec.ts         | 8            | 8              | 0               |
| owner-tabs.spec.ts       | 3            | 3              | 0               |
| phone-shell.spec.ts      | 7            | 0              | 7               |
| s10-new-shop.spec.ts     | 3            | 0              | 3               |
| s12-trust.spec.ts        | 3            | 3              | 0               |
| s13-games.spec.ts        | 2            | 2              | 0               |
| today.spec.ts            | 6            | 6              | 0               |
| voice-everything.spec.ts | 5            | 5              | 0               |
| **Total**                | **74**       | **40**         | **34**          |

The 34 skips are the desktop copies of explicitly phone-only My shop, shell, S10 and locale cases. The 15 locale cases ran and passed on the phone. Every browser command used one worker. Phone captures use 390x844 and desktop captures 1440x1000, with light/dark and selected Indic/CJK checks.

Completed run evidence in ignored local output:

- `output/stable-1-verified-check.log`: lint/build/hooks passed and the first 56 phone cases passed before the S10 transition-time axe finding stopped the run. The first six spec files completed their phone cases.
- `output/stable-1-stories-rerun.log`: all three corrected S10 journeys passed; subsequent trust timeout was traced to a retired navigation label.
- `output/stable-1-trust-rerun.log`: entire timed-out file rerun alone, **6/6 passed** in 3.0 minutes, including duplicate review and erasure.
- `output/stable-1-voice-rerun.log`: entire timed-out file rerun alone, **10/10 passed** in 2.1 minutes, including customer passport Back preserving the conversation.
- `output/stable-1-desktop-check.log`: completed `npm run check`, **32 passed / 34 skipped** in the remaining desktop specs, 4.4 minutes of browser time.
- `output/stable-1-phone-finish.log`: final Today/game captures, **8/8 passed** in 2.1 minutes.
- `output/stable-1-browser-results.json`: registered-case comparison and per-case source log; 148/148 accounted for. Temporary test configuration and the local server adapter are also in ignored `output/stable-1*`.

The isolated server uses fresh SQLite, recall and media directories; offline coach, fixture moderation and face checks; blank Maps/media provider settings; Python outbound socket/DNS blocking and browser request blocking. It does not load dotenv. Vite's dependency prebundle and a pre-test warmup absorb cold-start work before the unchanged case deadlines. No paid/live model call, cloud, billing, IAM or external-business operation was performed.

## Corrections found during verification

- Updated four stale onboarding assertions to the established name-first greeting. Kept the camera, map, persistence and accessibility assertions.
- Completed the customer's two-step welcome in the new passport command regression before using its composer.
- Updated remaining S10/Trust navigation lookups to Shop and Grow -> Get on Google.
- Made S10's axe helper wait for fonts and finite animations, matching the existing test helpers. Its original failure measured the review's entrance fade at 4.48:1; the settled UI passes axe. No theme or product behavior was weakened.
- Cold Vite navigation initially timed out before product assertions. Per the timeout rule, reran My shop alone against the build: **9 passed / 9 intentional skips**. The static server then proved unsuitable for locale tests that explicitly import Vite source modules, so final coverage uses warmed Vite. These interrupted attempts are diagnostic history, not additional passes.
- An initial trust capture missed a transient movement prompt. Diagnostics observed aligned recorder/performance clocks and advancing prompts under both Vite and the build. The complete original trust scenarios now pass; no recorder change was justified. The temporary diagnostic test was removed.
- Formatted 848 changed text candidates in batches because Windows rejected one oversized command line. Also formatted the pre-existing brief `docs/briefs/task-INTEGRATE-BATCH-A.md` so the repository-wide check passes. No content change was intended in that brief.

## UX review

Reviewed refreshed phone and desktop screenshots, including `docs/stories/tabs-*.png`, `new-shop-*.png`, `today-*.png`, `trust-*.png` and `games-*.png`. The incoming director archive remains historical evidence, not a new review of this tree.

| House check                        | Result and limits                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three-second purpose and hierarchy | Pass in the reviewed owner screens: customer page leads Shop; tools on Grow; account/trust on You; daily work on Coach.                                  |
| One primary action                 | Partial: the Shop overview retains separate share and upkeep action groups.                                                                              |
| Content caps                       | Two inherited findings below remain open.                                                                                                                |
| Typography, spacing and semantics  | Reviewed light/dark phone and desktop captures; semantic roles, native controls and readable labels retained.                                            |
| States and accessibility           | Selected journeys pass axe, overflow, permission denial, retry, empty, success, form and Back checks. This is not a complete assistive-technology audit. |
| Personalization                    | Service-shop labels, shop context and language checks pass.                                                                                              |
| Motion                             | Reduced-motion cases pass; axe waits for finite entrances rather than scanning blended transient colors.                                                 |
| Reachability and input             | Emulated phone controls and Back pass; physical keyboard/IME behavior remains untested.                                                                  |
| Story continuity                   | S10 and trust complete; owner voice destinations and customer command Back preserve the expected handoffs.                                               |
| Languages                          | All 15 phone voice-control locales pass; Today includes Hindi and Japanese checks. Native-speaker tone review remains pending.                           |

Open content-design findings:

- `src/features/v1/voiceModeCopy.ts:61`: blocked-microphone instructions exceed the house alert text cap; screenshot: `docs/stories/new-shop-6-mic-blocked-light.png`.
- `src/features/forecast/PrepPlan.tsx:78`: the empty forecast instruction is a long tile value; screenshot: `docs/stories/tabs-grow-dark.png`.

## Files changed

1429 tracked paths differ from HEAD, plus this untracked report. Most paths are the requested incoming screenshots/director artifacts.

| Area                                | Tracked paths |
| ----------------------------------- | ------------- |
| Root and configuration              | 5             |
| Backend                             | 44            |
| Other documentation and screenshots | 354           |
| Director artifacts                  | 885           |
| Frontend                            | 85            |
| Browser tests and tooling           | 56            |

Key integration paths: `backend/app/{agent,coordinator,discover_ask,voice_tools,instant,app_guide}.py`; `src/features/discover/AskHome.tsx`; owner navigation, ShopTiles, Coach and You screens; both generated API contracts; feature/story specs and their captures. All prior patch work and handoff sections remain in the working tree.

## Open risks

- 199 backend tests are skipped in this environment; no live/emulator coverage is inferred from them.
- Physical phone microphone/ASR, camera/GPS, real map engines, native-speaker tone, live Gemini and hosted/cloud behavior remain unvalidated. Fixture face checks establish neither real liveness nor business ownership.
- Vite still warns about chunks over 500 kB and MediaPipe's unanalyzable dynamic import. No field Core Web Vitals, Lighthouse score or performance improvement is claimed.
- The UX content-cap and competing-action findings above remain for owner review. This integration did not add a general copy/UI redesign.
- No commit, push, PR, deployment, cloud/billing/IAM change or external-business write was performed. Publication is left to the orchestrator after reviewing this working tree.
