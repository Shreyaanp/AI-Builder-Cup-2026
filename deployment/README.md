# Deployment

One Cloud Run service serves compiled React and the Python API at the same HTTPS origin. Firebase Google sign-in identifies users; Firestore stores owner-scoped ADK conversations and distributed run leases under `ogoogle_ai_v1`. Business cards remain temporary browser data. Google AI Mode/Lens and Google Business Profile publishing remain unconnected.

## Release flow

1. Push a main commit. GitHub Actions checks Python, the Firestore emulator, generated contracts, React/browser behavior and the actual Docker image.
2. Manually run **Cloud Run release** in GitHub Actions. Optionally supply a full main commit SHA. The workflow validates the commit and reruns checks before publication.
3. Build the image, authenticate using short-lived Workload Identity Federation, push the SHA-tagged image, and deploy `ogoogle-ai` in `asia-south1`.
4. Verify HTTPS health, release SHA, frontend, authentication and blocked unknown paths. A failed verification fails the workflow; it does not automatically roll back traffic.

Target: `https://ogoogle-ai-176787245026.asia-south1.run.app` (not a live-URL claim until release passes). `target.json` defines fixed resources. `bootstrap.ps1` defaults to printing a plan; `-Apply` performs idempotent setup without billing activation or deployment. Setup has been applied and Google sign-in confirmed enabled.

The production GitHub environment contains the WIF provider and Firebase app ID as variables and the dedicated Firebase browser key as a secret. No service-account JSON key is required. The browser key is public runtime configuration restricted to Firebase Auth APIs and expected referrers; it is separate from private Gemini keys. Generated runtime configuration is ignored and removed after release.

## Runtime and cost boundaries

- Zero minimum instances, maximum one instance, request-based CPU, concurrency eight, 1 GiB RAM and a 180-second Cloud Run timeout. Application text/voice deadlines are shorter.
- Default `COACH_MODE=offline`. No inference key is injected. A live model requires separate server configuration and evaluation.
- Cloud Run, image storage and Firestore can consume credits or incur charges. Existing eligible credits/free allowances are preferred. Resource limits do **not** enforce a ₹500 monetary cap. No billing activation or budget changes are part of setup.
- Shared Firebase Auth/default Firestore are retained. App namespace and identity separate usage; datastore IAM remains project-scoped. A sign-in token does not grant merchant publishing authority.

## Rollback and verification

To roll back, manually release a known-good full main SHA. Checks still run; its code supplies configuration while GitHub environment settings remain current. Keep required image versions. Inspect revisions with `gcloud run revisions list --service=ogoogle-ai --project=ichiropractic --region=asia-south1`.

After the first successful deployment, complete a real Google login, send a fictional note, reload, resume the saved conversation, then sign out and confirm private history disappears. Emulator/token-mock tests do not establish this human OAuth result. WebSocket Live has a backend adapter; microphone/playback UI and actual provider speech remain future work.
