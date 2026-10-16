# Recommendations AI (Vertex AI Search for commerce)

Status as of 16 Oct 2026, ~13:45 IST. Paid from the INR 57,593 Recommendations AI trial
(Prediction + Training SKUs only).

## What is set up

| Piece | State | Where |
| --- | --- | --- |
| API `retail.googleapis.com` on `ichiropractic` | Enabled (was already on) | `gcloud services list --enabled` |
| Catalog `default_catalog` / `default_branch` | **479 products imported, 0 failures** from 94 shared shops (465 demo products, 14 real) | `backend/scripts/retail_sync.py` |
| "Similar items" model `similar_items` | **Not created: the API refuses it** (see below). Needs one console click | console link below |
| Serving config `similar_items_default` | Waits for the model (the API refuses a config for a missing model) | `retail_sync.py --train` |
| User events | Pipeline built, **off** (`RECS_EVENTS_ENABLED=false`) | `app/retail_recs.py`, `app/recs_routes.py` |
| Serving hook `similar_items(product_id)` | Built, **off** (`RECS_ENABLED=false`); returns `None` until the model serves | `app/retail_recs.py` |

Each product carries only what customers already see: stable ID (`<shop_id>--<hash of name+unit>`),
title, category (`<shop category> > <menu section>`), price and currency, availability, and the
attributes `shop_id`, `unit`, `demo` (`true`/`false`), `lat`, `lng` (4 decimals). No owner, phone,
stock count or private facts.

## Why the model is not training yet

`POST .../catalogs/default_catalog/models` with `type: "similar-items"` returns
`400 Unsupported model.optimizationObjective <x> for type similar-items` for every documented
objective (`ctr`, `cvr`, `revenue-per-order`) and also with no objective. Tried on v2, v2beta and
v2alpha, with and without filtering and tuning options. Google's docs list the objective as
"N/A" ("Relevance") and give no API example. The console's Create model flow is the documented
path for this type.

**Owner action (2 minutes, starts training):**

1. Open https://console.cloud.google.com/ai/retail/catalogs/default_catalog/models?project=ichiropractic
2. Create model → **Similar items** → name `Similar items`, model ID `similar_items`, enable
   filtering by tags/attributes → Create.
3. From `backend/`: `uv run python -m scripts.retail_sync --project ichiropractic --train` (re-imports
   the catalog and creates the serving config `similar_items_default`).

## Expected ready date

Training takes 2–5 days from creation. If the model is created on 16 Oct, it should serve around
**18–21 Oct**: before judging if it starts today. Each day of delay moves this by a day.

## How to check

```bash
cd backend
uv run python -m scripts.retail_sync --project ichiropractic --status   # products + model state
```

Or with gcloud:

```bash
T=$(gcloud auth print-access-token)
B=https://retail.googleapis.com/v2/projects/ichiropractic/locations/global/catalogs/default_catalog
curl -s -H "Authorization: Bearer $T" -H "X-Goog-User-Project: ichiropractic" "$B/models/similar_items"
```

Ready means `servingState: ACTIVE`. Console: Search for commerce → Models / Data → Catalog / Events.

## Events (real only)

| App action | Retail event | Sent when |
| --- | --- | --- |
| Customer opens a shop page | `category-page-view` (shop category) | shop is shared |
| Customer asks in Explore | `search` (query without emails/phone numbers, max 80 chars) | always |
| "Tell me when it's back" on an item | `add-to-cart` for that item | item exists on that shop |
| `item_open` (API ready, no item page in the UI yet) | `detail-page-view` | item exists |
| Follow a shop, ask the owner | not sent: shop-level, no item | — |
| Verified stamp | not sent: stamps are visits, not item purchases, so `purchase-complete` would need an invented product and revenue | — |

The visitor ID is a SHA-256 of the app's existing anonymous device ID; the raw ID never leaves the
server. The server checks the shop and item really exist, rate-limits per IP (60/min, 600/day),
batches 50 events or 30 s, flushes on shutdown, and drops a failed batch instead of retrying it.
Nothing is backfilled or generated.

## Turning it on

Production env (Cloud Run): `RECS_EVENTS_ENABLED=true` once the deployment is ready to send events;
`RECS_ENABLED=true` once the model serves. The runtime service account needs
`roles/retail.editor` (events import + predict). With either switch off, or any API error, the
app behaves exactly as before and search uses embeddings.
