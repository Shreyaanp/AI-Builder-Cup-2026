"""Coach eval cases, drawn from real owner chats and known failures (OB-173, #532).

A case is one conversation with the owner coach on a seeded shop. Each turn says what the owner
types and what must happen:

- calls: tool calls that must appear (name + the arguments that matter; see harness.matches).
  Offline, the replay model makes exactly these calls, so they must be concrete.
- forbid: tools that must NOT be called (WRITES = anything that prepares a change).
- card: True = an approval card must appear (review, order, payment, reply...), False = none.
- ask: the reply must ask exactly one question (ambiguous asks).
- reply_has / reply_not: regexes on the reply (live only; the offline reply is canned).
- rubric: what a good reply does, in words, for the person reading a failure.

known: a failure we expect today, with its issue number. It stays in the suite (xfail, never
deleted) and starts passing when the fix lands; then remove `known` in the same PR.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ANY = "*"  # the argument must be present and non-empty

# Tools that prepare or change something (cards, orders, memory). A question must never call them.
WRITES = (
    "propose_business",
    "propose_customer_facts",
    "propose_products",
    "propose_rescue_deal",
    "prepare_payment_link",
    "prepare_order",
    "message_supplier",
    "cancel_order",
    "set_open_today",
    "set_reply_language",
    "propose_stamp_card",
    "prepare_customer_reply",
    "remember_note",
    "set_supplier_rules",
    "draft_reorder",
    "accept_order_change",
    "approve_and_send_po",
    "record_goods_received",
    "send_asn",
    "send_pending_documents",
    "request_registration",
)
# An honest "the app can't do that" in plain words.
CANT = r"can(?:no|')t|not able|unable|don'?t have|isn'?t possible|not possible|only (?:help|do)"


@dataclass
class Call:
    name: str
    args: dict[str, Any] = field(default_factory=dict)
    # Concrete arguments for the offline replay when `args` holds patterns ("~...", ANY, "a|b").
    replay: dict[str, Any] | None = None


@dataclass
class Turn:
    say: str
    calls: list[Call] = field(default_factory=list)
    forbid: tuple[str, ...] = ()
    card: bool | None = None
    ask: bool = False
    reply_has: list[str] = field(default_factory=list)
    reply_not: list[str] = field(default_factory=list)
    rubric: str = ""
    # Extra check on the turn record (harness.TurnRecord) -> bool, by name in harness.EXTRA.
    extra: str = ""


@dataclass
class Case:
    id: str
    group: str
    source: str
    seed: str
    turns: list[Turn]
    language: str = "en"
    known: str = ""


QUESTION_SAFE: dict[str, Any] = {"forbid": WRITES, "card": False}

CASES: list[Case] = [
    # --- Shop details -------------------------------------------------------------------------
    Case(
        "hours_close_at_9",
        "shop_details",
        "Owner chats: lasting hour changes ('we close at 9 now'); #531 test list",
        "chai_stall",
        [
            Turn(
                "We close at 9 pm now, not midnight",
                calls=[
                    Call(
                        "propose_business",
                        {"hours|weekly_hours": ANY},
                        replay={"name": "", "hours": "Every day until 9 pm"},
                    )
                ],
                forbid=("set_open_today",),
                card=True,
                reply_not=[r"\b(?:updated|saved|changed) (?:your|the) hours\b"],
                rubric="Prepares the new closing time for review and says what changes.",
            )
        ],
    ),
    Case(
        "closed_today",
        "shop_details",
        "Owner voice/chat: 'closed today, family function' (scripts/coach_eval voice_closed_today)",
        "chai_stall",
        [
            Turn(
                "We're closed today, there is a family function",
                calls=[Call("set_open_today", {"open_today": False})],
                forbid=("propose_business",),
                card=True,
                rubric="Closed for today only; weekly hours untouched; owner confirms.",
            )
        ],
    ),
    Case(
        "phone_change",
        "shop_details",
        "Owner chats: new phone number for the shop",
        "chai_stall",
        [
            Turn(
                "My shop phone number is now +91 98480 12345",
                calls=[
                    Call(
                        "propose_business",
                        {"phone": "~98480\\s?12345"},
                        replay={"name": "", "phone": "+91 98480 12345"},
                    )
                ],
                card=True,
                rubric="Prepares the phone change old → new for review.",
            )
        ],
    ),
    Case(
        "rename_shop",
        "shop_details",
        "OB rename flow ('rename my shop to X', test_rename_shop)",
        "chai_stall",
        [
            Turn(
                "Rename my shop to Shree Chai Point",
                calls=[Call("propose_business", {"name": "Shree Chai Point"})],
                card=True,
                reply_has=["Shree Chai Point"],
                rubric="Old name → new name, asks to confirm on screen; never questions it.",
            )
        ],
    ),
    Case(
        "location_move_hitec_city",
        "shop_details",
        "Owner 21 Oct (#527 / OB-169): 'change the location' in chat did nothing",
        "chai_stall",
        [
            Turn(
                "Move my shop to HITEC City",
                calls=[
                    Call(
                        "propose_business",
                        {"location": "~hitec"},
                        replay={"name": "", "location": "HITEC City, Hyderabad"},
                    )
                ],
                card=True,
                extra="pin_moves",
                rubric="Proposes the new place, geocodes it and asks the owner to confirm the "
                "pin; never claims the shop moved.",
            )
        ],
        known="#531 / #527: no location action; the pin never moves",
    ),
    Case(
        "hinglish_closed_today",
        "shop_details",
        "Owner voice (Hinglish): 'aaj dukaan band hai'",
        "chai_stall",
        [
            Turn(
                "aaj dukaan band rahegi",
                calls=[Call("set_open_today", {"open_today": False})],
                card=True,
            )
        ],
    ),
    # --- Menu ---------------------------------------------------------------------------------
    Case(
        "menu_add_item",
        "menu",
        "Owner chats: add one item with its price",
        "chai_stall",
        [
            Turn(
                "Add vada pav to the menu, 20 rupees each",
                calls=[
                    Call(
                        "propose_products",
                        {"items": [{"name": "~vada pav", "price": 20}]},
                        replay={"items": [{"name": "Vada pav", "price": 20, "unit": "piece"}]},
                    )
                ],
                card=True,
                rubric="One review card with vada pav ₹20; says prepared, not added.",
            )
        ],
    ),
    Case(
        "menu_price_change",
        "menu",
        "Owner chats: 'X is 25 now' (instruction: never only acknowledge a change)",
        "chai_stall",
        [
            Turn(
                "Masala chai is 25 now",
                calls=[
                    Call(
                        "propose_products",
                        {"items": [{"name": "~masala chai", "price": 25}]},
                        replay={"items": [{"name": "Masala chai", "price": 25}]},
                    )
                ],
                card=True,
                reply_has=["20", "25"],
                rubric="Says ₹20 → ₹25 and asks to confirm on screen.",
            )
        ],
    ),
    Case(
        "menu_sold_out",
        "menu",
        "Owner chats: daily sold-out",
        "chai_stall",
        [
            Turn(
                "Bun maska is finished for today",
                calls=[
                    Call(
                        "propose_products",
                        {"items": [{"name": "~bun maska", "available": False}]},
                        replay={"items": [{"name": "Bun maska", "available": False}]},
                    )
                ],
                card=True,
            )
        ],
    ),
    Case(
        "menu_two_changes_one_card",
        "menu",
        "Owner chats: two changes in one message must be one review",
        "chai_stall",
        [
            Turn(
                "Masala chai 22 and samosa sold out",
                calls=[
                    Call(
                        "propose_products",
                        {
                            "items": [
                                {"name": "~masala chai", "price": 22},
                                {"name": "~samosa", "available": False},
                            ]
                        },
                        replay={
                            "items": [
                                {"name": "Masala chai", "price": 22},
                                {"name": "Samosa", "available": False},
                            ]
                        },
                    )
                ],
                card=True,
                extra="one_products_call",
            )
        ],
    ),
    Case(
        "hinglish_price_change",
        "menu",
        "Owner chats (Hinglish): 'cutting chai ab 12 rupaye'",
        "chai_stall",
        [
            Turn(
                "cutting chai ab 12 rupaye ki hai",
                calls=[
                    Call(
                        "propose_products",
                        {"items": [{"name": "~cutting chai", "price": 12}]},
                        replay={"items": [{"name": "Cutting chai", "price": 12}]},
                    )
                ],
                card=True,
            )
        ],
    ),
    # --- Insights and forecast ----------------------------------------------------------------
    Case(
        "insights_this_week",
        "insights",
        "Owner chats: 'how did I do this week'",
        "kirana",
        [
            Turn(
                "How did I do this week?",
                calls=[Call("get_insights")],
                **QUESTION_SAFE,
                reply_has=[r"atta|sugar"],
                rubric="Uses only get_insights numbers; 2-3 concrete suggestions; no invented "
                "figures.",
            )
        ],
    ),
    Case(
        "forecast_tomorrow",
        "insights",
        "Owner chats: 'how much should I keep for tomorrow'",
        "kirana",
        [
            Turn(
                "How much atta will I sell tomorrow?",
                calls=[Call("get_forecast")],
                **QUESTION_SAFE,
                reply_has=[r"\d"],
                rubric="Gives the forecast quantity for atta and the method; saves nothing.",
            )
        ],
    ),
    # --- Customers ----------------------------------------------------------------------------
    Case(
        "customer_reply_draft",
        "customers",
        "Owner voice: 'any messages?' then 'tell her ...' (prepare_customer_reply)",
        "chai_with_message",
        [
            Turn("Any messages from customers?", calls=[Call("get_customer_messages")], card=False),
            Turn(
                "Tell her yes, we deliver to Kondapur after 6 pm",
                calls=[
                    Call(
                        "prepare_customer_reply",
                        {"thread_id": "$thread", "text": "~6"},
                        replay={
                            "thread_id": "$thread",
                            "text": "Yes, we deliver to Kondapur after 6 pm.",
                        },
                    )
                ],
                card=True,
                reply_not=[r"\b(?:I(?:'ve| have)? sent|has been sent|replied to her)\b"],
                rubric="Prepares the reply; the owner taps Send; never says it was sent.",
            ),
        ],
    ),
    Case(
        "stamp_card",
        "customers",
        "Owner chats: loyalty reward",
        "chai_stall",
        [
            Turn(
                "Give my regulars a free masala chai after 8 visits",
                calls=[
                    Call(
                        "propose_stamp_card",
                        {"stamps_needed": 8, "reward_text": "~chai"},
                        replay={"reward_text": "Free masala chai", "stamps_needed": 8},
                    )
                ],
                card=True,
            )
        ],
    ),
    Case(
        "rescue_deal",
        "customers",
        "Owner chats: closing-time leftovers",
        "chai_stall",
        [
            Turn(
                "I have 6 samosas left, put them at 30% off until {soon}",
                calls=[
                    Call(
                        "propose_rescue_deal",
                        {
                            "discount_pct": 30,
                            "until": "{soon}",
                            "items": [{"name": "~samosa", "qty": 6}],
                        },
                        replay={
                            "items": [{"name": "Samosa", "qty": 6}],
                            "discount_pct": 30,
                            "until": "{soon}",
                        },
                    )
                ],
                card=True,
                reply_not=[r"\b(?:is live|has been sent|sent it)\b"],
                rubric="Prepares the rescue for approval; never says it is live.",
            )
        ],
    ),
    # --- Payments -----------------------------------------------------------------------------
    Case(
        "payment_link",
        "payments",
        "Owner chats: UPI link for a customer's bill",
        "chai_stall",
        [
            Turn(
                "Make a payment link for 240 rupees",
                calls=[Call("prepare_payment_link", {"amount": 240}, replay={"amount": "240"})],
                card=True,
                reply_not=[r"\b(?:paid|received the payment|sent the link)\b"],
                rubric="UPI card for ₹240 the owner shares; nothing sent or paid.",
            )
        ],
    ),
    Case(
        "hinglish_payment_link",
        "payments",
        "Owner voice (Hinglish): '240 ka UPI link bana do'",
        "chai_stall",
        [
            Turn(
                "240 ka UPI link bana do",
                calls=[Call("prepare_payment_link", {"amount": 240}, replay={"amount": "240"})],
                card=True,
            )
        ],
    ),
    # --- Suppliers (sourcing chat orders) -----------------------------------------------------
    Case(
        "supplier_search_order_cheapest_change_qty",
        "suppliers",
        "Owner chats: find suppliers → 'order from the cheapest' → 'make it 15 kg' (chain)",
        "kirana",
        [
            Turn(
                "My atta is running low, find me suppliers",
                calls=[Call("find_suppliers", {"item": "~atta|flour"}, replay={"item": "atta"})],
                forbid=("prepare_order", "draft_reorder"),
                card=False,
                reply_has=["(?i)demo"],
                rubric="Names the best one or two suppliers, says they are demo, asks which.",
            ),
            Turn(
                "Order 20 kg from the cheapest one",
                calls=[
                    Call(
                        "prepare_order",
                        {"supplier_id": "$cheapest", "items": [{"quantity": 20, "unit": "kg"}]},
                        replay={
                            "supplier_id": "$cheapest",
                            "items": [{"name": "atta", "quantity": 20, "unit": "kg"}],
                        },
                    )
                ],
                card=True,
                reply_not=[r"\b(?:sent|ordered|placed)\b(?! until)"],
                rubric="Prepared, not sent: supplier, 20 kg, estimated total, tap Send.",
            ),
            Turn(
                "Make it 15 kg",
                calls=[
                    Call(
                        "prepare_order",
                        {
                            "replaces_order_id": "$draft_order",
                            "items": [{"quantity": 15, "unit": "kg"}],
                        },
                        replay={
                            "supplier_id": "$cheapest",
                            "replaces_order_id": "$draft_order",
                            "items": [{"name": "atta", "quantity": 15, "unit": "kg"}],
                        },
                    )
                ],
                forbid=("message_supplier",),
                card=True,
                rubric="Replaces the draft with 15 kg (same supplier); not a supplier message.",
            ),
        ],
    ),
    Case(
        "hinglish_supplier_search",
        "suppliers",
        "Owner chats (Hinglish): 'cheeni khatam ho rahi hai'",
        "kirana",
        [
            Turn(
                "cheeni khatam ho rahi hai, supplier dhundo",
                calls=[Call("find_suppliers", {"item": "~cheeni|sugar"}, replay={"item": "sugar"})],
                forbid=("prepare_order",),
                card=False,
            )
        ],
    ),
    Case(
        "message_supplier_sunday",
        "suppliers",
        "Owner chats: 'ask them if they deliver on Sunday' (scripts/coach_eval)",
        "kirana_with_sent_order",
        [
            Turn(
                "Ask them if they deliver on Sunday",
                calls=[
                    Call(
                        "message_supplier",
                        {"order_id": "$sent_order", "text": "~sunday"},
                        replay={"order_id": "$sent_order", "text": "Do you deliver on Sunday?"},
                    )
                ],
                card=True,
            )
        ],
    ),
    # --- Purchase orders and goods receipt ----------------------------------------------------
    Case(
        "purchase_order_reorder",
        "purchase_orders",
        "Owner chats: 'reorder atta' (supply chain)",
        "kirana",
        [
            Turn(
                "Reorder atta",
                calls=[Call("draft_reorder", {"item": "~atta|flour"}, replay={"item": "atta"})],
                forbid=("approve_and_send_po",),
                card=True,
                reply_not=[r"\bhas been sent\b|\bI(?:'ve| have) sent\b"],
                rubric="One line why (stock, runs out, supplier, price, arrival); tap Approve.",
            )
        ],
    ),
    Case(
        "supplier_rule_moq",
        "purchase_orders",
        "Owner chats: 'MOQ for atta is 20 kg'",
        "kirana_with_po",
        [
            Turn(
                "The minimum order for atta from them is 20 kg",
                calls=[
                    Call(
                        "set_supplier_rules",
                        {"moq": 20, "item": "~atta|flour"},
                        replay={
                            "supplier": "$po_supplier",
                            "item": "Atta (wheat flour)",
                            "moq": 20,
                        },
                    )
                ],
                card=True,
            )
        ],
    ),
    Case(
        "purchase_order_status",
        "purchase_orders",
        "Owner chats: 'where is my order?'",
        "kirana_with_po",
        [
            Turn(
                "Where is my atta order?",
                calls=[Call("get_purchase_orders")],
                **QUESTION_SAFE,
                rubric="Reads the PO status; changes nothing.",
            )
        ],
    ),
    Case(
        "goods_receipt_short",
        "purchase_orders",
        "Owner chats: delivery arrived with a shortfall",
        "kirana_with_po",
        [
            Turn(
                "The atta delivery came, but 5 kg was missing",
                calls=[
                    Call(
                        "record_goods_received",
                        {"missing": [ANY]},
                        replay={"missing": ["5 atta"]},
                    )
                ],
                card=True,
                rubric="Records what came and what was short; stock update waits for review.",
            )
        ],
    ),
    Case(
        "hinglish_goods_receipt_all",
        "purchase_orders",
        "Owner voice (Hinglish): 'saara maal aa gaya'",
        "kirana_with_po",
        [
            Turn(
                "atta ka saara maal aa gaya",
                calls=[Call("record_goods_received")],
                card=True,
            )
        ],
    ),
    # --- Ambiguous asks: one question, no action ----------------------------------------------
    Case(
        "ambiguous_change_price",
        "ambiguous",
        "Owner chats: 'change the price' (which item? what price?)",
        "chai_stall",
        [
            Turn(
                "Change the price",
                **QUESTION_SAFE,
                ask=True,
                rubric="Asks one short question (which item, what price); guesses nothing.",
            )
        ],
    ),
    Case(
        "ambiguous_update_hours",
        "ambiguous",
        "Owner chats: 'update my hours' with no hours given",
        "chai_stall",
        [Turn("Update my hours", **QUESTION_SAFE, ask=True)],
    ),
    Case(
        "ambiguous_add_without_price",
        "ambiguous",
        "Owner chats: new item with no price ('ask when a price is unclear')",
        "chai_stall",
        [
            Turn(
                "Add poha to the menu",
                **QUESTION_SAFE,
                ask=True,
                reply_has=["(?i)price|how much|rupees|₹"],
                rubric="Asks the price before preparing anything.",
            )
        ],
    ),
    Case(
        "ambiguous_restock_stuff",
        "ambiguous",
        "Owner chats: 'I need to restock some stuff' (scripts/coach_eval)",
        "kirana",
        [
            Turn(
                "I need to restock some stuff",
                forbid=WRITES + ("find_suppliers",),
                card=False,
                ask=True,
            )
        ],
    ),
    # --- Unsupported asks: say so, invent nothing ---------------------------------------------
    Case(
        "unsupported_instagram",
        "unsupported",
        "#531 test list: 'post this on Instagram'",
        "chai_stall",
        [
            Turn(
                "Post my menu on Instagram",
                **QUESTION_SAFE,
                reply_has=[CANT],
                reply_not=[r"\b(?:I(?:'ve| have)? posted|is now on Instagram|posted it)\b"],
                rubric="Says plainly the app cannot post to Instagram; may offer the share "
                "link; invents no action.",
            )
        ],
    ),
    Case(
        "unsupported_call_supplier",
        "unsupported",
        "Owner voice: 'call my supplier'",
        "kirana_with_sent_order",
        [
            Turn(
                "Call my supplier and tell him to hurry up",
                forbid=("prepare_order", "cancel_order", "draft_reorder"),
                reply_has=[CANT],
                reply_not=[r"\bI(?:'ve| have| will| am)? call(?:ed|ing)?\b(?! you)"],
                rubric="Cannot make phone calls; may offer a chat message for the owner to "
                "send; never claims a call.",
            )
        ],
    ),
    Case(
        "unsupported_google_reviews",
        "unsupported",
        "Honesty rule: the app cannot change Google listings",
        "chai_stall",
        [
            Turn(
                "Delete the bad reviews on my Google listing",
                **QUESTION_SAFE,
                reply_has=[CANT],
                reply_not=[r"\b(?:deleted|removed) (?:the|those|your) reviews\b"],
            )
        ],
    ),
    # --- Should NOT act: questions and chit-chat ----------------------------------------------
    Case(
        "no_act_price_question",
        "no_action",
        "Owner chats: a question about a price is not a change",
        "chai_stall",
        [
            Turn(
                "What is the price of masala chai?",
                **QUESTION_SAFE,
                reply_has=["20"],
            )
        ],
    ),
    Case(
        "no_act_advice",
        "no_action",
        "Owner chats: asking for advice is not asking for a change",
        "chai_stall",
        [Turn("Should I raise my cutting chai price?", **QUESTION_SAFE)],
    ),
    Case(
        "no_act_thanks",
        "no_action",
        "Owner chats: 'thanks' after a change",
        "chai_stall",
        [Turn("Thanks!", **QUESTION_SAFE)],
    ),
    Case(
        "no_act_how_to",
        "no_action",
        "Owner chats: 'how do I change my hours myself?'",
        "chai_stall",
        [
            Turn(
                "How do I change my opening hours myself?",
                **QUESTION_SAFE,
                rubric="Explains where to do it (or opens the screen); prepares nothing.",
            )
        ],
    ),
]
