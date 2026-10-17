# Handoff: Recommendations AI (branch `feat/recs-ai`)

Brief: `docs/briefs/task-RECS-AI.md`. Details and status: `docs/impact/recommendations-ai.md`.

## Done

- `backend/app/retail_recs.py`: REST client (default credentials, no new dependency), catalog shaping,
  privacy (hashed visitor ID, query scrubbing), event mapping, `EventPipeline` (batched, drop on
  error), `Recommender` and the module hook `similar_items(product_id, visitor="", page_size=6)`.
- `backend/app/recs_routes.py`: `POST /api/v1/public/recs/events` (anonymous, rate limited, 202).
  Refuses shops that are not shared and items not on the shop's menu.
- `backend/scripts/retail_sync.py`: `--dry-run`, real import, `--prune`, `--train`, `--status`.
- Settings `RECS_ENABLED` (serving) and `RECS_EVENTS_ENABLED` (events), both default off.
- Frontend: `src/features/recs/events.ts` (fire-and-forget; stops for the session when the server
  says `enabled: false`), called on shop open, Explore ask and back-in-stock reminder. No visible UI.
- **Real sync run:** 479 products from 94 shared shops imported into `default_catalog`, 0 failures.
- Tests: `backend/tests/test_retail_recs.py` (15: sync shaping, batching, event mapping, privacy,
  fallback, switch, route), `tests/recs-events.spec.ts` (3 × phone/desktop).

## Not done / blocked

- **"Similar items" model is not created.** The Retail API rejects `similar-items` with every
  objective and without one (exact error in the impact doc). The owner needs to create it once in
  the console (steps in `docs/impact/recommendations-ai.md`), then run
  `uv run python -m scripts.retail_sync --project ichiropractic --train` for the serving config.
  Training (2–5 days) starts only then.
- Runtime service account `ogoogle-runtime` has no Retail role. Grant `roles/retail.editor` before
  turning either switch on in production. Not done here: it is an IAM change nobody asked for.
- Production env vars are not set (`deployment/runtime-config.py` untouched; DevOps owns it).
- No purchase-complete events: stamps are visits, not item purchases. Follow and ask-owner are
  shop-level, so they are not sent either (Retail needs a product for add-to-cart).

## For the search engine (feat/search-engine)

```python
from app.retail_recs import product_id, similar_items

ids = similar_items(product_id(shop_id, name, unit), visitor=device_id)
if ids is None:
    ...  # embeddings path (switch off, model not serving, or any error)
```

Returned IDs are `<shop_id>--<hash>`; split on `--` for the shop, or match against
`product_id(...)` of candidate items. Readiness is cached for 10 minutes; the call is synchronous
(run it in a thread from async code).

## Keep the catalog fresh

Rerun `uv run python -m scripts.retail_sync --project ichiropractic --prune` after big menu or demo
world changes (and before judging). It is incremental and safe to repeat.
