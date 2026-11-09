"""Expenses and cash in hand.

One endpoint writes an expense (the close screen and the chat both use `add_expense`); amounts
read with the shared number reader; a day's cash in hand is opening + cash sales - cash spent;
delete keeps the row so Undo restores it; a received supplier order logs once; and a shop with
no money records (every shop before this change) reads as zero spent, nothing to migrate.
"""

from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import expenses, shop_today
from app.coordinator import MerchantContext
from app.expenses import expense_words
from app.instant import route
from app.merchant_routes import LEGAL_VERSION
from app.rescue import local_now
from tests.test_analytics import owned_shop, save_sales
from tests.test_photos import app  # noqa: F401


def at(monkeypatch: pytest.MonkeyPatch, when: datetime) -> None:
    monkeypatch.setattr(expenses, "local_now", lambda *_: when)
    monkeypatch.setattr(shop_today, "local_now", lambda *_: when)


def evening(app_: Any, uid: str, bid: str) -> datetime:
    fields = app_.state.merchant.context(uid, bid)["business"]["fields"]
    return local_now(fields).replace(hour=20, minute=30)


def money(client: TestClient, bid: str, day: str | None = None) -> dict[str, Any]:
    url = f"/api/v1/businesses/{bid}/money" + (f"?day={day}" if day else "")
    response = client.get(url)
    assert response.status_code == 200, response.text
    return response.json()


def test_an_existing_shop_with_no_money_records_reads_as_zero(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        at(monkeypatch, evening(app, uid, bid))
        day = money(client, bid)
        assert day["expenses"] == [] and day["spent"] == 0
        assert day["sales"] is None and day["left"] is None
        assert day["cash"] == {
            "opening": None,
            "opening_from": None,
            "cash_sales": 0,
            "upi_sales": None,
            "cash_spent": 0,
            "expected": 0,
            "counted": None,
            "difference": None,
        }
        today = client.get(f"/api/v1/businesses/{bid}/today").json()
        assert today["spent_yesterday"] == 0 and today["spent_today"] == 0


def test_manual_add_reads_amounts_as_typed(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        at(monkeypatch, evening(app, uid, bid))
        url = f"/api/v1/businesses/{bid}/expenses"
        for typed, minor in (("1,000", 100000), ("₹1,000", 100000), ("170/-", 17000)):
            made = client.post(url, json={"amount": typed, "category": "stock", "note": "Milk"})
            assert made.status_code == 200, made.text
            assert made.json()["expenses"][-1]["amount"] == minor
        rent = client.post(
            url, json={"amount": 5000, "category": "rent", "method": "upi", "note": " shop\nrent "}
        ).json()
        assert rent["spent"] == 100000 + 100000 + 17000 + 500000
        assert rent["expenses"][-1]["note"] == "shop rent"
        # UPI is not cash out of the drawer.
        assert rent["cash"]["cash_spent"] == 217000
        for bad in ("", "abc", "0", "-5", "1,5"):
            refused = client.post(url, json={"amount": bad})
            assert refused.status_code == 422, bad
        future = (evening(app, uid, bid).date() + timedelta(days=1)).isoformat()
        assert client.post(url, json={"amount": 10, "date": future}).status_code == 422


def test_cash_in_hand_and_the_count_difference(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        close = evening(app, uid, bid)
        at(monkeypatch, close)
        day = close.date()
        save_sales(
            app,
            uid,
            bid,
            [{"date": day.isoformat(), "item": "Tea", "quantity": 10, "revenue": 300000}],
        )
        client.post(
            f"/api/v1/businesses/{bid}/expenses", json={"amount": "500", "category": "stock"}
        )
        client.post(
            f"/api/v1/businesses/{bid}/expenses",
            json={"amount": "200", "category": "bills", "method": "upi"},
        )
        cash = f"/api/v1/businesses/{bid}/money/{day.isoformat()}/cash"
        # Total only: every sale counts as cash. 1,000 opening + 3,000 sales - 500 cash spent.
        result = client.put(cash, json={"opening": "1,000"}).json()
        assert result["sales"] == 300000 and result["spent"] == 70000 and result["left"] == 230000
        assert result["cash"]["opening_from"] == "today"
        assert result["cash"]["expected"] == 100000 + 300000 - 50000
        # Split: 1,200 came by UPI.
        result = client.put(cash, json={"upi_sales": "1,200"}).json()
        assert result["cash"]["cash_sales"] == 180000
        assert result["cash"]["expected"] == 100000 + 180000 - 50000
        # Counted 2,250: 50 short. The opening stays as it was (only sent fields change).
        result = client.put(cash, json={"counted": "2,250"}).json()
        assert result["cash"]["opening"] == 100000
        assert result["cash"]["counted"] == 225000 and result["cash"]["difference"] == -5000
        # Clearing the count clears the difference.
        cleared = client.put(cash, json={"counted": ""}).json()
        assert cleared["cash"]["counted"] is None and cleared["cash"]["difference"] is None
        client.put(cash, json={"counted": "2,250"})
        # Next day opens with last night's count; with no count, the usual float set once.
        at(monkeypatch, close + timedelta(days=1))
        assert money(client, bid)["cash"]["opening"] == 225000
        assert money(client, bid)["cash"]["opening_from"] == "yesterday"
        at(monkeypatch, close + timedelta(days=9))
        later = money(client, bid)["cash"]
        assert later["opening"] == 100000 and later["opening_from"] == "usual"


def test_edit_delete_and_undo(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        at(monkeypatch, evening(app, uid, bid))
        made = client.post(f"/api/v1/businesses/{bid}/expenses", json={"amount": "300"}).json()
        [expense] = made["expenses"]
        path = f"/api/v1/businesses/{bid}/expenses/{made['date']}/{expense['id']}"
        edited = client.patch(path, json={"amount": "1,000", "category": "wages", "note": "Raju"})
        assert edited.status_code == 200, edited.text
        assert edited.json()["expenses"][0] | {"created": 0} == expense | {
            "amount": 100000,
            "category": "wages",
            "note": "Raju",
            "created": 0,
        }
        gone = client.delete(path).json()
        assert gone["expenses"] == [] and gone["spent"] == 0
        back = client.post(path + "/restore").json()
        assert back["spent"] == 100000 and back["expenses"][0]["note"] == "Raju"
        assert client.delete(path.replace(expense["id"], "nope")).status_code == 404


def test_a_received_order_logs_once(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        at(monkeypatch, evening(app, uid, bid))
        body = {"amount": "1,240", "category": "stock", "note": "Atta", "order_id": "po-1"}
        first = client.post(f"/api/v1/businesses/{bid}/expenses", json=body).json()
        again = client.post(f"/api/v1/businesses/{bid}/expenses", json=body).json()
        assert len(again["expenses"]) == 1 and first["spent"] == again["spent"] == 124000
        assert again["expenses"][0]["source"] == "order"


def test_week_and_home_lines(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        close = evening(app, uid, bid)
        at(monkeypatch, close)
        day = close.date()
        yesterday = day - timedelta(days=1)
        save_sales(
            app,
            uid,
            bid,
            [
                {"date": yesterday.isoformat(), "item": "Tea", "quantity": 5, "revenue": 100000},
                {"date": day.isoformat(), "item": "Tea", "quantity": 5, "revenue": 200000},
            ],
        )
        url = f"/api/v1/businesses/{bid}/expenses"
        client.post(url, json={"amount": "300", "date": yesterday.isoformat()})
        client.post(url, json={"amount": "500"})
        week = client.get(f"/api/v1/businesses/{bid}/money/week").json()
        assert len(week["days"]) == 7 and week["end"] == day.isoformat()
        assert (week["sales"], week["spent"], week["left"]) == (300000, 80000, 220000)
        today = client.get(f"/api/v1/businesses/{bid}/today").json()
        assert (today["spent_yesterday"], today["spent_today"]) == (30000, 50000)


@pytest.mark.parametrize(
    ("said", "amount", "category", "note", "method"),
    [
        ("doodh 300 ka kharcha", "300", "stock", "doodh", "cash"),
        ("paid rent 5000", "5000", "rent", "rent", "cash"),
        ("दूध 300 का खर्चा", "300", "stock", "दूध", "cash"),
        ("किराया 5000 दिया", "5000", "rent", "किराया", "cash"),
        ("मैंने 300 रुपये दूध पर खर्च किए", "300", "stock", "दूध", "cash"),
        ("bijli bill 1,500 bhara upi se", "1,500", "bills", "bijli bill", "upi"),
        ("spent ₹1,000 on auto", "1,000", "transport", "auto", "cash"),
        ("helper ko 2000 pagar diya", "2000", "wages", "helper pagar", "cash"),
        ("auto ka bhada 50 diya", "50", "transport", "auto bhada", "cash"),
        ("sabzi 170/- ka kharcha", "170", "stock", "sabzi", "cash"),
    ],
)
def test_chat_words(said: str, amount: str, category: str, note: str, method: str) -> None:
    found = expense_words(said)
    assert found is not None
    assert (found.amount, found.category, found.note, found.method) == (
        amount,
        category,
        note,
        method,
    )


@pytest.mark.parametrize(
    "said",
    [
        "rent mat likho 5000 diya",
        "don't note rent 5000 paid",
        "किराया 5000 नहीं दिया",
        "दूध 300 का खर्चा मत लिखो",
        "2 kg doodh 120 ka kharcha",  # two numbers: the coach asks which is the amount
        "how much did I pay for rent 5000?",
        "samosa 20",
        "chai 20 ki hai",
        # What the owner made or sold is stock, not an expense (OB-310).
        "bun maska 10 more bana diye",
        "Bun maska 10 aur bana diye hain",
        "बन मस्का 10 और बना दिए",
        "samosa 20 bik gaye",
        # "Gave 500" with nothing it was for is not clearly an expense.
        "Raju ko 500 diye",
    ],
)
def test_chat_words_that_are_not_an_expense(said: str) -> None:
    assert expense_words(said) is None


async def test_chat_adds_through_the_same_endpoint_function(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        close = evening(app, uid, bid)
        at(monkeypatch, close)
        repo = app.state.merchant
        ctx = MerchantContext(store=repo, uid=uid, business_id=bid, recalled=[])
        reply = await route("doodh 300 ka kharcha", ctx)
        assert reply is not None and reply.intent == "expense"
        assert "300" in reply.reply and "Grow → Close the day" in reply.reply
        assert reply.events[0].data["target"] == "close_day"
        hindi = await route("किराया 5000 दिया", ctx)
        assert hindi is not None and "लिख लिया" in hindi.reply
        none = await route("rent 5000 mat likho, nahi diya", ctx)
        assert none is None or none.intent != "expense"
        day = money(client, bid)
        assert [(e["amount"], e["category"], e["source"]) for e in day["expenses"]] == [
            (30000, "stock", "chat"),
            (500000, "rent", "chat"),
        ]
        # "kal" in the past tense is yesterday's expense.
        await route("kal sabzi 170 ka kharcha", ctx)
        assert money(client, bid, (close.date() - timedelta(days=1)).isoformat())["spent"] == 17000
        # Nothing is written before the current terms.
        repo.record_consent(uid, "old")
        refused = await route("doodh 300 ka kharcha", ctx)
        assert refused is not None and "accept the updated terms" in refused.reply
        assert money(client, bid)["spent"] == 530000
        repo.record_consent(uid, LEGAL_VERSION)


def test_money_records_are_erased_with_the_shop(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        uid, bid = owned_shop(client, app)
        at(monkeypatch, evening(app, uid, bid))
        client.post(f"/api/v1/businesses/{bid}/expenses", json={"amount": "300", "order_id": "x"})
        day = money(client, bid)["date"]
        repo = app.state.merchant
        assert repo.feature_docs.get("money_day", f"{bid}:{day}")
        repo.erase_owner(uid)
        assert repo.feature_docs.get("money_day", f"{bid}:{day}") is None
        assert repo.feature_docs.get("money_order", f"{bid}:x") is None
