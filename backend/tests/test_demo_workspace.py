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


PROD_CHAIN_OWNER = "chalkboard-demo-owner"


def seed_prod_metro(store) -> None:
    """Metro Foods as the production supply seed left it, owned by `chalkboard-demo-owner`."""
    from app.demo_chains import METRO
    from app.demo_supply_seed import seed_shop as seed_chain_supply

    store.seed_demo_shop(PROD_CHAIN_OWNER, METRO.id, METRO.fields, METRO.products)
    seed_chain_supply(store, PROD_CHAIN_OWNER, METRO.id)


def test_tour_works_when_prod_chains_belong_to_another_seed_owner(app) -> None:  # noqa: F811
    """Production's Metro Foods is owned by the supply-seed account, not `demo-world-owner`."""
    from app.demo_chains import METRO

    with TestClient(app) as client:
        join(client)
        store = app.state.merchant
        seed_prod_metro(store)
        assert store.owners(METRO.id) == [PROD_CHAIN_OWNER]
        # Fresh account.
        made = client.post("/api/v1/demo/workspace", params={"zone": "Asia/Kolkata"})
        assert made.status_code == 200, made.text
        assert made.json()["created"] is True
        assert store.owners(METRO.id) == [PROD_CHAIN_OWNER]


def test_tour_reseeds_an_account_that_already_has_an_older_tour_shop(app) -> None:  # noqa: F811
    from app import supply_chain
    from app.tour_story import stable

    with TestClient(app) as client:
        join(client)
        store = app.state.merchant
        seed_prod_metro(store)
        first = client.post("/api/v1/demo/workspace", params={"zone": "Asia/Kolkata"}).json()
        bid = first["business_id"]
        # Make the tour order look like the one an earlier release left behind.
        key = supply_chain._key(bid, stable(f"{bid}/purchase-order"))
        old = store.feature_docs.get(supply_chain.ORDERS, key)
        assert old
        store.feature_docs.put(
            supply_chain.ORDERS,
            key,
            bid,
            old["created"],
            {**old, "channel": "json", "received": False, "version": 3},
        )
        again = client.post("/api/v1/demo/workspace", params={"zone": "Asia/Kolkata"})
        assert again.status_code == 200, again.text
        assert again.json() == {"business_id": bid, "created": False}
        assert store.feature_docs.get(supply_chain.ORDERS, key)["channel"] == "text"


def test_refused_workspace_logs_the_reason(app, caplog) -> None:  # noqa: F811
    from fastapi import HTTPException

    with TestClient(app) as client:
        join(client)

        def refuse(*_args, **_kwargs):
            raise HTTPException(404, "Business not found.")

        import app.demo_workspace as route

        original = route.seed_workspace
        route.seed_workspace = refuse
        try:
            with caplog.at_level("WARNING"):
                made = client.post("/api/v1/demo/workspace")
        finally:
            route.seed_workspace = original
        assert made.status_code == 404
        assert "Business not found." in caplog.text
