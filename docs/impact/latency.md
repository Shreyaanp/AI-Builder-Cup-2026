# Coach latency: instant path, context caching, Live region

16 Oct 2026, branch `feat/voice-everything`. Numbers below are measured; anything not measured
says so. No paid model calls were made for this report.

## What is measured now

Every coach turn records **time to first visible output** (first words, review card, chart or
action) and logs it as `coach_latency` with its flow:

| Flow | Measured from → to |
| --- | --- |
| `text_instant` | message received → instant answer (no model) |
| `text_agent` | message received → first streamed output from the coach model |
| `voice_first_audio` | the owner's last transcribed words → first reply audio sent to the phone |

`GET /api/v1/latency` returns p50/p95 over the last 500 turns per flow on that instance; Cloud
Logging keeps every sample (`jsonPayload.event="coach_latency"`).

## Before → after for common requests

**Before** (live Gemini `gemini-3.5-flash`, full turn, from the coach eval of 15 Oct,
`docs/impact/coach-eval-gemini-3.5-flash.json`): sold-out and price-change turns took
**2.7 s – 8.9 s** (Filipino sold out 2.68 s, Japanese sold out 3.67 s, Tamil price 7.5 s,
Malay items 8.87 s). Across all 26 scenarios: p50 4.7 s, p95 8.8 s (excluding the 84.7 s
multimodal outlier). These are full turns measured on a developer machine, so time to first
output is somewhat lower; the live bench below measures it directly.

**After** (instant path, `backend/scripts/latency_bench.py`, offline, 20 runs × 8 common
requests, server-side time to first output, includes the SQLite proposal write and the session
history write; `docs/impact/latency-offline.json`):

| Flow | n | p50 | p95 |
| --- | --- | --- | --- |
| Instant path (sold out, price, back, closed today, share page, messages, hours, how-to) | 160 | **14.8 ms** | **34.3 ms** |
| Same turns through ADK with the offline fixture model (ADK overhead only, no model time) | 160 | 36.2 ms | 55.6 ms |

So the common requests the instant path recognises go from seconds to well under the 100 ms
server-side target; the phone adds its own network round trip (one SSE request). On the client,
review cards are shown as soon as the proposal event arrives, and a prepared customer reply
shows "Sent" at once and rolls back if sending fails (optimistic UI).

What the instant path does not cover: other languages and scripts (Hindi, Tamil, Mandarin…),
messages over 200 characters, open questions, menu photos and new-shop onboarding. Those still
go to Gemini, as do Live voice sessions (the Live model answers audio directly; voice gets the
new tools, not the instant path).

## Context caching (Vertex)

Implemented behind `CONTEXT_CACHE_ENABLED` (default off). When on (Vertex backend only), the
text coach runs as an ADK `App` with `ContextCacheConfig` (TTL `CONTEXT_CACHE_TTL_SECONDS`,
default 30 min, refreshed every 20 invocations). The ~2.5k-token coach rules move to a static
instruction so the system instruction and tool schemas are identical every turn and can be
cached; the per-turn part (app language, shop snapshot, new-shop draft) is sent as content.
ADK creates, reuses and refreshes the cache and sends an ordinary request if caching fails.
Caching starts from a session's second turn and only when the prefix reaches the model minimum
(4,096 tokens for Gemini 3). Our rules are 9.5k characters (~2.4k tokens) and the 22 tool
schemas 16.9k characters (~4k tokens), so the cacheable prefix is roughly 6k tokens, above the
minimum. The gain must still be measured, not assumed.

**Not measured yet** (it needs paid calls). To measure, with the owner's approval:

```
cd backend
COACH_EVAL_LIVE=1 GOOGLE_CLOUD_PROJECT=ichiropractic LATENCY_OUT=../docs/impact/latency-live.json \
  uv run python -m scripts.latency_bench
```

This runs the 8 common requests through Gemini without the instant path, and 4-turn
conversations with caching off and on (`conversation_cache_off` / `_on`, p50/p95). Turn it on in
production only if `_on` is faster; it changes only the text coach.

## Gemini Live region (voice)

Production runs Cloud Run in **asia-south1 (Mumbai)** but Gemini Live in **us-central1**
(`GOOGLE_LIVE_LOCATION`), because Live models are regional.

Availability (Vertex publisher model lookup, 16 Oct, read-only):

| Region | `gemini-3.8-live` |
| --- | --- |
| us-central1 | available (GA) |
| **asia-south1 (Mumbai)** | **available (GA)** |
| europe-west4 | available |
| asia-southeast1 (Singapore) | not found |
| asia-northeast1 (Tokyo) | not found |

Round trip from India (owner's laptop), same lightweight Vertex request, server time after the
TLS handshake, 8 samples each:

| Endpoint | Typical | Range |
| --- | --- | --- |
| us-central1 | ~1,570 ms | 1,531 – 1,619 ms |
| asia-south1 | ~170 ms | 96 – 342 ms |

The TCP connect itself is ~260 ms to every region (Google's edge is nearby); the difference is
the regional backend behind it. Cloud Run is already in asia-south1, so moving Live there should
remove a US round trip from every voice exchange (the Live session is a long-lived socket, so the
saving is mostly on connect and on each turn's server path; the per-turn gain needs measuring).

**Recommendation (not applied; production unchanged):** run one voice smoke test with
`GOOGLE_LIVE_LOCATION=asia-south1` on a preview revision, compare `voice_first_audio` p50/p95
from `/api/v1/latency` against the current revision, and switch if it holds (voice, tool calls,
Achernar voice all working).
