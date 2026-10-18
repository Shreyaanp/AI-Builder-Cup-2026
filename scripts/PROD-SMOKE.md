# Production smoke check

`scripts/prod-smoke.mjs` drives the live site with Playwright (plain node, no test runner) on a
phone (390x844) and a desktop (1280x800) viewport. Each check prints `PASS` or `FAIL` with a
one-line reason. It exits 1 on any FAIL and finishes in under 3 minutes (checks still waiting
at the 3 minute mark are reported as FAIL, not skipped silently).

## What it checks

- Landing `/` loads with no page error and links to `/demo`; `/how-it-works`, `/features` and
  `/explore/` return 200 with no page error.
- Business front door shows "Continue with Google" and "Try demo".
- `/demo`: the Coach, Shop, Grow and You tabs can be tapped; Take the tour, Next three times, and
  step 4 shows the order (not "Couldn't load the demo order").
- `/demo`: every Today, Shop and Grow button (the list from `vaudit.mjs`) opens something with no
  error alert, dialog or page error.
- Customer: `/explore/demo` opens, and a demo shop page shows its stamp card.
- The voice websocket `wss://business.chalkboard.shreyaan.work/api/v1/voice` opens.
- No 5xx response anywhere (a 429 on `/api/v1/demo/workspace` is counted too, because it stops
  the demo opening).

## Run it

Needs `playwright` (already in `node_modules` after `npm ci`; run `npx playwright install chromium` once).

```bash
# production (default URLs)
node scripts/prod-smoke.mjs

# customer URL, business URL
node scripts/prod-smoke.mjs https://chalkboard.shreyaan.work https://business.chalkboard.shreyaan.work

# a tagged revision that has no traffic yet: one URL serves both apps
node scripts/prod-smoke.mjs https://candidate---ogoogle-ai-176787245026.asia-south1.run.app
```

`SMOKE_CUSTOMER_URL` and `SMOKE_BUSINESS_URL` work as environment variables too.

Do not run it in a loop. The demo workspace endpoint is rate limited; many runs in a row get a 429
and the demo checks then fail with "demo could not open". Wait a few minutes and run again.

## Deploy order

Project `ichiropractic`, service `ogoogle-ai`, region `asia-south1`. Session affinity stays on
(it is set on the live service; the flag below keeps it from being dropped).

1. Build and push the image (CI does this on every merge to main; the image tag is the commit SHA).

   ```bash
   SHA=$(git rev-parse HEAD)
   IMAGE=asia-south1-docker.pkg.dev/ichiropractic/ogoogle-ai/app:$SHA
   docker build -t "$IMAGE" . && docker push "$IMAGE"
   ```

2. Deploy it with no traffic and the tag `candidate`. Add the tag URL to `ALLOWED_ORIGINS`,
   otherwise the voice websocket and API calls from the tag URL are refused (the origin check
   only knows the live hosts). Set it again to the usual value on the next normal deploy.

   ```bash
   gcloud run deploy ogoogle-ai --project=ichiropractic --region=asia-south1 \
     --image="$IMAGE" --no-traffic --tag=candidate --session-affinity \
     --update-env-vars='^|^ALLOWED_ORIGINS=["https://ogoogle-ai-176787245026.asia-south1.run.app","https://chalkboard.shreyaan.work","https://business.chalkboard.shreyaan.work","https://candidate---ogoogle-ai-176787245026.asia-south1.run.app"]' \
     --quiet
   ```

   All other settings (service account, secrets, other env vars, cpu boost) carry over from the
   current revision. If the CI deploy flags in `.github/workflows/deploy.yml` change, copy them here.

3. Run the smoke on the tag URL.

   ```bash
   TAG_URL=$(gcloud run services describe ogoogle-ai --project=ichiropractic --region=asia-south1 \
     --format='value(status.traffic[].url)' | tr ';' '\n' | grep candidate---)
   node scripts/prod-smoke.mjs "$TAG_URL"
   ```

4. Only if it exits 0, move traffic.

   ```bash
   gcloud run services update-traffic ogoogle-ai --project=ichiropractic --region=asia-south1 \
     --to-tags=candidate=100
   ```

   Roll back with `--to-revisions=<previous-revision>=100`. Remove the tag afterwards with
   `gcloud run services update-traffic ogoogle-ai --project=ichiropractic --region=asia-south1 --remove-tags=candidate`.

5. Run `node scripts/prod-smoke.mjs` once more on the real hosts.
