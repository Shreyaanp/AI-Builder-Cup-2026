"""Public demos never acquire an owner identity or use the durable merchant repository."""

import json
import time
from datetime import date, datetime
from unittest.mock import AsyncMock, Mock
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app import public_demo
from tests.test_photos import app  # noqa: F401


def open_demo(client: TestClient):
    return client.post("/api/v1/demo/workspace?public=true&zone=Asia/Kolkata")


def read(client: TestClient, session: str, path: str):
    return client.get(f"/api/v1/demo/sessions/{session}", params={"path": path})


def owner(client: TestClient, session: str, path: str, method: str = "GET", **kwargs):
    return client.request(method, f"/api/v1/demo/sessions/{session}/api/{path}", **kwargs)


def test_public_demo_is_off_by_default(app):  # noqa: F811
    with TestClient(app) as client:
        assert open_demo(client).status_code == 404
        assert read(client, "missing", "/shops").status_code == 404
        assert owner(client, "missing", "businesses").status_code == 404


def test_demo_is_the_full_owner_app_on_a_private_sandbox(app, monkeypatch):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.v1_settings.forecast_backend = "bigquery"
        provider = AsyncMock(side_effect=AssertionError("live forecast"))
        monkeypatch.setattr("app.forecast.BigQueryClient.query", provider)
        app.state.services.identity.require = AsyncMock(side_effect=AssertionError("identity"))
        app.state.merchant = Mock()  # Any use of the real merchant repository fails this test.
        made = open_demo(client)
        assert made.status_code == 200, made.text
        session = made.json()["session_id"]
        assert time.time() < made.json()["expires_at"] <= time.time() + 900
        businesses = owner(client, session, "businesses").json()
        business = businesses[0]
        assert business["fields"]["name"] == "Lantern Chai Corner (Demo)"
        assert business["fields"]["currency"] == "INR"
        assert business["public"] is False
        assert {"demo-chain-freshmart", "demo-chain-metro-foods"} <= {b["id"] for b in businesses}
        bid = business["id"]
        story = owner(client, session, f"demo/chain/{bid}")
        assert story.status_code == 200, story.text
        assert story.json()["wholesaler"]["name"]
        assert story.json()["wholesaler"]["restock"]
        inventory = owner(client, session, f"businesses/{bid}/inventory").json()
        sales = owner(client, session, f"businesses/{bid}/sales").json()
        assert len(sales) >= 42 * len(inventory)
        assert owner(client, session, f"businesses/{bid}/forecast").json()["status"] == "ready"
        supply = owner(client, session, f"businesses/{bid}/supply").json()
        assert any("Sri Lakshmi" in o["supplier"]["name"] for o in supply["orders"])
        metro = owner(client, session, "businesses/demo-chain-metro-foods/supply").json()
        assert any(
            d.get("translated_format") == "idoc" for o in metro["orders"] for d in o["documents"]
        )
        sap = owner(client, session, f"businesses/{bid}/supply/sap-sandbox")
        assert sap.status_code == 200 and sap.json()["source"] == "recorded"
        drafted = owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={})
        assert drafted.status_code == 200, drafted.text
        # Sandbox writes stay in the session; anything that would leave it is refused.
        assert owner(client, session, "me/data", "DELETE").status_code == 403
        shared = owner(client, session, f"businesses/{bid}/share", "POST", json={"public": True})
        assert shared.status_code == 403 and shared.json()["detail"] == "DEMO_NOT_SENT"
        assert owner(client, session, "businesses/someone-else/inventory").status_code in {
            403,
            404,
        }
        put = owner(client, session, "reminders", "PUT", json={"open": "07:00"})
        assert put.status_code == 200 and owner(client, session, "reminders").json()["demo"]
        assert owner(client, session, "demo/workspace", "POST").json()["business_id"] == bid
        app.state.services.identity.require.assert_not_called()
        assert app.state.merchant.mock_calls == []
        provider.assert_not_called()


def test_OB_62_bengaluru_public_demo_forecast_matches_both_surfaces_across_loads(
    app,  # noqa: F811
):
    """OB-62: /demo keeps realistic tea-dust numbers across the card, tour and reload."""
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]
        business = owner(client, session, "businesses").json()[0]
        bid = business["id"]

        def surfaces():
            supply_card = owner(client, session, f"businesses/{bid}/supply")
            tour = owner(client, session, f"demo/chain/{bid}")
            assert supply_card.status_code == tour.status_code == 200
            return supply_card.json(), tour.json()

        before_card, before_tour = surfaces()
        loaded = owner(client, session, "demo/workspace", "POST")
        assert loaded.json() == {"business_id": bid, "created": False}
        card, tour = surfaces()
        need = next(row for row in card["needs"] if row["item"] == "Tea dust")
        first_need = next(row for row in before_card["needs"] if row["item"] == "Tea dust")
        step = tour["today"]
        assert need["stock"] >= 3 and need["daily"] >= 1.5
        today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
        assert 1 <= (date.fromisoformat(need["runs_out"]) - today).days <= 4
        assert (need["stock"], need["daily"], need["runs_out"]) == (
            step["stock"],
            step["daily"],
            step["runs_out"],
        )
        assert (need["stock"], need["daily"], need["runs_out"]) == (
            first_need["stock"],
            first_need["daily"],
            first_need["runs_out"],
        )
        assert (step["stock"], step["daily"], step["runs_out"]) == (
            before_tour["today"]["stock"],
            before_tour["today"]["daily"],
            before_tour["today"]["runs_out"],
        )
        assert step["item"] == "Tea dust" and step["unit"] == "kg"
        reorder = tour["order"]["lines"][0]
        assert reorder["item"] == "Tea dust" and reorder["unit"] == "kg"
        assert reorder["quantity"] >= 10
        lines = tour["wholesaler"]["restock"]["lines"]
        tea = next(line for line in lines if line["item"] == "Tea dust")
        milk = next(line for line in lines if line["item"] == "Milk")
        sugar = next(line for line in lines if line["item"] == "Sugar")
        assert (tea["quantity"], tea["unit"], tea["price"], tea["total"]) == (
            50,
            "kg",
            19000,
            950000,
        )
        assert milk["unit"] == "litre" and sugar["unit"] == "kg"


def test_demo_coach_answers_offline(app, monkeypatch):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        paid_forecast = Mock(forecast=AsyncMock(side_effect=AssertionError("live tool")))
        monkeypatch.setattr("app.coordinator.forecaster", paid_forecast)
        reply = client.post(
            f"/api/v1/demo/sessions/{session}/coach",
            json={"message": "Forecast demand for Masala chai."},
        )
        assert reply.status_code == 200, reply.text
        assert "turn_complete" in reply.text
        assert "demo forecast" in reply.text.lower()
        paid_forecast.forecast.assert_not_called()


def test_OB_59_public_demo_coach_answers_Hindi_in_Hindi(app):  # noqa: N802, F811
    prompts = [
        ("Help me update my products", "demo menu"),
        ("Help me close the day", "demo sales"),
        ("Forecast demand for Masala chai", "demo forecast"),
        ("Reorder milk for tomorrow", "Demo supply records"),
        ("My flour is running low", "Demo supply records"),
        ("Reply to customers", "demo customer questions"),
        ("Something sold out?", "Demo stock shows"),
        ("Change a price", "demo price"),
        ("Samosa is 20 now", "demo price"),
        ("How did I do today?", "demo sales"),
        ("Order more Tea dust", "Demo supply records"),
        ("What should I prep tomorrow?", "demo forecast"),
        ("Hello", "menu items"),
        ("नमस्ते", "मैं आज की बिक्री"),
        ("आज बिक्री कैसी रही?", "आज डेमो में"),
        ("कल क्या तैयारी करूँ?", "कल"),
        ("ग्राहक क्या पूछ रहे हैं?", "ग्राहक सवाल"),
        ("नमक खत्म है", "डेमो में"),
        ("कीमत बदलो", "कीमत"),
        ("ऑर्डर और सामान", "डेमो सप्लायर"),
        ("We are closed today", "Demo shop hours"),
        ("What is my business called?", "I can help with"),
    ]
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]
        for message, expected in prompts:
            response = client.post(
                f"/api/v1/demo/sessions/{session}/coach", json={"message": message}
            )
            assert response.status_code == 200, (message, response.text)
            events = [
                json.loads(line[6:])
                for line in response.text.splitlines()
                if line.startswith("data: ")
            ]
            reply = " ".join(event.get("text", "") for event in events)
            assert expected in reply, (message, events)
            assert "What is your business called?" not in reply
            if expected != "I can help with" and not any(
                "\u0900" <= ch <= "\u097f" for ch in message
            ):
                assert "next" in reply.lower()
        app.state.rate_limiter.counters.clear()


def test_customer_snapshot_reads(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        shops = read(client, session, "/shops").json()
        assert shops
        public = read(client, session, f"/public/shops/{shops[0]['id']}").json()
        assert public["demo"] is True and public["products"]
        assert public["phone"] == ""
        assert public["stamps_enabled"] is True and public["reward_text"]
        assert read(client, session, "/me").status_code == 403
        assert client.post(f"/api/v1/demo/sessions/{session}").status_code == 405


def test_sessions_are_isolated_expire_and_exit(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        first, second = [open_demo(client).json()["session_id"] for _ in range(2)]
        first_id = owner(client, first, "businesses").json()[0]["id"]
        assert owner(client, second, f"businesses/{first_id}/inventory").status_code in {403, 404}
        app.state.public_demos[first].expires = time.time() - 1
        assert owner(client, first, "businesses").status_code == 410
        assert first not in app.state.public_demos
        assert client.delete(f"/api/v1/demo/sessions/{second}").status_code == 200
        assert owner(client, second, "businesses").status_code == 410


def test_ob76_rate_limit_per_ip_even_when_owner_limits_are_disabled(app, monkeypatch):  # noqa: F811
    from types import SimpleNamespace

    from app.limits import InMemoryRateLimiter

    # OB-76: keep all bucket operations in the same minute even at wall-clock boundaries.
    monkeypatch.setattr(public_demo, "time", SimpleNamespace(time=lambda: 120.0))
    with TestClient(app, headers={"x-forwarded-for": "192.0.2.1"}) as client:
        # OB-76: allocate a fresh limiter so earlier app fixtures cannot consume this test's quota.
        app.state.rate_limiter = InMemoryRateLimiter()
        app.state.v1_settings.public_demo_enabled = True
        app.state.v1_settings.rate_limits_enabled = False
        for _ in range(public_demo.OPEN_PER_MINUTE):
            assert open_demo(client).status_code == 200
        blocked = open_demo(client)
        assert blocked.status_code == 429
        assert int(blocked.headers["retry-after"]) > 0
        other = client.post(
            "/api/v1/demo/workspace?public=true", headers={"x-forwarded-for": "192.0.2.2"}
        )
        assert other.status_code == 200


def test_demo_limit_store_failure_is_closed(app):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.take = Mock(side_effect=RuntimeError("offline"))
        assert open_demo(client).status_code == 429
        assert app.state.public_demos == {}


def test_ob132_rate_limit_bypass_is_opt_in_and_local_only(app):  # noqa: F811
    import asyncio
    from unittest.mock import Mock

    from fastapi import HTTPException
    from starlette.requests import Request

    from app.limits import enforce_limits

    with TestClient(app):
        scope = {
            "type": "http",
            "app": app,
            "headers": [(b"x-test-rate-limit-bypass", b"1")],
        }
        request = Request(scope)
        app.state.rate_limiter.take = Mock(return_value=1)
        asyncio.run(enforce_limits(request, [("discover:ask", "test")], anonymous=True))
        app.state.rate_limiter.take.assert_not_called()

        app.state.v1_settings.app_env = "production"
        with pytest.raises(HTTPException) as limited:
            asyncio.run(enforce_limits(request, [("discover:ask", "test")], anonymous=True))
        assert limited.value.status_code == 429
        app.state.rate_limiter.take.assert_called_once()


def test_failed_seed_releases_capacity(app, monkeypatch):  # noqa: F811
    with TestClient(app, raise_server_exceptions=False) as client:
        app.state.v1_settings.public_demo_enabled = True
        monkeypatch.setattr("app.public_demo.sandbox", Mock(side_effect=RuntimeError("fixture")))
        assert open_demo(client).status_code == 500
        assert app.state.public_demos == {}
        monkeypatch.setattr("app.public_demo.MAX_SESSIONS", 0)
        assert open_demo(client).status_code == 429


def test_session_and_safe_writes_survive_instance_cache_loss(app):  # noqa: F811
    from tests.test_photos import jpeg

    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        bid = owner(client, session, "businesses").json()[0]["id"]
        drafted = owner(client, session, f"businesses/{bid}/supply/reorder", "POST", json={})
        assert drafted.status_code == 200, drafted.text
        supply = owner(client, session, f"businesses/{bid}/supply").json()
        incoming = next(o for o in supply["orders"] if o["status"] in {"dispatched", "invoiced"})
        received = owner(
            client,
            session,
            f"businesses/{bid}/supply/orders/{incoming['id']}/received",
            "POST",
            json={"version": incoming["version"]},
        )
        assert received.status_code == 200, received.text
        assert received.json()["order"]["received"] is True
        supply = owner(client, session, f"businesses/{bid}/supply").json()
        photo = owner(
            client,
            session,
            f"businesses/{bid}/day/read?kind=sales",
            "POST",
            content=jpeg(),
            headers={"Content-Type": "image/jpeg"},
        )
        assert photo.status_code == 200 and photo.json()["fixture"] is True
        prepared = owner(
            client,
            session,
            f"businesses/{bid}/day/prepare",
            "POST",
            json={
                "date": photo.json()["date"],
                "sales": [{"item": "Masala chai", "quantity": 12, "amount": 240}],
            },
        )
        assert prepared.status_code == 200, prepared.text
        sales = prepared.json()["sales"]
        saved = owner(
            client,
            session,
            f"businesses/{bid}/import/{sales['import_id']}/approve",
            "POST",
            json={"digest": sales["digest"]},
        )
        assert saved.status_code == 200, saved.text
        history = owner(client, session, f"businesses/{bid}/sales").json()
        supply = owner(client, session, f"businesses/{bid}/supply").json()
        assert owner(client, session, "reminders", "PUT", json={"enabled": True}).status_code == 200
        before = read(client, session, "/shops").json()
        for entry in app.state.public_demos.values():
            entry.close()
        app.state.public_demos.clear()
        # Every following request reconstructs from storage, as on a fresh instance.
        assert owner(client, session, "businesses").json()[0]["id"] == bid
        assert owner(client, session, f"businesses/{bid}/supply").json() == supply
        assert owner(client, session, f"businesses/{bid}/sales").json() == history
        assert owner(client, session, "reminders").json()["subscriptions"] == ["demo"]
        assert read(client, session, "/shops").json() == before
        reply = client.post(f"/api/v1/demo/sessions/{session}/coach", json={"message": "Hello"})
        assert reply.status_code == 200 and "turn_complete" in reply.text
        assert client.delete(f"/api/v1/demo/sessions/{session}").status_code == 200
        assert owner(client, session, "businesses").status_code == 410


def test_snapshot_rejects_stale_writes_and_expired_sessions(app):  # noqa: F811
    from fastapi import HTTPException
    from starlette.requests import Request

    from app.demo_sessions import KIND, repository, save

    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        request = Request({"type": "http", "app": app})
        docs = repository(request)
        entry = app.state.public_demos[session]
        revision = entry.revision
        save(docs, session, entry)
        entry.revision = revision
        with pytest.raises(HTTPException) as conflict:
            save(docs, session, entry)
        assert conflict.value.status_code == 409
        data = docs.get(KIND, session)
        data["expires"] = time.time() - 1
        docs.put(KIND, session, session, data["expires"], data)
        entry.close()
        app.state.public_demos.clear()
        assert owner(client, session, "businesses").status_code == 410


def test_ob52_demo_qr_key_works_and_never_matches_a_real_key(app):  # noqa: F811
    """OB-52: the tour's QR key 500'd because the sandbox identity had no signer."""
    from app.passport import qr_key

    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        bid = owner(client, session, "businesses").json()[0]["id"]
        made = owner(client, session, f"businesses/{bid}/qr-key")
        assert made.status_code == 200, made.text
        key = made.json()["key"]
        assert key and owner(client, session, f"businesses/{bid}/qr-key").json()["key"] == key
        real = app.state.services.identity.signer.secret_key
        assert key != qr_key(real, bid)  # a demo QR can never stamp the real app


def test_OB_122_customer_demo_uses_the_stamp_shop_country(app):  # noqa: N802, F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        created = client.post("/api/v1/demo/workspace?public=true&zone=Asia/Singapore")
        assert created.status_code == 200, created.text
        session = created.json()["session_id"]
        shops = read(client, session, "/shops").json()
        assert shops and all("bengaluru" in shop["id"] for shop in shops)
        detail = read(client, session, f"/public/shops/{shops[0]['id']}").json()
        assert detail["currency"] == "INR"


def coach_events(client: TestClient, session: str, message: str) -> list[dict]:
    response = client.post(f"/api/v1/demo/sessions/{session}/coach", json={"message": message})
    assert response.status_code == 200, (message, response.text)
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


def test_O_1_demo_menu_files_get_a_labelled_sample_and_a_real_413(app, monkeypatch):  # noqa: N802, F811
    """O-1: imports and photo reads in the demo answer with a sample review, never a model."""
    read_file = AsyncMock(side_effect=AssertionError("a demo file reached the photo pipeline"))
    monkeypatch.setattr("app.photos.PhotoPipeline.classify_upload", read_file)
    monkeypatch.setattr("app.photos.PhotoPipeline.process", read_file)
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]
        bid = owner(client, session, "businesses").json()[0]["id"]
        for content_type in ("text/csv", "application/pdf", "image/jpeg"):
            made = owner(
                client,
                session,
                f"businesses/{bid}/import",
                "POST",
                content=b"item,price\nTea,10\n",
                headers={"Content-Type": content_type},
            )
            assert made.status_code == 200, made.text
            body = made.json()
            assert body["kind"] == "menu" and body["sample"] is True
            assert "Sample read" in body["sample_note"]
            names = [p["name"] for p in body["proposal"]["snapshot"]["products"]]
            assert "Masala dosa" in names and "Filter coffee" in names
        approved = owner(
            client,
            session,
            f"proposals/{body['proposal']['id']}/approve",
            "POST",
            json={"digest": body["proposal"]["digest"]},
        )
        assert approved.status_code == 200, approved.text
        menu = [p["name"] for p in owner(client, session, f"businesses/{bid}/inventory").json()]
        assert "Masala dosa" in menu
        too_big = owner(
            client,
            session,
            f"businesses/{bid}/import",
            "POST",
            content=b"x" * 5_000_001,
            headers={"Content-Type": "text/csv"},
        )
        assert too_big.status_code == 413 and too_big.json()["detail"] == "FILE_TOO_LARGE"
        guessed = owner(
            client,
            session,
            "photos/classify",
            "POST",
            content=b"\xff\xd8" + b"x" * 200_000,
            headers={"Content-Type": "image/jpeg"},
        )
        assert guessed.status_code == 200, guessed.text
        assert guessed.json()["kind"] == "menu"
        photo = owner(
            client,
            session,
            f"photos?business_id={bid}&language=en",
            "POST",
            content=b"\xff\xd8" + b"x" * 1000,
            headers={"Content-Type": "image/jpeg"},
        )
        assert photo.status_code == 200, photo.text
        assert photo.json()["proposal"]["snapshot"]["products"]
        assert "Sample read" in photo.json()["extraction"]["uncertain"][0]
        other = owner(
            client,
            session,
            "businesses/someone-else/import",
            "POST",
            content=b"item,price\n",
            headers={"Content-Type": "text/csv"},
        )
        assert other.status_code == 403
        app.state.v1_settings.max_photo_bytes = 65_536
        huge = owner(
            client,
            session,
            "photos/classify",
            "POST",
            content=b"x" * 70_000,
            headers={"Content-Type": "image/jpeg"},
        )
        assert huge.status_code == 413
        read_file.assert_not_called()
        app.state.rate_limiter.counters.clear()


def test_O_2_demo_coach_prepares_the_real_cards_offline(app):  # noqa: N802, F811
    """O-2: common owner requests get proposal, chart and answer cards; the rest get chips."""
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]
        cases = {
            "Change my closing time to 10pm": ("proposal", "Closing time 21:00 → 22:00"),
            "add cutting chai for 15 rupees": ("proposal", "New item: Cutting chai"),
            "samosa sold out": ("proposal", "Samosa: sold out"),
            "how many visits this week?": ("reply", "page was opened"),
            "what are my best sellers?": ("chart", "best sellers: Masala chai"),
            "What should I prep tomorrow?": ("chart", "demo forecast"),
            "add masala chai for 20 rupees": ("reply", "already on your demo menu at ₹20"),
            # Saved prices are paise; the demo once said ₹2000 for a ₹20 samosa.
            "Samosa is 20 now": ("reply", "demo price for Samosa is ₹20."),
        }
        for message, (kind, words) in cases.items():
            events = coach_events(client, session, message)
            assert kind in [event["kind"] for event in events], (message, events)
            reply = " ".join(event.get("text") or "" for event in events)
            assert words in reply, (message, reply)
        proposal = next(
            event["data"]
            for event in coach_events(client, session, "Change my closing time to 10pm")
            if event["kind"] == "proposal"
        )
        hours = proposal["snapshot"]["business"]["weekly_hours"]
        assert {day["close"] for day in hours} == {"22:00"}
        fallback = coach_events(client, session, "What is my business called?")
        offered = next(e for e in fallback if e["kind"] == "reply")["data"]["suggestions"]
        assert "What are my best sellers?" in offered and len(offered) == 6
        for suggestion in offered:
            events = coach_events(client, session, suggestion)
            reply = " ".join(event.get("text") or "" for event in events)
            assert "I can help with these in the demo" not in reply, (suggestion, reply)
        app.state.rate_limiter.counters.clear()


def test_O_4_demo_pin_address_is_answered_offline(app, monkeypatch):  # noqa: N802, F811
    """O-4: the address under a demo map pin comes from the offline area list (no Maps call)."""
    paid = AsyncMock(side_effect=AssertionError("paid Maps call"))
    monkeypatch.setattr("httpx.AsyncClient.get", paid)
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        found = owner(client, session, "places/reverse?lat=12.96880&lng=77.63820")
        assert found.status_code == 200, found.text
        assert found.json() == {"label": "Near Indiranagar", "approximate": True}
        pin = owner(client, session, "places/pin?q=Indiranagar")
        assert pin.status_code == 200, pin.text
        paid.assert_not_called()
