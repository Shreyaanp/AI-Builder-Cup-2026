"""Today page facts: yesterday's pulse, forecast, low stock, one coach line, daily counters."""

from datetime import date, timedelta

from app import shop_today
from app.brief import Weather
from tests.test_community import app  # noqa: F401
from tests.test_owner_features import save_history, setup  # noqa: F401


def test_today_is_owner_only_and_empty_numbers_stay_missing(setup):  # noqa: F811
    client, _, bid, _ = setup
    data = client.get(f"/api/v1/businesses/{bid}/today").json()
    # No sales, views or questions yet: nothing is reported as zero.
    assert data["yesterday"] == {
        "sales": None,
        "items": None,
        "views": None,
        "questions": None,
        "stamps": None,
        "returning": None,
    }
    assert data["forecast"] is None
    # Milk has 3 left; Croissant (40) is fine without a forecast.
    assert [item["name"] for item in data["low_stock"]] == ["Milk"]
    from unittest.mock import AsyncMock

    from app.auth import Principal

    client.app.state.services.identity.require = AsyncMock(
        return_value=Principal("stranger", "local")
    )
    assert client.get(f"/api/v1/businesses/{bid}/today").status_code == 404


def test_pulse_counts_sales_page_opens_and_questions(setup):  # noqa: F811
    client, store, bid, fixed = setup
    save_history(store, bid, fixed)
    # Two customer page opens today, counted per shop and day only.
    for _ in range(2):
        assert client.get(f"/api/v1/public/shops/{bid}").status_code == 200
    client.post("/api/v1/customer/session", json={"name": "Asha"})
    client.post(f"/api/v1/customer/shops/{bid}/threads", json={"text": "Open on Sunday?"})
    data = client.get(f"/api/v1/businesses/{bid}/today").json()
    assert data["yesterday"]["sales"] == 10020 and data["yesterday"]["items"] == 20
    assert data["today"]["views"] == 2 and data["today"]["questions"] == 1
    assert data["forecast"] == {"item": "Croissant", "quantity": 22, "unit": "item"}
    stored = store.feature_docs.get("shop_daily", f"{bid}:{fixed.date().isoformat()}")
    assert stored == {"views": 2}  # an aggregate number, nothing about who opened the page


def test_daily_counter_is_atomic_and_erased_with_the_owner(setup):  # noqa: F811
    _, store, bid, fixed = setup
    shop_today.count(store, bid, "stamps", "UTC")
    shop_today.count(store, bid, "stamps", "UTC")
    shop_today.count(store, bid, "returning", "UTC")
    assert shop_today.daily(store, bid, fixed.date().isoformat()) == {"stamps": 2, "returning": 1}
    store.erase_owner("owner")
    assert store.feature_docs.get("shop_daily", f"{bid}:{fixed.date().isoformat()}") is None


def rows(today: date, busiest: int) -> list[dict]:
    out = []
    for back in range(1, 29):
        day = today - timedelta(days=back)
        qty = 60 if day.weekday() == busiest else 20
        out.append({"date": day.isoformat(), "item": "Chai", "quantity": qty, "revenue": qty * 20})
    return out


def test_coach_line_prefers_festival_then_live_rain_then_busiest_day():
    india = {"currency": "INR"}
    diwali = date(2026, 11, 5)
    assert shop_today.coach_line(india, diwali, [], None) == shop_today.CoachLine(
        kind="festival", festival="diwali", days=3
    )
    # Too far ahead: no festival line.
    assert shop_today.coach_line(india, date(2026, 10, 1), [], None) is None
    live = Weather(temperature_c=28, rain_probability=80)
    fixture = Weather(temperature_c=28, rain_probability=80, demo=True, source="offline_fixture")
    day = date(2026, 10, 17)  # a Saturday
    assert shop_today.coach_line({"currency": "SGD"}, day, [], live).kind == "rain"
    # The offline fixture never speaks for a real shop, only for a labelled demo shop.
    assert shop_today.coach_line({"currency": "SGD"}, day, [], fixture) is None
    assert shop_today.coach_line({"currency": "SGD", "demo": True}, day, [], fixture)
    line = shop_today.coach_line({"currency": "SGD"}, day, rows(day, 5), None)
    assert line == shop_today.CoachLine(kind="busiest_day", weekday=5, item="Chai", count=60)
    # Not the busiest weekday: nothing to say.
    assert shop_today.coach_line({"currency": "SGD"}, day, rows(day, 2), None) is None


def test_coach_line_follows_the_playbooks_topic_order():
    live = Weather(temperature_c=28, rain_probability=80)
    day = date(2026, 10, 17)  # a Saturday, also the busiest weekday below
    shop = {"currency": "SGD"}
    # Without a playbook rain leads; a playbook that watches the rush puts the busiest day first.
    assert shop_today.coach_line(shop, day, rows(day, 5), live).kind == "rain"
    line = shop_today.coach_line(shop, day, rows(day, 5), live, ["busiest_day", "rain"])
    assert line is not None and line.kind == "busiest_day"
    # Topics without a true line today fall back to the usual order.
    assert shop_today.coach_line(shop, day, [], live, ["busiest_day", "regulars"]).kind == "rain"


def test_today_carries_playbook_hints_only_when_the_shop_has_one(setup):  # noqa: F811
    client, _, bid, _ = setup
    assert client.get(f"/api/v1/businesses/{bid}/today").json().get("hints") is None
    assert client.get(f"/api/v1/businesses/{bid}/playbook").status_code == 200
    hints = client.get(f"/api/v1/businesses/{bid}/today").json()["hints"]
    assert hints["needs_you"] and hints["pulse"] and hints["line_topics"]
