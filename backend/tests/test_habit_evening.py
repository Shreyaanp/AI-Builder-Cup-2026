"""HABIT slice 1: what closing the day pays back, and the owner's daily visit counts.

Close-reward facts come only from saved records: the same weekday is the only comparison, and
it is left out without one. The habit row is counts only: no name, owner ID or shop ID in it.
"""

import json
import re
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import owner_habit
from app.close_reward import close_reward, reward_text
from app.coordinator import MerchantContext
from app.forecast import Forecast, Prediction
from app.instant import SCREEN_RULES, route
from app.owner_habit import HabitEvent, apply
from app.rescue import local_now
from tests.test_analytics import owned_shop, save_sales
from tests.test_photos import app  # noqa: F401

SUNDAY = date(2026, 11, 1)


def row(day: date, item: str, quantity: float, revenue: int) -> dict[str, Any]:
    return {"date": day.isoformat(), "item": item, "quantity": quantity, "revenue": revenue}


def test_reward_compares_with_last_same_weekday_only() -> None:
    sales = [
        row(SUNDAY, "Masala chai", 72, 144000),
        row(SUNDAY, "Samosa", 30, 105000),
        # Saturday was bigger, but a Saturday is never compared with a Sunday.
        row(SUNDAY - timedelta(days=1), "Masala chai", 120, 400000),
        row(SUNDAY - timedelta(days=7), "Masala chai", 80, 225000),
    ]
    reward = close_reward(sales, SUNDAY, "INR")
    assert reward is not None
    assert (reward.total, reward.items, reward.currency) == (249000, 102, "INR")
    assert reward.same_weekday is not None
    assert reward.same_weekday.date == SUNDAY - timedelta(days=7)
    assert (reward.same_weekday.weeks_ago, reward.same_weekday.total) == (1, 225000)
    assert reward.same_weekday.difference == 24000  # ₹240 more than last Sunday
    assert reward.forecast is None  # no forecast passed: never invented


def test_less_than_last_time_is_said_as_a_plain_number() -> None:
    sales = [row(SUNDAY, "Chai", 10, 1000), row(SUNDAY - timedelta(days=7), "Chai", 30, 3000)]
    reward = close_reward(sales, SUNDAY, "INR")
    assert reward and reward.same_weekday and reward.same_weekday.difference == -2000


def test_a_skipped_week_compares_with_the_one_before_up_to_four_weeks() -> None:
    sales = [row(SUNDAY, "Chai", 10, 1000), row(SUNDAY - timedelta(days=21), "Chai", 9, 900)]
    reward = close_reward(sales, SUNDAY, "INR")
    assert reward and reward.same_weekday
    assert (reward.same_weekday.weeks_ago, reward.same_weekday.difference) == (3, 100)
    too_old = [row(SUNDAY, "Chai", 10, 1000), row(SUNDAY - timedelta(days=35), "Chai", 9, 900)]
    assert close_reward(too_old, SUNDAY, "INR").same_weekday is None  # type: ignore[union-attr]


def test_first_week_shop_has_no_comparison() -> None:
    # Six days of records: no earlier same weekday exists, so nothing is compared.
    sales = [row(SUNDAY - timedelta(days=back), "Chai", 10, 1000) for back in range(6)]
    reward = close_reward(sales, SUNDAY, "INR")
    assert reward is not None and reward.total == 6000 // 6
    assert reward.same_weekday is None


def test_no_amounts_means_no_total_and_no_comparison() -> None:
    # Counts saved without prices: the total is unknown, never zero, and nothing is compared.
    sales = [row(SUNDAY, "Chai", 10, 0), row(SUNDAY - timedelta(days=7), "Chai", 9, 900)]
    reward = close_reward(sales, SUNDAY, "INR")
    assert reward is not None and reward.total is None and reward.items == 10
    assert reward.same_weekday is None
    # A last Sunday with counts only is not a record to compare takings with either.
    counts_only = [row(SUNDAY, "Chai", 10, 1000), row(SUNDAY - timedelta(days=7), "Chai", 9, 0)]
    assert close_reward(counts_only, SUNDAY, "INR").same_weekday is None  # type: ignore[union-attr]


def test_a_day_with_no_sales_returns_none() -> None:
    assert close_reward([], SUNDAY, "INR") is None
    other_days = [row(SUNDAY - timedelta(days=7), "Chai", 9, 900)]
    assert close_reward(other_days, SUNDAY, "INR") is None


def test_forecast_line_is_todays_number_beside_what_sold() -> None:
    forecast = Forecast(
        status="ready",
        method="weekday_average",
        training_cutoff=SUNDAY - timedelta(days=1),
        predictions=[
            Prediction(date=SUNDAY, item="Masala chai", quantity=75, unit="cup"),
            Prediction(date=SUNDAY, item="Samosa", quantity=30),
            Prediction(date=SUNDAY + timedelta(days=1), item="Masala chai", quantity=500),
        ],
    )
    sales = [row(SUNDAY, "masala chai", 72, 144000)]
    reward = close_reward(sales, SUNDAY, "INR", forecast)
    assert reward and reward.forecast
    # The same number Today showed: the forecast plus its buffer (75 + 8 = 83).
    assert (reward.forecast.item, reward.forecast.forecast, reward.forecast.sold) == (
        "Masala chai",
        83,
        72,
    )
    assert reward.forecast.unit == "cup"
    # The top item was not sold today: no line, rather than "sold 0".
    assert close_reward([row(SUNDAY, "Samosa", 3, 300)], SUNDAY, "INR", forecast).forecast is None  # type: ignore[union-attr]


def test_reward_route_reads_the_shops_own_day(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        fields = app.state.merchant.context(uid, bid)["business"]["fields"]
        today = local_now(fields).date()
        assert client.get(f"/api/v1/businesses/{bid}/day/{today}/reward").json() is None
        save_sales(
            app,
            uid,
            bid,
            [row(today, "Chai", 10, 2000), row(today - timedelta(days=7), "Chai", 8, 1600)],
        )
        reward = client.get(f"/api/v1/businesses/{bid}/day/{today}/reward").json()
        assert reward["total"] == 2000 and reward["same_weekday"]["difference"] == 400
        assert client.get(f"/api/v1/businesses/{bid}/day/not-a-day/reward").status_code == 422
        assert client.get(f"/api/v1/businesses/other/day/{today}/reward").status_code == 404


def test_counts_add_up_and_ignore_unknown_kinds() -> None:
    first = apply(
        None,
        [
            HabitEvent(event="opened"),
            HabitEvent(event="prompt_shown", kind="closeDay"),
            HabitEvent(event="prompt_shown", kind="low"),
            HabitEvent(event="prompt_shown", kind="Sharma Chai"),  # not a kind: dropped
            HabitEvent(event="action_done", kind="closeDay", seconds=14),
            HabitEvent(event="closed"),
        ],
    )
    later = apply(
        first,
        [
            HabitEvent(event="opened"),
            HabitEvent(event="action_done", kind="low", seconds=3),
            HabitEvent(event="closed"),
        ],
    )
    assert later == {
        "opened": 2,
        "prompt_shown:closeDay": 1,
        "prompt_shown:low": 1,
        "action_done:closeDay": 1,
        "action_done:low": 1,
        # The first action of the day is the one timed; closing twice is one closed day.
        "seconds_to_first_action": 14,
        "closed": 1,
    }


def test_daily_row_has_no_name_or_uid(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        name = app.state.merchant.context(uid, bid)["business"]["fields"]["name"]
        sent = client.post(
            f"/api/v1/businesses/{bid}/habit",
            json={
                "events": [
                    {"event": "opened"},
                    {"event": "prompt_shown", "kind": "closeDay"},
                    {"event": "action_done", "kind": "closeDay", "seconds": 9},
                    {"event": "closed"},
                ]
            },
        )
        assert sent.status_code == 204
        fields = app.state.merchant.context(uid, bid)["business"]["fields"]
        day = local_now(fields).date().isoformat()
        stored = owner_habit.daily(app.state.merchant, bid, day)
        assert stored == {
            "opened": 1,
            "prompt_shown:closeDay": 1,
            "action_done:closeDay": 1,
            "seconds_to_first_action": 9,
            "closed": 1,
        }
        exported = json.dumps(owner_habit.export_row(stored))
        for private in (uid, bid, name):
            assert private not in json.dumps(stored) and private not in exported
        # Free text never fits: an unknown event is refused, and a kind is at most 20 letters.
        assert (
            client.post(
                f"/api/v1/businesses/{bid}/habit", json={"events": [{"event": "said hello"}]}
            ).status_code
            == 422
        )
        assert (
            client.post(
                f"/api/v1/businesses/{bid}/habit",
                json={"events": [{"event": "action_done", "kind": "x" * 21}]},
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/v1/businesses/someone-else/habit", json={"events": [{"event": "opened"}]}
            ).status_code
            == 404
        )


def test_demo_shops_are_never_counted(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        version = client.get("/api/v1/me").json()["legal_version"]
        client.post("/api/v1/consent", json={"version": version, "terms": True, "privacy": True})
        made = client.post("/api/v1/demo/workspace", params={"zone": "Asia/Kolkata"}).json()
        bid = made["business_id"]
        sent = client.post(
            f"/api/v1/businesses/{bid}/habit", json={"events": [{"event": "opened"}]}
        )
        assert sent.status_code == 204
        assert app.state.merchant.feature_docs.scoped(owner_habit.KIND, bid) == []


def test_counting_needs_the_owners_current_consent(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        sent = client.post("/api/v1/businesses/any/habit", json={"events": [{"event": "opened"}]})
        assert sent.status_code == 428


def test_a_store_error_never_fails_the_owner(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        _, bid = owned_shop(client, app)

        def broken(*_: Any) -> None:
            raise RuntimeError("store down")

        monkeypatch.setattr(owner_habit, "record", broken)
        sent = client.post(
            f"/api/v1/businesses/{bid}/habit", json={"events": [{"event": "opened"}]}
        )
        assert sent.status_code == 204


@pytest.mark.parametrize("message", ["Close the day", "aaj ka hisaab", "Aaj ka hisab"])
def test_close_the_day_opens_from_the_chat(message: str) -> None:
    lowered = message.casefold()
    assert next(t for pattern, t in SCREEN_RULES if re.search(pattern, lowered)) == "close_day"


async def test_how_did_today_go_gives_the_close_screen_facts(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
    ctx = MerchantContext(store=app.state.merchant, uid=uid, business_id=bid, recalled=[])
    fields = app.state.merchant.context(uid, bid)["business"]["fields"]
    today = local_now(fields).date()
    empty = await route("How did today go?", ctx)
    assert empty is not None and empty.intent == "how_today"
    assert "No sales are saved for today yet" in empty.reply
    save_sales(
        app,
        uid,
        bid,
        [row(today, "Chai", 10, 249000), row(today - timedelta(days=7), "Chai", 9, 225000)],
    )
    for message in ("How did today go?", "aaj kaisa raha", "How was my day"):
        answer = await route(message, ctx)
        assert answer is not None and answer.intent == "how_today", message
        weekday = today.strftime("%A")
        assert "more than last " + weekday in answer.reply
        assert reward_text(close_reward(app.state.merchant.sales_history(uid, bid), today, "SGD"))


def test_public_demo_sandbox_reads_the_reward_but_never_counts() -> None:
    from app.public_demo import allowed

    assert allowed("GET", "businesses/demo-1/day/2026-11-02/reward")
    assert not allowed("POST", "businesses/demo-1/habit")
