"""OB-175 (#534): fewer tools per turn, grouped by area, with nothing lost when words miss."""

from types import SimpleNamespace
from typing import Any

import pytest
from google.adk.models.llm_request import LlmRequest
from google.adk.tools.function_tool import FunctionTool
from google.genai import types

from app.agent import make_agent
from app.coordinator import MerchantContext, current
from app.settings import Settings
from app.tool_areas import (
    AREAS,
    CORE,
    WIDENED,
    allowed_tools,
    focus_tools,
    named_areas,
    widen_before_unsupported,
)


def agent_tools() -> list[Any]:
    return make_agent(Settings(_env_file=None, v1_enabled=True)).tools  # type: ignore[call-arg,return-value]


def request() -> LlmRequest:
    declarations = [FunctionTool(tool)._get_declaration() for tool in agent_tools()]  # noqa: SLF001
    return LlmRequest(
        config=types.GenerateContentConfig(
            tools=[types.Tool(function_declarations=[d for d in declarations if d])]
        )
    )


def offered(llm_request: LlmRequest) -> set[str]:
    return {
        str(d.name)
        for tool in llm_request.config.tools or []
        if isinstance(tool, types.Tool)
        for d in tool.function_declarations or []
    }


def context(message: str, **extra: Any) -> MerchantContext:
    return MerchantContext(SimpleNamespace(), "owner", "shop-1", [], message, **extra)  # type: ignore[arg-type]


def test_every_coach_tool_is_in_the_core_or_an_area() -> None:
    """A tool in no area would never be offered on a narrowed turn."""
    names = {tool.__name__ for tool in agent_tools()}
    grouped = set(CORE).union(*AREAS.values())
    assert names <= grouped, names - grouped
    assert grouped <= names, grouped - names
    assert len(names) > 40


@pytest.mark.parametrize(
    ("said", "areas"),
    [
        ("order 20 kg atta from the cheapest", {"suppliers", "supply_chain"}),
        ("atta order karo", {"suppliers", "supply_chain"}),
        ("दूध मँगाना है", {"suppliers", "supply_chain"}),
        ("we close at 9 now", {"shop"}),
        ("reply to the customer who asked about parking", {"customers", "shop"}),
        ("how were sales last week?", {"sales"}),
        ("samosa price 25 rupees", {"menu"}),
        ("240 ka UPI link bana do", {"customers"}),
    ],
)
def test_the_owners_words_name_the_area(said: str, areas: set[str]) -> None:
    assert areas <= named_areas(said)


@pytest.mark.parametrize("said", ["yes", "ok", "haan", "the first one", "thanks!", "hmm"])
def test_a_message_that_names_no_area_keeps_every_tool(said: str) -> None:
    assert allowed_tools(said, [], None) is None


def test_a_supplier_turn_sends_far_fewer_tools_and_keeps_the_core() -> None:
    llm_request = request()
    total = len(offered(llm_request))
    ctx = context("order 20 kg atta from the cheapest")
    token = current.set(ctx)
    try:
        focus_tools(None, llm_request)
    finally:
        current.reset(token)
    sent = offered(llm_request)
    assert set(CORE) <= sent
    assert {"find_suppliers", "prepare_order", "draft_reorder"} <= sent
    assert "propose_business" not in sent and "get_insights" not in sent
    assert len(sent) <= 25 < total
    assert ctx.narrowed


def test_tools_already_used_this_turn_stay_offered() -> None:
    contents = [
        types.Content(role="user", parts=[types.Part(text="samosa price 25")]),
        types.Content(
            role="model",
            parts=[types.Part(function_call=types.FunctionCall(name="find_suppliers", args={}))],
        ),
    ]
    names = allowed_tools("samosa price 25", contents, None)
    assert names is not None and "prepare_order" in names


def test_a_plans_remaining_steps_bring_their_areas() -> None:
    plan = {"steps": ["find milk suppliers", "reply to the customer"], "done": 0}
    names = allowed_tools("find milk suppliers", [], plan)
    assert names is not None and "prepare_customer_reply" in names


@pytest.mark.parametrize("mode", ["new_shop", "spoken", "all_tools"])
def test_new_shop_voice_and_a_widened_turn_keep_every_tool(mode: str) -> None:
    llm_request = request()
    total = len(offered(llm_request))
    ctx = context("order 20 kg atta", **{mode: True})
    token = current.set(ctx)
    try:
        focus_tools(None, llm_request)
    finally:
        current.reset(token)
    assert len(offered(llm_request)) == total


def test_cant_do_that_while_narrowed_widens_once_first() -> None:
    ctx = context("order 20 kg atta", narrowed=True)
    tool = SimpleNamespace(name="report_unsupported_request")
    token = current.set(ctx)
    try:
        assert widen_before_unsupported(tool, {}, None) == WIDENED  # type: ignore[arg-type]
        assert ctx.all_tools
        # The second time the coach really cannot: the tool runs.
        assert widen_before_unsupported(tool, {}, None) is None  # type: ignore[arg-type]
        # Other tools are never stopped.
        assert widen_before_unsupported(SimpleNamespace(name="find_suppliers"), {}, None) is None  # type: ignore[arg-type]
    finally:
        current.reset(token)


def test_tool_arguments_stay_canonical_whatever_the_language() -> None:
    """Narrowing only drops declarations: the schemas the model fills are the same objects."""
    full = {d.name: d for t in request().config.tools or [] for d in t.function_declarations or []}  # type: ignore[union-attr]
    llm_request = request()
    token = current.set(context("atta order karo"))
    try:
        focus_tools(None, llm_request)
    finally:
        current.reset(token)
    for tool in llm_request.config.tools or []:
        for declaration in tool.function_declarations or []:  # type: ignore[union-attr]
            assert (
                declaration.parameters_json_schema == full[declaration.name].parameters_json_schema
            )
