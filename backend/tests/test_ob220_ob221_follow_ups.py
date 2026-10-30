# ruff: noqa: F811  (route fixtures are imported and requested by name)
"""OB-220: board reads and weeks follow the shop's clock. OB-221: legacy demo cards stay hidden."""

from datetime import datetime
from types import SimpleNamespace
from typing import Any

import anyio
import pytest
from fastapi.testclient import TestClient

import app.passport_routes as routes
from app.community import Community, SqliteDocuments
from app.games import reveal
from app.passport import PassportState, ScratchTicket
from tests.test_passport import DEMO, SG, app, at_shop, client, demo_key, sign_in  # noqa: F401

MONDAY_1AM_SG = datetime(2026, 10, 19, 1, tzinfo=SG)  # still Sunday 17:00 in UTC


def test_ob220_scratch_freeze_win_counts_for_the_shop_local_week() -> None:
    ticket = ScratchTicket(
        id="t1", shop_id="s", shop_name="Kopi", day="2026-10-19", at=0.0, prize="freeze"
    )
    state = PassportState(scratch=[ticket])
    reveal(state, "t1", MONDAY_1AM_SG.timestamp())
    assert state.freeze_wins == ["2026-W43"]  # UTC would have credited 2026-W42


@pytest.mark.parametrize("app", ["sqlite"], indirect=True)
def test_ob220_freeze_and_streak_use_the_home_area_week(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(routes, "time", SimpleNamespace(time=lambda: MONDAY_1AM_SG.timestamp()))
    sign_in(client)
    body = {"shop_id": DEMO, "key": demo_key(client), **at_shop(client)}
    assert client.post("/api/v1/customer/passport/stamps", json=body).status_code == 200
    # A phone in Los Angeles is still on Sunday: the streak week is the shop area's, not theirs.
    view = client.get("/api/v1/customer/passport", params={"tz": "America/Los_Angeles"}).json()
    assert view["streak"]["this_week"] is True
    freeze = client.post(
        "/api/v1/customer/games/freeze",
        params={"tz": "America/Los_Angeles"},
        json={"week": "this"},
    )
    assert freeze.status_code == 200
    assert freeze.json()["verdict"] == "not_needed"  # this week (W43) already has a visit


def test_ob220_post_board_reads_the_cached_shared_shops_not_each_shop() -> None:
    shop = {"id": "shop-a", "lat": 1.285, "lng": 103.827, "timezone": "Asia/Singapore"}
    area = routes.shop_area(shop)
    reads = {"shared": 0}

    class Merchant:
        def shared_shops(self) -> list[dict[str, Any]]:
            reads["shared"] += 1
            return [shop]

        def public_shop(self, bid: str) -> None:
            raise AssertionError("OB-220: board post read a shop one by one")

    posted: list[tuple[str, str]] = []

    class Passports:
        def post_board(self, uid: str, area: str, week: str, row: dict[str, Any]) -> None:
            posted.append((area, week))

    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(merchant=Merchant(), passport=Passports()))
    )
    state = PassportState(leaderboard=True, week_points={area: {"2026-W43": 5}})
    state.shops["shop-a"] = routes.ShopProgress(area=area)
    principal = SimpleNamespace(guest=False, uid="u1", name="Asha")

    async def run() -> None:
        original = routes.time
        routes.time = SimpleNamespace(time=lambda: MONDAY_1AM_SG.timestamp())
        try:
            await routes.post_board(request, principal, state)  # type: ignore[arg-type]
        finally:
            routes.time = original

    anyio.run(run)
    assert reads["shared"] == 1 and posted == [(area, "2026-W43")]


def test_ob220_owner_insights_week_is_the_shops_not_the_servers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.coordinator as coordinator

    seen: list[str] = []

    class Store:
        def context(self, uid: str, bid: str) -> dict[str, Any]:
            return {"business": {"timezone": "Asia/Singapore"}}

        def recap_signals(self, uid: str, bid: str) -> dict[str, Any]:
            return {"questions": [], "sold_out": 0}

        def sales_history(self, uid: str, bid: str) -> list[dict[str, Any]]:
            return []

    real_facts = coordinator.recap_facts

    def spy(week: str, sales: Any, signals: Any) -> dict[str, Any]:
        seen.append(week)
        return real_facts(week, sales, signals)

    monkeypatch.setattr(coordinator, "recap_facts", spy)
    monkeypatch.setattr(
        coordinator, "time", SimpleNamespace(time=lambda: MONDAY_1AM_SG.timestamp())
    )
    token = coordinator.current.set(
        coordinator.MerchantContext(store=Store(), uid="u", business_id="b", recalled=[])  # type: ignore[arg-type]
    )
    try:
        try:
            coordinator.get_insights()
        except Exception:
            pass  # only the week handed to the recap matters here
    finally:
        coordinator.current.reset(token)
    assert seen == ["2026-W43"]  # server date.today() in UTC would say W42


# --- OB-221 ---

BASE = {
    "demo": True,
    "currency": "SGD",
    "products": [
        {"name": "Kopi", "price": 180, "available": True, "unit": "cup"},
        {"name": "Kaya toast", "price": 240, "available": True, "unit": "set"},
    ],
}


def legacy_cards(community: Community, bid: str, count: int, newest: float) -> None:
    for n in range(count):
        week = f"2026-W{30 + n // 4}"
        created = newest - n * 86_400
        community.docs.put(
            "update",
            f"{bid}\0demo-{week}-{n % 4}",
            bid,
            created,
            {
                "id": f"demo-{week}-{n % 4}",
                "shop_id": bid,
                "kind": "menu_confirmed",
                "created": created,
                "demo": True,
            },
        )


def test_ob221_legacy_demo_cards_are_hidden_and_replaced(tmp_path, monkeypatch) -> None:
    community = Community(SqliteDocuments(str(tmp_path / "c.db")))
    now = 1_760_000_000.0
    monkeypatch.setattr("app.community.time", SimpleNamespace(time=lambda: now))
    # Production already holds stacked old cards, the newest one only 2 days old.
    legacy_cards(community, "demo-shop", 12, now - 2 * 86_400)
    community.seed_demo_updates("demo-shop", BASE)
    feed = community.updates(["demo-shop"])
    assert sorted(u.id for u in feed) == [f"demo-update-{n}" for n in range(4)]
    # A week later the refresh still overwrites the same four cards.
    monkeypatch.setattr("app.community.time", SimpleNamespace(time=lambda: now + 8 * 86_400))
    community.seed_demo_updates("demo-shop", BASE)
    assert len(community.updates(["demo-shop"])) == 4
