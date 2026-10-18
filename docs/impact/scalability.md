# Scalability evidence (18 October 2026)

Real numbers from production, measured cheaply: a 60-second load test on **non-AI endpoints
only**, plus the live Cloud Run settings and Cloud Monitoring instance counts. No Gemini, TTS,
Vision, Document AI or embedding call was made by the test.

## Cloud Run settings (from `gcloud run services describe`)

| Setting                  | `ogoogle-ai`                                        | `ogoogle-face`           |
| ------------------------ | --------------------------------------------------- | ------------------------ |
| Min / max instances      | 1 / 10 (service cap; revision template allows 20)   | 0 / 1                    |
| Concurrency per instance | 40                                                  | 1                        |
| CPU / memory             | 1 vCPU / 2 GiB, CPU always allocated, startup boost | 1 vCPU / 2 GiB           |
| Request timeout          | 3600 s                                              | 60 s                     |
| Session affinity         | on                                                  | off                      |
| Revision under test      | `ogoogle-ai-00079-pjc` (commit `36368f0b`)          | `ogoogle-face-00019-twt` |

Ceiling at these settings: 10 instances × 40 concurrent requests = **400 requests in flight**.
The customer domain sits behind an HTTPS load balancer with Cloud Armor policy
`chalkboard-armor`: **300 requests a minute per IP**, then 429.

## Load test

Script: [scripts/load-cloud.mjs](../../scripts/load-cloud.mjs) (Node, no dependencies; k6 is not
installed here). 50 virtual users loop over three endpoints with 100 ms think time:
`/api/v1/health`, a customer shop page (`/explore/s/<demo shop>`, the app HTML) and the hashed
app bundle (static JS). One more user calls the explore list (`/api/v1/discover`, Firestore plus
Google Places) every 2.5 s, under its per-IP limit of 30 a minute.

Not called on purpose: `/api/v1/public/shops/{id}` adds a page view to the owner's Today count
on every request, so a load test would corrupt a demo shop's numbers. Coach, voice, ask and photo
routes call models.

```powershell
node scripts/load-cloud.mjs --origin https://ogoogle-ai-5dnlvslisq-el.a.run.app --vus 50 --seconds 60 --out docs/impact/scalability-load-run.json
```

### Run 1: straight to Cloud Run (the `run.app` URL, no load balancer)

Raw: [scalability-load-run.json](scalability-load-run.json). Started 2026-10-17 23:58:10 UTC
(05:28 IST on 18 Oct), from one Windows laptop in India.

| Endpoint       |  Requests | Errors |     Req/s |  p50 ms |  p95 ms |  p99 ms | Max ms |
| -------------- | --------: | -----: | --------: | ------: | ------: | ------: | -----: |
| Health         |     3,135 |      0 |      51.7 |     107 |     354 |     557 |  1,588 |
| Shop page HTML |     3,137 |      0 |      51.7 |     160 |     460 |     703 |  1,582 |
| App bundle     |     3,141 |      0 |      51.8 |     236 |     739 |   1,043 |  1,674 |
| Explore list   |        15 |      0 |       0.2 |   3,879 |   5,394 |   5,394 |  5,395 |
| **Total**      | **9,428** |  **0** | **155.3** | **154** | **573** | **978** |  5,395 |

Cloud Monitoring, `run.googleapis.com/container/instance_count` for the revision: **2 active
instances before the test, 3 at 23:59, 4 at 00:00 UTC**. Cloud Run added instances by itself
while the test ran; the service served 7,559 successful requests in the busiest minute.

### Run 2: through the public domain (load balancer + Cloud Armor)

Raw: [scalability-load-edge.json](scalability-load-edge.json). Started 23:56:20 UTC, same
settings, `https://chalkboard.shreyaan.work`.

11,378 requests: **476 answered 200 and 10,902 got 429 from Cloud Armor** (p50 153 ms for both).
That is the per-IP rule working as designed: one client can't flood the service. It also means a
single machine cannot measure capacity through the domain, so run 1 measures Cloud Run directly.

## What the numbers mean

- **The non-AI path is fast and elastic.** 155 requests/s with zero errors, a 154 ms median and
  automatic scale-out from 2 to 4 instances, from one laptop. The test stayed well under the
  400-request ceiling; we did not try to find the breaking point.
- **The explore list is the slow path.** 3.9 s median under load (2.7 to 3.4 s when idle). It reads
  every shared shop from Firestore, filters by distance in Python, then calls Google Places. This
  is the first thing to fix before thousands of shops (see below).
- **AI paths are bounded on purpose.** At most 8 coach runs at once across all instances (a
  Firestore lease), 30 s per text turn and 150 s per voice session; the 18 Oct onboarding re-run
  hit one Vertex `429 RESOURCE_EXHAUSTED`, absorbed by the retry. Their throughput is set by Vertex
  quota, not by Cloud Run; this test does not measure them.

## Why it scales to N shops

1. **Stateless containers.** Sessions, run leases, rate-limit counters, stream replay and every
   shop record are in Firestore. Any instance can serve any request, so Cloud Run can add
   instances freely. Session affinity only keeps a voice WebSocket on one instance.
2. **Data is per shop.** Records are keyed by shop and owner; a new shop adds documents, not
   contention on shared ones. Embedding recall uses Firestore `find_nearest` scoped to one owner
   and business.
3. **Caching where it is safe.** Hashed static assets are cached for a year (`immutable`), so
   phones download the app once. Translations, Maps results (600 s, single-flight) and forecasts
   are cached per instance; playbooks are stored on the shop and refreshed weekly, not per request.
4. **Heavy analytics leave the request path.** Forecasts run in BigQuery `AI.FORECAST`; daily
   rollups are exported to BigQuery (the nightly Scheduler job is currently paused).
5. **Edge protection.** Cloud Armor caps each IP at 300 requests a minute; per-IP and per-user
   limits in the app guard every model call.

## Limits and next steps

- **Explore list is O(all shops).** Add a geohash (or Firestore geo query) so it reads only
  nearby shops, and cache the Places call per area. Until then it will slow down as shops grow.
- **The `run.app` URL bypasses Cloud Armor** (ingress `all`). Set ingress to internal and load
  balancer only once nothing depends on the direct URL.
- **One lease document** holds the global coach-run counter; it is a Firestore hotspot above a few
  writes a second.
- **Face worker** is one instance with in-memory templates; it does not scale horizontally.
- **Test scope:** one client, 60 s, closed loop, non-AI endpoints, warm instances (min 1). It
  does not measure cold starts, Firestore write load, model latency or a sustained day of traffic.
  The 16 Oct offline report is [load-test.md](load-test.md).
