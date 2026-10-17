"""Onboarding v2 (owner decisions, 17 Oct): ask only name, what they sell, where, hours and a shop
photo; one sentence can fill many fields; corrections replace silently; saves are idempotent;
the shop goes live by itself once name + kind + place are known; hours and the photo can be
skipped (never invented); "review my shop" never changes anything."""

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.agent import (
    NEW_SHOP_INSTRUCTION,
    NEW_SHOP_TOPICS,
    make_agent,
    turn_instruction,
    ui_language,
)
from app.coordinator import MerchantContext, current
from app.main import create_app
from app.merchant import BusinessFields, MerchantStore, NewShopDraft
from app.new_shop_tools import go_live, show_step, update_shop
from tests.test_discover import settings
from tests.test_photos import join

ORIGIN = {"origin": "http://127.0.0.1:3200"}


def topic_of(reply: str) -> str | None:
    return next((key for key, question, _ in NEW_SHOP_TOPICS if question in reply), None)


def context(tmp_path: Path, draft: NewShopDraft | None = None) -> MerchantContext:
    return MerchantContext(
        MerchantStore(str(tmp_path / "shops.sqlite")),
        "alice",
        None,
        [],
        new_shop=True,
        new_shop_draft=draft,
    )


def run(ctx: MerchantContext, **args: Any) -> dict[str, Any]:
    async def call() -> dict[str, Any]:
        token = current.set(ctx)
        try:
            return await update_shop(**args)
        finally:
            current.reset(token)

    return asyncio.run(call())


def test_one_sentence_fills_name_kind_and_place_and_the_shop_goes_live(tmp_path: Path) -> None:
    """ "Lakshmi Tea Stall, chai aur samosa, Indiranagar metro ke paas": all three at once, and
    the shop is live for customers right away (no review step), without a menu."""
    ctx = context(tmp_path)
    result = run(
        ctx,
        name="Lakshmi Tea Stall",
        category="chai aur samosa",
        location="Indiranagar metro ke paas",
    )
    assert result["status"] == "saved" and result["went_live"] is True
    assert result["still_missing"][0].startswith("opening hours")
    assert len(result["still_missing"]) == 2  # hours and the photo
    assert ctx.new_shop_draft and ctx.new_shop_draft.live_id
    bid = ctx.new_shop_draft.live_id
    shops = ctx.store.list_businesses("alice")
    assert [shop["id"] for shop in shops] == [bid]
    saved = ctx.store.context("alice", bid)
    assert saved["business"]["fields"]["name"] == "Lakshmi Tea Stall"
    assert saved["business"]["fields"]["hours"] == ""  # never invented
    assert ctx.store.inventory("alice", bid) == []  # no menu in onboarding
    assert ctx.store.public_shop(bid) is not None  # live for customers


def test_saving_is_idempotent_and_a_replay_never_opens_a_second_shop(tmp_path: Path) -> None:
    ctx = context(tmp_path)
    first = run(ctx, name="Lakshmi Tea Stall", category="Tea stall", location="Indiranagar")
    again = run(ctx, name="Lakshmi Tea Stall", category="Tea stall", location="Indiranagar")
    assert first["went_live"] is True and "went_live" not in again
    assert again["proposal_id"] == first["proposal_id"]  # nothing new was sealed
    nothing = run(ctx)
    assert nothing["note"] == "Nothing new to record."
    # A new socket (the draft came back from the conversation) replays the same answer.
    resumed = context(tmp_path, ctx.new_shop_draft)
    run(resumed, name="Lakshmi Tea Stall", category="Tea stall", location="Indiranagar")
    assert go_live(resumed) is False
    assert len(ctx.store.list_businesses("alice")) == 1


def test_a_correction_replaces_the_field_silently_even_on_the_live_shop(tmp_path: Path) -> None:
    ctx = context(tmp_path)
    run(ctx, name="Lakshmi Tea Stall", category="Tea stall", location="Indiranagar")
    corrected = run(ctx, name="Lakshmi Chai Point")
    assert corrected["status"] == "saved"
    assert ctx.new_shop_draft and ctx.new_shop_draft.business
    assert ctx.new_shop_draft.business.name == "Lakshmi Chai Point"
    assert ctx.new_shop_draft.business.category == "Tea stall"  # the rest stays
    bid = ctx.new_shop_draft.live_id
    assert bid
    live = ctx.store.context("alice", bid)["business"]["fields"]
    assert live["name"] == "Lakshmi Chai Point"
    # Hours said after the shop went live reach it at once (per day).
    run(
        ctx,
        hours="subah 6 se raat 10, Sunday band",
        weekly_hours=[
            *[{"day": day, "open": "06:00", "close": "22:00"} for day in ("mon", "tue", "wed")],
            *[{"day": day, "open": "06:00", "close": "22:00"} for day in ("thu", "fri", "sat")],
            {"day": "sun", "closed": True},
        ],
    )
    live = ctx.store.context("alice", bid)["business"]["fields"]
    assert live["hours"] == "subah 6 se raat 10, Sunday band"
    assert {day["day"]: day.get("closed") for day in live["weekly_hours"]}["sun"] is True
    assert len(ctx.store.list_businesses("alice")) == 1


def test_hours_and_photo_can_be_skipped_and_are_never_invented(tmp_path: Path) -> None:
    ctx = context(tmp_path)
    run(ctx, name="Raju Kirana", category="kirana store", location="Lajpat Nagar")
    result = run(ctx, skip=["hours"])
    assert result["still_missing"] == [result["still_missing"][0]]
    assert result["still_missing"][0].startswith("a photo of the shop")
    done = run(ctx, skip=["photo", "photo"])
    assert done["still_missing"] == [] and "face check" in done["next"]
    assert ctx.new_shop_draft and ctx.new_shop_draft.skipped == ["hours", "photo"]
    assert any("hours: skipped" in item for item in done["known_never_ask_again"])
    bid = ctx.new_shop_draft.live_id
    assert bid and ctx.store.context("alice", bid)["business"]["fields"]["hours"] == ""


def test_name_kind_alone_never_go_live(tmp_path: Path) -> None:
    ctx = context(tmp_path)
    result = run(ctx, name="Lakshmi Tea Stall", category="Tea stall")
    assert "went_live" not in result and ctx.store.list_businesses("alice") == []
    assert result["still_missing"][0].startswith("where the shop is")
    # The app's GPS pin completes it (the place is a pin, not words).
    assert ctx.new_shop_draft and ctx.new_shop_draft.business
    ctx.new_shop_draft = ctx.new_shop_draft.model_copy(
        update={
            "business": ctx.new_shop_draft.business.model_copy(
                update={"lat": 12.9784, "lng": 77.6408}
            )
        }
    )
    assert go_live(ctx) is True
    assert len(ctx.store.list_businesses("alice")) == 1


def test_review_my_shop_opens_at_once_and_changes_nothing(tmp_path: Path) -> None:
    draft = NewShopDraft(business=BusinessFields(name="Lakshmi Tea Stall", category="Tea"))
    ctx = context(tmp_path, draft)
    token = current.set(ctx)
    try:
        opened = show_step("review")
        bad = show_step("menu")  # type: ignore[arg-type]
    finally:
        current.reset(token)
    assert opened["status"] == "opened"
    assert ctx.cards[opened["card_id"]] == ("action", {"target": "new_shop_step", "step": "review"})
    assert bad["status"] == "invalid"
    assert ctx.new_shop_draft == draft and ctx.store.list_businesses("alice") == []


def test_the_instruction_never_asks_the_menu_and_tracks_progress_every_turn(
    tmp_path: Path,
) -> None:
    assert "NO menu" in NEW_SHOP_INSTRUCTION and "update_shop" in NEW_SHOP_INSTRUCTION
    assert "Fill silently" in NEW_SHOP_INSTRUCTION
    # Live eval (17 Oct): "do you sell flowers?" after "phool bechte hain"; "kya aap … dukan
    # par hain?" (romanized); "are you at your shop?" to a plumber who visits homes.
    assert "Never ask a question whose answer the owner already gave" in NEW_SHOP_INSTRUCTION
    assert 'never say "shop"' in NEW_SHOP_INSTRUCTION
    ctx = context(
        tmp_path,
        NewShopDraft(business=BusinessFields(name="Lakshmi Tea Stall", category="chai")),
    )
    token = current.set(ctx)
    language = ui_language.set("hi")
    try:
        text = turn_instruction()
    finally:
        ui_language.reset(language)
        current.reset(token)
    assert 'name "Lakshmi Tea Stall"' in text and "where the shop is" in text
    assert "Reply COMPLETELY in Hindi" in text and "Hinglish" in text
    agent = make_agent(settings(tmp_path))
    tools = {getattr(tool, "__name__", "") for tool in agent.tools}
    assert {"update_shop", "show_step"} <= tools


def events_of(response_text: str) -> list[dict[str, Any]]:
    return [
        json.loads(line[6:]) for line in response_text.splitlines() if line.startswith("data: ")
    ]


def test_hindi_onboarding_offline_end_to_end_never_repeats_and_never_asks_the_menu(
    tmp_path: Path,
) -> None:
    """The whole flow by text in Hindi: one message fills three fields and the shop goes live,
    then hours ("pata nahi" skips), photo ("baad mein" skips), the face check, done. No question
    is asked twice and none is about the menu, payment or delivery."""
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        sid = None
        draft: dict[str, Any] = {"business": None, "products": []}
        asked: list[str] = []
        live_after: int | None = None
        messages = [
            "नमस्ते",
            "name: Lakshmi Tea Stall; category: chai aur samosa; location: Indiranagar metro",
            "pata nahi",
            "baad mein",
            "nahi, skip",
        ]
        for index, message in enumerate(messages):
            response = client.post(
                "/api/v1/coach/stream",
                json={
                    "message": message,
                    "language": "hi",
                    "new_shop": True,
                    "session_id": sid,
                    "new_shop_draft": draft,
                },
            )
            events = events_of(response.text)
            sid = events[0]["session_id"]
            for event in events:
                if event["kind"] == "draft":
                    draft = event["data"]
            reply = next(e["text"] for e in reversed(events) if e["kind"] == "reply")
            question = reply.split(". ")[-1]
            assert question not in asked, f"repeated: {question}"
            asked.append(question)
            if draft.get("live_id") and live_after is None:
                live_after = index
        assert live_after == 1
        assert not any(
            word in " ".join(asked).casefold() for word in ("menu", "pay", "delivery", "halal")
        )
        # No fixed order after the core: hours and the photo come in this conversation's own
        # order, each once, then the face check.
        assert {topic_of(asked[1]), topic_of(asked[2])} == {"hours", "photo"}
        assert "face check" in asked[3]
        assert sorted(draft["skipped"]) == ["hours", "photo"]
        shops = client.get("/api/v1/businesses").json()
        assert len(shops) == 1 and shops[0]["id"] == draft["live_id"]


def test_voice_resume_after_a_drop_is_silent_and_continues_the_conversation(
    tmp_path: Path,
) -> None:
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        with client.websocket_connect("/api/v1/voice?new_shop=true&lang=hi", headers=ORIGIN) as ws:
            ws.send_json({"kind": "new_shop", "draft": None})
            first = ws.receive_json()
            assert "data" not in first  # a new conversation: the coach greets
            sid = first["session_id"]
            ws.send_json({"kind": "text", "text": "name: Lakshmi Tea Stall; category: chai"})
            while ws.receive_json()["kind"] != "turn_complete":
                pass
        # The socket dropped (no close frame): the next one takes over and continues silently.
        with client.websocket_connect(
            f"/api/v1/voice?new_shop=true&lang=hi&session_id={sid}", headers=ORIGIN
        ) as ws:
            ws.send_json({"kind": "new_shop", "draft": None})
            ready = ws.receive_json()
            assert ready["session_id"] == sid and ready["data"] == {"continues": True}
            # The saved draft comes back to the app (it sent none).
            restored = ws.receive_json()
            assert restored["kind"] == "draft"
            assert restored["data"]["business"]["name"] == "Lakshmi Tea Stall"
            # The app's GPS pin completes name + kind + place: live at once.
            pinned = {
                **restored["data"],
                "business": {**restored["data"]["business"], "lat": 12.97, "lng": 77.64},
            }
            ws.send_json({"kind": "new_shop", "draft": pinned})
            live = ws.receive_json()
            assert live["kind"] == "draft" and live["data"]["live_id"]
            ws.send_json({"kind": "close"})
        assert len(client.get("/api/v1/businesses").json()) == 1


def test_tools_tell_the_voice_model_never_to_repeat_its_question(tmp_path: Path) -> None:
    """Live check (17 Oct): "क्या आप दुकान की फोटो खींच सकते हैं?", show_step camera, then
    "आप दुकान की फोटो खींच सकते हैं?" again."""
    from app.new_shop_tools import NO_REPEAT, show_step

    ctx = context(tmp_path)
    token = current.set(ctx)
    try:
        opened = show_step("camera")
    finally:
        current.reset(token)
    assert NO_REPEAT in opened["instruction"] and "never repeat" in NO_REPEAT
    assert "call update_shop / show_step FIRST" in NEW_SHOP_INSTRUCTION
