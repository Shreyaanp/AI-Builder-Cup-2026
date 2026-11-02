"""Synthetic supply-chain partners and documents for the demo (fictional businesses only).

The channel follows the size of the business, as it does in real life:
- small (a tea stall, a kopitiam): orders from a local wholesaler by WhatsApp-style text;
- mid (FreshMart, 3 outlets): CSV purchase orders to a regional distributor, with an order
  change and a goods receipt;
- large (Metro Foods, 20+ outlets): SAP IDoc with its stores (forecast, order, change, shipping
  notice) and with an FMCG distributor (ORDERS05, ORDRSP, DELVRY07, INVOIC02, goods receipt).
Every document goes through the same pipeline a real partner's document would (supply_io.py),
so the demo shows real processing, not canned screens.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from . import supply_chain, supply_io, supply_outbound
from .demo_chains import CHAINS
from .demo_data import SHOPS
from .merchant import MerchantRepository
from .region import profile
from .supply_docs import DocLine, Format, Party, SupplyDoc, parse, render
from .supply_rules import SIZE_FORMAT, SIZE_TERMS, Size, business_size


def buyer(tag: str) -> dict[str, Any]:
    return {
        "id": f"demo-{tag}-buyer",
        "name": "Harbour Café (Demo)",
        "system": "idoc",
        "demo": True,
    }


def supplier(tag: str) -> dict[str, Any]:
    return {
        "id": f"demo-{tag}-supplier",
        "name": "Sunrise Supply (Demo)",
        "system": "json",
        "demo": True,
    }


def _item(context: dict[str, Any]) -> dict[str, Any]:
    stocked = [p for p in context["inventory"] if p.get("stock") is not None]
    return (stocked or context["inventory"])[0]


def _tag(context: dict[str, Any]) -> str:
    # One demo shop per area currency: the currency keeps partner ids apart.
    return str(supply_chain.shop_currency(context["business"]["fields"])).casefold()


def script(
    context: dict[str, Any], today: date, partner: dict[str, Any] | None = None
) -> list[SupplyDoc]:
    """The buyer's story: forecast → order create → order change (fewer, a day later)."""
    tag = _tag(context)
    product = _item(context)
    shop = supply_io.shop_party(context)
    partner = partner or {
        **buyer(tag),
        "system": SIZE_FORMAT[business_size(context["business"]["fields"])],
    }
    scale = int(partner.get("scale", 1))  # a chain's store orders in cases, not singles
    price = round(product["price"] * 0.8)  # the trade price a regular buyer gets
    currency = supply_chain.shop_currency(context["business"]["fields"])

    def doc(
        kind: str, number: str, quantity: float, day: date, ref: str = "", note: str = ""
    ) -> SupplyDoc:
        return SupplyDoc(
            kind=kind,  # type: ignore[arg-type]
            number=number,
            ref=ref,
            issued=today.isoformat(),
            delivery=day.isoformat(),
            currency=currency,
            buyer=Party(id=partner["id"], name=partner["name"], system=partner["system"]),
            supplier=Party(id=shop["id"], name=shop["name"]),
            lines=[
                DocLine(
                    line=10,
                    item=product["name"],
                    buyer_code="HC-0001",
                    quantity=quantity,
                    unit=product["unit"],
                    price=price,
                    total=price * round(quantity),
                )
            ],
            total=price * round(quantity),
            note=note,
        )

    number = "4700001201"
    return [
        doc(
            "FORECAST", "5500000301", 20 * scale, today + timedelta(days=2), note="Next week's need"
        ),
        doc("ORDERS", number, 20 * scale, today + timedelta(days=2)),
        doc("ORDER_CHANGE", "4700001202", 15 * scale, today + timedelta(days=3), ref=number),
    ]


def next_document(
    store: MerchantRepository, uid: str, bid: str, partner: dict[str, Any] | None = None
) -> dict[str, Any]:
    """The demo buyer sends its next document in the shop's size-appropriate channel."""
    context = store.context(uid, bid)
    if not context["inventory"]:
        raise HTTPException(409, "NO_ITEMS")
    today = supply_chain.shop_today(context)
    seen = {(row["kind"], row["number"]) for row in supply_io.inbox(store, bid)}
    for doc in script(context, today, partner):
        if (doc.kind, doc.number) in seen:
            continue
        raw = render(doc, SIZE_FORMAT[business_size(context["business"]["fields"])])
        read, fmt, _ = parse(raw, today)
        # A WhatsApp message's sender/recipient come from the conversation, not its body.
        read.buyer, read.supplier = doc.buyer, doc.supplier
        return supply_io.process(store, bid, context, read, fmt, raw, "parser")
    raise HTTPException(409, "DEMO_DONE")


# What each size buys, from whom, and how much: one reorder per list. Prices are minor units per
# unit (paise / cents) at the supplier's price; credit terms and channel come from the size.
Line = tuple[str, str, float, int]


class Plan:
    def __init__(
        self,
        name: str,
        kind: str,
        orders: list[list[Line]],
        codes: str = "",
        change: tuple[str, float] | None = None,
    ) -> None:
        self.name, self.kind, self.orders, self.codes, self.change = (
            name,
            kind,
            orders,
            codes,
            change,
        )


PLANS: dict[tuple[Size, str], Plan] = {
    # A cafe or stall: the wholesaler down the road, cash on delivery, WhatsApp.
    ("small", "INR"): Plan(
        "Sri Lakshmi Provisions (Demo)",
        "wholesaler",
        [
            [
                ("Milk", "litre", 30, 5400),
                ("Arabica-chicory blend", "kg", 5, 52000),
                ("Sugar", "kg", 10, 4400),
                ("Paper cups (50)", "pack", 10, 4000),
            ],
            [("Milk", "litre", 20, 5400), ("Paper cups (50)", "pack", 6, 4000)],
        ],
    ),
    ("small", profile("SG").currency): Plan(
        "Ah Huat Provision (Demo)",
        "wholesaler",
        [
            [
                ("Arabica-chicory blend", "kg", 5, 950),
                ("Evaporated milk", "pack", 24, 165),
                ("Sugar", "kg", 10, 190),
            ],
            [("Sliced bread", "pack", 12, 240), ("Paper cups (50)", "pack", 8, 250)],
        ],
    ),
    # Three outlets: the regional distributor, a week's credit, spreadsheet orders by email.
    ("mid", "INR"): Plan(
        "Anand Distributors (Demo)",
        "distributor",
        [
            [
                ("Sona masoori rice", "kg", 100, 5800),
                ("Toor dal", "kg", 50, 15500),
                ("Sunflower oil", "litre", 60, 12400),
            ],
            [("Atta", "kg", 80, 5400), ("Sunflower oil", "litre", 60, 12400)],
        ],
        change=("Sunflower oil", 48),
    ),
    # Twenty-plus outlets: an FMCG distributor on SAP, thirty days' credit.
    ("large", "INR"): Plan(
        "Bharat FMCG Distribution (Demo)",
        "fmcg",
        [
            [
                ("Instant noodles", "pack", 4800, 1150),
                ("Biscuits", "pack", 3600, 1600),
                ("Refined oil", "litre", 1200, 11200),
            ],
            [("Tea powder", "pack", 900, 10400), ("Detergent powder", "pack", 600, 8800)],
        ],
        codes="BF",
    ),
}
# The chain's own stores send the distribution centre their forecast, orders and changes by SAP.
STORES = {
    "id": "demo-inr-stores",
    "name": "Metro Store 14 (Demo)",
    "system": "idoc",
    "demo": True,
    "scale": 100,
}


def _plan(context: dict[str, Any]) -> tuple[Size, Plan]:
    size = business_size(context["business"]["fields"])
    currency = str(supply_chain.shop_currency(context["business"]["fields"]))
    return size, PLANS.get((size, currency)) or PLANS[(size, "INR")]


ORDERED_AGO, DELIVERED_AGO = 6, 3


def _supplier_order(
    context: dict[str, Any], today: date, size: Size, plan: Plan, index: int
) -> SupplyDoc:
    """An order the shop's supplier books for it, in the supplier's own channel."""
    tag = _tag(context)
    shop = supply_io.shop_party(context)
    fmt: Format = SIZE_FORMAT[size]
    partner = Party(id=f"demo-{tag}-{plan.kind}", name=plan.name, system=fmt)
    lines = plan.orders[index]
    number = {
        "small": f"W-{tag.upper()}-{2210 + index}",
        "mid": f"PO-FM-{2210 + index}",
        "large": str(4500091500 + index),
    }[size]
    # The first order is the one that already came: placed last week, delivered three days ago.
    issued, delivery = (
        (today - timedelta(days=ORDERED_AGO), today - timedelta(days=DELIVERED_AGO))
        if index == 0
        else (today, today + timedelta(days=index + 1))
    )
    return SupplyDoc(
        kind="ORDERS",
        number=number,
        issued=issued.isoformat(),
        delivery=delivery.isoformat(),
        currency=supply_chain.shop_currency(context["business"]["fields"]),
        buyer=Party(id=shop["id"], name=shop["name"]),
        supplier=partner,
        terms_days=SIZE_TERMS[size],
        lines=[
            DocLine(
                line=10 * (n + 1),
                item=name,
                supplier_code=f"{plan.codes}{1000 + n}" if plan.codes else "",
                quantity=quantity,
                unit=unit,
                price=price,
                total=round(price * quantity),
            )
            for n, (name, unit, quantity, price) in enumerate(lines)
        ],
        total=sum(round(price * quantity) for _, _, quantity, price in lines),
        note="Supplier order (demo)",
    )


def _supplier_loop(
    store: MerchantRepository, bid: str, po: dict[str, Any], fmt: Format, upto: int
) -> dict[str, Any]:
    """A large supplier's SAP loop on an order: ORDRSP, DELVRY07 (shipping notice), INVOIC02."""
    original = supply_chain.po_document(po)
    for step, kind in enumerate(("ORDRSP", "DESADV", "INVOIC")[:upto], start=1):
        if any(d["kind"] == kind for d in po["documents"]):
            continue
        doc = SupplyDoc.model_validate(
            {
                **original.model_dump(),
                "kind": kind,
                "number": str(7100000000 + int(po["number"][-3:]) * 10 + step),
                "ref": po["number"],
                "note": "Simulated demo document; no external system connected.",
            }
        )
        entry = supply_chain.document_entry(
            doc, "supplier", render(doc, fmt), fmt, render(doc, "json"), "json", [], "parser"
        )
        po["documents"].append(entry)
        supply_chain.apply_document(store, bid, po, doc, [])
    return supply_chain._save(store, bid, po)


def _backdate(
    store: MerchantRepository,
    uid: str,
    bid: str,
    po_id: str,
    today: date,
    fields: dict[str, Any],
) -> None:
    """A closed order's history happened in the past, in order: ordered and confirmed six days
    ago, sent off the day before delivery, billed with the goods and received three days ago. Each
    document is written again with its own date, so its text and the timeline agree."""
    zone = ZoneInfo(str(fields.get("timezone") or "Asia/Kolkata"))

    def at(ago: int, hour: int) -> float:
        return datetime.combine(today - timedelta(days=ago), time(hour), zone).timestamp()

    when = {
        "ORDERS": (ORDERED_AGO, 9),
        "ORDRSP": (ORDERED_AGO, 11),
        "DESADV": (DELIVERED_AGO + 1, 17),
        "RECEIPT": (DELIVERED_AGO, 10),
        "INVOIC": (DELIVERED_AGO, 9),
    }
    po = supply_chain.get_po(store, uid, bid, po_id)
    for entry in po["documents"]:
        ago, hour = when.get(entry["kind"], (DELIVERED_AGO, 12))
        entry["at"] = at(ago, hour)
        if entry.get("sent_at"):
            entry["sent_at"] = entry["at"]
        canonical = {
            **entry["canonical"],
            "issued": (today - timedelta(days=ago)).isoformat(),
            "delivery": (today - timedelta(days=DELIVERED_AGO)).isoformat(),
        }
        doc = SupplyDoc.model_validate(canonical)
        entry["canonical"] = doc.model_dump(mode="json")
        entry["raw"] = render(doc, entry["raw_format"])
        entry["translated"] = render(doc, entry["translated_format"])
    po["documents"].sort(key=lambda entry: entry["at"])
    po["created"] = po["documents"][0]["at"]
    po["received_at"] = at(DELIVERED_AGO, 10)
    for key, kind in (
        ("sent_at", "ORDERS"),
        ("confirmed_at", "ORDRSP"),
        ("dispatched_at", "DESADV"),
        ("invoiced_at", "INVOIC"),
    ):
        if po.get(key):
            po[key] = at(*when[kind])
    po["delivery"] = (today - timedelta(days=DELIVERED_AGO)).isoformat()
    supply_chain._save(store, bid, po)


def _supplier_change(
    store: MerchantRepository,
    bid: str,
    context: dict[str, Any],
    today: date,
    plan: Plan,
    fmt: Format,
) -> None:
    """The distributor trims the second order (short on oil): a CSV order change the owner
    has to accept."""
    assert plan.change
    item, quantity = plan.change
    original = _supplier_order(context, today, "mid", plan, 1)
    shop = supply_io.shop_party(context)
    lines = [
        line.model_copy(
            update={
                "quantity": quantity if line.item == item else line.quantity,
                "total": round((line.price or 0) * quantity) if line.item == item else line.total,
            }
        )
        for line in original.lines
    ]
    change = SupplyDoc(
        kind="ORDER_CHANGE",
        number="CH-FM-2211",
        ref=original.number,
        issued=today.isoformat(),
        delivery=(today + timedelta(days=3)).isoformat(),
        currency=original.currency,
        buyer=Party(id=shop["id"], name=shop["name"]),
        supplier=original.supplier,
        lines=lines,
        total=sum(line.total or 0 for line in lines),
        note=f"{item}: short, sending {quantity:g} (demo)",
    )
    supply_io.process(
        store, bid, context, change, fmt, render(change, fmt), "parser", original.supplier.id
    )


def seed_shop(store: MerchantRepository, uid: str, bid: str) -> None:
    """Preload one shop in the channel its size uses: orders from its supplier (the first one
    received, with a goods receipt sent), and for a chain the partner documents too.
    Idempotent: documents already processed are not processed again."""
    context = store.context(uid, bid)
    if not context["inventory"]:
        return
    today = supply_chain.shop_today(context)
    size, plan = _plan(context)
    fmt: Format = SIZE_FORMAT[size]
    for index in range(len(plan.orders)):
        order = _supplier_order(context, today, size, plan, index)
        result = supply_io.process(store, bid, context, order, fmt, render(order, fmt), "parser")
        po = result["order"]
        if po is None or result.get("duplicate"):
            continue
        if index == 0 or size == "large":
            # The order that came went the whole way: confirmed, sent off, billed.
            po = _supplier_loop(store, bid, po, fmt, 3 if index == 0 else 2)
        if index == 0 and not po.get("received"):
            saved = supply_outbound.record_receipt(store, uid, bid, po["id"], po["version"])
            supply_outbound.send(
                store, uid, bid, po["id"], saved["order"]["version"], saved["document"]["id"]
            )
            _backdate(store, uid, bid, po["id"], today, context["business"]["fields"])
    if size == "mid":
        _supplier_change(store, bid, context, today, plan, fmt)
    if size != "large":
        return
    for _ in range(3):
        try:
            next_document(store, uid, bid, STORES)
        except HTTPException:
            break
    sold = next(
        (
            po
            for po in supply_chain.all_orders(store, bid)
            if supply_io.direction_of(po) == "out" and po["status"] not in supply_io.CLOSED
        ),
        None,
    )
    if sold and sold.get("pending_change"):
        sold = supply_io.accept_change(store, uid, bid, sold["id"], sold["version"])
    if sold and not any(d["kind"] == "DESADV" for d in sold["documents"]):
        supply_outbound.prepare_asn(store, uid, bid, sold["id"], sold["version"])


def seed(
    store: MerchantRepository,
    uid: str = "demo-world-owner",
    city: str | None = None,
    owner_uid: str | None = None,
) -> None:
    """The first demo shop of each area currency (small, WhatsApp), then the two chains.
    The chains belong to the seed owner and are also attached to owner_uid when given."""
    seen: set[str] = set()
    for demo in SHOPS:
        if city and demo.city != city:
            continue
        if demo.fields.currency not in seen:
            seen.add(demo.fields.currency)
            seed_shop(store, uid, demo.id)
    for chain in CHAINS:
        if city and chain.city != city:
            continue
        store.seed_demo_shop(uid, chain.id, chain.fields, chain.products)
        if owner_uid:
            store.attach_demo_owner(uid, chain.id, owner_uid)
        seed_shop(store, uid, chain.id)
