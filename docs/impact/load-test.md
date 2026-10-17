# Local load evidence — 16 October 2026

Only `http://127.0.0.1:3398` was tested. No production, cloud API, paid model, external
database or external load generator was contacted. k6 and Locust were unavailable locally;
installing them would require external access, which this task prohibits. The observed run
uses the existing Python/httpx dependency. A k6 workload is prepared but **not executed**.

## Reproduce offline

In `backend`, start a fresh, isolated fixture, then run the driver in another terminal:

```powershell
$env:UV_OFFLINE='true'
uv run --locked python -m scripts.load_fixture
```

```powershell
$env:UV_OFFLINE='true'
uv run --locked python -m scripts.load_local
```

Stop the fixture with Ctrl+C afterwards. It binds only loopback, creates ten explicitly
fictional shared shops in temporary SQLite, uses in-memory ADK sessions and local lexical
recall, and deletes its temporary data on clean shutdown. Both drivers require health to
report `local-load-fixture`, local identity and offline coaching. The Python driver ignores
proxy environment settings and refuses redirects. It exits nonzero on any failed response,
missing reply, error event or incomplete stream; HTTP 200 alone is insufficient.

When k6 is already available, run from the repository root instead of the Python driver:

```powershell
# Prevent a proxy from forwarding even loopback requests outside the machine.
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
k6 run scripts/load-local.js --summary-export=artifacts/k6-local.json
```

Do not change the hardcoded target to a public URL. The k6 script preserves each virtual
user's local bootstrap cookie and owned session across iterations. Both workloads use
16 readers alternating public shop and discovery GETs, four sequential coach users,
100ms think time and a 30-second closed-loop run. Rate limits are disabled **only** in this
fixture so readers on one IP can exercise the application; run/replay capacity caps remain.

## Observed results

Windows 11, Python 3.13.16, one Uvicorn worker, no network/CPU throttling. Other local
verification processes shared the machine. These are individual samples, not a calibrated
benchmark or repeatable latency improvement claim. Percentiles use the sorted sample
at `floor((n - 1) * .95)`; coach latency measures the whole SSE response, not first token.

| Endpoint             | Requests | Failures | Mean ms | p95 ms |   Max ms |
| -------------------- | -------: | -------: | ------: | -----: | -------: |
| Public shop          |    1,347 |        0 |   37.04 | 110.08 |   236.77 |
| Discovery            |    1,338 |        0 |  111.11 | 215.77 |   389.03 |
| Offline coach stream |      157 |        0 |  660.09 | 872.04 | 1,102.04 |

Total: **2,842 requests / 30.56 seconds = 92.99 requests/s**, zero failed assertions,
driver exit 0. Raw data: [load-test.json](load-test.json).

The initial diagnosed run had 15 failed coach turns out of 161, despite HTTP 200. Concurrent
Qdrant local operations produced SQLite `InterfaceError`/`OperationalError`; a separate
eight-thread regression reproduced mutable-array `IndexError`. Access to that shared local
client is now serialized, including search, writes, deletion and close. The regression failed
before the fix and passed after it. The production Firestore adapter is unchanged.

## New-session pressure: expected admission failures

After the successful run, the same process retained four replay entries. Running
`uv run --locked python -m scripts.load_local --new-sessions` admitted 124 more sessions,
then returned 317 HTTP 429 responses when the **128-entry process replay cap** filled.
Readers completed 1,497 shop and 1,487 discovery requests without failures. All 124 admitted
coach streams completed; no provider-error events occurred. The driver correctly exited 1.
Raw data: [load-test-new-sessions.json](load-test-new-sessions.json).

The reported 113.47 requests/s includes fast 429 rejections and must **not** be presented as
successful coaching throughput. Finished replay entries remain for 120 seconds; fresh-session
bursts can hit this cap before eight simultaneous active runs. Capacity/backpressure and the
existing try-again UI need cloud validation before traffic expansion; there is no durable queue.

## Limits

This is ten synthetic shops, two read endpoints and a scripted coach, with no Firestore RPCs,
Vertex inference, embeddings API, ASR, CDN, GCS, external Maps, cold starts or autoscaling.
In-memory ADK sessions differ from durable production storage. The workload is closed-loop:
slower requests reduce arrival rate. A 30-second run does not establish sustained capacity,
30,000-user readiness, production latency, live model accuracy or a cost estimate. See
[architecture and proposed capacity](../architecture.md) before an authorized cloud trial.
