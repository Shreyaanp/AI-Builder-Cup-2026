"""Owner feature contracts on both repositories, with local-only provider substitutes."""

import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta, timezone
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.adk.events import Event
from google.adk.models.llm_request import LlmRequest
from google.genai import types

from app import brief, demand, owner_routes, rescue
from app.agent import OfflineCoachModel, make_agent
from app.auth import Principal
from app.coordinator import MerchantContext, current, propose_rescue_deal
from app.discover_ask import Intent, keyword_intent
from app.forecast import Prediction
from app.merchant import BusinessFields, ProductFields, ProposalRequest
from app.merchant_routes import LEGAL_VERSION
from app.settings import Settings
from app.streaming import public_events
from tests.test_community import app  # noqa: F401

POINT = {"lat": 1.2847, "lng": 103.832}


@pytest.fixture
def setup(app, monkeypatch):  # noqa: F811
    now = datetime.now(UTC)
    fixed = now.replace(hour=18, minute=0, second=0, microsecond=0)
    # The next 18:00, never one in the past: gRPC (Firestore emulator) computes call deadlines
    # from time.time, so a frozen past clock expires every call after 18:00 UTC.
    if fixed < now:
        fixed += timedelta(days=1)
    monkeypatch.setattr(time, "time", lambda: fixed.timestamp())
    with TestClient(app) as client:
        store = app.state.merchant
        store.record_consent("owner", LEGAL_VERSION)
        app.state.services.identity.require = AsyncMock(return_value=Principal("owner", "local"))
        proposal = store.propose(
            "owner",
            ProposalRequest(
                kind="business",
                business=BusinessFields(
                    name="Bakery", category="Bakery", timezone="UTC", hours="07:00–20:00", **POINT
                ),
                products=[
                    ProductFields(name="Croissant", price=501, stock=40, category="Pastries"),
                    ProductFields(name="Milk", price=200, stock=3),
                ],
            ),
        )
        bid = store.commit("owner", proposal["id"], proposal["digest"])["business_id"]
        store.share("owner", bid, True)
        yield client, store, bid, fixed


def proposal(client, bid, **extra):
    response = client.post(
        f"/api/v1/businesses/{bid}/rescue",
        json={
            "items": [{"name": "Croissant", "qty": 6}],
            "discount_pct": 30,
            "until": "19:45",
            **extra,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def approve(client, bid, prepared):
    response = client.post(
        f"/api/v1/businesses/{bid}/rescue/{prepared['id']}/approve",
        json={"digest": prepared["digest"]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def save_history(store, bid, fixed):
    rows = [
        {
            "date": (fixed.date() - timedelta(days=i)).isoformat(),
            "item": "Croissant",
            "quantity": 20,
            "revenue": 10020,
        }
        for i in range(1, 29)
    ]
    rows.append(
        {"date": fixed.date().isoformat(), "item": "Croissant", "quantity": 28, "revenue": 14028}
    )
    prepared = store.prepare_sales("owner", bid, rows)
    store.save_sales("owner", bid, prepared["id"], prepared["digest"])


def test_all_owner_routes_require_owned_business(setup):
    client, _, bid, _ = setup
    client.app.state.services.identity.require = AsyncMock(
        return_value=Principal("stranger", "local")
    )
    base = f"/api/v1/businesses/{bid}"
    for path in ("radar", "rescue", "rescue/suggestions", "brief"):
        assert client.get(f"{base}/{path}").status_code == 404
    # Consent gate still applies to writes; with consent, ownership is independently checked.
    assert (
        client.post(
            f"{base}/rescue", json={"items": [{"name": "Croissant", "qty": 1}], "until": "19:45"}
        ).status_code
        == 428
    )


def test_rescue_proposal_approval_public_countdown_feed_and_end(setup):
    client, store, bid, fixed = setup
    base = f"/api/v1/businesses/{bid}/rescue"
    public = "/api/v1/public/rescue"
    prepared = proposal(client, bid)
    assert prepared["status"] == "needs_review"
    assert (
        prepared["digest"]
        == hashlib.sha256(
            json.dumps(prepared["snapshot"], sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
    )
    assert client.get(public, params=POINT).json() == []
    assert client.get(base).json() == []
    bad = client.post(f"{base}/{prepared['id']}/approve", json={"digest": "0" * 64})
    assert bad.status_code == 409
    deal = approve(client, bid, prepared)
    assert deal["items"][0] == {
        "name": "Croissant",
        "qty": 6,
        "qty_left": 6,
        "price": 351,
        "was": 501,
        "unit": "item",
    }
    assert deal["demo"] is False and deal["countdown_seconds"] == 6300
    assert approve(client, bid, prepared) == deal
    found = client.get(public, params=POINT).json()
    assert found[0]["deal"] == deal and found[0]["distance_m"] == 0
    assert "holds" not in json.dumps(found)
    feed = client.get("/api/v1/public/updates", params={"shops": bid}).json()["updates"]
    assert (
        len([u for u in feed if u["kind"] == "rescue_deal" and u["rescue_id"] == deal["id"]]) == 1
    )
    assert client.get(public, params={"lat": 1, "lng": 100}).json() == []
    assert client.get(public, params={**POINT, "radius": 999999}).status_code == 422
    ended = client.delete(f"{base}/{deal['id']}")
    assert ended.status_code == 200 and ended.json()["status"] == "ended"
    assert client.get(public, params=POINT).json() == []
    assert not any(
        u["kind"] == "rescue_deal"
        for u in client.get("/api/v1/public/updates", params={"shops": bid}).json()["updates"]
    )
    again = proposal(client, bid)
    assert (
        client.post(f"{base}/{again['id']}/approve", json={"digest": again["digest"]}).status_code
        == 409
    )
    assert client.delete(f"{base}/missing").status_code == 404


def test_rescue_validates_deadline_stock_discount_and_changed_snapshot(setup, monkeypatch):
    client, store, bid, fixed = setup
    path = f"/api/v1/businesses/{bid}/rescue"
    for extra in (
        {"until": "20:01"},
        {"until": "17:59"},
        {"until": "tomorrow"},
        {"discount_pct": 40},
        {"items": [{"name": "Croissant", "qty": 41}]},
        {"items": [{"name": "Unknown", "qty": 1}]},
        {"items": [{"name": "Croissant", "qty": 0}]},
        {"items": [{"name": "Croissant", "qty": 1}, {"name": "Croissant", "qty": 2}]},
    ):
        assert (
            client.post(
                path, json={"items": [{"name": "Croissant", "qty": 6}], "until": "19:45", **extra}
            ).status_code
            == 422
        )
    prepared = proposal(client, bid)
    product = store.inventory("owner", bid)[0]
    store.set_availability("owner", bid, product["id"], False)
    assert (
        client.post(
            f"{path}/{prepared['id']}/approve", json={"digest": prepared["digest"]}
        ).status_code
        == 409
    )
    store.set_availability("owner", bid, product["id"], True)
    prepared = proposal(client, bid)
    monkeypatch.setattr(time, "time", lambda: fixed.timestamp() + 601)
    assert (
        client.post(
            f"{path}/{prepared['id']}/approve", json={"digest": prepared["digest"]}
        ).status_code
        == 409
    )


def test_expiry_and_unsharing_are_enforced_on_server(setup, monkeypatch):
    client, store, bid, fixed = setup
    deal = approve(client, bid, proposal(client, bid))
    store.share("owner", bid, False)
    assert client.get("/api/v1/public/rescue", params=POINT).json() == []
    store.share("owner", bid, True)
    monkeypatch.setattr(time, "time", lambda: deal["ends"])
    assert client.get("/api/v1/public/rescue", params=POINT).json() == []
    assert client.get(f"/api/v1/businesses/{bid}/rescue").json()[0]["status"] == "expired"
    with pytest.raises(HTTPException, match="ended"):
        rescue.hold(
            store, bid, deal["id"], rescue.HoldInput(thread_id="thread", name="Croissant", qty=1)
        )


def test_signed_in_owned_chat_hold_idempotence_and_no_overselling(setup):
    client, _, bid, _ = setup
    deal = approve(client, bid, proposal(client, bid))
    path = f"/api/v1/customer/shops/{bid}/rescue/{deal['id']}/hold"
    body = {"thread_id": "missing", "name": "Croissant", "qty": 4}
    assert client.post(path, json=body).status_code == 401
    client.post("/api/v1/customer/session", json={"name": "Asha"})
    thread = client.post(
        f"/api/v1/customer/shops/{bid}/threads", json={"text": "Can I collect a rescue?"}
    ).json()["thread"]
    body["thread_id"] = thread["id"]
    reserved = client.post(path, json=body)
    assert reserved.status_code == 200, reserved.text
    assert reserved.json()["items"][0]["qty_left"] == 2
    assert client.post(path, json=body).json() == reserved.json()
    chat = client.get(f"/api/v1/customer/shops/{bid}/threads/{thread['id']}").json()["thread"]
    assert sum("[rescue " in m["text"] for m in chat["messages"]) == 1
    client.delete("/api/v1/customer/session")
    client.post("/api/v1/customer/session", json={"name": "Bea"})
    assert client.post(path, json=body).status_code == 404
    other = client.post(
        f"/api/v1/customer/shops/{bid}/threads", json={"text": "Another rescue"}
    ).json()["thread"]
    assert client.post(path, json={**body, "thread_id": other["id"]}).status_code == 409
    assert (
        client.post(path, json={**body, "thread_id": other["id"], "qty": 2}).json()["items"][0][
            "qty_left"
        ]
        == 0
    )
    assert client.get("/api/v1/public/rescue", params=POINT).json() == []


def test_held_rescue_is_collected_at_the_counter_once_sold_out(setup):
    client, _, bid, _ = setup
    deal = approve(client, bid, proposal(client, bid))
    key = client.get(f"/api/v1/businesses/{bid}/qr-key").json()["key"]
    collect = "/api/v1/customer/passport/rescues"
    scan = {"shop_id": bid, "key": key, "rescue_id": deal["id"], **POINT, "accuracy": 15}
    client.post("/api/v1/customer/session", json={"name": "Asha"})
    # Scanning the counter QR without a hold in chat collects nothing.
    assert client.post(collect, json=scan).json()["detail"] == "NO_HOLD"
    thread = client.post(
        f"/api/v1/customer/shops/{bid}/threads",
        json={"text": "Could you hold 6 Croissant?", "instant_answer": False},
    ).json()["thread"]
    # A hold asks about the rescue price: no instant answer quoting the listed one.
    assert [m["author"] for m in thread["messages"]] == ["customer"]
    held = client.post(
        f"/api/v1/customer/shops/{bid}/rescue/{deal['id']}/hold",
        json={"thread_id": thread["id"], "name": "Croissant", "qty": 6},
    )
    assert held.status_code == 200, held.text
    # Sold out: off the map, but the holder still collects it.
    assert client.get("/api/v1/public/rescue", params=POINT).json() == []
    done = client.post(collect, json=scan)
    assert done.status_code == 200, done.text
    body = done.json()
    item = deal["items"][0]
    assert body["outcome"]["verdict"] == "stamped" and body["outcome"]["points"] == 40
    assert body["passport"]["impact"]["meals"] == 1
    assert body["passport"]["impact"]["saved"] == {
        deal["currency"]: (item["was"] - item["price"]) * 6
    }


def test_reservation_race_caps_stock(setup):
    client, store, bid, _ = setup
    deal = approve(client, bid, proposal(client, bid))

    def reserve(index):
        try:
            rescue.hold(
                store,
                bid,
                deal["id"],
                rescue.HoldInput(thread_id=f"thread-{index}", name="Croissant", qty=4),
            )
            return 200
        except HTTPException as error:
            return error.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(reserve, range(2))) == [200, 409]


def test_chat_delivery_failure_releases_hold(setup, monkeypatch):
    client, _, bid, _ = setup
    deal = approve(client, bid, proposal(client, bid))
    client.post("/api/v1/customer/session", json={"name": "Asha"})
    tid = client.post(
        f"/api/v1/customer/shops/{bid}/threads", json={"text": "Rescue please"}
    ).json()["thread"]["id"]
    original = owner_routes.act

    async def failing(request, business_id, entry, action, text=""):
        if action == "post":
            raise HTTPException(409, "Chat closed during reservation")
        return await original(request, business_id, entry, action, text)

    monkeypatch.setattr(owner_routes, "act", failing)
    response = client.post(
        f"/api/v1/customer/shops/{bid}/rescue/{deal['id']}/hold",
        json={"thread_id": tid, "name": "Croissant", "qty": 2},
    )
    assert response.status_code == 409
    assert client.get(f"/api/v1/businesses/{bid}/rescue").json()[0]["items"][0]["qty_left"] == 6


def test_suggestion_endpoint_uses_today_forecast_sold_and_buffer(setup):
    client, store, bid, fixed = setup
    path = f"/api/v1/businesses/{bid}/rescue/suggestions"
    assert client.get(path).json()["items"] == []
    save_history(store, bid, fixed)
    result = client.get(path).json()
    assert result["until"] == "19:45" and result["method"] == "weekday_average"
    assert result["items"][0] == {
        "name": "Croissant",
        "quantity": 6,
        "forecast": 20.0,
        "prepared": 40.0,
        "sold": 28.0,
        "expected_rest": 4.0,
        "buffer": 2,
        "discount_pct": 30,
        "estimate": True,
    }


def test_radar_threshold_separation_decay_radius_window_and_bands(setup):
    client, store, bid, fixed = setup
    intent = Intent(keywords=["eggless cake"], category="bakery")

    def signal(index, **extra):
        demand.capture(
            store.feature_docs,
            intent,
            1.2847,
            103.832,
            f"actor-{index}",
            extra.get("matched", 0),
            2,
            extra.get("now", fixed),
        )

    for i in range(4):
        signal(i)
    assert client.get(f"/api/v1/businesses/{bid}/radar").json()["opportunities"] == []
    demand.seed_demo_signals(store, **POINT, now=fixed)
    # OB-128: the scope supplies one "within" prefix, so the area label is only the anchor.
    response = client.get(f"/api/v1/businesses/{bid}/radar").json()
    assert response["area_label"] == "your shop"
    rows = response["opportunities"]
    assert all(r["demo"] for r in rows)
    signal(4)
    rows = demand.radar(store, "owner", bid, fixed).opportunities
    real = [r for r in rows if not r.demo]
    assert len(real) == 1 and real[0].band == "5–9" and real[0].fit == 1
    assert real[0].google_count == 2
    assert "score" not in real[0].model_dump() and "actor" not in real[0].model_dump()
    for i in range(5, 20):
        signal(i)
    assert (
        next(r for r in demand.radar(store, "owner", bid, fixed).opportunities if not r.demo).band
        == "20+"
    )
    for i in range(20, 100):
        signal(i, now=fixed - timedelta(days=14))
    assert (
        next(r for r in demand.radar(store, "owner", bid, fixed).opportunities if not r.demo).band
        == "20+"
    )
    assert not demand.radar(store, "owner", bid, fixed + timedelta(days=31)).opportunities
    assert not store.feature_docs.scoped("demand_real", demand.cell_for(**POINT)[:4])


def test_discover_capture_never_persists_query_location_identity_or_names(setup):
    client, store, bid, _ = setup
    path = "/api/v1/discover/ask"
    raw = "Eggless cake for Alice alice@example.test at 123 Main Street +919999999999"
    # Owner searches are deliberately excluded; an anonymous customer's request is captured.
    assert client.post(path, json={"q": raw, **POINT}).status_code == 200
    assert store.feature_docs.scoped("demand_real", demand.cell_for(**POINT)[:4]) == []
    client.app.state.services.identity.require = AsyncMock(side_effect=HTTPException(401))
    assert client.post(path, json={"q": raw, **POINT}).status_code == 200
    rows = store.feature_docs.scoped("demand_real", demand.cell_for(**POINT)[:4])
    assert len(rows) == 1
    row = rows[0]
    assert row["terms"] == ["cake|eggless"] and len(row["cell"]) == 6
    assert row["demo"] is False and len(row["actor"]) == 64
    encoded = json.dumps(rows).lower()
    for forbidden in ("alice", "main", "street", "919999", "1.2847", "103.832", "testclient"):
        assert forbidden not in encoded
    assert "lat" not in row and "lng" not in row and "q" not in row


def test_daily_actor_rotates_and_old_salts_are_discarded(setup):
    _, store, _, fixed = setup
    first = demand.actor_for(store.feature_docs, "one-device", fixed)
    assert demand.actor_for(store.feature_docs, "one-device", fixed) == first
    second = demand.actor_for(store.feature_docs, "one-device", fixed + timedelta(days=1))
    assert first != second
    assert store.feature_docs.get("demand_salt", fixed.date().isoformat()) is None


def test_morning_brief_forecast_low_stock_best_action_and_cache(setup):
    client, store, bid, fixed = setup
    path = f"/api/v1/businesses/{bid}/brief"
    result = client.get(path)
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["prep_plan"] == [] and data["forecast_status"] == "insufficient"
    assert data["weather"]["demo"] and data["weather"]["sales_effect"] is None
    assert "Open-Meteo" in data["weather"]["attribution"]
    assert data["best_action"]["kind"] == "order" and data["best_action"]["item"] == "Milk"
    assert client.get(path).json() == data
    save_history(store, bid, fixed)
    changed = client.get(path).json()
    assert changed["prep_plan"][0]["quantity"] == 22
    assert changed["prep_plan"][0]["demand"] == 20
    client.post("/api/v1/customer/session", json={"name": "Asha"})
    client.post(f"/api/v1/customer/shops/{bid}/threads", json={"text": "When can I collect?"})
    assert client.get(path).json()["best_action"]["kind"] == "reply"


def test_new_routes_have_explicit_rate_limits(setup):
    client, _, bid, _ = setup
    client.app.state.v1_settings.rate_limits_enabled = True
    from app.limits import LIMITS, InMemoryRateLimiter

    client.app.state.rate_limiter = InMemoryRateLimiter()
    # Public reads use their own bucket and cannot consume coach/proposal allowances.
    for _ in range(30):
        assert client.get("/api/v1/public/rescue", params=POINT).status_code == 200
    blocked = client.get("/api/v1/public/rescue", params=POINT)
    assert blocked.status_code == 429 and "retry-after" in blocked.headers
    assert all(k in LIMITS for k in ("rescue:write", "rescue:hold", "owner:read"))


def test_owner_erasure_cleans_feature_records(setup):
    client, store, bid, _ = setup
    approve(client, bid, proposal(client, bid))
    assert client.get(f"/api/v1/businesses/{bid}/brief").status_code == 200
    store.erase_owner("owner")
    assert store.feature_docs.get("rescue", bid) is None
    assert store.feature_docs.get("brief", bid) is None


@pytest.mark.asyncio
async def test_coach_fixture_and_live_agent_prepare_review_only(setup):
    client, store, bid, _ = setup
    ctx = MerchantContext(store, "owner", bid, [])
    token = current.set(ctx)
    try:
        message = "send a rescue deal for 6 croissants at 30% off until 8"
        ctx.message = message
        model = OfflineCoachModel()
        responses = [
            r
            async for r in model.generate_content_async(
                LlmRequest(contents=[types.Content(role="user", parts=[types.Part(text=message)])])
            )
        ]
        call = responses[0].content.parts[0].function_call
        assert call.name == "propose_rescue_deal" and call.args["until"] == "20:00"
        result = await propose_rescue_deal(**call.args)
        assert result["status"] == "needs_review"
        events = public_events(
            Event(
                author="business_coach",
                content=types.Content(
                    parts=[
                        types.Part(
                            function_response=types.FunctionResponse(
                                name="propose_rescue_deal", response=result
                            )
                        )
                    ]
                ),
            )
        )
        assert events[0].kind == "rescue_proposal" and events[0].data["digest"]
        assert rescue.deals(store, bid) == []
        for live in (False, True):
            assert (
                propose_rescue_deal
                in make_agent(Settings(v1_enabled=True, _env_file=None), live=live).tools
            )
    finally:
        current.reset(token)


@pytest.mark.asyncio
async def test_weather_adapter_with_mock_transport_and_outage(monkeypatch):
    config = Settings(weather_backend="open_meteo", _env_file=None)
    service = brief.WeatherService(config)
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(
            200,
            json={
                "daily": {
                    "time": [date.today().isoformat()],
                    "temperature_2m_max": [29],
                    "precipitation_probability_max": [80],
                }
            },
        )

    factory = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: factory(transport=httpx.MockTransport(handler), **kwargs),
    )
    result = await service.get({**POINT, "timezone": "UTC"}, date.today())
    assert result.temperature_c == 29 and not result.demo and result.sales_effect is None
    assert (
        await service.get({**POINT, "timezone": "UTC"}, date.today()) == result and len(seen) == 1
    )
    seen.clear()

    def outage(request):
        raise httpx.ConnectError("offline fixture")

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: factory(transport=httpx.MockTransport(outage), **kwargs),
    )
    assert await brief.WeatherService(config).get(POINT, date.today()) is None


def test_buffer_intervals_closing_windows_and_term_privacy():
    prediction = Prediction(date=date.today(), item="Bread", quantity=40, lower=20, upper=60)
    assert rescue.buffer_for(prediction, "timesfm", 0.2) == 4
    assert rescue.buffer_for(prediction, "weekday_average", 0.2) == 4
    assert demand.normalise(["Alice", "123 Main Street", "cake@example.test"]) == []
    assert demand.normalise(keyword_intent("cake without eggs").keywords) == ["cake|eggless"]
    current = datetime(2026, 10, 15, 18, tzinfo=UTC)
    assert rescue.closing({"hours": "20:00–04:00"}, current) is None
    assert (
        rescue.closing(
            {"hours": "07:00–20:00", "weekly_hours": [{"day": "thu", "closed": True}]}, current
        )
        is None
    )


def test_world_seeds_separate_demand_and_two_live_demo_deals(setup):
    client, store, bid, fixed = setup
    client.app.state.v1_settings.demo_world_enabled = True
    body = {**POINT, "timezone": "UTC", "currency": "SGD", "place": "Demo area"}
    response = client.post("/api/v1/demo/world", json=body)
    assert response.status_code == 200, response.text
    ids = response.json()["shop_ids"]
    all_deals = [deal for shop_id in ids for deal in rescue.deals(store, shop_id)]
    assert 1 <= len(all_deals) <= 2
    assert all(d.demo and d.status == "live" for d in all_deals)
    assert store.feature_docs.scoped("demand_real", demand.cell_for(**POINT)[:4]) == []
    ideas = demand.radar(store, "owner", bid, fixed).opportunities
    assert ideas and all(idea.demo for idea in ideas)
    assert client.post("/api/v1/demo/world", json=body).json()["created"] is False
    assert [deal.id for shop_id in ids for deal in rescue.deals(store, shop_id)] == [
        d.id for d in all_deals
    ]


def test_radar_ranks_by_decay_fit_and_hides_met_far_and_sold_clusters(setup):
    _, store, bid, fixed = setup
    docs = store.feature_docs
    for i in range(10):
        demand.capture(
            docs,
            Intent(keywords=["cake"], category="bakery"),
            **POINT,
            identity=f"a-{i}",
            matched_local=0,
            matched_google=None,
            now=fixed - timedelta(days=10),
        )
    for i in range(5):
        for term, category, matched, point in (
            ("sourdough", "bakery", 0, POINT),
            ("bread", "bakery", 1 if i < 3 else 0, POINT),
            ("flower", "other", 0, {"lat": 2, "lng": 104}),
            ("croissant", "bakery", 0, POINT),
        ):
            demand.capture(
                docs,
                Intent(keywords=[term], category=category),
                **point,
                identity=f"b-{i}",
                matched_local=matched,
                matched_google=None,
                now=fixed,
            )
    rows = demand.radar(store, "owner", bid, fixed).opportunities
    assert [r.key for r in rows] == ["sourdough", "cake"]
    assert [r.band for r in rows] == ["5–9", "10–19"]
    assert all(r.google_count is None for r in rows)


def test_radar_and_rescue_and_brief_reject_unauthenticated_owners(setup):
    client, _, bid, _ = setup
    client.app.state.services.identity.require = AsyncMock(side_effect=HTTPException(401))
    for path in ("radar", "brief", "rescue", "rescue/suggestions"):
        assert client.get(f"/api/v1/businesses/{bid}/{path}").status_code == 401


@pytest.mark.parametrize("radius", [200, 2000])
def test_capture_checks_full_nearby_menu_even_outside_requested_radius(setup, monkeypatch, radius):
    client, store, bid, _ = setup
    shop = next(s for s in store.shared_shops() if s["id"] == bid)
    shop["lat"] += 0.005  # Within the radar's 2 km, outside a narrow discovery search.
    shop["products"] = [
        {"name": name, "price": 100, "unit": "item", "available": True}
        for name in ("Bread", "Flour", "Coffee", "Cake")
    ]
    monkeypatch.setattr(store, "shared_shops", lambda: [shop])
    client.app.state.services.identity.require = AsyncMock(side_effect=HTTPException(401))
    result = client.post(
        "/api/v1/discover/ask", json={"q": "bread flour coffee cake", **POINT, "radius": radius}
    )
    assert result.status_code == 200
    rows = store.feature_docs.scoped("demand_real", demand.cell_for(**POINT)[:4])
    assert len(rows) == 4 and all(r["matched_local"] == 1 for r in rows)


def test_demand_day_uses_same_clock_as_rotating_actor(setup):
    _, store, _, fixed = setup
    local = fixed.astimezone(timezone(timedelta(hours=14)))
    demand.capture(
        store.feature_docs,
        Intent(keywords=["cake"]),
        **POINT,
        identity="device",
        matched_local=0,
        matched_google=None,
        now=local,
    )
    row = store.feature_docs.scoped("demand_real", demand.cell_for(**POINT)[:4])[0]
    assert row["day"] == fixed.date().isoformat()


def test_reservation_retry_uses_saved_item_spelling(setup):
    client, _, bid, _ = setup
    deal = approve(client, bid, proposal(client, bid))
    client.post("/api/v1/customer/session", json={"name": "Asha"})
    tid = client.post(
        f"/api/v1/customer/shops/{bid}/threads", json={"text": "Rescue please"}
    ).json()["thread"]["id"]
    path = f"/api/v1/customer/shops/{bid}/rescue/{deal['id']}/hold"
    body = {"thread_id": tid, "name": "Croissant", "qty": 2}
    assert client.post(path, json=body).status_code == 200
    assert client.post(path, json={**body, "name": "croissant"}).status_code == 200
    chat = client.get(f"/api/v1/customer/shops/{bid}/threads/{tid}").json()["thread"]
    assert sum("[rescue " in m["text"] for m in chat["messages"]) == 1


def test_brief_keeps_low_stock_with_zero_forecast(setup, monkeypatch):
    client, _, bid, _ = setup
    prediction = Prediction(date=date.today(), item="Milk", quantity=0)
    from app.forecast import Forecast

    monkeypatch.setattr(
        client.app.state.forecaster,
        "forecast",
        AsyncMock(
            return_value=Forecast(
                status="ready",
                method="weekday_average",
                training_cutoff=date.today(),
                predictions=[prediction],
            )
        ),
    )
    result = client.get(f"/api/v1/businesses/{bid}/brief").json()
    assert any(p["name"] == "Milk" for p in result["low_stock"])


def test_brief_writer_is_closed_at_shutdown(app, monkeypatch):  # noqa: F811
    close = AsyncMock()
    monkeypatch.setattr(brief.BriefWriter, "close", close)
    with TestClient(app):
        pass
    close.assert_awaited_once()


def _runs_out_for_milk(setup, demo):
    from app.demand import Radar
    from app.forecast import Forecast

    _, store, bid, _ = setup
    context = store.context("owner", bid)
    context["business"]["fields"]["demo"] = demo
    today = brief.local_now(context["business"]["fields"]).date()
    # Milk has 3 in stock. Today's forecast alone covers it: the real-owner rule counts today
    # (>=), the demo's shared supply rule starts tomorrow and uses the upper bound.
    forecast = Forecast(
        status="ready",
        method="weekday_average",
        training_cutoff=today,
        predictions=[
            Prediction(date=today, item="Milk", quantity=3),
            Prediction(date=today + timedelta(days=2), item="Milk", quantity=1, upper=4),
        ],
    )
    radar = Radar(area_label="x", approximate=True, demo=False, opportunities=[])
    result = brief.facts(store, "owner", bid, context, forecast, radar)
    return today, next(p for p in result.low_stock if p.name == "Milk").runs_out


def test_brief_runs_out_rule_unchanged_for_real_owners_pr344(setup):
    # PR #344 review: the unified rule must not leak into real signed-in shops.
    today, runs_out = _runs_out_for_milk(setup, demo=False)
    assert runs_out == today


def test_brief_runs_out_uses_supply_rule_for_demo_shops_pr344(setup):
    today, runs_out = _runs_out_for_milk(setup, demo=True)
    assert runs_out == today + timedelta(days=2)
