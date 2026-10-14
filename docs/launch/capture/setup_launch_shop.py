"""Launch-video setup (local only): give the browser's local workspace the six demo shops and
three weeks of sales for the nasi lemak stall, so the recap screen shows real numbers.

Run from backend/ with PYTHONPATH=. (the capture script does this):
  uv run python ../docs/launch/capture/setup_launch_shop.py --db data/launch-merchant.sqlite3
It only ever touches the given local SQLite file.
"""

from __future__ import annotations

import argparse
import sqlite3
from datetime import date, timedelta

from app.merchant import MerchantStore
from scripts.seed_demo_shops import seed

SHOP = "demo-geylang-serai-nasi-lemak"
# (item, cents per unit, weekday plates, weekend plates) — a believable small stall.
MENU = [
    ("Nasi lemak (ikan bilis)", 350, 60, 85),
    ("Nasi lemak with chicken wing", 550, 45, 70),
    ("Nasi lemak with rendang", 650, 20, 35),
    ("Otah", 150, 25, 40),
    ("Teh tarik", 160, 50, 75),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    args = parser.parse_args()
    with sqlite3.connect(args.db) as db:
        row = db.execute("SELECT uid FROM consents ORDER BY accepted DESC LIMIT 1").fetchone()
    if not row:
        raise SystemExit("No local workspace has consented yet.")
    uid = row[0]
    store = MerchantStore(args.db)
    seed(store, uid)
    today = date.today()
    rows = []
    for back in range(1, 22):
        day = today - timedelta(days=back)
        weekend = day.weekday() >= 5
        # Deterministic gentle growth so this week reads a little better than last week.
        lift = 1 + (21 - back) * 0.01
        for name, cents, weekday_qty, weekend_qty in MENU:
            quantity = round((weekend_qty if weekend else weekday_qty) * lift)
            rows.append(
                {
                    "date": day.isoformat(),
                    "item": name,
                    "quantity": quantity,
                    "revenue": quantity * cents,
                }
            )
    proposal = store.prepare_sales(uid, SHOP, rows)
    store.save_sales(uid, SHOP, proposal["id"], proposal["digest"])
    print(f"Seeded demo shops and {len(rows)} sales rows for the local workspace.")


if __name__ == "__main__":
    main()
