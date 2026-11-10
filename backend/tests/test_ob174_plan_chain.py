"""OB-174 (#533): multi-step chains survive approval cards.

The plan and its current step live in the conversation's session state; a step that ends at a
card parks the plan on it (with the function-call and invocation ids), and the owner's tap
resumes the next step. The resume note never shows in the chat history as the owner's words."""

import json

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app import sourcing
from app.coach_plan import NOTE_STATE, PLAN_STATE, many_steps, split_steps
from app.main import create_app
from tests.test_merchant_routes import approve, settings  # noqa: F401 - shared fixture
from tests.test_photos import join

CHAIN = (
    "My flour is running low, find suppliers, then order 20 kg flour from the cheapest, "
    "then ask them if they deliver on Sunday"
)


def stream(client: TestClient, body: dict[str, object]) -> list[dict[str, object]]:
    response = client.post("/api/v1/coach/stream", json=body)
    assert response.status_code == 200, response.text
    return [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


def kinds(events: list[dict[str, object]]) -> list[object]:
    return [event["kind"] for event in events]


def plans(events: list[dict[str, object]]) -> list[dict]:
    return [event["data"] for event in events if event["kind"] == "plan"]  # type: ignore[misc]


def shop(client: TestClient) -> str:
    join(client)
    proposal = client.post(
        "/api/v1/proposals", json={"kind": "business", "business": {"name": "Kopi Corner"}}
    ).json()
    return str(approve(client, proposal)["business_id"])


def test_a_three_step_chain_parks_on_the_order_card_and_goes_on_after_send(
    settings,  # noqa: F811
    monkeypatch,
) -> None:
    monkeypatch.setattr(sourcing, "DEMO_REPLY_SECONDS", 0.0)
    sessions = InMemorySessionService()
    app = create_app(settings, sessions)
    with TestClient(app) as client:
        bid = shop(client)
        first = stream(client, {"message": CHAIN, "business_id": bid})
        assert "error" not in kinds(first), first
        session_id = next(e["session_id"] for e in first if e["kind"] == "ready")
        shown = plans(first)
        assert shown[0]["steps"] == [
            "My flour is running low, find suppliers",
            "order 20 kg flour from the cheapest",
            "ask them if they deliver on Sunday",
        ]
        # Suppliers found and the order prepared in the same run; it stops at the card.
        assert "suppliers" in kinds(first) and "order" in kinds(first)
        order = next(e["data"] for e in first if e["kind"] == "order")
        last = shown[-1]
        assert last["done"] == 2
        assert last["waiting"] == {"kind": "order", "id": order["id"], "tap": "Send"}
        reply = next(e["text"] for e in first if e["kind"] == "reply")
        assert "ask them if they deliver on Sunday" in reply
        # Nothing went to the supplier: the message step waits for the tap.
        assert client.get(f"/api/v1/businesses/{bid}/orders").json() == []

        # The plan is in session state, not only in the chat: ids of the card's call kept.
        saved = client.portal.call(  # type: ignore[union-attr]
            lambda: sessions.get_session(
                app_name="ogoogle_ai", user_id=_uid(sessions), session_id=session_id
            )
        )
        waiting = saved.state[PLAN_STATE]["waiting"]
        assert waiting["tool"] == "prepare_order" and waiting["function_call_id"]
        assert waiting["invocation_id"]

        # Resuming before the tap does nothing (the server checks the card's real state).
        early = stream(
            client,
            {"resume": {"card_id": order["id"]}, "business_id": bid, "session_id": session_id},
        )
        assert kinds(early) == ["ready", "turn_complete"]

        sent = client.post(
            f"/api/v1/businesses/{bid}/orders/{order['id']}/send",
            json={"version": order["version"]},
        )
        assert sent.status_code == 200, sent.text
        after = stream(
            client,
            {"resume": {"card_id": order["id"]}, "business_id": bid, "session_id": session_id},
        )
        assert "error" not in kinds(after), after
        message = next(e["data"] for e in after if e["kind"] == "order")
        assert message["id"] == order["id"]
        assert "sunday" in str(message["pending"]["text"]).casefold()
        assert plans(after)[-1]["done"] == 3

        # The same resume again never runs a step twice.
        again = stream(
            client,
            {"resume": {"card_id": order["id"]}, "business_id": bid, "session_id": session_id},
        )
        assert kinds(again) == ["ready", "turn_complete"]

        history = client.get(f"/api/v1/conversations/{session_id}").json()["messages"]
        owner_lines = [m["text"] for m in history if m.get("role") == "user"]
        assert owner_lines == [CHAIN]
        assert not any("App note" in str(m.get("text", "")) for m in history)
        saved = client.portal.call(  # type: ignore[union-attr]
            lambda: sessions.get_session(
                app_name="ogoogle_ai", user_id=_uid(sessions), session_id=session_id
            )
        )
        assert saved.state[PLAN_STATE] is None
        assert sum(NOTE_STATE in (e.actions.state_delta or {}) for e in saved.events) == 1


def test_discarding_the_card_stops_the_plan_and_runs_nothing(settings) -> None:  # noqa: F811
    sessions = InMemorySessionService()
    app = create_app(settings, sessions)
    with TestClient(app) as client:
        bid = shop(client)
        first = stream(client, {"message": CHAIN, "business_id": bid})
        session_id = next(e["session_id"] for e in first if e["kind"] == "ready")
        order = next(e["data"] for e in first if e["kind"] == "order")
        dropped = client.post(
            f"/api/v1/businesses/{bid}/orders/{order['id']}/discard",
            json={"version": order["version"]},
        )
        assert dropped.status_code == 200, dropped.text
        after = stream(
            client,
            {"resume": {"card_id": order["id"]}, "business_id": bid, "session_id": session_id},
        )
        assert kinds(after) == ["ready", "plan", "turn_complete"]
        assert plans(after)[0]["stopped"] is True
        saved = client.portal.call(  # type: ignore[union-attr]
            lambda: sessions.get_session(
                app_name="ogoogle_ai", user_id=_uid(sessions), session_id=session_id
            )
        )
        assert saved.state[PLAN_STATE] is None


def test_stop_ends_a_waiting_plan_without_touching_the_card(settings) -> None:  # noqa: F811
    app = create_app(settings, InMemorySessionService())
    with TestClient(app) as client:
        bid = shop(client)
        first = stream(client, {"message": CHAIN, "business_id": bid})
        session_id = next(e["session_id"] for e in first if e["kind"] == "ready")
        order = next(e["data"] for e in first if e["kind"] == "order")
        stopped = stream(
            client,
            {
                "resume": {"card_id": order["id"], "stop": True},
                "business_id": bid,
                "session_id": session_id,
            },
        )
        assert plans(stopped)[0]["stopped"] is True
        latest = client.get(f"/api/v1/businesses/{bid}/orders/{order['id']}").json()
        assert latest["status"] == "draft"


def test_one_request_is_never_a_plan(settings) -> None:  # noqa: F811
    app = create_app(settings, InMemorySessionService())
    with TestClient(app) as client:
        bid = shop(client)
        first = stream(client, {"message": "My flour is running low", "business_id": bid})
        assert "plan" not in kinds(first)


def test_a_resume_turn_needs_its_conversation_and_shop_and_no_message(settings) -> None:  # noqa: F811
    app = create_app(settings, InMemorySessionService())
    with TestClient(app) as client:
        bid = shop(client)
        for body in (
            {"resume": {"card_id": "abc"}, "business_id": bid},
            {
                "resume": {"card_id": "abc"},
                "business_id": bid,
                "session_id": "00000000-0000-4000-8000-000000000000",
                "message": "hi",
            },
            {"message": "   ", "business_id": bid},
        ):
            assert client.post("/api/v1/coach/stream", json=body).status_code == 422


def _uid(sessions: InMemorySessionService) -> str:
    return next(iter(sessions.sessions["ogoogle_ai"]))


@pytest.mark.parametrize(
    ("said", "steps"),
    [
        ("find suppliers, then order 20 kg", ["find suppliers", "order 20 kg"]),
        ("Order 5 kg and then ask them", ["Order 5 kg", "ask them"]),
        ("atta mangao phir unse poocho sunday", ["atta mangao", "unse poocho sunday"]),
        ("दूध मँगाओ फिर ग्राहक को जवाब दो", ["दूध मँगाओ", "ग्राहक को जवाब दो"]),
        # "phir se" and "फिर से" are "again": one step.
        ("phir se order karo", ["phir se order karo"]),
        ("फिर से दूध मँगाओ", ["फिर से दूध मँगाओ"]),
        ("strengthen my authentic menu", ["strengthen my authentic menu"]),
    ],
)
def test_steps_are_split_only_where_the_owner_said_then(said: str, steps: list[str]) -> None:
    assert split_steps(said) == steps


def test_the_instant_path_never_answers_only_the_first_step(settings) -> None:  # noqa: F811
    """Without this, "find suppliers, then order" got the supplier list and lost the order."""
    app = create_app(settings, InMemorySessionService())
    with TestClient(app) as client:
        bid = shop(client)
        first = stream(client, {"message": CHAIN, "business_id": bid})
        assert "plan" in kinds(first)
        single = stream(client, {"message": "find suppliers for flour", "business_id": bid})
        assert "plan" not in kinds(single)


@pytest.mark.parametrize(
    "said",
    [
        "find atta suppliers, then don't order yet",
        "atta ke supplier dhundo, phir order mat karna",
        "आटा सप्लायर ढूँढो फिर ऑर्डर नहीं करना",
    ],
)
def test_a_step_the_owner_said_no_to_is_never_a_step(said: str) -> None:
    steps = split_steps(said)
    assert len(steps) == 1
    assert not many_steps(said)


def test_please_do_it_na_is_still_a_step() -> None:
    assert split_steps("supplier dhundo, phir order karo na") == [
        "supplier dhundo",
        "order karo na",
    ]


def test_no_step_runs_from_a_no_in_the_middle_of_a_chain(settings) -> None:  # noqa: F811
    app = create_app(settings, InMemorySessionService())
    with TestClient(app) as client:
        bid = shop(client)
        said = "My flour is running low, find suppliers, then don't order anything yet"
        events = stream(client, {"message": said, "business_id": bid})
        assert "suppliers" in kinds(events)
        assert "order" not in kinds(events) and "plan" not in kinds(events)
