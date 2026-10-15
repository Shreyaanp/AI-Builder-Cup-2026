from fastapi.testclient import TestClient

from app.merchant import MerchantStore
from tests.test_photo_location import located_jpeg
from tests.test_photos import app, join, upload  # noqa: F401


def photo(client: TestClient, bid: str, kind: str):
    return client.post(
        f"/api/v1/businesses/{bid}/day/read?kind={kind}",
        content=located_jpeg(None),
        headers={"content-type": "image/jpeg"},
    )


def test_close_the_day_reads_photos_then_saves_sales_and_stock_after_one_review(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        first = upload(client, located_jpeg(None)).json()["proposal"]
        bid = client.post(
            f"/api/v1/proposals/{first['id']}/approve", json={"digest": first["digest"]}
        ).json()["business_id"]

        till = photo(client, bid, "sales")
        assert till.status_code == 200, till.text
        reading = till.json()
        assert reading["kind"] == "sales" and reading["fixture"] is True  # offline: labelled
        line = reading["lines"][0]
        assert line["item"] == "Chai" and line["matched"] and line["quantity"] == 12
        count = photo(client, bid, "stock_count").json()
        assert count["kind"] == "stock_count"

        # Nothing is saved by reading.
        assert client.get("/api/v1/businesses").json()[0]["fields"]["name"]
        prepared = client.post(
            f"/api/v1/businesses/{bid}/day/prepare",
            json={
                "date": "2026-10-15",
                "sales": [{"item": "Chai", "quantity": 12, "amount": 180}],
                "stock": [
                    {"item": "Chai", "quantity": 30, "mode": "count"},
                    {"item": "Unknown item", "quantity": 5, "mode": "delivery"},
                ],
            },
        )
        assert prepared.status_code == 200, prepared.text
        day = prepared.json()
        assert day["sales"]["rows"][0]["revenue"] == 18000  # SGD cents
        stock = day["stock"]
        assert [p["stock"] for p in stock["snapshot"]["products"]] == [30]  # unknown item skipped

        # One tap in the app: stock first, then the sales record (re-prepared, same content).
        saved_stock = client.post(
            f"/api/v1/proposals/{stock['id']}/approve", json={"digest": stock["digest"]}
        )
        assert saved_stock.status_code == 200, saved_stock.text
        sales = client.post(
            f"/api/v1/businesses/{bid}/day/prepare",
            json={"date": "2026-10-15", "sales": [{"item": "Chai", "quantity": 12, "amount": 180}]},
        ).json()["sales"]
        saved_sales = client.post(
            f"/api/v1/businesses/{bid}/import/{sales['import_id']}/approve",
            json={"digest": sales["digest"]},
        )
        assert saved_sales.status_code == 200, saved_sales.text
        products = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert next(p for p in products if p["name"] == "Chai")["stock"] == 30

        # A delivery adds to what is there.
        more = client.post(
            f"/api/v1/businesses/{bid}/day/prepare",
            json={"stock": [{"item": "Chai", "quantity": 10, "mode": "delivery"}]},
        ).json()
        assert more["stock"]["snapshot"]["products"][0]["stock"] == 40
        assert more["sales"] is None

        empty = client.post(f"/api/v1/businesses/{bid}/day/prepare", json={"stock": []})
        assert empty.status_code == 422


def test_day_delivery_retry_after_restart_and_sales_save_does_not_add_again(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        first = upload(client, located_jpeg(None)).json()["proposal"]
        bid = client.post(
            f"/api/v1/proposals/{first['id']}/approve", json={"digest": first["digest"]}
        ).json()["business_id"]
        base = f"/api/v1/businesses/{bid}"
        body = {
            "date": "2026-10-15",
            "stock": [
                {"item": "Chai", "quantity": 12, "mode": "delivery"},
                {"item": "Chai", "quantity": 8, "mode": "delivery"},
            ],
        }
        before = client.get(f"{base}/inventory").json()[0]["stock"] or 0
        stock = client.post(f"{base}/day/prepare", json=body).json()["stock"]
        # Two prepares before approval converge; approval may succeed despite a lost response.
        assert client.post(f"{base}/day/prepare", json=body).json()["stock"] == stock
        receipt = client.post(
            f"/api/v1/proposals/{stock['id']}/approve", json={"digest": stock["digest"]}
        ).json()
        app.state.merchant = MerchantStore(app.state.merchant.path)
        retry = client.post(f"{base}/day/prepare", json=body).json()["stock"]
        assert retry == stock
        assert (
            client.post(
                f"/api/v1/proposals/{retry['id']}/approve", json={"digest": retry["digest"]}
            ).json()
            == receipt
        )
        sale_body = {
            "date": body["date"],
            "sales": [{"item": "Chai", "quantity": 12, "amount": 180}],
        }
        for _ in range(2):
            sales = client.post(f"{base}/day/prepare", json=sale_body).json()["sales"]
            assert client.post(
                f"{base}/import/{sales['import_id']}/approve", json={"digest": sales["digest"]}
            ).is_success
        assert client.get(f"{base}/sales").json() == [
            {"date": body["date"], "item": "Chai", "quantity": 12, "revenue": 18000}
        ]
        assert client.post(f"{base}/day/prepare", json=body).json()["stock"] == stock
        assert client.get(f"{base}/inventory").json()[0]["stock"] == before + 20
        next_day = client.post(f"{base}/day/prepare", json={**body, "date": "2026-10-16"}).json()[
            "stock"
        ]
        assert next_day["id"] != stock["id"]
        assert next_day["snapshot"]["products"][0]["stock"] == before + 40


def test_one_odd_line_does_not_throw_away_the_whole_till_photo() -> None:
    import json

    from app.day_close import lenient_read

    text = json.dumps(
        {
            "kind": "receipt",
            "date": "15/10/2026",
            "lines": [
                {"item": "Masala chai", "quantity": 42, "amount": 840},
                {"item": "", "quantity": None, "amount": 2130},
                {"item": "Refund", "quantity": 1, "amount": -20},
                {"item": "Samosa", "quantity": 30, "amount": 450},
            ],
        }
    )
    read = lenient_read(text, "sales")
    assert read is not None and read.kind == "sales"
    assert [line.item for line in read.lines] == ["Masala chai", "Samosa"]
    assert lenient_read("not json", "sales") is None
