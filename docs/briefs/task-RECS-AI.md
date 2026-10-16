# Recommendations AI: catalog, "Similar items" training, real events (account 3, blast session)

Own worktree: `git worktree add ~/work/chalkboard-recs -b feat/recs-ai origin/main`.
Ports WEB_PORT=3483 API_PORT=3583. Read docs/OWNER-NOTES.md (16 Oct ~05:45), AGENTS.md.
Others own (do not touch): search ranking engine (feat/search-engine), Maps grounding
(feat/maps-grounding). Your serving hook must be a small, switchable function the search engine
can call later; do not edit the customer UI beyond wiring it behind the switch.

**Headless rules:** never run commands in the background; run tests in the foreground and wait. The
machine is shared by 8+ sessions: run ONLY your own tests with `--workers=1`; the full `npm run check`
only at the end, rerunning timed-out files alone. Plain commit messages, no AI co-author lines.

## Owner decision

INR 57,593 Recommendations AI trial (only usable on Recommendations AI / Vertex AI Search for
commerce Prediction + Training SKUs). Training takes 2-5 days, so START IT FIRST, today.

## Build

1. Enable retail.googleapis.com on project ichiropractic (owner approved); default catalog/branch.
   `backend/app/retail_recs.py` + `backend/scripts/retail_sync.py` importing all shop products (demo
   world + real shops; >= 100 SKUs; id, title, categories, price, availability, attributes
   shop_id/lat/lng, demo label). Run it once for real.
2. Create a **"Similar items"** model (needs no user events) and a serving config; start training now.
   Record the model name and state.
3. Real user events from the app (detail-page-view on item/shop open, search on ask, add-to-cart on
   follow/ask-owner, purchase-complete on a verified stamp) via a small batched, privacy-safe pipeline
   (visitor ids = existing anonymous ids; no personal data). NEVER upload synthetic or backfilled events.
4. Serving: `similar_items(product_id)` calls Recommendations AI when the model is ready and the
   switch is on; otherwise (and on any error) returns None so callers fall back to embeddings.
5. docs/impact/recommendations-ai.md: what was set up, model status, how to check it (gcloud/console),
   expected ready date.

## Done

Backend tests (sync shaping, event mapping, privacy, fallback, switch), the real sync and training
started, handoff docs/handoff/recs-ai.md. Push, `gh pr create --base main`. Summarise.
