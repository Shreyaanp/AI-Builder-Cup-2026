# Local verification — 18 October 2026

All data is synthetic. No live provider evaluation, secret-file access, publication,
deployment, billing change, or external service request was performed.

| Check                                                                       | Result                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Offline golden runner                                                       | 41/41 structured and 22/22 media fixture contracts passed                 |
| Supported-field precision / recall                                          | 1.000 / 1.000 for every scored field                                      |
| Required capabilities outside current contracts                             | 30 cases tracked; 0 fully met                                             |
| `uv run --project backend python -m pytest backend/tests/test_golden.py -q` | 46 passed, no warnings                                                    |
| Ruff check and format check, golden helpers and pytest                      | Passed                                                                    |
| Backend `uv run --offline mypy` from `backend`                              | Passed, 107 source files                                                  |
| Prettier check, corpus JSON/HTML, README and renderer                       | Passed                                                                    |
| `npm run rules`                                                             | Failed: existing workflow lacks phone browser project; other rules passed |

`graphify update .` completed locally using AST extraction; graph output is ignored.

Visually inspected Tamil clean, Chinese rotated, Hindi low-light and invoice PNG
renders. PDFs were produced by Chromium from their recorded HTML; no independent
PDF rasterizer was installed, so PDF page rendering remains unvalidated.

The runner's media score exercises synthetic response parsing, not OCR. Real AI
accuracy, native vendor compatibility, SKU preservation, tax, menu currency and
sold-out extraction remain open. SAP IDocs exercise the SupplyDoc parser; generic
connector mapping for native SAP segments is not established. Forecast/change
cases exercise ORDERS drafts, not native DELFOR/ORDCHG document types. These limits
are detailed in README.md and the case metadata/requirements files.

`npm run check` was not run: this change adds test data/helpers only, and its browser
suite starts application servers. No application or landing implementation changed.
