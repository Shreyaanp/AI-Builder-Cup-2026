"""OB-172 (#531, #527): the coach never dead-ends. A shop-detail request becomes the normal
review card (a location through the same "Find pin" path as the owner's own edit), something no
tool does gets an honest reply and a counted intent, and an unclear ask gets one question."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from structlog.testing import capture_logs

from app.agent import INSTRUCTION, make_agent
from app.coordinator import MerchantContext, current, propose_business
from app.main import create_app
from app.merchant import BusinessFields, MerchantStore, ProposalRequest
from app.settings import Settings
from app.shop_details import clock, report_unsupported_request, update_shop_details
from tests.test_merchant_routes import approve, settings, stream_events  # noqa: F401 - shared fixture
from tests.test_photos import join


@pytest.fixture
def coach(settings: Settings):  # noqa: F811 - the shared settings fixture
    return create_app(settings, InMemorySessionService())


def reply(events: list[dict[str, object]]) -> str:
    return " ".join(str(e.get("text") or "") for e in events if e["kind"] == "reply")


def kinds(events: list[dict[str, object]]) -> set[object]:
    return {e["kind"] for e in events}


def pinned_shop(client: TestClient, *, items: bool) -> str:
    """A saved Singapore shop pinned at Tiong Bahru (the demo geocoder), open 07:00-14:00."""
    prepared = client.post(
        "/api/v1/proposals",
        json={
            "kind": "business",
            "geocode_confirmed": True,
            "business": {
                "name": "Tiong Bahru Kopi",
                "location": "Tiong Bahru, Singapore",
                "hours": "07:00–14:00",
                "currency": "SGD",
            },
            "products": [{"name": "Kopi", "price": 180, "unit": "cup"}] if items else [],
        },
    ).json()
    assert prepared["snapshot"]["business"]["lat"] is not None
    return str(approve(client, prepared)["business_id"])


@pytest.mark.parametrize("items", [False, True])
def test_ob172_change_my_location_prepares_the_place_and_the_pin_is_confirmed(
    coach, items: bool
) -> None:
    """#527: "change my location" did nothing. Now: a location proposal without the old pin,
    the card's Find pin geocodes it, and the clock (and money, while there are no items) follow."""
    with TestClient(coach) as client:
        join(client)
        bid = pinned_shop(client, items=items)
        events = stream_events(
            client, {"message": "change my location to HITEC City, Hyderabad", "business_id": bid}
        )
        proposal = next(e["data"] for e in events if e["kind"] == "proposal")
        assert isinstance(proposal, dict)
        business = proposal["snapshot"]["business"]
        assert business["location"] == "HITEC City, Hyderabad"
        # The old Tiong Bahru pin never travels with the new place.
        assert "lat" not in business and "pin_label" not in business
        assert "Find pin" in reply(events)
        # The review card's Find pin: the owner's consent to look the place up.
        pinned = client.post(
            "/api/v1/proposals",
            json={**proposal["snapshot"], "business_id": bid, "geocode_confirmed": True},
        ).json()
        found = pinned["snapshot"]["business"]
        assert (round(found["lat"], 2), round(found["lng"], 2)) == (17.45, 78.38)
        assert found["timezone"] == "Asia/Kolkata"
        # Saved prices are cents of SGD: a shop with items keeps its money.
        assert found["currency"] == ("SGD" if items else "INR")
        approve(client, pinned)
        saved = next(s for s in client.get("/api/v1/businesses").json() if s["id"] == bid)
        assert saved["fields"]["location"] == "HITEC City, Hyderabad"
        assert round(saved["fields"]["lat"], 2) == 17.45


def test_ob172_we_close_at_9_now_prepares_the_hours(coach) -> None:
    with TestClient(coach) as client:
        join(client)
        bid = pinned_shop(client, items=True)
        events = stream_events(client, {"message": "we close at 9 now", "business_id": bid})
        proposal = next(e["data"] for e in events if e["kind"] == "proposal")
        assert isinstance(proposal, dict)
        week = proposal["snapshot"]["business"]["weekly_hours"]
        assert len(week) == 7
        assert all(day["open"] == "07:00" and day["close"] == "21:00" for day in week)


@pytest.mark.parametrize(
    ("message", "opens", "closes"),
    [
        ("We open 7 to 9 every day", "07:00", "21:00"),
        ("we're open from 8am till 10:30pm", "08:00", "22:30"),
        # Second review of #537: a closing time with minutes and no am/pm was kept as 10:30 in
        # the morning; it is the night, like "we close at 10:30" (22:30).
        ("we open 8 to 10:30", "08:00", "22:30"),
        ("open 7 to 9:30", "07:00", "21:30"),
        ("open 7:30 to 21:00", "07:30", "21:00"),
    ],
)
def test_ob172_the_guide_example_we_open_7_to_9_sets_the_whole_day(
    coach, message: str, opens: str, closes: str
) -> None:
    """Review of #537: app_guide.py tells owners to say "We open 7 to 9 every day"; the offline
    coach took only "open 7" and kept the old 14:00 closing time."""
    with TestClient(coach) as client:
        join(client)
        bid = pinned_shop(client, items=True)
        events = stream_events(client, {"message": message, "business_id": bid})
        proposal = next(e["data"] for e in events if e["kind"] == "proposal")
        assert isinstance(proposal, dict)
        week = proposal["snapshot"]["business"]["weekly_hours"]
        assert len(week) == 7
        assert all(day["open"] == opens and day["close"] == closes for day in week)


@pytest.mark.parametrize(
    ("message", "question"),
    [
        ("we're open 7 days a week", None),
        ("we close at 9 on weekdays and 10 on Sundays", "Opening or closing"),
        ("we open 7 to 9 on weekdays", "Which days"),
    ],
)
def test_ob172_hours_never_become_half_an_action(coach, message: str, question: str | None) -> None:
    """Review of #537: "open 7 days a week" became opening_time 07:00. A day count is not a time,
    and hours the coach can only half read get one question instead of a partial card."""
    with TestClient(coach) as client:
        join(client)
        bid = pinned_shop(client, items=True)
        events = stream_events(client, {"message": message, "business_id": bid})
        assert "proposal" not in kinds(events)
        if question:
            text = reply(events)
            assert question in text and text.count("?") == 1


def test_ob172_post_on_instagram_is_honest_counted_and_invents_nothing(coach) -> None:
    with TestClient(coach) as client:
        join(client)
        bid = pinned_shop(client, items=True)
        with capture_logs() as logs:
            events = stream_events(
                client, {"message": "post this on Instagram", "business_id": bid}
            )
        assert "proposal" not in kinds(events)
        text = reply(events)
        assert "can't" in text and "posted" in text
        action = next(e["data"] for e in events if e["kind"] == "action")
        assert action == {
            "target": "share",
            "label": "Customer page and QR code",
            "business_id": bid,
            "offer": True,
        }
        unmet = [log for log in logs if log["event"] == "coach_unmet_request"]
        assert unmet == [
            {
                "event": "coach_unmet_request",
                "log_level": "info",
                "intent": "social_media_post",
                "screen": "share",
                "has_shop": True,
            }
        ]


@pytest.mark.parametrize(
    ("message", "question"),
    [("change it", "name, hours, location or phone"), ("fix the timing", "Opening or closing")],
)
def test_ob172_an_unclear_ask_gets_one_question_and_no_action(
    coach, message: str, question: str
) -> None:
    with TestClient(coach) as client:
        join(client)
        bid = pinned_shop(client, items=True)
        events = stream_events(client, {"message": message, "business_id": bid})
        assert not kinds(events) & {"proposal", "action"}
        text = reply(events)
        assert question in text and text.count("?") == 1


def test_ob172_the_coach_has_the_tools_and_the_rules() -> None:
    names = {tool.__name__ for tool in make_agent(Settings(_env_file=None, v1_enabled=True)).tools}  # type: ignore[union-attr]
    assert {"update_shop_details", "report_unsupported_request"} <= names
    assert "Never a dead end" in INSTRUCTION
    assert "ONE short question" in INSTRUCTION
    assert 'update_shop_details(field="location"' in INSTRUCTION


@pytest.fixture
def ctx(tmp_path: Path) -> Iterator[MerchantContext]:
    store = MerchantStore(str(tmp_path / "merchant.sqlite3"))
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ram Tea Stall",
                location="Market Road",
                lat=12.97,
                lng=77.64,
                pin_label="Market Road, Bengaluru",
                currency="INR",
                timezone="Asia/Kolkata",
            ),
        ),
    )
    bid = store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    context = MerchantContext(store, "alice", bid, [])
    token = current.set(context)
    try:
        yield context
    finally:
        current.reset(token)


def sealed(ctx: MerchantContext, result: dict) -> dict:
    assert result["status"] == "needs_review", result
    return ctx.proposals[result["proposal_id"]]["snapshot"]["business"]


def test_ob172_a_new_place_never_keeps_the_old_pin(ctx: MerchantContext) -> None:
    """#527 regression: the coach's location edit kept the old shop's coordinates."""
    moved = sealed(ctx, propose_business(name="", location="Indiranagar"))
    assert moved["location"] == "Indiranagar" and "lat" not in moved and "pin_label" not in moved
    # Other edits keep the saved pin.
    kept = sealed(ctx, propose_business(name="", phone="+91 98450 00000"))
    assert kept["lat"] == 12.97 and kept["pin_label"] == "Market Road, Bengaluru"


def test_ob172_update_shop_details_validates_on_the_server(ctx: MerchantContext) -> None:
    result = update_shop_details("location", "HITEC City")
    assert result["pin"] == "confirm_on_map"
    assert update_shop_details("location", "market road")["status"] == "no_change"
    assert update_shop_details("phone", "call me")["status"] == "invalid"
    assert sealed(ctx, update_shop_details("phone", "+91 98450 00000"))["phone"] == (
        "+91 98450 00000"
    )
    # No saved hours: the other end of the day is asked for, never invented.
    assert update_shop_details("closing_time", "21:00")["missing"] == "opening_time"
    assert update_shop_details("name", "")["status"] == "ask_owner"
    assert update_shop_details("name", "x" * 81)["status"] == "invalid"
    ctx.repairs = 0
    assert sealed(ctx, update_shop_details("hours", "7am to 9pm"))["hours"] == "7am to 9pm"


def test_ob172_hours_fields_follow_the_saved_week(ctx: MerchantContext) -> None:
    ctx.store.commit(ctx.uid, *_ids(ctx, update_shop_details("hours", "7am - 9pm")))
    closing = sealed(ctx, update_shop_details("closing_time", "10pm"))
    assert {(d["open"], d["close"]) for d in closing["weekly_hours"]} == {("07:00", "22:00")}
    sundays = sealed(ctx, update_shop_details("closed_days", "Sundays"))
    assert [d["day"] for d in sundays["weekly_hours"] if d["closed"]] == ["sun"]
    assert update_shop_details("closed_days", "sometimes")["status"] == "invalid"
    today = sealed(ctx, update_shop_details("closed_today", "yes"))
    assert today["closed_on"]


def _ids(ctx: MerchantContext, result: dict) -> tuple[str, str]:
    proposal = ctx.proposals[result["proposal_id"]]
    return proposal["id"], proposal["digest"]


@pytest.mark.parametrize(
    ("said", "expected"),
    [
        ("21:00", "21:00"),
        ("9pm", "21:00"),
        ("9:30 p.m.", "21:30"),
        ("12am", "00:00"),
        ("9", None),
        ("25:00", None),
        ("13pm", None),
    ],
)
def test_ob172_times_are_canonical_and_a_bare_hour_is_unclear(said: str, expected: str) -> None:
    assert clock(said) == expected


def test_ob172_unsupported_without_a_screen_offers_nothing(ctx: MerchantContext) -> None:
    with capture_logs() as logs:
        result = report_unsupported_request("accounting_tax")
    assert result["status"] == "unsupported" and "card_id" not in result
    assert logs[0]["intent"] == "accounting_tax" and logs[0]["screen"] == ""
