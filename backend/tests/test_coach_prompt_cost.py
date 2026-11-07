"""Coach prompt cost (OB-180, #540): schema titles are not sent, the prompt stays inside its token
budget, the optional lite model is used only when set, and cache decisions are counted."""

import json
from typing import Any

from google.adk.models.llm_request import LlmRequest
from google.adk.tools.function_tool import FunctionTool
from google.genai import types

from app.agent import INSTRUCTION, NEW_SHOP_INSTRUCTION, lean_tools, make_agent, strip_titles
from app.context_cache import CachedGemini
from app.settings import Settings
from app.text_model import tries


def test_strip_titles_removes_generated_labels_but_keeps_a_property_called_title() -> None:
    schema: dict[str, Any] = {
        "title": "Params",
        "type": "object",
        "$defs": {"Day": {"title": "Day", "type": "object", "properties": {"x": {"title": "X"}}}},
        "properties": {
            "title": {"title": "Title", "type": "string"},
            "weekly_hours": {"title": "Weekly Hours", "items": {"$ref": "#/$defs/Day"}},
        },
    }
    strip_titles(schema)
    assert schema == {
        "type": "object",
        "$defs": {"Day": {"type": "object", "properties": {"x": {}}}},
        "properties": {
            "title": {"type": "string"},
            "weekly_hours": {"items": {"$ref": "#/$defs/Day"}},
        },
    }


def test_lean_tools_strips_every_declaration_of_the_request() -> None:
    def sample(name: str) -> dict[str, Any]:
        """Sample."""
        return {}

    declaration = FunctionTool(sample)._get_declaration()  # noqa: SLF001
    assert declaration is not None and '"title"' in json.dumps(declaration.parameters_json_schema)
    request = LlmRequest(
        config=types.GenerateContentConfig(tools=[types.Tool(function_declarations=[declaration])])
    )
    lean_tools(None, request)
    assert '"title"' not in json.dumps(declaration.parameters_json_schema)


def test_the_coach_prompt_stays_inside_its_budget() -> None:
    # Measured with scripts/coach_prompt_size.py (4 characters per token). Raise these only on
    # purpose: every character is paid for on each coach turn (or cached input when it is cached).
    agent = make_agent(Settings(_env_file=None, v1_enabled=True))  # type: ignore[call-arg]
    declarations = []
    for tool in agent.tools:
        declaration = FunctionTool(tool)._get_declaration()  # type: ignore[arg-type]  # noqa: SLF001
        assert declaration is not None
        strip_titles(declaration.parameters_json_schema)
        declarations.append(declaration.model_dump(mode="json", exclude_none=True))
    tool_chars = len(json.dumps(declarations, ensure_ascii=False, separators=(",", ":")))
    assert len(INSTRUCTION) <= 17_200
    assert len(NEW_SHOP_INSTRUCTION) <= 8_500
    assert tool_chars <= 35_500


def test_lite_model_is_used_only_when_set() -> None:
    plain = Settings(
        _env_file=None, google_text_model="main", google_text_fallback_model="fallback"
    )  # type: ignore[call-arg]
    lite = plain.model_copy(update={"google_lite_model": "lite"})
    # Unset: a lite call is the ordinary call, same model and same fallback.
    for flag in (False, True):
        policy = tries(plain, "search", lite=flag)
        assert (policy.main, policy.fallback) == ("main", "fallback")
    # Set: only calls that ask for it use it, and a busy lite model falls back to the full one.
    policy = tries(lite, "search", lite=True)
    assert (policy.main, policy.fallback) == ("lite", "main")
    policy = tries(lite, "close_day")
    assert (policy.main, policy.fallback) == ("main", "fallback")


def test_cache_decisions_are_counted() -> None:
    model = make_agent(
        Settings(  # type: ignore[call-arg]
            _env_file=None,
            coach_mode="gemini",
            gemini_backend="vertex",
            google_cloud_project="p",
            google_text_model="gemini-3.5-flash",
            google_live_model="live",
            gemini_context_cache=True,
            v1_enabled=True,
        )
    ).model
    assert isinstance(model, CachedGemini)
    model.count("miss")
    model.count("hit")
    assert model.count("hit") == {"hit": 2, "miss": 1, "skipped": 0}
