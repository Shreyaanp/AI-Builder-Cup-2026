# Trust and fraud (Track G): handoff

Branch `feat/trust-fraud`, merged with origin/main on 2026-10-16. Brief:
[task-TRUST-FRAUD.md](../briefs/task-TRUST-FRAUD.md). Audit:
[face-audit.md](../qa/face-audit.md) lists 19 issues in the old face check and how each was fixed.

## What shipped

- **Face worker** (`backend/face_worker.py`): stateless. It returns a template only for a
  live capture (one face, the prompted head movements in order, an anti-spoof "real" score),
  and otherwise a typed retry reason. Portrait phone video is accepted.
- **Trust layer** (`backend/app/trust.py`, `trust_routes.py`): templates are sealed with
  AES-256-GCM, bound to the owner, in the shared document store, so every instance shares one
  gallery. A live check comes back verified, or, if it matches another account, opens a
  duplicate-owner review item. A match never decides anything on its own. `GET /trust` returns
  the owner's status and notices and, for `TRUST_ADMINS`, the review queue. Deleting face data
  removes the template, status and reviews. The optional check no longer marks shops
  "verification pending".
- **Listing fraud checks** (`backend/app/fraud.py`): deterministic rules across shared shops
  (same phone, near-identical photos by dHash, copied menus, zero prices, prices 10× off the same
  item elsewhere or 100× the shop's own median, brand impersonation including leetspeak). They run after each approved change or
  share. A cached Gemini second look on the changed shop runs only in `COACH_MODE=gemini`.
  Flags open review items with reasons. Nothing is hidden or changed, and a fixed listing
  resolves its own flag. Fixtures are in `backend/tests/fixtures/fraud_listings.json`.
- **Owner UI** (`src/features/trust/`, `FaceDialog.tsx`): "Verify it's you" with a short
  consent, an 8-second guided capture (oval, progress ring, arrows, live hints), and one calm
  answer. It sits in Privacy and as an optional card on the Google step before publishing, and
  never blocks. Listing notices and the reviewer queue ("Looks fine" / "Keep badge off") are
  in Privacy. Copy is in 15 locales.
- **Customer**: a "Verified owner" badge on the public shop page. It opens an honest note:
  an optional live face check, not proof of business ownership.

## Config

- `FACE_MODE`: `worker` (default) or `fixture`. Fixture is for local preview and tests only;
  the `X-Face-Fixture` header names the face. Production refuses fixture mode.
- `TRUST_ADMINS`: a JSON list of Firebase UIDs. `["*"]` is allowed locally only.
  **Set real reviewer UIDs in production**, or nobody sees the queue.
- `FACE_TEMPLATE_KEY`: the template sealing key. When empty it is derived from
  `FACE_WORKER_TOKEN`. Give it its own secret before real enrolments, because rotating the
  worker token would otherwise orphan stored templates.

## Production check

The live `ogoogle-face` Cloud Run service refuses anonymous calls (403). With a Google ID token,
the call passes Cloud Run IAM and the worker asks for its shared bearer (401). Both layers work,
and `worker_headers` sends the ID token in `X-Serverless-Authorization`. A full live
`/evaluate` with a real face was not run (the bearer stays in Secret Manager). Do one check on
production after deploy.

## Tests

- Backend: `test_face_worker.py`, `test_trust.py`, `test_fraud.py` (rules on fixtures),
  `test_erasure.py`.
- Story: `tests/stories/s12-trust.spec.ts` on phone and desktop, light and dark. It runs
  consent → fake-camera capture → verified → the customer badge, the same face on a second
  account from the Google step → in review → reviewer item, then erase. A blocked camera never
  starts a challenge. Every step is axe-checked and checked for horizontal overflow.
  Screenshots: `docs/stories/trust-*.png`.

### Results (2026-10-16)

- Backend: **680 passed, 165 skipped**. Ruff and mypy are clean.
- Lint, build (`tsc -b && vite build`), hook rules and Prettier: clean.
- `s12-trust.spec.ts`: **6 of 6 passed** on phone and desktop, light and dark, plus the
  blocked camera case.
- Full `npm run check`: **not green on this machine.** The UI suite ended with 340 passed,
  72 failed and 94 skipped after 49 minutes. Four other worktrees were running Playwright at
  the same time and CPU was at 96–100%. The failures are spread across 26 unrelated spec
  files: 55 test timeouts, plus `page.goto` timeouts and `ERR_ABORTED` with Vite taking 11 s
  to start. Two retries were killed partway through from outside this session.
  - One real finding came out of it, and it is fixed: under load the face dialog counted
    timer ticks, so the prompts fell behind the 8-second recording. They now follow the
    recorder's real start time.
  - `tests/myshop.spec.ts` B26 still expected the "Check pending" chip that this branch
    removes on purpose. It now asserts that the chip never shows.
- `npm run test:qa` (fresh DBs, dedicated ports 3793/3893): **167 passed, 9 failed**. All 9 were
  the run's first tests, failing on the first `page.goto` while Vite was still cold. Re-running
  them: 7 passed, and the 2 that failed again were again the first page loads (60 s timeouts).
  None of the 9 touch the trust code.
- **Before merging, re-run `npm run check` on an idle machine or in CI.**

## Open

- Liveness and match thresholds are not calibrated on a real population.
- Locally every owner is a reviewer, so the queue shows items from other test runs.
