"""The tour is a connected story in real repositories, with no provider calls."""

import asyncio
import json
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import supply_chain
from app.community import Community, SqliteDocuments
from app.demo_coach import public_demo_reply
from app.demo_world import WorldGenerator, WorldRequest, ensure_world
from app.forecast import ForecastService
from app.merchant import BusinessFields, MerchantStore, ProposalRequest
from app.passport import PassportState
from app.settings import Settings
from app.supply_docs import parse
from app.tour_catalogue import CENTRES, TOUR_SHOPS
from app.tour_media import bundled_photo, photo_id
from app.tour_story import SEED_OWNER, seed_story, seed_workspace, tour_id
from scripts.seed_tour_story import main
from tests.test_photos import app, join  # noqa: F401

DAY = date(2026, 10, 17)


@pytest.fixture
def seeded_day(monkeypatch) -> None:
    # OB-206 (#557): the story is seeded for DAY, so the shop's "today" is DAY too. Reading
    # the real clock left a week-old history that the forecast rightly refuses after 7 days.
    monkeypatch.setattr(supply_chain, "shop_today", lambda _context: DAY)


@pytest.fixture
def world(tmp_path: Path):
    return (
        MerchantStore(str(tmp_path / "merchant.sqlite3")),
        Community(SqliteDocuments(str(tmp_path / "community.sqlite3"))),
    )


def test_catalogues_have_local_prices_languages_and_artwork() -> None:
    assert Counter(s.city for s in TOUR_SHOPS) == {"bengaluru": 8, "singapore": 5}
    for demo in TOUR_SHOPS:
        assert demo.fields.demo and demo.fields.name.endswith("(Demo)")
        assert len(demo.products) == 6 and len(demo.fields.weekly_hours) == 7
        assert demo.fields.currency == ("INR" if demo.city == "bengaluru" else "SGD")
        assert ("UPI" if demo.city == "bengaluru" else "paynow") in demo.fields.payment_methods
        assert any(f.key == "languages" for f in demo.fields.custom_facts)
        data = bundled_photo(photo_id(demo))
        assert data and data.startswith(b"\xff\xd8")
    assert TOUR_SHOPS[0].products[0].price == 2000  # ₹20, minor units
    assert TOUR_SHOPS[8].products[0].price == 170  # S$1.70
    assert TOUR_SHOPS[0].fields.profile.kind == "food"
    assert TOUR_SHOPS[2].fields.profile.kind == "tailor"
    assert TOUR_SHOPS[3].fields.profile.kind == "service"


def test_seed_is_idempotent_and_preserves_replies_rewards_and_stock(world) -> None:
    store, community = world
    seed_story(store, community, owner_uid="owner", customer_uid="customer", today=DAY)
    before = store.list_businesses(SEED_OWNER)
    private_before = store.list_businesses("owner")
    histories = {d.id: store.sales_history(SEED_OWNER, d.id) for d in TOUR_SHOPS}
    passport = community.docs.get("passport", "customer")
    orders = store.feature_docs.scoped("supply_po", TOUR_SHOPS[0].id)
    seed_story(store, community, owner_uid="owner", customer_uid="customer", today=DAY)
    assert store.list_businesses(SEED_OWNER) == before
    assert store.list_businesses("owner") == private_before
    assert community.docs.get("passport", "customer") == passport
    assert store.feature_docs.scoped("supply_po", TOUR_SHOPS[0].id) == orders
    for demo in TOUR_SHOPS:
        rows = store.sales_history(SEED_OWNER, demo.id)
        assert rows == histories[demo.id]
        assert len({r["date"] for r in rows}) == 56
        assert max(r["date"] for r in rows) == (DAY - timedelta(days=1)).isoformat()
        assert community.tips(demo.id)
        assert store.public_shop(demo.id)["gallery"]
    bid = tour_id("owner", "bengaluru")
    inventory = store.inventory("owner", bid)
    # OB-129: visible tour inquiries use names and clean messages, without fake email contacts.
    visible_inquiries = store.inquiries("owner", bid)
    assert {item.name for item in visible_inquiries} == {"Asha", "Wei", "Priya"}
    assert all(not item.message.startswith("[Demo]") for item in visible_inquiries)
    assert all(item.contact.endswith("@guest.invalid") for item in visible_inquiries)
    store.set_availability("owner", bid, inventory[0]["id"], False)
    inquiry = store.inquiries("owner", bid)[0]
    store.thread_action("owner", bid, inquiry.id, "", "post", "See you at five.")
    seed_story(store, community, owner_uid="owner", customer_uid="customer", today=DAY)
    assert store.inventory("owner", bid)[0]["available"] is False
    assert store.inquiries("owner", bid)[0].messages[-1].text == "See you at five."
    thread = community.threads("customer")[0]
    store.thread_action(
        SEED_OWNER, thread["bid"], thread["iid"], "", "post", "Your order is ready."
    )
    seed_story(store, community, customer_uid="customer", today=DAY)
    reply = store.thread_action(None, thread["bid"], thread["iid"], thread["token"], "get")
    assert reply.messages[-1].text == "Your order is ready."


async def test_every_feature_has_connected_records_and_truthful_forecasts(world) -> None:
    store, community = world
    seed_story(store, community, owner_uid="owner", customer_uid="customer", today=DAY)
    forecaster = ForecastService(Settings(_env_file=None, forecast_backend="weekday_average"))
    for city in CENTRES:
        bid = tour_id("owner", city)
        context = store.context("owner", bid)
        assert context["business"]["fields"]["demo"]
        assert not context["business"]["public"]
        assert store.playbook("owner", bid)["mode"] == "offline"
        forecast = await forecaster.forecast(
            store.sales_history("owner", bid), DAY, context["inventory"]
        )
        assert forecast.status == "ready" and forecast.method == "weekday_average"
        order = supply_chain.orders(store, "owner", bid)[0]
        assert order["channel"] == "text" and order["terms_days"] == 0
        assert order["supplier"]["name"] == (
            "Sri Lakshmi Provisions (Demo)" if city == "bengaluru" else "Ah Huat Provision (Demo)"
        )
        assert {line["item"] for line in order["lines"]} == (
            {"Tea dust", "Milk", "Sugar", "Paper cups (50)"}
            if city == "bengaluru"
            else {"Kopi powder", "Evaporated milk", "Sugar", "Paper cups (50)"}
        )
        assert order["documents"][0]["translated_format"] == "text"
        for document in order["documents"][1:]:
            assert document["raw_format"] == "text"
            assert parse(document["raw"])[0].ref == order["number"]
        assert order["status"] == "invoiced" and order["simulated"]
        assert order["reason"]["method"] == "weekday_average"
        assert order["reason"]["daily"] > 0 and order["reason"]["wanted"] > 0
        # Bags of leaves/beans must never include forecasts measured in cups of tea/coffee.
        assert order["reason"]["daily"] <= 3 and order["reason"]["rows"] == 7
        assert order["lines"][0]["quantity"] <= 25
        assert order["match"] == [] and order["open_flags"] == 0
        assert [d["kind"] for d in order["documents"]] == ["ORDERS", "ORDRSP", "DESADV", "INVOIC"]
        for document in order["documents"][1:]:
            assert parse(document["translated"])[0].ref == order["number"]
        # The owner can finish the existing receipt/approval flow without rebuilding fixtures.
        received = supply_chain.receive(store, "owner", bid, order["id"], order["version"])
        closed = supply_chain.accept(store, "owner", bid, order["id"], received["order"]["version"])
        assert closed["status"] == "closed"
    state = PassportState.model_validate(community.docs.get("passport", "customer"))
    assert state.points == 0 and state.demo_points > 0
    assert len(state.scratch) == 10 and all(t.demo for t in state.scratch)
    assert all(s.demo for s in state.stamps)
    assert sum(p.rescues for p in state.shops.values()) == 2
    assert state.shops[TOUR_SHOPS[0].id].card == 5
    assert state.shops[TOUR_SHOPS[8].id].card == 5
    threads = community.threads("customer")
    assert len(threads) == 2
    for thread in threads:
        record = store.thread_action(None, thread["bid"], thread["iid"], thread["token"], "get")
        assert record.messages[-1].author == "owner" and record.messages[-1].kind == "demo"
    with pytest.raises(HTTPException):
        community.thread("stranger", threads[0]["bid"], threads[0]["iid"])


def test_ob127_demo_supplier_coach_points_to_grow_supplies(world) -> None:
    # OB-127: the demo coach points owners to the Grow tab that holds supplies. Simplify batch 2
    # renamed the stale "Grow → Supplies" to the tile owners see, "Grow → Purchase orders".
    store, _ = world
    uid = "public-demo-ob127"
    bid, _ = seed_workspace(store, uid, "bengaluru", DAY)
    ctx = SimpleNamespace(store=store, uid=uid, business_id=bid)

    reply = public_demo_reply(ctx, "My masala chai is running low. Find suppliers.")

    assert reply is not None
    assert "Next, open Grow → Purchase orders." in reply
    assert "Grow → Supplies" not in reply
    assert "Shop → Supplies" not in reply


def test_reset_is_scoped_and_restores_only_demo_records(world) -> None:
    store, community = world
    prepared = store.propose(
        "owner", ProposalRequest(kind="business", business=BusinessFields(name="My real shop"))
    )
    real = store.commit("owner", prepared["id"], prepared["digest"])["business_id"]
    seed_story(store, community, owner_uid="owner", customer_uid="customer", today=DAY)
    bid = tour_id("owner", "bengaluru")
    product = store.inventory("owner", bid)[0]
    store.set_availability("owner", bid, product["id"], False)
    seed_story(store, community, owner_uid="owner", customer_uid="customer", today=DAY, reset=True)
    assert store.context("owner", real)["business"]["fields"]["name"] == "My real shop"
    assert store.inventory("owner", bid)[0]["available"]
    assert len(store.inquiries("owner", bid)) == 3
    assert len(community.threads("customer")) == 2
    assert len(supply_chain.orders(store, "owner", bid)) == 1


def test_customer_can_reload_after_public_world_reset_without_losing_rewards(world) -> None:
    store, community = world
    seed_story(store, community, customer_uid="customer", today=DAY)
    passport = community.docs.get("passport", "customer")
    community.follow("customer", TOUR_SHOPS[1].id, False)
    seed_story(store, community, today=DAY, reset=True)

    seed_story(store, community, customer_uid="customer", today=DAY)

    assert community.docs.get("passport", "customer") == passport
    assert TOUR_SHOPS[1].id not in community.profile("customer").follows
    threads = community.threads("customer")
    assert len(threads) == 2
    for thread in threads:
        record = store.thread_action(None, thread["bid"], thread["iid"], thread["token"], "get")
        assert record.messages[-1].author == "owner"


def test_world_uses_area_currency_instead_of_phone_currency(world) -> None:
    store, community = world
    generator = WorldGenerator(Settings(_env_file=None, coach_mode="offline"))
    body = WorldRequest(lat=1.3052, lng=103.9045, currency="INR", timezone="Asia/Kolkata")
    first = asyncio.run(ensure_world(store, generator, body, community))
    again = asyncio.run(ensure_world(store, generator, body, community))
    assert len(first.shop_ids) == 5 and first.created and not again.created
    assert store.public_shop(first.shop_ids[0])["currency"] == "SGD"


def test_workspace_switches_worlds_and_customer_opt_in_uses_live_routes(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        assert client.post("/api/v1/demo/customer").status_code == 401
        join(client)
        india = client.post("/api/v1/demo/workspace?zone=Asia/Kolkata").json()["business_id"]
        sg = client.post("/api/v1/demo/workspace?zone=Asia/Singapore").json()["business_id"]
        assert india != sg
        for bid in (india, sg):
            today = client.get(f"/api/v1/businesses/{bid}/today").json()
            assert today["demo"] and today["yesterday"]["sales"] > 0
            assert today["today"]["stamps"] > 0 and today["low_stock"]
            assert client.get(f"/api/v1/businesses/{bid}/forecast").json()["status"] == "ready"
            chart = client.post(
                "/api/v1/coach/stream", json={"message": "Forecast my sales", "business_id": bid}
            )
            assert chart.status_code == 200
            events = [
                json.loads(line.removeprefix("data: "))
                for line in chart.text.splitlines()
                if line.startswith("data: ")
            ]
            assert any(event["kind"] == "chart" for event in events)
            offers = client.get(f"/api/v1/businesses/{bid}/rescue")
            assert offers.status_code == 200
            assert offers.json()[0]["status"] == "live" and offers.json()[0]["demo"]
        rescues = client.get("/api/v1/public/rescue", params={"lat": 12.9718, "lng": 77.6412})
        assert rescues.status_code == 200 and rescues.json()
        client.post("/api/v1/customer/session", json={"name": "Demo judge"})
        assert client.post("/api/v1/demo/customer").json()["ready"] is True
        passport = client.get("/api/v1/customer/passport").json()
        assert passport["demo_points"] > 0 and passport["impact"]["co2_kg"] > 0
        assert len(client.get("/api/v1/customer/threads").json()) == 2
        public = client.get(f"/api/v1/public/shops/{TOUR_SHOPS[0].id}").json()
        assert "verified_owner" not in public  # Demo badge never establishes actual verification.
        assert any(f["key"] == "demo_verified" for f in public["facts"]["custom"])
        photo = client.get(
            f"/api/v1/public/shops/{TOUR_SHOPS[0].id}/photos/{public['gallery'][0]}.jpg"
        )
        assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg"

    with TestClient(app) as stranger:
        join(stranger)
        assert (
            stranger.post(
                "/api/v1/coach/stream", json={"message": "Forecast my sales", "business_id": india}
            ).status_code
            == 404
        )


def test_seeded_bakery_matches_stated_preferences(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        assert client.post("/api/v1/demo/workspace").status_code == 200
        client.post("/api/v1/customer/session", json={"name": "Demo neighbour"})
        bid = "demo-story-singapore-bakery"
        assert client.put(f"/api/v1/customer/follows/{bid}").status_code == 200
        answer = client.post(
            "/api/v1/discover/ask",
            json={
                "q": "I'm vegetarian, croissant in Katong",
                "lat": 1.3052,
                "lng": 103.9045,
                "radius": 8000,
            },
        )
        assert answer.status_code == 200
        picks = [p for g in answer.json()["groups"] if g["id"] == "for_you" for p in g["places"]]
        bakery = next(p for p in picks if p["id"] == bid)
        assert bakery["because"]["kind"] == "followed"


def test_cli_dry_run_and_explicit_target(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    path = tmp_path / "tour.sqlite3"
    assert main(["--sqlite", str(path), "--dry-run"]) == 0 and not path.exists()
    with pytest.raises(SystemExit):
        main([])
    assert main(["--sqlite", str(path), "--date", str(DAY), "--reset"]) == 0
    assert main(["--sqlite", str(path), "--date", str(DAY)]) == 0


@pytest.mark.parametrize("zone", ["Asia/Kolkata", "Asia/Singapore"])
def test_production_tour_seeds_fresh_owner_once_without_provider_calls(
    app,  # noqa: F811
    monkeypatch,
    zone,
) -> None:
    # Use local repositories with production route settings; forbid provider network I/O.
    import socket

    connect = socket.socket.connect

    def no_network(sock, address):
        if address[0] in {"127.0.0.1", "::1"}:
            return connect(sock, address)
        pytest.fail("Tour seeding must not contact model, payment or other providers")

    monkeypatch.setattr(socket.socket, "connect", no_network)
    with TestClient(app) as client:
        join(client)
        app.state.v1_settings = app.state.v1_settings.model_copy(update={"app_env": "production"})
        assert client.get("/api/v1/businesses").json() == []
        first = client.post(f"/api/v1/demo/workspace?zone={zone}")
        assert first.status_code == 200, first.text
        bid = first.json()["business_id"]
        assert first.json()["created"] is True
        businesses = client.get("/api/v1/businesses").json()
        assert len(businesses) == 1
        assert businesses[0]["fields"]["demo"]
        assert businesses[0]["fields"]["name"].endswith("(Tour)")
        assert app.state.merchant.public_shop(bid) is None
        context = client.get(f"/api/v1/demo/chain/{bid}")
        assert context.status_code == 200, context.text
        assert context.json()["order"]["number"] == "4500000001"
        assert context.json()["wholesaler"]["inbound"]["lines"] == context.json()["order"]["lines"]
        again = client.post(f"/api/v1/demo/workspace?zone={zone}")
        assert again.json() == {"business_id": bid, "created": False}
        assert client.get("/api/v1/businesses").json() == businesses


def test_production_customer_seeds_fresh_account_once_without_provider_calls(
    app,  # noqa: F811
    monkeypatch,
) -> None:
    import socket

    connect = socket.socket.connect

    def no_network(sock, address):
        if address[0] in {"127.0.0.1", "::1"}:
            return connect(sock, address)
        pytest.fail("Customer seeding must not contact model or payment providers")

    monkeypatch.setattr(socket.socket, "connect", no_network)
    with TestClient(app) as client:
        app.state.v1_settings = app.state.v1_settings.model_copy(update={"app_env": "production"})
        client.post("/api/v1/customer/session", json={"name": "Demo judge"})
        first = client.post("/api/v1/demo/customer")
        assert first.status_code == 200 and first.json()["ready"]
        passport = client.get("/api/v1/customer/passport").json()
        threads = client.get("/api/v1/customer/threads").json()
        assert passport["points"] == 0 and passport["demo_points"] > 0
        assert len(threads) == 2
        assert client.post("/api/v1/demo/customer").json() == first.json()
        assert client.get("/api/v1/customer/passport").json() == passport
        assert client.get("/api/v1/customer/threads").json() == threads


@pytest.mark.parametrize("route", ["workspace", "customer"])
def test_production_demo_rate_limit_prevents_seeding(app, monkeypatch, route) -> None:  # noqa: F811
    from unittest.mock import Mock

    with TestClient(app) as client:
        join(client)
        client.post("/api/v1/customer/session", json={"name": "Demo judge"})
        app.state.v1_settings = app.state.v1_settings.model_copy(update={"app_env": "production"})
        take = Mock(return_value=60)
        monkeypatch.setattr(app.state.rate_limiter, "take", take)
        response = client.post(f"/api/v1/demo/{route}")
        assert response.status_code == 429
        assert response.headers["Retry-After"] == "60"
        assert all(
            bucket.action == "proposal" and bucket.subject for bucket in take.call_args[0][0]
        )
        assert app.state.merchant.shared_shops() == []


def test_reset_refuses_real_passport_before_changing_any_fixture(world) -> None:
    store, community = world
    seed_story(store, community, today=DAY)
    before = store.list_businesses(SEED_OWNER)
    community.docs.put("passport", "real-customer", "real-customer", 0, {"points": 10})
    with pytest.raises(ValueError, match="non-demo passport"):
        seed_story(store, community, customer_uid="real-customer", today=DAY, reset=True)
    assert store.list_businesses(SEED_OWNER) == before


def test_private_tours_are_owned_and_separate(world) -> None:
    store, community = world
    seed_story(store, community, today=DAY)
    first, _ = seed_workspace(store, "one", "bengaluru", DAY)
    second, _ = seed_workspace(store, "two", "bengaluru", DAY)
    assert first != second and store.public_shop(first) is None
    with pytest.raises(HTTPException):
        store.context("two", first)


def test_owner_tour_preserves_existing_real_customer_passport(world) -> None:
    store, community = world
    real = {"points": 10, "stamps": [{"demo": False, "shop_id": "real-shop"}]}
    community.docs.put("passport", "owner", "owner", 0, real)

    seed_story(store, community, owner_uid="owner", customer_uid="owner", today=DAY)

    assert len(store.list_businesses("owner")) == 2
    assert community.docs.get("passport", "owner") == real
    assert community.threads("owner") == []


def test_private_tour_rolls_forward_without_replacing_owner_actions(world) -> None:
    store, community = world
    seed_story(store, community, owner_uid="owner", today=DAY)
    bid = tour_id("owner", "bengaluru")
    product = store.inventory("owner", bid)[0]
    store.set_availability("owner", bid, product["id"], False)
    store.set_gallery("owner", bid, ["owner-chosen-photo"])
    order = supply_chain.orders(store, "owner", bid)[0]
    supply_chain.receive(store, "owner", bid, order["id"], order["version"])
    next_day = DAY + timedelta(days=1)

    assert seed_workspace(store, "owner", "bengaluru", next_day) == (bid, False)

    assert max(r["date"] for r in store.sales_history("owner", bid)) == DAY.isoformat()
    assert store.feature_docs.get("shop_daily", f"{bid}:{next_day}")["stamps"] > 0
    deals = store.feature_docs.get("rescue", bid)["deals"]
    assert deals[0]["data"]["day"] == next_day.isoformat()
    assert store.inventory("owner", bid)[0]["available"] is False
    assert store.context("owner", bid)["business"]["gallery"] == ["owner-chosen-photo"]
    assert supply_chain.orders(store, "owner", bid)[0]["received"]
    assert store.public_shop(bid) is None


def test_private_tour_stays_private_during_seeding_and_resumes_a_partial_seed(
    world, monkeypatch
) -> None:
    store, community = world
    seed_story(store, community, today=DAY)
    bid = tour_id("owner", "bengaluru")
    demo = TOUR_SHOPS[0]
    fields = demo.fields.model_copy(update={"name": demo.fields.name + " (Tour)"})
    store.seed_demo_shop("owner", bid, fields, demo.products, public=False)
    original_save = store.save_sales

    def save(uid, business_id, iid, digest):
        assert store.public_shop(business_id) is None
        return original_save(uid, business_id, iid, digest)

    monkeypatch.setattr(store, "save_sales", save)
    assert seed_workspace(store, "owner", "bengaluru", DAY) == (bid, False)
    assert len({row["date"] for row in store.sales_history("owner", bid)}) == 56
    assert len(supply_chain.orders(store, "owner", bid)) == 1
    assert store.public_shop(bid) is None


@pytest.mark.parametrize(
    ("city", "item", "supplier"),
    [
        ("bengaluru", "Tea dust", "Sri Lakshmi Provisions (Demo)"),
        ("singapore", "Kopi powder", "Ah Huat Provision (Demo)"),
    ],
)
def test_tour_reorder_drafts_from_the_wholesaler(world, seeded_day, city, item, supplier) -> None:
    """#264: Reorder on the tour shop drafts the stocked supply, not the chai brewed from it."""
    store, community = world
    seed_story(store, community, owner_uid="owner", today=DAY)
    bid = tour_id("owner", city)
    forecaster = ForecastService(Settings(_env_file=None, forecast_backend="weekday_average"))

    result = asyncio.run(
        supply_chain.draft_reorder(store, "owner", bid, "", None, forecaster, None, "demo")
    )

    assert result["status"] == "drafted"
    assert result["order"]["supplier"]["name"] == supplier
    assert [line["item"] for line in result["order"]["lines"]] == [item]
    # The kilos on the shelf follow the kilos sold, never the cups of chai or kopi.
    assert result["order"]["reason"]["daily"] < 5


def test_wholesaler_books_the_stall_order_and_restocks_by_csv(world) -> None:
    """Vendor to vendor: PO 4500000001 is an order coming in for the wholesaler, and the
    wholesaler's own spreadsheet order goes to its distributor. Reruns add nothing."""
    store, community = world
    for _ in range(2):
        seed_story(store, community, today=DAY)
    from app import supply_io

    for city, stall, distributor, item in [
        ("bengaluru", "Lantern Chai Corner (Demo)", "Anand Distributors (Demo)", "Tea dust"),
        (
            "singapore",
            "Sunny Side Kopitiam (Demo)",
            "Katong Trading (Demo)",
            "Kopi powder",
        ),
    ]:
        sid = f"demo-story-{city}-supplier"
        orders = {po["number"]: po for po in supply_chain.all_orders(store, sid)}
        assert len(orders) == 2 and len(supply_io.inbox(store, sid)) == 2
        sold = next(po for po in orders.values() if supply_io.direction_of(po) == "out")
        bought = next(po for po in orders.values() if supply_io.direction_of(po) == "in")
        assert sold["number"] == "4500000001"
        assert supply_io.partner_of(sold)["name"] == stall
        assert sold["lines"][0]["item"] == item
        assert supply_io.partner_of(bought)["name"] == distributor
        assert bought["documents"][0]["raw_format"] == "csv"
        assert bought["documents"][0]["raw"].startswith("doc_type,doc_number")


def test_tour_chain_follows_one_order_on_seeded_records(app) -> None:  # noqa: F811
    """Every name and number in the tour's order story comes from the seeded records."""
    with TestClient(app) as client:
        join(client)
        stories = {}
        for zone in ("Asia/Kolkata", "Asia/Singapore"):
            bid = client.post(f"/api/v1/demo/workspace?zone={zone}").json()["business_id"]
            response = client.get(f"/api/v1/demo/chain/{bid}")
            assert response.status_code == 200, response.text
            stories[zone] = (bid, response.json())
        bid, india = stories["Asia/Kolkata"]
        assert india["today"]["item"] == "Tea dust" and india["today"]["runs_out"]
        assert india["order"]["number"] == "4500000001"
        assert india["order"]["partner"] == "Sri Lakshmi Provisions (Demo)"
        assert [line["item"] for line in india["order"]["lines"]][1:] == [
            "Milk",
            "Sugar",
            "Paper cups (50)",
        ]
        assert india["order"]["message"].startswith("*Purchase order 4500000001*")
        inbound = india["wholesaler"]["inbound"]
        assert inbound["number"] == "4500000001"
        assert inbound["partner"] == "Lantern Chai Corner (Demo)"
        assert inbound["lines"] == india["order"]["lines"]
        restock = india["wholesaler"]["restock"]
        assert restock["partner"] == "Anand Distributors (Demo)"
        assert restock["csv"].startswith("doc_type,doc_number")
        chain = india["chain"]
        assert chain["name"] == "Metro Foods (Demo)" and chain["outlets"] == "24"
        assert chain["order"]["partner"] == "Bharat FMCG Distribution (Demo)"
        assert chain["order"]["idocs"][:4] == ["ORDERS05", "ORDERS05", "DELVRY07", "INVOIC02"]
        tea = next(row for row in india["arrived"] if row["item"] == "Tea dust")
        assert tea["after"] == tea["before"] + india["order"]["lines"][0]["quantity"]
        assert tea["runs_out_before"] and not tea["runs_out_after"]
        assert tea["covered_until"] > tea["runs_out_before"]
        assert india["customers"]["stamps_needed"] == 8
        assert india["customers"]["reward"] == "A free chai"
        assert india["customers"]["stamps_today"] > 0
        _, sg = stories["Asia/Singapore"]
        assert sg["today"]["item"] == "Kopi powder"
        # OB-62: a kopitiam's numbers read like a busy shop, not "1 kg left, about 1 kg a day".
        assert sg["today"]["stock"] >= 3 and sg["today"]["daily"] >= 1.5
        assert sg["order"]["partner"] == "Ah Huat Provision (Demo)"
        assert sg["wholesaler"]["restock"]["partner"] == "Katong Trading (Demo)"
        assert sg["wholesaler"]["inbound"]["partner"] == "Sunny Side Kopitiam (Demo)"

    with TestClient(app) as stranger:
        join(stranger)
        assert stranger.get(f"/api/v1/demo/chain/{bid}").status_code == 404


def test_demo_chain_never_calls_the_paid_forecast_and_is_limited(app, monkeypatch) -> None:  # noqa: F811
    """OB-232: the tour chain reads seeded records with the weekday average, and is rate limited."""
    from unittest.mock import AsyncMock, MagicMock

    from app import demo_workspace

    paid = MagicMock()
    paid.query = AsyncMock(side_effect=AssertionError("paid forecast called"))
    limited: list[list[tuple[str, str]]] = []
    real = demo_workspace.enforce_limits

    async def spy(request, subjects, **kwargs):
        limited.append(list(subjects))
        return await real(request, subjects, **kwargs)

    monkeypatch.setattr(demo_workspace, "enforce_limits", spy)
    with TestClient(app) as client:
        join(client)
        bid = client.post("/api/v1/demo/workspace?zone=Asia/Kolkata").json()["business_id"]
        settings = app.state.forecaster.settings.model_copy(update={"forecast_backend": "bigquery"})
        app.state.forecaster = ForecastService(settings, client=paid)
        limited.clear()
        response = client.get(f"/api/v1/demo/chain/{bid}")
        assert response.status_code == 200, response.text
    assert paid.query.await_count == 0
    assert any(subject[0] == "forecast" for call in limited for subject in call)


@pytest.mark.parametrize("city", CENTRES)
async def test_today_reorder_on_the_tour_shop_drafts_from_its_wholesaler(
    world, seeded_day, city
) -> None:
    # #264: the Today card's item is a drink sold by the cup; its wholesaler sells the
    # ingredient by the kg. The draft orders that ingredient instead of finding no supplier.
    from app.coordinator import DEMO_OWNER_UID, SupplierGenerator

    store, community = world
    seed_story(store, community, owner_uid="owner", customer_uid="customer", today=DAY)
    bid = tour_id("owner", city)
    settings = Settings(_env_file=None, forecast_backend="weekday_average", coach_mode="offline")
    result = await supply_chain.draft_reorder(
        store,
        "owner",
        bid,
        "",
        None,
        ForecastService(settings),
        SupplierGenerator(settings),
        DEMO_OWNER_UID,
    )
    assert result["status"] == "drafted", result
    order = result["order"]
    assert order["supplier"]["name"] == (
        "Sri Lakshmi Provisions (Demo)" if city == "bengaluru" else "Ah Huat Provision (Demo)"
    )
    line = order["lines"][0]
    assert line["quantity"] > 0 and line["total"] > 0
    assert line["unit"] == "kg" and line["quantity"] <= 20
    # A stall-sized order (the seeded stall orders stay under 1 lakh / S$1,000 too).
    assert order["total"] < 100_000_00
    assert order["reason"]["item"]
