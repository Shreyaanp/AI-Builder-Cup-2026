# Public owner demo: local validation

18 October 2026. Working-tree continuation of PR #301; no commit, push, deployment,
cloud change, external service call or paid model call was performed.

## Implementation

- Resolved the two merge conflicts. `/demo` uses the real owner AppShell and the
  incoming slim banner and translations. Sample-only coach dialogs were replaced
  by the actual offline coach and forecast flow.
- Demo tabs retain `/demo` and record their destination in the query string.
  Closing a sheet preserves its parent tab. The banner has 48 px controls; its
  height is reserved so the coach composer clears the fixed navigation.
- Reminders toggle inside the session without browser push permission. Publishing
  remains blocked with the localized “Demo: not sent” note.
- Hosted demo sessions use the existing app Firestore namespace, in the separate
  `community/public_demo_sessions` collection. Both sandbox databases, identity,
  reminders and coach turn count are stored together. Every hosted request restores
  the shared state; successful writes save before the HTTP success headers.
- Snapshots expire after 900 seconds. Expiry is enforced on reads/writes; new demo
  allocations purge expired records. Exit deletes the shared record. Revision
  checks reject concurrent stale writes with 409, and deleted sessions cannot be
  recreated by a late write. Snapshots have a 700 KB bound.
- Local tests use the same document-store contract with a separate SQLite file.
  Clearing the instance cache exercises reconstruction without cloud access.
- Demo tool overrides are request-local: forecasts, question plans, supplier
  generation and supply-document translation use offline services without changing
  the live app's global services. Public allocation, write and coach limits remain.

## Verification evidence

- `npm run check -- -- tests/public-demo-full.spec.ts tests/public-demo.spec.ts tests/demo-banner-chips.spec.ts --project=phone --workers=1`:
  lint, build, hook enforcement and **18 browser tests passed**.
- Browser ports: WEB_PORT=5321, API_PORT=5421. Local-only browser routing enabled.
  Matrix: 360/390/412 px, English/Hindi, light/dark; owner/customer overflow and
  390 px axe checks. The 390 px lifecycle covers coach replies, Grow, purchase
  orders, reorder drafts, order history, SAP entry, Close the day, You, reminder
  toggles and Help → Take the tour. The welcome tour offer is also asserted.
- `uv run --locked pytest tests/test_public_demo.py tests/test_day_close.py tests/test_streaming.py tests/test_stream_resume.py tests/test_session_write_failure.py -q --tb=short`:
  **35 passed**. Includes receiving goods, sample-photo close-day sales, persisted
  writes after cache loss, expiry/exit/isolation, stale revisions, limiter failures,
  offline forecast isolation, disconnect cleanup and owned-session regressions.
- Ruff: passed. Mypy: passed, 130 source files. Changed-file Ruff/Prettier format
  checks, `npm run rules` and `git diff --check`: passed. No unresolved merge paths.
- `graphify update .`: completed using AST extraction only. Its existing `api.ts`
  extraction warning remains; TypeScript compilation passed.

## Scoped UX review

| Check                       | Evidence / limit                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Purpose and next action     | Existing owner shell; welcome offers the tour or Skip.                                       |
| Primary action              | Existing screen actions retained; demo banner uses secondary controls.                       |
| Content                     | Existing localized copy reused; external-action note is one line.                            |
| Visual hierarchy / contrast | Phone screenshots reviewed; Shop/customer axe passed in both themes.                         |
| States                      | Loading, expiry, allocation failure and retry covered; full permission-state review not run. |
| Personalization             | Lantern Chai Corner, local WhatsApp wholesaler, shop currency and history retained.          |
| Motion                      | Existing sheet/tour motion reused; no new animation introduced.                              |
| Reachability                | Composer/navigation clearance asserted; banner controls have 48 px targets.                  |
| Complete journey            | 390 px lifecycle passed; backend confirms sandbox writes survive reconstruction.             |
| Languages                   | English and Hindi passed. CJK and desktop review remain unvalidated.                         |

Screenshots are local artifacts under `output/playwright/`: `demo-full-01-welcome.png`
through `demo-full-09-tour.png`, plus `demo-owner-{en,hi}-{light,dark}.png` and the
corresponding customer captures.

## Files changed in this continuation

- `backend/app/public_demo.py`, `demo_sessions.py`, `demo_context.py`,
  `coordinator.py`, `supply_chain.py`; `backend/tests/test_public_demo.py`.
- `src/features/demo/DemoApp.tsx`; `src/features/v1/AppShell.tsx`,
  `WorkspaceProvider.tsx`, `ReminderSettings.tsx`.
- `tests/public-demo-full.spec.ts`, `public-demo.spec.ts`, `demo-banner-chips.spec.ts`;
  this validation note. Existing staged merge changes were preserved.

## Open risks

- Live Firestore / multiple Cloud Run instances were not contacted. Cache-loss
  recovery uses the local storage adapter; hosted adapter behavior needs release
  validation. Expired record cleanup is application-driven; no managed Firestore
  TTL policy was configured.
- Concurrent edits can return 409 and require retry. Offline coach conversation
  history is instance-local; committed sandbox business changes are shared.
- Browser emulation is not a physical-phone test. Desktop, CJK, real microphone,
  live model and push delivery were not validated.
- The build still reports its existing large-chunk warning; ADK reports its
  experimental function-schema warning.
