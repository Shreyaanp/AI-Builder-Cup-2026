"""A-17: the first shop-chat question of a session must not fail on a cold path."""

import asyncio
import time
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.customer import Answer, CustomerAnswers, Question
from app.settings import Settings

SHOP = {
    "id": "public-id",
    "name": "Kopi",
    "category": "Cafe",
    "location": "Indiranagar",
    "hours": "8am to 9pm",
    "phone": "",
    "products": [],
}


def settings() -> Settings:
    return Settings(
        app_env="test",
        coach_mode="gemini",
        google_cloud_project="demo-ogoogle-local",
        google_text_model="text-fixture",
        google_live_model="live-fixture",
        _env_file=None,
    )


class Busy(Exception):
    code = 503


def fake(generate: Any) -> SimpleNamespace:
    return SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate), aclose=AsyncMock()),
        close=lambda: None,
    )


@pytest.mark.asyncio
async def test_a17_busy_model_on_the_first_question_is_tried_again() -> None:
    service = CustomerAnswers(settings())
    generate = AsyncMock(
        side_effect=[Busy("overloaded"), SimpleNamespace(parsed=Answer(answer="8am to 9pm"))]
    )
    service.client = fake(generate)
    answer = await service.answer(SHOP, Question(question="What are your hours?"))
    assert answer.answer == "8am to 9pm"
    assert generate.await_count == 2


@pytest.mark.asyncio
async def test_a17_client_is_built_off_the_event_loop_and_warmed_at_startup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import google.genai

    built: list[float] = []

    def slow_client(**_: Any) -> SimpleNamespace:
        # Credential lookup on a new instance blocks for a while.
        time.sleep(0.3)
        built.append(time.monotonic())
        return fake(AsyncMock(return_value=SimpleNamespace(parsed=Answer(answer="Open"))))

    monkeypatch.setattr(google.genai, "Client", slow_client)
    service = CustomerAnswers(settings())
    ticks = 0

    async def ticker() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    task = asyncio.create_task(ticker())
    try:
        await service.warm()
    finally:
        task.cancel()
    # The event loop kept serving other requests while the client was built.
    assert ticks >= 10
    assert service.client is not None and len(built) == 1
    # The first customer question reuses the warm client instead of building one.
    answer = await service.answer(SHOP, Question(question="Hours?"))
    assert answer.answer == "Open"
    assert len(built) == 1
