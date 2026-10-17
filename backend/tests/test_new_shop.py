import json
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.agent import NEW_SHOP_TOPICS, OPEN_QUESTION, instruction, new_shop_call
from app.coordinator import (
    MerchantContext,
    ProductInput,
    current,
    propose_business,
    propose_customer_facts,
    propose_products,
)
from app.discover import MapsService, prepare_pin
from app.main import create_app
from app.merchant import (
    BusinessFields,
    MerchantStore,
    NewShopDraft,
    OwnerLocation,
    ProductFields,
    ProposalRequest,
)
from tests.test_discover import settings
from tests.test_photos import join


@pytest.mark.parametrize("existing", [False, True])
async def test_device_point_is_sealed_reviewed_and_never_a_demo(tmp_path: Path, existing: bool):
    store = MerchantStore(str(tmp_path / "shops.sqlite"))
    before = BusinessFields(
        name="First shop", location="Tiong Bahru", lat=1.28, lng=103.83, pin_demo=True
    )
    bid = None
    if existing:
        initial = store.propose("alice", ProposalRequest(kind="business", business=before))
        bid = store.commit("alice", initial["id"], initial["digest"])["business_id"]
    body = ProposalRequest(
        kind="business",
        business_id=bid,
        revision=1 if bid else 0,
        business=before,
        owner_location=OwnerLocation(lat=12.9718234, lng=77.6412345, accuracy_m=19.2),
    )
    maps = MapsService(settings(tmp_path))
    try:
        await prepare_pin(body, store, "alice", maps)
    finally:
        await maps.close()
    proposal = store.propose("alice", body)
    fields = proposal["snapshot"]["business"]
    assert fields["lat"] == 12.9718234 and fields["lng"] == 77.6412345
    assert fields["pin_source"] == "device" and fields["pin_accuracy_m"] == 19.2
    assert not fields.get("pin_demo") and fields["pin_label"] == "Near Indiranagar"
    if bid:
        assert store.context("alice", bid)["business"]["fields"]["lat"] == 1.28
    else:
        assert store.list_businesses("alice") == []
    receipt = store.commit("alice", proposal["id"], proposal["digest"])
    saved = store.context("alice", receipt["business_id"])["business"]["fields"]
    assert saved["pin_source"] == "device" and saved["pin_accuracy_m"] == 19.2


@pytest.mark.parametrize("unavailable", [False, True])
async def test_reverse_address_never_moves_measured_point(tmp_path: Path, unavailable: bool):
    def provider(request: httpx.Request):
        assert request.url.params["latlng"] == "12.9718234,77.6412345"
        if unavailable:
            return httpx.Response(503)
        return httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [
                    {
                        "place_id": "fixture-place",
                        "formatted_address": "Example Road, Bengaluru",
                        "geometry": {"location": {"lat": 12.9, "lng": 77.6}},
                    }
                ],
            },
        )

    maps = MapsService(settings(tmp_path, live=True), httpx.MockTransport(provider))
    store = MerchantStore(str(tmp_path / "shops.sqlite"))
    body = ProposalRequest(
        kind="business",
        business=BusinessFields(name="Tea"),
        owner_location=OwnerLocation(lat=12.9718234, lng=77.6412345, accuracy_m=20),
    )
    try:
        await prepare_pin(body, store, "alice", maps)
    finally:
        await maps.close()
    assert body.business and body.business.lat == 12.9718234
    assert body.business.lng == 77.6412345 and body.business.pin_source == "device"
    assert body.business.location == ("" if unavailable else "Example Road, Bengaluru")


def test_guided_tools_accumulate_one_new_shop_without_writes(tmp_path: Path):
    store = MerchantStore(str(tmp_path / "shops.sqlite"))
    context = MerchantContext(
        store, "alice", None, [], new_shop=True, new_shop_draft=NewShopDraft()
    )
    token = current.set(context)
    try:
        assert "NEW SHOP mode" in instruction(None)  # type: ignore[arg-type]
        assert (
            propose_business("Chai Corner", category="Tea stall", description="Fresh chai.")[
                "status"
            ]
            == "needs_review"
        )
        assert (
            propose_products([ProductInput(name="Chai", price=15, unit="cup")])["status"]
            == "needs_review"
        )
        assert (
            propose_customer_facts(payment_methods=["UPI"], delivery="none")["status"]
            == "needs_review"
        )
        result = propose_business("", hours="7am–8pm")
        proposal = context.proposals[result["proposal_id"]]
        assert proposal["snapshot"]["products"][0]["name"] == "Chai"
        assert proposal["snapshot"]["business"]["payment_methods"] == ["UPI"]
        assert proposal["snapshot"]["business"]["description"] == "Fresh chai."
        assert store.list_businesses("alice") == []
        receipt = store.commit("alice", proposal["id"], proposal["digest"])
        assert len(store.inventory("alice", receipt["business_id"])) == 1
    finally:
        current.reset(token)


def test_menu_only_draft_never_invents_a_name_and_preserves_an_explicit_name(tmp_path: Path):
    context = MerchantContext(
        MerchantStore(str(tmp_path / "shops.sqlite")),
        "alice",
        None,
        [],
        new_shop=True,
        new_shop_draft=NewShopDraft(
            products=[ProductFields(name="Chai", price=1500, unit="cup", category="Drinks")]
        ),
    )
    suggestion = new_shop_call("Help with my shop", context)
    assert suggestion is None
    explicit = new_shop_call("name: Actual Shop", context)
    assert explicit and explicit.function_call
    assert explicit.function_call.args["name"] == "Actual Shop"


def test_new_shop_fixture_reads_a_vegetarian_answer(tmp_path: Path):
    context = MerchantContext(
        MerchantStore(str(tmp_path / "shops.sqlite")),
        "alice",
        None,
        [],
        new_shop=True,
        new_shop_draft=NewShopDraft(business=BusinessFields(name="Dakshin Sagar")),
    )
    for answer, expected in (("Vegetarian options: yes", True), ("vegetarian: No", False)):
        call = new_shop_call(answer, context)
        assert call and call.function_call
        assert call.function_call.name == "propose_customer_facts"
        assert call.function_call.args == {"vegetarian_options": expected}


def test_new_shop_session_mode_is_owned_and_cannot_target_existing_shop(tmp_path: Path):
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        assert (
            client.post(
                "/api/v1/coach/stream",
                json={
                    "message": "name: Second",
                    "new_shop": True,
                    "business_id": str(uuid4()),
                },
            ).status_code
            == 422
        )
        response = client.post(
            "/api/v1/coach/stream",
            json={
                "message": "name: Second; category: Bakery",
                "new_shop": True,
            },
        )
        events = [
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        ]
        sid = events[0]["session_id"]
        assert any(event["kind"] == "proposal" for event in events)
        assert client.get("/api/v1/businesses").json() == []
        assert (
            client.post(
                "/api/v1/coach/stream",
                json={
                    "message": "hello",
                    "session_id": sid,
                },
            ).status_code
            == 404
        )
        assert not app.state.services.registry.active
        with client.websocket_connect(
            "/api/v1/voice?new_shop=true",
            headers={
                "origin": "http://127.0.0.1:3200",
            },
        ) as socket:
            socket.send_json({"kind": "new_shop", "draft": {"business": {"name": "Voice shop"}}})
            assert socket.receive_json()["kind"] == "ready"
            socket.send_json({"kind": "text", "text": "hours: 8am–6pm"})
            proposed = False
            while True:
                event = socket.receive_json()
                if event["kind"] == "proposal":
                    proposed = True
                    assert event["data"]["snapshot"]["business"]["name"] == "Voice shop"
                if event["kind"] == "turn_complete":
                    break
            socket.send_json({"kind": "close"})
            assert proposed
        assert client.get("/api/v1/businesses").json() == []


@pytest.mark.parametrize(
    "point",
    [
        {"lat": 91, "lng": 0, "accuracy_m": 20},
        {"lat": 0, "lng": 181, "accuracy_m": 20},
        {"lat": 0, "lng": 0, "accuracy_m": -1},
        {"lat": 0, "lng": 0},
    ],
)
def test_invalid_device_location_is_rejected(tmp_path: Path, point: dict):
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        assert (
            client.post(
                "/api/v1/proposals",
                json={
                    "kind": "business",
                    "business": {"name": "Tea"},
                    "owner_location": point,
                },
            ).status_code
            == 422
        )


def asked_topic(reply: str) -> str | None:
    """Which topic the fixture coach asked in this reply (None: none of them)."""
    if OPEN_QUESTION in reply:
        return "open"
    return next((key for key, question, _ in NEW_SHOP_TOPICS if question in reply), None)


def test_new_shop_coach_speaks_first_and_moves_on_when_the_owner_does_not_answer(tmp_path: Path):
    app = create_app(settings(tmp_path), InMemorySessionService())

    def turn(client: TestClient, message: str, sid: str | None, draft: dict) -> tuple[str, list]:
        response = client.post(
            "/api/v1/coach/stream",
            json={
                "message": message,
                "new_shop": True,
                "session_id": sid,
                "new_shop_draft": draft,
            },
        )
        events = [
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        ]
        reply = next(event["text"] for event in reversed(events) if event["kind"] == "reply")
        return reply, events

    answers = {
        # #112: the open question first; an answer with nothing usable moves on to the basics.
        "open": "Hmm, let me think.",
        "name": "name: Chai Corner",
        "sell": "category: Tea stall",
        "location": "I'm not sure. Suggest something or skip it.",
        "hours": "hours: 7am-9pm",
    }
    with TestClient(app) as client:
        join(client)
        draft: dict = {"business": None, "products": []}
        greeting, events = turn(client, "Hello! I want to open a new shop.", None, draft)
        sid = events[0]["session_id"]
        assert "Hi" in greeting
        # No fixed script: the coach asks what is missing in its own order; each topic once.
        asked = [asked_topic(greeting)]
        reply = greeting
        while asked[-1] in answers:
            reply, events = turn(client, answers[asked[-1]], sid, draft)
            draft = next(
                (
                    {"business": e["data"]["snapshot"]["business"], "products": []}
                    for e in events
                    if e["kind"] == "proposal"
                ),
                draft,
            )
            assert "pay" not in reply and "menu" not in reply
            asked.append(asked_topic(reply))
            assert asked[-1] not in asked[:-1], f"asked twice: {reply}"
        # Silence on location: the coach leaves it out, says so and moves on.
        assert "location" in asked and asked[-1] == "photo"
        assert "photo of your shop" in reply
        # Without a place the shop is not live yet.
        assert client.get("/api/v1/businesses").json() == []


def test_new_shop_voice_draft_can_be_refreshed_mid_session(tmp_path: Path):
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        with client.websocket_connect(
            "/api/v1/voice?new_shop=true", headers={"origin": "http://127.0.0.1:3200"}
        ) as socket:
            socket.send_json({"kind": "new_shop", "draft": None})
            assert socket.receive_json()["kind"] == "ready"
            socket.send_json(
                {"kind": "new_shop", "draft": {"business": {"name": "Photo Kopi"}, "products": []}}
            )
            socket.send_json({"kind": "text", "text": "hours: 8am-6pm"})
            business = None
            while True:
                event = socket.receive_json()
                if event["kind"] == "proposal":
                    business = event["data"]["snapshot"]["business"]
                if event["kind"] == "turn_complete":
                    break
            socket.send_json({"kind": "close"})
        assert business and business["name"] == "Photo Kopi"


def test_new_shop_voice_session_end_resumes_the_same_conversation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """A Live socket always ends (time cap); the app reconnects to the same session id and the
    conversation, its turns and the draft carry on. The open conversation also allows far more
    turns than a press-to-talk coach session."""
    monkeypatch.setattr("app.voice.NEW_SHOP_SESSION_CAP_SECONDS", 1)
    app = create_app(settings(tmp_path), InMemorySessionService())
    origin = {"origin": "http://127.0.0.1:3200"}
    with TestClient(app) as client:
        join(client)
        with client.websocket_connect("/api/v1/voice?new_shop=true", headers=origin) as socket:
            socket.send_json({"kind": "new_shop", "draft": None})
            sid = socket.receive_json()["session_id"]
            socket.send_json({"kind": "text", "text": "Hello! I want to open a new shop."})
            while socket.receive_json()["kind"] != "turn_complete":
                pass
            # The 15-minute cap ends the socket politely: the app offers typing and a tap
            # to talk again in the same conversation.
            while (event := socket.receive_json())["kind"] != "error":
                pass
            assert event["code"] == "SESSION_CAP"
        assert not app.state.services.registry.active
        monkeypatch.setattr("app.voice.NEW_SHOP_SESSION_CAP_SECONDS", 60)
        with client.websocket_connect(
            f"/api/v1/voice?new_shop=true&session_id={sid}", headers=origin
        ) as socket:
            socket.send_json({"kind": "new_shop", "draft": None})
            ready = socket.receive_json()
            assert ready["session_id"] == sid and "code" not in ready
            # The conversation continues: the app resumes silently (no second greeting).
            assert ready["data"] == {"continues": True}
            for _ in range(14):
                socket.send_json({"kind": "text", "text": "I'm not sure. Skip it."})
                while socket.receive_json()["kind"] != "turn_complete":
                    pass
            socket.send_json({"kind": "close"})
        history = client.get(f"/api/v1/conversations/{sid}").json()["messages"]
        assert history[0]["text"] == "Hello! I want to open a new shop."
        assert client.get("/api/v1/businesses").json() == []


def test_press_to_talk_voice_keeps_its_small_turn_budget(tmp_path: Path):
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        with client.websocket_connect(
            "/api/v1/voice", headers={"origin": "http://127.0.0.1:3200"}
        ) as socket:
            assert socket.receive_json()["kind"] == "ready"
            codes = []
            for _ in range(13):
                socket.send_json({"kind": "text", "text": "hello"})
                while (event := socket.receive_json())["kind"] not in {"turn_complete", "error"}:
                    pass
                codes.append(event.get("code"))
                if event["kind"] == "error":
                    break
            assert codes[-1] == "INVALID_FRAME" and len(codes) == 13


async def test_owner_placed_pin_is_sealed_as_a_pin_without_gps_accuracy(tmp_path: Path):
    store = MerchantStore(str(tmp_path / "shops.sqlite"))
    body = ProposalRequest(
        kind="business",
        business=BusinessFields(name="Tea"),
        owner_location=OwnerLocation(lat=12.9718234, lng=77.6412345, accuracy_m=35, source="pin"),
    )
    maps = MapsService(settings(tmp_path))
    try:
        await prepare_pin(body, store, "alice", maps)
    finally:
        await maps.close()
    assert body.business and body.business.pin_source == "pin"
    assert body.business.pin_accuracy_m is None and body.business.lat == 12.9718234
    assert body.business.pin_label == "Near Indiranagar"


def test_reverse_pin_reads_the_address_under_the_pin_for_owners_only(tmp_path: Path):
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        point = {"lat": 12.9718234, "lng": 77.6412345}
        assert client.get("/api/v1/places/reverse", params=point).status_code == 401
        join(client)
        found = client.get("/api/v1/places/reverse", params=point).json()
        assert found == {"label": "Near Indiranagar", "approximate": True}
        far = client.get("/api/v1/places/reverse", params={"lat": -40, "lng": 10}).json()
        assert far == {"label": "Your current location", "approximate": True}
        assert client.get("/api/v1/places/reverse", params={"lat": 91, "lng": 0}).status_code == 422


async def test_offline_new_shop_tool_result_gets_the_next_question_in_hindi(tmp_path: Path):
    from google.genai import types

    from app.agent import OfflineCoachModel, ui_language

    context = MerchantContext(
        MerchantStore(str(tmp_path / "shops.sqlite")),
        "alice",
        None,
        [],
        new_shop=True,
        new_shop_draft=NewShopDraft(business=BusinessFields(name="Chai Corner")),
        message="name: Chai Corner",
    )
    result = types.Content(
        role="user",
        parts=[
            types.Part(
                function_response=types.FunctionResponse(
                    name="propose_business", response={"status": "needs_review"}
                )
            )
        ],
    )
    request = types.Content(role="user", parts=[types.Part(text="name: Chai Corner")])
    token, lang = current.set(context), ui_language.set("hi")
    try:
        replies = [
            r
            async for r in OfflineCoachModel().generate_content_async(
                type("R", (), {"contents": [request, result]})()  # type: ignore[arg-type]
            )
        ]
    finally:
        ui_language.reset(lang)
        current.reset(token)
    text = replies[0].content.parts[0].text
    assert "Offline demo" not in text and "review the proposed" not in text
    assert "?" in text
