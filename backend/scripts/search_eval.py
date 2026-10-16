"""Search evaluation: precision@5 of the old keyword search vs the shared search engine.

A fictional neighbourhood holds one shop per demo menu (20 shops, ~150 items, every kind of
local business). Each labelled query lists the shops a neighbour would accept. Both searches use
the same offline intent parser, so only matching and ranking differ.

    uv run python scripts/search_eval.py            # fixture embeddings (offline, no model)
    uv run python scripts/search_eval.py --live     # Vertex AI gemini-embedding-2 (ADC project)

Precision@5 here is hits in the top 5 divided by min(5, number of acceptable shops), so a query
with one right answer scores 1.0 when that shop is in the top 5.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.demo_catalogue import MENUS  # noqa: E402
from app.discover import distance  # noqa: E402
from app.discover_ask import item_matches, keyword_intent, shop_pick  # noqa: E402
from app.money import to_minor  # noqa: E402
from app.search_engine import (  # noqa: E402
    SearchEngine,
    fixture_embedder,
    item_recall,
    vertex_embedder,
)

CENTRE = (12.9718, 77.6412)
SHOPS: dict[str, tuple[str, str]] = {
    "india-cafe": ("Courtyard Filter House", "Cafe"),
    "kirana": ("Little Lantern Kirana", "Grocery / Kirana"),
    "india-bakery": ("Butter Window Bakery", "Bakery"),
    "tailor": ("Needle Courtyard", "Tailor"),
    "delhi-food": ("Tamarind Corner", "Street food"),
    "mumbai-food": ("Monsoon Snack Window", "Street food"),
    "florist": ("Petal Pocket", "Florist"),
    "hardware": ("Small Fix Supply", "Hardware"),
    "kl-cafe": ("Morning Fern Kopi", "Cafe"),
    "kl-bakery": ("Pandan Window Bakes", "Bakery"),
    "kl-salon": ("Comet Comb Studio", "Salon"),
    "jakarta-food": ("Warung Daun Kecil", "Street food"),
    "jakarta-cafe": ("Kopi Jendela Senja", "Cafe"),
    "jakarta-grocery": ("Toko Saku Harian", "Grocery"),
    "tokyo-cafe": ("Pocket Vinyl Coffee", "Cafe"),
    "tokyo-bakery": ("Komorebi Bread Window", "Bakery"),
    "tokyo-florist": ("Little Stem Atelier", "Florist"),
    "bangkok-food": ("Baan Little Basil", "Street food"),
    "bangkok-cafe": ("Cloud Cup Corner", "Cafe"),
    "bangkok-salon": ("Mali Comb Studio", "Salon"),
}
CAFES = ["india-cafe", "kl-cafe", "jakarta-cafe", "tokyo-cafe", "bangkok-cafe"]
BAKERIES = ["india-bakery", "kl-bakery", "tokyo-bakery"]
FOOD = ["delhi-food", "mumbai-food", "jakarta-food", "bangkok-food"]
# query → shops a neighbour would accept (labelled by hand from the menus above).
LABELS: dict[str, list[str]] = {
    "coffee": CAFES,
    "a hot brew": CAFES,
    "latte": ["jakarta-cafe", "tokyo-cafe", "bangkok-cafe"],
    "tea": ["india-cafe", "kl-cafe", "tokyo-cafe", "bangkok-cafe", "bangkok-food", "mumbai-food"],
    "something sweet": [*BAKERIES, "kl-cafe", "bangkok-food", "tokyo-cafe", "bangkok-cafe"],
    "cake": [*BAKERIES, "kl-cafe", "tokyo-cafe", "bangkok-cafe"],
    "dessert": ["bangkok-food", *BAKERIES, "tokyo-cafe", "bangkok-cafe"],
    "fresh bread": BAKERIES,
    "breakfast": ["india-cafe", "kl-cafe", "tokyo-cafe", "bangkok-cafe", "jakarta-cafe"],
    "lunch": [*FOOD, "kl-cafe"],
    "street food snacks": FOOD,
    "chaat": ["delhi-food", "mumbai-food"],
    "noodles": ["jakarta-food", "jakarta-grocery"],
    "a cold drink": [*FOOD, "india-cafe", "bangkok-cafe", "kl-cafe"],
    "groceries": ["kirana", "jakarta-grocery"],
    "rice and dal": ["kirana", "jakarta-grocery"],
    "milk": ["kirana"],
    "haircut": ["kl-salon", "bangkok-salon"],
    "trim my beard": ["kl-salon", "bangkok-salon"],
    "fix my trousers": ["tailor"],
    "alterations": ["tailor"],
    "flowers for a gift": ["florist", "tokyo-florist"],
    "bouquet": ["florist", "tokyo-florist"],
    "light bulb": ["hardware"],
    "tools to fix a shelf": ["hardware"],
}


def world() -> list[dict[str, Any]]:
    shops = []
    for index, (menu, (name, category)) in enumerate(SHOPS.items()):
        angle = index * 2.4
        metres = 150 + 60 * index  # 150 m to 1.3 km, so distance matters but never decides
        lat = CENTRE[0] + metres / 111_320 * math.cos(angle)
        lng = CENTRE[1] + metres / (111_320 * math.cos(math.radians(CENTRE[0]))) * math.sin(angle)
        shops.append(
            {
                "id": menu,
                "name": name,
                "category": category,
                "lat": lat,
                "lng": lng,
                "hours": "",
                "timezone": "Asia/Kolkata",
                "currency": "INR",
                "facts": {},
                "products": [
                    {
                        "name": item,
                        "category": group,
                        "price": to_minor(price, "INR"),
                        "unit": unit,
                        "available": True,
                    }
                    for item, price, unit, group in MENUS[menu]
                ],
            }
        )
    return shops


def keyword_rank(q: str, shops: list[dict[str, Any]]) -> list[str]:
    """The search before the engine: word matches only, with its old score."""
    intent = keyword_intent(q)
    scored = []
    for shop in shops:
        pick = shop_pick(shop, intent, *CENTRE)
        if pick is None:
            continue
        matched = [p for p in shop["products"] if item_matches(p, intent.keywords)]
        text = f"{shop['name']} {shop['category']}".casefold()
        hit = any(w.casefold() in text for w in intent.keywords) or bool(intent.category)
        old = (
            len(matched) * 3
            + (2 if hit else 0)
            - distance(*CENTRE, shop["lat"], shop["lng"]) / 1500
        )
        scored.append((old, shop["id"]))
    return [bid for _, bid in sorted(scored, key=lambda pair: -pair[0])]


def engine_rank(q: str, shops: list[dict[str, Any]], engine: SearchEngine) -> list[str]:
    """The shared engine: the same intent, words and meaning, hybrid ranking."""
    intent = keyword_intent(q)
    meaning = engine.relevance(" ".join(intent.keywords) or q, shops)
    recall = item_recall(meaning)
    picks = [
        pick
        for shop in shops
        if (pick := shop_pick(shop, intent, *CENTRE, meaning.get(shop["id"]), recall)) is not None
    ]
    picks.sort(key=lambda p: (-p.score, p.distance_m))
    return [p.id for p in picks]


def precision(ranked: list[str], relevant: list[str], k: int = 5) -> float:
    return len(set(ranked[:k]) & set(relevant)) / min(k, len(relevant))


def evaluate(engine: SearchEngine) -> dict[str, Any]:
    shops = world()
    rows: list[dict[str, Any]] = []
    for q, relevant in LABELS.items():
        before, after = keyword_rank(q, shops), engine_rank(q, shops, engine)
        rows.append(
            {
                "q": q,
                "before": round(precision(before, relevant), 2),
                "after": round(precision(after, relevant), 2),
                "before_found": len(before),
                "after_found": len(after),
                "after_top5": after[:5],
            }
        )
    n = len(rows)
    return {
        "engine": engine.mode,
        "shops": len(shops),
        "items": sum(len(s["products"]) for s in shops),
        "queries": n,
        "precision_at_5_before": round(sum(r["before"] for r in rows) / n, 3),
        "precision_at_5_after": round(sum(r["after"] for r in rows) / n, 3),
        "no_results_before": sum(1 for r in rows if r["before_found"] == 0),
        "no_results_after": sum(1 for r in rows if r["after_found"] == 0),
        "embedded_texts": engine.cache.embedded,
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="Vertex AI embeddings (ADC)")
    parser.add_argument("--project", default=os.getenv("GOOGLE_CLOUD_PROJECT", ""))
    parser.add_argument("--json", type=Path, help="Write the full result here")
    args = parser.parse_args()
    if args.live:
        if not args.project:
            parser.error("--live needs --project or GOOGLE_CLOUD_PROJECT")
        model = "gemini-embedding-2"
        engine = SearchEngine(vertex_embedder(args.project, "global", model), model, live=True)
    else:
        engine = SearchEngine(fixture_embedder, "fixture-concepts-v1")
    result = evaluate(engine)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(f"engine={result['engine']} shops={result['shops']} items={result['items']}")
    print(
        f"precision@5 before={result['precision_at_5_before']} "
        f"after={result['precision_at_5_after']} "
        f"no-results before={result['no_results_before']} after={result['no_results_after']} "
        f"embedded={result['embedded_texts']}"
    )
    for row in result["rows"]:
        print(f"  {row['q']:<22} {row['before']:.2f} -> {row['after']:.2f}  {row['after_top5']}")


if __name__ == "__main__":
    main()
