"""A busy Gemini text model (429/503) is retried with backoff, then handed to the fallback model."""

from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import pytest
from google.adk.models.google_llm import Gemini
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import errors, types
from structlog.testing import capture_logs

from app import text_model
from app.settings import Settings
from app.text_model import SteadyGemini, Tries, generate, generate_stream


def busy(code: int = 503) -> errors.APIError:
    kind = errors.ServerError if code >= 500 else errors.ClientError
    return kind(code, {"error": {"code": code, "message": "busy", "status": "UNAVAILABLE"}})


@pytest.fixture(autouse=True)
def quick(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(text_model, "BASE_DELAY_SECONDS", 0.001)


def settings(fallback: str = "lite") -> Settings:
    return Settings(
        app_env="test",
        _env_file=None,
        google_text_model="main",
        google_text_fallback_model=fallback,
    )


class Models:
    """Stands in for `client.aio.models`: each model answers from its own script."""

    def __init__(self, script: dict[str, list[Any]]) -> None:
        self.script = script
        self.calls: list[str] = []

    def next(self, model: str) -> Any:
        self.calls.append(model)
        step = self.script[model].pop(0)
        if isinstance(step, BaseException):
            raise step
        return step

    async def generate_content(self, model: str, **request: Any) -> Any:
        return self.next(model)

    async def generate_content_stream(self, model: str, **request: Any) -> AsyncIterator[str]:
        chunks = self.next(model)

        async def stream() -> AsyncIterator[str]:
            for chunk in chunks:
                if isinstance(chunk, BaseException):
                    raise chunk
                yield chunk

        return stream()


class Client:
    def __init__(self, script: dict[str, list[Any]]) -> None:
        self.models = Models(script)
        self.aio = self


@pytest.mark.asyncio
async def test_busy_model_is_retried_with_backoff_then_answers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    waits: list[float] = []

    async def sleep(seconds: float) -> None:
        waits.append(seconds)

    monkeypatch.setattr(text_model, "BASE_DELAY_SECONDS", 0.5)
    monkeypatch.setattr(text_model, "asyncio", SimpleNamespace(sleep=sleep))
    monkeypatch.setattr(text_model.random, "random", lambda: 1.0)
    client = Client({"main": [busy(503), busy(429), "answer"]})
    with capture_logs() as logs:
        assert await generate(client, settings(), "search", contents="q") == "answer"
    assert client.models.calls == ["main", "main", "main"]
    retries = [entry for entry in logs if entry["event"] == "gemini_text_retry"]
    assert [(r["attempt"], r["status"], r["flow"]) for r in retries] == [
        (1, 503, "search"),
        (2, 429, "search"),
    ]
    # Exponential (0.5 s, then 1 s) plus up to half again of jitter; well under six seconds.
    assert waits == [0.75, 1.5]


@pytest.mark.asyncio
async def test_still_busy_after_three_tries_goes_to_the_fallback_model() -> None:
    client = Client({"main": [busy(), busy(), busy()], "lite": ["light answer"]})
    with capture_logs() as logs:
        assert await generate(client, settings(), "close_day") == "light answer"
    assert client.models.calls == ["main", "main", "main", "lite"]
    fallback = [entry for entry in logs if entry["event"] == "gemini_text_fallback"]
    assert fallback == [
        {
            "event": "gemini_text_fallback",
            "log_level": "warning",
            "flow": "close_day",
            "model": "main",
            "fallback": "lite",
            "attempts": 3,
            "status": 503,
        }
    ]


@pytest.mark.asyncio
async def test_a_busy_fallback_and_no_fallback_both_give_up_with_the_error() -> None:
    client = Client({"main": [busy()] * 3, "lite": [busy(429)]})
    with capture_logs() as logs, pytest.raises(errors.ClientError):
        await generate(client, settings(), "search")
    assert client.models.calls == ["main"] * 3 + ["lite"]
    assert logs[-1]["event"] == "gemini_text_busy"

    client = Client({"main": [busy()] * 3})
    with pytest.raises(errors.ServerError):
        await generate(client, settings(fallback=""), "search")
    assert client.models.calls == ["main"] * 3


@pytest.mark.asyncio
async def test_other_errors_are_not_retried() -> None:
    bad = errors.ClientError(400, {"error": {"code": 400, "message": "bad", "status": "INVALID"}})
    client = Client({"main": [bad]})
    with pytest.raises(errors.ClientError):
        await generate(client, settings(), "search")
    assert client.models.calls == ["main"]


@pytest.mark.asyncio
async def test_retries_stay_inside_the_time_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    plan = Tries("search", "main", "lite")
    # Five seconds already gone: one more wait would pass six, so the fallback comes at once.
    plan.started -= 5.9
    monkeypatch.setattr(text_model, "BASE_DELAY_SECONDS", 0.5)
    assert await plan.again(busy())
    assert (plan.model, plan.attempt) == ("lite", 1)


@pytest.mark.asyncio
async def test_stream_retries_its_opening_never_half_way() -> None:
    client = Client({"main": [busy(), ["a", "b"]]})
    assert [c async for c in generate_stream(client, settings(), "search")] == ["a", "b"]
    assert client.models.calls == ["main", "main"]

    client = Client({"main": [["a", busy()]]})
    seen: list[str] = []
    with pytest.raises(errors.ServerError):
        async for chunk in generate_stream(client, settings(), "search"):
            seen.append(chunk)
    assert seen == ["a"]
    assert client.models.calls == ["main"]


def reply(text: str) -> LlmResponse:
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=text)]))


@pytest.mark.asyncio
async def test_chat_model_falls_back_and_never_repeats_a_started_reply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    script: dict[str, list[Any]] = {}
    calls: list[str] = []

    async def fake(self: Gemini, llm_request: LlmRequest, stream: bool = False):
        calls.append(llm_request.model or "")
        for step in script[llm_request.model or ""].pop(0):
            if isinstance(step, BaseException):
                raise step
            yield reply(step)

    monkeypatch.setattr(Gemini, "generate_content_async", fake)
    model = SteadyGemini(model="main", fallback_model="lite")

    script.update(main=[[busy(429)], [busy(503)], [busy(503)]], lite=[["from lite"]])
    with capture_logs() as logs:
        out = [r async for r in model.generate_content_async(LlmRequest(model="main"), True)]
    assert [r.content.parts[0].text for r in out if r.content and r.content.parts] == ["from lite"]
    assert calls == ["main", "main", "main", "lite"]
    assert [entry["event"] for entry in logs] == [
        "gemini_text_retry",
        "gemini_text_retry",
        "gemini_text_fallback",
    ]
    assert {entry["flow"] for entry in logs} == {"chat"}

    # Half a reply already went out: the error is raised, not answered again.
    calls.clear()
    script.update(main=[["partial", busy(503)]])
    with pytest.raises(errors.ServerError):
        async for _ in model.generate_content_async(LlmRequest(model="main"), True):
            pass
    assert calls == ["main"]


def test_coach_agent_uses_the_steady_model() -> None:
    from app.agent import make_agent

    agent = make_agent(
        Settings(
            app_env="test",
            _env_file=None,
            coach_mode="gemini",
            gemini_backend="api_key",
            google_api_key="key",
            google_text_model="main",
            google_live_model="live",
            google_text_fallback_model="lite",
        )
    )
    assert isinstance(agent.model, SteadyGemini)
    assert agent.model.fallback_model == "lite"


@pytest.mark.asyncio
async def test_steady_model_pins_the_selected_reply_language(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.agent import ui_language

    seen: list[str | None] = []

    async def fake(self: Gemini, llm_request: LlmRequest, stream: bool = False):
        seen.append(llm_request.config.system_instruction)
        yield reply("नमस्ते")

    monkeypatch.setattr(Gemini, "generate_content_async", fake)
    token = ui_language.set("hi")
    try:
        model = SteadyGemini(model="main")
        output = [
            response
            async for response in model.generate_content_async(LlmRequest(model="main"), True)
        ]
    finally:
        ui_language.reset(token)

    assert output
    assert seen[0] is not None
    assert "Reply language: Always speak and write in Hindi (hi-IN)" in seen[0]
    assert "Devanagari script" in seen[0]
