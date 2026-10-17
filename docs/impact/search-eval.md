# Search evaluation: keyword search vs the shared search engine (16 Oct 2026)

Script: `backend/scripts/search_eval.py`. Raw results: `search-eval-fixture.json`,
`search-eval-live.json` (this folder).

## Set-up

- A fictional neighbourhood of **20 shops, 140 items**, one shop per demo menu
  (`app/demo_catalogue.MENUS`): cafes, bakeries, street food, kirana and grocery, salons, a tailor,
  florists, hardware. Shops sit 150 m to 1.3 km from the customer, so distance matters but never
  decides.
- **25 labelled queries**, each listing the shops a neighbour would accept (labelled by hand from
  the menus): plain item words ("coffee", "milk"), needs ("fix my trousers", "tools to fix a
  shelf"), and loose wishes ("something sweet", "a hot brew", "lunch").
- Both searches use the same offline intent parser, so only matching and ranking differ.
  - **Before**: the old word match and score (matched items × 3 + name/category hit − distance).
  - **After**: `SearchEngine.relevance` (meaning) + words, filtered by `shop_pick`, ranked by the
    hybrid score with the weights table in `app/search_engine.py`.
- Precision@5 = hits in the top 5 ÷ min(5, number of acceptable shops).

## Results

| Engine                                | Precision@5 before | Precision@5 after | Empty answers before | after | Texts embedded          |
| ------------------------------------- | ------------------ | ----------------- | -------------------- | ----- | ----------------------- |
| Offline fixture embeddings            | 0.728              | **0.942**         | 2                    | **0** | 179                     |
| Vertex AI `gemini-embedding-2` (live) | 0.728              | **0.902**         | 2                    | **0** | 179 (once, then cached) |

Biggest gains (live): "a hot brew" 0 → 0.8, "lunch" 0 → 0.8, "dessert" 0.2 → 1.0, "noodles" 0.5 →
1.0, "fix my trousers" 0 → 1.0 (the old word match never reached the tailor; meaning does).

Still weak (live): "something sweet" 0.4 (grocery and street-food snacks crowd the bakeries),
"breakfast" 0.4 (only two cafes pass the item threshold), "tea" 0.6 (kirana tea leaves rank above
cafes). One small loss: "a cold drink" 1.0 → 0.8 (a cafe's iced item edges out a fourth stall).

## Tuning that came out of it

- Live cosine scores for `gemini-embedding-2` are compressed: unrelated shop items sit at raw
  cosine 0.45–0.63, matching ones at 0.60–0.78. The engine rescales live scores above
  `LIVE_FLOOR = 0.35`, so the shared `ITEM_RECALL` works for both fixture and live vectors.
- Short queries score lower with real embeddings, so a fixed item threshold returned nothing for
  some of them. `item_recall()` now also accepts items within `RECALL_MARGIN = 0.06` of the best
  item in the neighbourhood, never below `ITEM_RECALL_MIN = 0.3`; unit-tested in
  `test_item_recall_relaxes_only_relative_to_the_best_match_nearby`.
- `task_type` was dropped: `gemini-embedding-2` returned identical vectors for every task type
  tried.

## Cost

Each item and shop text is embedded once and cached per shop, keyed by content fingerprint and
model; the live run embedded 179 texts (140 items + 20 shops + 19 query texts) in batches. A second run over the
same neighbourhood embeds only new queries.

## Limits

- A small hand-labelled set over demo menus, not real search logs; one labeller.
- Personal signals and live Google popularity are not part of this eval (they reorder results for
  a known customer; covered by unit tests instead).
