"""Seed labelled fictional shops, six weeks of sales and sample customer activity.

Every shop is fictional: invented names, non-contactable sample numbers, approximate pins, and
the "Demo shop" label on every customer-facing surface. Re-running is safe (idempotent).

Usage (from backend/):
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 uv run python -m scripts.seed_demo_shops --owner-uid UID
  uv run python -m scripts.seed_demo_shops --owner-uid UID --sqlite .data/merchant.sqlite3
  uv run python -m scripts.seed_demo_shops --owner-uid UID --dry-run
A real project is only touched with an explicit --project (never by default).
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from datetime import date, datetime, time, timedelta
from random import Random
from typing import Any
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo

from app.customer import Inquiry, ThreadMessage
from app.merchant import MerchantRepository
from app.sales import today_for
from scripts.demo_catalogue import INTERNATIONAL_SHOPS, DemoShop, item, shop

EMULATOR_PROJECT = "demo-ogoogle-local"


SHOPS = [
    shop(
        "demo-katong-kopitiam",
        name="Sunny Side Kopitiam",
        category="Kopitiam",
        location="East Coast Road, Katong (demo)",
        lat=1.3052,
        lng=103.9045,
        pin_label="Near Katong (approximate)",
        hours="06:30–15:00",
        phone="+65 6000 0001",
        halal="not_stated",
        payment_methods=["cash", "paynow", "nets"],
        delivery="none",
        busy_hours="07:30–09:30",
        products=[
            item("Kopi", 170, "cup"),
            item("Kopi O", 150, "cup"),
            item("Teh", 170, "cup"),
            item("Milo dinosaur", 300, "cup"),
            item("Kaya toast set", 520, "set"),
            item("Soft-boiled eggs", 180, "pair"),
            item("Mee siam", 450, "plate", available=False),
            item("Curry puff", 180, "piece"),
        ],
    ),
    shop(
        "demo-tiong-bahru-bakery",
        name="Crumb & Courtyard Bakery",
        category="Bakery",
        location="Tiong Bahru estate (demo)",
        lat=1.2853,
        lng=103.8318,
        pin_label="Near Tiong Bahru (approximate)",
        hours="08:00–18:00",
        phone="+65 6000 0002",
        halal="no",
        vegetarian_options=True,
        payment_methods=["paynow", "card", "grabpay"],
        delivery="grab",
        preorders=True,
        preorder_lead_time="1 day ahead for whole cakes",
        products=[
            item("Kouign-amann", 520, "piece"),
            item("Butter croissant", 450, "piece"),
            item("Pandan chiffon slice", 380, "slice"),
            item("Sourdough loaf", 1200, "loaf"),
            item("Kaya bun", 280, "piece", available=False),
            item("Earl Grey cake", 5800, "whole cake"),
            item("Flat white", 600, "cup"),
        ],
    ),
    shop(
        "demo-geylang-serai-nasi-lemak",
        name="Serai Sunrise Nasi Lemak",
        category="Hawker stall · Nasi lemak",
        location="Geylang Serai (demo)",
        lat=1.3166,
        lng=103.8985,
        pin_label="Near Geylang Serai (approximate)",
        hours="07:00–14:00",
        phone="+65 6000 0003",
        halal="yes",
        payment_methods=["cash", "paynow"],
        delivery="foodpanda",
        busy_hours="11:30–13:30",
        products=[
            item("Nasi lemak (ikan bilis)", 350, "plate"),
            item("Nasi lemak with chicken wing", 550, "plate"),
            item("Nasi lemak with rendang", 650, "plate", available=False),
            item("Sambal sotong add-on", 250, "portion"),
            item("Otah", 150, "piece"),
            item("Teh tarik", 160, "cup"),
        ],
    ),
    shop(
        "demo-bugis-bubble-tea",
        name="Pearl Lane Bubble Tea",
        category="Bubble tea",
        location="Bugis (demo)",
        lat=1.3003,
        lng=103.8558,
        pin_label="Near Bugis (approximate)",
        hours="11:00–22:00",
        phone="+65 6000 0004",
        halal="not_stated",
        vegetarian_options=True,
        payment_methods=["paynow", "card", "grabpay"],
        delivery="grab",
        busy_hours="15:00–18:00",
        products=[
            item("Brown sugar pearl milk", 520, "cup"),
            item("Jasmine green tea", 380, "cup"),
            item("Oolong milk tea", 480, "cup"),
            item("Mango yakult", 520, "cup", available=False),
            item("Taro milk tea", 500, "cup"),
            item("Lychee aloe tea", 450, "cup"),
            item("Cheese foam add-on", 100, "add-on"),
            item("Matcha latte", 560, "cup", available=False),
        ],
    ),
    shop(
        "demo-toa-payoh-hardware",
        name="Lorong Fix-It Hardware",
        category="Hardware shop",
        location="Toa Payoh (demo)",
        lat=1.3343,
        lng=103.8563,
        pin_label="Near Toa Payoh (approximate)",
        hours="09:00–19:00",
        phone="+65 6000 0005",
        payment_methods=["cash", "paynow", "nets"],
        delivery="own",
        delivery_note="Toa Payoh area, orders over $30",
        custom_facts=[
            {"key": "key_cutting", "label": "Key cutting", "value": "While you wait, about 5 min"}
        ],
        products=[
            item("LED bulb (E27, 9W)", 450, "piece"),
            item("Extension cord (3m)", 1290, "piece"),
            item("Duct tape", 380, "roll"),
            item("Cable ties (100)", 290, "pack"),
            item("Screwdriver set", 1590, "set"),
            item("PVC pipe glue", 650, "tube", available=False),
            item("Key cutting", 400, "key"),
            item("AA batteries (4)", 520, "pack"),
            item("Mosquito net repair kit", 890, "kit"),
            item("Door hinge", 350, "piece"),
        ],
    ),
    shop(
        "demo-joo-chiat-florist",
        name="Petal Studio Joo Chiat",
        category="Florist",
        location="Joo Chiat Road (demo)",
        lat=1.3135,
        lng=103.9017,
        pin_label="Near Joo Chiat (approximate)",
        hours="10:00–19:00",
        phone="+65 6000 0006",
        payment_methods=["paynow", "card"],
        delivery="own",
        delivery_note="Same-day island-wide before 2 pm",
        preorders=True,
        preorder_lead_time="2 days for large arrangements",
        products=[
            item("Hand-tied bouquet (small)", 4500, "bouquet"),
            item("Hand-tied bouquet (large)", 8800, "bouquet"),
            item("Sunflower stem", 600, "stem"),
            item("Orchid pot", 3800, "pot"),
            item("Hydrangea bunch", 3200, "bunch", available=False),
            item("Graduation bouquet", 5500, "bouquet"),
        ],
    ),
    *INTERNATIONAL_SHOPS,
]


def sales_history(demo: DemoShop, today: date) -> list[dict[str, Any]]:
    """Stable per date/item: weekly seasonality, a small trend, and bounded noise.

    End yesterday in the shop's timezone; today's trading is never invented as a full day.
    Stable absolute dates also keep overlapping days identical when rerun tomorrow.
    """
    rows = []
    for offset in range(42, 0, -1):
        day = today - timedelta(days=offset)
        for index, product in enumerate(demo.products):
            rng = Random(f"{demo.id}/{product.name}/{day}")
            base = 10 + (len(demo.products) - index) * 3
            if product.unit == "service":
                base = 3 + index % 3
            pattern = (0.85, 0.90, 0.95, 1.0, 1.10, 1.35, 1.20)[day.weekday()]
            trend = 1 + (day - date(2026, 1, 1)).days * 0.0002
            quantity = max(1, round(base * pattern * max(0.5, trend) * rng.uniform(0.90, 1.10)))
            rows.append(
                {
                    "date": day.isoformat(),
                    "item": product.name,
                    "quantity": quantity,
                    "revenue": product.price * quantity,
                }
            )
    return rows


def customer_activity(demo: DemoShop, today: date) -> list[Inquiry]:
    """Two questions last week and one today, visibly fictional, with stable IDs."""
    monday = today - timedelta(days=today.weekday())
    days = [monday - timedelta(days=5), monday - timedelta(days=2), today]
    messages = [
        f"[Demo] Can I collect two {demo.products[0].name} tomorrow?",
        "[Demo] Which payment methods do you accept?",
        "[Demo] Are you open this afternoon? This is a sample inquiry.",
    ]
    return [
        Inquiry(
            id=str(uuid5(NAMESPACE_URL, f"chalkboard-demo/{demo.id}/inquiry/{i}")),
            name=f"Demo customer {i + 1}",
            contact=f"demo-customer-{i + 1}@example.invalid",
            message=message,
            created=(
                stamp := datetime.combine(
                    day, time.min if day == today else time(10, 15), ZoneInfo(demo.fields.timezone)
                ).timestamp()
            ),
            messages=[
                ThreadMessage(
                    id=str(uuid5(NAMESPACE_URL, f"chalkboard-demo/{demo.id}/message/{i}")),
                    author="customer",
                    text=message,
                    created=stamp,
                )
            ],
        )
        for i, (day, message) in enumerate(zip(days, messages, strict=True))
    ]


def seed(
    store: MerchantRepository,
    seed_owner_uid: str = "demo-world-owner",
    *,
    owner_uid: str | None = None,
    city: str | None = None,
    today: date | None = None,
) -> list[tuple[str, bool]]:
    """Use normal sealed sales imports. Reruns preserve revisions and customer replies.

    The seed owner retains access; the optional real account gets one shop per city.
    Existing demo IDs owned by someone else are still rejected by seed_demo_shop.
    """
    attached: set[str] = set()
    results = []
    for demo in SHOPS:
        if city and demo.city != city:
            continue
        day = today or today_for(demo.fields.model_dump())
        changed = store.seed_demo_shop(seed_owner_uid, demo.id, demo.fields, demo.products)
        existing = store.sales_history(seed_owner_uid, demo.id)
        expected = sales_history(demo, day)
        # Only changed/new days go through import approval. No duplicate receipts/revisions.
        previous = {r["date"]: [] for r in existing}
        for row in existing:
            previous[row["date"]].append(row)
        incoming: dict[str, list[dict[str, Any]]] = {}
        for row in expected:
            incoming.setdefault(row["date"], []).append(row)
        pending = [r for d, rows in incoming.items() if previous.get(d) != rows for r in rows]
        if pending:
            proposal = store.prepare_sales(seed_owner_uid, demo.id, pending)
            store.save_sales(seed_owner_uid, demo.id, proposal["id"], proposal["digest"])
            changed = True
        changed = (
            store.seed_demo_inquiries(seed_owner_uid, demo.id, customer_activity(demo, day))
            or changed
        )
        if owner_uid and demo.city not in attached:
            changed = store.attach_demo_owner(seed_owner_uid, demo.id, owner_uid) or changed
            attached.add(demo.city)
        results.append((demo.id, changed))
    return results


def open_store(args: argparse.Namespace) -> MerchantRepository:
    if args.sqlite:
        from app.merchant import MerchantStore

        return MerchantStore(args.sqlite)
    from google.cloud import firestore

    from app.merchant_firestore import FirestoreMerchantStore

    if args.project:
        client = firestore.Client(project=args.project, database=args.database)
    else:
        from google.auth.credentials import AnonymousCredentials

        client = firestore.Client(project=EMULATOR_PROJECT, credentials=AnonymousCredentials())
    return FirestoreMerchantStore(client, args.namespace)


def parse(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--owner-uid", help="Also attach one demo shop per city to this account")
    parser.add_argument(
        "--seed-owner-uid", default="demo-world-owner", help="Owner of all fixtures"
    )
    parser.add_argument("--city", type=str.casefold, choices=sorted({s.city for s in SHOPS}))
    parser.add_argument("--dry-run", action="store_true", help="Print the plan; write nothing")
    parser.add_argument("--namespace", default="ogoogle_ai_v1", help="App Firestore namespace")
    parser.add_argument("--sqlite", help="Seed a local SQLite merchant database instead")
    parser.add_argument(
        "--project",
        help="Real Google Cloud project. Required to leave the emulator; never implied.",
    )
    parser.add_argument("--database", default="(default)", help="Firestore database (--project)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse(argv)
    if not args.seed_owner_uid.strip() or (
        args.owner_uid is not None and not args.owner_uid.strip()
    ):
        print("Owner UIDs must not be empty.", file=sys.stderr)
        return 2
    target = (
        f"SQLite {args.sqlite}"
        if args.sqlite
        else f"Firestore project {args.project} ({args.database}) / {args.namespace}"
        if args.project
        else f"Firestore emulator {os.getenv('FIRESTORE_EMULATOR_HOST')} / {args.namespace}"
    )
    if (
        not args.dry_run
        and not args.sqlite
        and not args.project
        and not os.getenv("FIRESTORE_EMULATOR_HOST")
    ):
        print(
            "Refusing: FIRESTORE_EMULATOR_HOST is not set. Start the emulator, use --sqlite, or "
            "pass --project explicitly to seed a real project.",
            file=sys.stderr,
        )
        return 2
    print(f"Target: {target}")
    selected = [s for s in SHOPS if not args.city or s.city == args.city]
    print(f"Demo shops per city: {dict(Counter(s.city for s in selected))}")
    attached: set[str] = set()
    for demo in selected:
        sold_out = sum(not p.available for p in demo.products)
        print(f"  {demo.id}: {demo.fields.name} · {len(demo.products)} items, {sold_out} sold out")
        print("    42 days of demo sales; 3 demo customer inquiries; recap uses saved records")
        if args.owner_uid and demo.city not in attached:
            print(f"    Also attach this demo shop to owner {args.owner_uid}")
            attached.add(demo.city)
    if args.dry_run:
        print("Dry run: nothing written.")
        return 0
    for bid, changed in seed(
        open_store(args),
        args.seed_owner_uid.strip(),
        owner_uid=args.owner_uid.strip() if args.owner_uid else None,
        city=args.city,
    ):
        print(f"  {bid}: {'seeded' if changed else 'already up to date'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
