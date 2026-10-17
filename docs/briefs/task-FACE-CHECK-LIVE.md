# Face check fails in production: fix it end to end, including the face worker deploy

Worktree ~/work/chalkboard-facelive, branch fix/face-check-live from origin/main (6ebf1a49, has #67).
Ports WEB_PORT=3871 API_PORT=3971. NEVER run commands in the background; foreground tests with --workers=1.
No sub-agents. Plain commits, no AI trailers. Do NOT touch the landing page files or voice/onboarding files.
Owner has authorized deploys for this (no IAM, billing or min-instances changes).

## Evidence

- Owner tried the face check on production 17 Oct 06:51:06Z, 06:52:25Z, 06:52:39Z (UTC): challenges 200,
  capture POST 200, the app shows a retry ("The video couldn't be read" = reason capture_not_usable).
- ogoogle-ai runs 8073239; ogoogle-face runs image face:inputs-90b8839d13db7c67 (OLD). The #67 fix
  (backend/face_worker.py +241 lines, backend/app/trust.py, trust_routes.py, FaceDialog.tsx) is on main but
  scripts/ship.ps1 deploys ONLY ogoogle-ai; .github/workflows/deploy.yml (lines ~115-150) shows how
  ogoogle-face is built and deployed (service account, FACE_WORKER_TOKEN secret, FACE_WORKER_URL).
- Neither service logs WHY a capture is rejected. ogoogle-face also cold-starts (~12 s) on the first capture.
- Logs: gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="ogoogle-face"' --project ichiropractic

## Do

1. Add structured logs (no images, no embeddings, no identity data): stage, reason code, container/codec,
   decoded frame count, duration, faces found per frame, which threshold failed. In face_worker.py and
   trust.evaluate.
2. Reproduce with real phone recordings: Android Chrome webm (vp8/vp9) and iPhone Safari mp4 (h264), 2-4 s,
   from the FaceDialog's MediaRecorder settings. Find why real captures are "not usable" (decode support in
   the worker image, codec, too few frames, timeouts, cold start, thresholds) and fix the root cause.
   Backend tests with fixture videos for both formats.
3. Deploy for testing WITHOUT production traffic: build and deploy ogoogle-face with `--no-traffic --tag test`
   (same service account and secret as deploy.yml), then deploy ogoogle-ai from THIS branch with
   `--no-traffic --tag face` and `--update-env-vars FACE_WORKER_URL=<the test---ogoogle-face URL>` so only
   that tagged revision uses the new worker. Verify a capture end to end on
   https://face---ogoogle-ai-5dnlvslisq-el.a.run.app with a fixture video through the API.
4. Make scripts/ship.ps1 also build and deploy ogoogle-face when backend/face_worker.py (or its Dockerfile)
   changed since the deployed image, mirroring deploy.yml.
5. PR to main "Face check works on real phones (worker deploy + logs)". Do not merge. Final message: root
   cause, test URL, what the owner should test.
