# Google simulator acceptance map

Implementation is a deterministic offline simulator, persisted separately per consented owner
and business. These cases do not establish real Google account rights, eligibility, verification
or publication. The official handoff remains a separate owner action.

| Acceptance ID | Implemented behavior                                                                    | Automated coverage                                                           |
| ------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| V1-E01        | Labelled wizard and independent official handoff                                        | `google-sim.spec.ts` happy path; `v1.spec.ts` official links                 |
| V1-E02        | Explicit selection of an already managed location; update instead of create             | `test_all_named_scenarios[existing-managed]`                                 |
| V1-E03        | Distinct fixture addresses; no automatic match or duplicate creation                    | `test_ambiguous_matches_require_explicit_selection_and_claim`                |
| V1-E04        | Explicit claim request, pending/rejected/granted; progress retained                     | Scenario unit cases; browser claim rejection                                 |
| V1-E05        | Exact revision approval produces a business-scoped fictional SIM receipt                | Scenario unit cases; browser happy path                                      |
| V1-E06        | Only scenario-returned methods; no-method fixture stays pending                         | Reauthorization scenario; offered-method unit cases                          |
| V1-E07        | Video preparation and official handoff never mark verified                              | `test_all_named_scenarios[video-required]`                                   |
| V1-E08        | Unknown outcome reconciles the original receipt without another submission              | Unknown scenario, route persistence and browser retry                        |
| V1-E09        | Verification and publication are separate; restricted fixture                           | Restricted scenario; browser verified/pending assertions                     |
| V1-E10        | Online-only eligibility branch; independent page remains useful                         | Ineligible scenario                                                          |
| V1-E11        | Seed saved name/location/hours/contact; category ID chosen explicitly                   | Facts unit/route cases; browser reused-name assertion                        |
| V1-E12        | Service-area public preview excludes the private address                                | Service-area scenario and facts separation unit case; preview implementation |
| V1-E13        | Cancel/wrong fictional account returns to preserved facts                               | Facts/account unit case                                                      |
| V1-E14        | Region fixture category IDs; reject unsupported/free-text categories                    | Facts/category unit case                                                     |
| V1-E15        | Edits change preview revision and invalidate approval                                   | Preview approval unit case                                                   |
| V1-E16        | Review says checked locally, not validated by Google                                    | Browser review assertion                                                     |
| V1-E17        | SMS/email/phone/postcard/PIN use fictional code, no notification I/O                    | Parameterized offered-method unit cases                                      |
| V1-E18        | Wrong/expired code recovery, attempt-bound checking                                     | Offered-method unit cases; browser expired-code recovery                     |
| V1-E19        | Checklist completion/cancellation remains pending; no recording/upload                  | Video scenario unit case                                                     |
| V1-E20        | Pending simulation restores across repository reinitialization and reopening            | Both-adapter persistence, route persistence, browser restore                 |
| V1-E21        | Hours rejection preserves valid facts; correction and new approval required             | Preview rejection unit case                                                  |
| V1-E22        | Address/category edits need re-verification; hours-only update preserves verification   | Updates unit case                                                            |
| V1-E23        | Approved inventory write leaves simulation and Google connection untouched              | Both-adapter inventory isolation case                                        |
| V1-E24        | Reset changes only simulation; owner/business isolation and erasure                     | Both-adapter isolation/erasure; owner/reset route case                       |
| V1-E25        | Pending removal stops simulated changes; explicit confirmed removal; ownership retained | Updates/disconnect unit case                                                 |

Backend coverage lives in `backend/tests/test_google_sim.py`,
`backend/tests/test_google_sim_routes.py` and `backend/tests/test_merchant_store.py`.
Browser coverage lives in `tests/google-sim.spec.ts` and `tests/v1.spec.ts`.
The happy path checks WCAG 2 A/AA and 2.1 AA with axe on facts and final review at
412px phone width and desktop width. Automated checks do not establish complete accessibility
or physical-phone behavior.

Reused nonempty facts are read-only until the owner selects **Edit simulation facts**.
The browser helper checks this for the saved shop name. Verification attempts are bound to
the chosen method: changing methods invalidates the previous attempt, and submission of a
new revision clears the previous method. The additional E18/E22 regression covers both.
Browser cases also cover service-area privacy, video checklist completion/cancellation,
rejected-hours correction with a new preview revision, and pending/confirmed disconnect.

## Verification results — October 14, 2026

| Check                                                                                                      | Result                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `uv run ruff check .` (backend)                                                                            | Passed                                                                                |
| `uv run ruff format --check .` (backend)                                                                   | Passed; 45 files formatted                                                            |
| `uv run mypy app` (backend)                                                                                | Passed; 20 source files                                                               |
| `uv run python -m pytest -q --basetemp ../artifacts/google-sim-final-pytest` (backend)                     | 114 passed, 20 skipped; one existing ADK experimental-schema warning                  |
| `npx tsc -b`                                                                                               | Passed                                                                                |
| `npx eslint . --max-warnings 0 --ignore-pattern "public/mediapipe/**" --ignore-pattern "public/models/**"` | Passed                                                                                |
| `npx prettier --check src tests docs`                                                                      | Passed                                                                                |
| `CI=1 npx playwright test tests/google-sim.spec.ts --config artifacts/google-sim.playwright.config.ts`     | 14 passed across phone and desktop                                                    |
| `npm run check`                                                                                            | Passed: lint, build, hook enforcement, all 52 browser cases                           |
| Axe on simulator facts and final review                                                                    | Zero WCAG 2 A/AA and 2.1 AA violations on phone and desktop                           |
| Cross-method regression reproduction                                                                       | Original behavior accepted the previous method's attempt; current behavior rejects it |
| Offline OpenAPI export and TypeScript generation                                                           | Regenerated successfully                                                              |
| `graphify update .`                                                                                        | Passed; AST-only rebuild                                                              |
| `git diff --check`                                                                                         | Passed                                                                                |

All tools used installed local dependencies, with npm/uv offline mode. uv's shared cache was
not writable, so validation used a workspace cache and `UV_NO_SYNC=1`, with existing local
Python dependencies copied into the workspace environment. Pytest used a workspace temporary
directory because the default temporary directory was not writable. Application imports were
confirmed to resolve to this worktree.

Default ports 3200/3300 were occupied. Browser verification used this worktree's offline
servers on 3201/3301. For `npm run check`, the Playwright configuration and the existing
origin assertion were temporarily adjusted to those ports and then restored byte-for-byte.
The full run blocked external hostname resolution. The simulator spec additionally aborts
non-local browser requests. No dependency downloads, cloud operations, paid models, real
Google API calls, commits, pushes or deployments were performed.

## Review limits

The 20 skipped cases require the explicitly local Firestore emulator, which was unavailable.
This includes the Firestore branch of the simulator persistence/isolation/erasure test;
its SQLite branch passed. Both adapters are implemented, but this run does not establish
Firestore runtime correctness.

Source review checked M3 type roles, shared spacing/shape/target tokens, semantic surfaces,
labelled controls, persistent simulation status, safe-area padding, MUI dialog focus behavior
and disabled motion. Axe covers two wizard steps in the light theme. Full assistive-technology
testing, simulator Hindi/text-scaling/dark-theme visual review and physical-phone testing
remain unvalidated. Real Google eligibility, account authority, verification, publishing
and Maps visibility remain outside this simulator's evidence.
