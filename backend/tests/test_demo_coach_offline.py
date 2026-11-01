"""The offline /demo coach and demo uploads (O-1, O-2, O-4): real cards for exact requests, the
example chips for anything else, and never a model or paid Maps call (OB-155)."""

import json
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.demo_coach import SUGGESTIONS
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo import open_demo, owner


def coach_events(client: TestClient, session: str, message: str) -> list[dict]:
    response = client.post(f"/api/v1/demo/sessions/{session}/coach", json={"message": message})
    assert response.status_code == 200, (message, response.text)
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


def test_O_1_demo_menu_files_get_a_labelled_sample_and_a_real_413(app, monkeypatch):  # noqa: N802, F811
    """O-1: imports and photo reads in the demo answer with a sample review, never a model."""
    read_file = AsyncMock(side_effect=AssertionError("a demo file reached the photo pipeline"))
    monkeypatch.setattr("app.photos.PhotoPipeline.classify_upload", read_file)
    monkeypatch.setattr("app.photos.PhotoPipeline.process", read_file)
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]
        bid = owner(client, session, "businesses").json()[0]["id"]
        for content_type in ("text/csv", "application/pdf", "image/jpeg"):
            made = owner(
                client,
                session,
                f"businesses/{bid}/import",
                "POST",
                content=b"item,price\nTea,10\n",
                headers={"Content-Type": content_type},
            )
            assert made.status_code == 200, made.text
            body = made.json()
            assert body["kind"] == "menu" and body["sample"] is True
            assert "Sample read" in body["sample_note"]
            names = [p["name"] for p in body["proposal"]["snapshot"]["products"]]
            assert "Masala dosa" in names and "Filter coffee" in names
        approved = owner(
            client,
            session,
            f"proposals/{body['proposal']['id']}/approve",
            "POST",
            json={"digest": body["proposal"]["digest"]},
        )
        assert approved.status_code == 200, approved.text
        menu = [p["name"] for p in owner(client, session, f"businesses/{bid}/inventory").json()]
        assert "Masala dosa" in menu
        too_big = owner(
            client,
            session,
            f"businesses/{bid}/import",
            "POST",
            content=b"x" * 5_000_001,
            headers={"Content-Type": "text/csv"},
        )
        assert too_big.status_code == 413 and too_big.json()["detail"] == "FILE_TOO_LARGE"
        guessed = owner(
            client,
            session,
            "photos/classify",
            "POST",
            content=b"\xff\xd8" + b"x" * 200_000,
            headers={"Content-Type": "image/jpeg"},
        )
        assert guessed.status_code == 200, guessed.text
        assert guessed.json()["kind"] == "menu"
        photo = owner(
            client,
            session,
            f"photos?business_id={bid}&language=en",
            "POST",
            content=b"\xff\xd8" + b"x" * 1000,
            headers={"Content-Type": "image/jpeg"},
        )
        assert photo.status_code == 200, photo.text
        assert photo.json()["proposal"]["snapshot"]["products"]
        assert "Sample read" in photo.json()["extraction"]["uncertain"][0]
        other = owner(
            client,
            session,
            "businesses/someone-else/import",
            "POST",
            content=b"item,price\n",
            headers={"Content-Type": "text/csv"},
        )
        assert other.status_code == 403
        app.state.v1_settings.max_photo_bytes = 65_536
        huge = owner(
            client,
            session,
            "photos/classify",
            "POST",
            content=b"x" * 70_000,
            headers={"Content-Type": "image/jpeg"},
        )
        assert huge.status_code == 413
        read_file.assert_not_called()
        app.state.rate_limiter.counters.clear()


def test_O_2_demo_coach_prepares_the_real_cards_offline(app):  # noqa: N802, F811
    """O-2: common owner requests get proposal, chart and answer cards; the rest get chips."""
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]
        cases = {
            "Change my closing time to 10pm": ("proposal", "Closing time 21:00 → 22:00"),
            "add cutting chai for 15 rupees": ("proposal", "New item: Cutting chai"),
            "samosa sold out": ("proposal", "Samosa: sold out"),
            "how many visits this week?": ("reply", "page was opened"),
            "what are my best sellers?": ("chart", "best sellers: Masala chai"),
            "What should I prep tomorrow?": ("chart", "demo forecast"),
            "add masala chai for 20 rupees": ("reply", "already on your demo menu at ₹20"),
            # Saved prices are paise; the demo once said ₹2000 for a ₹20 samosa.
            "Samosa is 20 now": ("reply", "demo price for Samosa is ₹20."),
        }
        for message, (kind, words) in cases.items():
            events = coach_events(client, session, message)
            assert kind in [event["kind"] for event in events], (message, events)
            reply = " ".join(event.get("text") or "" for event in events)
            assert words in reply, (message, reply)
        proposal = next(
            event["data"]
            for event in coach_events(client, session, "Change my closing time to 10pm")
            if event["kind"] == "proposal"
        )
        hours = proposal["snapshot"]["business"]["weekly_hours"]
        assert {day["close"] for day in hours} == {"22:00"}
        fallback = coach_events(client, session, "What is my business called?")
        offered = next(e for e in fallback if e["kind"] == "reply")["data"]["suggestions"]
        assert "What are my best sellers?" in offered and len(offered) == 6
        for suggestion in offered:
            events = coach_events(client, session, suggestion)
            reply = " ".join(event.get("text") or "" for event in events)
            assert "I can help with these in the demo" not in reply, (suggestion, reply)
        app.state.rate_limiter.counters.clear()


def test_O_2_demo_coach_reads_hours_items_and_visits_as_meant(app, monkeypatch):  # noqa: N802, F811
    """O-2 review: "open until X" is a closing time, a named day never changes every day, filler
    words stay out of item names, and only shop visits get the page-views answer."""
    from app import demo_coach

    offline = demo_coach.public_demo_turn

    async def demo_only(ctx: object, question: str) -> list:
        events = await offline(ctx, question)
        # OB-155: every phrasing, matched or not, is answered offline; none reaches a model.
        assert events, question
        return events

    monkeypatch.setattr(demo_coach, "public_demo_turn", demo_only)
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]

        def turn(message: str) -> list[dict]:
            # Many phrasings in one session; the per-IP demo limit is tested on its own above.
            app.state.rate_limiter.counters.clear()
            return coach_events(client, session, message)

        def proposal(message: str) -> dict | None:
            return next((e["data"] for e in turn(message) if e["kind"] == "proposal"), None)

        def reply(message: str) -> str:
            return " ".join(event.get("text") or "" for event in turn(message))

        before = proposal("Change my closing time to 10pm")
        assert before is not None
        saved = [d for d in before["snapshot"]["business"]["weekly_hours"] if not d["closed"]]
        opens = {day["open"] for day in saved}
        for message in ("We are open until 10pm", "We're open till 10 pm", "Open until 10pm"):
            found = proposal(message)
            assert found is not None, message
            days = [d for d in found["snapshot"]["business"]["weekly_hours"] if not d["closed"]]
            assert {day["close"] for day in days} == {"22:00"}, (message, days)
            assert {day["open"] for day in days} == opens, (message, days)
            assert "Closing time" in reply(message), message
        # Opening at or after closing is no schedule at all: no card, never open >= close.
        for message in ("Change my opening time to 11pm", "Open at 10pm", "Opening time to 23:30"):
            assert proposal(message) is None, message
        opening = proposal("Change my opening time to 6am")
        assert opening is not None
        days = [d for d in opening["snapshot"]["business"]["weekly_hours"] if not d["closed"]]
        assert {day["open"] for day in days} == {"06:00"}
        assert all(day["open"] < day["close"] for day in days)
        # A named day (or today/tonight) must not change the whole week.
        for message in (
            "Close on Sunday at 6",
            "Close at 6 on Sundays",
            "Stay open till 11pm tonight",
            "Close at 8pm today",
            "Change Monday closing time to 10pm",
            "Open at 8am tomorrow",
            "Close at 7pm on weekends",
        ):
            assert proposal(message) is None, message
            assert "on every open day" not in reply(message), message

        for message, name in {
            "add a new item called Vada pav for 25": "Vada pav",
            "add an item named Poha for 30": "Poha",
            "Add new item called Misal for 60 rupees": "Misal",
            "please add item Bun maska for 40": "Bun maska",
        }.items():
            found = proposal(message)
            assert found is not None, message
            names = [p["name"] for p in found["snapshot"]["products"]]
            assert name in names and not any("called" in n or "named" in n for n in names), (
                message,
                names,
            )
        text = reply("add a new item called Vada pav for 25")
        assert "New item: Vada pav, ₹25 per item" in text, text
        text = reply("add samosa for 25 rupees")
        assert "Samosa: price ₹20 → ₹25 per" in text, text

        for message in (
            "Should I visit the wholesaler tomorrow?",
            "I want to visit my supplier",
            "How many visits to the wholesaler this month?",
            "When should I visit the market?",
        ):
            assert "page was opened" not in reply(message), message
        for message in (
            "how many visits this week?",
            "How many visitors did my shop get?",
            "visits to my page",
            "How many people visited my shop this week?",
            "What was my footfall?",
        ):
            assert "page was opened" in reply(message), message
        app.state.rate_limiter.counters.clear()


EXAMPLES = "I can help with these in the demo"
CLOSE_22 = {"line": "Closing time 21:00 → 22:00 on every open day", "close": "22:00"}
NEW_PRICE = {
    "line": "Samosa: price ₹20 → ₹25 per piece",
    "product": ("Samosa", 2500, "piece", True),
}
SOLD_OUT = {"line": "Samosa: sold out", "product": ("Samosa", 2000, "piece", False)}
# O-2 (second review): a card only for a short request that is exactly one the demo knows.
# Each row is a message and either the exact card or the words of the card-free reply.
DEMO_COACH_PHRASINGS: list[tuple[str, dict]] = [
    # Hours, the whole week.
    ("Change my closing time to 10pm", CLOSE_22),
    ("close at 10pm", CLOSE_22),
    ("Close at 10", CLOSE_22),
    ("Set the closing time to 22:00", CLOSE_22),
    ("close at 10pm daily", CLOSE_22),
    (
        "We close at 10:30pm",
        {"line": "Closing time 21:00 → 22:30 on every open day", "close": "22:30"},
    ),
    ("We are open until 10pm", CLOSE_22),
    ("We're open till 10 pm", CLOSE_22),
    ("We’re open till 10pm", CLOSE_22),
    (
        "Open until 11pm.",
        {"line": "Closing time 21:00 → 23:00 on every open day", "close": "23:00"},
    ),
    ("open at 7am", {"line": "Opening time 06:30 → 07:00 on every open day", "open": "07:00"}),
    (
        "We open at 7 am every day",
        {"line": "Opening time 06:30 → 07:00 on every open day", "open": "07:00"},
    ),
    (
        "Change my opening time to 6am",
        {"line": "Opening time 06:30 → 06:00 on every open day", "open": "06:00"},
    ),
    # A new item or a new price.
    (
        "add cutting chai for 15 rupees",
        {
            "line": "New item: Cutting chai, ₹15 per item",
            "product": ("Cutting chai", 1500, "item", True),
        },
    ),
    (
        "Add Vada pav for ₹25",
        {"line": "New item: Vada pav, ₹25 per item", "product": ("Vada pav", 2500, "item", True)},
    ),
    (
        "add a new item called Vada pav for 25",
        {"line": "New item: Vada pav, ₹25 per item", "product": ("Vada pav", 2500, "item", True)},
    ),
    (
        "add an item named Poha for 30",
        {"line": "New item: Poha, ₹30 per item", "product": ("Poha", 3000, "item", True)},
    ),
    (
        "please add item Kanda bhaji for 40",
        {
            "line": "New item: Kanda bhaji, ₹40 per item",
            "product": ("Kanda bhaji", 4000, "item", True),
        },
    ),
    (
        "please add item Bun maska for 40",
        {
            "line": "Bun maska: price ₹35 → ₹40 per piece",
            "product": ("Bun maska", 4000, "piece", True),
        },
    ),
    (
        "Add filter coffee for 25 rupees per cup",
        {
            "line": "New item: Filter coffee, ₹25 per cup",
            "product": ("Filter coffee", 2500, "cup", True),
        },
    ),
    ("add samosa for 25 rupees", NEW_PRICE),
    ("Add samosa for 25 rupees each", NEW_PRICE),
    ("samosa price 25", NEW_PRICE),
    ("Change samosa price to 25", NEW_PRICE),
    ("set the price of samosa to ₹25", NEW_PRICE),
    ("Samosa price is now 25 rupees", NEW_PRICE),
    # Sold out.
    ("samosa sold out", SOLD_OUT),
    ("Samosa is sold out", SOLD_OUT),
    ("mark samosa as sold out", SOLD_OUT),
    ("Samosa out of stock!", SOLD_OUT),
    # Negation never flips into the opposite card.
    ("Samosa not sold out", {"reply": EXAMPLES}),
    ("Samosa isn't sold out", {"reply": EXAMPLES}),
    ("Don't close at 10pm", {"reply": EXAMPLES}),
    ("Do not close at 10pm", {"reply": EXAMPLES}),
    ("We no longer close at 9pm", {"reply": EXAMPLES}),
    ("Never open at 7am", {"reply": EXAMPLES}),
    ("We won't open at 7am", {"reply": EXAMPLES}),
    ("don't add cutting chai for 15", {"reply": EXAMPLES}),
    # A reason, a day or a part-day close is not the whole week's closing time.
    ("We close at 2pm for lunch", {"reply": EXAMPLES}),
    ("Close at 6 during Diwali", {"reply": EXAMPLES}),
    ("Close at 10 on holidays", {"reply": EXAMPLES}),
    ("close at 10pm because of the festival", {"reply": EXAMPLES}),
    ("Open at 7am except Sundays", {"reply": EXAMPLES}),
    ("Close at 10pm only on Fridays", {"reply": EXAMPLES}),
    ("Close at 10pm next week", {"reply": EXAMPLES}),
    ("close at 10pm from Monday", {"reply": EXAMPLES}),
    ("open at 7am from 1st November", {"reply": EXAMPLES}),
    ("close at 2pm to 4pm for lunch", {"reply": EXAMPLES}),
    ("Close on Sunday at 6", {"reply": EXAMPLES}),
    ("Close at 6 on Sundays", {"reply": EXAMPLES}),
    ("Stay open till 11pm tonight", {"reply": EXAMPLES}),
    ("Close at 8pm today", {"reply": EXAMPLES}),
    ("Change Monday closing time to 10pm", {"reply": EXAMPLES}),
    ("Open at 8am tomorrow", {"reply": EXAMPLES}),
    ("Close at 7pm on weekends", {"reply": EXAMPLES}),
    ("We close at 10pm and open at 7am", {"reply": EXAMPLES}),
    ("Should we close at 10pm?", {"reply": EXAMPLES}),
    ("Close at 12", {"reply": EXAMPLES}),
    ("Change my opening time to 11pm", {"reply": EXAMPLES}),
    ("Open at 10pm", {"reply": EXAMPLES}),
    ("Opening time to 23:30", {"reply": EXAMPLES}),
    # Words that are not a menu item.
    ("add a new item called for 20", {"reply": EXAMPLES}),
    ("add stock of samosa for 20", {"reply": EXAMPLES}),
    ("add the samosa for 0", {"reply": EXAMPLES}),
    ("add samosa for 0", {"reply": EXAMPLES}),
    # A unit other than the saved item's prices something else (a plate is often two samosas).
    ("add samosa for 25 per plate", {"reply": EXAMPLES}),
    ("add samosa for 25 per kg", {"reply": EXAMPLES}),
    ("add samosa for 25 per glass", {"reply": EXAMPLES}),
    ("Add GST at 18", {"reply": EXAMPLES}),
    ("add tax at 5", {"reply": EXAMPLES}),
    ("add delivery for 30", {"reply": EXAMPLES}),
    ("add it for 20", {"reply": EXAMPLES}),
    ("add item for 20", {"reply": EXAMPLES}),
    ("add 2 samosas for 40", {"reply": EXAMPLES}),
    ("add cutting chai for 15 for the festival", {"reply": EXAMPLES}),
    ("add cutting chai for 15 and samosa for 20", {"reply": EXAMPLES}),
    ("Add a discount of 10 on samosa", {"reply": EXAMPLES}),
    # Sold out, back and prices only as asked.
    ("samosa sold out tomorrow", {"reply": EXAMPLES}),
    ("samosa sold out on Sunday", {"reply": EXAMPLES}),
    ("Kaya toast sold out", {"reply": EXAMPLES}),
    ("Samosa sold out and masala chai price 25", {"reply": EXAMPLES}),
    ("samosa back in stock", {"reply": "Samosa is already available on your demo menu"}),
    ("Is samosa sold out?", {"reply": "Demo stock shows Samosa: on sale"}),
    ("samosa is 25 years old", {"reply": "demo price for Samosa is ₹20."}),
    ("Samosa is 20 now", {"reply": "demo price for Samosa is ₹20."}),
    ("add masala chai for 20 rupees", {"reply": "already on your demo menu at ₹20"}),
    # Answers, not cards: only shop visits and menu best sellers get them.
    ("how many visits this week?", {"reply": "page was opened"}),
    ("How many people visited my shop this week?", {"reply": "page was opened"}),
    ("what are my best sellers?", {"reply": "best sellers: Masala chai"}),
    ("What sells the most?", {"reply": "best sellers: Masala chai"}),
    ("सबसे ज़्यादा क्या बिकता है?", {"reply": "पिछले 7 दिनों में डेमो के सबसे ज़्यादा बिकने वाले आइटम: Masala chai"}),
    ("how many people bought samosa", {"absent": "page was opened"}),
    ("Should I visit the wholesaler tomorrow?", {"absent": "page was opened"}),
    ("most popular supplier", {"absent": "best sellers:"}),
    ("best seller among suppliers", {"absent": "best sellers:"}),
    # O-2 (third review): a new item must be a food or drink, sold by a food unit.
    ("add rent for 5000", {"reply": EXAMPLES}),
    ("add salary for 10000", {"reply": EXAMPLES}),
    ("add electricity for 2000", {"reply": EXAMPLES}),
    ("add staff for 300", {"reply": EXAMPLES}),
    ("add loan for 5000", {"reply": EXAMPLES}),
    ("add expense for 500", {"reply": EXAMPLES}),
    ("add expenses for 500", {"reply": EXAMPLES}),
    ("add sale for 500", {"reply": EXAMPLES}),
    ("add sales for 500", {"reply": EXAMPLES}),
    ("add order for 20", {"reply": EXAMPLES}),
    ("add an order for 20", {"reply": EXAMPLES}),
    ("add supplier for 20", {"reply": EXAMPLES}),
    ("add a new supplier for 20", {"reply": EXAMPLES}),
    ("add customer for 20", {"reply": EXAMPLES}),
    ("add a table for 4", {"reply": EXAMPLES}),
    ("add offer for 10", {"reply": EXAMPLES}),
    ("add happy hour for 5", {"reply": EXAMPLES}),
    ("add packing for 5", {"reply": EXAMPLES}),
    ("add packaging for 5", {"reply": EXAMPLES}),
    ("add five samosas for 100", {"reply": EXAMPLES}),
    ("add a dozen samosas for 200", {"reply": EXAMPLES}),
    ("add idli for 15 per hour", {"reply": EXAMPLES}),
    ("add chai for 15 per service", {"reply": EXAMPLES}),
    ("add samosas for 25", NEW_PRICE),
    ("add a samosa for 25", NEW_PRICE),
    ("add the samosa for 25", NEW_PRICE),
    (
        "add idlis for 30 per plate",
        {"line": "New item: Idlis, ₹30 per plate", "product": ("Idlis", 3000, "plate", True)},
    ),
    (
        "add masala dosa for 60",
        {
            "line": "New item: Masala dosa, ₹60 per item",
            "product": ("Masala dosa", 6000, "item", True),
        },
    ),
    (
        "add kopi for 2 per glass",
        {"line": "New item: Kopi, ₹2 per glass", "product": ("Kopi", 200, "glass", True)},
    ),
    ("add wifi for 500", {"reply": EXAMPLES}),
    ("add parking for 20", {"reply": EXAMPLES}),
    ("add gas for 900", {"reply": EXAMPLES}),
    ("add water bill for 300", {"reply": EXAMPLES}),
    ("add commission for 50", {"reply": EXAMPLES}),
    ("add insurance for 1000", {"reply": EXAMPLES}),
    ("add repairs for 400", {"reply": EXAMPLES}),
    ("add cleaning for 200", {"reply": EXAMPLES}),
    ("add advertising for 1000", {"reply": EXAMPLES}),
    ("add a chair for 1500", {"reply": EXAMPLES}),
    ("add a fridge for 20000", {"reply": EXAMPLES}),
    ("add a helper for 300", {"reply": EXAMPLES}),
    ("add transport for 100", {"reply": EXAMPLES}),
    ("add petrol for 100", {"reply": EXAMPLES}),
    ("add shop rent for 8000", {"reply": EXAMPLES}),
    ("add licence for 2000", {"reply": EXAMPLES}),
    ("add maintenance for 500", {"reply": EXAMPLES}),
    ("add interest for 50", {"reply": EXAMPLES}),
    ("add deposit for 1000", {"reply": EXAMPLES}),
    ("add refund for 20", {"reply": EXAMPLES}),
    ("add credit for 100", {"reply": EXAMPLES}),
    ("add udhaar for 200", {"reply": EXAMPLES}),
    ("add bonus for 500", {"reply": EXAMPLES}),
    ("add overtime for 300", {"reply": EXAMPLES}),
    ("add phone recharge for 199", {"reply": EXAMPLES}),
    ("add a banner for 300", {"reply": EXAMPLES}),
    ("add courier for 60", {"reply": EXAMPLES}),
    ("add cylinder for 1100", {"reply": EXAMPLES}),
    ("add a new counter for 5000", {"reply": EXAMPLES}),
    ("add cashback for 20", {"reply": EXAMPLES}),
    ("add membership for 99", {"reply": EXAMPLES}),
    ("add a coupon for 50", {"reply": EXAMPLES}),
    # A question never builds a change card, with or without the "?".
    ("Samosa sold out?", {"reply": "Demo stock shows Samosa: on sale"}),
    ("close at 10pm?", {"reply": EXAMPLES}),
    ("change my closing time to 10pm?", {"reply": EXAMPLES}),
    ("samosa price 25?", {"reply": "demo price for Samosa is ₹20."}),
    ("add samosa for 25?", {"reply": EXAMPLES}),
    ("add cutting chai for 15?", {"reply": EXAMPLES}),
    ("can you add a new item called Vada pav for 25", {"reply": EXAMPLES}),
    ("can we close at 10pm", {"reply": EXAMPLES}),
    ("would you add cutting chai for 15", {"reply": EXAMPLES}),
    ("should I open at 7am", {"reply": EXAMPLES}),
    ("kya samosa sold out", {"absent": "check:"}),
    ("kaise close at 10pm", {"reply": EXAMPLES}),
]


def test_O_2_demo_coach_builds_a_card_only_for_an_exact_request(app):  # noqa: N802, F811
    """O-2 (second review): every phrasing gets exactly its card, or no card at all."""
    assert len(DEMO_COACH_PHRASINGS) >= 160
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        wrong = []
        for index, (message, expected) in enumerate(DEMO_COACH_PHRASINGS):
            # The per-IP and per-session demo limits are tested on their own above.
            app.state.rate_limiter.counters.clear()
            if index % 30 == 0:
                session = open_demo(client).json()["session_id"]
            events = coach_events(client, session, message)
            text = " ".join(event.get("text") or "" for event in events)
            cards = [event["data"]["snapshot"] for event in events if event["kind"] == "proposal"]
            got: dict = {"text": text, "cards": cards}
            if "line" not in expected:
                offered = next((e.get("data") for e in events if e["kind"] == "reply"), None)
                if cards or ("reply" in expected and expected["reply"] not in text):
                    wrong.append((message, expected, got))
                elif expected.get("absent", "\0") in text:
                    wrong.append((message, expected, got))
                elif expected.get("reply") == EXAMPLES and offered != {
                    "suggestions": list(SUGGESTIONS)
                }:
                    wrong.append((message, expected, got))
                continue
            if len(cards) != 1 or f"check: {expected['line']}." not in text:
                wrong.append((message, expected, got))
                continue
            card = cards[0]
            if "product" in expected:
                name, price, unit, available = expected["product"]
                want = [{"name": name, "price": price, "unit": unit, "available": available}]
                have = [
                    {key: p[key] for key in ("name", "price", "unit", "available")}
                    for p in card["products"]
                ]
                if card["business"] is not None or have != want:
                    wrong.append((message, expected, got))
                continue
            days = [day for day in card["business"]["weekly_hours"] if not day["closed"]]
            spans = {(day["open"], day["close"]) for day in days}
            want_span = (expected.get("open", "06:30"), expected.get("close", "21:00"))
            if card["products"] or not days or spans != {want_span}:
                wrong.append((message, expected, got))
        assert wrong == [], "\n".join(map(repr, wrong))
        app.state.rate_limiter.counters.clear()


def test_O_4_demo_pin_address_is_answered_offline(app, monkeypatch):  # noqa: N802, F811
    """O-4: the address under a demo map pin comes from the offline area list (no Maps call)."""
    paid = AsyncMock(side_effect=AssertionError("paid Maps call"))
    monkeypatch.setattr("httpx.AsyncClient.get", paid)
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        session = open_demo(client).json()["session_id"]
        found = owner(client, session, "places/reverse?lat=12.96880&lng=77.63820")
        assert found.status_code == 200, found.text
        assert found.json() == {"label": "Near Indiranagar", "approximate": True}
        pin = owner(client, session, "places/pin?q=Indiranagar")
        assert pin.status_code == 200, pin.text
        paid.assert_not_called()


def _sale(day: str, item: str, quantity: float) -> dict:
    return {"date": day, "item": item, "quantity": quantity, "revenue": int(quantity * 2000)}


def test_best_sellers_use_the_last_7_days_so_monday_is_never_empty():
    """Frozen to a Monday with no sales today (Sunday too): best sellers are still listed."""
    from datetime import date

    from app.recap import recap_facts

    signals = {"fields": {}, "questions": [], "sold_out": {}}
    sales = [
        _sale("2026-11-01", "Masala chai", 30),  # Sunday
        _sale("2026-10-30", "Samosa", 12),
        _sale("2026-10-27", "Masala chai", 5),  # Tuesday of last week, 6 days before Monday
        _sale("2026-10-26", "Old item", 99),  # 7 days before Monday: outside the window
    ]
    for today in (date(2026, 11, 2), date(2026, 11, 1)):  # Monday, Sunday
        week = f"{today.isocalendar()[0]}-W{today.isocalendar()[1]:02d}"
        facts = recap_facts(week, sales, signals, through=today)
        names = [row["item"] for row in facts["top_sellers"]]
        assert names, today
        assert names[0] == ("Masala chai" if today.weekday() == 0 else "Old item")
    monday = recap_facts("2026-W45", sales, signals, through=date(2026, 11, 2))
    assert "Old item" not in {r["item"] for r in monday["top_sellers"] + monday["slow_movers"]}
    # The calendar week still works for the weekly recap.
    assert recap_facts("2026-W45", sales, signals)["top_sellers"] == []
