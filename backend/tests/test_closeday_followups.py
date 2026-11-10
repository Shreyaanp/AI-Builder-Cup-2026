"""OB-290, OB-264, OB-251: Close the day by chat in every way an owner says it, never offered
once the day is closed; "what first?" from the shop's own list for real owners too; rupees in
lakhs in the chat as on the screens; and the coach's sales on a Monday morning.
"""

import asyncio
from datetime import datetime
from types import SimpleNamespace
from typing import Any
from zoneinfo import ZoneInfo

import pytest

from app import demo_coach_words
from app.agent import ui_language
from app.instant import route
from app.merchant import MerchantStore
from app.rescue import local_now
from app.sourcing import money_text
from tests.test_coach_owner_words import at, demo, reply_of  # noqa: F401
from tests.test_photos import app  # noqa: F401
from tests.test_voice_everything import ctx, shop  # noqa: F401

KOLKATA = ZoneInfo("Asia/Kolkata")


def closed_with(monkeypatch: pytest.MonkeyPatch, revenue: int) -> None:
    """Today already closed with this many paise, on top of the shop's own history."""
    saved = MerchantStore.sales_history

    def with_today(self: MerchantStore, uid: str, bid: str) -> list[dict[str, Any]]:
        today = demo_coach_words._now({"timezone": "Asia/Kolkata"}).date().isoformat()
        rows = [row for row in saved(self, uid, bid) if row["date"] != today]
        return [*rows, {"date": today, "item": "Masala chai", "quantity": 10, "revenue": revenue}]

    monkeypatch.setattr(MerchantStore, "sales_history", with_today)


def offered(events: list[dict]) -> list[str]:
    return [e["data"]["target"] for e in events if e["kind"] == "action"]


# --- The demo chat -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("message", "language"),
    [
        ("दिन बंद करें", "hi"),
        ("दिन बंद करो", "hi"),
        ("आज का हिसाब", "hi"),
        ("हिसाब करना है", "hi"),
        ("aaj ka hisaab", "hi"),
        ("din band karna hai", "en"),
        ("hisaab karo", "en"),
        ("close my day", "en"),
    ],
)
def test_close_the_day_in_hindi_and_hinglish_offers_the_sheet(demo, message, language):  # noqa: F811
    """'दिन बंद करें' answered with the shop's hours on 10 Nov: the word बंद read as hours."""
    events = demo(message, language)
    assert offered(events) == ["close_day"], (message, events)
    reply = reply_of(events)
    assert "06:30" not in reply and "समय" not in reply, reply
    if language == "hi":
        assert "नीचे दिन बंद करें खोलें पर टैप करें।" in reply and "Grow" not in reply, reply
    else:
        assert "Or tap Open Close the day below." in reply, reply


@pytest.mark.parametrize("message", ["आज दुकान बंद है", "aaj dukaan band hai", "din band mat karo"])
def test_the_shop_closed_today_is_not_close_the_day(demo, message):  # noqa: F811
    assert "close_day" not in offered(demo(message, "hi")), message


def test_a_closed_day_says_its_total_in_lakhs_and_edits(demo, monkeypatch):  # noqa: F811
    closed_with(monkeypatch, 10_100_000)
    events = demo("Close the day")
    assert offered(events) == ["close_day"]
    assert "Today is already closed: ₹1,01,000. Open it below to edit." in reply_of(events)
    hindi = reply_of(demo("दिन बंद करें", "hi"))
    assert "आज का दिन पहले ही बंद है: ₹1,01,000।" in hindi, hindi


def test_what_first_in_the_evening_skips_a_closed_day(demo, monkeypatch):  # noqa: F811
    at(monkeypatch, 20, 30)
    closed_with(monkeypatch, 100_000)
    events = demo("What should I do first today?")
    assert "close_day" not in offered(events), events
    assert "Close the day" not in reply_of(events)
    # The customer still waiting leads instead.
    assert offered(events)[0] == "messages", events


# --- The live coach: the same answers before any model call ------------------------------------


def run(text: str, context: Any, language: str = "en"):
    token = ui_language.set(language)
    try:
        return asyncio.run(route(text, context, None))
    finally:
        ui_language.reset(token)


def test_live_what_first_reads_the_shops_list_not_the_model(shop, monkeypatch):  # noqa: F811
    at(monkeypatch, 10)
    result = run("What should I do first today?", shop)
    assert result and result.intent == "what_first", result
    assert "Close the day" not in result.reply and "close_day" not in [
        e.data["target"] for e in result.events
    ]
    assert all(e.kind == "action" and e.data["offer"] for e in result.events)
    hindi = run("आज सबसे पहले क्या करूँ?", shop, "hi")
    assert hindi and hindi.intent == "what_first" and "सबसे पहले" in hindi.reply
    # Near closing it leads with Close the day, until the day is closed.
    at(monkeypatch, 20, 30)
    evening = run("What should I do first today?", shop)
    assert evening and evening.events[0].data["target"] == "close_day", evening
    closed_with(monkeypatch, 50_000)
    done = run("What should I do first today?", shop)
    assert done and "close_day" not in [e.data["target"] for e in done.events], done
    # The templates are English and Hindi: a Tamil app keeps the model's own reply.
    tamil = run("What should I do first today?", shop, "ta")
    assert tamil is None or tamil.intent != "what_first"


def test_live_close_the_day_in_hindi_opens_the_sheet(shop, monkeypatch):  # noqa: F811
    result = run("दिन बंद करें", shop, "hi")
    assert result and result.intent == "screen:close_day", result
    assert result.events[0].data["target"] == "close_day"
    assert result.reply.startswith("चलिए आज का दिन बंद करते हैं।"), result.reply
    # Hinglish typed in a Hindi app is answered in Hindi.
    hinglish = run("hisaab karo", shop, "hi")
    assert hinglish and hinglish.intent == "screen:close_day"
    assert hinglish.reply.startswith("चलिए आज का दिन बंद करते हैं।"), hinglish.reply
    english = run("din band karna hai", shop)
    assert english and english.intent == "screen:close_day"
    assert english.reply.startswith("Let's close the day."), english.reply
    closed_with(monkeypatch, 10_100_000)
    again = run("Close the day", shop)
    assert again and again.reply == (
        "Today is already closed: ₹1,01,000. Edit it here if something changed."
    )
    # The shop closed today is a different job: never the close sheet.
    shut = run("आज दुकान बंद है", shop, "hi")
    assert not shut or shut.intent != "screen:close_day"


def test_rupees_group_in_lakhs_like_the_screens() -> None:
    assert money_text(10_100_000, "INR") == "₹1,01,000"
    assert money_text(99_900, "INR") == "₹999"
    assert money_text(1_010_000_050, "INR") == "₹1,01,00,000.50"
    assert money_text(10_100_000, "SGD") == "S$101,000"


# --- OB-251: a real owner's coach on a Monday morning ------------------------------------------


def test_monday_morning_insights_carry_last_weeks_sales_for_a_real_owner(
    shop,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Monday 9 Nov 2026, 10:00, before today is closed: last week's sales are still there, so
    the coach never says there are no sales this week (OB-251, #639)."""
    import app.coordinator as coordinator

    monday = datetime(2026, 11, 9, 10, 0, tzinfo=KOLKATA)
    assert local_now({"timezone": "Asia/Kolkata"}, monday.timestamp()).weekday() == 0
    last_week = [
        {"date": f"2026-11-0{day}", "item": "Masala chai", "quantity": 40, "revenue": 60_000}
        for day in range(2, 9)
    ] + [{"date": "2026-11-07", "item": "Samosa", "quantity": 12, "revenue": 24_000}]
    monkeypatch.setattr(shop.store, "sales_history", lambda uid, bid: last_week)
    monkeypatch.setattr(coordinator, "time", SimpleNamespace(time=lambda: monday.timestamp()))
    result = coordinator.get_insights()
    assert result["period"] == "last_7_days" and "week" not in result
    assert result["has_sales_data"] is True
    assert [row["item"] for row in result["top_sellers"]] == ["Masala chai"]
    assert result["sales_days"] == 6 and result["revenue"] > 0
    assert result["today"] is None
