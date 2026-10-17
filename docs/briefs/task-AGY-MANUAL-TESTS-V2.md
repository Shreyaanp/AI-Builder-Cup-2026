# Manual test script v2: cover everything shipped since PR #17 (Antigravity, Gemini)

Branch fix/manual-tests-v2 from origin/main. Ports WEB_PORT=3803 API_PORT=3903, RECALL_PATH=data/test-vectors.
NEVER run commands in the background; foreground only; `--workers=1`. Docs only: change NO app code.
Plain commit messages, no AI trailers.

The owner tests on a real phone tonight with docs/qa/manual-test-script.md (37 steps, written before
stable release 1). Main has since gained: Today page (greeting, "Needs you now", pulse, progress bar,
collapses to a pill while chatting), tabs Shop/Grow/You, in-chat camera + map pin + Google Maps hand-off,
trust/face check + verified badge, customer games (scratch cards, stamps, streak freeze), instant customer
answers (#41: instant local results, streamed words, skeletons), voice/caption sync and customer content in
the customer's language (#46), language picker.

1. Read the current script, the code and docs/handoff/*.md. Mark every step still valid, fix steps whose
   labels/screens changed (e.g. "My shop" → Shop, "Google" → Grow, "Privacy" → You), remove dead steps.
2. Add steps for each new feature above: exact taps, what the tester should see, pass/fail box. Keep each
   step one line of action + one line of expected result; phone-first; include 2 language checks (Hindi,
   Tamil) and one voice-mode check of caption/audio sync.
3. Verify every step against the running app locally (npm run dev with the ports above, demo seed) at
   360px; take one screenshot per new section into docs/qa/manual-v2/ (max 12 images).
4. Keep a 1-page "15-minute smoke" at the top: the 12 most important steps for a quick pass.
   `npx prettier --check docs/qa`. Push and open the PR.
