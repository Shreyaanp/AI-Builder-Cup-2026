"""Two fictional chains for the supply-chain demo, one per business size above a stall.

A tea stall or kopitiam (the existing demo shops) orders from a local wholesaler by WhatsApp.
FreshMart (3 outlets) emails spreadsheet orders to a regional distributor. Metro Foods (20+
outlets) runs SAP and exchanges IDocs with its stores and an FMCG distributor. Prices are
retail minor units (paise); names are short and everything is labelled Demo.
"""

from __future__ import annotations

from .demo_catalogue import DemoShop, item, shop
from .merchant import ProductFields
from .money import to_minor


def _menu(rows: list[tuple[str, float, str, str]]) -> list[ProductFields]:
    return [
        item(name, to_minor(price, "INR"), unit, True, group) for name, price, unit, group in rows
    ]


def _chain(
    bid: str, name: str, category: str, outlets: int, city: str, lat: float, lng: float, rows: list
) -> DemoShop:
    return shop(
        bid,
        _menu(rows),
        city=city,
        name=name,
        category=category,
        location=f"Head office, {city.title()} (fictional demo address)",
        lat=lat,
        lng=lng,
        pin_label=f"Near {city.title()} centre (approximate)",
        timezone="Asia/Kolkata",
        currency="INR",
        hours="08:00–22:00",
        phone="+91 00000 00000",
        payment_methods=["cash", "UPI", "card"],
        delivery="none",
        stamps_enabled=False,
        custom_facts=[
            {"key": "outlets", "label": "Outlets", "value": str(outlets)},
        ],
    )


FRESHMART = _chain(
    "demo-chain-freshmart",
    "FreshMart",
    "Minimart",
    3,
    "bengaluru",
    12.9352,
    77.6245,
    [
        ("Sona masoori rice", 68, "kg", "Staples"),
        ("Toor dal", 178, "kg", "Staples"),
        ("Atta", 62, "kg", "Staples"),
        ("Sunflower oil", 139, "litre", "Staples"),
        ("Milk", 29, "pack", "Dairy"),
        ("Biscuits", 20, "pack", "Snacks"),
    ],
)

METRO = _chain(
    "demo-chain-metro-foods",
    "Metro Foods",
    "Supermarket chain",
    24,
    "mumbai",
    19.0760,
    72.8777,
    [
        ("Instant noodles", 14, "pack", "Packaged"),
        ("Biscuits", 20, "pack", "Packaged"),
        ("Refined oil", 135, "litre", "Staples"),
        ("Tea powder", 130, "pack", "Beverages"),
        ("Detergent powder", 110, "pack", "Household"),
        ("Toothpaste", 95, "item", "Personal care"),
    ],
)

CHAINS = [FRESHMART, METRO]
