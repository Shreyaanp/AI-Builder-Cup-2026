from google.adk.events import Event
from google.genai import types

from app.charts import chart_card, forecast_card, insights_card
from app.streaming import public_events


def forecast(**extra):
    return {
        "status": "ready",
        "method": "weekday_average",
        "predictions": [
            {"date": f"2026-10-{d:02d}", "item": item, "quantity": q, "unit": "cup"}
            for d in range(16, 23)
            for item, q in (("Masala chai", 40.0), ("Samosa", 12.0))
        ],
        "insufficient_items": ["Bun maska"],
        **extra,
    }


def test_forecast_card_groups_days_per_item_busiest_first():
    card = forecast_card(forecast())
    assert card["type"] == "forecast"
    assert [i["item"] for i in card["items"]] == ["Masala chai", "Samosa"]
    assert len(card["items"][0]["days"]) == 7
    assert card["items"][0]["days"][0] == {
        "date": "2026-10-16",
        "quantity": 40.0,
        "lower": None,
        "upper": None,
    }
    assert card["insufficient_items"] == ["Bun maska"]


def test_no_card_without_data():
    assert forecast_card({"status": "insufficient", "predictions": []}) is None
    assert insights_card({"has_sales_data": False}) is None
    assert chart_card("get_orders", {"anything": 1}) is None
    assert chart_card("get_forecast", None) is None


def test_insights_card_bounds_and_cleans_numbers():
    card = insights_card(
        {
            "has_sales_data": True,
            "currency": "INR",
            "revenue": 1200.5,
            "previous_revenue": 1000,
            "revenue_change_percent": 20.05,
            "daily_revenue": [{"date": f"2026-10-{d:02d}", "revenue": d} for d in range(1, 21)],
            "top_sellers": [{"item": "Chai", "quantity": 80, "revenue": 1200}] * 9,
            "slow_movers": [{"item": "Rusk", "quantity": "nan", "revenue": None}],
            "sold_out_count": 2,
        }
    )
    assert card["type"] == "insights"
    assert len(card["daily"]) == 14 and card["daily"][-1]["date"] == "2026-10-20"
    assert len(card["top"]) == 5
    assert card["slow"] == [{"item": "Rusk", "quantity": 0, "revenue": 0}]
    assert card["change_percent"] == 20.05


def test_public_events_show_a_chart_beside_the_answer():
    response = types.Part(
        function_response=types.FunctionResponse(name="get_forecast", response=forecast())
    )
    event = Event(author="coach", content=types.Content(role="user", parts=[response]))
    charts = [e for e in public_events(event) if e.kind == "chart"]
    assert len(charts) == 1 and charts[0].data["type"] == "forecast"
