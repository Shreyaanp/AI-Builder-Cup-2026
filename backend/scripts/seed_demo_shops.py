"""Seed six clearly labelled demo shops (fixed `demo-*` IDs) for /explore and customer pages.

Every shop is fictional: invented names, fictional +65 6000 00xx numbers, approximate pins, and
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
from dataclasses import dataclass
from typing import Any

from app.merchant import BusinessFields, MerchantRepository, ProductFields

EMULATOR_PROJECT = "demo-ogoogle-local"


@dataclass(frozen=True)
class DemoShop:
    id: str
    fields: BusinessFields
    products: list[ProductFields]


def item(name: str, cents: int, unit: str = "item", available: bool = True) -> ProductFields:
    return ProductFields(name=name, price=cents, unit=unit, available=available)


def shop(bid: str, products: list[ProductFields], **fields: Any) -> DemoShop:
    return DemoShop(bid, BusinessFields(demo=True, currency="SGD", **fields), products)


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
]


def seed(store: MerchantRepository, owner_uid: str) -> list[tuple[str, bool]]:
    """Seed every demo shop; returns (id, changed) pairs. Safe to run repeatedly."""
    return [(s.id, store.seed_demo_shop(owner_uid, s.id, s.fields, s.products)) for s in SHOPS]


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
    parser.add_argument("--owner-uid", required=True, help="Account that owns the demo shops")
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
    if not args.owner_uid.strip():
        print("--owner-uid must not be empty.", file=sys.stderr)
        return 2
    target = (
        f"SQLite {args.sqlite}"
        if args.sqlite
        else f"Firestore project {args.project} ({args.database}) / {args.namespace}"
        if args.project
        else f"Firestore emulator {os.getenv('FIRESTORE_EMULATOR_HOST')} / {args.namespace}"
    )
    if not args.sqlite and not args.project and not os.getenv("FIRESTORE_EMULATOR_HOST"):
        print(
            "Refusing: FIRESTORE_EMULATOR_HOST is not set. Start the emulator, use --sqlite, or "
            "pass --project explicitly to seed a real project.",
            file=sys.stderr,
        )
        return 2
    print(f"Target: {target}")
    for demo in SHOPS:
        sold_out = sum(not p.available for p in demo.products)
        print(f"  {demo.id}: {demo.fields.name} · {len(demo.products)} items, {sold_out} sold out")
    if args.dry_run:
        print("Dry run: nothing written.")
        return 0
    for bid, changed in seed(open_store(args), args.owner_uid.strip()):
        print(f"  {bid}: {'seeded' if changed else 'already up to date'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
