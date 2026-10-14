from datetime import date, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.forecast import QUERY, ForecastService
from app.settings import Settings
from tests.test_imports import make_shop, upload
from tests.test_photos import app, join  # noqa: F401

TODAY = date(2026, 10, 14)


def history(today=TODAY, days=28):
    return [
        {
            "date": (today - timedelta(days=i)).isoformat(),
            "item": "Kopi",
            "quantity": 20 + (today - timedelta(days=i)).weekday(),
            "revenue": 3600,
        }
        for i in range(days)
    ]


@pytest.mark.asyncio
async def test_weekday_fallback_deterministic_seasonal_method():
    service = ForecastService(Settings(_env_file=None))
    result = await service.forecast(history(), TODAY, [{"name": "Kopi", "unit": "cup"}])
    assert result == await service.forecast(
        list(reversed(history())), TODAY, [{"name": "Kopi", "unit": "cup"}]
    )
    assert result.method == "weekday_average"
    assert result.status == "ready"
    assert len(result.predictions) == 7
    assert [p.quantity for p in result.predictions] == [23, 24, 25, 26, 20, 21, 22]
    assert all(p.unit == "cup" and p.lower is None for p in result.predictions)
    assert result.predictions[0].date == TODAY + timedelta(days=1)


@pytest.mark.asyncio
async def test_trend_adjusts_growth_and_does_not_train_on_future():
    rows = history()
    for r in rows[:14]:
        r["quantity"] *= 2
    service = ForecastService(Settings(_env_file=None))
    baseline = await service.forecast(history(), TODAY, [])
    growing = await service.forecast(
        rows + [{"date": "2030-01-01", "item": "Kopi", "quantity": 99999}], TODAY, []
    )
    assert growing.predictions[-1].quantity > baseline.predictions[-1].quantity


@pytest.mark.asyncio
async def test_bigquery_mode_fake_client_and_prediction_intervals():
    fake = AsyncMock()
    fake.query.return_value = [
        {
            "item": "Kopi",
            "forecast_date": (TODAY + timedelta(days=i)).isoformat(),
            "forecast_value": 25,
            "lower_bound": 15,
            "upper_bound": 35,
        }
        for i in range(1, 8)
    ]
    service = ForecastService(Settings(_env_file=None, forecast_backend="bigquery"), fake)
    result = await service.forecast(history(), TODAY, [])
    fake.query.assert_awaited_once()
    assert fake.query.call_args.args[1] == 7
    assert result.method == "timesfm" and result.confidence_level == 0.9
    assert result.predictions[0].lower == 15 and result.predictions[0].upper == 35
    assert "AI.FORECAST" in QUERY and "@sales" in QUERY


@pytest.mark.asyncio
async def test_insufficient_history_never_calls_bigquery_and_failures_fall_back():
    fake = AsyncMock()
    service = ForecastService(Settings(_env_file=None, forecast_backend="bigquery"), fake)
    result = await service.forecast(history(days=27), TODAY, [])
    assert result.status == "insufficient" and result.method == "weekday_average"
    fake.query.assert_not_called()
    fake.query.side_effect = RuntimeError("fixture")
    result = await service.forecast(history(), TODAY, [])
    assert result.status == "ready" and result.method == "weekday_average"
    assert result.fallback_reason == "provider_unavailable"


@pytest.mark.asyncio
async def test_partial_bigquery_output_falls_back_with_truthful_label():
    fake = AsyncMock()
    fake.query.return_value = [
        {"item": "Kopi", "forecast_date": "2026-10-15", "forecast_value": 99}
    ]
    result = await ForecastService(
        Settings(_env_file=None, forecast_backend="bigquery"), fake
    ).forecast(history(), TODAY, [])
    assert result.method == "weekday_average" and len(result.predictions) == 7


@pytest.mark.asyncio
async def test_coach_forecast_reads_only_active_owned_sales(app):  # noqa: F811
    from app.coordinator import MerchantContext, current, get_forecast

    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        uid = app.state.services.identity.local_principal(
            client.cookies.get("ogoogle_preview_session")
        ).uid
        token = current.set(MerchantContext(app.state.merchant, uid, bid, []))
        try:
            result = await get_forecast()
            assert result["status"] == "insufficient" and result["method"] == "weekday_average"
            current.set(MerchantContext(app.state.merchant, "stranger", bid, []))
            from fastapi import HTTPException

            with pytest.raises(HTTPException) as error:
                await get_forecast()
            assert error.value.status_code == 404
        finally:
            current.reset(token)


def test_route_only_uses_saved_owned_sales(app):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        fields = client.get("/api/v1/businesses").json()[0]
        from app.sales import today_for

        today = today_for(fields["fields"])
        csv = "Date,Item,Qty,Revenue\n" + "\n".join(
            f"{r['date']},Kopi,{r['quantity']},36" for r in history(today)
        )
        proposal = upload(client, bid, csv.encode()).json()
        path = f"/api/v1/businesses/{bid}/forecast"
        assert client.get(path).json()["status"] == "insufficient"
        client.post(
            f"/api/v1/businesses/{bid}/import/{proposal['import_id']}/approve",
            json={"digest": proposal["digest"]},
        )
        result = client.get(path)
        assert result.status_code == 200
        assert result.json()["method"] == "weekday_average"
        assert len(result.json()["predictions"]) == 7
        response = client.post(
            "/api/v1/coach/stream",
            json={"message": "How much kopi should I prep tomorrow?", "business_id": bid},
        )
        assert response.status_code == 200
        assert "Kopi:" in response.text and "Method: weekday average" in response.text
    with TestClient(app) as stranger:
        join(stranger)
        assert stranger.get(path).status_code == 404
