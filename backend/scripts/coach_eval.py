"""Live coach evaluation: does Gemini pick the right tools, in the owner's language?

Runs real multi-turn scenarios through the production ADK agent and tools against a throwaway
SQLite store, records the tool trajectory and final reply, and scores each scenario.

Usage (from backend/):
  GEMINI_BACKEND=api_key GOOGLE_API_KEY=... uv run python -m scripts.coach_eval
  GEMINI_BACKEND=vertex GOOGLE_CLOUD_PROJECT=... uv run python -m scripts.coach_eval  (needs ADC)
Optional: COACH_EVAL_MODEL (default gemini-3.5-flash-lite), COACH_EVAL_OUT=results.json.
Each scenario makes a few small model calls; it never touches production data.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.agent import make_agent, ui_language
from app.coordinator import MerchantContext, current
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.settings import Settings

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
TAMIL = re.compile(r"[஀-௿]")


@dataclass
class Turn:
    tools: list[dict[str, Any]] = field(default_factory=list)
    responses: list[dict[str, Any]] = field(default_factory=list)
    reply: str = ""


@dataclass
class Scenario:
    name: str
    message: str
    language: str = "en"
    seed: Callable[[MerchantStore, str], str | None] | None = None
    checks: list[tuple[str, Callable[[Turn], bool]]] = field(default_factory=list)


def shop(store: MerchantStore, uid: str, products: list[ProductFields] | None = None) -> str:
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ram Tea Stall", category="Tea stall", location="FC Road, Pune"
            ),
            products=products or [],
        ),
    )
    return str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])


def tea_menu(store: MerchantStore, uid: str) -> str:
    return shop(
        store,
        uid,
        [
            ProductFields(name="Chai", price=1500, unit="cup"),
            ProductFields(name="Samosa", price=1200, unit="plate"),
        ],
    )


def called(name: str) -> Callable[[Turn], bool]:
    return lambda turn: any(call["name"] == name for call in turn.tools)


def not_called(*names: str) -> Callable[[Turn], bool]:
    return lambda turn: not any(call["name"] in names for call in turn.tools)


def items(turn: Turn) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for call in turn.tools:
        if call["name"] == "propose_products":
            found += call["args"].get("items", [])
    return found


def item(name: str, **expected: Any) -> Callable[[Turn], bool]:
    def check(turn: Turn) -> bool:
        for entry in items(turn):
            if name.casefold() in str(entry.get("name", "")).casefold() and all(
                entry.get(key, True if key == "available" else None) == value
                for key, value in expected.items()
            ):
                return True
        return False

    return check


def reply_matches(pattern: re.Pattern[str] | str) -> Callable[[Turn], bool]:
    regex = re.compile(pattern, re.I) if isinstance(pattern, str) else pattern
    return lambda turn: bool(regex.search(turn.reply))


def no_internal_leaks(turn: Turn) -> bool:
    return not re.search(r"\b(True|False|proposal_id|paise)\b|\[language", turn.reply)


def prepared_not_saved(turn: Turn) -> bool:
    """The coach only prepares; the owner saves. Replies must not claim a completed change."""
    claims = (
        r"\b(I(?:'ve| have)? (added|saved|recorded|updated|marked|changed))\b"
        r"|दर्ज कर|जोड़ दि|बदल दि|सहेज दि|मार्क कर दि"
        # "kar diya" alone is fine when it follows "taiyar" (prepared).
        r"|(?<!taiyar )\b(add|save|update|change) kar (diya|di)\b"
    )
    return not re.search(claims, turn.reply, re.I)


def sane_prices(turn: Turn) -> bool:
    """Proposed prices are major units; a stored-minor-unit leak shows up as 100× prices."""
    return all(float(entry.get("price", 0)) < 1000 for entry in items(turn))


GLOBAL_CHECKS: list[tuple[str, Callable[[Turn], bool]]] = [
    ("no internal fields or tags in reply", no_internal_leaks),
    ("says prepared, not saved", prepared_not_saved),
    ("prices in major units", sane_prices),
]


def no_false_publish(turn: Turn) -> bool:
    claims = r"(published|is now (live|on google)|added (it )?to google maps|updated on google)"
    return not re.search(claims, turn.reply, re.I) or bool(
        re.search(r"\b(can(no|')t|not)\b", turn.reply, re.I)
    )


SCENARIOS = [
    Scenario(
        "hindi_new_shop",
        "मेरी चाय की दुकान का नाम राम टी स्टॉल है, FC रोड पुणे में, सुबह 7 से रात 9 बजे तक खुली रहती है",
        language="hi",
        checks=[
            ("proposes the shop", called("propose_business")),
            ("replies in Hindi script", reply_matches(DEVANAGARI)),
        ],
    ),
    Scenario(
        "hinglish_menu_items",
        "chai 15 rupaye cup aur samosa 12 rupaye plate add karo",
        language="hi",
        seed=shop,
        checks=[
            ("one products proposal", called("propose_products")),
            ("chai 15 per cup", item("chai", price=15, unit="cup")),
            ("samosa 12 per plate", item("samosa", price=12, unit="plate")),
        ],
    ),
    Scenario(
        "price_correction_keeps_unit",
        "Chai is 12 now, not 15",
        seed=tea_menu,
        checks=[("chai corrected to 12 per cup", item("chai", price=12, unit="cup"))],
    ),
    Scenario(
        "sold_out",
        "samosa khatam ho gaya aaj",
        language="hi",
        seed=tea_menu,
        checks=[("samosa marked unavailable", item("samosa", available=False))],
    ),
    Scenario(
        "ambiguous_asks_first",
        "change the chai price",
        seed=tea_menu,
        checks=[
            ("does not guess a price", not_called("propose_products", "propose_business")),
            ("asks a question", reply_matches(r"\?")),
        ],
    ),
    Scenario(
        "spanish_new_shop",
        "Mi tienda se llama Panadería Lupita, está en el centro de Oaxaca y abre de 7 a 20",
        language="es",
        checks=[
            ("proposes the shop", called("propose_business")),
            ("replies in Spanish", reply_matches(r"\b(tu|su|la|el|de|para|revisa|confirma)\b")),
        ],
    ),
    Scenario(
        "off_topic_declines",
        "Write me a long poem about cricket",
        seed=shop,
        checks=[("no tool calls", not_called("propose_products", "propose_business"))],
    ),
    Scenario(
        "suspicious_price_is_flagged",
        "Chai 150 rupees per cup",
        seed=tea_menu,
        checks=[
            ("proposes chai 150", item("chai", price=150)),
            ("tool warned", lambda t: any(r.get("warnings") for r in t.responses)),
            ("asks the owner to confirm", reply_matches(r"confirm|sure|check|correct|\?")),
        ],
    ),
    Scenario(
        "no_false_google_claims",
        "Publish my shop on Google Maps now",
        seed=tea_menu,
        checks=[
            ("never claims to publish", no_false_publish),
            ("no tool calls", not_called("propose_products", "propose_business")),
        ],
    ),
    Scenario(
        "tamil_menu",
        "டீ 15 ரூபாய் ஒரு கப், வடை 10 ரூபாய்",
        language="ta",
        seed=shop,
        checks=[
            ("one products proposal", called("propose_products")),
            ("replies in Tamil script", reply_matches(TAMIL)),
        ],
    ),
]


async def run_scenario(scenario: Scenario, settings: Settings, root: Path) -> dict[str, Any]:
    store = MerchantStore(str(root / f"{scenario.name}.sqlite3"))
    uid = "eval-owner"
    bid = scenario.seed(store, uid) if scenario.seed else None
    sessions = InMemorySessionService()
    runner = Runner(app_name="coach_eval", agent=make_agent(settings), session_service=sessions)
    session = await sessions.create_session(
        app_name="coach_eval", user_id=uid, state={"business_id": bid}
    )
    token = current.set(MerchantContext(store, uid, bid, [], scenario.message))
    ui_language.set(scenario.language)
    turn = Turn()
    started = time.perf_counter()
    try:
        async for event in runner.run_async(
            user_id=uid,
            session_id=session.id,
            new_message=types.Content(role="user", parts=[types.Part(text=scenario.message)]),
        ):
            for call in event.get_function_calls():
                turn.tools.append({"name": call.name, "args": dict(call.args or {})})
            for response in event.get_function_responses():
                turn.responses.append(dict(response.response or {}))
            if event.content and event.content.role == "model" and not event.partial:
                text = "".join(
                    part.text or "" for part in event.content.parts or [] if not part.thought
                )
                if text.strip():
                    turn.reply = text.strip()
    finally:
        current.reset(token)
    results = [(label, bool(check(turn))) for label, check in [*scenario.checks, *GLOBAL_CHECKS]]
    return {
        "scenario": scenario.name,
        "passed": all(ok for _, ok in results),
        "checks": dict(results),
        "tools": [call["name"] for call in turn.tools],
        "tool_args": turn.tools,
        "reply": turn.reply,
        "seconds": round(time.perf_counter() - started, 2),
    }


async def main() -> list[dict[str, Any]]:
    model = os.environ.get("COACH_EVAL_MODEL", "gemini-3.5-flash-lite")
    settings = Settings(  # type: ignore[call-arg]  # pydantic-settings runtime option
        v1_enabled=True,
        coach_mode="gemini",
        google_text_model=model,
        google_live_model=model,
        _env_file=None,
    )
    # Windows keeps SQLite files locked briefly; leftover temp files are harmless.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
        rows = []
        for scenario in SCENARIOS:
            try:
                row = await run_scenario(scenario, settings, Path(directory))
            except Exception as error:  # Report and continue; one provider hiccup ≠ failed eval.
                row = {"scenario": scenario.name, "passed": False, "error": type(error).__name__}
            rows.append(row)
            mark = "PASS" if row["passed"] else "FAIL"
            detail = row.get("checks", row.get("error"))
            print(f"{mark} {row['scenario']}: {detail} tools={row.get('tools')}")
    passed = sum(row["passed"] for row in rows)
    print(f"\n{passed}/{len(rows)} scenarios passed with {model}")
    return rows


if __name__ == "__main__":
    results = asyncio.run(main())
    if out := os.environ.get("COACH_EVAL_OUT"):
        Path(out).write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
