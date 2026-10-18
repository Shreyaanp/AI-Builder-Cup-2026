# Rate limit storage and TTL

Rate counters use the merchant backend selection: memory for local SQLite, Firestore
for shared storage (always Firestore in production). Firestore counters live under
`<namespace>/limits/rate_limits/<hashed-key>` and use atomic fixed windows aligned
to Unix time; daily windows reset at midnight UTC. `Retry-After` is the remaining
window duration. Owner requests fail open with a redacted log on store failure;
public ask, inquiry and bootstrap requests fail closed.

For a future authorized deployment, enable expiry for the `rate_limits` collection
group with this command (replace the project/database placeholders):

```sh
gcloud firestore fields ttls update expires_at --collection-group=rate_limits --enable-ttl --project=PROJECT_ID --database=DATABASE_ID
```

This command is documentation only; no TTL policy or cloud resources were changed.
TTL deletion is asynchronous; correctness uses the window key, not deletion timing.
IP quotas use the first `X-Forwarded-For` entry, falling back to the connection IP.
The deployment must preserve its trusted proxy header handling.

Limits are centralized in `backend/app/limits.py`. JSON requests are capped at
64 KiB including chunked bodies; photo uploads retain their existing separate cap.
Coach text retains its stricter existing 2,000-character validation, below the
requested 4,000-character ceiling. SSE resumes do not consume another text quota.
Voice uses WebSocket `RATE_LIMITED` error frames and closes with code 1008 because
its existing protocol authenticates after accepting the WebSocket; HTTP routes
return 429 with `detail: "RATE_LIMITED"` and `Retry-After`.

# Places cache TTL

With `PLACES_CACHE` on (default), Places results are shared across instances under
`<namespace>/places/places_cache/<hash>` for 30 minutes (see `docs/impact/cost.md`). Reads ignore
expired entries; enable deletion with (documentation only, placeholders as above):

```sh
gcloud firestore fields ttls update expires_at --collection-group=places_cache --enable-ttl --project=PROJECT_ID --database=DATABASE_ID
```
