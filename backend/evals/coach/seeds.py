"""Throwaway shops for the coach evals: synthetic names and numbers only, never real owners.

Each seed takes a fresh SQLite MerchantStore and the eval owner's uid and returns the active
business id, like a signed-in owner on the Coach tab.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import timedelta

from app.customer import InquiryInput
from app.merchant import BusinessFields, DayHours, MerchantStore, ProductFields, ProposalRequest
from app.sales import today_for
from app.settings import Settings

Seed = Callable[[MerchantStore, str], str]

DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
ALL_DAY = [DayHours(day=day, open="00:00", close="23:59") for day in DAYS]  # type: ignore[arg-type]


def _commit(store: MerchantStore, uid: str, request: ProposalRequest) -> str:
    proposal = store.propose(uid, request)
    return str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])


def chai_stall(store: MerchantStore, uid: str) -> str:
    """A Hyderabad tea stall with a UPI ID, open all day (so a rescue deal "until {soon}" is
    always before closing)."""
    return _commit(
        store,
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Shree Chai Corner",
                category="Tea stall",
                location="Madhapur, Hyderabad",
                lat=17.4483,
                lng=78.3915,
                currency="INR",
                timezone="Asia/Kolkata",
                phone="+91 90000 00001",
                hours="Open all day",
                weekly_hours=ALL_DAY,
                upi_id="shreechai@upi",
            ),
            products=[
                ProductFields(name="Cutting chai", price=1000, unit="cup"),
                ProductFields(name="Masala chai", price=2000, unit="cup"),
                ProductFields(name="Bun maska", price=3000, unit="piece"),
                ProductFields(name="Samosa", price=1500, unit="piece", stock=20),
            ],
        ),
    )


def chai_with_message(store: MerchantStore, uid: str) -> str:
    """The tea stall with one customer question waiting on its public page."""
    bid = chai_stall(store, uid)
    store.share(uid, bid, True)
    store.add_inquiry(
        bid,
        InquiryInput(
            name="Meera Test",
            contact="+91 90000 00002",
            message="Do you deliver to Kondapur in the evening?",
        ),
    )
    return bid


def kirana(store: MerchantStore, uid: str) -> str:
    """A Bengaluru kirana with stock and four weeks of sales (insights, forecast, reorder)."""
    bid = _commit(
        store,
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Lakshmi Kirana",
                category="Grocery",
                location="Indiranagar, Bengaluru",
                lat=12.9716,
                lng=77.5946,
                currency="INR",
                timezone="Asia/Kolkata",
                phone="+91 90000 00003",
            ),
            products=[
                ProductFields(name="Atta (wheat flour)", price=5500, unit="kg", stock=6),
                ProductFields(name="Sugar", price=4800, unit="kg", stock=60),
            ],
        ),
    )
    today = today_for(store.context(uid, bid)["business"]["fields"])
    rows = [
        {
            "date": (today - timedelta(days=day)).isoformat(),
            "item": item,
            "quantity": quantity + day % 3,
            "revenue": (quantity + day % 3) * price,
        }
        for day in range(1, 29)
        for item, quantity, price in (("Atta (wheat flour)", 3, 5500), ("Sugar", 2, 4800))
    ]
    prepared = store.prepare_sales(uid, bid, rows)
    store.save_sales(uid, bid, prepared["id"], prepared["digest"])
    return bid


def _offline() -> Settings:
    return Settings(_env_file=None, coach_mode="offline", app_env="test")  # type: ignore[call-arg]


def kirana_with_po(store: MerchantStore, uid: str) -> str:
    """The kirana with one purchase order for atta, approved and sent to a demo supplier."""
    from app import supply_chain
    from app.coordinator import DEMO_OWNER_UID
    from app.forecast import ForecastService
    from app.sourcing import SupplierGenerator

    bid = kirana(store, uid)
    result = asyncio.run(
        supply_chain.draft_reorder(
            store,
            uid,
            bid,
            "atta",
            None,
            ForecastService(_offline()),
            SupplierGenerator(_offline()),
            DEMO_OWNER_UID,
        )
    )
    po = result["order"]
    if po["blocked"]:
        fix = next(c["fix"] for c in po["checks"] if c["blocking"] and c["fix"])
        po = supply_chain.apply_fix(store, uid, bid, po["id"], po["version"], fix)
    supply_chain.approve(store, uid, bid, po["id"], po["version"])
    return bid


def kirana_with_sent_order(store: MerchantStore, uid: str) -> str:
    """The kirana with one chat order request (sourcing) already sent to a demo supplier."""
    import time

    from app import sourcing

    bid = kirana(store, uid)
    records = sourcing.demo_records(
        sourcing.fixture_suppliers("flour", "kg", "INR"), 12.9716, 77.5946, "INR", "Asia/Kolkata"
    )
    for sid, fields, products in records:
        store.seed_demo_shop("eval-demo-owner", sid, fields, products)
    supplier = store.public_shop(records[0][0])
    assert supplier
    pin = sourcing.shop_pin(store.context(uid, bid)["business"]["fields"])
    order = sourcing.new_order(
        supplier,
        pin,
        [sourcing.OrderItem(name="flour", quantity=20, unit="kg")],
        "",
        "",
        1.4,
        time.time(),
    )
    order["status"] = "sent"
    store.save_supplier_order(uid, bid, order)
    return bid


SEEDS: dict[str, Seed] = {
    "chai_stall": chai_stall,
    "chai_with_message": chai_with_message,
    "kirana": kirana,
    "kirana_with_po": kirana_with_po,
    "kirana_with_sent_order": kirana_with_sent_order,
}
