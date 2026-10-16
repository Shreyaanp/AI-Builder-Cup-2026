# HIGHEST PRIORITY: shop onboarding by voice must never drop, repeat or get stuck (Hindi first) (account 3)

Owner (17 Oct 00:05), live, Hindi: "connection lost", the same question asked again, the flow breaks after
some time and gets stuck. Production logs (Cloud Run ogoogle-ai, 16 Oct 17:45-18:18 UTC) show:
- Every new-shop voice session ends by itself after ~9-12 turns / ~130 s with `voice_closed` and NO error.
  Prime suspect: RunConfig max_llm_calls = NEW_SHOP_LLM_CALLS = 40 (backend/app/voice.py:29,167): turns +
  tool calls exhaust it mid-onboarding and run_live ends. Confirm (log why the stream ended), don't guess.
- The client then reconnects with session_id (resumed=True) or the user starts over (resumed=False); the
  model does not continue from the saved draft → repeats questions.
- A quick reconnect gets 409 "This conversation already has an active stream." (limits.py:232 /
  firestore_memory.py:223): the old stream lock is not released before the new one, so resume fails.

Start from the in-progress Hindi language fix: `git switch -c fix/voice-reliability` in a NEW worktree from
the commit 04b5124 on branch fix/voice-language (worktree ~/work/chalkboard-voicelang belongs to another
worker: do NOT edit it; `git worktree add ~/work/chalkboard-voicerel -b fix/voice-reliability 04b5124`).
When origin/fix/voice-language is pushed, merge it. Ports WEB_PORT=3841 API_PORT=3941,
RECALL_PATH=data/test-vectors. NEVER run commands in the background; foreground only; `--workers=1`; no
parallel sub-agents; plain commits, no AI trailers.

Make it robust and idempotent:
1. A full onboarding (name, category, place, menu, hours, photo, review, live) must fit in one session: lift
   the call budget to what onboarding really needs (measure calls per turn), and when any limit is near,
   continue seamlessly (rotate the Live session server-side with the context carried over) instead of
   ending. Log the real end reason on every voice_closed (limit, client, provider error, timeout).
2. Resume = continue: on reconnect (same session_id, or a fresh session for the same owner with an
   unfinished draft) the model receives the saved new-shop draft + what is still missing + the last
   question asked, and continues from the NEXT missing field. It never re-asks a field already in the draft.
   The draft is the source of truth; every answer is saved immediately (idempotent: saving the same
   answer twice changes nothing; a replayed tool call is a no-op).
3. Stream lock: release it on close/abort and on heartbeat timeout; a reconnect with the same session_id
   takes over the old stream (close the old one) instead of getting 409.
4. Client: auto-reconnect with backoff, no "connection lost" dead end; if it truly can't reconnect, show a
   calm "Reconnecting…" then a Retry button that resumes at the same step; typing always works meanwhile.
   Mobile network switches / screen lock / app background must resume at the same step.
5. Tests: backend tests for budget/rotation, resume-from-draft prompt (no re-asked fields), 409 takeover,
   idempotent saves; a browser spec that kills the socket mid-onboarding (Hindi locale) and asserts it
   resumes at the next missing field with no repeated question; a long onboarding (15+ turns) that never
   drops. Then ONE live check with the owner's gcloud credentials: a Hindi new-shop session of 15+ text
   turns via the voice socket against live Gemini Live completes without voice_closed and without a
   repeated question (small cost; record the transcript in the PR).
Ruff, mypy, pytest, lint, build, prettier, voice/new-shop specs. Push fix/voice-reliability, PR to main
titled "Voice onboarding never drops or repeats (Hindi)". Summarise with the live check result.
