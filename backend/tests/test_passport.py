"""Neighbourhood passport: verified stamps, anti-abuse rules, levels, streaks, quests, perks."""

import os
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.demo_world import WorldGenerator, WorldRequest, ensure_world
from app.merchant import BusinessFields, ProductFields, ProposalRequest
from app.passport import (
    MAX_STAMPS_PER_DAY,
    PassportState,
    Visit,
    apply_helpful,
    apply_rescue,
    apply_tip,
    apply_visit,
    area_name,
    geohash,
    qr_key,
    requirements,
    streak,
    valid_qr_key,
    week_of,
)
from app.rescue import Deal, RescueItem
from app.settings import Settings
from app.shop_time import shop_timezone
from scripts.seed_demo_shops import seed

DEMO = "demo-tiong-bahru-bakery"
EMULATOR = (os.getenv("FIRESTORE_EMULATOR_HOST") or "").split(":")[0] in {"127.0.0.1", "localhost"}
PROJECT = "demo-ogoogle-local"
SG = shop_timezone("Asia/Singapore")


def at(day: int, hour: int = 11, minute: int = 0) -> float:
    """Wednesday 14 Oct 2026 is day 0 (Singapore time)."""
    return (datetime(2026, 10, 14, hour, minute, tzinfo=SG) + timedelta(days=day)).timestamp()


def shop(
    bid: str,
    lat: float = 1.2850,
    lng: float = 103.8270,
    *,
    demo: bool = False,
    category: str = "Bakery",
    currency: str = "SGD",
    reward_text: str = "10th kopi free",
    stamps_enabled: bool | None = None,
) -> dict:
    enabled = bool(reward_text) if stamps_enabled is None else stamps_enabled
    return {
        "id": bid,
        "name": bid.title(),
        "category": category,
        "location": "12 Seng Poh Rd, Tiong Bahru, Singapore",
        "lat": lat,
        "lng": lng,
        "timezone": "Asia/Singapore",
        "currency": currency,
        "hours": "07:00–19:00",
        "products": [{"name": "Kaya bun", "price": 250, "unit": "piece", "available": True}],
        "stamps_enabled": enabled,
        **({"reward_text": reward_text} if reward_text else {}),
        **({"demo": True} if demo else {}),
    }


def visit(state: PassportState, place: dict, when: float, **fix) -> object:
    fix = {"lat": place["lat"], "lng": place["lng"], "accuracy": 20.0, **fix}
    return apply_visit(state, Visit(shop_id=place["id"], shop=place, at=when, **fix))


# --- Pure rules ---


def test_qr_key_is_per_shop_and_secret() -> None:
    key = qr_key("secret", "shop-a")
    assert valid_qr_key("secret", "shop-a", key)
    assert not valid_qr_key("secret", "shop-b", key)
    assert not valid_qr_key("other", "shop-a", key)
    assert not valid_qr_key("secret", "shop-a", "")


def test_first_visit_stamps_with_bonus_and_real_points() -> None:
    state = PassportState()
    outcome = visit(state, shop("a"), at(0))
    assert outcome.verdict == "stamped" and outcome.first
    assert outcome.points == 50 and state.points == 50 and state.demo_points == 0
    assert state.shops["a"].card == 1
    again = visit(state, shop("a"), at(0, 15))
    assert again.verdict == "already_today" and state.points == 50
    later = visit(state, shop("a"), at(1))
    assert later.verdict == "stamped" and not later.first and later.points == 20
    assert state.points == 70 and state.shops["a"].card == 2


def test_demo_shops_earn_demo_points_kept_apart() -> None:
    state = PassportState()
    visit(state, shop("demo-x", demo=True), at(0))
    assert state.points == 0 and state.demo_points == 50
    assert state.stamps[0].demo
    # Fictional demo shops stamp without a location fix, still once a day.
    place = shop("demo-y", demo=True)
    anywhere = apply_visit(state, Visit(shop_id="demo-y", shop=place, at=at(0)))
    assert anywhere.verdict == "stamped" and state.demo_points == 100
    assert apply_visit(state, Visit(shop_id="demo-y", shop=place, at=at(0, 12))).verdict == (
        "already_today"
    )


def test_location_rules_reject_without_points() -> None:
    state = PassportState()
    place = shop("a")
    far = visit(state, place, at(0), lat=place["lat"] + 0.01)  # about 1.1 km north
    assert far.verdict == "too_far" and far.distance_m and far.distance_m > 150
    blurry = visit(state, place, at(0), accuracy=250.0)
    assert blurry.verdict == "low_accuracy"
    assert state.points == 0 and not state.stamps
    assert state.rejects[datetime.fromtimestamp(at(0), SG).date().isoformat()] == 2
    # Location refused: the shop card still counts, the passport does not.
    card = apply_visit(state, Visit(shop_id="a", shop=place, at=at(0)))
    assert card.verdict == "card_only" and state.shops["a"].card == 1 and state.points == 0
    assert apply_visit(state, Visit(shop_id="a", shop=place, at=at(0, 12))).card == 1


def test_no_reward_shop_gives_no_card_stamp() -> None:
    state = PassportState()
    no_reward = shop("no-reward", reward_text="", stamps_enabled=False)
    outcome = visit(state, no_reward, at(0))
    # Passport is stamped and points are earned, but no card stamp is given
    assert outcome.verdict == "stamped"
    assert outcome.points == 50
    assert outcome.card == 0
    assert state.shops["no-reward"].card == 0

    # With location missing / refused, a no-reward shop rejects with low_accuracy
    # instead of card_only.
    missing_loc = apply_visit(
        state,
        Visit(
            shop_id="no-reward-2",
            shop=shop("no-reward-2", reward_text="", stamps_enabled=False),
            at=at(0),
        ),
    )
    assert missing_loc.verdict == "low_accuracy"
    assert missing_loc.card == 0


def test_inside_radius_counts() -> None:
    place = shop("a")
    outcome = visit(PassportState(), place, at(0), lat=place["lat"] + 0.001)  # about 110 m
    assert outcome.verdict == "stamped"


def test_daily_cap_of_six_shops() -> None:
    state = PassportState()
    verdicts = [
        visit(state, shop(f"s{i}"), at(0, 9, i * 5)).verdict for i in range(MAX_STAMPS_PER_DAY + 1)
    ]
    assert verdicts[:MAX_STAMPS_PER_DAY] == ["stamped"] * MAX_STAMPS_PER_DAY
    assert verdicts[-1] == "daily_cap"
    assert visit(state, shop("s6"), at(1)).verdict == "stamped"


def test_impossible_speed_is_rejected() -> None:
    state = PassportState()
    visit(state, shop("a"), at(0, 10))
    # 50 km away ten minutes later.
    jump = visit(state, shop("b", lat=1.735, lng=103.827), at(0, 10, 10))
    assert jump.verdict == "too_fast"


def test_own_shop_earns_nothing() -> None:
    place = shop("a")
    outcome = apply_visit(
        PassportState(),
        Visit(
            shop_id="a",
            shop=place,
            at=at(0),
            lat=place["lat"],
            lng=place["lng"],
            accuracy=5,
            own_shop=True,
        ),
    )
    assert outcome.verdict == "own_shop" and outcome.points == 0


def test_levels_need_points_shops_and_a_repeat_and_never_drop() -> None:
    state = PassportState()
    for day in range(5):
        visit(state, shop(f"s{day}"), at(day))
    # 5 first tries plus the weekly breakthrough and the Deepavali trail: past 300 points.
    assert state.points >= 300
    need = {r.key: r for r in requirements(state, "regular")}
    assert need["points"].met and need["shops"].met and not need["repeat"].met
    assert state.level == "newcomer"
    visit(state, shop("s0"), at(5))  # The same shop on a second day.
    assert state.level == "regular"
    hero = {r.key: r for r in requirements(state, "local_hero")}
    assert not hero["points"].met and hero["points"].need == 1200
    state.points = 0  # Levels never go down.
    from app.passport import earned_level

    assert earned_level(state) == "regular"


def test_weekly_streak_with_freezes() -> None:
    weeks = [week_of(datetime(2026, 9, 7).date() + timedelta(weeks=n)) for n in range(8)]
    # 4 weeks in a row: the welcome freeze plus one earned (at most 2 banked).
    state = PassportState(weeks=weeks[:4])
    result = streak(state, weeks[5])  # weeks[4] missed: a freeze covers it on its own.
    assert result.weeks == 4 and result.freezes == 1 == result.rain_checks
    assert result.row[-3:] == ["done", "rain", "current"]
    # Two missed weeks spend both freezes; a third breaks the streak.
    assert streak(state, weeks[6]).weeks == 4 and streak(state, weeks[6]).freezes == 0
    broken = streak(state, weeks[7])
    assert broken.weeks == 0 and broken.row[-2:] == ["missed", "current"]
    # 1 week: only the welcome freeze, which covers one missed week.
    short = PassportState(weeks=weeks[:1])
    assert streak(short, weeks[2]).weeks == 1 and streak(short, weeks[3]).weeks == 0
    empty = streak(PassportState(), weeks[5])
    assert empty.weeks == 0 and len(empty.row) == 8 and empty.freezes == 1


def test_streak_milestone_awarded_once() -> None:
    state = PassportState()
    for n in range(4):
        visit(state, shop("a"), at(n * 7))
    assert 4 in state.milestones
    before = state.points
    visit(state, shop("b"), at(4 * 7))
    assert state.points - before == 50  # visit + first try, no second milestone bonus


def test_weekly_breakthrough_and_festival_trail() -> None:
    state = PassportState()
    for i in range(3):
        visit(state, shop(f"s{i}"), at(0, 9 + i))
    assert any(q.startswith("breakthrough:") for q in state.quests_done)
    # The Deepavali trail (Singapore, October 2026) needs 4 different shops in the window.
    visit(state, shop("s3"), at(1))
    assert any(q.startswith("festival:deepavali:SG") for q in state.quests_done)
    # Thai vegetarian festival does not apply to Singapore shops.
    assert not any("vegetarian" in q for q in state.quests_done)


def test_breakfast_crawl_needs_food_before_ten() -> None:
    state = PassportState()
    visit(state, shop("a", category="Kopitiam"), at(0, 8))
    visit(state, shop("b", category="Tailor"), at(0, 8, 30))
    visit(state, shop("c", category="Bakery"), at(0, 9))
    assert not any(q.startswith("crawl:") for q in state.quests_done)
    visit(state, shop("d", category="Cafe"), at(1, 9, 30))
    assert any(q.startswith("crawl:") for q in state.quests_done)


def test_rescue_tip_and_helpful_points() -> None:
    state = PassportState()
    place = shop("a")
    first = apply_rescue(state, "a", place, "r1", at(0, 18), saved_minor=120)
    assert first.verdict == "stamped" and first.points == 40
    assert apply_rescue(state, "a", place, "r1", at(0, 18)).verdict == "already_today"
    apply_rescue(state, "a", place, "r2", at(0, 18, 5))
    assert apply_rescue(state, "a", place, "r3", at(0, 18, 10)).verdict == "daily_cap"
    assert state.rescue_saved == {"SGD": 120} and state.shops["a"].rescues == 2
    tip = apply_tip(state, "a", place, at(0))
    assert tip.points == 10
    assert apply_tip(state, "a", place, at(1)).verdict == "already_today"
    earned = [apply_helpful(state, "tip1", demo=False) for _ in range(7)]
    assert earned == [5, 5, 5, 5, 5, 0, 0] and state.helpful_tips == 1


def test_area_keys_and_names() -> None:
    assert geohash(1.2850, 103.8270) == geohash(1.2851, 103.8271)
    assert len(geohash(1.2850, 103.8270)) == 5
    assert area_name({"location": "12 Seng Poh Rd, Tiong Bahru, Singapore"}) == "Tiong Bahru"
    assert area_name({"location": "Near Shimokitazawa (generated demo address)"}) == (
        "Shimokitazawa"
    )
    assert area_name({"location": "Near you (generated demo address)"}) == ""


# --- Routes ---


def requires_emulator() -> None:
    if not EMULATOR:
        pytest.skip("Requires the explicitly local Firestore emulator; never a cloud database.")


@pytest.fixture(params=["sqlite", "firestore"])
def app(request: pytest.FixtureRequest, tmp_path: Path):
    hosted: dict = {}
    if request.param == "firestore":
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
        ),
        InMemorySessionService(),
    )


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        seed(client.app.state.merchant, "demo-owner", city="singapore")
        yield client


def sign_in(client: TestClient, name: str = "Asha Rao") -> None:
    assert client.post("/api/v1/customer/session", json={"name": name}).status_code == 200


def sign_out(client: TestClient) -> None:
    client.delete("/api/v1/customer/session")
    client.cookies.clear()


def demo_key(client: TestClient, bid: str = DEMO) -> str:
    response = client.get(f"/api/v1/public/shops/{bid}/demo-qr")
    assert response.status_code == 200
    return response.json()["key"]


def at_shop(client: TestClient, bid: str = DEMO) -> dict:
    place = client.get(f"/api/v1/public/shops/{bid}").json()
    return {"lat": place["lat"], "lng": place["lng"], "accuracy": 15}


def test_stamp_route_checks_key_location_and_day(client: TestClient) -> None:
    body = {"shop_id": DEMO, "key": demo_key(client), **at_shop(client)}
    assert client.post("/api/v1/customer/passport/stamps", json=body).status_code == 401
    sign_in(client)
    bad = client.post("/api/v1/customer/passport/stamps", json={**body, "key": "nope"})
    assert bad.status_code == 403
    # A demo shop is fictional: its on-screen QR stamps from anywhere, for demo points only.
    first = client.post(
        "/api/v1/customer/passport/stamps", json={**body, "lat": body["lat"] + 0.02}
    ).json()
    assert first["outcome"]["verdict"] == "stamped" and first["outcome"]["first"]
    assert first["outcome"]["demo"] is True
    view = first["passport"]
    assert view["points"] == 0 and view["demo_points"] == 50 and view["total"] == 50
    assert view["level"]["key"] == "newcomer" and view["level"]["next"] == "regular"
    assert view["level"]["next_requirement"]["key"] == "points"
    assert view["shops"][0]["id"] == DEMO and view["shops"][0]["card"] == 1
    assert view["streak"]["this_week"] is True
    again = client.post("/api/v1/customer/passport/stamps", json=body).json()
    assert again["outcome"]["verdict"] == "already_today"
    stored = client.get("/api/v1/customer/passport").json()
    assert stored["demo_points"] == 50 and len(stored["stamps"]) == 1


def test_demo_qr_only_for_demo_shops(client: TestClient) -> None:
    client.get("/api/v1/bootstrap")
    uid = client.app.state.services.identity.signer.loads(
        client.cookies.get("ogoogle_preview_session")
    )
    store = client.app.state.merchant
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Real Kopi", location="Tiong Bahru, Singapore", lat=1.285, lng=103.827
            ),
            products=[ProductFields(name="Kopi", price=180, unit="cup")],
        ),
    )
    bid = store.commit(uid, proposal["id"], proposal["digest"])["business_id"]
    store.share(uid, bid, True)
    assert client.get(f"/api/v1/public/shops/{bid}/demo-qr").status_code == 404
    key = client.get(f"/api/v1/businesses/{bid}/qr-key").json()["key"]
    assert key == qr_key(client.app.state.services.identity.signer.secret_key, bid)
    # The owner sets a perk; customers see it on the shop.
    saved = client.put(
        f"/api/v1/businesses/{bid}/perks",
        json={"perks": [{"id": "kopi", "trigger": "regular", "text": "Free kopi upgrade"}]},
    )
    assert saved.status_code == 200
    public = client.get(f"/api/v1/public/shops/{bid}/perks").json()
    assert public["perks"][0]["text"] == "Free kopi upgrade"
    # A real shop stamps real points.
    sign_in(client)
    stamp = {"shop_id": bid, "key": key, "lat": 1.285, "lng": 103.827, "accuracy": 10}
    far = client.post("/api/v1/customer/passport/stamps", json={**stamp, "lat": 1.305}).json()
    assert far["outcome"]["verdict"] == "too_far" and far["passport"]["total"] == 0
    real = client.post("/api/v1/customer/passport/stamps", json=stamp).json()
    assert real["passport"]["points"] == 50 and real["passport"]["demo_points"] == 0


def test_signed_out_receipts_preview_and_merge_once(client: TestClient) -> None:
    body = {"shop_id": DEMO, "key": demo_key(client), **at_shop(client)}
    checked = client.post("/api/v1/public/passport/check", json=body).json()
    assert checked["outcome"]["verdict"] == "stamped" and checked["receipt"]
    receipt = checked["receipt"]
    no_location = client.post(
        "/api/v1/public/passport/check", json={"shop_id": DEMO, "key": body["key"]}
    ).json()
    assert no_location["outcome"]["verdict"] == "stamped" and no_location["receipt"]  # demo shop
    # With the phone's receipts, a second scan today is judged honestly: no new receipt.
    again = client.post(
        "/api/v1/public/passport/check", json={**body, "receipts": [receipt, "forged"]}
    ).json()
    assert again["outcome"]["verdict"] == "already_today" and again["receipt"] is None
    preview = client.post(
        "/api/v1/public/passport/preview",
        json={"receipts": [receipt, "forged"], "cards": {"demo-katong-tailor": 2}},
    ).json()
    assert preview["device_only"] is True and preview["demo_points"] == 50
    cards = {s["id"]: s["card"] for s in preview["shops"]}
    assert cards[DEMO] == 1
    sign_in(client)
    merged = client.post("/api/v1/customer/passport/merge", json={"receipts": [receipt]}).json()
    assert merged["demo_points"] == 50
    twice = client.post("/api/v1/customer/passport/merge", json={"receipts": [receipt]}).json()
    assert twice["demo_points"] == 50
    # Another account cannot reuse the same receipt.
    sign_out(client)
    sign_in(client, "Ben Tan")
    other = client.post("/api/v1/customer/passport/merge", json={"receipts": [receipt]}).json()
    assert other["demo_points"] == 0


def test_tip_stamp_and_helpful_marks(client: TestClient) -> None:
    sign_in(client, "Asha Rao")
    tip = client.post(
        f"/api/v1/customer/shops/{DEMO}/tips", json={"text": "Ask for the burnt-edge kaya toast."}
    )
    assert tip.status_code == 200
    tip_id = tip.json()["id"]
    mine = client.get("/api/v1/customer/passport").json()
    assert mine["demo_points"] == 10 and mine["stamps"][0]["kind"] == "tip"
    assert client.post(f"/api/v1/customer/shops/{DEMO}/tips/{tip_id}/helpful").status_code == 409
    sign_out(client)
    sign_in(client, "Ben Tan")
    marked = client.post(f"/api/v1/customer/shops/{DEMO}/tips/{tip_id}/helpful").json()
    assert marked["helpful"] == 1
    repeat = client.post(f"/api/v1/customer/shops/{DEMO}/tips/{tip_id}/helpful").json()
    assert repeat["helpful"] == 1
    listed = client.get(f"/api/v1/public/shops/{DEMO}/tips").json()
    assert next(t for t in listed["tips"] if t["id"] == tip_id)["helpful"] == 1
    sign_out(client)
    sign_in(client, "Asha Rao")
    # A new local session is a new customer, so check the author's passport directly.
    author = next(
        state
        for state in [
            client.app.state.passport.get(uid)
            for uid in [
                r["uid"]
                for r in client.app.state.community.docs.scoped("tip", DEMO, 50)
                if r.get("id") == tip_id
            ]
        ]
    )
    assert author.demo_points == 15 and author.helpful_tips == 1


def test_rescue_collect_with_qr_in_window(client: TestClient, monkeypatch) -> None:
    import time

    import app.passport_routes as routes

    now = time.time()

    async def fake_find(request, place, rescue_id, when):
        item = {"name": "Kaya bun", "qty": 3, "qty_left": 0, "price": 150, "was": 250}
        return Deal(
            id=rescue_id,
            shop_id=place["id"],
            items=[RescueItem(**item, unit="piece")],
            currency="SGD",
            starts=now - 600,
            ends=now + 600,
            pickup_note="",
            status="live",
            demo=True,
            countdown_seconds=600,
        )

    holds: dict[str, int] = {}

    async def fake_holds(request, uid, business_id, rescue_id):
        return holds

    monkeypatch.setattr(routes, "find_rescue", fake_find)
    monkeypatch.setattr(routes, "rescue_holds", fake_holds)
    sign_in(client)
    body = {"shop_id": DEMO, "key": demo_key(client), "rescue_id": "r1", **at_shop(client)}
    # Only what this customer held in chat is collected.
    refused = client.post("/api/v1/customer/passport/rescues", json=body)
    assert refused.status_code == 409 and refused.json()["detail"] == "NO_HOLD"
    holds["Kaya bun"] = 1
    done = client.post("/api/v1/customer/passport/rescues", json=body).json()
    assert done["outcome"]["verdict"] == "stamped" and done["outcome"]["points"] == 40
    assert done["passport"]["impact"]["meals"] == 1
    assert done["passport"]["impact"]["saved"] == {"SGD": 100}
    assert done["passport"]["impact"]["co2_kg"] == 2.7
    again = client.post("/api/v1/customer/passport/rescues", json=body).json()
    assert again["outcome"]["verdict"] == "already_today"


def test_leaderboard_is_opt_in(client: TestClient) -> None:
    sign_in(client, "Asha Rao")
    body = {"shop_id": DEMO, "key": demo_key(client), **at_shop(client)}
    client.post("/api/v1/customer/passport/stamps", json=body)
    hidden = client.get("/api/v1/customer/passport/board").json()
    assert hidden["joined"] is False and hidden["you"] is None
    assert all(r["demo"] for r in hidden["rows"])
    client.put("/api/v1/customer/passport/leaderboard", json={"on": True})
    board = client.get("/api/v1/customer/passport/board").json()
    assert board["joined"] is True
    assert board["you"]["name"] == "Asha R." and board["you"]["points"] == 50
    left = client.put("/api/v1/customer/passport/leaderboard", json={"on": False}).json()
    assert left["leaderboard"] is False
    assert client.get("/api/v1/customer/passport/board").json()["you"] is None


def test_generated_demo_world_shops_stamp(client: TestClient) -> None:
    import anyio

    receipt = anyio.run(
        ensure_world,
        client.app.state.merchant,
        WorldGenerator(client.app.state.v1_settings),
        WorldRequest(lat=35.66, lng=139.67, currency="JPY", timezone="Asia/Tokyo", place="Shimo"),
    )
    bid = receipt.shop_ids[1]
    assert bid.startswith("demo-w-")
    sign_in(client)
    body = {"shop_id": bid, "key": demo_key(client, bid), **at_shop(client, bid)}
    stamped = client.post("/api/v1/customer/passport/stamps", json=body).json()
    assert stamped["outcome"]["verdict"] == "stamped" and stamped["outcome"]["demo"]
    assert stamped["passport"]["areas"][0]["name"] == "Shimo"


def test_claim_card_and_erase(client: TestClient) -> None:
    sign_in(client)
    assert client.post(f"/api/v1/customer/passport/shops/{DEMO}/claim").status_code == 409
    client.post(
        "/api/v1/customer/passport/stamps",
        json={"shop_id": DEMO, "key": demo_key(client), **at_shop(client)},
    )
    assert client.delete("/api/v1/customer/passport").json() == {"deleted": True}
    assert client.get("/api/v1/customer/passport").json()["total"] == 0


def test_passport_quests_list_nearby_stops(client: TestClient) -> None:
    sign_in(client)
    spot = at_shop(client)
    view = client.get(
        "/api/v1/customer/passport",
        params={"lat": spot["lat"], "lng": spot["lng"], "tz": "Asia/Singapore"},
    ).json()
    kinds = {q["kind"] for q in view["quests"]}
    assert {"breakthrough", "crawl", "rescue", "makers"} <= kinds
    assert all(q["need"] >= 3 for q in view["quests"])


def test_board_without_location_returns_calm_empty_board(client: TestClient) -> None:
    sign_in(client, "Naveen Kumar")
    # Signed in customer with location off and no previous stamps/points
    board_res = client.get("/api/v1/customer/passport/board")
    assert board_res.status_code == 200
    data = board_res.json()
    assert data["rows"] == []
    assert data["you"] is None
    assert data["area"] == ""
    assert data["joined"] is False

    # Joining the leaderboard still returns a calm empty board without 422
    client.put("/api/v1/customer/passport/leaderboard", json={"on": True})
    joined_res = client.get("/api/v1/customer/passport/board")
    assert joined_res.status_code == 200
    joined_data = joined_res.json()
    assert joined_data["joined"] is True
    assert joined_data["rows"] == []
