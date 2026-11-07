"""The coach never dead-ends (OB-172, #531): one validated tool for any shop-detail edit, and an
honest "I can't do that yet" that points to the right screen and counts the unmet request.

Same boundary as coordinator.py: update_shop_details only prepares the normal review card (the
owner confirms on screen); report_unsupported_request changes nothing.
"""

import re
from typing import Any, Literal

import structlog
from pydantic import ValidationError

from .coordinator import _card, _invalid, _propose_shop, current
from .merchant import DayHours
from .sales import today_for
from .voice_tools import SCREENS, Screen

log = structlog.get_logger()

ShopField = Literal[
    "name",
    "category",
    "description",
    "phone",
    "location",
    "hours",
    "weekly_hours",
    "opening_time",
    "closing_time",
    "closed_today",
    "closed_days",
]
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
DAY_WORDS = re.compile(r"\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b", re.I)
TIME = re.compile(r"^\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$", re.I)
RANGE = re.compile(r"^\s*(.+?)\s*(?:-|–|—|to)\s*(.+?)\s*$", re.I)
PHONE = re.compile(r"^\+?[\d\s().-]{6,40}$")
ASK = {
    "status": "ask_owner",
    "instruction": "Ask the owner ONE short question for the missing detail, then call "
    "update_shop_details again with their answer.",
}


def clock(value: str) -> str | None:
    """ "21:00", "9pm", "9:30 p.m." → HH:MM. A bare "9" is unclear (morning or night): None."""
    found = TIME.match(value or "")
    if not found:
        return None
    hour, minute = int(found[1]), int(found[2] or 0)
    period = (found[3] or "").replace(".", "").lower()
    if period:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if period == "pm" else 0)
    elif found[2] is None or not 0 <= hour <= 23:
        # "9" alone could be 09:00 or 21:00; only HH:MM or am/pm is taken as said.
        return None
    if minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def saved_week(fields: dict[str, Any]) -> list[dict[str, Any]]:
    """The shop's hours as seven day records: the saved weekly hours, else free-text hours that
    read as one daily range ("07:00–14:00", "7am to 2pm"). Empty when neither is known."""
    week = [dict(day) for day in fields.get("weekly_hours") or []]
    if week:
        known = {day["day"] for day in week}
        return week + [{"day": d, "closed": True} for d in DAYS if d not in known]
    found = RANGE.match(fields.get("hours") or "")
    opens, closes = (clock(found[1]), clock(found[2])) if found else (None, None)
    if not (opens and closes):
        return []
    return [{"day": d, "closed": False, "open": opens, "close": closes} for d in DAYS]


def update_shop_details(
    field: ShopField, value: str = "", weekly_hours: list[DayHours] | None = None
) -> dict[str, Any]:
    """Prepare ONE change to the saved shop's details for the owner's review card. Use it for any
    "change my ..." about the shop itself: field is one of name (1-80 characters), category
    (what they sell, in their words), description, phone (digits, spaces, +, -), location (the
    new area or address, e.g. "HITEC City, Hyderabad"; the card then finds the map pin and the
    owner checks it before saving), hours (free text), weekly_hours (pass the weekly_hours
    list), opening_time / closing_time (HH:MM 24h or "9pm", applied to every open day: "we
    close at 9 now" → closing_time "21:00"), closed_today ("yes" = closed today, "no" = open
    again), closed_days (days now closed every week, e.g. "sunday" or "mon, tue"). value is the
    owner's new value, canonical (times HH:MM, days in English). Never guess: if the field or
    value is unclear, ask ONE short question first. Nothing is saved until the owner confirms."""
    ctx = current.get()
    if not ctx or not ctx.business_id:
        return {"status": "needs_business"}
    fields = (ctx.store.context(ctx.uid, ctx.business_id)["business"] or {}).get("fields", {})
    value = " ".join((value or "").split())

    def bad(problem: str) -> dict[str, Any]:
        return _invalid(ValueError(f"{field}: {problem}"), ctx)

    if field in {"name", "category", "description", "location", "hours"} and not value:
        return {**ASK, "missing": field}
    if field == "name":
        if len(value) > 80:
            return bad("a shop name is 1-80 characters")
        return _propose_shop(name=value)
    if field == "category":
        return _propose_shop(name="", category=value[:180])
    if field == "description":
        return _propose_shop(name="", description=value[:500])
    if field == "hours":
        return _propose_shop(name="", hours=value[:180])
    if field == "phone":
        if not PHONE.fullmatch(value) or len(re.sub(r"\D", "", value)) < 6:
            return bad("use the owner's phone number: digits, spaces, + or -, at least 6 digits")
        return _propose_shop(name="", phone=value)
    if field == "location":
        if len(value) < 3 or len(value) > 300:
            return bad("say the area or address in 3-300 characters")
        if value.casefold() == (fields.get("location") or "").casefold():
            return {"status": "no_change", "location": value}
        result = _propose_shop(name="", location=value)
        if result.get("status") == "needs_review":
            result["pin"] = "confirm_on_map"
            result["instruction"] = (
                "Say the new place is prepared. On the card the owner taps Find pin, checks the "
                "pin and the place, then Confirm and save. Never say the location changed."
            )
        return result
    if field == "closed_today":
        closing = value.lower() in {"yes", "true", "closed", "1"}
        if not closing and value.lower() not in {"no", "false", "open", "0"}:
            return bad('use "yes" (closed today) or "no" (open again today)')
        today = today_for(fields).isoformat()
        if (fields.get("closed_on") == today) == closing:
            return {"status": "no_change", "closed_today": closing}
        result = _propose_shop(name="", closed_on=today if closing else "")
        if result.get("status") == "needs_review":
            result["changes"] = [f"Closed today ({today})" if closing else "Open again today"]
        return result
    if field == "weekly_hours":
        if not weekly_hours:
            return {**ASK, "missing": "weekly_hours"}
        return _propose_shop(name="", weekly_hours=weekly_hours)
    week = saved_week(fields)
    if field in {"opening_time", "closing_time"}:
        time = clock(value)
        if not time:
            return bad(
                "use HH:MM (24h) or with am/pm; if the owner did not say morning or "
                "night and it is unclear, ask them"
            )
        if not week:
            # No saved hours to change: the other end of the day is unknown, never invented.
            return {**ASK, "missing": "closing_time" if field == "opening_time" else "opening_time"}
        key = "open" if field == "opening_time" else "close"
        week = [{**day, key: time} if not day.get("closed") else day for day in week]
    else:  # closed_days
        days = {match[:3].lower() for match in DAY_WORDS.findall(value)}
        if not days:
            return bad("name the weekdays, e.g. sunday or mon, tue")
        if not week:
            return {**ASK, "missing": "hours"}
        week = [{"day": day["day"], "closed": True} if day["day"] in days else day for day in week]
    try:
        parsed = [DayHours.model_validate(day) for day in week]
    except ValidationError as error:
        return _invalid(error, ctx)
    return _propose_shop(name="", weekly_hours=parsed)


UnmetIntent = Literal[
    "social_media_post",
    "delivery_app_listing",
    "online_payments",
    "accounting_tax",
    "staff_payroll",
    "advertising",
    "website",
    "customer_broadcast",
    "printing",
    "other",
]


def report_unsupported_request(intent: UnmetIntent, screen: Screen | None = None) -> dict[str, Any]:
    """Call this when the owner asks for something no other tool can do (post on Instagram,
    list on Swiggy, file taxes, run payroll, buy ads...). Never pretend or invent an action.
    intent: the closest label (other when none fits). screen: the app screen where the owner
    can do the nearest thing themselves (share for the customer page link and QR to post
    anywhere, details, menu, payments, google, messages...), or leave it unset. Then say
    plainly, in one or two sentences, that you can't do that yet and, if there is a screen,
    what they can do there. The request is counted (the label only) to plan what comes next."""
    ctx = current.get()
    if screen is not None and screen not in SCREENS:
        screen = None
    if ctx and not ctx.business_id and screen not in {None, "photo", "privacy", "you", "trust"}:
        screen = None
    # Only the label, the screen and whether there is a shop are logged: never the owner's words.
    log.info(
        "coach_unmet_request",
        intent=intent,
        screen=screen or "",
        has_shop=bool(ctx and ctx.business_id),
    )
    result: dict[str, Any] = {
        "status": "unsupported",
        "intent": intent,
        "instruction": "Say plainly you can't do this yet; never say it was done or started.",
    }
    if ctx and screen:
        result["card_id"] = _card(
            ctx,
            "action",
            {
                "target": screen,
                "label": SCREENS[screen],
                "business_id": ctx.business_id,
                # Offered, not opened: the owner asked for something else.
                "offer": True,
            },
        )
        result["screen"] = SCREENS[screen]
    return result
