"""Owner-only simulator endpoints; all storage is separate from merchant records."""

import anyio
from fastapi import APIRouter, HTTPException, Request

from .google_sim import SimAction, SimFacts, SimReset, SimState, initial, step
from .merchant_firestore import document_id
from .merchant_routes import consented_owner, store

router = APIRouter(prefix="/api/v1/businesses/{business_id}/google-sim")


def load(request: Request, uid: str, bid: str) -> SimState:
    document_id(bid, "Business not found.")
    service = store(request)
    saved = service.sim_state(uid, bid)
    if saved is not None:
        return SimState.model_validate(saved)
    facts = service.context(uid, bid)["business"]["fields"]
    # Merchant category text is never inferred to be a destination category ID.
    result = initial(SimFacts(**{k: facts[k] for k in ("name", "location", "hours", "phone")}))
    result.business_id = bid
    return result


@router.get("", response_model=SimState)
async def state(business_id: str, request: Request) -> SimState:
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(load, request, uid, business_id)


@router.post("", response_model=SimState)
async def action(business_id: str, body: SimAction, request: Request) -> SimState:
    uid = await consented_owner(request)

    def run() -> SimState:
        current = load(request, uid, business_id)
        try:
            updated = step(current, body, current.scenario)
        except ValueError as error:
            raise HTTPException(409, "SIM_" + str(error).upper()) from None
        store(request).save_sim_state(uid, business_id, updated.model_dump())
        return updated

    return await anyio.to_thread.run_sync(run)


@router.post("/reset", response_model=SimState)
async def reset(business_id: str, body: SimReset, request: Request) -> SimState:
    uid = await consented_owner(request)

    def run() -> SimState:
        current = load(request, uid, business_id)
        if body.version != current.version:
            raise HTTPException(409, "SIM_STALE")
        facts = store(request).context(uid, business_id)["business"]["fields"]
        updated = initial(
            SimFacts(**{k: facts[k] for k in ("name", "location", "hours", "phone")}),
            body.scenario,
        )
        updated.version = current.version + 1
        updated.business_id = business_id
        store(request).save_sim_state(uid, business_id, updated.model_dump())
        return updated

    return await anyio.to_thread.run_sync(run)
