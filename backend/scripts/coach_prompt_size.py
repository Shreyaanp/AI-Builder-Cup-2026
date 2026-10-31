"""Size of what the coach sends Gemini on every turn: rules, tool declarations, voice note.

Offline and free (no model call). Tokens are estimated at four characters each, the same rule
context_cache.py uses for its minimum-size check. Run it before and after a prompt change:

    cd backend && PYTHONPATH=. uv run python scripts/coach_prompt_size.py
"""

import json
import warnings
from collections.abc import Callable
from typing import Any, cast

from google.adk.tools.function_tool import FunctionTool

from app.agent import INSTRUCTION, LIVE_TOOLS_NOTE, NEW_SHOP_INSTRUCTION, make_agent, strip_titles
from app.settings import Settings

warnings.filterwarnings("ignore")


def tokens(text: str) -> int:
    return len(text) // 4


def tool_json(*, live: bool) -> str:
    """The tool declarations as sent. The text coach drops schema titles per request
    (agent.lean_tools); the Live connection sends them as generated."""
    agent = make_agent(Settings(v1_enabled=True), live=live)
    declarations = []
    for tool in agent.tools:
        wrapped = (
            tool
            if hasattr(tool, "_get_declaration")
            else FunctionTool(cast(Callable[..., Any], tool))
        )
        declaration = wrapped._get_declaration()  # noqa: SLF001
        if declaration is not None:
            if not live:
                strip_titles(declaration.parameters_json_schema)
            declarations.append(declaration.model_dump(mode="json", exclude_none=True))
    return json.dumps(declarations, ensure_ascii=False, separators=(",", ":"))


def row(name: str, text: str) -> None:
    print(f"{name:42} {len(text):7} chars  ~{tokens(text):6} tokens")


def main() -> None:
    tools = tool_json(live=False)
    voice_tools = tool_json(live=True)
    row("coach rules (INSTRUCTION)", INSTRUCTION)
    row("new-shop rules (NEW_SHOP_INSTRUCTION)", NEW_SHOP_INSTRUCTION)
    row("voice tools note", LIVE_TOOLS_NOTE)
    row("tool declarations (text)", tools)
    row("tool declarations (voice)", voice_tools)
    row("owner chat prefix (rules + tools)", INSTRUCTION + tools)
    row("new-shop chat (+ new-shop rules)", INSTRUCTION + tools + NEW_SHOP_INSTRUCTION)
    row("voice prefix (rules + note + tools)", INSTRUCTION + LIVE_TOOLS_NOTE + voice_tools)
    print("demo: coach_mode=offline, no model call, 0 tokens")


if __name__ == "__main__":
    main()
