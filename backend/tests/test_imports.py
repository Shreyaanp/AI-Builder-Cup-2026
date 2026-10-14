import io

from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.imports import heuristic_map, number, parse_table
from tests.test_photos import app, join  # noqa: F401  (fixture + consent helper)


def make_shop(client: TestClient, currency: str = "SGD") -> str:
    proposal = client.post(
        "/api/v1/proposals",
        json={"kind": "business", "revision": 0, "business": {"name": "Ah Seng Kopi"}},
    ).json()
    if currency != "SGD":
        proposal = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                "revision": 0,
                "business": {"name": "Ah Seng Kopi", "currency": currency},
            },
        ).json()
    saved = client.post(
        f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
    )
    return str(saved.json()["business_id"])


def upload(client: TestClient, bid: str, data: bytes, mime: str = "text/csv"):
    return client.post(
        f"/api/v1/businesses/{bid}/import", content=data, headers={"content-type": mime}
    )


SQUARE_MENU = (
    b"Item Name,Variation,Price,Category\nKopi,Cup,$1.80,Drinks\nKaya toast,Set,2.50,Food\n,,,\n"
)
SALES = (
    b"Date,Item,Qty,Net Sales\n"
    b"2026-10-12,Kopi,30,54.00\n2026-10-12,Kaya toast,12,30.00\n2026-10-13,Kopi,25,45.00\n"
)


def test_csv_menu_becomes_a_reviewable_proposal_only(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        body = upload(client, bid, SQUARE_MENU).json()
        assert body["kind"] == "menu" and body["status"] == "needs_review"
        products = body["proposal"]["snapshot"]["products"]
        assert {(p["name"], p["price"]) for p in products} == {("Kopi", 180), ("Kaya toast", 250)}
        assert body["skipped"] == 0
        # Nothing is saved until the owner approves.
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []


def test_excel_menu_and_sold_out_switch_survives_import(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        first = upload(client, bid, SQUARE_MENU).json()["proposal"]
        client.post(f"/api/v1/proposals/{first['id']}/approve", json={"digest": first["digest"]})
        kopi = next(
            p
            for p in client.get(f"/api/v1/businesses/{bid}/inventory").json()
            if p["name"] == "Kopi"
        )
        client.post(
            f"/api/v1/businesses/{bid}/inventory/{kopi['id']}/availability",
            json={"available": False},
        )
        book = Workbook()
        sheet = book.active
        assert sheet is not None
        sheet.append(["Product", "Unit Price", "Unit", "Stock"])
        sheet.append(["Kopi", 2.0, "Cup", 40])
        sheet.append(["Curry puff", 1.5, "piece", 10])
        data = io.BytesIO()
        book.save(data)
        body = upload(
            client,
            bid,
            data.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ).json()
        products = {p["name"]: p for p in body["proposal"]["snapshot"]["products"]}
        assert products["Kopi"]["price"] == 200 and products["Kopi"]["available"] is False
        assert products["Kopi"]["unit"] == "item"  # the saved item, not a new "Cup" one
        assert products["Curry puff"] == {
            "name": "Curry puff",
            "category": "food",
            "price": 150,
            "unit": "piece",
            "stock": 10,
            "available": True,
        }


def test_sales_export_is_summarised_not_saved(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        body = upload(client, bid, SALES).json()
        assert body["kind"] == "sales" and body["saved"] is False
        summary = body["summary"]
        assert summary["days"] == 2 and summary["total_revenue"] == 129.0
        assert summary["top_items"][0] == {"name": "Kopi", "quantity": 55.0, "revenue": 99.0}


def test_import_rejections_and_owner_scope(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        assert upload(client, bid, b"not a pdf", "application/pdf").status_code == 415
        assert upload(client, bid, b"Item\n").status_code == 422
        assert upload(client, bid, b"x" * 5_000_001).status_code == 413
        assert upload(client, bid, b"x" * 1_000_000).status_code == 415  # one huge field
        assert (
            upload(client, bid, b"\xff\xd8\xff" + b"0" * 20_000_001, "image/jpeg").status_code
            == 413
        )
        no_price = upload(client, bid, b"Item,Notes\nKopi,hot\n")
        assert no_price.status_code == 422
    with TestClient(app) as stranger:
        join(stranger)
        assert upload(stranger, bid, SQUARE_MENU).status_code == 404


def test_parsing_helpers() -> None:
    assert number("$1,234.50") == 1234.5
    assert number("2,50") == 2.5
    assert number("¥980") == 980
    assert number("free") is None
    headers, rows = parse_table(b"Item;Price\nKopi;1.80\n", "text/csv")
    assert headers == ["Item", "Price"] and rows == [["Kopi", "1.80"]]
    assert heuristic_map(["Date", "Item", "Amount", "Qty"]).total == 2
