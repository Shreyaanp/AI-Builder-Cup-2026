# Deployment

The release workflow also packages a private CPU face worker before deploying the main
service. See [the face worker handoff](FACE_WORKER.md) for one-time lead setup, local
checks, cost assumptions and the unresolved ephemeral template-storage limitation.

One Cloud Run service serves compiled React and the Python API at the same HTTPS origin. Firebase Google sign-in identifies users; Firestore stores owner-scoped ADK conversations and distributed run leases under `ogoogle_ai_v1`. Business cards remain temporary browser data. Google AI Mode/Lens and Google Business Profile publishing remain unconnected.

## Release flow

1. Push a main commit. GitHub Actions checks Python, the Firestore emulator, generated contracts, React/browser behavior and the actual Docker image.
2. Manually run **Cloud Run release** in GitHub Actions. Optionally supply a full main commit SHA. The workflow validates the commit and reruns checks before publication.
3. Build the image, authenticate using short-lived Workload Identity Federation, push the SHA-tagged image, and deploy `ogoogle-ai` in `asia-south1`.
4. Verify HTTPS health, release SHA, frontend, authentication and blocked unknown paths. A failed verification fails the workflow; it does not automatically roll back traffic.

Live URL: [oGoogle AI](https://ogoogle-ai-176787245026.asia-south1.run.app). Release `2e00689` passed on October 14, 2026: [successful workflow](https://github.com/Shreyaanp/AI-Builer-Cup-2026/actions/runs/38449869464). Independent HTTPS/mobile checks passed, including the real Google login handoff. The user confirmed actual Google sign-in and saved-chat recovery work. `target.json` defines fixed resources. `bootstrap.ps1` defaults to printing a plan; `-Apply` performs idempotent setup without billing activation or deployment and preserves existing environment protection.

The production GitHub environment contains the WIF provider and Firebase app ID as variables and the dedicated Firebase browser key as a secret. No service-account JSON key is required. The browser key is public runtime configuration restricted to Firebase Auth APIs and expected referrers; it is separate from private Gemini keys. Generated runtime configuration is ignored and removed after release.

Production is restricted to the `main` branch. Releases check required setting names before building an image; missing values fail without printing credentials. Pull-request CI uses offline fixtures/emulators and needs no production secrets or GCP login. Gemini keys are not required for this pipeline; Vertex access comes from the runtime identity.

## Runtime and cost boundaries

- Zero minimum instances, maximum ten instances, startup CPU boost, request-based CPU, concurrency sixteen, 1 GiB RAM and a 180-second Cloud Run timeout. Application text/voice deadlines are shorter.
- Production uses `COACH_MODE=gemini` on **Vertex AI** (`gemini-3.5-flash-lite` text, `gemini-live-2.5-flash-native-audio` voice, `global` location). The runtime service account holds `roles/aiplatform.user`; no model key exists or is injected. Local and CI runs stay offline by default.
- V1 merchant records, proposals, face challenges and recall live in Firestore under `ogoogle_ai_v1/merchant`. Recall uses Vertex `gemini-embedding-2` (768-d) with a flat vector index on collection group `items`; each owner+business has its own collection.
- Owner photos are re-encoded (EXIF/GPS removed), checked with Cloud Vision SafeSearch (adult ≥ possible, racy/violence ≥ likely are rejected) and by Gemini for business relevance. Only accepted photos are written to the private, public-access-prevented bucket `ichiropractic-shop-photos` (asia-south1); the runtime holds bucket-scoped object create/view only. Rejected photos are never stored.
- Cloud Run, image storage and Firestore can consume credits or incur charges. Existing eligible credits/free allowances are preferred. Resource limits do **not** enforce a ₹500 monetary cap. No billing activation or budget changes are part of setup.
- Shared Firebase Auth/default Firestore are retained. App namespace and identity separate usage; datastore IAM remains project-scoped. A sign-in token does not grant merchant publishing authority.

## Rollback and verification

To roll back, manually release a known-good full main SHA. Checks still run; its code supplies configuration while GitHub environment settings remain current. Keep required image versions. Inspect revisions with `gcloud run revisions list --service=ogoogle-ai --project=ichiropractic --region=asia-south1`.

After the first successful deployment, complete a real Google login, send a fictional note, reload, resume the saved conversation, then sign out and confirm private history disappears. Emulator/token-mock tests do not establish this human OAuth result. WebSocket Live has a backend adapter; microphone/playback UI and actual provider speech remain future work.
