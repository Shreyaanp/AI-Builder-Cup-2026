# Guide, payments, rides and landing

Local branch: `feat/guide-payments-landing`. No commits, push, PR, deployment, cloud changes or
external provider contact: the final rule in the task prohibits these actions. The branch and
unfinished track changes already existed when this run began; they were preserved. The branch
currently descends from `56bb44c`; cached `origin/main` had advanced to `13c1099` during review.
No fetch, reset or rebase was done; integration with newer main commits remains unverified.

## Entry points for the owner-tabs track

The feature screens are standalone components inside the existing owner workspace:

```tsx
import { openOwnerFeature } from '../owner-tools/entry'

// Grow card: Payments & rides
openOwnerFeature('payments')
// You → Help, or a Grow card: Talk to your coach
openOwnerFeature('guide')
```

`src/features/v1/AppShell.tsx` mounts `PaymentsScreen` or `CoachGuide` for the URL's
`?feature=payments` / `?feature=guide`. They require the existing `WorkspaceProvider` and app
providers. The coach stays mounted while hidden. `openOwnerFeature(null)` returns to the
underlying owner screen; browser Back also handles feature URLs. The existing Settings menu
provides interim entry points. The other track owns the You/Help and Grow placement; no owner
tab structure was changed here.

`GuideChips` accepts `onSend(sentence)`, optional `compact` and `disabled`. The empty coach uses
three examples and a link to the full guide. The full guide offers seven job groups, or six
for services (no perishable rescue-deal prompt). Product names come from saved inventory;
service businesses get service vocabulary. Tapping a sentence opens the coach and sends that
exact text. Coach drafts wait for an active reply/voice turn to finish before sending.

## Implemented behavior

- Payment settings save a validated shop UPI ID and provider selections through the existing
  sealed-proposal approval API. These fields stay on the owner record, outside preference
  storage and public customer facts.
- INR amount, payee, ID and optional note produce one locally validated `upi://pay` URI with
  `pa`, `pn`, `am`, `cu=INR`, `tn`. QR, app link, copy and share encode the same request.
  Native sharing uses text because custom URI schemes are not universally accepted as URLs.
  Clipboard/share failure leaves a selectable link. No money is processed or receipt claimed.
- Rider pickup uses the saved non-demo shop pin. Uber links include pickup and a typed drop
  address or valid latitude/longitude pair. Uber also has an explicit home fallback. Rapido
  and Porter use clearly labelled home fallbacks: no unverified address-prefill scheme is
  invented. The provider confirms price, availability and booking.
- ADK tool `prepare_payment_link` uses the owned shop's saved UPI ID, validates the amount and
  note, and emits a payment card through SSE. Conversation reload restores the card. It never
  contacts a customer, processes money or reports payment success.
- Landing retains its routes, semantic theme roles and responsive layout. Both owner and
  customer journeys appear in the hero. Voice setup, photo reading, forecast, sourcing,
  customer AI, stamps and assisted Google submission have concise, honest labels. Its single
  entrance uses shared motion tokens and respects reduced motion.
- New frontend copy covers all 15 locales. The existing theme and owner tab structure were
  preserved. New navigation updates title/focus/scroll and does not fake a browser Back event.
  Feature URLs preserve the underlying history marker; returning from Help does not discard
  an unsent coach draft. The focused regression failed before this fix, then passed on phone
  and desktop; the existing phone sheet/draft Back test also passed (3 passed, 1 desktop skip).
  QR loading reserves the image area so its actions keep their position.

## Changed files

- `src/features/owner-tools/{PaymentsScreen,CoachGuide}.tsx`, `links.ts`, `entry.ts`, `copy.ts`
- `src/features/v1/{AppShell.tsx,api.ts,backStack.ts}`, `screens/CoachScreen.tsx`, `src/api/{stream.ts,generated.d.ts}`
- `src/features/frontdoors/{Marketing.tsx,landing.css}`
- `backend/app/{payments.py,agent.py,contracts.py,merchant.py,streaming.py,main.py}`
- `docs/openapi.json`; `tests/{owner-tools.spec.ts,owner-tools-support.ts,frontdoors.spec.ts}`;
  `tests/qa/guide-payments.spec.ts`; `backend/tests/test_payments.py`
- Twenty `docs/stories/{guide,payments,landing}-*.png` captures; updated story/QA reports and
  this handoff. Existing suites also refreshed their own screenshots.
- `playwright.config.ts`: optional `PLAYWRIGHT_WORKERS` for a busy shared machine.

Pre-existing modified screenshots under `docs/bugs` and `docs/codex/customer-shots` were not
reverted. Browser suites can refresh their own existing evidence files.

## Verification evidence

Ports: `WEB_PORT=3617`, `API_PORT=3717`; local fixture recall: `RECALL_PATH=data/test-vectors`.
Browser DNS/routing blocks external hosts, models use offline fixtures, and uv uses offline mode.
The QA server separately isolates its SQLite files and recall store under `.cache/qa`.

- Backend: `uv run --locked ruff check .`, `ruff format --check .` (142 files), and `mypy`
  (68 source files) passed. Full `pytest -q`: **642 passed, 176 skipped**. The updated payment
  regression using the literal `₹240` passed separately: **18 passed, 12 skipped**.
- OpenAPI was exported with `uv run --locked python -m scripts.export_contract`, then
  `openapi-typescript` regenerated `src/api/generated.d.ts` locally. Changed frontend files
  passed Prettier; `git diff --check` passed. The theme has no diff.
- The first full browser run was interrupted after navigation timeouts; a direct local HTTP
  probe also timed out against Vite while the API responded. Restarting this worktree's Vite
  server restored navigation. The isolated budget file passed **2 tests**; the other affected
  files passed **60 tests, 18 skips** with one worker. No timeout was hidden by changing tests.
- `npm run check`: lint, production build and hook enforcement passed. The complete browser
  run finished with **368 passed, 80 skipped, 2 timeouts**. All **16 new owner-tool cases**
  passed across phone/desktop, light/dark, 15 locales, enlarged text and axe scans. The two
  existing timed-out files were then rerun separately with one worker and unchanged deadlines:
  `tests/stories/s2.spec.ts` **1 passed** (46.6 s, phone) and `tests/v1-a11y.spec.ts`
  **36 passed** (phone/desktop, light/dark). The full-run report retains the two failures;
  isolated passes are separate evidence, not a claim that the full command exited cleanly.
- Fresh-database `npm run test:qa -- --workers=1` exited **0**: **186 expected outcomes** in
  14 minutes, **0 unexpected failures, 0 flaky, 0 skipped**. This is **184 actual passes plus
  2 existing expected failures**: Q1, the English offline fixture response to a Tamil greeting,
  once per viewport (`tests/qa/coach.spec.ts:67`). All **10 new guide/payment QA cases passed**.
  `.cache/qa` did not exist before startup; the QA server created new merchant/session SQLite
  databases and isolated recall storage. Structured results are in `docs/qa/results.json`.
- `graphify update .` completed locally without an LLM: **4,861 nodes, 14,774 edges**. Semantic
  community relabelling was not run because it would require a model.

Early unfinished-run notes about import extensions, locale cells and fixture assumptions are
not fresh verification evidence. Interrupted/failed runs do not count as passing checks.

## UX review

Reviewed the existing 390×844 phone and 1440×1000 desktop captures in light and dark. Fresh
captures are produced by `tests/owner-tools.spec.ts`. Source locations below refer to the
standalone screens; all screenshots are under `docs/stories`.

| House check          | Review                      | Evidence / limits                                                                                                                                                            |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3-second purpose     | Pass                        | `CoachGuide.tsx:87`, `PaymentsScreen.tsx:155`, `Marketing.tsx:89`; `guide-phone-light.png`, `payments-phone-light.png`, `landing-phone-light.png`                            |
| Primary action       | Pass                        | Payment amount → Create link → Open UPI; guide suggestions are outlined; landing hero has one filled journey action.                                                         |
| No TMI               | Pass                        | Seven short job groups; rider options stay behind Send a rider; settings remain a separate step.                                                                             |
| Typography / spacing | Pass                        | Semantic type roles, restrained 8-px spacing, wrapping chips; two guide columns on desktop (`CoachGuide.tsx:48`).                                                            |
| States               | Partial                     | Save failure/retry, missing pin, validation, share/clipboard fallback and queued coach sends have tests; QR failure and physical offline-provider handoff are not exercised. |
| Personalization      | Pass                        | Saved shop identity, item names, pin and preferences reused; recognized service categories receive six relevant prompts.                                                     |
| Motion               | Pass                        | Shared card entrance and a single landing entrance; reduced-motion media queries and `useChalkTimeline` retained.                                                            |
| Reachability / input | Partial                     | Guide targets are at least 48 px; visible labels and inline errors; draft/Back regression covered. Physical keyboard/IME and screen reader checks remain manual.             |
| End-to-end handoff   | Pass                        | Settings/empty coach → guide → exact sentence in chat; payment tool → retained card; Grow/You integration entry points above.                                                |
| Languages            | Pass for automated coverage | 15 copy contracts; Hindi/Japanese enlarged-text screenshots; native-speaker review remains open.                                                                             |

The automated axe scans in the new feature tests passed. Visual review and axe together do not
replace a physical-phone or screen-reader accessibility review.

## Limits

- Emulator tests are skipped when a local Firestore emulator is unavailable; fixture results
  establish neither live Gemini/ASR accuracy nor production Firestore behavior.
- Browser emulation is not a physical phone or installed PhonePe/GPay/Paytm/Uber/Rapido/Porter
  handoff test. No provider was opened and no booking/payment was made.
- The You → Help / Grow card placement remains a documented integration for `feat/owner-tabs`.
- Translation coverage and layout tests do not replace native-speaker review.
- Q1 remains an expected QA defect in the general offline coach; new frontend copy coverage
  does not establish multilingual live-model or offline-fixture reply accuracy.
- The production build retains its chunk-size warning; no field performance or physical-phone
  performance measurement was performed.
- Publication is intentionally local-only under the final task rule.
