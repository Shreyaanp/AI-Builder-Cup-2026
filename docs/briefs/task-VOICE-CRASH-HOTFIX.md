# HOTFIX: production voice session dies mid-conversation (Firestore append_event)

Worktree ~/work/chalkboard-voicecrash, branch fix/voice-crash-hotfix from origin/main. Ports WEB_PORT=3831
API_PORT=3931. NEVER run commands in the background; foreground tests with --workers=1. No sub-agents.
Plain commits, no AI trailers. Do NOT touch the landing page (Marketing.tsx, landing.css, v1/Landing.tsx).

## Evidence (production, image 8073239, Cloud Run ogoogle-ai, project ichiropractic, asia-south1)

The owner's live voice onboarding drops: 17 Oct 06:38:42Z and 01:37:14Z (UTC). Each time, right after a
`coach_latency flow=voice_first_audio` line:

- `backend/app/firestore_memory.py:189 append_event` → `await append(self.client.transaction())`
- the commit RPC gets `asyncio.exceptions.CancelledError`, the transactional decorator then rolls back and
  the rollback fails: `grpc AioRpcError StatusCode.ABORTED "The referenced transaction has expired or is
no longer valid."`
- that error escapes through `google/adk/runners.py _process_and_append_event` / `_pump_agent_events` /
  `_cleanup_root_task` → `voice_closed`. The client reconnects ~5 s later (`resumed=True`), the owner hears
  the drop.
  Read more with: `gcloud logging read 'resource.type="cloud_run_revision" AND
resource.labels.service_name="ogoogle-ai" AND timestamp>="2026-10-17T06:38:41.9Z" AND
timestamp<="2026-10-17T06:38:42.5Z"' --project ichiropractic --order=asc --format='value(textPayload)'`.

## Do

1. Find WHAT cancels the task during the commit (ADK live turn interruption / pump cancellation / our own
   timeout or lease renewal in voice.py / limits.py) and why that kills the whole live session.
2. Fix so one failed or cancelled event write never ends the voice session: the event is retried or
   safely skipped and logged, a cancelled write is not left as a broken transaction, and real cancellation
   (socket closed by the user) still shuts down cleanly. Smallest correct change.
3. Backend test that reproduces it (fake Firestore/transaction raising CancelledError then ABORTED on
   rollback) and proves the session stays up. Run the backend suite and the voice specs
   (tests/new-shop-voice.spec.ts, voice specs) on phone and desktop.
4. Check PR #91 (fix/voice-reliability, ~/work/chalkboard-voicerel, being worked on, do not edit it): note in
   your PR whether its changes to firestore_memory.py / voice.py conflict with yours.
5. Open a PR to main titled "Hotfix: voice session survives a failed session write", with the evidence and
   the root cause. Do not merge. Leave CI green.
