# Track G: duplicate-owner face check that works + fraud checks (account 3, session 2)

Branch `feat/trust-fraud` in this worktree (from origin/main). Read first: docs/OWNER-NOTES.md,
docs/PLAN-V2.md ("Final push plan"), docs/HACKATHON-REVIEW.md, docs/REVIEW.md, AGENTS.md, and
the face code (src/features/v1/FaceDialog.tsx, face.worker.ts, backend/app/face_transport.py,
the face worker service and its smoke script backend/scripts/face_worker_smoke.py).
Setup: `npm ci`, `uv sync --project backend`; node is at
C:\Users\pshre\AppData\Local\AIBuilderCupTools\node-v24.21.0-win-x64 (add to PATH).
Ports WEB_PORT=3517 API_PORT=3617; RECALL_PATH=data/test-vectors.
Others own: owner onboarding UI (NewShopFlow/useVoice), customer UI, supply chain (feat/supply-chain).
Plan the whole story first (plan mode), then build it end to end.

## Owner's words

"Duplicate owner face check: obviously it's optional, but we need it in some flow and it needs
to WORK. It's not working, there are a thousand different issues. Make it correctly." The track
also names fraud as a judging area.

## Build

1. **Audit first**: run the face flow on phone and desktop (camera permission, capture, liveness
   prompts, upload, worker call, match result, retry, delete/erase) and list every issue in
   docs/qa/face-audit.md with screenshots; then fix all of them.
2. **Place it in a real, optional flow**: e.g. "Verify it's you" before adding a second shop
   or before publishing on Google, and as an optional trust step in Privacy. Clear purpose,
   consent, what is stored (encrypted template, never the photo), how to delete. Never blocks.
3. **Duplicate-owner detection works end to end**: the same face registering a different owner
   account is detected and shown to the owner/admin as a review item (not an accusation).
4. **Verified-owner badge** on the customer shop page when the check passed (honest wording).
5. **Gemini fraud checks on listings**: suspicious patterns (same phone/photos across shops,
   impossible prices, copied menus, brand impersonation) flagged for review with reasons;
   never auto-punishes. Tests with fixtures.
6. Production: the face worker is a private Cloud Run service needing an identity token
   (worker_headers); verify the real path works with the live worker where possible.

## Definition of done

Phone + desktop, light + dark, 15 locales, axe clean, calm owner motion. Backend tests, unit
tests for fraud rules, browser story test tests/stories/s12-trust.spec.ts (consent → capture
with a fake camera → verified badge; duplicate detected; erase), screenshots
docs/stories/trust-*.png. Run backend tests, `npm run check`, `npm run test:qa` (fresh DBs).
Commit small (no AI co-author trailers), push, `gh pr create` into main, write
docs/handoff/trust-fraud.md. Summarise.
