"""Chart cards for the coach chat: the numbers behind a forecast or "how is business going"
answer, shown as an animated card next to the coach's words (like a chart in an AI assistant's
answer). Built only from the tool's own result, bounded in size, never from model text."""

from typing import Any

MAX_ITEMS = 6
MAX_DAYS = 14


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number, 2) if number == number and abs(number) != float("inf") else None


def forecast_card(result: dict[str, Any]) -> dict[str, Any] | None:
    """Next seven days per item, with the likely range when the method provides one."""
    if result.get("status") != "ready" or not result.get("predictions"):
        return None
    items: dict[str, dict[str, Any]] = {}
    for row in result["predictions"]:
        name = str(row.get("item", ""))[:60]
        if not name:
            continue
        item = items.setdefault(
            name, {"item": name, "unit": str(row.get("unit", "item")), "days": []}
        )
        if len(item["days"]) < MAX_DAYS:
            item["days"].append(
                {
                    "date": str(row.get("date", ""))[:10],
                    "quantity": _number(row.get("quantity")) or 0,
                    "lower": _number(row.get("lower")),
                    "upper": _number(row.get("upper")),
                }
            )
    ranked = sorted(items.values(), key=lambda i: -sum(d["quantity"] for d in i["days"]))
    return {
        "type": "forecast",
        "method": result.get("method"),
        "items": ranked[:MAX_ITEMS],
        "insufficient_items": [str(i)[:60] for i in result.get("insufficient_items", [])][:10],
    }


def insights_card(result: dict[str, Any]) -> dict[str, Any] | None:
    """This week against last week: revenue, the daily trend, top sellers and slow movers."""
    if not result.get("has_sales_data"):
        return None

    def rows(key: str) -> list[dict[str, Any]]:
        return [
            {
                "item": str(row.get("item", ""))[:60],
                "quantity": _number(row.get("quantity")) or 0,
                "revenue": _number(row.get("revenue")) or 0,
            }
            for row in (result.get(key) or [])[:5]
        ]

    return {
        "type": "insights",
        "currency": str(result.get("currency") or ""),
        "revenue": _number(result.get("revenue")) or 0,
        "previous_revenue": _number(result.get("previous_revenue")) or 0,
        "change_percent": _number(result.get("revenue_change_percent")),
        "daily": [
            {"date": str(d.get("date", ""))[:10], "revenue": _number(d.get("revenue")) or 0}
            for d in (result.get("daily_revenue") or [])[-MAX_DAYS:]
        ],
        "top": rows("top_sellers"),
        "slow": rows("slow_movers"),
        "sold_out_count": int(_number(result.get("sold_out_count")) or 0),
    }


CHART_TOOLS = {"get_forecast": forecast_card, "get_insights": insights_card}


def chart_card(tool: str, result: dict[str, Any] | None) -> dict[str, Any] | None:
    builder = CHART_TOOLS.get(tool)
    return builder(result) if builder and isinstance(result, dict) else None
