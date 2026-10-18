"""The tour's one order, followed from the tea stall to the wholesaler to the chain.

Read only, and only seeded demo records: the owner's private tour shop and its PO 4500000001,
the wholesaler's own books (the same order coming in, its CSV restock), and Metro Foods' SAP
loop with its distributor. Every name and number comes from those records, never from copy.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException

from . import supply_chain as supply
from . import supply_io
from .demo_chains import METRO
from .merchant import MerchantRepository
from .tour_story import stable, tour_id

# The SAP message each step travels as, by the size a chain runs at.
IDOC = {"ORDERS": "ORDERS05", "ORDRSP": "ORDERS05", "DESADV": "DELVRY07", "INVOIC": "INVOIC02"}


def _lines(po: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "item": line["item"],
            "quantity": line["quantity"],
            "unit": line["unit"],
            "price": line["price"],
            "total": line["total"],
        }
        for line in po["lines"]
    ]


def _order(po: dict[str, Any]) -> dict[str, Any]:
    return {
        "number": po["number"],
        "partner": supply_io.partner_of(po)["name"],
        "currency": po["currency"],
        "total": po["total"],
        "lines": _lines(po),
        "documents": [d["kind"] for d in po["documents"]],
        "received": bool(po.get("received")),
    }


def _text(entry: dict[str, Any], fmt: str) -> str:
    """The document as its partner wrote or reads it (WhatsApp text, a CSV file)."""
    if entry.get("raw_format") == fmt:
        return str(entry.get("raw") or "")
    return str(entry.get("translated") or "") if entry.get("translated_format") == fmt else ""


def tour_city(uid: str, bid: str) -> str:
    city = next((c for c in ("bengaluru", "singapore") if tour_id(uid, c) == bid), "")
    if not city:
        raise HTTPException(404, "Not a tour shop.")
    return city


def story(
    store: MerchantRepository, uid: str, bid: str, forecast: dict[str, Any], today: date
) -> dict[str, Any]:
    context = store.context(uid, bid)  # Owned, or this raises.
    city = tour_city(uid, bid)
    fields = context["business"]["fields"]
    if not fields.get("demo"):
        raise HTTPException(404, "Not a tour shop.")
    po = store.feature_docs.get(supply.ORDERS, supply._key(bid, stable(f"{bid}/purchase-order")))
    if not po:
        raise HTTPException(409, "The tour order is not seeded yet.")
    item = po["reason"]["item"]
    inventory = context["inventory"]
    product = next(p for p in inventory if p["name"] == item)
    need = supply.need_from_forecast(product, forecast, item, today)
    message = next((_text(d, "text") for d in po["documents"] if d["kind"] == "ORDERS"), "")

    supplier = po["supplier"]
    books = supply.all_orders(store, supplier["id"])
    inbound = next(
        (o for o in books if supply_io.direction_of(o) == "out" and o["number"] == po["number"]),
        None,
    )
    restock = next(
        (
            o
            for o in books
            if supply_io.direction_of(o) == "in"
            and o["documents"]
            and o["documents"][0].get("raw_format") == "csv"
        ),
        None,
    )

    chain_orders = supply.all_orders(store, METRO.id)
    loop = next(
        (
            o
            for o in sorted(chain_orders, key=lambda o: o["number"])
            if supply_io.direction_of(o) == "in"
            and {"ORDRSP", "DESADV", "INVOIC"} <= {d["kind"] for d in o["documents"]}
        ),
        None,
    )
    chain = store.public_shop(METRO.id)

    amounts = {line["line"]: float(line["quantity"]) for line in po["lines"]}
    after = supply.stock_after(inventory, po, amounts)
    arrived = []
    for name, (stocked, stock) in after.items():
        later = supply.need_from_forecast({**stocked, "stock": stock}, forecast, name, today)
        arrived.append(
            {
                "item": name,
                "unit": stocked["unit"],
                "before": stocked.get("stock") or 0,
                "after": stock,
                "runs_out_before": supply.need_from_forecast(stocked, forecast, name, today)[
                    "runs_out"
                ],
                "runs_out_after": later["runs_out"],
                "covered_until": later["horizon_end"],
            }
        )
    pulse = store.feature_docs.get("shop_daily", f"{bid}:{today}") or {}
    return {
        "city": city,
        "shop": fields["name"],
        "currency": po["currency"],
        "today": {
            "item": item,
            "unit": product["unit"],
            "stock": need["stock"],
            "daily": need["daily"],
            "runs_out": need["runs_out"],
            "method": need["method"],
        },
        "order": {**_order(po), "message": message},
        "wholesaler": {
            "name": supplier["name"],
            "inbound": {**_order(inbound), "message": _text(inbound["documents"][0], "text")}
            if inbound
            else None,
            "restock": {**_order(restock), "csv": _text(restock["documents"][0], "csv")}
            if restock
            else None,
        },
        "chain": {
            "name": chain["name"] if chain else METRO.fields.name,
            "outlets": next((f.value for f in METRO.fields.custom_facts if f.key == "outlets"), ""),
            "order": {
                **_order(loop),
                "idocs": [IDOC.get(d["kind"], d["kind"]) for d in loop["documents"]],
            },
        }
        if loop
        else None,
        "arrived": arrived,
        "customers": {
            "stamps_today": pulse.get("stamps"),
            "returning_today": pulse.get("returning"),
            "stamps_needed": fields.get("stamps_needed", 8),
            "reward": fields.get("reward_text", ""),
        },
    }
