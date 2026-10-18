# Cost: Places caching and Gemini context caching

Two changes, each behind a switch:

| Switch                 | Default | What it does                                                                    |
| ---------------------- | ------- | ------------------------------------------------------------------------------- |
| `PLACES_CACHE`         | on      | Places search/details results shared by every Cloud Run instance (Firestore)    |
| `GEMINI_CONTEXT_CACHE` | **off** | Coach rules + tool schemas in one shared Vertex context cache (text coach only) |

## Places

### Calls and field masks

Every Places (New) call is in [discover.py](../../backend/app/discover.py) (`MapsService`), plus
photo media in [place_photos.py](../../backend/app/place_photos.py):

| Call                              | Used by                     | Field mask (SKU)                                                                                       |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Nearby / Text Search              | Discover list, customer Ask | `PLACES_MASK`: everything the cards show (Enterprise: rating, open now, price)                         |
| Text Search "metro train station" | Ask "near the MRT" anchor   | `STATION_MASK`: id, name, location, type (**Pro**, was Enterprise)                                     |
| Place Details by id               | Pins for grounded answers   | `DETAILS_MASK`: id, name, location, open now, rating, Maps link (no photos, price, review count, type) |
| Photo media                       | Card photos                 | unchanged (no field mask; 60 s memory only, see terms below)                                           |

The search mask was already limited to displayed fields: every field in it is shown (rating
line, open/closed, budget filter, Maps link, photo). The station anchor and the pins asked for
the full card mask; they now ask only for what they use.

### Cache layers

1. **Per-instance memory** (existing): 10 minutes, 256 entries, single-flight.
2. **Shared Firestore** (new, `PLACES_CACHE`): `<namespace>/places/places_cache/<sha256>`,
   30 minutes (`PLACES_CACHE_TTL_SECONDS`, capped at 1 hour). Keyed by the same key as memory:
   area rounded to ~110 m, radius, query, category and field mask for searches; place id for
   details. Document ids are hashes, so no query text or position is readable. Expired entries
   are never served (checked on read) and Firestore deletes them through a TTL policy:

   ```sh
   gcloud firestore fields ttls update expires_at --collection-group=places_cache --enable-ttl \
     --project=PROJECT_ID --database=DATABASE_ID
   ```

Errors, `None` details and offline demo data are never shared. A Firestore failure only costs
the Google call (logged `places_cache_unavailable`). Each lookup logs
`places_cache kind=places|place result=hit|miss layer=memory|shared`.

Only production (Firestore sessions) gets the shared layer; local SQLite runs keep memory only.

### Terms and TTL

Google Maps Platform Service Specific Terms (Places API): place ids may be stored
indefinitely; latitude/longitude may be cached for up to 30 consecutive days; other Places
content (names, ratings, opening state, photos) must not be stored beyond short-term caching.
I chose **30 minutes** (capped at 60 by validation): short-term, and short enough that "open
now" stays accurate around opening times. Photo media bytes stay in the 60 s per-instance
memory cache; photo resource names expire on Google's side, so they are not cached longer.

### Expected savings (list prices, first tier)

| SKU                           | Price / 1,000 | Free / month |
| ----------------------------- | ------------- | ------------ |
| Text/Nearby Search Enterprise | $35           | 1,000        |
| Text Search Pro               | $32           | 5,000        |
| Place Details Enterprise      | $20           | 1,000        |

- Every shared hit avoids one $0.035 search or $0.020 details call. A Firestore read +
  write costs about $0.0000024, so a hit pays for ~14,000 cache lookups.
- Repeats across instances or after the 10-minute memory window: the same neighbourhood
  default list (no query, nearest shops) is the most repeated request. At 1,000 searches a day
  with 30% shared hits, that is 300 × $0.035 ≈ **$10.50/day (~$315/month)** saved; at 50%,
  ~$525/month. The real hit rate shows in the `places_cache` logs after a day in production.
- Station anchor on Pro instead of Enterprise: $3 less per 1,000 and 5× the free calls.

## Gemini context caching (text coach)

### What is cached

The coach sends the same ~10k-token prefix on every model call: the coach rules (15.5k
characters) and ~30 tool schemas. With `GEMINI_CONTEXT_CACHE=true`,
[context_cache.py](../../backend/app/context_cache.py) (`CachedGemini`) keeps that prefix in
**one** Vertex cache shared by every shop (onboarding turns also cache the new-shop rules) and
sends each call with `cached_content`. Only this turn's part (reply language, region, shop
snapshot, new-shop draft) goes with the conversation, as the first message labelled as app
context.

Not cached: **Live voice** (separate model, untouched), and the customer-ask / customer-answer
calls: their prompts are ~600 tokens, under Vertex's explicit-cache minimum (4,096 tokens for
Gemini 3, 2,048 for 2.5), so a cache cannot be created for them.

### Why it cannot break the coach

- The agent, its instruction text and its tools are unchanged; the split happens on the
  outgoing request copy. Switch off = byte-for-byte the old request.
- Cache key = sha256 of `CACHE_VERSION`, model, cached text, tool schemas and tool config, so any
  prompt or tool change creates a new cache instead of reusing a stale one.
- TTL 1 hour (`GEMINI_CONTEXT_CACHE_TTL_SECONDS`), refreshed 2 minutes before expiry. A cache in
  its last 30 seconds is never sent.
- The cache is created **in the background**: the call that finds no cache goes out normally,
  so no owner waits for creation (creating one added ~4 s in the A/B).
- **Any** error falls back to the ordinary request: a failed create (retried after 5 minutes),
  or a rejected cached request (expired, deleted, refused) before any words streamed. After a
  rejected cached request, caching pauses 5 minutes for that prefix, so a refused cache is not
  recreated and paid for on every turn.
- Below the token floor, with the API-key backend, offline, or with ADK's older
  `CONTEXT_CACHE_ENABLED` on, it does nothing.

Logs: `context_cache result=hit|miss|created|skipped`, `context_cache_unavailable`,
`context_cache_fallback`.

### Equivalence

Offline fixture ([test_context_cache.py](../../backend/tests/test_context_cache.py)): the real
coach agent through `CoachRuntime` with a scripted Vertex stand-in. Cache on and off produce the
same tool calls, the same cards and events; the cached prefix is exactly `INSTRUCTION` + the
same tools; the conversation is identical after the turn context; create errors and rejected
cached requests produce the same turns as cache off.

Live A/B ([cost-cache-ab.json](cost-cache-ab.json), `scripts/context_cache_ab.py`, 18 Oct, 8
model calls + 1 cache create, `gemini-3.5-flash` on Vertex, cache deleted afterwards):

| Owner says         | Tool calls, cache off             | Tool calls, cache on              |
| ------------------ | --------------------------------- | --------------------------------- |
| Share my page      | `open_screen({"screen":"share"})` | `open_screen({"screen":"share"})` |
| What are my hours? | `get_business_context({})`        | `get_business_context({})`        |

Replies differed only in wording (temperature 0.1); both were correct.

| Tokens over 4 calls (usage metadata) | Cache off                             | Cache on           |
| ------------------------------------ | ------------------------------------- | ------------------ |
| Prompt tokens                        | 41,854                                | 41,801             |
| Of which cached                      | 19,338 (46%, Vertex implicit caching) | 39,840 (95%)       |
| Output (incl. thinking)              | 486                                   | 411                |
| Input at full-rate equivalent        | 24,450                                | 5,945 (**−75.7%**) |

That run created the cache before the first call. The background creation added since means
the first call per instance per hour goes uncached; the fixture tests cover that path.

### Expected savings

Prices for `gemini-3.5-flash` on Vertex, from third-party trackers (verify against Google's
pricing page): input $1.50/M tokens, cached input $0.15/M (90% off), storage ~$1.00/M tokens
per hour.

- Per coach model call: off ≈ 5,630 uncached + 4,835 implicitly cached tokens ≈ **$0.0092**;
  on ≈ 490 uncached + 9,960 cached ≈ **$0.0022**. About **$0.0069 saved per call (−76% of input
  cost)**. Output is unchanged.
- Storage: one ~10k-token cache ≈ $0.01 per instance-hour, paid only while there is traffic
  (a cache is made only on a call). It pays for itself at ~2 coach calls per instance-hour.
- Example: 1,000 coach model calls a day (an owner turn is 1–3 calls) saves ~$6.90/day
  (~$207/month) on input, minus at most ~$0.24/day storage per always-on instance.

### Turning it on

Set `GEMINI_CONTEXT_CACHE=true` in the Cloud Run environment (for example in
`deployment/runtime-config.py`) and redeploy. Leave `CONTEXT_CACHE_ENABLED` (the older ADK
per-session path) off. Watch for `context_cache result=hit` and the absence of
`context_cache_fallback` in the logs; turn it off by removing the variable.

To measure again (paid, ≤10 calls):

```sh
cd backend
GOOGLE_CLOUD_PROJECT=ichiropractic CACHE_AB_OUT=../docs/impact/cost-cache-ab.json \
  uv run python -m scripts.context_cache_ab
```
