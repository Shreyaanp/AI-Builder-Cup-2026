# Tagged releases

Prepared 16 October 2026. No deployment, cloud inspection, IAM/billing change or publication
was performed for this change. Commands below are for the assistant after review and authorization.

## Before release

- Merge the reviewed change to main; fetch main and tags in the assistant's checkout. Finish all
  edits before tagging. Never move a published release tag.
- Run `npm run check`. In `backend`, run `uv run --locked ruff check app tests scripts server.py
run.py face_worker.py`, the matching `ruff format --check`, `uv run --locked mypy` and
  `uv run --locked pytest -q` with an explicitly local Firestore emulator. Check the exact
  SHA's successful GitHub checks, including browser shards, contract drift and container smoke.
- Review `deployment/runtime-config.py`: this is the runtime source for **both** entry points.
  For example, `FORECAST_BACKEND=bigquery` and `GOOGLE_TEXT_MODEL=gemini-3.5-flash` are
  versioned there. A feature change must reach this file or its explicit CI variable.
- Required production setting names: `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_APP_ID`,
  `GCP_IDENTITY_PROVIDER`. CI discovers `FACE_WORKER_URL` without reading its token.
  Keep existing Secret Manager references; never dump environment files, credentials,
  complete service descriptions or tokens into logs. Generated runtime JSON is ignored and
  removed by CI even on failure. Do not use PowerShell transcription or shell tracing.
- Review [capacity](architecture.md#capacity-and-cost) separately. The release workflow
  preserves service capacity instead of silently applying the former CI overrides.
- Check public assets: `/assets/*` uses one year immutable caching; HTML/API/auth/bootstrap
  default to `no-store`. GCS objects stay private. Gallery delivery checks shop sharing;
  public photos retain their existing one-day cache (withdrawal is not immediate).

## Run and verify

In a clean main checkout, the assistant creates and publishes a release tag, then invokes the script:

```powershell
git switch main
git pull --ff-only
git tag -a release-2026-10-17-01 -m 'Judging release'
git push origin release-2026-10-17-01
powershell -File scripts/ship.ps1 -Tag release-2026-10-17-01
gh run list --workflow deploy.yml --limit 5
gh run watch <run-id> --exit-status
```

`ship.ps1` now validates clean tracked **and untracked** files, HEAD/tag equality, main
ancestry and the published tag, then dispatches `deploy.yml`. It deliberately no longer
has `-SkipChecks` or its own Cloud Build/deploy implementation. Direct workflow dispatch
also requires the exact tag. CI checks that SHA, checks out that commit, builds its image,
applies the full runtime config, preserves named secret references and runs the shared
hosting smoke. Health must be HTTP 200 with `status=ok` and `release_commit` equal to the
selected SHA. Frontend and unauthenticated stream rejection are checked too.

A queued workflow is not a successful release. Inspect the completed run, then check the
two public custom domains, real Google sign-in, saved conversation recovery and a complete
owner/customer story manually. CI smoke does not call a model or prove live voice accuracy.
Failed post-deploy smoke does not automatically roll back traffic.

Rollback: dispatch the same workflow with a known-good **tagged** main SHA and its original
tag. Check runtime/config compatibility first. Do not retag or silently reuse a tag.

## Feature cutoff switch

`FEATURE_GOOGLE_GUIDE=true|false` controls the Google guide entry. Locally set it in the
server process and restart; do not put it in browser preference storage. In production,
The assistant sets the production GitHub environment variable, then releases through the same path:

```powershell
gh variable set FEATURE_GOOGLE_GUIDE --env production --body false
powershell -File scripts/ship.ps1 -Tag release-2026-10-17-01
```

Restore with `--body true` and release again. This creates a new revision of the tagged
code with the explicit environment override; record that value alongside the release SHA.
The default keeps the current guide visible. Invalid environment values fail configuration.
The server emits only typed public flags in bootstrap; missing/malformed client values hide
the entry. The client does not mount the hidden screen and falls back to Coach for an
already selected hidden entry. Existing identity and business permissions remain required.
This guide only hands off to Google's own pages; the flag grants no publishing connection.

For another unfinished feature, add a boolean to `FeatureFlags` and `Settings`, emit it in
bootstrap, wire the runtime setting, regenerate contracts, and guard **every** UI entry and
mount. Guard server endpoints too if disabling execution is required: visibility is not an
authorization boundary. Do not mistake an existing provider-mode switch for a UI cutoff.

## Optional static CDN (prepared, not enabled)

Use a **dedicated existing Firebase Hosting site** in `ichiropractic`, never another app's
site. The assistant must confirm the free allowance, remaining credits and existing deployer
Hosting permissions first. No new IAM or billing is authorized here. Firebase CLI
14.22.0 is pinned for reproducibility; its compatibility with this project's WIF remains
unvalidated until the first authorized release.

Set production variable `CDN_HOSTING_SITE` to that site's ID:

```powershell
gh variable set CDN_HOSTING_SITE --env production --body <dedicated-site-id>
powershell -File scripts/ship.ps1 -Tag release-2026-10-17-01
```

CI builds Vite with `https://<site-id>.web.app/` as its asset base, extracts `/app/frontend/assets`
from that **exact image**, and deploys them using `deployment/firebase.assets.json` before
switching Cloud Run. Hosting serves JS/CSS/fonts/imported images from its CDN with immutable
headers and anonymous CORS (needed for fonts/modules). It does not host credentials, merchant
records, HTML, API, SSE or WebSockets. HTML remains on the app origin with `no-store`.
Unhashed files copied from `public/` retain the app origin and its conservative cache policy.
The wildcard CORS header applies only to public static assets.

Verify a browser's asset requests use the site origin, font CORS and lazy chunks work, and
responses have immutable headers. Preserve previous hashed assets when planning uninterrupted
old-tab support: this minimal deployment replaces the active Hosting file set, so a tab from
the previous release may need reload to load an old lazy chunk. Deployment order can also
briefly affect old tabs. Remove `CDN_HOSTING_SITE` and re-release to return to origin assets;
do not delete shared Hosting resources. This branch does not establish a live CDN hit rate,
bandwidth bill or improved Core Web Vitals.

## Judging-window warm instance (the assistant only)

First inspect the selected capacity fields using the commands in `architecture.md`. At the
approved Saturday window, then after judging, respectively:

```powershell
gcloud run services update ogoogle-ai --project ichiropractic --region asia-south1 --min=1 --min-instances=0 --quiet
gcloud run services update ogoogle-ai --project ichiropractic --region asia-south1 --min=0 --min-instances=0 --quiet
```

These use one service-level warm instance and clear the revision-level minimum. Verify both
settings; a service-level minimum can keep instances warm even when the revision minimum is
zero. Record the old values before changes.
Use request-based billing unless separately approved; warming can consume credits/cash.
The existing alert is a notification, not an enforced ₹500 cap. Budget setup stays paused.

## CI and local evidence

CI already caches npm by lockfile and uv by `backend/uv.lock`; those caches are retained.
Browser cache now keys OS, architecture and Playwright version; Linux system dependencies
still install every runner, browser downloads only on a miss. Both devices keep three shards,
all tests and existing retry/worker settings. `fullyParallel` shards isolated tests rather
than whole files, reducing story-file skew; no wall-time saving is claimed without CI runs.
See [load evidence](impact/load-test.md) and [verification record](impact/devops-verification.md)
for observed results and unvalidated items. No physical-phone validation is claimed.
