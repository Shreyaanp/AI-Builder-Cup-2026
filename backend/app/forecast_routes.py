import anyio
from fastapi import APIRouter, Request

from .forecast import Forecast
from .limits import enforce_limits
from .merchant_routes import owner, store
from .sales import today_for

router = APIRouter(prefix="/api/v1/businesses", tags=["forecast"])


@router.get("/{business_id}/forecast", response_model=Forecast)
async def get_forecast(business_id: str, request: Request) -> Forecast:
    uid = await owner(request)
    await enforce_limits(request, [("forecast", uid)])
    service = store(request)
    context = await anyio.to_thread.run_sync(service.context, uid, business_id)
    rows = await anyio.to_thread.run_sync(service.sales_history, uid, business_id)
    return await request.app.state.forecaster.forecast(
        rows, today_for(context["business"]["fields"]), context["inventory"]
    )
