# Impact measurement verification

Resumed and checked locally on 16 October 2026, base commit
`a1e4f1fe846f3301e5b81ae66b082471f68c1183`. The existing fixture inputs and
measurement harness were retained. New runs replaced the saved measurement
samples; the report validator was strengthened. All work remains uncommitted.

| Check                                              | Result                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Offline measurement harness                        | Passed: 3 menu images, 10 search queries against 18 shops, 160 coach turns                          |
| Browser measurement run, one worker                | 35 passed: 30 onboarding and 5 photo day-close cases; also records the unavailable typed-path probe |
| Relevant backend tests                             | 97 passed, 6 skipped; 2 ADK experimental-feature warnings                                           |
| Separate streaming, ownership and disconnect check | 20 passed, none skipped; 1 ADK experimental-feature warning                                         |
| Ruff lint and format, impact Python scripts        | Passed                                                                                              |
| mypy, application and impact Python scripts        | Passed: 82 source files                                                                             |
| Frontend ESLint                                    | Passed, no warnings                                                                                 |
| Hook enforcement probes                            | Passed                                                                                              |
| TypeScript build check                             | Passed                                                                                              |
| Production build with dotenv disabled              | Passed; existing large-chunk and plugin-timing warnings                                             |

Report generation and its saved-sample validation passed. Prettier passed for all
impact scripts and new report/data files; `git diff --check` passed. The required
AST-only `graphify update .` completed, with unsupported-file and community-label
warnings. No model-based extraction or relabeling was run.

The six skips are the Firestore variants of the search tests. Their shared
`store` fixture requires an explicitly local Firestore emulator. No emulator was
started, and no cloud database was contacted. SQLite variants ran. The separate
streaming run confirms that the skipped cases did not hide the session ownership
and disconnect checks.

From the repository root, using installed dependencies only:

```powershell
$env:WEB_PORT='3791'; $env:API_PORT='3891'; $env:RECALL_PATH='data/test-vectors'
$env:UV_OFFLINE='1'; $env:PYTHONUTF8='1'; $env:IMPACT_RUNS='5'
& backend/.venv/Scripts/python.exe scripts/impact/offline.py measure
node node_modules/@playwright/test/cli.js test -c scripts/impact/playwright.config.ts --workers=1
& backend/.venv/Scripts/python.exe scripts/impact/offline.py pytest -q tests/test_photos.py tests/test_new_shop.py tests/test_day_close.py tests/test_voice_everything.py tests/test_discover_ask.py tests/test_streaming.py tests/test_stream_resume.py tests/test_resilience.py
& backend/.venv/Scripts/python.exe scripts/impact/offline.py pytest -q -rs tests/test_streaming.py tests/test_stream_resume.py tests/test_resilience.py
& backend/.venv/Scripts/ruff.exe check --config backend/pyproject.toml scripts/impact/offline.py scripts/impact/report.py
& backend/.venv/Scripts/ruff.exe format --check --config backend/pyproject.toml scripts/impact/offline.py scripts/impact/report.py
& backend/.venv/Scripts/python.exe scripts/impact/offline.py mypy app ../scripts/impact/offline.py ../scripts/impact/report.py
npm run lint
npm run test:hooks
node node_modules/typescript/bin/tsc -b
& backend/.venv/Scripts/python.exe scripts/impact/offline.py build
& backend/.venv/Scripts/python.exe scripts/impact/report.py
node node_modules/prettier/bin/prettier.cjs --write "scripts/impact" "docs/impact/measurements.md" "docs/impact/results.json" "docs/impact/browser-results.json" "docs/impact/verification.md"
node node_modules/prettier/bin/prettier.cjs --check "scripts/impact" "docs/impact/measurements.md" "docs/impact/results.json" "docs/impact/browser-results.json" "docs/impact/verification.md"
graphify update .
```

The standard `npm run check` aggregate was not invoked. Its default server/build
configuration can load dotenv files, and its browser configuration defaults to
multiple workers. Its lint, build and hook checks were run separately, with the
dotenv-disabled impact build and the 35-case, single-worker browser run. The full
default browser suite was not run. No product code or dependency locks changed.

The report generator checks fixture hashes, sample completeness, photo scores,
search labels and scores, saved latency percentiles and the historical timing-file
hash before writing the report. This dated verification record does not update
itself when the generator is rerun.

Open risks: fixture timings exclude human work; no physical-phone, microphone,
ASR, live photo recognition, new live-model latency or cloud-storage validation.
The typed Close the day journey is absent. Search relevance is synthetic. See
[measurements.md](measurements.md) for denominators and detailed limits.
