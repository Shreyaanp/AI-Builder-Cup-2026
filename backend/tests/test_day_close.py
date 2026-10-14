from fastapi.testclient import TestClient

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
