# Production health check

Ports none needed. NEVER run commands in the background; foreground tests with --workers=1 and wait. No sub-agents. Plain commits, no AI trailers. Do NOT touch src/features/frontdoors/Marketing.tsx, landing.css or src/features/v1/Landing.tsx unless the brief says so. Small PR to main, all CI checks green (main is now branch-protected: 9 required checks, up to date with main). Do not merge.

1. scripts/prod-health.mjs (node, no new deps): uses 'gcloud logging read' (project ichiropractic, services ogoogle-ai and ogoogle-face) for the last N minutes (arg, default 60) and prints a short report: 5xx count by path, ERROR/traceback count with the top 3 distinct exception lines, voice sessions opened/closed/rejected and closes that followed a traceback, voice_first_audio p50/p90 from coach_latency, face captures and their outcomes, cold starts. Exit 1 if tracebacks or 5xx > 0.
2. Log-based metrics in Cloud Logging (gcloud logging metrics create, no alerts or notification channels): chalkboard_voice_tracebacks, chalkboard_5xx, chalkboard_face_rejects. No IAM or billing changes.
3. Add 'node scripts/prod-health.mjs 30' as a documented step in docs/release-checklist.md. Test it against production now and paste a sample report in the PR. PR title: 'Ops: production health report and log-based metrics'.
