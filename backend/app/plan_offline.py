"""Offline coach fixture for multi-step plans (OB-174): the calls Gemini makes, by patterns.

"My atta is running low, find suppliers, then order 20 kg atta from the cheapest, then ask them
if they deliver on Sunday" becomes plan_steps, then each step through the ordinary offline
script, parking on the order card and going on after the resume note. Fixtures only: they say
nothing about how well the live model plans.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Callable
from typing import Any

from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from .coach_plan import TAP, split_steps

NOTE = "(App note"

Generate = Callable[[LlmRequest], AsyncGenerator[LlmResponse]]


def _call(name: str, args: dict[str, Any]) -> LlmResponse:
    part = types.Part(function_call=types.FunctionCall(name=name, args=args))
    return LlmResponse(content=types.Content(role="model", parts=[part]))


def _last_parts(llm_request: LlmRequest) -> list[types.Part]:
    return list(llm_request.contents[-1].parts or []) if llm_request.contents else []


async def _step(generate: Generate, llm_request: LlmRequest, ctx: Any, step: str) -> LlmResponse:
    """The ordinary offline script for one step, as if the owner had just said it."""
    said = ctx.message
    ctx.message = step
    asked = llm_request.model_copy(
        update={
            "contents": [
                *llm_request.contents,
                types.Content(role="user", parts=[types.Part(text=step)]),
            ]
        }
    )
    try:
        responses = [response async for response in generate(asked)]
    finally:
        ctx.message = said
    return responses[0] if responses else LlmResponse(content=types.Content(role="model"))


async def plan_turn(generate: Generate, llm_request: LlmRequest, ctx: Any) -> LlmResponse | None:
    """The offline response for a plan's next move, or None for the ordinary script."""
    parts = _last_parts(llm_request)
    responses = [part.function_response for part in parts if part.function_response]
    text = " ".join(part.text or "" for part in parts)
    if not responses and text.startswith(NOTE):
        plan = ctx.plan or {}
        steps = plan.get("steps") or []
        done = int(plan.get("done") or 0)
        return await _step(generate, llm_request, ctx, steps[done]) if done < len(steps) else None
    if not responses:
        steps = split_steps(ctx.message)
        if len(steps) < 2:
            return None
        first = await _step(generate, llm_request, ctx, steps[0])
        made = first.content and any(part.function_call for part in first.content.parts or [])
        return _call("plan_steps", {"steps": steps}) if made else None
    planned = next((r for r in responses if r.name == "plan_steps"), None)
    if planned is not None and (planned.response or {}).get("status") == "planned":
        steps = (planned.response or {})["plan"]["steps"]
        return await _step(generate, llm_request, ctx, steps[0])
    plan = next(
        (
            dict((r.response or {})["plan"])
            for r in responses
            if isinstance((r.response or {}).get("plan"), dict)
        ),
        None,
    )
    if plan and not plan.get("waiting") and plan["done"] < len(plan["steps"]):
        return await _step(generate, llm_request, ctx, plan["steps"][plan["done"]])
    return None


def with_next_step(response: LlmResponse, llm_request: LlmRequest) -> LlmResponse:
    """The offline reply after a card that parks a plan says what comes after the tap."""
    plan: dict[str, Any] | None = next(
        (
            (part.function_response.response or {})["plan"]
            for part in _last_parts(llm_request)
            if part.function_response
            and isinstance((part.function_response.response or {}).get("plan"), dict)
        ),
        None,
    )
    waiting = (plan or {}).get("waiting")
    content = response.content
    if not plan or not waiting or not content or not content.parts or not content.parts[0].text:
        return response
    later = "; ".join(plan["steps"][plan["done"] :])
    line = f" After you tap {TAP[waiting['kind']]}, I'll go on: {later}."
    first = content.parts[0].model_copy(update={"text": content.parts[0].text + line})
    return response.model_copy(
        update={"content": content.model_copy(update={"parts": [first, *content.parts[1:]]})}
    )
