"""Coach tools that make every owner feature doable by conversation (voice or text).

Same boundary as coordinator.py: tools read, prepare a review, or open a screen. Nothing is
saved, sent or deleted here; the owner confirms on screen (review dialog, Send, or the
confirmation on the page the tool opens).
"""

from typing import Any, Literal

from fastapi import HTTPException

from .app_guide import explain_app
from .coordinator import _card, _invalid, _propose_shop, current
from .playbook import coach_summary, migrate_stored
from .reply_language import LANGUAGES, find_language
from .sales import today_for
from .starter_templates import starter_items

__all__ = [
    "explain_app",
    "get_customer_messages",
    "get_shop_playbook",
    "make_my_icon",
    "open_screen",
    "prepare_customer_reply",
    "propose_stamp_card",
    "set_open_today",
    "set_reply_language",
    "suggest_starter_items",
    "use_photo_as_icon",
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
    "payments",
    "supply",
    "playbook",
    "connect",
    "icon",
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
    "payments": "Payments & rides",
    "supply": "Purchase orders",
    "playbook": "What Chalkboard knows about your shop",
    "connect": "Connect your system",
    "icon": "Shop icon",
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
    "payments": "The owner creates and shares the UPI link there; the app never handles money "
    "or confirms a payment, and no rider is booked.",
    "supply": "Purchase orders are only sent after the owner confirms each one.",
    "playbook": "The owner can edit or remove anything there; opening it changes nothing.",
    "connect": "The owner picks the file or paste and confirms the mapped import.",
    "icon": "The owner taps Make my icon or picks a photo there; nothing changes until they do.",
}


def open_screen(screen: Screen) -> dict[str, Any]:
    """Open a screen of the app for the owner, by voice, instead of them tapping through menus:
    messages (reply to customers), share (customer page, link and QR), sold_out, menu, details
    (shop details, photos), stamps (stamp card), plan (plan tomorrow), close_day (read today's
    sales book), google (Get on Google next step), privacy (download or delete my data), import
    (connect a POS or sales file), photo (add a menu or shop photo). Opening never changes
    anything; say what they can do there in one sentence. Also today (daily priorities on
    Coach), shop, grow (owner tools and perks), you (settings), trust (optional check), games
    (owner stamp and perk settings; customer games live in the passport), payments (UPI payment
    links and rides), supply (purchase orders to suppliers), playbook (what the app knows about
    the shop: goals, numbers, regulars; edit or remove), connect (POS or ERP import)."""
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


def _icon_card(mode: str, label: str, instruction: str) -> dict[str, Any]:
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    card_id = _card(
        ctx,
        "action",
        {"target": "icon", "label": label, "business_id": ctx.business_id, "mode": mode},
    )
    return {"status": "opened", "card_id": card_id, "instruction": instruction}


def make_my_icon() -> dict[str, Any]:
    """ "Make my icon" / "give my shop a logo": open the shop icon page where the owner taps
    Make my icon. The app draws a square icon from the shop's name, kind and place with Gemini's
    image model (each try costs a little, so three a day per shop) and falls back to a coloured
    monogram if it cannot. Never say the icon is made; the owner taps there and sees it."""
    return _icon_card(
        "generate",
        "Make my icon",
        "The owner taps Make my icon on that page and can try again or use their own photo.",
    )


def use_photo_as_icon() -> dict[str, Any]:
    """ "Use this photo as my icon": open the shop icon page so the owner can pick or take the
    photo, or choose one from the shop gallery; the app crops it to a square. The photo itself
    cannot travel through voice, so never say the icon was changed."""
    return _icon_card(
        "photo",
        "Use a photo as my icon",
        "The owner picks or takes the photo on that page and sees the square crop before saving.",
    )


def set_reply_language(language: str) -> dict[str, Any]:
    """Change the language you reply in, ONLY when the owner explicitly asks to (for example
    "English mein bolo", "speak Tamil"). language is the app code: en, hi, ta, te, kn, mr, bn,
    zh-Hans, ms, ja, ko, id, th, vi or fil. The app switches its language to match and you
    reply in that language from now on. Never call it because the owner mixed in a few words of
    another language."""
    chosen = find_language(language)
    if not chosen:
        return {"status": "unsupported", "supported": list(LANGUAGES)}
    return {
        "status": "changed",
        "language": chosen.locale,
        "instruction": f"From now on always speak and write in {chosen.name} ({chosen.code}).",
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


def get_shop_playbook() -> dict[str, Any]:
    """What the app has learned about this shop (its playbook): goals, priorities, what to
    watch, regular customers, the numbers that matter and the owner's own words. Use for "what
    do you know about my shop?" or before personal advice. Read only; to change or remove
    anything, open_screen("playbook")."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    try:
        stored = migrate_stored(ctx.store.playbook(ctx.uid, ctx.business_id))
    except HTTPException as error:
        return _invalid(error, ctx)
    if stored is None:
        return {
            "status": "not_ready",
            "instruction": "Nothing is learned yet; open_screen('playbook') builds it on screen.",
        }
    return {"status": "ready", "playbook": coach_summary(stored)}


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
