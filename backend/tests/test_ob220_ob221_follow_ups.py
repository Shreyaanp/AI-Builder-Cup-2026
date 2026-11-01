# ruff: noqa: F811  (route fixtures are imported and requested by name)
"""OB-220: board reads and weeks follow the shop's clock. OB-221: legacy demo cards stay hidden."""

import uuid
from datetime import datetime
from types import SimpleNamespace
from typing import Any

import anyio
import pytest
from fastapi.testclient import TestClient

import app.passport_routes as routes
from app.community import Community, SqliteDocuments, is_legacy_demo_update
from app.games import reveal
from app.passport import PassportState, ScratchTicket
from tests.test_passport import DEMO, SG, app, at_shop, client, demo_key, sign_in  # noqa: F401

MONDAY_1AM_SG = datetime(2026, 10, 19, 1, tzinfo=SG)  # still Sunday 17:00 in UTC


def test_ob220_scratch_freeze_win_counts_for_the_shop_local_scratch_week() -> None:
    ticket = ScratchTicket(
        id="t1", shop_id="s", shop_name="Kopi", day="2026-10-19", at=0.0, prize="freeze"
    )
    state = PassportState(scratch=[ticket])
    reveal(state, "t1", MONDAY_1AM_SG.timestamp(), "Asia/Singapore")
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
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    import app.coordinator as coordinator
    from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest

    # A real store: context()["business"] is {"id", "fields": {...}}, not a flat shop.
    store = MerchantStore(str(tmp_path / "m.sqlite3"))
    proposal = store.propose(
        "u",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Kopi",
                category="Cafe",
                location="Los Angeles",
                hours="7-21",
                timezone="America/Los_Angeles",
            ),
            products=[ProductFields(name="Kopi", price=180, unit="cup", stock=10)],
        ),
    )
    bid = store.commit("u", proposal["id"], proposal["digest"])["business_id"]
    assert store.context("u", bid)["business"]["fields"]["timezone"] == "America/Los_Angeles"
    seen: list[str] = []
    real_facts = coordinator.recap_facts

    def spy(week: str, sales: Any, signals: Any, through: Any = None) -> dict[str, Any]:
        seen.append(week)
        return real_facts(week, sales, signals, through)

    monkeypatch.setattr(coordinator, "recap_facts", spy)
    monkeypatch.setattr(
        coordinator, "time", SimpleNamespace(time=lambda: MONDAY_1AM_SG.timestamp())
    )
    token = coordinator.current.set(
        coordinator.MerchantContext(store=store, uid="u", business_id=bid, recalled=[])
    )
    try:
        coordinator.get_insights()
    finally:
        coordinator.current.reset(token)
    # Sunday 10:00 in Los Angeles is W42; the unread real shape fell back to Singapore's W43.
    assert seen == ["2026-W42"]


def test_ob221_live_demo_rescue_card_still_shows(tmp_path, monkeypatch) -> None:
    from app.rescue import publish_update

    community = Community(SqliteDocuments(str(tmp_path / "c.db")))
    now = 1_760_000_000.0
    monkeypatch.setattr("app.community.time", SimpleNamespace(time=lambda: now))
    community.docs.put(
        "rescue",
        "demo-shop",
        "demo-shop",
        now,
        {
            "deals": [
                {"id": "deal-1", "data": {"status": "live", "ends": now + 3600}},
            ]
        },
    )
    store = SimpleNamespace(feature_docs=community.docs)
    publish_update(
        store,  # type: ignore[arg-type]
        {
            "id": "deal-1",
            "shop_id": "demo-shop",
            "ends": now + 3600,
            "starts": now - 60,
            "currency": "SGD",
            "demo": True,
            "items": [{"name": "Kopi", "price": 100, "was": 180, "unit": "cup"}],
        },
    )
    legacy_cards(community, "demo-shop", 3, now - 86_400)
    assert [u.id for u in community.updates(["demo-shop"])] == ["deal-1"]


def test_ob220_old_ticket_freeze_never_rewrites_past_weeks() -> None:
    from app.passport import streak, week_of

    # Visits W38-W40, ticket earned W40 (day below), scratched much later in W45.
    visits = ["2026-09-14", "2026-09-21", "2026-09-28"]
    state = PassportState(
        weeks=[week_of(datetime.fromisoformat(d).date()) for d in visits],
        scratch=[
            ScratchTicket(
                id="t1", shop_id="s", shop_name="Kopi", day="2026-09-28", at=0.0, prize="freeze"
            )
        ],
    )
    before = streak(state, "2026-W45")
    scratched = datetime(2026, 11, 2, 12, tzinfo=SG)  # Monday of W45 in Singapore
    reveal(state, "t1", scratched.timestamp(), "Asia/Singapore")
    assert state.freeze_wins == ["2026-W45"]
    after = streak(state, "2026-W45")
    assert after.row[:-1] == before.row[:-1]  # every earlier week is unchanged


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
        created = newest - n * 86_400
        # The old seeder (2e880a33..#583): demo-{int(now // (7 * DAY))}-N.
        week = int(created // (7 * 86_400))
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


def test_ob221_legacy_id_pattern_matches_only_old_seeder_ids() -> None:
    assert is_legacy_demo_update(True, "demo-2913-0")
    assert not is_legacy_demo_update(False, "demo-2913-0")
    assert not is_legacy_demo_update(True, str(uuid.uuid4()))  # rescue ids
    assert not any(is_legacy_demo_update(True, f"demo-update-{n}") for n in range(4))


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
