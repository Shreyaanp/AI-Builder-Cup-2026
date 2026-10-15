"""Today's 7: card candidates, ranking, the finite assembly, honesty labels and day stability."""

import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.rescue_feed import RescueDeal
from app.settings import Settings
from app.shop_time import shop_timezone
from app.today import (
    MAX_PER_KIND,
    Context,
    Find,
    FindShop,
    assemble,
    feed_day,
    next_drop,
    rescue_cards,
)
from scripts.seed_demo_shops import seed

DEMO = "demo-tiong-bahru-bakery"
EMULATOR = (os.getenv("FIRESTORE_EMULATOR_HOST") or "").split(":")[0] in {"127.0.0.1", "localhost"}
PROJECT = "demo-ogoogle-local"
SG = shop_timezone("Asia/Singapore")


def card(kind: str, shop: str | None, value: float, **extra) -> Find:
    return Find(
        id=f"{kind}:{shop}:{value}",
        kind=kind,  # type: ignore[arg-type]
        shop=FindShop(id=shop, name=shop, distance_m=100, walk_min=2) if shop else None,
        source="demo",
        demo=True,
        action="go",
        score=value,
        **extra,
    )


def test_feed_day_turns_at_seven() -> None:
    early = datetime(2026, 10, 15, 6, 30, tzinfo=SG)
    late = datetime(2026, 10, 15, 7, 5, tzinfo=SG)
    assert feed_day(early).isoformat() == "2026-10-14"
    assert feed_day(late).isoformat() == "2026-10-15"
    assert next_drop(early) == datetime(2026, 10, 15, 7, tzinfo=SG).timestamp()
    assert next_drop(late) == datetime(2026, 10, 16, 7, tzinfo=SG).timestamp()


def test_assembly_caps_kinds_and_shops_and_never_pads() -> None:
    pool = [card("tip", f"s{i}", 0.5 - i / 100) for i in range(5)]
    pool += [card("only_one", "s0", 0.4), card("only_one", "s9", 0.3)]
    pool += [card("locally_made", "s8", 0.01)]  # too weak: never padded in
    chosen = assemble(pool, set(), [])
    kinds = [c.kind for c in chosen]
    assert kinds.count("tip") == MAX_PER_KIND
    shops = [c.shop.id for c in chosen if c.shop]
    assert len(shops) == len(set(shops))
    assert "locally_made" not in kinds
    assert len(chosen) < 7
    assert chosen[0].kind == "only_one"  # A surprise card leads.


def test_urgent_rescue_leads_and_seen_finds_rest() -> None:
    import time

    soon = time.time() + 20 * 60
    pool = [
        card("only_one", "a", 0.9),
        card("rescue", "b", 0.3, ends_at=soon),
        card("hidden_gem", "c", 0.8),
    ]
    chosen = assemble(pool, set(), [])
    assert chosen[0].kind == "rescue"
    assert [c.kind for c in assemble(pool, {pool[0].id}, [])].count("only_one") == 0
    # Kept finds stay all day, in order; an ended one simply drops out.
    kept = assemble(pool, set(), [pool[2].id, "gone:1", pool[0].id])
    assert [c.id for c in kept] == [pool[2].id, pool[0].id]


def test_rescue_card_needs_time_to_walk_there() -> None:
    import time

    now = time.time()
    shop = {"id": "a", "name": "A", "lat": 1.30, "lng": 103.80, "hours": "07:00–19:00"}
    ctx = Context(lat=1.30, lng=103.80 + 0.03, now=now)  # about 3.3 km: a 42-minute walk
    deal = RescueDeal(
        id="r",
        shop_id="a",
        item="Bun",
        portions=3,
        price=100,
        was_price=200,
        currency="SGD",
        pickup_start=now - 600,
        pickup_end=now + 20 * 60,
    )
    assert rescue_cards([deal], {"a": shop}, ctx) == []
    near = Context(lat=1.30, lng=103.80, now=now)
    found = rescue_cards([deal], {"a": shop}, near)
    assert found and found[0].params["discount_pct"] == 50 and found[0].action == "hold"


# --- Route ---


def requires_emulator() -> None:
    if not EMULATOR:
        pytest.skip("Requires the explicitly local Firestore emulator; never a cloud database.")


def make_app(tmp_path: Path, backend: str, **extra):
    hosted: dict = {}
    if backend == "firestore":
        requires_emulator()
        hosted = {
            "merchant_backend": "firestore",
            "google_cloud_project": PROJECT,
            "firestore_namespace": "ogoogle_ai_test_" + uuid4().hex,
        }
    from app.main import create_app

    return create_app(
        Settings(
            app_env="test",
            coach_mode="offline",
            v1_enabled=True,
            merchant_database=str(tmp_path / "merchant.sqlite3"),
            recall_path=str(tmp_path / "recall"),
            rate_limits_enabled=False,
            _env_file=None,
            **hosted,
            **extra,
        ),
        InMemorySessionService(),
    )


@pytest.fixture(params=["sqlite", "firestore"])
def client(request: pytest.FixtureRequest, tmp_path: Path):
    with TestClient(make_app(tmp_path, request.param)) as client:
        seed(client.app.state.merchant, "demo-owner", city="singapore")
        yield client


def spot(client: TestClient) -> dict:
    place = client.get(f"/api/v1/public/shops/{DEMO}").json()
    return {"lat": place["lat"], "lng": place["lng"], "tz": "Asia/Singapore", "currency": "SGD"}


def test_today_feed_is_finite_mixed_and_labelled(client: TestClient) -> None:
    feed = client.get("/api/v1/public/today", params=spot(client)).json()
    finds = feed["finds"]
    assert 0 < len(finds) <= 7
    kinds = [f["kind"] for f in finds]
    assert all(kinds.count(k) <= 2 for k in kinds)
    shops = [f["shop"]["id"] for f in finds if f["shop"]]
    assert len(shops) == len(set(shops))
    # Every seeded shop is a demo shop: every card says so, and the page label shows once.
    assert all(f["demo"] and f["source"] == "demo" for f in finds)
    assert feed["demo"] is True and feed["area"]["demo"] is True
    assert feed["next_drop"] > datetime.now().timestamp()
    assert feed["signed_in"] is False
    # The client can keep today's set, and finds seen on earlier days rest.
    ids = [f["id"] for f in finds]
    kept = client.get("/api/v1/public/today", params={**spot(client), "keep": ",".join(ids)}).json()
    assert [f["id"] for f in kept["finds"]] == ids
    rested = client.get(
        "/api/v1/public/today", params={**spot(client), "seen": ",".join(ids)}
    ).json()
    assert not set(ids) & {f["id"] for f in rested["finds"]}


def test_signed_in_feed_is_stable_all_day(client: TestClient) -> None:
    client.post("/api/v1/customer/session", json={"name": "Asha"})
    first = client.get("/api/v1/public/today", params=spot(client)).json()
    again = client.get("/api/v1/public/today", params=spot(client)).json()
    assert first["signed_in"] is True
    assert [f["id"] for f in first["finds"]] == [f["id"] for f in again["finds"]]


def test_empty_area_shows_nothing_rather_than_padding(client: TestClient) -> None:
    feed = client.get(
        "/api/v1/public/today", params={"lat": -33.86, "lng": 151.21, "tz": "Australia/Sydney"}
    ).json()
    assert feed["finds"] == [] and feed["candidates"] == 0


def test_demo_world_fills_a_new_area(tmp_path: Path) -> None:
    with TestClient(make_app(tmp_path, "sqlite", demo_world_enabled=True)) as client:
        feed = client.get(
            "/api/v1/public/today",
            params={
                "lat": 35.6612,
                "lng": 139.6681,
                "tz": "Asia/Tokyo",
                "currency": "JPY",
                "place": "Shimokitazawa",
            },
        ).json()
    assert feed["finds"], "the generated neighbourhood has finds"
    assert all(f["demo"] for f in feed["finds"])
    assert feed["area"]["name"] == "Shimokitazawa"
