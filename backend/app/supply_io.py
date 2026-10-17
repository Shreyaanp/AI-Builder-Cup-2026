"""Partner documents in and out: what came in, what needs the owner, and what must go out.

INBOUND. A partner's order create (ORDERS), order change (ORDER_CHANGE) or forecast (FORECAST)
arrives in the partner's system format (SAP IDoc XML, CSV, JSON or a typed message). It is read
(the deterministic parsers; Gemini only for a format they cannot read, when live), validated,
linked to the order, the shop's item and the partner, and saved. Every document lands in the
shop's inbox with what it changed and a status (new, needs_you, done, problem). A supplier's
confirmation, shipping notice or invoice for one of the shop's purchase orders goes through the
purchase-order loop (supply_chain.py) and is listed in the inbox too.

OUTBOUND. Goods that came in get a goods receipt (RECEIPT; SAP proof of delivery STPPOD on
DELVRY07), pre-filled from the shipping notice or the order: the owner fixes only differences.
Goods going out get a shipping notice (DESADV on DELVRY07). Both are written in the partner's
format and wait as pending until sent; Close the day lists what is unsent and sends it in one tap.

Direction, per order: "in" when goods come to the shop (the partner is its supplier), "out" when
the shop ships to the partner (the partner is its buyer). No live EDI network is connected:
"sent" means the document is final and shared with the partner (simulated for demo partners).
"""

from __future__ import annotations

import re
import time
from datetime import date, timedelta
from typing import Any

import structlog
from fastapi import HTTPException
from pydantic import ValidationError

from . import supply_chain
from .merchant import MerchantRepository
from .region import shop_currency
from .supply_docs import MAPPING, DocLine, Format, Party, SupplyDoc, map_line, parse, render
from .supply_docs import unit_from_code as unit_of

log = structlog.get_logger()

INBOX = supply_chain.INBOX
MAX_INBOX = 60
SHOWN_INBOX = 30
CLOSED = {"closed", "cancelled"}
# Documents a supplier sends about one of the shop's purchase orders (supply_chain.ingest).
LOOP_KINDS = {"ORDRSP", "DESADV", "INVOIC"}
RECEIPT_SERIES = 5000000000  # SAP material documents (goods movements) start with 50…
ASN_SERIES = 8000090000


# ---------------------------------------------------------------------------------------------
# Parties and lookups


def shop_party(context: dict[str, Any]) -> dict[str, Any]:
    business = context["business"]
    return {
        "id": business["id"],
        "name": business["fields"]["name"],
        "system": "json",
        "demo": False,
    }


def partner_of(po: dict[str, Any]) -> dict[str, Any]:
    """The other side of the order: its supplier for goods coming in, its buyer otherwise."""
    return po.get("partner") or po["supplier"]


def direction_of(po: dict[str, Any]) -> str:
    return str(po.get("direction") or "in")


def _same(a: str, b: str) -> bool:
    return bool(a.strip()) and a.strip().casefold() == b.strip().casefold()


def _is_shop(party: Party, shop: dict[str, Any]) -> bool:
    return _same(party.id, shop["id"]) or _same(party.name, shop["name"])


def _slug(name: str) -> str:
    return "partner-" + re.sub(r"[^a-z0-9]+", "-", name.casefold()).strip("-")[:40]


def known_partners(store: MerchantRepository, bid: str) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    for po in supply_chain.all_orders(store, bid):
        seen.setdefault(partner_of(po)["id"], partner_of(po))
    for entry in inbox(store, bid):
        if entry.get("partner"):
            seen.setdefault(entry["partner"]["id"], entry["partner"])
    return list(seen.values())


def resolve_partner(
    party: Party, fmt: Format, known: list[dict[str, Any]], hint: str = ""
) -> dict[str, Any] | None:
    """The partner a document is from: a known one by id or name, else a new record. Its system
    is the format it writes, so what we send back is in that format too."""
    if hint:
        found = next((row for row in known if row["id"] == hint), None)
        if found:
            return {**found, "system": fmt}
    pid = party.id.strip().casefold() or (_slug(party.name) if party.name.strip() else "")
    if not pid:
        return None
    for row in known:
        if row["id"] == pid or _same(row.get("name", ""), party.name):
            return {**row, "system": fmt}
    name = (party.name or party.id).strip()[:120]
    demo = pid.startswith("demo-") or "(demo)" in name.casefold()
    return {"id": pid[:80], "name": name, "system": fmt, "demo": demo}


def _product(name: str, inventory: list[dict[str, Any]]) -> dict[str, Any] | None:
    from .sourcing import matches

    return next(
        (p for p in inventory if _same(p["name"], name)),
        next(
            (p for p in inventory if matches(p["name"], name) or matches(name, p["name"])),
            None,
        ),
    )


def find_order(
    store: MerchantRepository, bid: str, number: str, partner_id: str = ""
) -> dict[str, Any] | None:
    found = [
        po
        for po in supply_chain.all_orders(store, bid)
        if number
        and po["number"] == number
        and (not partner_id or partner_of(po)["id"] == partner_id)
    ]
    return found[0] if found else None


# ---------------------------------------------------------------------------------------------
# The inbox


def inbox(store: MerchantRepository, bid: str) -> list[dict[str, Any]]:
    return store.feature_docs.scoped(INBOX, bid, MAX_INBOX)


def _put_entry(store: MerchantRepository, bid: str, entry: dict[str, Any]) -> dict[str, Any]:
    store.feature_docs.put(INBOX, f"{bid}/{entry['id']}", bid, float(entry["created"]), entry)
    return entry


def _set_entry(store: MerchantRepository, bid: str, entry_id: str, **fields: Any) -> None:
    def change(old: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        if old is None:
            raise HTTPException(404, "Document not found.")
        return float(old.get("created", time.time())), {**old, **fields}

    store.feature_docs.update(INBOX, f"{bid}/{entry_id}", bid, change)


def _entry(
    doc: SupplyDoc,
    fmt: Format,
    raw: str,
    reader: str,
    partner: dict[str, Any] | None,
    direction: str,
    order_id: str,
    status: str,
    changes: list[dict[str, Any]],
    problem: str = "",
) -> dict[str, Any]:
    now = time.time()
    return {
        "id": _id(),
        "kind": doc.kind,
        "number": doc.number,
        "ref": doc.ref,
        "at": now,
        "created": now,
        "partner": partner,
        "direction": direction,
        "order_id": order_id,
        "status": status,
        "problem": problem,
        "changes": changes,
        "lines": [
            {"line": x.line, "item": x.item, "quantity": x.quantity, "unit": x.unit}
            for x in doc.lines
        ],
        "delivery": doc.delivery,
        "raw": raw[:20_000],
        "raw_format": fmt,
        "reader": reader,
    }


def _id() -> str:
    from uuid import uuid4

    return uuid4().hex[:12]


def _order_document(
    doc: SupplyDoc, fmt: Format, raw: str, reader: str, sender: str
) -> dict[str, Any]:
    """A partner's document on the order's timeline, mapped from the format it came in."""
    entry = supply_chain.document_entry(
        doc,
        sender="supplier",  # the mapping shown is the sender's format
        raw=raw,
        raw_format=fmt,
        translated=render(doc, "json"),
        translated_format="json",
        flags=[],
        reader=reader,
    )
    entry["from"] = sender
    entry["direction"] = "in"
    entry["mapping"] = [{"field": a, "source": b} for a, b in MAPPING[fmt]]
    return entry


# ---------------------------------------------------------------------------------------------
# Inbound: read, validate, link, save


async def receive_document(
    store: MerchantRepository, uid: str, bid: str, text: str, partner_id: str = ""
) -> dict[str, Any]:
    """A document from a partner in any format we read. Returns the inbox entry and the order
    it created or changed (if any)."""
    import anyio

    context = await anyio.to_thread.run_sync(store.context, uid, bid)
    today = supply_chain.shop_today(context)
    try:
        doc, fmt, _ = parse(text, today)
        reader = "parser"
    except ValueError as error:
        translator = supply_chain._translator()
        if not translator.live:
            log.info("supply_inbound_unreadable", reason=str(error)[:120])
            raise HTTPException(422, "UNREADABLE_DOCUMENT") from error
        try:
            doc, _flags, reader, fmt = await translator.read(text, None, today)
        except (ValueError, ValidationError) as failure:
            raise HTTPException(422, "UNREADABLE_DOCUMENT") from failure
    if doc.kind in LOOP_KINDS:
        return await _loop_document(store, bid, context, doc, fmt, text, today)
    return await anyio.to_thread.run_sync(
        process, store, bid, context, doc, fmt, text, reader, partner_id
    )


async def _loop_document(
    store: MerchantRepository,
    bid: str,
    context: dict[str, Any],
    doc: SupplyDoc,
    fmt: Format,
    raw: str,
    today: date,
) -> dict[str, Any]:
    """A supplier's confirmation, shipping notice or invoice for one of the shop's POs."""
    import anyio

    po = await anyio.to_thread.run_sync(find_order, store, bid, doc.ref)
    if po is None or direction_of(po) != "in":
        entry = _entry(doc, fmt, raw, "parser", None, "in", "", "problem", [], "unknown_order")
        await anyio.to_thread.run_sync(_put_entry, store, bid, entry)
        return {"entry": entry, "order": None}
    saved = await supply_chain.ingest(store, bid, po, raw, today, simulated=False)
    waiting = saved["status"] == "changed" or bool(saved.get("open_flags"))
    entry = _entry(
        doc,
        fmt,
        raw,
        saved["documents"][-1].get("reader", "parser"),
        partner_of(saved),
        "in",
        saved["id"],
        "needs_you" if waiting else "new",
        list(saved.get("changes") or []),
    )
    await anyio.to_thread.run_sync(_put_entry, store, bid, entry)
    return {"entry": entry, "order": saved}


def process(
    store: MerchantRepository,
    bid: str,
    context: dict[str, Any],
    doc: SupplyDoc,
    fmt: Format,
    raw: str,
    reader: str = "parser",
    partner_id: str = "",
) -> dict[str, Any]:
    """Validate an order create, order change or forecast and save what it means."""
    if doc.kind not in {"ORDERS", "ORDER_CHANGE", "FORECAST"}:
        raise HTTPException(422, "NOT_INBOUND")
    for entry in inbox(store, bid):
        if entry["kind"] == doc.kind and entry["number"] == doc.number:
            # The same document again (a resend): nothing changes twice.
            order = (
                store.feature_docs.get(supply_chain.ORDERS, f"{bid}/{entry['order_id']}")
                if entry.get("order_id")
                else None
            )
            return {"entry": entry, "order": order, "duplicate": True}
    if doc.currency in {"", "XXX"}:
        doc.currency = shop_currency(context["business"]["fields"])
    if doc.kind == "ORDER_CHANGE":
        return _order_change(store, bid, context, doc, fmt, raw, reader, partner_id)
    shop = shop_party(context)
    if _is_shop(doc.supplier, shop):
        direction, party = "out", doc.buyer
    elif _is_shop(doc.buyer, shop):
        direction, party = "in", doc.supplier
    elif doc.buyer.id or doc.buyer.name:
        # A partner's order or forecast, written by its buying side.
        direction, party = "out", doc.buyer
    else:
        direction, party = "in", doc.supplier
    partner = resolve_partner(party, fmt, known_partners(store, bid), partner_id)
    if partner is None:
        raise HTTPException(422, "UNKNOWN_PARTNER")
    if doc.kind == "FORECAST":
        return _forecast(store, bid, context, doc, fmt, raw, reader, partner, direction)
    return _order_create(store, bid, context, doc, fmt, raw, reader, partner, direction)


def _lines(doc: SupplyDoc, inventory: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str]:
    """Order lines linked to the shop's items, and the first problem found (or '')."""
    lines: list[dict[str, Any]] = []
    problem = ""
    for got in doc.lines:
        unit = unit_of(got.unit)
        product = _product(got.item, inventory)
        if unit is None:
            problem = problem or "unit"
        if got.quantity <= 0:
            problem = problem or "quantity"
        lines.append(
            {
                "line": got.line,
                "item": product["name"] if product else got.item,
                "partner_item": got.item,
                "product": product["name"] if product else "",
                "buyer_code": got.buyer_code,
                "supplier_code": got.supplier_code,
                "quantity": got.quantity,
                "unit": unit or got.unit or "piece",
                "price": got.price,
                "total": got.total
                if got.total is not None
                else (round(got.price * got.quantity) if got.price is not None else None),
            }
        )
    return lines, problem


def _order_create(
    store: MerchantRepository,
    bid: str,
    context: dict[str, Any],
    doc: SupplyDoc,
    fmt: Format,
    raw: str,
    reader: str,
    partner: dict[str, Any],
    direction: str,
) -> dict[str, Any]:
    lines, problem = _lines(doc, context["inventory"])
    if direction == "out" and any(not line["product"] for line in lines):
        problem = problem or "unknown_item"  # they ordered something the shop does not sell
    shop = shop_party(context)
    today = supply_chain.shop_today(context)
    now = time.time()
    po: dict[str, Any] = {
        "id": _id(),
        "number": doc.number,
        "created": now,
        "status": "confirmed",
        "sent": True,
        "received": False,
        "simulated": bool(partner.get("demo")),
        "currency": doc.currency,
        "direction": direction,
        "origin": "partner",
        "partner": partner,
        "buyer": partner if direction == "out" else shop,
        "supplier": shop if direction == "out" else partner,
        "lines": lines,
        "delivery": doc.delivery or (today + timedelta(days=1)).isoformat(),
        "terms_days": doc.terms_days or 0,
        "total": sum(line["total"] or 0 for line in lines),
        "documents": [
            _order_document(doc, fmt, raw, reader, "buyer" if direction == "out" else "supplier")
        ],
        "checks": [],
        "backorders": [],
        "problem": problem,
        "pending_change": None,
        "reason": None,
    }
    entry = _entry(
        doc,
        fmt,
        raw,
        reader,
        partner,
        direction,
        po["id"],
        "problem" if problem else "new",
        [{"code": "created", "lines": len(lines)}],
        problem,
    )
    # A forecast from this partner for these items now belongs to this order.
    items = {line["item"].casefold() for line in lines}
    for earlier in inbox(store, bid):
        if (
            earlier["kind"] == "FORECAST"
            and not earlier.get("order_id")
            and (earlier.get("partner") or {}).get("id") == partner["id"]
            and items & {line["item"].casefold() for line in earlier.get("linked", [])}
        ):
            _set_entry(store, bid, earlier["id"], order_id=po["id"], status="done")
            po["forecast"] = earlier["id"]
    if direction == "in":
        try:
            supply_chain.ensure_relationship(
                store, bid, partner, doc.currency, len(known_partners(store, bid))
            )
        except HTTPException:
            pass
    saved = supply_chain._versioned(store, supply_chain.ORDERS, bid, po["id"], po, 0)
    _put_entry(store, bid, entry)
    return {"entry": entry, "order": saved}


def _forecast(
    store: MerchantRepository,
    bid: str,
    context: dict[str, Any],
    doc: SupplyDoc,
    fmt: Format,
    raw: str,
    reader: str,
    partner: dict[str, Any],
    direction: str,
) -> dict[str, Any]:
    lines, problem = _lines(doc, context["inventory"])
    if any(not line["product"] for line in lines):
        problem = problem or "unknown_item"
    order = next(
        (
            po
            for po in supply_chain.all_orders(store, bid)
            if partner_of(po)["id"] == partner["id"]
            and po["status"] not in CLOSED
            and {x["item"].casefold() for x in po["lines"]} & {x["item"].casefold() for x in lines}
        ),
        None,
    )
    entry = _entry(
        doc,
        fmt,
        raw,
        reader,
        partner,
        direction,
        order["id"] if order else "",
        "problem" if problem else "new",
        [
            {
                "code": "forecast",
                "item": line["item"],
                "quantity": line["quantity"],
                "unit": line["unit"],
                "date": doc.delivery,
            }
            for line in lines
        ],
        problem,
    )
    entry["linked"] = [{"item": line["item"], "product": line["product"]} for line in lines]
    _put_entry(store, bid, entry)
    return {"entry": entry, "order": order}


def _order_change(
    store: MerchantRepository,
    bid: str,
    context: dict[str, Any],
    doc: SupplyDoc,
    fmt: Format,
    raw: str,
    reader: str,
    partner_id: str,
) -> dict[str, Any]:
    po = find_order(store, bid, doc.ref, partner_id) or find_order(store, bid, doc.ref)
    if po is None:
        entry = _entry(doc, fmt, raw, reader, None, "out", "", "problem", [], "unknown_order")
        _put_entry(store, bid, entry)
        return {"entry": entry, "order": None}
    partner = partner_of(po)
    late = po["status"] in CLOSED or po.get("received") or _sent(po, "DESADV")
    changes, lines, delivery = diff(po, doc, context["inventory"])
    status = "problem" if late else "needs_you" if changes else "done"
    entry = _entry(
        doc,
        fmt,
        raw,
        reader,
        partner,
        direction_of(po),
        po["id"],
        status,
        changes,
        "too_late" if late else "",
    )
    if changes and not late:
        po["pending_change"] = {
            "entry_id": entry["id"],
            "number": doc.number,
            "changes": changes,
            "lines": lines,
            "delivery": delivery,
            "at": entry["at"],
        }
    po["documents"].append(
        _order_document(doc, fmt, raw, reader, po["documents"][0].get("from", "buyer"))
        if po["documents"]
        else _order_document(doc, fmt, raw, reader, "buyer")
    )
    saved = supply_chain._save(store, bid, po)
    _put_entry(store, bid, entry)
    return {"entry": entry, "order": saved}


def diff(
    po: dict[str, Any], doc: SupplyDoc, inventory: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    """What an order change changes: (changes in plain codes, the new lines, the new date).
    Lines the change does not mention stay as they are."""
    lines = [dict(line) for line in po["lines"]]
    by_partner = [{**line, "item": line.get("partner_item") or line["item"]} for line in lines]
    changes: list[dict[str, Any]] = []
    for got in doc.lines:
        match = map_line(got, lines) or map_line(got, by_partner)
        unit = unit_of(got.unit) or got.unit
        if match is None:
            if got.quantity <= 0:
                continue
            product = _product(got.item, inventory)
            line = {
                "line": max([x["line"] for x in lines] or [0]) + 10,
                "item": product["name"] if product else got.item,
                "partner_item": got.item,
                "product": product["name"] if product else "",
                "buyer_code": got.buyer_code,
                "supplier_code": got.supplier_code,
                "quantity": got.quantity,
                "unit": unit,
                "price": got.price,
                "total": round(got.price * got.quantity) if got.price is not None else None,
            }
            lines.append(line)
            changes.append(
                {"code": "added", "item": line["item"], "now": got.quantity, "unit": unit}
            )
            continue
        target = next(x for x in lines if x["line"] == match[0]["line"])
        if got.status == "rejected" or got.quantity <= 0:
            changes.append(
                {
                    "code": "removed",
                    "item": target["item"],
                    "was": target["quantity"],
                    "unit": target["unit"],
                }
            )
            target["quantity"] = 0
            target["total"] = 0
            continue
        if abs(got.quantity - float(target["quantity"])) > 1e-6:
            changes.append(
                {
                    "code": "quantity",
                    "item": target["item"],
                    "was": target["quantity"],
                    "now": got.quantity,
                    "unit": target["unit"],
                }
            )
            target["quantity"] = got.quantity
        if (
            got.price is not None
            and target.get("price") is not None
            and got.price != target["price"]
        ):
            changes.append(
                {"code": "price", "item": target["item"], "was": target["price"], "now": got.price}
            )
            target["price"] = got.price
        if target.get("price") is not None:
            target["total"] = round(target["price"] * float(target["quantity"]))
    delivery = po.get("delivery", "")
    if doc.delivery and doc.delivery != delivery:
        changes.append({"code": "date", "was": delivery, "now": doc.delivery})
        delivery = doc.delivery
    if "cancel" in doc.note.casefold() or (lines and all(not x["quantity"] for x in lines)):
        changes = [{"code": "cancelled"}]
    return changes, lines, delivery


def accept_change(
    store: MerchantRepository, uid: str, bid: str, po_id: str, version: int, accept: bool = True
) -> dict[str, Any]:
    """The owner's answer to a partner's order change (or a supplier's changed confirmation)."""
    po = supply_chain.get_po(store, uid, bid, po_id)
    supply_chain._check_version(po, version)
    pending = po.get("pending_change")
    if not pending:
        if po["status"] == "changed" and accept:
            return supply_chain.accept(store, uid, bid, po_id, version)
        raise HTTPException(409, "NOTHING_TO_ACCEPT")
    if accept:
        po["lines"] = pending["lines"]
        po["delivery"] = pending["delivery"] or po["delivery"]
        po["total"] = sum(line.get("total") or 0 for line in po["lines"])
        if any(change["code"] == "cancelled" for change in pending["changes"]):
            po["status"] = "cancelled"
    po.setdefault("change_history", []).append(
        {
            "at": time.time(),
            "number": pending["number"],
            "changes": pending["changes"],
            "accepted": accept,
        }
    )
    po["pending_change"] = None
    saved = supply_chain._save(store, bid, po)
    _set_entry(store, bid, pending["entry_id"], status="done", accepted=accept)
    return saved


def dismiss(store: MerchantRepository, uid: str, bid: str, entry_id: str) -> dict[str, Any]:
    """The owner has seen a problem document (dealt with it outside the app)."""
    supply_chain._owned(store, uid, bid)
    _set_entry(store, bid, entry_id, status="done")
    found = store.feature_docs.get(INBOX, f"{bid}/{entry_id}")
    assert found is not None
    return found


# ---------------------------------------------------------------------------------------------
# Outbound: goods receipt and shipping notice


def _sent(po: dict[str, Any], kind: str) -> bool:
    return any(
        d["kind"] == kind and d.get("direction") == "out" and d.get("status") == "sent"
        for d in po["documents"]
    )


def _pending(po: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        d for d in po["documents"] if d.get("direction") == "out" and d.get("status") == "pending"
    ]


def expected(po: dict[str, Any]) -> dict[int, float]:
    """Per line, what should arrive: the shipping notice, else the confirmation, else the order."""
    return {
        line["line"]: float(line.get("shipped", line.get("confirmed", line["quantity"])))
        for line in po["lines"]
    }


def _party(row: dict[str, Any]) -> Party:
    return Party(id=row.get("id", ""), name=row.get("name", ""), system=row.get("system", "json"))


def _outbound(po: dict[str, Any], doc: SupplyDoc) -> dict[str, Any]:
    system: Format = partner_of(po).get("system") or "json"
    entry = supply_chain.document_entry(
        doc,
        sender="buyer",
        raw=render(doc, "json"),
        raw_format="json",
        translated=render(doc, system),
        translated_format=system,
        flags=[],
        reader="template",
    )
    entry["from"] = "buyer" if doc.kind == "RECEIPT" else "supplier"
    entry["direction"] = "out"
    entry["status"] = "pending"
    return entry


def _receipt_entry(
    store: MerchantRepository,
    bid: str,
    context: dict[str, Any],
    po: dict[str, Any],
    amounts: dict[int, float],
    note: str = "",
) -> dict[str, Any]:
    want = expected(po)
    today = supply_chain.shop_today(context)
    n = supply_chain._next_number(store, bid, "receipt")
    doc = SupplyDoc(
        kind="RECEIPT",
        number=str(RECEIPT_SERIES + n),
        ref=po["number"],
        issued=today.isoformat(),
        delivery=today.isoformat(),
        currency=po["currency"],
        buyer=_party(shop_party(context)),
        supplier=_party(partner_of(po)),
        lines=[
            DocLine(
                line=line["line"],
                item=(line.get("partner_item") or line["item"])[:120],
                buyer_code=line.get("buyer_code", ""),
                supplier_code=line.get("supplier_code", ""),
                quantity=amounts.get(line["line"], want[line["line"]]),
                unit=line["unit"],
                expected=want[line["line"]],
            )
            for line in po["lines"]
            if want[line["line"]] or amounts.get(line["line"])
        ]
        or [DocLine(line=10, item="?", quantity=0, unit="piece")],
        note=note[:300],
    )
    entry = _outbound(po, doc)
    entry["short"] = [
        {
            "item": line["item"],
            "quantity": round(
                want[line["line"]] - amounts.get(line["line"], want[line["line"]]), 3
            ),
            "unit": line["unit"],
        }
        for line in po["lines"]
        if amounts.get(line["line"], want[line["line"]]) < want[line["line"]] - 1e-6
    ]
    return entry


def record_receipt(
    store: MerchantRepository,
    uid: str,
    bid: str,
    po_id: str,
    version: int,
    received: dict[int, float] | None = None,
    note: str = "",
) -> dict[str, Any]:
    """Goods came in. received: the quantity per line that actually arrived (lines left out
    arrived in full). The goods receipt waits as pending until sent; the stock update goes to
    the owner's usual review the first time."""
    context = supply_chain._owned(store, uid, bid)
    po = supply_chain.get_po(store, uid, bid, po_id)
    supply_chain._check_version(po, version)
    if direction_of(po) != "in":
        raise HTTPException(409, "NOT_INCOMING")
    if po["status"] in CLOSED | {"draft"}:
        raise HTTPException(409, "NOTHING_TO_RECEIVE")
    if _sent(po, "RECEIPT"):
        raise HTTPException(409, "ALREADY_SENT")
    want = expected(po)
    amounts = {
        line: max(0.0, min(1_000_000.0, float((received or {}).get(line, qty))))
        for line, qty in want.items()
    }
    entry = _receipt_entry(store, bid, context, po, amounts, note)
    po["documents"] = [
        d for d in po["documents"] if not (d["kind"] == "RECEIPT" and d.get("status") == "pending")
    ] + [entry]
    proposal = None
    if not po.get("received"):
        changed, proposal = supply_chain.restock(store, uid, bid, context, po, amounts)
        po["received_stock"] = {name: product.stock for name, product in changed.items()}
        po["received_at"] = time.time()
    po["received"] = True
    po["received_lines"] = {str(line): qty for line, qty in amounts.items()}
    po["shortage"] = entry["short"]
    if po["status"] in {"sent", "changed", "confirmed", "dispatched"}:
        po["status"] = "received"
    saved = supply_chain._save(store, bid, po)
    return {"order": saved, "proposal": proposal, "document": entry}


def prepare_asn(
    store: MerchantRepository,
    uid: str,
    bid: str,
    po_id: str,
    version: int,
    shipped: dict[int, float] | None = None,
) -> dict[str, Any]:
    """The shipping notice for goods the shop sends the partner, pre-filled from the order."""
    context = supply_chain._owned(store, uid, bid)
    po = supply_chain.get_po(store, uid, bid, po_id)
    supply_chain._check_version(po, version)
    if direction_of(po) != "out":
        raise HTTPException(409, "NOT_OUTGOING")
    if po["status"] in CLOSED:
        raise HTTPException(409, "NOTHING_TO_SHIP")
    if po.get("pending_change"):
        raise HTTPException(409, "ACCEPT_CHANGE_FIRST")
    if _sent(po, "DESADV"):
        raise HTTPException(409, "ALREADY_SENT")
    today = supply_chain.shop_today(context)
    n = supply_chain._next_number(store, bid, "asn")
    amounts = {
        line["line"]: max(0.0, float((shipped or {}).get(line["line"], line["quantity"])))
        for line in po["lines"]
    }
    doc = SupplyDoc(
        kind="DESADV",
        number=str(ASN_SERIES + n),
        ref=po["number"],
        issued=today.isoformat(),
        delivery=po.get("delivery") or today.isoformat(),
        currency=po["currency"],
        buyer=_party(partner_of(po)),
        supplier=_party(shop_party(context)),
        lines=[
            DocLine(
                line=line["line"],
                item=(line.get("partner_item") or line["item"])[:120],
                buyer_code=line.get("buyer_code", ""),
                supplier_code=line.get("supplier_code", ""),
                quantity=amounts[line["line"]],
                unit=line["unit"],
            )
            for line in po["lines"]
            if amounts[line["line"]]
        ]
        or [DocLine(line=10, item="?", quantity=0, unit="piece")],
    )
    entry = _outbound(po, doc)
    po["documents"] = [
        d for d in po["documents"] if not (d["kind"] == "DESADV" and d.get("status") == "pending")
    ] + [entry]
    saved = supply_chain._save(store, bid, po)
    return {"order": saved, "document": entry}


def send(
    store: MerchantRepository, uid: str, bid: str, po_id: str, version: int, doc_id: str
) -> dict[str, Any]:
    """The document goes to the partner; for a demo partner the delivery is simulated."""
    po = supply_chain.get_po(store, uid, bid, po_id)
    supply_chain._check_version(po, version)
    return supply_chain._save(store, bid, _mark_sent(po, doc_id))


def _mark_sent(po: dict[str, Any], doc_id: str) -> dict[str, Any]:
    document = next(
        (d for d in po["documents"] if d["id"] == doc_id and d.get("direction") == "out"), None
    )
    if document is None:
        raise HTTPException(404, "Document not found.")
    if document.get("status") == "sent":
        raise HTTPException(409, "ALREADY_SENT")
    now = time.time()
    document["status"] = "sent"
    document["sent_at"] = now
    if document["kind"] == "DESADV":
        po["shipped_at"] = now
        po["status"] = "closed"
        po["closed_at"] = now
    elif po.get("origin") == "partner":
        po["status"] = "closed"  # no invoice loop for a partner's own order
        po["closed_at"] = now
    return po


def unsent(store: MerchantRepository, bid: str) -> list[dict[str, Any]]:
    """What must still go out: pending documents, and goods received without a receipt."""
    found = []
    for po in supply_chain.all_orders(store, bid):
        if po["status"] == "cancelled":
            continue
        for document in _pending(po):
            found.append(_unsent_row(po, document["kind"], document))
        missing = (
            direction_of(po) == "in"
            and po.get("received")
            and not any(
                d["kind"] == "RECEIPT" and d.get("direction") == "out" for d in po["documents"]
            )
        )
        if missing:
            found.append(_unsent_row(po, "RECEIPT", None))
    return found


def _unsent_row(po: dict[str, Any], kind: str, document: dict[str, Any] | None) -> dict[str, Any]:
    lines = (document or {}).get("canonical", {}).get("lines") or [
        {"item": line["item"], "quantity": line["quantity"], "unit": line["unit"]}
        for line in po["lines"]
    ]
    return {
        "order_id": po["id"],
        "number": po["number"],
        "kind": kind,
        "doc_id": document["id"] if document else None,
        "partner": partner_of(po)["name"],
        "demo": bool(partner_of(po).get("demo")),
        "lines": [{"item": x["item"], "quantity": x["quantity"], "unit": x["unit"]} for x in lines],
        "short": (document or {}).get("short", []),
    }


def send_all(store: MerchantRepository, uid: str, bid: str) -> dict[str, Any]:
    """Close the day: every pending receipt and shipping notice goes out in one tap; goods
    received without a receipt get one (as received) first."""
    context = supply_chain._owned(store, uid, bid)
    sent = []
    for row in unsent(store, bid):
        po = store.feature_docs.get(supply_chain.ORDERS, f"{bid}/{row['order_id']}")
        if po is None:
            continue
        doc_id = row["doc_id"]
        if doc_id is None:
            amounts = {
                int(line): float(qty) for line, qty in (po.get("received_lines") or {}).items()
            } or expected(po)
            entry = _receipt_entry(store, bid, context, po, amounts)
            po["documents"].append(entry)
            doc_id = entry["id"]
        po = supply_chain._save(store, bid, _mark_sent(po, doc_id))
        sent.append({**row, "doc_id": doc_id})
    return {"sent": sent, "unsent": unsent(store, bid)}


# ---------------------------------------------------------------------------------------------
# What the phone shows: five statuses, one timeline per order, tasks that need the owner


def tasks(
    orders: list[dict[str, Any]], entries: list[dict[str, Any]], today: date
) -> list[dict[str, Any]]:
    """Everything that needs the owner now, most urgent first. Normal, on-time documents
    stay quiet."""
    found: list[dict[str, Any]] = []
    iso = today.isoformat()
    for po in orders:
        if po["status"] == "cancelled":
            continue
        base = {"order_id": po["id"], "number": po["number"], "partner": partner_of(po)["name"]}
        if po["status"] == "draft" and not po.get("blocked"):
            found.append({**base, "code": "approve_po", "status": "needs_you"})
        if po.get("pending_change"):
            found.append(
                {
                    **base,
                    "code": "accept_change",
                    "status": "needs_you",
                    "changes": po["pending_change"]["changes"],
                }
            )
        elif po["status"] == "changed":
            found.append(
                {
                    **base,
                    "code": "accept_change",
                    "status": "needs_you",
                    "changes": po.get("changes") or [],
                }
            )
        for document in _pending(po):
            code = "send_receipt" if document["kind"] == "RECEIPT" else "send_asn"
            found.append(
                {
                    **base,
                    "code": code,
                    "status": "problem" if document.get("short") else "needs_you",
                    "doc_id": document["id"],
                    "short": document.get("short", []),
                }
            )
        if po["status"] in CLOSED:
            continue
        pending = {d["kind"] for d in _pending(po)}
        if direction_of(po) == "in":
            receipt = any(
                d["kind"] == "RECEIPT" and d.get("direction") == "out" for d in po["documents"]
            )
            if po.get("received") and not receipt:
                found.append(
                    {
                        **base,
                        "code": "send_receipt",
                        "status": "needs_you",
                        "doc_id": None,
                        "short": [],
                    }
                )
            elif not po.get("received") and po["status"] in {
                "sent",
                "confirmed",
                "dispatched",
                "changed",
            }:
                if po.get("delivery") and po["delivery"] < iso:
                    found.append(
                        {**base, "code": "late", "status": "problem", "date": po["delivery"]}
                    )
                elif po["status"] == "dispatched" or (
                    po.get("origin") == "partner" and po.get("delivery", "") <= iso
                ):
                    found.append({**base, "code": "receive", "status": "needs_you"})
        elif "DESADV" not in pending and not po.get("pending_change"):
            due = (today + timedelta(days=1)).isoformat()
            if po.get("delivery") and po["delivery"] < iso:
                found.append({**base, "code": "late", "status": "problem", "date": po["delivery"]})
            elif po.get("delivery", "") <= due:
                found.append(
                    {**base, "code": "ship", "status": "needs_you", "date": po.get("delivery", "")}
                )
    for entry in entries:
        if entry.get("status") == "problem":
            found.append(
                {
                    "code": "problem",
                    "status": "problem",
                    "entry_id": entry["id"],
                    "order_id": entry.get("order_id") or None,
                    "number": entry["number"],
                    "partner": (entry.get("partner") or {}).get("name", ""),
                    "problem": entry.get("problem", ""),
                    "kind": entry["kind"],
                }
            )
    found.sort(key=lambda task: task["status"] != "problem")
    return found


def chip(po: dict[str, Any], today: date) -> str:
    """One of five statuses, the same everywhere: new, needs_you, sent, done, problem."""
    if po["status"] == "cancelled":
        return "done"
    iso = today.isoformat()
    received = po.get("received")
    late = (
        po["status"] not in CLOSED
        and po.get("delivery")
        and po["delivery"] < iso
        and not (received if direction_of(po) == "in" else _sent(po, "DESADV"))
    )
    if (
        po.get("problem")
        or late
        or po.get("open_flags")
        or po.get("disputed")
        or any(d.get("short") for d in _pending(po))
    ):
        return "problem"
    if po["status"] == "closed":
        return "done"
    if (
        po["status"] in {"draft", "changed", "invoiced"}
        or po.get("pending_change")
        or _pending(po)
        or (direction_of(po) == "in" and received and not _sent(po, "RECEIPT"))
    ):
        return "needs_you"
    if direction_of(po) == "in" and received:
        return "done"
    if po.get("origin") == "partner" and len(po["documents"]) <= 1:
        return "new"
    return "sent"


def timeline(po: dict[str, Any]) -> list[dict[str, Any]]:
    """Created → Changed → Shipped → Received → Closed; Changed only when something changed,
    Received only for goods coming in (the partner confirms its own receipt)."""
    docs = po["documents"]
    first = docs[0]["at"] if docs else po.get("created")
    steps: list[dict[str, Any]] = [{"step": "created", "at": first}]
    changes = [d for d in docs if d["kind"] == "ORDER_CHANGE"] + [
        d for d in docs if d["kind"] == "ORDRSP" and po.get("changes")
    ]
    if changes or po.get("pending_change"):
        steps.append(
            {
                "step": "changed",
                "at": changes[-1]["at"] if changes else None,
                "waiting": bool(po.get("pending_change") or po["status"] == "changed"),
            }
        )
    if direction_of(po) == "in":
        shipped = next(
            (d for d in docs if d["kind"] == "DESADV" and d.get("direction") != "out"), None
        )
        steps.append({"step": "shipped", "at": shipped["at"] if shipped else None})
        steps.append({"step": "received", "at": po.get("received_at")})
    else:
        steps.append({"step": "shipped", "at": po.get("shipped_at")})
    steps.append({"step": "closed", "at": po.get("closed_at")})
    return steps


def view(po: dict[str, Any], today: date) -> dict[str, Any]:
    return {
        **po,
        "direction": direction_of(po),
        "partner": partner_of(po),
        "chip": chip(po, today),
        "timeline": timeline(po),
        "expected": {str(line): qty for line, qty in expected(po).items()},
    }


def board(store: MerchantRepository, uid: str, bid: str) -> dict[str, Any]:
    """Everything the four supply screens need, in one read."""
    context = supply_chain._owned(store, uid, bid)
    today = supply_chain.shop_today(context)
    orders = [view(po, today) for po in supply_chain.orders(store, uid, bid)]
    entries = inbox(store, bid)[:SHOWN_INBOX]
    partners = known_partners(store, bid)
    return {
        "today": today.isoformat(),
        "orders": orders,
        "inbox": entries,
        "tasks": tasks(orders, entries, today),
        "unsent": unsent(store, bid),
        "demo": any(p.get("demo") for p in partners)
        or bool(context["business"]["fields"].get("demo")),
    }
