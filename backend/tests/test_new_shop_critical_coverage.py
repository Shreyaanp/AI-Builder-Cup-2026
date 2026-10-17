"""Focused regressions for the AI shop registration path."""

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.agent import NEW_SHOP_TOPICS, OfflineCoachModel, OFFLINE_HI, ui_language
from app.coordinator import MerchantContext, current
from app.main import create_app
from app.merchant import BusinessFields, MerchantStore, NewShopDraft
from tests.test_discover import settings
from tests.test_photos import join


def events_of(body: str) -> list[dict[str, Any]]:
    return [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]


def test_resume_keeps_prior_turns_and_does_not_ask_for_known_fields_again(tmp_path):
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        join(client)
        first = events_of(
            client.post(
                "/api/v1/coach/stream",
                json={
                    "message": "name: Lakshmi Tea Stall; category: chai",
                    "language": "hi",
                    "new_shop": True,
                },
            ).text
        )
        sid = first[0]["session_id"]
        first_reply = next(e["text"] for e in reversed(first) if e["kind"] == "reply")
        assert "Lakshmi Tea Stall" not in first_reply

        resumed = events_of(
            client.post(
                "/api/v1/coach/stream",
                json={
                    "message": "location: Indiranagar",
                    "language": "hi",
                    "new_shop": True,
                    "session_id": sid,
                },
            ).text
        )
        next_reply = next(e["text"] for e in reversed(resumed) if e["kind"] == "reply")
        assert "Lakshmi Tea Stall" not in next_reply
        assert "chai" not in next_reply.casefold()
        history = client.get(f"/api/v1/conversations/{sid}").json()["messages"]
        owner_turns = [m["text"] for m in history if m.get("role") == "user"]
        assert owner_turns[:2] == [
            "name: Lakshmi Tea Stall; category: chai",
            "location: Indiranagar",
        ]


@pytest.mark.xfail(
    strict=True,
    reason="Shop update currently replaces the owner name when an inferred name is passed; the draft has no field provenance.",
)
def test_owner_name_survives_a_later_menu_or_photo_name_extraction(tmp_path):
    ctx = MerchantContext(
        MerchantStore(str(tmp_path / "shops.sqlite")),
        "owner",
        None,
        [],
        new_shop=True,
        new_shop_draft=NewShopDraft(
            business=BusinessFields(name="Lakshmi Tea Stall", category="chai")
        ),
    )

    from app.new_shop_tools import update_shop

    async def save_extracted_details() -> None:
        token = current.set(ctx)
        try:
            # Represents a later extraction suggestion; the owner never said this name.
            await update_shop(name="Menu Photo Cafe", description="Tea and snacks")
        finally:
            current.reset(token)

    import asyncio

    asyncio.run(save_extracted_details())
    assert ctx.new_shop_draft and ctx.new_shop_draft.business
    assert ctx.new_shop_draft.business.name == "Lakshmi Tea Stall"


@pytest.mark.parametrize(
    "tool_name", ["update_shop", "attach_ready_profile", "show_step"]
)
@pytest.mark.asyncio
async def test_new_shop_tool_result_drives_the_models_next_turn(tmp_path, tool_name):
    ctx = MerchantContext(
        MerchantStore(str(tmp_path / f"{tool_name}.sqlite")),
        "owner",
        None,
        [],
        new_shop=True,
        new_shop_draft=NewShopDraft(
            business=BusinessFields(name="Lakshmi Tea Stall", category="chai")
        ),
        message="name: Lakshmi Tea Stall",
    )
    response = types.Content(
        role="user",
        parts=[
            types.Part(
                function_response=types.FunctionResponse(
                    name=tool_name,
                    response={"status": "saved", "still_missing": ["location"]},
                )
            )
        ],
    )
    owner_message = types.Content(
        role="user", parts=[types.Part(text="name: Lakshmi Tea Stall")]
    )
    token = current.set(ctx)
    language = ui_language.set("hi")
    try:
        replies = [
            item
            async for item in OfflineCoachModel().generate_content_async(
                type("Request", (), {"contents": [owner_message, response]})()
            )
        ]
    finally:
        ui_language.reset(language)
        current.reset(token)
    reply = replies[0].content.parts[0].text
    assert reply and "Offline demo" not in reply
    location_question = next(q for key, q, _ in NEW_SHOP_TOPICS if key == "location")
    assert OFFLINE_HI[location_question] in reply
