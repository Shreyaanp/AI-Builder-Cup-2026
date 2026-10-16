"""Coach tools that make every owner feature doable by conversation (voice or text).

Same boundary as coordinator.py: tools read, prepare a review, or open a screen. Nothing is
saved, sent or deleted here; the owner confirms on screen (review dialog, Send, or the
confirmation on the page the tool opens).
"""

from typing import Any, Literal

from fastapi import HTTPException

from .app_guide import explain_app
from .coordinator import _card, _invalid, _propose_shop, current
from .sales import today_for
from .starter_templates import starter_items

__all__ = [
    "explain_app",
    "get_customer_messages",
    "open_screen",
    "prepare_customer_reply",
    "propose_stamp_card",
    "set_open_today",
    "suggest_starter_items",
]

Screen = Literal[
    "messages",
    "share",
    "sold_out",
    "menu",
    "details",
    "stamps",
    "plan",
    "close_day",
    "google",
    "privacy",
    "import",
    "photo",
    "today",
    "shop",
    "grow",
    "you",
    "trust",
    "games",
]
SCREENS: dict[str, str] = {
    "messages": "Customer messages",
    "share": "Customer page and QR code",
    "sold_out": "Sold out items",
    "menu": "Menu",
    "details": "Shop details and photos",
    "stamps": "Stamp card",
    "plan": "Plan tomorrow",
    "close_day": "Close the day",
    "google": "Get on Google",
    "privacy": "Your data and privacy",
    "import": "Import sales or connect a POS",
    "photo": "Add a photo",
    "today": "Today",
    "shop": "Shop",
    "grow": "Grow",
    "you": "You",
    "trust": "Verify it's you",
    "games": "Stamps and perks",
}
# Screens where the owner still has to act (the app opens them; nothing changes by itself).
CONFIRM_THERE = {
    "share": "Tell the owner to switch the page on there if it is off; it is not shared yet.",
    "privacy": "Deleting data happens only after the owner confirms on that page. Never say "
    "anything was deleted.",
    "import": "The owner picks the file; the coach maps the columns and they confirm.",
    "photo": "The owner picks the photo; nothing is added until they confirm.",
    "google": "The owner finishes on Google's own pages; we never publish to Google.",
    "close_day": "The owner photographs the day's sales; they confirm the totals.",
    "trust": "Face checks are optional and never establish business ownership. The owner "
    "starts or deletes a check there; opening the page does neither.",
    "games": "Customer games live in the passport. Owners choose their rewards on Grow; "
    "never claim a prize or stamp was issued by opening the page.",
}


def open_screen(screen: Screen) -> dict[str, Any]:
    """Open a screen of the app for the owner, by voice, instead of them tapping through menus:
    messages (reply to customers), share (customer page, link and QR), sold_out, menu, details
    (shop details, photos), stamps (stamp card), plan (plan tomorrow), close_day (read today's
    sales book), google (Get on Google next step), privacy (download or delete my data), import
    (connect a POS or sales file), photo (add a menu or shop photo). Opening never changes
    anything; say what they can do there in one sentence. Also today (daily priorities on
    Coach), shop, grow (owner tools and perks), you (settings), trust (optional check), games
    (owner stamp and perk settings; customer games live in the passport)."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    if screen not in SCREENS:
        return _invalid(ValueError(f"screen: use one of {', '.join(SCREENS)}"), ctx)
    if not ctx.business_id and screen not in {"photo", "privacy", "you", "trust"}:
        return {"status": "needs_business"}
    card_id = _card(
        ctx, "action", {"target": screen, "label": SCREENS[screen], "business_id": ctx.business_id}
    )
    return {
        "status": "opened",
        "card_id": card_id,
        "screen": SCREENS[screen],
        **({"instruction": CONFIRM_THERE[screen]} if screen in CONFIRM_THERE else {}),
    }


def set_open_today(open_today: bool) -> dict[str, Any]:
    """Prepare "we are closed today" (open_today=false) or "we are open again today"
    (open_today=true) for the owner to confirm. Customers then see the shop closed for the rest
    of today only; the weekly hours do not change. For lasting hour changes use
    propose_business with weekly_hours instead."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    shop = ctx.store.context(ctx.uid, ctx.business_id)["business"]
    fields = (shop or {}).get("fields", {})
    today = today_for(fields).isoformat()
    closed = fields.get("closed_on") == today
    if closed != open_today:
        return {"status": "no_change", "closed_today": closed}
    result = _propose_shop(name="", closed_on="" if open_today else today)
    if result.get("status") == "needs_review":
        result["changes"] = ["Open again today" if open_today else f"Closed today ({today})"]
    return result


def propose_stamp_card(reward_text: str, stamps_needed: int = 8) -> dict[str, Any]:
    """Prepare the shop's stamp card for review: the reward in the owner's words ("Free masala
    chai", max 80 characters) and how many visits earn it (3-20, default 8). Customers collect
    one stamp per visit by scanning the shop's QR code."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    text = " ".join((reward_text or "").split())
    if not text:
        return _invalid(ValueError("reward_text: ask the owner what the reward is"), ctx)
    return _propose_shop(name="", reward_text=text[:80], stamps_needed=int(stamps_needed))


def get_customer_messages() -> dict[str, Any]:
    """Customer questions waiting for the owner, newest first: thread_id, the customer's first
    name and their last message. Use for "any messages?", "what did customers ask?" and before
    prepare_customer_reply. Contact details are never shown."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    threads = []
    for thread in ctx.store.inquiries(ctx.uid, ctx.business_id):
        if thread.done or thread.blocked:
            continue
        last = thread.messages[-1] if thread.messages else None
        threads.append(
            {
                "thread_id": thread.id,
                "customer": (thread.name or "A customer").split(" ")[0][:30],
                "last_message": (last.text if last else thread.message)[:200],
                "waiting_for_you": not last or last.author == "customer",
            }
        )
    waiting = [t for t in threads if t["waiting_for_you"]]
    return {"waiting": len(waiting), "threads": (waiting or threads)[:5]}


def prepare_customer_reply(thread_id: str, text: str) -> dict[str, Any]:
    """Prepare a reply to one customer thread (thread_id from get_customer_messages), written
    as the owner would say it, short and polite, in the customer's language. The owner taps
    Send to deliver it; never say it was sent."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    text = " ".join((text or "").split())[:500]
    if not text:
        return _invalid(ValueError("text: say what to reply"), ctx)
    try:
        thread = ctx.store.thread_action(ctx.uid, ctx.business_id, thread_id, "", "get")
    except HTTPException as error:
        return _invalid(error, ctx)
    last = thread.messages[-1].text if thread.messages else thread.message
    card_id = _card(
        ctx,
        "action",
        {
            "target": "reply",
            "label": "Reply to " + (thread.name or "customer").split(" ")[0][:30],
            "business_id": ctx.business_id,
            "thread_id": thread.id,
            "question": last[:200],
            "text": text,
        },
    )
    return {"status": "needs_owner_tap", "card_id": card_id, "reply": text}


def suggest_starter_items() -> dict[str, Any]:
    """Likely items for this kind of shop (tea shop: masala chai, samosa; tailor: blouse
    stitching…) that are not on the menu yet. They are suggestions without prices: offer two
    or three, ask the owner which they sell and at what price, then use propose_products. A menu
    photo or POS import is still the quickest and most accurate way."""
    ctx = current.get()
    if not ctx:
        return {"status": "unavailable"}
    if ctx.new_shop and ctx.new_shop_draft and ctx.new_shop_draft.business:
        fields = ctx.new_shop_draft.business.model_dump()
        names = [p.name for p in ctx.new_shop_draft.products]
    elif ctx.business_id:
        data = ctx.store.context(ctx.uid, ctx.business_id)
        fields = (data["business"] or {}).get("fields", {})
        names = [p["name"] for p in data["inventory"]]
    else:
        return {"status": "needs_business"}
    result = starter_items(fields.get("category", ""), fields.get("name", ""), names)
    if not result["suggestions"]:
        return {**result, "instruction": "No template for this kind of shop; ask what they sell."}
    return {**result, "instruction": "Suggestions only, no prices. Ask; never propose unasked."}
