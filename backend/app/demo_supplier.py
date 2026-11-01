"""The public demo's supplier answers by itself, a few seconds after the owner acts (OB-248).

A scripted, deterministic conversation on the owner's own order: the reply is read back through
the same pipeline a real supplier's document goes through. No paid model is called and nothing
leaves the sandbox: the only caller is the public demo's owner API, and real owners are never
affected. What the reply says on screen is written by the app, in the owner's language.
"""

import re
import time
from typing import Any

import anyio
import structlog
from fastapi import HTTPException

from . import supply_chain
from .merchant import MerchantRepository

log = structlog.get_logger()
REPLY_SECONDS = 4.0
# By order number, so a visitor's first order is confirmed, the next comes short and the third
# comes at a new price. The seed's sequence makes the first new number land on "full".
SCRIPT = ("price_change", "full", "partial")


def owner_sent(po: dict[str, Any]) -> bool:
    """An order the visitor approved here; a seeded order keeps its authored story."""
    documents = po.get("documents") or []
    return bool(documents) and documents[0].get("reader") == "template"


def next_reply(po: dict[str, Any], now: float) -> str | None:
    """The variant of the supplier's next document, once its short delay has passed."""
    if not po.get("simulated") or not owner_sent(po):
        return None
    if now - float(po.get("updated") or 0) < REPLY_SECONDS:
        return None
    if po["status"] == "sent":
        return SCRIPT[int(re.sub(r"\D", "", str(po["number"])) or 0) % len(SCRIPT)]
    if po["status"] == "confirmed":
        return "full"
    if po["status"] == "received" and not po.get("invoiced"):
        return "match"
    return None


async def settle(store: MerchantRepository, uid: str, bid: str) -> bool:
    """Deliver every reply that is due on this shop's orders. True when something changed."""
    now = time.time()
    changed = False
    orders = await anyio.to_thread.run_sync(supply_chain.all_orders, store, bid)
    for po in orders:
        variant = next_reply(po, now)
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
