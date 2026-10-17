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
import io
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

HAN = re.compile(r"[\u4e00-\u9fff]")
JAPANESE = re.compile(r"[\u3040-\u30ff]")
KOREAN = re.compile(r"[\uac00-\ud7af]")
THAI = re.compile(r"[\u0e00-\u0e7f]")
TAMIL = re.compile(r"[஀-௿]")


@dataclass
class Turn:
    tools: list[dict[str, Any]] = field(default_factory=list)
    responses: list[dict[str, Any]] = field(default_factory=list)
    reply: str = ""
    message: str = ""
    finish: list[str] = field(default_factory=list)


@dataclass
class Scenario:
    name: str
    message: str
    language: str = "en"
    seed: Callable[[MerchantStore, str], str | None] | None = None
    checks: list[tuple[str, Callable[[Turn], bool]]] = field(default_factory=list)
    image: bytes | None = None


def menu_photo() -> bytes:
    """Synthetic local menu image for the opt-in multimodal eval; no merchant photo data."""
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (640, 240), "white")
    draw = ImageDraw.Draw(image)
    draw.multiline_text(
        (24, 24),
        "MENU\nKopi  SGD 1.80 / cup\nKaya toast  SGD 2.50 / set",
        fill="black",
        font=ImageFont.load_default(size=28),
        spacing=20,
    )
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def shop(store: MerchantStore, uid: str, products: list[ProductFields] | None = None) -> str:
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ah Ming Kopi", category="Kopitiam", location="Tiong Bahru, Singapore"
            ),
            products=products or [],
        ),
    )
    return str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])


def kopi_menu(store: MerchantStore, uid: str) -> str:
    return shop(
        store,
        uid,
        [
            ProductFields(name="Kopi", price=200, unit="cup"),
            ProductFields(name="Kaya toast", price=250, unit="piece"),
            ProductFields(name="焼きそば", price=650, unit="plate"),
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


def fact(turn: Turn, key: str) -> Any:
    """The last value the model passed for one shop-detail or customer-fact argument, if any."""
    tools = {"propose_business", "propose_customer_facts"}
    values = [call["args"].get(key) for call in turn.tools if call["name"] in tools]
    return values[-1] if values else None


def proposed_fact(key: str, value: Any) -> Callable[[Turn], bool]:
    return lambda turn: str(fact(turn, key) or "").casefold() == str(value).casefold()


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
    # Large prices are fine when the owner said them or the shop's data shows them (e.g. ¥1100);
    # a minor-unit leak shows up as a 100x number that appears nowhere.
    seen = turn.message.replace(",", "") + json.dumps(turn.responses)
    return all(
        float(entry.get("price") or 0) < 1000 or f"{float(entry.get('price') or 0):g}" in seen
        for entry in items(turn)
    )


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


def args_of(turn: Turn, name: str) -> dict[str, Any]:
    return next((call["args"] for call in turn.tools if call["name"] == name), {})


def bengaluru_bakery(store: MerchantStore, uid: str) -> str:
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Asha Bakery",
                category="Bakery",
                location="Indiranagar, Bengaluru",
                lat=12.9716,
                lng=77.5946,
                currency="INR",
                timezone="Asia/Kolkata",
            ),
        ),
    )
    return str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])


def with_order(status: str) -> Callable[[MerchantStore, str], str]:
    """A bakery with one demo supplier and one order to it (sent, or a draft)."""

    def seed(store: MerchantStore, uid: str) -> str:
        import time as clock

        from app import sourcing

        bid = bengaluru_bakery(store, uid)
        records = sourcing.demo_records(
            sourcing.fixture_suppliers("flour", "kg", "INR"),
            12.9716,
            77.5946,
            "INR",
            "Asia/Kolkata",
        )
        for sid, fields, products in records:
            store.seed_demo_shop("eval-demo-owner", sid, fields, products)
        supplier = store.public_shop(records[0][0])
        assert supplier
        pin = sourcing.shop_pin(store.context(uid, bid)["business"]["fields"])
        order = sourcing.new_order(
            supplier,
            pin,
            [sourcing.OrderItem(name="flour", quantity=20, unit="kg")],
            "",
            "",
            1.4,
            clock.time(),
        )
        order["status"] = status
        store.save_supplier_order(uid, bid, order)
        return bid

    return seed


def tea_stall(understanding: dict[str, Any] | None = None, playbook: bool = False):
    """A Mumbai tea stall (beverage segment) with a menu; optionally goals and a playbook."""

    def seed(store: MerchantStore, uid: str) -> str:
        from datetime import date

        from app.playbook import offline_stored

        proposal = store.propose(
            uid,
            ProposalRequest(
                kind="business",
                business=BusinessFields(
                    name="Shree Chai Corner",
                    category="Tea stall",
                    location="Andheri East, Mumbai",
                    currency="INR",
                    timezone="Asia/Kolkata",
                    busy_hours="7-10 am and 5-7 pm" if understanding else "",
                    profile={
                        "kind": "food",
                        "subtype": "Tea stall",
                        "food": {"segment": "beverage", "halal_relevant": True},
                    },
                    understanding=understanding,
                ),
                products=[
                    ProductFields(name="Cutting chai", price=1500, unit="cup"),
                    ProductFields(name="Masala chai", price=2000, unit="cup"),
                    ProductFields(name="Bun maska", price=3000, unit="piece"),
                ],
            ),
        )
        bid = str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])
        if playbook:
            context = store.context(uid, bid)
            stored = offline_stored(context["business"], context["inventory"], date(2026, 10, 16))
            store.set_playbook(uid, bid, stored.model_dump())
        return bid

    return seed


NO_DIET_TALK = r"\b(halal|vegetarian|non-veg|veg\b|meat)"

SCENARIOS = [
    Scenario(
        "bulk_menu_photo",
        "Add these to the menu.",
        seed=shop,
        image=menu_photo(),
        checks=[
            (
                "one bulk proposal",
                lambda turn: sum(c["name"] == "propose_products" for c in turn.tools) == 1,
            ),
            ("kopi extracted", item("Kopi", price=1.8, unit="cup")),
            ("toast extracted", item("Kaya toast", price=2.5, unit="set")),
            ("all items together", lambda turn: len(items(turn)) == 2),
        ],
    ),
    Scenario(
        "memory_note",
        "Please remember: we are closed every Monday during Ramadan.",
        seed=kopi_menu,
        checks=[
            ("saves a note", called("remember_note")),
            ("no record changes", not_called("propose_products")),
        ],
    ),
    Scenario(
        "insights_no_sales",
        "How is business this week? What should I do next?",
        seed=kopi_menu,
        checks=[
            ("checks insights", called("get_insights")),
            ("suggests importing sales", reply_matches(r"import|POS|Excel|spreadsheet|sales")),
        ],
    ),
    Scenario(
        "mandarin_new_shop",
        "我的店叫阿明咖啡店，在新加坡 Tiong Bahru，是一家 kopitiam，每天早上7点开到晚上9点",
        language="zh-Hans",
        checks=[
            ("proposes the shop", called("propose_business")),
            ("replies in Mandarin", reply_matches(HAN)),
        ],
    ),
    Scenario(
        "malay_menu_items",
        "Tambah nasi lemak SGD 4.50 sepinggan dan teh tarik SGD 1.80 secawan",
        language="ms",
        seed=shop,
        checks=[
            ("proposes products", called("propose_products")),
            ("nasi lemak 4.50", item("nasi lemak", price=4.5)),
            ("teh tarik 1.80", item("teh tarik", price=1.8)),
            (
                "replies in Malay",
                reply_matches(r"\b(sila|semak|sahkan|anda|sediakan|disediakan)\b"),
            ),
        ],
    ),
    Scenario(
        "tamil_price_correction",
        "Kopi ஒரு கோப்பை விலை இப்போது SGD 1.80, SGD 2 இல்லை. மாற்றத்தைத் தயார்செய்யுங்கள்",
        language="ta",
        seed=kopi_menu,
        checks=[
            ("proposes products", called("propose_products")),
            ("kopi corrected to 1.80 per cup", item("kopi", price=1.8, unit="cup")),
            ("replies in Tamil", reply_matches(TAMIL)),
        ],
    ),
    Scenario(
        "japanese_sold_out",
        "焼きそばは今日は売り切れです。変更を準備してください",
        language="ja",
        seed=kopi_menu,
        checks=[
            ("proposes products", called("propose_products")),
            ("yakisoba unavailable", item("焼きそば", available=False)),
            ("replies in Japanese", reply_matches(JAPANESE)),
        ],
    ),
    Scenario(
        "korean_shop_hours",
        "오늘부터 가게 영업시간을 오전 8시부터 오후 6시까지로 바꿀게요. 변경안을 준비해 주세요",
        language="ko",
        seed=shop,
        checks=[
            ("proposes shop changes", called("propose_business")),
            ("replies in Korean", reply_matches(KOREAN)),
        ],
    ),
    Scenario(
        "indonesian_menu_items",
        "Tambahkan nasi goreng SGD 5 per piring ke menu, siapkan perubahannya",
        language="id",
        seed=shop,
        checks=[
            ("proposes products", called("propose_products")),
            ("nasi goreng 5", item("nasi goreng", price=5)),
            (
                "replies in Indonesian",
                reply_matches(r"\b(siap|disiapkan|silakan|periksa|konfirmasi|Anda)\b"),
            ),
        ],
    ),
    Scenario(
        "thai_new_shop",
        "ร้านชื่อบ้านขนม เป็นร้านเบเกอรี่ อยู่ที่บูกิส สิงคโปร์ เปิดทุกวัน 8 โมงเช้าถึง 6 โมงเย็นค่ะ",
        language="th",
        checks=[
            ("proposes the shop", called("propose_business")),
            ("replies in Thai", reply_matches(THAI)),
        ],
    ),
    Scenario(
        "vietnamese_menu_items",
        "Thêm bánh mì giá SGD 4 mỗi cái vào thực đơn, chuẩn bị thay đổi giúp tôi",
        language="vi",
        seed=shop,
        checks=[
            ("proposes products", called("propose_products")),
            ("banh mi 4", item("bánh mì", price=4)),
            ("replies in Vietnamese", reply_matches(r"\b(bạn|kiểm tra|xác nhận|chuẩn bị|đã)\b")),
        ],
    ),
    Scenario(
        "filipino_sold_out",
        "Ubos na ang Kaya toast ngayong araw. Ihanda ang pagbabago sa menu",
        language="fil",
        seed=kopi_menu,
        checks=[
            ("proposes products", called("propose_products")),
            ("kaya toast unavailable", item("kaya toast", available=False)),
            ("replies in Filipino", reply_matches(r"\b(inihanda|suriin|kumpirmahin|mong|mo|na)\b")),
        ],
    ),
    Scenario(
        "ambiguous_asks_first",
        "change the kopi price",
        seed=kopi_menu,
        checks=[
            ("does not guess a price", not_called("propose_products", "propose_business")),
            ("asks a question", reply_matches(r"\?")),
        ],
    ),
    Scenario(
        "off_topic_declines",
        "Write me a long poem about football",
        seed=shop,
        checks=[("no tool calls", not_called("propose_products", "propose_business"))],
    ),
    Scenario(
        "suspicious_price_is_flagged",
        "Kopi SGD 20 per cup",
        seed=kopi_menu,
        checks=[
            ("proposes products", called("propose_products")),
            ("proposes kopi 20", item("kopi", price=20)),
            ("tool warned", lambda t: any(r.get("warnings") for r in t.responses)),
            ("asks the owner to confirm", reply_matches(r"confirm|sure|check|correct|\?")),
        ],
    ),
    # Customer facts (UI-3): after the basics, ask one short question; record answers for review.
    Scenario(
        "asks_one_customer_fact",
        "Thanks, the menu is done for now. What else should I add?",
        seed=kopi_menu,
        checks=[
            ("no record changes", not_called("propose_products", "propose_business")),
            ("reads the shop first", called("get_business_context")),
            (
                "asks the owner's goals first",
                reply_matches(r"matters most|more customers|waste|save time|busiest|regulars"),
            ),
            ("one question only", lambda t: t.reply.count("?") == 1),
        ],
    ),
    Scenario(
        "records_halal_and_payment",
        "Yes, everything we sell is halal. We take cash and PayNow only.",
        seed=kopi_menu,
        checks=[
            ("proposes shop facts", called("propose_customer_facts")),
            ("halal yes", proposed_fact("halal", "yes")),
            (
                "cash and PayNow",
                lambda t: set(fact(t, "payment_methods") or []) == {"cash", "paynow"},
            ),
            ("keeps the shop", lambda t: fact(t, "name") in ("", None)),
        ],
    ),
    Scenario(
        "no_false_google_claims",
        "Publish my shop on Google Maps now",
        seed=kopi_menu,
        checks=[
            ("never claims to publish", no_false_publish),
            ("no tool calls", not_called("propose_products", "propose_business")),
        ],
    ),
    # Sourcing (Forecast → Source → Sell).
    Scenario(
        "running_low_finds_suppliers",
        "My flour is running low",
        seed=bengaluru_bakery,
        checks=[
            ("finds suppliers", called("find_suppliers")),
            ("for flour", lambda t: "flour" in str(args_of(t, "find_suppliers").get("item", ""))),
            ("says demo honestly", reply_matches(r"(?i)demo")),
            ("does not order yet", not_called("prepare_order")),
        ],
    ),
    Scenario(
        "need_quantity_by_tomorrow",
        "I need 20 kg flour by tomorrow",
        seed=bengaluru_bakery,
        checks=[
            ("finds suppliers", called("find_suppliers")),
            ("keeps quantity", lambda t: args_of(t, "find_suppliers").get("quantity") == 20),
            ("keeps unit", lambda t: args_of(t, "find_suppliers").get("unit") == "kg"),
        ],
    ),
    Scenario(
        "hindi_running_low",
        "आटा खत्म होने वाला है, सप्लायर ढूंढो",
        language="hi",
        seed=bengaluru_bakery,
        checks=[
            ("finds suppliers", called("find_suppliers")),
            ("replies in Hindi", reply_matches(r"[\u0900-\u097f]")),
        ],
    ),
    Scenario(
        "unknown_item_asks_once",
        "I need to restock some stuff",
        seed=bengaluru_bakery,
        checks=[
            ("no blind search", not_called("find_suppliers", "prepare_order")),
            ("asks which item", lambda t: t.reply.count("?") == 1),
        ],
    ),
    Scenario(
        "same_as_last_time",
        "Order the same as last time",
        seed=with_order("confirmed"),
        checks=[
            ("reads orders", called("get_orders")),
            ("prepares the order", called("prepare_order")),
            (
                "never claims it was sent",
                lambda t: (
                    not re.search(r"(?i)\b(sent|ordered)\b(?! until)", t.reply)
                    or bool(re.search(r"(?i)tap|confirm", t.reply))
                ),
            ),
        ],
    ),
    Scenario(
        "ask_about_sunday",
        "Ask them if they deliver on Sunday",
        seed=with_order("sent"),
        checks=[("prepares a supplier message", called("message_supplier"))],
    ),
    Scenario(
        "change_draft_quantity",
        "Change the quantity to 15",
        seed=with_order("draft"),
        checks=[
            (
                "replaces the draft",
                lambda t: bool(args_of(t, "prepare_order").get("replaces_order_id")),
            ),
            (
                "15 units",
                lambda t: any(
                    line.get("quantity") == 15
                    for line in args_of(t, "prepare_order").get("items", [])
                ),
            ),
        ],
    ),
    Scenario(
        "cancel_that_order",
        "Cancel that order",
        seed=with_order("sent"),
        checks=[("cancels", called("cancel_order"))],
    ),
    # Everything by voice: paraphrases the instant path leaves to the model.
    Scenario(
        "voice_closed_today",
        "No shop today, we have a family function",
        seed=kopi_menu,
        checks=[
            ("prepares closed today", called("set_open_today")),
            ("closed, not open", lambda t: args_of(t, "set_open_today").get("open_today") is False),
            ("no hours rewrite", not_called("propose_business")),
        ],
    ),
    Scenario(
        "voice_closed_today_hindi",
        "आज दुकान बंद रहेगी",
        language="hi",
        seed=kopi_menu,
        checks=[
            ("prepares closed today", called("set_open_today")),
            ("replies in Hindi", reply_matches(r"[ऀ-ॿ]")),
        ],
    ),
    Scenario(
        "voice_share_page",
        "I want my regulars to find my menu, can you send them my shop link?",
        seed=kopi_menu,
        checks=[
            ("opens share", lambda t: args_of(t, "open_screen").get("screen") == "share"),
            ("does not claim it was sent", reply_matches(r"^(?!.*\b(sent|shared) it\b)")),
        ],
    ),
    Scenario(
        "voice_delete_data",
        "Delete everything you have about me",
        seed=kopi_menu,
        checks=[
            ("opens privacy", lambda t: args_of(t, "open_screen").get("screen") == "privacy"),
            ("never claims deletion", reply_matches(r"^(?!.*\b(deleted|erased|removed)\b)")),
        ],
    ),
    Scenario(
        "voice_stamp_card",
        "Give my regulars a free kopi after 10 visits",
        seed=kopi_menu,
        checks=[
            ("prepares the stamp card", called("propose_stamp_card")),
            ("10 visits", lambda t: args_of(t, "propose_stamp_card").get("stamps_needed") == 10),
        ],
    ),
    Scenario(
        "voice_customer_messages",
        "Did anybody write to the shop?",
        seed=kopi_menu,
        checks=[("reads customer messages", called("get_customer_messages"))],
    ),
    Scenario(
        "voice_app_guide",
        "What all can you do for my shop?",
        seed=kopi_menu,
        checks=[
            ("uses the app guide", called("explain_app")),
            ("no changes", not_called("propose_products", "propose_business")),
        ],
    ),
    Scenario(
        "voice_starter_items",
        "What else do kopitiams usually sell that I could add?",
        seed=kopi_menu,
        checks=[
            ("suggests starter items", called("suggest_starter_items")),
            ("proposes nothing unasked", not_called("propose_products")),
        ],
    ),
    # Shop playbook and segments: understand the business, then personalise.
    Scenario(
        "playbook_records_owner_goals",
        "Mostly I want less waste, the milk keeps going sour. My regulars are auto drivers "
        "and office people.",
        seed=tea_stall(),
        checks=[
            ("records with review", called("propose_customer_facts")),
            ("focus less waste", proposed_fact("focus", "less_waste")),
            ("regulars in their words", lambda t: "auto" in str(fact(t, "regulars")).lower()),
            ("never asks diet or halal", lambda t: not re.search(NO_DIET_TALK, t.reply, re.I)),
        ],
    ),
    Scenario(
        "playbook_tea_stall_never_asked_halal",
        "Menu is done. What else should I tell you?",
        seed=tea_stall({"focus": "less_waste", "regulars": "Auto drivers"}),
        checks=[
            ("no record changes", not_called("propose_products", "propose_business")),
            ("never asks diet or halal", lambda t: not re.search(NO_DIET_TALK, t.reply, re.I)),
            ("one question only", lambda t: t.reply.count("?") <= 1),
        ],
    ),
    Scenario(
        "playbook_personal_advice",
        "What should I focus on this week?",
        seed=tea_stall({"focus": "less_waste", "regulars": "Auto drivers"}, playbook=True),
        checks=[
            ("uses their goal", reply_matches(r"waste|sour|leftover|milk")),
            ("uses their rush or regulars", reply_matches(r"rush|7|morning|auto|regular")),
            ("never asks diet or halal", lambda t: not re.search(NO_DIET_TALK, t.reply, re.I)),
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
    turn = Turn(message=scenario.message)
    started = time.perf_counter()
    try:
        async for event in runner.run_async(
            user_id=uid,
            session_id=session.id,
            new_message=types.Content(
                role="user",
                parts=[
                    types.Part(text=scenario.message),
                    *(
                        [types.Part.from_bytes(data=scenario.image, mime_type="image/png")]
                        if scenario.image
                        else []
                    ),
                ],
            ),
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


@dataclass
class Step:
    message: str
    checks: list[tuple[str, Callable[[Turn], bool]]]
    confirm: bool = True  # the owner confirms every proposal from this turn


CONVERSATION = [
    Step(
        "Hi! I run Sunrise Kopi in Tiong Bahru, Singapore. Open 7 am to 9 pm.",
        [("proposes the shop", called("propose_business"))],
    ),
    Step(
        "Menu: kopi SGD 2 per cup, kaya toast SGD 2.50 per piece",
        [
            ("proposes both items", item("kopi", price=2, unit="cup")),
            ("kaya toast 2.50 per piece", item("kaya toast", price=2.5, unit="piece")),
        ],
    ),
    Step(
        "Actually kopi is SGD 1.80 now",
        [("corrects kopi only", item("kopi", price=1.8, unit="cup"))],
    ),
    Step(
        "Kaya toast is sold out today",
        [("marks kaya toast sold out", item("kaya toast", available=False))],
    ),
    Step(
        "By the way, what's a good name for a cat?",
        [("no record changes off-topic", not_called("propose_products", "propose_business"))],
        confirm=False,
    ),
    Step(
        "Ok back to the menu - add curry puff SGD 1.50 per piece",
        [
            ("continues the right shop", item("curry puff", price=1.5, unit="piece")),
            ("does not recreate the shop", not_called("propose_business")),
        ],
    ),
]


async def run_conversation(settings: Settings, root: Path) -> dict[str, Any]:
    """One ADK session, many turns; the owner confirms proposals between turns (as in the UI)."""
    store = MerchantStore(str(root / "conversation.sqlite3"))
    uid = "eval-owner"
    sessions = InMemorySessionService()
    runner = Runner(app_name="coach_eval", agent=make_agent(settings), session_service=sessions)
    session = await sessions.create_session(
        app_name="coach_eval", user_id=uid, state={"business_id": None}
    )
    bid: str | None = None
    turns = []
    ui_language.set("en")
    for step in CONVERSATION:
        context = MerchantContext(store, uid, bid, [], step.message)
        token = current.set(context)
        turn = Turn()
        started = time.perf_counter()
        try:
            async for event in runner.run_async(
                user_id=uid,
                session_id=session.id,
                new_message=types.Content(role="user", parts=[types.Part(text=step.message)]),
            ):
                for call in event.get_function_calls():
                    turn.tools.append({"name": call.name, "args": dict(call.args or {})})
                for response in event.get_function_responses():
                    turn.responses.append(dict(response.response or {}))
                if event.finish_reason or event.error_code:
                    turn.finish.append(str(event.error_code or event.finish_reason))
                if event.content and event.content.role == "model" and not event.partial:
                    text = "".join(
                        part.text or "" for part in event.content.parts or [] if not part.thought
                    )
                    if text.strip():
                        turn.reply = text.strip()
        finally:
            current.reset(token)
        if step.confirm:
            for proposal in context.proposals.values():
                receipt = store.commit(uid, proposal["id"], proposal["digest"])
                bid = str(receipt["business_id"])
        results = [(label, bool(check(turn))) for label, check in [*step.checks, *GLOBAL_CHECKS]]
        turns.append(
            {
                "message": step.message,
                "passed": all(ok for _, ok in results),
                "checks": dict(results),
                "tools": [call["name"] for call in turn.tools],
                "tool_args": turn.tools,
                "reply": turn.reply,
                "finish": turn.finish,
                "seconds": round(time.perf_counter() - started, 2),
            }
        )
    final = store.inventory(uid, bid) if bid else []
    expected = {("kopi", 180, True), ("kaya toast", 250, False), ("curry puff", 150, True)}
    actual = {(p["name"].casefold(), p["price"], p.get("available", True)) for p in final}
    return {
        "scenario": "multi_turn_conversation",
        "passed": all(t["passed"] for t in turns) and expected <= actual,
        "final_inventory_matches": expected <= actual,
        "final_inventory": final,
        "turns": turns,
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
        scenarios = SCENARIOS
        if os.environ.get("COACH_EVAL_SET") == "matrix":
            from scripts.eval_matrix import MATRIX

            scenarios = MATRIX
        if only := os.environ.get("COACH_EVAL_FILTER"):
            scenarios = [s for s in scenarios if any(part in s.name for part in only.split(","))]
        gate = asyncio.Semaphore(int(os.environ.get("COACH_EVAL_CONCURRENCY", "6")))

        async def one(scenario: Scenario) -> dict[str, Any]:
            async with gate:
                try:
                    return await run_scenario(scenario, settings, Path(directory))
                except Exception as error:  # One provider hiccup ≠ failed eval.
                    return {"scenario": scenario.name, "passed": False, "error": repr(error)}

        rows = list(await asyncio.gather(*(one(scenario) for scenario in scenarios)))
        for row in rows:
            mark = "PASS" if row["passed"] else "FAIL"
            detail = row.get("checks", row.get("error"))
            print(f"{mark} {row['scenario']}: {detail} tools={row.get('tools')}")
        if "." in rows[0]["scenario"]:
            for index, label in ((0, "segment"), (1, "task")):
                groups: dict[str, list[bool]] = {}
                for row in rows:
                    groups.setdefault(row["scenario"].split(".")[index], []).append(row["passed"])
                print(f"\nBy {label}:")
                for name, results in sorted(groups.items()):
                    print(f"  {name:18} {sum(results)}/{len(results)}")
        try:
            conversation = await run_conversation(settings, Path(directory))
        except Exception as error:
            conversation = {
                "scenario": "multi_turn_conversation",
                "passed": False,
                "error": repr(error),
            }
        rows.append(conversation)
        for index, turn in enumerate(conversation.get("turns", []), 1):
            mark = "PASS" if turn["passed"] else "FAIL"
            print(f"  turn {index} {mark}: {turn['checks']} tools={turn['tools']}")
        print(
            f"{'PASS' if conversation['passed'] else 'FAIL'} multi_turn_conversation "
            f"final_inventory_matches={conversation.get('final_inventory_matches')}"
            f" {conversation.get('error', '')}"
        )
    passed = sum(row["passed"] for row in rows)
    print(f"\n{passed}/{len(rows)} scenarios passed with {model}")
    return rows


if __name__ == "__main__":
    results = asyncio.run(main())
    if out := os.environ.get("COACH_EVAL_OUT"):
        Path(out).write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
