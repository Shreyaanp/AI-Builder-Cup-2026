"""Fewer tools per turn (OB-175, #534): the coach's tools grouped by area.

Google and OpenAI advise 10-20 active tools; the coach has over 40. Each text turn now offers the
always-on core plus only the areas the owner's message names (shop, menu, sales and forecasts,
customers, suppliers and orders, supply chain), the areas of tools already used in this turn and
the areas of a plan's remaining steps (coach_plan). Nothing is lost when the words miss:

- a message that names no area keeps every tool (narrowing only ever follows clear words);
- the new-shop flow and Live voice keep every tool (their sets are fixed per conversation);
- if the coach reaches for "can't do that yet" while narrowed, the turn widens to every tool once
  and the coach looks again (never a false "can't").

Tool argument values stay canonical whatever the reply language: the schemas and ids do not
change, only which declarations a turn carries.
"""

from __future__ import annotations

import re
from typing import Any

import structlog
from google.adk.models.llm_request import LlmRequest
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from google.genai import types

from .coordinator import current

log = structlog.get_logger()

# Always offered: context, the generic shop edit, honest "can't", screens, the app guide, notes,
# ending the chat and the multi-step plan.
CORE = frozenset(
    {
        "get_business_context",
        "update_shop_details",
        "report_unsupported_request",
        "open_screen",
        "explain_app",
        "remember_note",
        "end_conversation",
        "plan_steps",
    }
)

AREAS: dict[str, frozenset[str]] = {
    "shop": frozenset(
        {
            "set_open_today",
            "set_reply_language",
            "make_my_icon",
            "use_photo_as_icon",
            "request_registration",
            "propose_customer_facts",
            "get_shop_playbook",
        }
    ),
    "menu": frozenset(
        {"propose_products", "suggest_starter_items", "propose_rescue_deal", "propose_stamp_card"}
    ),
    "sales": frozenset({"get_insights", "get_forecast", "get_shop_playbook"}),
    "customers": frozenset(
        {
            "get_customer_messages",
            "prepare_customer_reply",
            "prepare_payment_link",
            "propose_stamp_card",
            "propose_customer_facts",
        }
    ),
    "suppliers": frozenset(
        {"find_suppliers", "prepare_order", "get_orders", "message_supplier", "cancel_order"}
    ),
    "supply_chain": frozenset(
        {
            "get_supplier_rules",
            "set_supplier_rules",
            "draft_reorder",
            "get_purchase_orders",
            "show_inbound",
            "accept_order_change",
            "approve_and_send_po",
            "record_goods_received",
            "send_asn",
            "send_pending_documents",
            "view_document_as_sap",
        }
    ),
    # The new-shop tools: an existing shop only needs them when the owner adds another shop.
    "setup": frozenset(
        {
            "get_question_plan",
            "update_shop",
            "show_step",
            "propose_business",
            "request_registration",
        }
    ),
}

# English, Hinglish and Hindi words that name each area. Matching is a plain search on the
# owner's message (case-insensitive); a hit adds the area, it never removes one.
_WORDS: dict[str, str] = {
    "shop": r"\b(?:hours?|timings?|open(?:ing|s)?|clos(?:e|es|ed|ing)|holiday|location|address|"
    r"move[ds]?|shift(?:ed)?|phone|number|whatsapp|rename|name|icon|logo|picture|photo|"
    r"language|hindi|english|tamil|register|registration|halal|parking|wifi|delivery\s+area|"
    r"playbook|khul|khol|band|pata|naam|bhasha|chutti)\w*|"
    r"समय|खुल|बंद|पता|फ़?ोन|नाम|भाषा|छुट्टी|लोगो|फ़?ोटो",
    "menu": r"\b(?:menu|items?|products?|dish(?:es)?|price[sd]?|pricing|rates?|cost|mrp|"
    r"rs\.?|rupees?|inr|sgd|sold\s*out|available|unavailable|hide|remove|add|new\s+item|"
    r"deal|discount|offer|rescue|leftovers?|stamps?|loyalty|starter|daam|keemat|khatam|"
    r"finished|over|bik\s*gay)\w*|₹|\$|"
    r"मेन्यू|मेनू|दाम|कीमत|क़ीमत|रेट|ख़?त्म|बिक\s*ग|छूट|ऑफ़र",
    "sales": r"\b(?:sales?|sold|selling|sell|revenue|earn\w*|income|profit|business|week|month|"
    r"today|yesterday|tomorrow|forecast|predict\w*|prep|make\s+how|how\s+many|how\s+much|busy|"
    r"rush|best\s*seller|insights?|report|chart|trend|kitna|kitne|bika|kamai|kal|aaj|"
    r"hafte|mahine|bikri)\b|"
    r"बिक्री|बिका|कमाई|कल|आज|हफ़?्ते|महीने|अनुमान|कितना|कितने",
    "customers": r"\b(?:customers?|clients?|grahak|reply|replies|respond|messages?|chats?|"
    r"inquir\w*|enquir\w*|question|asked|asking|reviews?|upi|paynow|payment|pay|link|"
    r"stamps?|regulars?|loyalty|jawab|sawal)\b|"
    r"ग्राहक|जवाब|सवाल|मैसेज|संदेश|भुगतान|पेमेंट|यूपीआई",
    "suppliers": r"\b(?:suppliers?|vendors?|wholesal\w*|distributor|order\w*|reorder\w*|buy|"
    r"restock\w*|running\s+(?:low|out)|low\s+on|out\s+of|run\s+out|finished|khatam|"
    r"cheapest|nearest|closest|deliver\w*|cancel\w*|ask\s+them|tell\s+them|same\s+as\s+last|"
    r"kg|kgs|kilo\w*|grams?|litres?|liters?|packs?|packets?|dozens?|crates?|bags?|"
    r"mang\w*|bhej\w*|chahiye|lana|stock)\b|"
    r"सप्लायर|विक्रेता|ऑर्डर|आर्डर|मँगा|मंगा|मँगवा|मंगवा|भेज|ख़?त्म|चाहिए|किलो|लीटर|स्टॉक",
    "supply_chain": r"\b(?:purchase\s+orders?|po|pos|reorder\w*|order\w*|stock|inventory|"
    r"goods|received|arrived|delivered|delivery|invoices?|bills?|asn|sap|idoc|edi|rules?|"
    r"moq|minimum|credit|lead\s*time|inbound|coming|on\s+the\s+way|documents?|approve|"
    r"send\s+it|accept|mang\w*|aaya|aa\s+gaya)\b|"
    r"ऑर्डर|आर्डर|स्टॉक|माल|बिल|आया|आ\s+गया|मँगा|मंगा",
    "setup": r"\b(?:new\s+shop|another\s+shop|second\s+shop|add\s+(?:a\s+)?shop|register|"
    r"nayi\s+dukaan|dusri\s+dukaan)\b|नई\s+दुकान|दूसरी\s+दुकान",
}
PATTERNS = {area: re.compile(words, re.I) for area, words in _WORDS.items()}
TOOL_AREAS: dict[str, set[str]] = {}
for _area, _tools in AREAS.items():
    for _tool in _tools:
        TOOL_AREAS.setdefault(_tool, set()).add(_area)


def named_areas(text: str) -> set[str]:
    """The areas the owner's words name ("order 15 kg atta" → suppliers, supply chain)."""
    return {area for area, pattern in PATTERNS.items() if pattern.search(text or "")}


def used_areas(contents: list[types.Content]) -> set[str]:
    """Areas of the tools this turn already called (after the owner's last words)."""
    areas: set[str] = set()
    for content in reversed(contents):
        parts = content.parts or []
        if content.role == "user" and any(part.text for part in parts):
            break
        for part in parts:
            name = (part.function_call.name if part.function_call else None) or (
                part.function_response.name if part.function_response else None
            )
            areas |= TOOL_AREAS.get(name or "", set())
    return areas


def allowed_tools(text: str, contents: list[types.Content], plan: Any = None) -> set[str] | None:
    """The tool names for this model call, or None for every tool."""
    areas = named_areas(text)
    if not areas:
        return None
    steps = (plan or {}).get("steps") or []
    for step in steps[int((plan or {}).get("done") or 0) :]:
        areas |= named_areas(step)
    areas |= used_areas(contents)
    names = set(CORE)
    for area in areas:
        names |= AREAS[area]
    return names


def focus_tools(callback_context: Any, llm_request: LlmRequest) -> None:
    """ADK before-model callback: send only this turn's tool areas (see the module docstring)."""
    ctx = current.get()
    config = llm_request.config
    if not ctx or not ctx.business_id or ctx.new_shop or ctx.spoken or ctx.all_tools:
        return None
    if not config or not config.tools:
        return None
    names = allowed_tools(ctx.message, llm_request.contents, ctx.plan)
    if names is None:
        return None
    kept: list[Any] = []
    offered = 0
    for tool in config.tools:
        if isinstance(tool, types.Tool) and tool.function_declarations:
            declarations = [d for d in tool.function_declarations if d.name in names]
            offered += len(declarations)
            if declarations:
                kept.append(tool.model_copy(update={"function_declarations": declarations}))
        else:
            kept.append(tool)
    config.tools = kept
    ctx.narrowed = True
    log.info("coach_tools_focused", tools=offered)
    return None


WIDENED = {
    "status": "more_tools",
    "instruction": "More actions are available now. Check whether one of them does what the "
    "owner asked; only if none does, call report_unsupported_request again.",
}


def widen_before_unsupported(
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext
) -> dict[str, Any] | None:
    """ADK before-tool callback: a "can't do that" while narrowed widens the turn first."""
    ctx = current.get()
    if tool.name != "report_unsupported_request" or not ctx or not ctx.narrowed:
        return None
    if ctx.all_tools:
        return None
    ctx.all_tools = True
    log.info("coach_tools_widened")
    return dict(WIDENED)
