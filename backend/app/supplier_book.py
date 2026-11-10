"""Opening and saving a supplier (OB-223), on the supply chain's own relationships.

A saved supplier is a relationship row marked `saved`, so My suppliers, Order more and the coach
all read one list: there is no second address book. The last search is kept per shop, so "which
is cheapest?" and "save the second one" work from the same list on any path, and after a reload.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import HTTPException

from . import sourcing, supply_chain
from .merchant import MerchantRepository
from .money import to_major
from .region import shop_currency
from .supplier_compare import per_common_unit

SEARCH = "supplier_search"
SEARCH_KEEPS_SECONDS = 24 * 3600
MOST_PRODUCTS = 30


def _shop(
    store: MerchantRepository, uid: str, bid: str, sid: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    """The owner's shop context and the supplier; another shop's generated demo is not found."""
    context = store.context(uid, bid)
    shop = None if sourcing.someone_elses_demo(sid, bid) or sid == bid else store.public_shop(sid)
    if not shop:
        raise HTTPException(404, "Supplier not found.")
    return context, shop


def detail(store: MerchantRepository, uid: str, bid: str, sid: str) -> dict[str, Any]:
    """Everything the owner sees on opening a supplier."""
    context, shop = _shop(store, uid, bid, sid)
    fields = context["business"]["fields"]
    currency = shop_currency(fields)
    pin = sourcing.shop_pin(fields)
    lat, lng = shop.get("lat"), shop.get("lng")
    row = supply_chain.relationship(store, bid, sid)
    demo = bool(shop.get("demo"))
    products = []
    for product in shop.get("products", [])[:MOST_PRODUCTS]:
        major = {**product, "price": to_major(product["price"], currency)}
        price, unit = per_common_unit(major, demo)
        products.append(
            {
                "name": product["name"],
                "price": major["price"],
                "unit": product["unit"],
                "available": product.get("available", True),
                "compare": {"price": price, "unit": unit},
            }
        )
    return {
        "id": sid,
        "name": shop["name"],
        "demo": demo,
        "currency": currency,
        "distance_km": round(sourcing.haversine(pin.lat, pin.lng, lat, lng), 1)
        if lat is not None and lng is not None
        else None,
        "delivery": (shop.get("facts") or {}).get("delivery_note", ""),
        "min_order": shop.get("min_order", ""),
        "products": products,
        "saved": bool(row and row.get("saved")),
    }


def _ordered_from(store: MerchantRepository, uid: str, bid: str, sid: str) -> bool:
    return any(po["supplier"]["id"] == sid for po in supply_chain.orders(store, uid, bid)) or any(
        order["supplier"]["id"] == sid for order in sourcing.orders(store, uid, bid)
    )


def _link(
    store: MerchantRepository, bid: str, context: dict[str, Any], shop: dict[str, Any]
) -> dict[str, Any]:
    fields = context["business"]["fields"]
    index = len(store.feature_docs.scoped(supply_chain.RULES, bid, 50))
    return supply_chain.ensure_relationship(
        store, bid, shop, shop_currency(fields), index, supply_chain.business_size(fields)
    )


def save(store: MerchantRepository, uid: str, bid: str, sid: str) -> dict[str, Any]:
    """On My suppliers from now on, with starting rules the owner can edit. Saving twice is one
    save, and never touches rules the owner already changed."""
    context, shop = _shop(store, uid, bid, sid)
    row = _link(store, bid, context, shop)
    if row.get("saved"):
        return row
    return supply_chain._versioned(  # noqa: SLF001 - the supply chain's own write
        store, supply_chain.RULES, bid, sid, {**row, "saved": True}, int(row.get("version", 1))
    )


def remove(store: MerchantRepository, uid: str, bid: str, sid: str) -> dict[str, Any]:
    """Off My suppliers. A supplier with orders stays linked to them, just no longer saved."""
    store.context(uid, bid)
    row = supply_chain.relationship(store, bid, sid)
    if not row:
        return {"supplier_id": sid, "saved": False}
    if _ordered_from(store, uid, bid, sid):
        if row.get("saved"):
            supply_chain._versioned(  # noqa: SLF001 - the supply chain's own write
                store, supply_chain.RULES, bid, sid, {**row, "saved": False}, int(row["version"])
            )
    else:
        store.feature_docs.delete(
            supply_chain.RULES,
            supply_chain._key(bid, sid),  # noqa: SLF001
        )
    return {"supplier_id": sid, "saved": False}


def ordered(store: MerchantRepository, uid: str, bid: str, sid: str) -> None:
    """An order went to this supplier from chat: it belongs on My suppliers (OB-223)."""
    try:
        context, shop = _shop(store, uid, bid, sid)
    except HTTPException:
        return
    _link(store, bid, context, shop)


def saved_ids(store: MerchantRepository, bid: str) -> set[str]:
    return {
        row["supplier"]["id"]
        for row in store.feature_docs.scoped(supply_chain.RULES, bid, 50)
        if row.get("saved")
    }


def remember_search(store: MerchantRepository, bid: str, result: dict[str, Any]) -> None:
    """The list the owner was just shown; their next message may be a short follow-up to it."""
    now = time.time()
    store.feature_docs.put(SEARCH, bid, bid, now, {**result, "at": now, "follow_up": True})


def list_was_last(store: MerchantRepository, bid: str) -> bool:
    """True when the shop's last turn showed (or answered about) the supplier list."""
    found = store.feature_docs.get(SEARCH, bid)
    return bool(found and found.get("follow_up")) and last_search(store, bid) is not None


def end_follow_up(store: MerchantRepository, bid: str) -> None:
    """Another message came in: from now on only words clearly about suppliers reach the list."""
    found = store.feature_docs.get(SEARCH, bid)
    if found and found.get("follow_up"):
        at = float(found.get("at", 0))
        store.feature_docs.put(SEARCH, bid, bid, at, {**found, "follow_up": False})


def last_search(store: MerchantRepository, bid: str) -> dict[str, Any] | None:
    """The newest supplier list, with today's saved marks; None once it is a day old."""
    found = store.feature_docs.get(SEARCH, bid)
    if not found or time.time() - float(found.get("at", 0)) > SEARCH_KEEPS_SECONDS:
        return None
    mine = saved_ids(store, bid)
    return {
        **{key: value for key, value in found.items() if key not in {"at", "follow_up"}},
        "suppliers": [{**card, "saved": card["id"] in mine} for card in found["suppliers"]],
    }
