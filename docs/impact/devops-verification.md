# DevOps verification — 16 October 2026

Work continued from the existing dirty `fix/devops-hardening` checkout. Prior source changes
and screenshot changes were preserved. No reset, commit, push, PR creation, deployment,
cloud inspection, external service call, IAM or billing change was performed.

## Implemented

- `scripts/ship.ps1` validates the clean checkout, exact published release tag and main
  ancestry, then dispatches the single checked CI path. Command failures stop release.
  CI reuses only successful main-push checks for the exact SHA, otherwise runs all checks.
  It applies `deployment/runtime-config.py` and verifies HTTP health and `RELEASE_COMMIT`.
- `FeatureFlags`, server settings/bootstrap and generated TypeScript expose typed public
  visibility flags. `FEATURE_GOOGLE_GUIDE` guards navigation and mounting, with a Coach
  fallback and hidden-by-default parsing. It does not grant permissions or stop backend
  execution. No flag or identity data is stored in preference storage.
- Existing npm/uv caches remain; Playwright caches include OS, architecture and version,
  with dependencies installed on every runner and browser downloads only on cache miss.
  Individual-test sharding retains both devices, three shards, assertions and timeouts.
- Existing immutable `/assets` headers remain. The optional Firebase CDN publishes assets
  extracted from the exact image; HTML and unhashed public files stay on Cloud Run. A CDN
  build initially moved the favicon to the wrong host; `renderBuiltUrl` now preserves
  public-file origin URLs. GCS uploads get explicit private cache metadata.
- Local Qdrant recall serializes its shared client. A concurrency regression failed before
  the change with `IndexError`, then passed. Load diagnostics also found concurrent SQLite
  persistence failures before this fix. Firestore recall is unchanged.
- The QR clock regression advances from its captured instant instead of resetting time
  backward into the same display second. The ticking assertion and timeout are retained.

Release, rollback, cutoff, CDN and judging-window instructions are in the
[release checklist](../release-checklist.md); architecture, quota boundaries, selected-field
inspection and bounded capacity commands are in [architecture](../architecture.md).

## Observed local checks

| Check                                       | Result                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Ruff lint and format                        | Passed; 147 Python files formatted                                                                        |
| mypy                                        | Passed; 69 application source files                                                                       |
| Backend pytest, local Firestore emulator    | 894 passed, 2 skipped; one ADK experimental-schema warning; exit 0                                        |
| Focused feature/release/photo/recall pytest | 19 passed                                                                                                 |
| Generated OpenAPI + TypeScript regeneration | Matched the existing edited contracts byte-for-byte                                                       |
| Actionlint                                  | Passed for checks and release workflows                                                                   |
| Prettier, edited text/config files          | Passed                                                                                                    |
| Optional CDN build                          | Passed; hashed script URLs use fixture CDN, favicon remains `/niva.svg`                                   |
| Compiled frontend loopback hosting smoke    | Passed: health, exact release identity, frontend, missing paths and anonymous stream rejection            |
| Flag browser matrix                         | 8 passed: enabled/hidden × light/dark × phone/desktop                                                     |
| Local repeated-session load                 | Passed: 2,842 requests, zero failures, 92.99 requests/s                                                   |
| Local new-session pressure                  | Expected nonzero result: 317 HTTP 429 at the 128-entry replay cap; readers and admitted streams succeeded |
| Graph refresh                               | `graphify update .` passed; AST extraction only; unsupported-symbol/community-label notices remain        |

`npm run check`: lint, production build and hook enforcement passed. The full browser run
finished in 15.0 minutes with **416 passed, 99 skipped, 7 failed**, exit 1. Existing skips,
timeouts, assertions and retry settings were retained. This is **not a green release gate**.
Local `playwright test --list --shard=...` reported 88 / 86 / 87 cases for each device's
three shards (including existing skips). This verifies count distribution, not CI wall time.

| Full-run failure                                | Observation                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `tests/bugs-b30-b31.spec.ts:93`, phone          | Clock test reset backward into the captured display second; corrected test passed both devices in a focused recheck (2 passed) |
| `tests/demo-flow.spec.ts:28`, desktop           | Share customer page switch remained checked                                                                                    |
| `tests/global-facts.spec.ts:45`, desktop        | Expected UPI option did not appear                                                                                             |
| `tests/new-shop-voice.spec.ts:110`, phone light | `page.evaluate` timed out                                                                                                      |
| Same voice walkthrough, desktop light           | Scripted caption did not appear                                                                                                |
| Same voice walkthrough, desktop dark            | Screenshot timed out                                                                                                           |
| `tests/new-shop-voice.spec.ts:304`, desktop     | Reconnection expected listening but observed speaking                                                                          |

The focused voice attempt also stalled and was terminated. The final focused rerun of all
six remaining cases, with two local workers and unchanged assertions/timeouts, **passed all
six in 1.4 minutes**, exit 0. Alongside the two-device clock recheck, every failing case
subsequently passed. The original full command remains red; obtain a fresh green full CI
run before release. Do not classify these as harmless flakes or attribute them to this patch
without a baseline comparison. Full-run error contexts/screenshots are
preserved locally in `.deployment/broad-browser-results/`; runtime logs are ignored local
artifacts. No physical phone, live inference/ASR, Docker image build, CI cache-hit timing,
CDN deployment or Cloud Run autoscaling is proved.

The suite rewrites documentation screenshots. All 21 images already dirty at task start
were preserved; 175 additional generated image changes were archived under ignored
`.deployment/regenerated-screenshots/` and restored to their clean starting content.

## Scoped UI review

The change removes an optional destination; existing typography, spacing, Material roles,
labelled buttons, selected semantics and focus styling are inherited from
`src/features/v1/AppShell.tsx:76` and `:246`. Phone navigation reflows to three items when
hidden; desktop rail does the same. No blank placeholder or disabled dead end appears.

Screenshots are reproducible, ignored local artifacts in `artifacts/devops/`:
[phone light hidden](../../artifacts/devops/phone-light-false.png),
[phone dark hidden](../../artifacts/devops/phone-dark-false.png),
[desktop light hidden](../../artifacts/devops/desktop-light-false.png),
[desktop dark enabled](../../artifacts/devops/desktop-dark-true.png).

| House checklist                   | Scoped finding                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3-second task / story handoff     | Pass: Coach stays visible and selected; available next steps remain                                                                                             |
| One primary action / content caps | No new content/actions; existing screen's photo and tour filled actions remain a broader UX review item                                                         |
| Typography / spacing / eye strain | Pass for destination removal in reviewed phone/desktop light/dark screenshots; semantic roles preserved                                                         |
| States                            | Enabled/hidden tested; malformed/missing parsing hides by source inspection; existing error/offline flows belong to the full suite                              |
| Personalization                   | Existing language/business copy remains; no re-asking or preference persistence added                                                                           |
| Motion                            | Reduced-motion matrix passed; no new animation                                                                                                                  |
| Reachability / accessibility      | Existing labelled 56px-high buttons and visible focus styling retained; no horizontal overflow in the matrix; separate screen-reader/manual audit not performed |
| Indic / CJK                       | No new strings; dedicated flag-off Hindi/Japanese visual review not performed                                                                                   |

## Open boundaries

- Actual Cloud Run sizing, quotas, credits and spend are unknown: external inspection was
  prohibited. The ₹500 ceiling is not enforced by an alert or instance cap.
- Firebase CDN remains opt-in and unprovisioned here. Existing Hosting site, WIF permissions,
  free allowance, cross-origin fonts/lazy chunks and deployment order need an authorized
  first-release check. Replacing the Hosting file set can invalidate old tabs' lazy chunks.
- Replay admits eight active coach runs globally and retains up to 128 sessions per process;
  new-session churn can produce 429 even when providers are healthy. No durable queue exists.
- Public gallery cache may retain withdrawn photos for a day; private bucket metadata does
  not revoke bytes already cached by a client.
- The k6 script is prepared but unexecuted; measured load uses Python/httpx because neither
  k6 nor Locust was installed and external installation was prohibited. No 30,000-user claim.
- A failed release smoke fails CI but does not automatically roll back traffic.
