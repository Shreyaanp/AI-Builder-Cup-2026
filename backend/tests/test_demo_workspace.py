from fastapi.testclient import TestClient

from tests.test_photos import app, join  # noqa: F401


def test_tour_shop_is_private_filled_and_created_once(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        made = client.post("/api/v1/demo/workspace", params={"zone": "Asia/Kolkata"})
        assert made.status_code == 200, made.text
        body = made.json()
        assert body["created"] is True
        bid = body["business_id"]
        shops = client.get("/api/v1/businesses").json()
        tour = next(s for s in shops if s["id"] == bid)
        assert tour["fields"]["name"].endswith("(Tour)")
        assert tour["fields"]["currency"] == "INR"  # local to the phone's timezone
        assert tour["public"] is False  # never shown to customers
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json()  # a real menu
        forecast = client.get(f"/api/v1/businesses/{bid}/forecast").json()
        assert forecast["status"] == "ready"  # six weeks of sales history
        again = client.post("/api/v1/demo/workspace", params={"zone": "Asia/Kolkata"}).json()
        assert again == {"business_id": bid, "created": False}
