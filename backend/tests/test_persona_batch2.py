"""Second batch from the 8 Nov persona runs: billing reports as they come, one total for the day,
chats that keep their cards, and no sample data dressed up on a real shop."""

from __future__ import annotations

import io
import json
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app import sourcing
from app.connector import _heuristic_connector_mapping
from app.day_total import split, with_day_totals
from app.imports import ColumnMap, menu_items, parse_table, report_rows
from app.ingestion import normalise_date
from app.recap import recap_facts
from app.sales import sale_date
from app.streaming import history_card, same_card
from tests.test_imports import make_shop
from tests.test_merchant_store import create, store  # noqa: F401
from tests.test_photos import app, join  # noqa: F401

# ── OB-345: dates and reports the way billing apps write them ─────────────────


@pytest.mark.parametrize(
    "written",
    [
        "07/11/2026",
        "07-11-2026",
        "07.11.2026",
        "7/11/26",
        "07-11-26",
        "07-Nov-2026",
        "7-Nov-26",
        "7 Nov 2026",
        "07 November 2026",
        "07/11/2026 10:30",
        "07/11/2026 10:30 AM",
        "7 Nov 2026 10:30 AM",
        "07-Nov-2026 18:05:00",
        "2026-11-07",
        "2026-11-07T10:30:00",
    ],
)
def test_ob345_indian_dates_are_day_first(written: str) -> None:
    assert sale_date(written) == date(2026, 11, 7)
    assert normalise_date(written)[0] == "2026-11-07"


def test_ob345_an_excel_day_number_is_a_date() -> None:
    assert sale_date("46000") == date(2025, 12, 9)


@pytest.mark.parametrize("nonsense", ["", "soon", "32/13/2026", "12345", "99999"])
def test_ob345_a_date_that_is_not_one_is_refused_not_guessed(nonsense: str) -> None:
    with pytest.raises(ValueError):
        sale_date(nonsense)


def test_ob345_a_day_that_reads_two_ways_is_flagged() -> None:
    assert normalise_date("03/04/2026") == ("2026-04-03", True)
    assert normalise_date("13/04/2026") == ("2026-04-13", False)
    assert normalise_date("2026-04-03") == ("2026-04-03", False)


def test_ob345_title_lines_and_the_total_line_are_not_rows() -> None:
    report = (
        b"Item wise sale report\n"
        b"Duration: 01/11/2026 to 07/11/2026\n"
        b"\n"
        b"Date,Item Name,Quantity,Amount\n"
        b'07/11/2026,Toor Dal 1kg,9,"1,350"\n'
        b"07/11/2026,Sugar,2,90\n"
        b'Total,,11,"1,440"\n'
    )
    headers, rows = parse_table(report, "text/csv")
    assert headers == ["Date", "Item Name", "Quantity", "Amount"]
    assert [row[1] for row in rows] == ["Toor Dal 1kg", "Sugar"]


def test_ob345_an_excel_report_with_real_dates_reads_too() -> None:
    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.append(["Sale report"])
    sheet.append(["Date", "Item Name", "Quantity", "Amount"])
    sheet.append([date(2026, 11, 7), "Atta 5kg", 2, 480])
    sheet.append(["Grand Total", None, 2, 480])
    data = io.BytesIO()
    book.save(data)
    headers, rows = parse_table(data.getvalue(), "application/octet-stream")
    assert headers[1] == "Item Name" and len(rows) == 1
    assert sale_date(rows[0][0]) == date(2026, 11, 7)


def test_ob345_report_rows_leaves_an_ordinary_table_alone() -> None:
    table = [["Name", "Price"], ["Total Wash", "50"], ["Tea", "10"]]
    assert report_rows(table) == table


def test_ob345_sale_price_is_the_price_not_what_the_shop_paid() -> None:
    headers = ["Item Name", "Purchase Price", "Sale Price", "Min Stock", "Current Stock", "Unit"]
    mapping = _heuristic_connector_mapping(
        headers, [["Atta", "40", "48", "2", "9", "kg"]], "Vyapar"
    )
    roles = {field.target_field: field.source_field for field in mapping.fields}
    assert mapping.kind == "menu"
    assert roles["price"] == "Sale Price"
    assert roles["stock"] == "Current Stock"


def test_ob345_an_amount_beside_a_quantity_is_the_line_total() -> None:
    """Read as a price, ₹1,350 for 9 would be saved as 9 x 1,350."""
    headers = ["Date", "Item Name", "Quantity", "Amount"]
    mapping = _heuristic_connector_mapping(
        headers, [["07/11/2026", "Dal", "9", "1,350"]], "myBillBook"
    )
    roles = {field.target_field: field.source_field for field in mapping.fields}
    assert mapping.kind == "sales"
    assert roles["total"] == "Amount" and "price" not in roles


def test_ob345_a_sales_report_fills_the_item_list() -> None:
    mapping = ColumnMap(kind="menu", name=1, quantity=2, total=3)
    rows = [
        ["06/11/2026", "Toor Dal 1kg", "9", "1,350"],
        ["07/11/2026", "Toor Dal 1kg", "2", "310"],
        ["07/11/2026", "Free sample", "0", "0"],
    ]
    items, skipped = menu_items(rows, mapping, "INR")
    assert [(item["name"], item["price"]) for item in items] == [("Toor Dal 1kg", 155)]
    assert skipped == 1


def test_ob345_billing_report_end_to_end_both_ways(app) -> None:  # noqa: F811
    report = (
        "Sale report\n"
        "Date,Item Name,Quantity,Amount\n"
        '07/11/2026,Toor Dal 1kg,9,"1,350"\n'
        "07/11/2026,Sugar,2,90\n"
        'Total,,11,"1,440"\n'
    )
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, "INR")
        analyzed = client.post(
            f"/api/v1/businesses/{bid}/connect/analyze?source_label=Vyapar",
            json={"content": report, "content_type": "text/csv", "source_label": "Vyapar"},
        )
        assert analyzed.status_code == 200, analyzed.text
        mapping = analyzed.json()["mapping"]
        assert mapping["kind"] == "sales"
        assert analyzed.json()["total_rows"] == 2

        body = {"content": report, "content_type": "text/csv", "source_label": "Vyapar"}
        sales = client.post(
            f"/api/v1/businesses/{bid}/connect/sync", json={**body, "mapping": mapping}
        )
        assert sales.status_code == 200, sales.text
        rows = {row["item"]: row for row in sales.json()["sales"]}
        assert rows["Toor Dal 1kg"]["date"] == "2026-11-07"
        assert rows["Toor Dal 1kg"]["revenue"] == 135_000

        items = client.post(
            f"/api/v1/businesses/{bid}/connect/sync",
            json={**body, "mapping": {**mapping, "kind": "menu"}},
        )
        assert items.status_code == 200, items.text
        assert items.json()["kind"] == "menu"
        products = items.json()["proposal"]["snapshot"]["products"]
        assert {p["name"]: p["price"] for p in products} == {
            "Toor Dal 1kg": 15_000,
            "Sugar": 4_500,
        }
        # Only a review: nothing was added until the owner saves it.
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []


def test_ob345_an_item_list_without_money_is_still_refused(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, "INR")
        refused = client.post(
            f"/api/v1/businesses/{bid}/connect/mapping",
            json={
                "source_label": "Vyapar",
                "kind": "menu",
                "fields": [
                    {"source_field": "Item", "target_field": "name", "confidence": 1},
                    {"source_field": "Qty", "target_field": "quantity", "confidence": 1},
                ],
            },
        )
        assert refused.status_code == 422


# ── OB-346: one total for the day, never made-up items ────────────────────────


def close_total(client: TestClient, bid: str, **body: Any):
    return client.post(f"/api/v1/businesses/{bid}/day/total", json=body)


def test_ob346_split_is_optional_one_side_gives_the_other() -> None:
    assert split(1000, None, None) == (None, None)
    assert split(1000, 400, None) == (400, 600)
    assert split(1000, None, 250) == (750, 250)
    assert split(1000, 400, 600) == (400, 600)


@pytest.mark.parametrize(("cash", "upi"), [(400, 500), (1200, None), (None, 1200)])
def test_ob346_a_split_that_does_not_add_up_is_refused(cash: Any, upi: Any) -> None:
    with pytest.raises(Exception, match="SPLIT_DOES_NOT_ADD_UP"):
        split(1000, cash, upi)


def test_ob346_a_total_is_saved_as_a_total_not_an_item(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, "INR")
        saved = close_total(client, bid, total=12450.5, cash=4000)
        assert saved.status_code == 200, saved.text
        day = saved.json()["date"]
        assert saved.json() == {
            "date": day,
            "currency": "INR",
            "total": 1_245_050,
            "cash": 400_000,
            "upi": 845_050,
        }
        # The day reads as closed, with its money, and no item appears anywhere.
        rows = client.get(f"/api/v1/businesses/{bid}/sales").json()
        assert [(r["date"], r["revenue"], r["whole_day"], r["item"]) for r in rows] == [
            (day, 1_245_050, True, "")
        ]
        reward = client.get(f"/api/v1/businesses/{bid}/day/{day}/reward").json()
        assert reward["total"] == 1_245_050 and reward["items"] == 0
        today = client.get(f"/api/v1/businesses/{bid}/today").json()
        assert today["today"]["sales"] == 1_245_050 and today["today"]["items"] is None
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []
        # Closing again replaces it; it does not add up.
        close_total(client, bid, total=100)
        rows = client.get(f"/api/v1/businesses/{bid}/sales").json()
        assert [r["revenue"] for r in rows] == [10_000]


def test_ob346_refused_amounts_and_future_days(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, "INR")
        tomorrow = (date.today() + timedelta(days=2)).isoformat()
        assert close_total(client, bid, total=0).status_code == 422
        assert close_total(client, bid, total=-5).status_code == 422
        assert close_total(client, bid, total=100, date=tomorrow).status_code == 422
        refused = close_total(client, bid, total=100, cash=30, upi=30)
        assert refused.status_code == 422 and "SPLIT" in refused.text
        assert client.get(f"/api/v1/businesses/{bid}/sales").json() == []


def test_ob346_only_the_owner_can_close_their_shop(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        assert close_total(client, "not-my-shop", total=100).status_code == 404


def test_ob346_item_lines_win_and_totals_stay_out_of_item_views(store) -> None:  # noqa: F811
    bid = create(store, "alice", "Kirana")
    store.feature_docs.put(
        "day_total", f"{bid}:2026-11-06", bid, 1.0, {"date": "2026-11-06", "total": 900}
    )
    store.feature_docs.put(
        "day_total", f"{bid}:2026-11-07", bid, 2.0, {"date": "2026-11-07", "total": 500}
    )
    sales = [{"date": "2026-11-07", "item": "Dal", "quantity": 2, "revenue": 300}]
    merged = with_day_totals(store, bid, sales)
    assert sorted((r["date"], r["revenue"]) for r in merged) == [
        ("2026-11-06", 900),
        ("2026-11-07", 300),
    ]
    assert store.sales_history("alice", bid) == []
    facts = recap_facts(
        "2026-W45",
        merged,
        {"questions": [], "sold_out": {}, "fields": {"currency": "INR"}},
        through=date(2026, 11, 7),
    )
    assert facts["revenue"] == 1200
    assert [row["item"] for row in facts["top_sellers"] + facts["slow_movers"]] == ["Dal"]


def test_ob346_a_deleted_shop_takes_its_totals_with_it(store) -> None:  # noqa: F811
    bid = create(store, "alice", "Kirana")
    store.feature_docs.put("day_total", f"{bid}:2026-11-06", bid, 1.0, {"date": "2026-11-06"})
    store.erase_owner("alice")
    assert store.feature_docs.scoped("day_total", bid) == []


# ── OB-349: a chat keeps its cards ────────────────────────────────────────────


def test_ob349_tool_results_become_cards() -> None:
    found = {"status": "found", "card_id": "x", "item": "milk", "suppliers": [{"id": "s"}]}
    assert history_card("find_suppliers", found, "e1") == {
        "role": "suppliers",
        "result": {"status": "found", "item": "milk", "suppliers": [{"id": "s"}]},
        "key": "e1",
    }
    assert history_card("find_suppliers", {"status": "none"}, "e1") is None
    order = history_card("prepare_order", {"order_id": "o1", "status": "needs_owner_tap"}, "e2")
    assert order == {"role": "order", "orderId": "o1"}
    assert history_card("prepare_order", {"status": "error"}, "e2") is None
    assert history_card("get_insights", {"order_id": "o1"}, "e3") is None
    assert same_card({"role": "order", "orderId": "o1"}, {"role": "order", "orderId": "o1"})
    assert not same_card({"role": "user", "text": "hi"}, {"role": "order", "orderId": "o1"})


def test_ob349_reloaded_chat_has_the_supplier_and_order_cards(app, monkeypatch) -> None:  # noqa: F811
    monkeypatch.setattr(sourcing, "DEMO_REPLY_SECONDS", 0.0)

    def stream(client: TestClient, body: dict[str, Any]) -> list[dict[str, Any]]:
        response = client.post("/api/v1/coach/stream", json=body)
        assert response.status_code == 200, response.text
        return [
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        ]

    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, "INR")
        first = stream(client, {"message": "My flour is running low", "business_id": bid})
        session = next(event["session_id"] for event in first if event["kind"] == "ready")
        second = stream(
            client,
            {
                "message": "The second one looks good, order 20 kg flour from them",
                "business_id": bid,
                "session_id": session,
            },
        )
        order = next(event["data"] for event in second if event["kind"] == "order")
        history = client.get(f"/api/v1/conversations/{session}").json()["messages"]
        roles = [message["role"] for message in history]
        assert "suppliers" in roles
        assert {"role": "order", "orderId": order["id"]} in history
        # In the order it happened: the owner's words, then the cards they led to.
        assert roles.index("user") < roles.index("suppliers")
        assert roles.index("suppliers") < history.index({"role": "order", "orderId": order["id"]})
        # The order itself is read fresh, so a supplier's later answer is on it.
        sent = client.post(
            f"/api/v1/businesses/{bid}/orders/{order['id']}/send",
            json={"version": order["version"]},
        )
        assert sent.status_code == 200, sent.text
        latest = client.get(f"/api/v1/businesses/{bid}/orders/{order['id']}").json()
        assert any(message["author"] == "supplier" for message in latest["messages"])


# ── OB-348: nothing on a real shop is labelled Demo ───────────────────────────


def test_ob348_real_shop_brief_has_no_sample_weather_or_demo_flag(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, "INR")
        brief = client.get(f"/api/v1/businesses/{bid}/brief")
        assert brief.status_code == 200, brief.text
        data = brief.json()
        assert data["demo"] is False
        assert data["weather"] is None
        assert data["best_action"]["demo"] is False


def test_ob348_day_closed_with_a_total_stops_asking_to_close_a_day(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, "INR")
        close_total(client, bid, total=500)
        # Fresh menu, so "Confirm today's menu" doesn't come first.
        client.post(f"/api/v1/businesses/{bid}/freshness/confirm")
        action = client.get(f"/api/v1/businesses/{bid}/brief").json()["best_action"]
        assert action["kind"] != "record_sales"
