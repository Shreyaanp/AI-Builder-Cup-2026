# Voice continuity: local review evidence

Scope: flow fix only, based on cached `origin/main` at `c17724f`. No onboarding components changed.

Implemented:

- Every coach mic press supplies the current text/restored conversation id. The mic waits for
  restoration; changing conversations stops the previous recording.
- Completed voice replies remain in the chat. Server session ownership and business scope are
  checked before reuse or rollover.
- At the event cap, text and voice start a new conversation and announce the rollover in chat.
  The old conversation remains subject to the existing 20-conversation retention policy.
- Microphone denial explains browser permission recovery. Connection failures offer retry/text.
  Voice rate limits show the server's wait in seconds. New copy covers all 15 locales.
- Existing `ready.code` and `error.data` fields carry rollover and wait information; no schema
  or dependency change was needed.

Verified locally (offline fixtures, no external services):

- Backend: `python -B -m pytest -q --basetemp=../.cache/pytest-voice-full`:
  **620 passed, 164 skipped**. Includes reuse, disconnect cleanup, exact-cap rollover for text
  and voice, account isolation, business scope and retry timing.
- Ruff lint/format and mypy: passed (66 typed application files).
- New voice browser coverage: **44 passed** in the full QA run, covering continuity,
  persistence, rollover, delayed restoration and recovery in all 15 locales on phone/desktop.
  Axe checks passed. Light/dark screenshots under
  `.cache/voice-theme-results/` were visually reviewed at 390×844 and 1440×1000.
- Full `npm run check`: lint, build and hook checks passed. Browser results:
  **328 passed, 82 skipped, 2 failed**. The phone failures were B27's My shop tile occupancy
  assertion while the forecast was loading, and S3's nearby-discovery halal switch not
  changing state. No changes were made to these screens or tests.
  Isolated rerun with one worker: **2 passed, 2 skipped, exit 0** (desktop skips are defined
  by these phone-only cases). The original full check still has a failing result; this is
  evidence of intermittent failures, not a replacement green full run.
- Full `npm run test:qa`: **176 expected results, zero unexpected failures, exit 0**.
  This includes two existing expected failures for Tamil offline coach replies, explicitly
  excluded from fixes by PLAN-V2. Ran against a newly created QA database with
  `WEB_PORT=3437`, `API_PORT=3537`, and separately managed offline local servers
  (`QA_EXTERNAL_SERVER=true`).
- Prettier and `git diff --check`: passed.
- `graphify update .`: AST-only update completed.

Publication status:

- The supplied isolated worktree matches cached `origin/main`. Creating `fix/voice-continuity`
  failed because shared Git worktree metadata is outside the writable sandbox. Work remains
  uncommitted in this worktree.
- The user's final rules prohibit commits, pushes and external service calls. No commit, push,
  PR, deployment, cloud, billing or IAM change was performed.

Limits: offline text substituted on the real voice socket proves routing and persistence,
not live ASR/Gemini accuracy. Browser emulation does not prove physical-phone microphone behavior.
Skipped backend integration cases remain unvalidated.

Changed files: `backend/app/main.py`, `backend/app/streaming.py`,
`backend/tests/test_limit_routes.py`, `backend/tests/test_voice_continuity.py`,
`src/features/v1/useVoice.ts`, `src/features/v1/screens/CoachScreen.tsx`,
`src/features/v1/strings.ts`, the 14 files in `src/features/v1/locales/` (excluding index/legal),
`tests/qa/voice-continuity.spec.ts`, and this handoff. Generated audit screenshots/reports are
preserved under `output/voice-continuity-evidence/` rather than included in the source diff.
