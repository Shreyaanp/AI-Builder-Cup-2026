"""OB-263: after a reorder Today stops asking for a second one, and after the goods arrive
nothing about that delivery still needs the owner."""

from datetime import date, timedelta

from app import shop_today, supply_chain
from app.forecast import Forecast
from tests.test_ob248_demo_flow import draft_and_send, instant, order_of, stock_of  # noqa: F401
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo import owner
from tests.test_public_demo_no_paid_ai import live_parent_demo, no_paid_calls  # noqa: F401

TODAY = date(2026, 11, 3)


def week(per_day: float) -> dict:
    return {
        "method": "weekday_average",
        "predictions": [
            {
                "item": "Tea dust",
                "date": (TODAY + timedelta(days=i)).isoformat(),
                "quantity": per_day,
                "upper": per_day,
            }
            for i in range(1, 8)
        ],
    }


TEA = {"name": "Tea dust", "stock": 6, "unit": "kg"}


def test_OB_263_stock_on_order_counts_from_its_arrival_day() -> None:
    forecast = week(3)
    alone = supply_chain.runs_out(TEA, forecast, TODAY)
    assert alone == "2026-11-06"  # 6 kg at 3 kg a day: short on Fri
    wed = (TODAY + timedelta(days=1)).isoformat()
    # 13 kg arriving Wed: 19 kg lasts until Tue 10 Nov.
    assert supply_chain.runs_out(TEA, forecast, TODAY, [(wed, 13.0)]) == "2026-11-10"
    # Enough on its way: it does not run out this week at all.
    assert supply_chain.runs_out(TEA, forecast, TODAY, [(wed, 19.0)]) == ""
    # Arriving only after it ran out: the run-out day stays.
    late = (TODAY + timedelta(days=6)).isoformat()
    assert supply_chain.runs_out(TEA, forecast, TODAY, [(late, 30.0)]) == alone
    # An undated or overdue delivery is expected any moment: it counts at once.
    assert supply_chain.runs_out(TEA, forecast, TODAY, [("", 19.0)]) == ""
    assert supply_chain.runs_out(TEA, forecast, TODAY, [("2026-11-01", 19.0)]) == ""


def test_OB_263_today_low_stock_counts_what_is_on_order() -> None:
    forecast = Forecast.model_validate(
        {
            **week(7),
            "status": "ready",
            "training_cutoff": TODAY.isoformat(),
            "predictions": [
                {**row, "lower": row["quantity"], "unit": "kg"} for row in week(7)["predictions"]
            ],
        }
    )
    inventory = [{**TEA, "source": "bought"}]
    assert [row.name for row in shop_today.low_stock(inventory, forecast, TODAY)] == ["Tea dust"]
    wed = (TODAY + timedelta(days=1)).isoformat()
    on_order = {"Tea dust": [(wed, 40.0)]}
    assert shop_today.low_stock(inventory, forecast, TODAY, "", on_order) == []


def needs(client, session, bid):
    return owner(client, session, f"businesses/{bid}/supply").json()["needs"]


def board(client, session, bid):
    return owner(client, session, f"businesses/{bid}/supply/board").json()


def test_OB_263_demo_reorder_then_arrival_then_undo(live_parent_demo, instant) -> None:  # noqa: F811
    client, _app, session, bid = live_parent_demo
    tea = next(need for need in needs(client, session, bid) if need["item"] == "Tea dust")
    # The seeded 13 kg on its way is counted: the run-out day moves on (or clears). It does not
    # cover the week after it lands, so Today still offers "Order more".
    assert tea["on_order"] > 0 and tea["arrives"]
    assert not tea["runs_out"] or tea["runs_out"] > tea["arrives"]
    assert tea["cover"] == "partly"

    before = stock_of(client, session, bid, "Tea dust")
    sent = draft_and_send(client, session, bid)
    oid = sent["id"]
    order_of(client, session, bid, oid)
    on_the_way = order_of(client, session, bid, oid)
    assert on_the_way["status"] == "dispatched"
    tea = next(need for need in needs(client, session, bid) if need["item"] == "Tea dust")
    # Reordered: nothing runs out and nothing is left to order.
    assert tea["cover"] == "full" and tea["covered"] and tea["runs_out"] == ""

    came = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{oid}/received",
        "POST",
        json={"version": on_the_way["version"]},
    ).json()
    proposal = came["proposal"]
    owner(
        client,
        session,
        f"proposals/{proposal['id']}/approve",
        "POST",
        json={"digest": proposal["digest"]},
    )
    added = round(sent["lines"][0]["quantity"])
    assert stock_of(client, session, bid, "Tea dust") == before + added
    # The goods receipt went with "Goods arrived": no second "needs you" about this delivery.
    after = board(client, session, bid)
    assert not [t for t in after["tasks"] if t.get("order_id") == oid]
    assert not [row for row in after["unsent"] if row["order_id"] == oid]
    receipt = [d for d in came["order"]["documents"] if d["kind"] == "RECEIPT"]
    assert [d["status"] for d in receipt] == ["sent"]

    # Undo: the order is on its way again and the stock is what it was.
    latest = order_of(client, session, bid, oid)
    undone = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{oid}/received/undo",
        "POST",
        json={"version": latest["version"]},
    )
    assert undone.status_code == 200, undone.text
    reopened = undone.json()
    assert not reopened["received"] and reopened["status"] in {"dispatched", "invoiced"}
    assert not [d for d in reopened["documents"] if d["kind"] == "RECEIPT"]
    assert stock_of(client, session, bid, "Tea dust") == before
    again = owner(
        client,
        session,
        f"businesses/{bid}/supply/orders/{oid}/received/undo",
        "POST",
        json={"version": reopened["version"]},
    )
    assert again.status_code == 409
