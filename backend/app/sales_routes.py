"""Private, owner-scoped sales, recap and daily confirmation endpoints."""

from datetime import timedelta
from typing import Annotated, Any

import anyio
from fastapi import APIRouter, Query, Request

from .limits import enforce_limits
from .merchant import Approval
from .merchant_routes import consented_owner, owner, store
from .recap import LANGUAGES, Recap, recap_facts, week_start
from .sales import fingerprint, today_for

router = APIRouter(prefix="/api/v1/businesses/{business_id}")


@router.post("/import/{import_id}/approve")
async def approve_sales(
    business_id: str, import_id: str, body: Approval, request: Request
) -> dict[str, Any]:
    uid = await consented_owner(request)
    return await anyio.to_thread.run_sync(
        store(request).save_sales, uid, business_id, import_id, body.digest
    )


@router.get("/sales")
async def sales_history(business_id: str, request: Request) -> list[dict[str, Any]]:
    return await anyio.to_thread.run_sync(
        store(request).sales_history, await owner(request), business_id
    )


@router.post("/freshness/confirm")
async def confirm_menu(business_id: str, request: Request) -> dict[str, Any]:
    return await anyio.to_thread.run_sync(
        store(request).confirm_menu, await consented_owner(request), business_id
    )


@router.get("/freshness")
async def freshness(business_id: str, request: Request) -> dict[str, Any]:
    business = (
        await anyio.to_thread.run_sync(store(request).context, await owner(request), business_id)
    )["business"]
    today = today_for(business["fields"])
    return {
        "today": today.isoformat(),
        "monday": today.weekday() == 0,
        "last_confirmed": business.get("last_confirmed"),
        "recap_week": (today - timedelta(days=7)).strftime("%G-W%V"),
    }


@router.get("/recap", response_model=Recap)
async def recap(
    business_id: str,
    request: Request,
    week: str,
    language: Annotated[str, Query(pattern=LANGUAGES)] = "en",
) -> Recap:
    uid = await owner(request)
    week_start(week)
    service = store(request)
    await enforce_limits(request, [("recap", uid)])
    sales = await anyio.to_thread.run_sync(service.sales_history, uid, business_id)
    signals = await anyio.to_thread.run_sync(service.recap_signals, uid, business_id)
    facts = recap_facts(week, sales, signals)
    version = fingerprint({"facts": facts, "mode": request.app.state.v1_settings.coach_mode})
    key = week + ":" + language
    cached = await anyio.to_thread.run_sync(service.recap_cache, uid, business_id, key)
    if cached and cached["version"] == version:
        return Recap.model_validate(cached["recap"])
    summary, mode = await request.app.state.recap_writer.write(facts, language)
    result = Recap(**facts, summary=summary, language=language, mode=mode)
    await anyio.to_thread.run_sync(
        service.recap_cache,
        uid,
        business_id,
        key,
        {"version": version, "recap": result.model_dump()},
    )
    return result
