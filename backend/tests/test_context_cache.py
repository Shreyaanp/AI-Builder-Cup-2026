"""Gemini context caching for the text coach: the same turns, cache on or off, make the same
tool calls and cards; only the request's shape changes. A scripted Vertex stand-in answers."""

import json
import re
from pathlib import Path
from typing import Any

import pytest
from google.adk.models.google_llm import Gemini
from google.adk.sessions import InMemorySessionService
from google.genai import errors, types

from app.agent import INSTRUCTION, NEW_SHOP_INSTRUCTION, LiveGemini, make_agent
from app.auth import Principal
from app.context_cache import (
    TURN_LABEL,
    CachedGemini,
    min_tokens,
    split_instruction,
    uses_gemini_context_cache,
)
from app.coordinator import MerchantContext, current
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.settings import Settings
from app.streaming import CoachRuntime


def gemini_settings(**changes: object) -> Settings:
    values: dict[str, object] = {
        "coach_mode": "gemini",
        "gemini_backend": "vertex",
        "google_cloud_project": "demo-project",
        "google_text_model": "gemini-3.5-flash",
        "google_live_model": "gemini-3.8-live",
        "v1_enabled": True,
        "instant_path_enabled": False,
        **changes,
    }
    return Settings(_env_file=None, **values)  # type: ignore[call-arg, arg-type]


class FakeVertex:
    """Answers like the coach model: a tool call for the owner's request, then a short reply."""

    def __init__(self, *, create_fails: bool = False, cached_call_fails: bool = False) -> None:
        self.requests: list[types.GenerateContentConfig] = []
        self.contents: list[list[types.Content]] = []
        self.created: list[types.CreateCachedContentConfig] = []
        self.create_fails = create_fails
        self.cached_call_fails = cached_call_fails
        self.aio = self
        self.models = self
        self.caches = self
        self.vertexai = True

    async def create(self, *, model: str, config: types.CreateCachedContentConfig) -> Any:
        if self.create_fails:
            raise errors.ClientError(400, {"error": {"message": "too small"}})
        self.created.append(config)
        return types.CachedContent(
            name=f"projects/p/locations/global/cachedContents/{len(self.created)}"
        )

    async def generate_content_stream(
        self, *, model: str, contents: list[types.Content], config: types.GenerateContentConfig
    ) -> Any:
        if config.cached_content and self.cached_call_fails:
            raise errors.ClientError(404, {"error": {"message": "cache not found"}})
        self.requests.append(config)
        self.contents.append(list(contents))
        last = contents[-1]
        answered = any(part.function_response for part in last.parts or [])
        text = " ".join(part.text or "" for part in last.parts or [])
        if answered:
            part = types.Part(text="Done. It is open for you.")
        elif "share" in text.casefold():
            part = types.Part(
                function_call=types.FunctionCall(name="open_screen", args={"screen": "share"})
            )
        else:
            part = types.Part(text="Happy to help.")
        usage = types.GenerateContentResponseUsageMetadata(
            prompt_token_count=9000,
            cached_content_token_count=8000 if config.cached_content else 0,
            candidates_token_count=10,
        )

        async def stream() -> Any:
            yield types.GenerateContentResponse(
                candidates=[
                    types.Candidate(
                        content=types.Content(role="model", parts=[part]),
                        finish_reason=types.FinishReason.STOP,
                    )
                ],
                usage_metadata=usage,
            )

        return stream()


def seed(store: MerchantStore, uid: str) -> str:
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ah Ming Kopi",
                category="Kopitiam",
                location="Tiong Bahru, Singapore",
                hours="7am-9pm",
            ),
            products=[ProductFields(name="Kopi", price=180, unit="cup")],
        ),
    )
    return str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])


async def conversation(
    tmp_path: Path, settings: Settings, fake: FakeVertex, turns: list[str]
) -> list[list[tuple[str, Any]]]:
    store = MerchantStore(str(tmp_path / f"{id(fake)}.sqlite3"))
    uid = "cache-owner"
    bid = seed(store, uid)
    runtime = CoachRuntime(settings, InMemorySessionService())
    model = runtime.text_runner.agent.model
    assert isinstance(model, Gemini)
    object.__setattr__(model, "client", fake)
    principal = Principal(uid=uid, source="local")
    sid = await runtime.session(principal, None, bid)
    seen: list[list[tuple[str, Any]]] = []
    for text in turns:
        token = current.set(MerchantContext(store, uid, bid, []))
        try:
            events = [
                (event.kind, event.data if event.kind != "action" else event.data.get("target"))
                async for event in runtime.text_events(principal, sid, text, "en")
                if event.kind not in {"delta", "turn_complete"}
            ]
        finally:
            current.reset(token)
        seen.append(events)
    return seen


def calls(fake: FakeVertex) -> list[list[str]]:
    return [
        [
            f"{part.function_call.name}:{json.dumps(part.function_call.args, sort_keys=True)}"
            for content in contents
            for part in content.parts or []
            if part.function_call
        ]
        for contents in fake.contents
    ]


def same_conversation(a: list[types.Content], b: list[types.Content]) -> bool:
    # Card ids are random per run; everything else must match exactly.
    def text(contents: list[types.Content]) -> str:
        dumped = json.dumps([c.model_dump(mode="json", exclude_none=True) for c in contents])
        return re.sub(r'"card_id": "[0-9a-f]+"', '"card_id": ""', dumped)

    return text(a) == text(b)


TURNS = ["Share my page", "Thanks, what else can you do?", "Share my page again"]


async def test_cache_on_and_off_make_the_same_tool_calls_and_cards(tmp_path: Path) -> None:
    off, on = FakeVertex(), FakeVertex()
    plain = await conversation(tmp_path, gemini_settings(), off, TURNS)
    cached = await conversation(tmp_path, gemini_settings(gemini_context_cache=True), on, TURNS)
    assert plain == cached
    assert calls(off) == calls(on)
    assert any(kind == "action" for turn in plain for kind, _ in turn)
    # Off: the old request, untouched. On: the first call goes out as before while the cache
    # is made in the background; every later call reuses that one shared cache.
    assert all(r.system_instruction and r.tools and not r.cached_content for r in off.requests)
    assert len(on.created) == 1
    assert on.requests[0].system_instruction and not on.requests[0].cached_content
    assert all(
        r.cached_content == "projects/p/locations/global/cachedContents/1"
        and r.system_instruction is None
        and r.tools is None
        for r in on.requests[1:]
    )
    assert len(off.requests) == len(on.requests) == 5  # 2 + 1 + 2 model calls


async def test_the_model_sees_the_same_instruction_and_tools(tmp_path: Path) -> None:
    off, on = FakeVertex(), FakeVertex()
    await conversation(tmp_path, gemini_settings(), off, TURNS[:1])
    await conversation(tmp_path, gemini_settings(gemini_context_cache=True), on, TURNS[:1])
    cache = on.created[0]
    assert cache.system_instruction == INSTRUCTION
    assert cache.tools == off.requests[0].tools
    assert cache.ttl == "3600s"
    # The second call (after the tool ran) uses the cache. This turn's part (language, region,
    # shop snapshot) leads the conversation instead of trailing the system instruction.
    assert on.requests[1].cached_content and not off.requests[1].cached_content
    turn = on.contents[1][0].parts[0].text or ""  # type: ignore[index]
    assert turn.startswith(TURN_LABEL)
    dynamic = turn.removeprefix(TURN_LABEL)
    assert "Ah Ming Kopi" in dynamic
    assert off.requests[1].system_instruction == f"{INSTRUCTION}\n{dynamic}"
    assert same_conversation(on.contents[1][1:], off.contents[1])


async def test_any_cache_error_sends_the_ordinary_request(tmp_path: Path) -> None:
    expected = await conversation(tmp_path, gemini_settings(), FakeVertex(), TURNS)
    for fake in (FakeVertex(create_fails=True), FakeVertex(cached_call_fails=True)):
        seen = await conversation(tmp_path, gemini_settings(gemini_context_cache=True), fake, TURNS)
        assert seen == expected
        assert all(r.system_instruction and not r.cached_content for r in fake.requests)
        # A cache Vertex refuses is not recreated (and paid for) on every turn.
        assert len(fake.created) <= 1
    # A failed create is not retried on every call.
    failing = FakeVertex(create_fails=True)
    attempts: list[int] = []
    original = failing.create

    async def counted(**kwargs: Any) -> Any:
        attempts.append(1)
        return await original(**kwargs)

    failing.create = counted  # type: ignore[method-assign]
    await conversation(tmp_path, gemini_settings(gemini_context_cache=True), failing, TURNS)
    assert len(attempts) == 1


def test_new_shop_rules_join_the_cached_prefix() -> None:
    text = (
        f"{INSTRUCTION}\nReply in English.{NEW_SHOP_INSTRUCTION}\nUnverified new shop draft: {{}}"
    )
    stable, dynamic = split_instruction(text, [INSTRUCTION, NEW_SHOP_INSTRUCTION])  # type: ignore[misc]
    assert stable == f"{INSTRUCTION}\n\n{NEW_SHOP_INSTRUCTION}"
    assert dynamic == "Reply in English.\nUnverified new shop draft: {}"
    assert split_instruction("Some other prompt", [INSTRUCTION]) is None


@pytest.mark.parametrize(
    ("changes", "expected"),
    [
        ({}, False),
        ({"gemini_context_cache": True}, True),
        ({"gemini_context_cache": True, "gemini_backend": "api_key", "google_api_key": "k"}, False),
    ],
)
def test_switch_is_off_by_default_and_vertex_only(changes: dict[str, Any], expected: bool) -> None:
    assert not Settings(_env_file=None).gemini_context_cache  # type: ignore[call-arg]
    settings = gemini_settings(**changes)
    assert uses_gemini_context_cache(settings) is expected
    text = make_agent(settings).model
    assert isinstance(text, CachedGemini) is expected
    # Live voice never uses it.
    assert type(make_agent(settings, live=True).model) is LiveGemini


def test_cache_key_changes_with_any_prompt_or_tool_change() -> None:
    model = make_agent(gemini_settings(gemini_context_cache=True)).model
    assert isinstance(model, CachedGemini)
    tool = types.Tool(function_declarations=[types.FunctionDeclaration(name="a")])
    other = types.Tool(function_declarations=[types.FunctionDeclaration(name="b")])
    key = model.cache_key("gemini-3.5-flash", INSTRUCTION, [tool], None)
    assert key == model.cache_key("gemini-3.5-flash", INSTRUCTION, [tool], None)
    assert key != model.cache_key("gemini-3.5-flash", INSTRUCTION + ".", [tool], None)
    assert key != model.cache_key("gemini-3.5-flash", INSTRUCTION, [other], None)
    assert key != model.cache_key("gemini-2.5-flash", INSTRUCTION, [tool], None)
    assert min_tokens("gemini-3.5-flash") == 4096 and min_tokens("gemini-2.5-flash") == 2048
