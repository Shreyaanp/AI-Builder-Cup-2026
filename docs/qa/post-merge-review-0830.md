# Post-merge review — 2026-10-18 08:30

Range: `release-2026-10-18-04..HEAD` (12 commits; `git log --oneline` reviewed). No changes were made to the protected landing files. No deleted files or clear silent feature removals were found. No new duplicate component/helper or credential material was found in the reviewed source changes.

## Findings

| Severity | Finding | Evidence | Suggested fix |
| --- | --- | --- | --- |
| High | Square sales rows retain the vendor currency only while formatting the amount, then drop it from the import table. The shared import path totals each amount using the shop's configured currency. A USD Square sandbox feed imported into an INR shop is silently recorded as INR, and pulls spanning locations with different currencies are combined. | [backend/app/pos_live.py:178](/C:/Users/pshre/work/codex-pmreview/backend/app/pos_live.py:178), [backend/app/connector_routes.py:348](/C:/Users/pshre/work/codex-pmreview/backend/app/connector_routes.py:348) | Carry currency with each imported sales row; reject or separately aggregate any currency that differs from the shop currency. Reject mixed-currency multi-location pulls until the review UI can show separate totals. |
| High | The advisory review runs a model CLI on a self-hosted personal runner with untrusted PR title/body/diff and a pull-request write token in its environment. The prompt says not to run commands, but there is no process-level sandbox or tool restriction; prompt injection in a diff could expose runner data or use the token. | [.github/workflows/agy-review.yml:22](/C:/Users/pshre/work/codex-pmreview/.github/workflows/agy-review.yml:22), [.github/workflows/agy-review.yml:74](/C:/Users/pshre/work/codex-pmreview/.github/workflows/agy-review.yml:74) | Run the reviewer in an isolated ephemeral environment with no secrets/network or command tools, and grant comment permission only in a separate constrained step after validating model output. |
| Medium | Push reminders support Hindi and English only. Every other selected locale is deliberately sent as English by the UI, and the backend schema rejects any other locale. This breaks localized reminders for the other supported languages. | [src/features/v1/ReminderSettings.tsx:106](/C:/Users/pshre/work/codex-pmreview/src/features/v1/ReminderSettings.tsx:106), [backend/app/reminders.py:68](/C:/Users/pshre/work/codex-pmreview/backend/app/reminders.py:68) | Accept the supported locale set and send translated reminder titles for each locale, or keep the feature unavailable with a clear localized explanation until those translations exist. |
| Medium | The first-run phone browser scenarios do not complete: owner times out while taking the first screenshot, and customer times out opening the profile after replay. This leaves the new owner/customer replay and phone handoff unverified at 360–412 px. | [tests/first-run.spec.ts:78](/C:/Users/pshre/work/codex-pmreview/tests/first-run.spec.ts:78), [tests/first-run.spec.ts:111](/C:/Users/pshre/work/codex-pmreview/tests/first-run.spec.ts:111) | Investigate the screenshot/font wait and the customer profile entry after reload; retain the 360/390/412 layout, keyboard and replay assertions when correcting the flow/spec. |

## Commit verdicts

| Commit / PR | Verdict |
| --- | --- |
| `744e8b3a` — #188 golden upload/import dataset | OK; adds fixture coverage. |
| `02637724` — #219 advisory Antigravity review workflow | Finding above: self-hosted runner exposure. |
| `57a10d81` — #223 first-run explainer | Finding above: phone replay verification remains incomplete. |
| `5a0057a3` — #217 voice stability | OK; retry/fallback and provider close handling reviewed; targeted backend tests pass. |
| `e27bb6c4` — #199 web-push reminders | Finding above: reminder locale coverage. |
| `dc7fbfa7` — #208 post-merge review fixes | OK; prior review notes retained. |
| `7db5c279` — #206 demo accounts/data docs | OK; documentation and recorded demo data. |
| `901638e5` — #187 flow/POS bugs | Finding above: currency is lost on sales import. |
| `536a8084` — #173 SAP sandbox purchase orders | OK; read-only adapter and recorded fallback reviewed; targeted tests pass. |
| `673b017b` — #216 scorecard/architecture/scalability evidence | OK; docs/evidence changes reviewed. |
| `90fe24a6` — #175 Square/Loyverse and Google Connectors | Finding above: currency is lost on sales import. |
| `db7d8365` — #193 owner daily-use flow | OK; related flow diff reviewed. |

## Verification evidence

- `npm run rules` — passed.
- `uv run --project backend pytest backend/tests/test_pos_live.py backend/tests/test_reminders.py backend/tests/test_sap_sandbox.py backend/tests/test_text_model.py -q` — 65 passed.
- `WEB_PORT=4881 API_PORT=4981 npx playwright test --project=phone --workers=1 tests/first-run.spec.ts tests/pos-connect.spec.ts tests/reminders.spec.ts tests/tour-narration.spec.ts tests/hindi.spec.ts` — 24 passed, 2 failed (the first-run owner screenshot and customer profile/replay cases above).
- The Playwright run generated Hindi QA screenshots; no screenshot comparison is claimed as a physical-phone test.
