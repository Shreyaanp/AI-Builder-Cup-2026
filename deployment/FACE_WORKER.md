# Private face worker handoff

Implementation is prepared locally. No cloud resources, IAM, secrets or deployments were changed.

## Worker and release configuration

`backend/face_worker.py` accepts an owner-scoped bearer-authenticated `POST /evaluate`
with up to 8 MiB of WebM/MP4, at most 8.2 seconds / 480 frames, dimensions 100–1280
by 100–720. It samples about twice per second, requires one face, aligns landmarks,
checks prompted head movement and computes a 256-dimensional candidate template.
`DELETE /template` deletes that owner's local template. Raw captures stay in memory.

The image fetches FP32 Open Model Zoo detection, landmarks, head-pose and
reidentification models plus `anti-spoof-mn3.onnx` from publisher release `2023.3.0`.
Publisher size/SHA-384 checks, manifests and licenses are retained; startup checks
the receipts again. The pinned release and Linux Python 3.13 face wheels still need
an actual image build to validate. No model downloads occurred during this task.

Release steps in `deploy.yml` run after main image publication and before main
deployment, using the existing WIF/deployer. `ogoogle-face` is private, asia-south1,
1 CPU, 2 GiB, request-based billing, min 0, max 2, concurrency 1, timeout 60 seconds.
2 GiB is an initial allocation, not measured peak memory. One process serializes
inference; OpenVINO/ONNX thread counts are bounded. Required-model startup fails
closed. The main capture request allows 70 seconds for cold startup and inference.

`FACE_WORKER_URL` is discovered from Cloud Run and passed by `runtime-config.py`.
`FACE_WORKER_TOKEN` is mounted directly through `--update-secrets`, never copied
into the generated JSON or GitHub secrets. Both services use secret version **1**.
Rotation requires changing both references together. Main sends its Google ID token
with the worker URL audience in `X-Serverless-Authorization`; the existing shared
bearer stays in `Authorization`. Only the main runtime needs worker invocation rights.

## One-time lead operations (not executed)

Use the existing project/billing configuration. Do not enable billing or modify budgets.
Run these as a lead with permission to provision IAM and Secret Manager resources:

```sh
gcloud iam service-accounts create ogoogle-face-runtime --project=ichiropractic \
  --display-name="oGoogle private face worker"
gcloud secrets create ogoogle-face-token --project=ichiropractic \
  --replication-policy=automatic
# Lead supplies a new random bearer via an approved protected local file, not a shell literal.
gcloud secrets versions add ogoogle-face-token --project=ichiropractic \
  --data-file=/path/to/protected-token-file
# Confirm this first version is version 1; update both workflow references if it is not.
gcloud secrets add-iam-policy-binding ogoogle-face-token --project=ichiropractic \
  --member=serviceAccount:ogoogle-face-runtime@ichiropractic.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding ogoogle-face-token --project=ichiropractic \
  --member=serviceAccount:ogoogle-runtime@ichiropractic.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
gcloud iam service-accounts add-iam-policy-binding \
  ogoogle-face-runtime@ichiropractic.iam.gserviceaccount.com --project=ichiropractic \
  --member=serviceAccount:ogoogle-deployer@ichiropractic.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountUser
```

Existing deployer needs Artifact Registry writer on `ogoogle-ai`, Cloud Run deployment
rights (`roles/run.admin`, including private-service IAM policy changes), and its
existing `iam.serviceAccountUser` on the main runtime. Existing WIF remains unchanged;
no account key or new federation provider is needed. The worker runtime requires no
Vertex, Firestore, bucket or project-wide administrative role.

After the lead's first release creates `ogoogle-face`, grant **service-scoped** invocation
before exercising a production scan (or pre-create the private worker from the built
image, grant this binding, then release main):

```sh
gcloud run services add-iam-policy-binding ogoogle-face --project=ichiropractic \
  --region=asia-south1 \
  --member=serviceAccount:ogoogle-runtime@ichiropractic.iam.gserviceaccount.com \
  --role=roles/run.invoker
```

Ensure the worker has no `allUsers`/`allAuthenticatedUsers` invoker binding and no
other invoking principals. `--no-allow-unauthenticated` alone is not an audit of
pre-existing IAM. The workflow intentionally does not create these bindings.

## Offline tests and local container check

CI pytest substitutes inference and ID tokens; it never downloads models or contacts
Google. It covers authentication, owner isolation, enrollment/deletion, byte limits,
upload disconnect cleanup, required-model startup and both authentication headers.
Runtime-config tests require the worker URL and keep the token out of generated JSON.
This is not accuracy evidence.

Local verification: **153 pytest passed, 23 skipped** (Firestore emulator unavailable),
Ruff lint/format, mypy (26 app files), actionlint (both workflows) and `git diff --check`
passed. Tests used an existing local Python environment; a fresh locked offline sync
failed because required wheels were not cached. `npm run check` stopped at missing
ESLint because this checkout has no node_modules. Docker is not installed, so image
build, container smoke and real model execution remain unvalidated.

On a lead machine with Docker, build the real image (build-time publisher/dependency
downloads require network), then run it with a public synthetic fixture credential:

```sh
docker build --platform linux/amd64 -f backend/face.Dockerfile -t ogoogle-face-local .
docker run -d --name ogoogle-face-local -p 127.0.0.1:3401:8080 --memory=2g --cpus=1 \
  -e FACE_REQUIRE_MODELS=true -e FACE_WORKER_TOKEN=local-smoke-fixture-only ogoogle-face-local
# Wait for startup; then, from backend:
uv run --locked python scripts/face_worker_smoke.py
# Optional consented, fictional test capture following turn_left then turn_right:
uv run --locked python scripts/face_worker_smoke.py --capture /path/to/test.webm
docker stats --no-stream ogoogle-face-local
docker rm -f ogoogle-face-local
```

The generated sample image must yield `capture_not_usable`; model readiness must be
true. A usable challenge yields `calibration_required` or `challenge_not_completed`,
never automatic identity verification. The container test was not run here: Docker
and models are absent, and external downloads are prohibited by the task.

## Cost and open risks

Planning example: 1,000 scans/month × 30 billable seconds × 1 CPU / 2 GiB gives
30,000 vCPU-seconds, 60,000 GiB-seconds and about 2,000 evaluate/delete requests,
before cold starts. Against the commonly published request-based monthly allowance
of 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests, this fits unused
allowances: expected **US$0 incremental worker compute** at that demo volume.
Allowances are shared with main and other services; regional pricing, startup boost,
artifact storage, builds, egress and Secret Manager can add cost. Rates and remaining
allowances were not checked online because external contact was forbidden. The lead
must confirm current [Cloud Run pricing](https://cloud.google.com/run/pricing) and
[Secret Manager pricing](https://cloud.google.com/secret-manager/pricing). Min 0 and
max 2 do not enforce the existing ₹500 total cash ceiling.

**Local Qdrant is ephemeral and per instance.** Templates disappear on replacement
and matching/deletion across two instances is not reliable. A deletion on one instance
cannot guarantee deletion on another. This packaging does not add durable biometric
storage or claim reliable cross-instance template recovery; that requires an approved
shared-store/retention design before real biometric enrollment. Neither an image build
nor this worker makes liveness scores calibrated. Memory, cold-start latency, real
video inference and the Cloud Run IAM/header path remain unvalidated.
