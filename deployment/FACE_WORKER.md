# Private face worker handoff

Implementation is prepared locally. No cloud resources, IAM, secrets or deployments were changed.

## Worker and release configuration

`backend/face_worker.py` accepts an owner-scoped bearer-authenticated `POST /evaluate`
with up to 8 MiB of WebM/MP4, at most 8.2 seconds / 480 frames, dimensions 100–1280
by 100–720. It samples about twice per second, requires one face, aligns landmarks,
checks prompted head movement and an anti-spoof score, and returns a 256-dimensional
template only for a live capture (otherwise a typed retry reason). The worker stores
nothing: the main app seals each template (AES-256-GCM, `FACE_TEMPLATE_KEY`) in the shared
document store and compares there. `DELETE /template` is a no-op kept for older revisions.
Raw captures stay in memory.

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

## Releasing the worker and reading its logs

`scripts/ship.ps1` runs `scripts/ship-face.ps1` before it dispatches the main release. That
script hashes the committed worker inputs exactly as `deploy.yml` does (`inputs-<16 hex>`),
builds the image on Cloud Build only when that tag is missing, deploys with deploy.yml's account,
secret and limits, and routes traffic to the new revision. To try a worker without production
traffic, run `scripts/ship-face.ps1 -RevisionTag test` and point a tagged main revision at
`https://test---ogoogle-face-…` with `--update-env-vars FACE_WORKER_URL=…`.

A no-traffic revision pins Cloud Run traffic to whatever revision served at that moment, so
later deploys get 0% until traffic is moved. Both release paths now run
`gcloud run services update-traffic ogoogle-face --to-latest`. Check what actually serves with
`gcloud run services describe ogoogle-face --format='yaml(status.traffic)'`, not the template
image.

Every capture logs one structured line: `face_worker_verdict` in the worker, and
`face_evaluated` (with the worker's trace) in the main app. Fields: container, codec, size,
rotation, frames decoded and sampled, faces per sampled frame (`1` one face, `0` none,
`2` several, `s` too small), yaw/pitch range, the stage reached, the threshold that failed,
whether this was the first request after a cold start, and latency. They never include
images, templates or owner data.

```sh
gcloud logging read 'resource.labels.service_name="ogoogle-face" AND jsonPayload.event="face_worker_verdict"' --project ichiropractic --limit 20
```

The real worker end to end in a browser (Chrome's fake camera plays a committed recording):
`FACE_WORKER_TOKEN=local npx playwright test tests/stories/s12-face-real-worker.spec.ts --project=phone --workers=1`.

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

**The worker is stateless.** Templates live sealed in the main app's shared store, so every
instance compares against one gallery and "Delete face data" removes the template, status and
review items in one place. A match only opens a human review; it never blocks or changes a
shop. Liveness scores are not calibrated on a real population.

Checked 2026-10-16 against the live `ogoogle-face`: an anonymous call is refused by Cloud Run
(403), and a call with a Google ID token passes Cloud Run IAM and reaches the worker, which
then requires its shared bearer (401). Both layers are in force. A full live `/evaluate` with
the shared bearer and a real capture was not run from a laptop (the bearer stays in Secret
Manager).
