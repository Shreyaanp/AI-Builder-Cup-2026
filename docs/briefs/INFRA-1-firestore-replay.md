# INFRA-1 — Shared stream resume buffer (do after UI-3)

Same rules as the UI briefs: branch `ui/coach-screen` (first run `git merge main`), no main/push/release, no AI co-author, report in `docs/briefs/INFRA-1-REPORT.md`.

Read docs/codex/CONVENTIONS.md first and follow it (no commits, no co-author trailers, no cloud changes).

The coach SSE stream resume buffer is in memory (backend/app/replay.py, used from main.py/streaming.py).
The main Cloud Run service now runs 1–10 instances with session affinity, so a reconnect can land on another
instance and resume fails. Make the replay buffer shared:

1. Add a replay store interface with two implementations: the existing in-memory one (local/dev/tests) and a
   Firestore one (production; `MERCHANT_BACKEND=firestore` / settings already select Firestore elsewhere —
   follow that pattern). Firestore layout: collection `stream_replay`, doc id = hash(owner uid + session id +
   turn id), events appended in order (array or subcollection; keep each turn ≤ 200 events / ~200 KB), an
   `expires` timestamp 2 minutes after the last event, and a Firestore TTL-compatible field name `expires_at`.
   Owner-scoped: a resume request from another owner must never read the doc.
2. Writes must not slow the stream noticeably: batch/append asynchronously (anyio thread) and tolerate a
   failed write (log, keep streaming; resume then falls back to the existing "reply didn't finish" path).
3. Tests: both adapters (the Firestore one via the emulator like backend/tests/test_merchant_store.py's
   `store` fixture), resume from a second app instance reading the same Firestore, cross-owner denial,
   expiry. Keep CI offline.
4. Document in deployment notes that the lead must enable a Firestore TTL policy on
   `stream_replay.expires_at` (one gcloud command — write it out).
   Run only: ruff, ruff format --check, mypy app, pytest on the touched test files (with the emulator if present;
   say if not), and nothing in the browser.
