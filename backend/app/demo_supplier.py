"""The public demo's supplier answers by itself, a few seconds after the owner acts (OB-248).

A scripted, deterministic conversation on the owner's own order: the reply is read back through
the same pipeline a real supplier's document goes through. No paid model is called and nothing
leaves the sandbox: the only caller is the public demo's owner API, and real owners are never
affected. What the reply says on screen is written by the app, in the owner's language.
"""

import re
import time
from typing import Any
from uuid import uuid4

import anyio
import structlog
from fastapi import HTTPException

from . import supply_chain
from .merchant import MerchantRepository

log = structlog.get_logger()
REPLY_SECONDS = 4.0
# By how many orders the visitor has sent here: the first is confirmed, the second comes short
# and the third at a new price, then round again. A cancelled draft never shifts it.
SCRIPT = ("full", "partial", "price_change")
# What the visitor can write on an open order, and the plain answer each gets.
TALK_LIMIT = 40
CLOSED_TO_TALK = {"draft", "closed", "cancelled"}
ASKS_WHEN = re.compile(
    r"\b(?:when|deliver\w*|arriv\w*|late|today|tomorrow|kab)\b|कब|डिलीवरी|पहुँच", re.I
)
ASKS_PRICE = re.compile(r"\b(?:price|rate|cost|discount|cheaper|daam)\b|दाम|कीमत|रेट|छूट", re.I)


def owner_sent(po: dict[str, Any]) -> bool:
    """An order the visitor approved here; a seeded order keeps its authored story."""
    documents = po.get("documents") or []
    return bool(documents) and documents[0].get("reader") == "template"


def next_reply(po: dict[str, Any], now: float, turn: int = 0) -> str | None:
    """The variant of the supplier's next document, once its short delay has passed. `turn` is
    this order's place among the visitor's sent orders, from 0."""
    if not po.get("simulated") or not owner_sent(po):
        return None
    if now - float(po.get("updated") or 0) < REPLY_SECONDS:
        return None
    if po["status"] == "sent":
        return SCRIPT[turn % len(SCRIPT)]
    if po["status"] == "confirmed":
        return "full"
    if po["status"] == "received" and not po.get("invoiced"):
        return "match"
    return None


def write(
    store: MerchantRepository, uid: str, bid: str, po_id: str, version: int, text: str
) -> dict[str, Any]:
    """The visitor writes to the demo supplier on an open order. It stays on the order and the
    script answers it; nothing is sent to anyone, and a real owner's order never gets here."""
    if not uid.startswith("public-demo-"):
        raise HTTPException(404, "Order not found.")
    po = supply_chain.get_po(store, uid, bid, po_id)
    supply_chain._check_version(po, version)
    talk = po.get("talk") or []
    if not po.get("simulated") or po["status"] in CLOSED_TO_TALK or len(talk) >= TALK_LIMIT:
        raise HTTPException(409, "NOT_OPEN")
    entry = {"id": uuid4().hex, "at": time.time(), "text": text.strip()}
    return supply_chain._save(store, bid, {**po, "talk": [*talk, entry]})


def answer_due(po: dict[str, Any], now: float) -> bool:
    talk = po.get("talk") or []
    return bool(talk) and "text" in talk[-1] and now - talk[-1]["at"] >= REPLY_SECONDS


def answered(po: dict[str, Any], now: float) -> dict[str, Any]:
    text = po["talk"][-1]["text"]
    kind = "when" if ASKS_WHEN.search(text) else "price" if ASKS_PRICE.search(text) else "noted"
    return {**po, "talk": [*po["talk"], {"id": uuid4().hex, "at": now, "answer": kind}]}


async def settle(store: MerchantRepository, uid: str, bid: str) -> bool:
    """Deliver every reply that is due on this shop's orders. True when something changed."""
    now = time.time()
    changed = False
    orders = await anyio.to_thread.run_sync(supply_chain.all_orders, store, bid)
    sent = sorted(
        (po for po in orders if owner_sent(po)), key=lambda po: float(po["documents"][0]["at"])
    )
    turns = {po["id"]: turn for turn, po in enumerate(sent)}
    for po in orders:
        if answer_due(po, now):
            try:
                await anyio.to_thread.run_sync(supply_chain._save, store, bid, answered(po, now))
            except HTTPException as error:
                log.info("demo_supplier_skipped", status=error.status_code)
                continue
            changed = True
            continue  # Its next document comes with a later read, on the saved order.
        variant = next_reply(po, now, turns.get(po["id"], 0))
        if variant is None:
            continue
        try:
            await supply_chain.simulate(store, uid, bid, po["id"], po["version"], variant)
        except HTTPException as error:
            # The owner acted at the same moment or the shop is not theirs: never break a read.
            log.info("demo_supplier_skipped", status=error.status_code)
            continue
        changed = True
    return changed
