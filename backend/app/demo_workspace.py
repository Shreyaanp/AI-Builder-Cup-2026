"""A private demo shop for the guided tour: real menus, six weeks of sales, clearly labelled.

The owner gets their own copy (never shared publicly), so forecasts, the recap, Close the day
and sourcing all show real behaviour on filled data. It can be deleted like any shop.
"""

from __future__ import annotations

from typing import Any

import anyio
from fastapi import APIRouter, Query, Request

from .demo_data import SHOPS, sales_history
from .limits import enforce_limits
from .merchant import ProposalRequest
from .merchant_routes import consented_owner, store
from .sales import today_for

router = APIRouter(prefix="/api/v1/demo")

# Phone timezone → the demo city whose currency and food feel local.
ZONE_CITY = {
    "Asia/Kolkata": "bengaluru",
    "Asia/Calcutta": "bengaluru",
    "Asia/Kuala_Lumpur": "kuala-lumpur",
    "Asia/Jakarta": "jakarta",
    "Asia/Tokyo": "tokyo",
    "Asia/Bangkok": "bangkok",
    "Asia/Singapore": "singapore",
}
TOUR_SUFFIX = " (Tour)"


@router.post("/workspace")
async def demo_workspace(
    request: Request, zone: str = Query(default="Asia/Singapore", max_length=64)
) -> dict[str, Any]:
    uid = await consented_owner(request)
    await enforce_limits(request, [("proposal", uid)])
    service = store(request)
    existing = await anyio.to_thread.run_sync(service.list_businesses, uid)
    for business in existing:
        if business["fields"].get("name", "").endswith(TOUR_SUFFIX):
            return {"business_id": business["id"], "created": False}
    city = ZONE_CITY.get(zone, "singapore")
    demo = next(
        (s for s in SHOPS if s.city == city and s.fields.category.lower() != "hardware"),
        SHOPS[0],
    )
    fields = demo.fields.model_copy(
        update={
            "name": demo.fields.name.replace(" (Demo)", "") + TOUR_SUFFIX,
            # A private copy: no public pin or demo flag (the server owns that flag).
            "demo": False,
            "pin_demo": False,
        }
    )

    def create() -> str:
        proposal = service.propose(
            uid,
            ProposalRequest(kind="business", business=fields, products=list(demo.products)),
        )
        bid = str(service.commit(uid, proposal["id"], proposal["digest"])["business_id"])
        rows = sales_history(demo, today_for(fields.model_dump()))
        pending = service.prepare_sales(uid, bid, rows)
        service.save_sales(uid, bid, pending["id"], pending["digest"])
        return bid

    bid = await anyio.to_thread.run_sync(create)
    return {"business_id": bid, "created": True}
