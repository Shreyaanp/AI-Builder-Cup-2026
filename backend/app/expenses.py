"""Expenses and cash in hand: what the shop paid out today, and what should be in the drawer.

One endpoint writes an expense, whether the owner typed it on the close screen or said it in the
chat ("doodh 300 ka kharcha", "paid rent 5000"): both call `add_expense`. Each shop-local day is
one small document (`money_day`) holding that day's expenses and its cash figures, so a day reads
in one get and an old shop with no document simply has no expenses (nothing to migrate).

Cash in hand = opening cash + cash sales - expenses paid in cash. The opening cash is the owner's
figure for the day, else yesterday's counted cash, else the usual float the owner set once.
Sales split into cash and UPI only when the owner says how much came by UPI; without it every sale
counts as cash (total-only is allowed). A day closed with one total counts as that day's sales,
and a split saved with that total is the day's split: there is one UPI figure, never two. The
short-or-extra line waits for the day's sales, since before them there is nothing to compare. A
deleted expense is kept, marked deleted, so Undo brings it back exactly. Everything is erased with
the shop.
"""

import re
import time
import unicodedata
from datetime import date, timedelta
from datetime import date as Day  # a field below is named `date`
from typing import Any, Literal
from uuid import uuid4

import anyio
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .day_total import with_day_totals
from .limits import enforce_limits
from .merchant import MONEY_KINDS, MerchantRepository
from .merchant_routes import consented_owner, owner, store
from .money import exponent
from .numbers import read_number
from .region import money_text, shop_currency
from .rescue import local_now

router = APIRouter(prefix="/api/v1/businesses", tags=["money"])

# Erased with the shop (MONEY_KINDS in merchant.py and merchant_firestore.py).
DAY_KIND, USUAL_KIND, ORDER_KIND = MONEY_KINDS
MAX_EXPENSES = 100
MAX_NOTE = 60
MAX_MINOR = 100_000_000_000
# How far back the opening cash looks for a counted day (a shop closed on Sunday still carries).
CARRY_DAYS = 7

Category = Literal["stock", "rent", "wages", "transport", "bills", "other"]
Method = Literal["cash", "upi"]
Source = Literal["manual", "chat", "order"]
CATEGORIES: tuple[str, ...] = ("stock", "rent", "wages", "transport", "bills", "other")


class Expense(BaseModel):
    id: str
    amount: int  # minor units
    category: Category
    note: str = ""
    method: Method = "cash"
    source: Source = "manual"
    order_id: str | None = None
    created: float = 0


class ExpenseInput(BaseModel):
    # Typed as said: 300 / "1,000" / "₹1,000" / "170/-". Read with the shared number reader.
    amount: str | float = Field(union_mode="left_to_right")
    category: Category = "other"
    note: str = Field(default="", max_length=200)
    method: Method = "cash"
    # Shop-local day; today by default.
    date: Day | None = None
    # A received supplier order logged in one tap: one expense per order, however often tapped.
    order_id: str | None = Field(default=None, max_length=80)


class ExpenseEdit(BaseModel):
    amount: str | float | None = Field(default=None, union_mode="left_to_right")
    category: Category | None = None
    note: str | None = Field(default=None, max_length=200)
    method: Method | None = None


class CashInput(BaseModel):
    """Only the fields sent change; an empty value clears one."""

    opening: str | float | None = Field(default=None, union_mode="left_to_right")
    counted: str | float | None = Field(default=None, union_mode="left_to_right")
    upi_sales: str | float | None = Field(default=None, union_mode="left_to_right")


class Cash(BaseModel):
    opening: int | None
    # "today": set for this day; "yesterday": the last counted cash; "usual": the owner's float.
    opening_from: Literal["today", "yesterday", "usual"] | None
    cash_sales: int
    upi_sales: int | None
    # "total": saved with the day's one total and changed there; "drawer": typed in the drawer.
    upi_from: Literal["total", "drawer"] | None = None
    cash_spent: int
    expected: int
    counted: int | None
    # None until the count and the day's sales are both in.
    difference: int | None


class MoneyDay(BaseModel):
    date: date
    currency: str
    expenses: list[Expense]
    spent: int
    sales: int | None
    left: int | None
    cash: Cash


class OrderExpense(BaseModel):
    noted: bool
    amount: int | None = None


class WeekDay(BaseModel):
    date: date
    sales: int | None
    spent: int


class MoneyWeek(BaseModel):
    start: date
    end: date
    currency: str
    days: list[WeekDay]
    sales: int
    spent: int
    left: int


def _key(bid: str, day: date) -> str:
    return f"{bid}:{day.isoformat()}"


def clean_note(text: str) -> str:
    return re.sub(r"[\x00-\x1f\x7f]+", " ", " ".join(text.split()))[:MAX_NOTE].strip()


def to_minor(value: str | float | None, currency: str, *, zero: bool = False) -> int | None:
    """An amount as the owner wrote it, in minor units; None when empty. Unclear → 422."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    number = read_number(value, currency)
    if number is None or number < 0 or (number == 0 and not zero):
        raise HTTPException(422, "AMOUNT_UNCLEAR")
    minor = round(number * 10 ** exponent(currency))
    if minor > MAX_MINOR:
        raise HTTPException(422, "AMOUNT_TOO_LARGE")
    return minor


def shop_day(fields: dict[str, Any]) -> date:
    return local_now(fields).date()


def sales_on(sales: list[dict[str, Any]], day: date) -> int | None:
    rows = [r for r in sales if r.get("date") == day.isoformat()]
    return sum(int(r.get("revenue") or 0) for r in rows) if rows else None


def upi_on(
    sales: list[dict[str, Any]], day: date, typed: int | None
) -> tuple[int | None, Literal["total", "drawer"] | None]:
    """The day's one UPI figure: the split saved with its total, else what the drawer was told."""
    for row in sales:
        if row.get("date") == day.isoformat() and row.get("upi") is not None:
            return int(row["upi"]), "total"
    return typed, "drawer" if typed is not None else None


def _opening(
    repository: MerchantRepository, bid: str, day: date, data: dict[str, Any]
) -> tuple[int | None, str | None]:
    if data.get("opening") is not None:
        return int(data["opening"]), "today"
    for back in range(1, CARRY_DAYS + 1):
        before = repository.feature_docs.get(DAY_KIND, _key(bid, day - timedelta(days=back)))
        if before and before.get("counted") is not None:
            return int(before["counted"]), "yesterday"
    usual = repository.feature_docs.get(USUAL_KIND, bid)
    if usual and usual.get("opening") is not None:
        return int(usual["opening"]), "usual"
    return None, None


def summary(
    repository: MerchantRepository,
    bid: str,
    fields: dict[str, Any],
    day: date,
    sales: list[dict[str, Any]],
) -> MoneyDay:
    data = repository.feature_docs.get(DAY_KIND, _key(bid, day)) or {}
    expenses = [Expense.model_validate(e) for e in data.get("expenses", []) if not e.get("deleted")]
    spent = sum(e.amount for e in expenses)
    cash_spent = sum(e.amount for e in expenses if e.method == "cash")
    sold = sales_on(sales, day)
    upi, upi_from = upi_on(sales, day, data.get("upi_sales"))
    cash_sales = max(0, (sold or 0) - (upi or 0))
    opening, opening_from = _opening(repository, bid, day, data)
    expected = (opening or 0) + cash_sales - cash_spent
    counted = data.get("counted")
    return MoneyDay(
        date=day,
        currency=shop_currency(fields),
        expenses=sorted(expenses, key=lambda e: e.created),
        spent=spent,
        sales=sold,
        # What is left only once the day's sales are saved: before that it is not a result.
        left=sold - spent if sold is not None else None,
        cash=Cash(
            opening=opening,
            opening_from=opening_from,  # type: ignore[arg-type]
            cash_sales=cash_sales,
            upi_sales=upi,
            upi_from=upi_from,
            cash_spent=cash_spent,
            expected=expected,
            counted=counted,
            # Without the day's sales this would call a full drawer "extra" (cash sales read 0).
            difference=counted - expected if counted is not None and sold is not None else None,
        ),
    )


def order_expense(repository: MerchantRepository, bid: str, order_id: str) -> Expense | None:
    """The expense a received order was noted as, unless the owner has since deleted it."""
    logged = repository.feature_docs.get(ORDER_KIND, f"{bid}:{order_id}")
    if not logged:
        return None
    found = repository.feature_docs.get(DAY_KIND, _key(bid, date.fromisoformat(logged["day"])))
    for entry in (found or {}).get("expenses", []):
        if entry["id"] == logged["id"] and not entry.get("deleted"):
            return Expense.model_validate(entry)
    return None


def add_expense(
    repository: MerchantRepository,
    bid: str,
    fields: dict[str, Any],
    body: ExpenseInput,
    source: Source = "manual",
) -> Expense:
    """The one way an expense is written: the close screen, the chat and a received order."""
    currency = shop_currency(fields)
    amount = to_minor(body.amount, currency)
    if amount is None:
        raise HTTPException(422, "AMOUNT_UNCLEAR")
    today = shop_day(fields)
    day = body.date or today
    if day > today or day < today - timedelta(days=60):
        raise HTTPException(422, "DAY_OUT_OF_RANGE")
    if body.order_id:
        already = order_expense(repository, bid, body.order_id)
        if already:
            return already
    expense = Expense(
        id=uuid4().hex[:12],
        amount=amount,
        category=body.category,
        note=clean_note(body.note),
        method=body.method,
        source="order" if body.order_id else source,
        order_id=body.order_id,
        created=time.time(),
    )

    def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        current = dict(data or {})
        rows = list(current.get("expenses", []))
        if sum(1 for r in rows if not r.get("deleted")) >= MAX_EXPENSES:
            raise HTTPException(409, "TOO_MANY_EXPENSES")
        current["expenses"] = [*rows, expense.model_dump()]
        return time.time(), current

    repository.feature_docs.update(DAY_KIND, _key(bid, day), bid, change)
    if body.order_id:
        repository.feature_docs.put(
            ORDER_KIND,
            f"{bid}:{body.order_id}",
            bid,
            time.time(),
            {"day": day.isoformat(), "id": expense.id},
        )
    return expense


def _edit(
    repository: MerchantRepository,
    bid: str,
    day: date,
    eid: str,
    edit: Any,
) -> None:
    found: list[bool] = []

    def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
        found.clear()
        if not data:
            return None
        rows = []
        for row in data.get("expenses", []):
            if row["id"] == eid:
                found.append(True)
                row = edit(dict(row))
            rows.append(row)
        return (time.time(), {**data, "expenses": rows}) if found else None

    repository.feature_docs.update(DAY_KIND, _key(bid, day), bid, change)
    if not found:
        raise HTTPException(404, "EXPENSE_NOT_FOUND")


def set_cash(
    repository: MerchantRepository,
    bid: str,
    fields: dict[str, Any],
    day: date,
    body: CashInput,
) -> None:
    currency = shop_currency(fields)
    values = {
        name: to_minor(getattr(body, name), currency, zero=True)
        for name in body.model_fields_set
        if name in ("opening", "counted", "upi_sales")
    }

    def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        return time.time(), {**(data or {}), **values}

    repository.feature_docs.update(DAY_KIND, _key(bid, day), bid, change)
    if values.get("opening") is not None:
        # Set once: the usual float carries to days with no count before them.
        repository.feature_docs.put(
            USUAL_KIND, bid, bid, time.time(), {"opening": values["opening"]}
        )


def week(
    repository: MerchantRepository,
    bid: str,
    fields: dict[str, Any],
    end: date,
    sales: list[dict[str, Any]],
) -> MoneyWeek:
    days: list[WeekDay] = []
    for back in range(6, -1, -1):
        day = end - timedelta(days=back)
        data = repository.feature_docs.get(DAY_KIND, _key(bid, day)) or {}
        spent = sum(int(e["amount"]) for e in data.get("expenses", []) if not e.get("deleted"))
        days.append(WeekDay(date=day, sales=sales_on(sales, day), spent=spent))
    total = sum(d.sales or 0 for d in days)
    spent = sum(d.spent for d in days)
    return MoneyWeek(
        start=days[0].date,
        end=end,
        currency=shop_currency(fields),
        days=days,
        sales=total,
        spent=spent,
        left=total - spent,
    )


def spent_on(repository: MerchantRepository, bid: str, day: date) -> int:
    data = repository.feature_docs.get(DAY_KIND, _key(bid, day)) or {}
    return sum(int(e["amount"]) for e in data.get("expenses", []) if not e.get("deleted"))


# --- Routes ---------------------------------------------------------------------------------


async def _shop(request: Request, business_id: str, write: bool) -> tuple[str, dict[str, Any]]:
    uid = await (consented_owner(request) if write else owner(request))
    await enforce_limits(request, [("owner:write" if write else "owner:read", uid)])
    business = await anyio.to_thread.run_sync(store(request).owned_business, uid, business_id)
    return uid, business.get("fields") or {}


def _takings(repository: Any, uid: str, bid: str) -> list[dict[str, Any]]:
    """Sales rows plus the days closed with one total: everything that adds up a day's money."""
    return with_day_totals(repository, bid, repository.sales_history(uid, bid))


async def _summary(
    request: Request, uid: str, business_id: str, fields: dict[str, Any], day: date
) -> MoneyDay:
    service = store(request)
    sales = await anyio.to_thread.run_sync(_takings, service, uid, business_id)
    return await anyio.to_thread.run_sync(summary, service, business_id, fields, day, sales)


@router.get("/{business_id}/money/week", response_model=MoneyWeek)
async def read_week(business_id: str, request: Request, end: date | None = None) -> MoneyWeek:
    uid, fields = await _shop(request, business_id, write=False)
    service = store(request)
    sales = await anyio.to_thread.run_sync(_takings, service, uid, business_id)
    return await anyio.to_thread.run_sync(
        week, service, business_id, fields, end or shop_day(fields), sales
    )


@router.get("/{business_id}/money", response_model=MoneyDay)
async def read_day(business_id: str, request: Request, day: date | None = None) -> MoneyDay:
    """One day's expenses, sales, what is left and the cash in hand (today by default)."""
    uid, fields = await _shop(request, business_id, write=False)
    return await _summary(request, uid, business_id, fields, day or shop_day(fields))


@router.get("/{business_id}/expenses/order/{order_id}", response_model=OrderExpense)
async def read_order_expense(business_id: str, order_id: str, request: Request) -> OrderExpense:
    """Whether a received order is already noted, so its card says so after a reload."""
    await _shop(request, business_id, write=False)
    found = await anyio.to_thread.run_sync(order_expense, store(request), business_id, order_id)
    return OrderExpense(noted=found is not None, amount=found.amount if found else None)


@router.post("/{business_id}/expenses", response_model=MoneyDay)
async def new_expense(business_id: str, body: ExpenseInput, request: Request) -> MoneyDay:
    uid, fields = await _shop(request, business_id, write=True)
    service = store(request)
    await anyio.to_thread.run_sync(lambda: add_expense(service, business_id, fields, body))
    return await _summary(request, uid, business_id, fields, body.date or shop_day(fields))


@router.patch("/{business_id}/expenses/{day}/{expense_id}", response_model=MoneyDay)
async def edit_expense(
    business_id: str, day: date, expense_id: str, body: ExpenseEdit, request: Request
) -> MoneyDay:
    uid, fields = await _shop(request, business_id, write=True)
    currency = shop_currency(fields)
    amount = to_minor(body.amount, currency) if body.amount is not None else None

    def edit(row: dict[str, Any]) -> dict[str, Any]:
        if amount is not None:
            row["amount"] = amount
        if body.category is not None:
            row["category"] = body.category
        if body.note is not None:
            row["note"] = clean_note(body.note)
        if body.method is not None:
            row["method"] = body.method
        return row

    await anyio.to_thread.run_sync(_edit, store(request), business_id, day, expense_id, edit)
    return await _summary(request, uid, business_id, fields, day)


@router.delete("/{business_id}/expenses/{day}/{expense_id}", response_model=MoneyDay)
async def delete_expense(
    business_id: str, day: date, expense_id: str, request: Request
) -> MoneyDay:
    """Marked deleted, not dropped: Undo restores it exactly."""
    uid, fields = await _shop(request, business_id, write=True)
    await anyio.to_thread.run_sync(
        _edit, store(request), business_id, day, expense_id, lambda r: {**r, "deleted": True}
    )
    return await _summary(request, uid, business_id, fields, day)


@router.post("/{business_id}/expenses/{day}/{expense_id}/restore", response_model=MoneyDay)
async def restore_expense(
    business_id: str, day: date, expense_id: str, request: Request
) -> MoneyDay:
    uid, fields = await _shop(request, business_id, write=True)
    await anyio.to_thread.run_sync(
        _edit,
        store(request),
        business_id,
        day,
        expense_id,
        lambda r: {k: v for k, v in r.items() if k != "deleted"},
    )
    return await _summary(request, uid, business_id, fields, day)


@router.put("/{business_id}/money/{day}/cash", response_model=MoneyDay)
async def put_cash(business_id: str, day: date, body: CashInput, request: Request) -> MoneyDay:
    uid, fields = await _shop(request, business_id, write=True)
    if day > shop_day(fields):
        raise HTTPException(422, "DAY_OUT_OF_RANGE")
    await anyio.to_thread.run_sync(lambda: set_cash(store(request), business_id, fields, day, body))
    return await _summary(request, uid, business_id, fields, day)


# --- The same expense said in the chat or by voice ------------------------------------------

DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


# What may touch a whole Devanagari word: a space or punctuation ("ग्राहक, 500 दिए").
EDGE = r"\s,.;:!?।/()'\"\-"
END = rf"(?![^{EDGE}])"


def _hi(words: str) -> str:
    """Whole Devanagari words: a regex word edge falls inside them (at vowel signs), so
    spaces and punctuation mark the edges instead."""
    return rf"(?<![^{EDGE}])(?:{words}){END}"


# Saying it is an expense: kharcha, spent, खर्च…
CUE = re.compile(
    r"\b(?:kharch[aei]?|kharach[aei]?|expenses?|spent|spend)\b|" + _hi("खर्च[ाेी]?"),
    re.I,
)
# "Paid", "gave", "filled": an expense only with what it was for ("kiraya 5000 diya"), never
# alone ("customer paid 500" is money in; "bun maska 10 aur bana diye" is what was made, OB-310).
WEAK_CUE = re.compile(
    r"\b(?:paid|pay|diya|diye|di|bhara|bhare|chukaya|chukaye)\b|"
    + _hi("दिया|दिए|दिये|दी|भरा|भरे|चुकाया|चुकाए"),
    re.I,
)
# Making or selling something is never an expense: "10 more bana diye", "बना दिए", "made 20".
MADE = re.compile(
    r"\b(?:bana|banaa|banaya|banaye|banai|bane|made|make|making|sold|bik|bike|biki)\b|"
    + _hi("बना|बनाए|बनाये|बनाया|बनाई|बने|बिक|बिके|बिकी|बिका"),
    re.I,
)
# Money coming in, or owed: a customer paying, credit settled, a refund, a return. Saving one of
# these would take it off the drawer when it went into it, so any of these words means "not an
# expense" (the owner can still add one by hand on Close the day).
MONEY_IN = re.compile(
    r"\b(?:customers?|custmers?|costumers?|grahak|graahak|gahak|clients?|buyers?"
    r"|refund(?:s|ed)?|return(?:s|ed)?|wapas|wapis|vapas|vapis|lautaya|lautaye|lautayi"
    r"|udhaar|udhar|udhari|udhaari|credit(?!\s*card)|baaki|baki|bakaya|jama"
    r"|received?|receiving|got|mila|mile|mili|vasool|wasool|vasooli|wasooli|collected|collection"
    r"|income|earned|kamaya|kamai|sales?|bikri|mujhe|mujhko|hame|hamein|humein|hume|hamko|humko"
    r"|to\s+me|to\s+us)\b|"
    + _hi(
        "ग्राहक|ग्राहकों|कस्टमर|रिफंड|वापस|लौटाया|लौटाए|लौटाई|उधार|उधारी|बकाया|बाकी|बाक़ी|जमा"
        "|मिला|मिले|मिली|वसूल|वसूली|आमदनी|कमाई|कमाया|बिक्री|मुझे|मुझको|हमें|हमको"
    ),
    re.I,
)
# Someone else did the paying: "Sharma ji ne 500 diye", "Raju ne bill bhara", "Sharma ji paid
# bill 500", "rent paid by Sharma". The owner's own "maine", "main ne", "hum ne" are not this.
SOMEONE_ELSE = re.compile(
    r"(?<!\S)(?!(?:main|mai|mein|maine|mene|hum|ham|hamne|humne|मैं|मै|मैंने|हम|हमने)\s)"
    rf"\S+\s+(?:ne|ने){END}"
    r"|\b(?:ji|sahab|saab|bhai|bhaiya|didi|aunty|uncle|sir|madam)\s+(?:has\s+|had\s+)?"
    r"(?:paid|pay|gave|diya|diye|di|bhara|chukaya)\b"
    r"|\bpaid\s+by\s+(?!(?:cash|upi|gpay|google|phone|paytm|bhim|online|qr|card|credit|debit"
    r"|cheque|check|neft|imps|rtgs|bank|me|us)\b)"
    rf"|जी\s+(?:दिया|दिए|दिये|दी|भरा|चुकाया){END}",
    re.I,
)
# Not done yet, so nothing has left the drawer: "kal 500 ka kharcha hoga", "will pay rent 5000".
FUTURE = re.compile(
    r"\b(?:hoga|hogi|honge|hoge|karna|karni|karne|karenge|karunga|karungi|dena|deni|denge"
    r"|dunga|dungi|bharna|bharenge|jayega|jayegi|jaega|jaegi|lagega|lagegi|will|shall|gonna"
    r"|tomorrow|parso|parson|agle|agla|agli|going\s+to|have\s+to|has\s+to|need\s+to|needs\s+to"
    r"|next\s+(?:week|month|year))\b|"
    + _hi(
        "होगा|होगी|होंगे|करना|करनी|करेंगे|करूंगा|करूँगा|देना|देनी|देंगे|दूंगा|दूँगा|भरना|जाएगा"
        "|जाएगी|लगेगा|लगेगी|परसों|अगले|अगला|अगली"
    ),
    re.I,
)
# The one number counts something other than money: "spent 2 hours", "2 kg doodh ka kharcha".
NOT_MONEY = re.compile(
    r"\d\s*(?:%|(?:hours?|hrs?|ghant[ae]|minutes?|mins?|seconds?|secs?|days?|din|weeks?|hafte"
    r"|hafta|months?|mahine|mahina|years?|saal|baar|times|baje|am|pm|kgs?|kilos?|gms?|grams?|g"
    r"|ltrs?|litres?|liters?|l|ml|packets?|pkts?|pieces?|pcs?|dozen|darjan|boxes|box|bags?|bori"
    r"|peti|crates?|nag|people|log)\b)|"
    r"\d\s*(?:घंटे|घंटा|घण्टे|मिनट|सेकंड|दिन|हफ़्ते|हफ्ते|हफ़्ता|हफ्ता|महीने|महीना|साल|बार|बजे"
    rf"|किलो|ग्राम|लीटर|पैकेट|पीस|दर्जन|बोरी|पेटी|लोग){END}",
    re.I,
)
NEGATION = re.compile(
    r"\b(?:don'?t|do\s+not|did\s+not|didn'?t|not|never|no|mat|nahi|nahin|nai|na)\b|"
    + _hi("मत|नहीं|नही|ना"),
    re.I,
)
# Anything that did not come out of the drawer: a card or bank payment is "not cash" here too.
UPI = re.compile(
    r"\b(?:upi|gpay|google\s*pay|phone\s*pe|phonepe|paytm|bhim|online|qr|card|cheque|check|neft"
    r"|imps|rtgs|bank)\b|" + _hi("यूपीआई|ऑनलाइन|कार्ड|चेक|बैंक"),
    re.I,
)
YESTERDAY = re.compile(r"\b(?:yesterday|kal)\b|" + _hi("कल"), re.I)
# A number as typed: 300 · 1,000 · 1,00,000 · 250.50 · ₹1,000 · Rs. 500 · 170/-
AMOUNT = re.compile(r"(?:₹|\brs\.?|\binr)?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*/-)?", re.I)
# First match wins: "auto ka bhada" is transport, "doodh ka bill" is stock.
CATEGORY_WORDS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "transport",
        re.compile(
            r"\b(?:transport|auto|rickshaw|petrol|diesel|tempo|delivery|courier|taxi|cab|bus"
            r"|gaadi|gadi)\b|" + _hi("ऑटो|पेट्रोल|डीजल|टेम्पो|गाड़ी|रिक्शा|भाड़े"),
            re.I,
        ),
    ),
    (
        "rent",
        re.compile(
            r"\b(?:rent|kiraya|kiraaya|bhada|bhaada)\b|" + _hi("किराया|किराए|किराये|भाड़ा|भाडा"),
            re.I,
        ),
    ),
    (
        "wages",
        re.compile(
            r"\b(?:wages?|salary|salaries|pagar|tankha|tankhwah|majduri|mazdoori|staff|helper"
            r"|worker|kaarigar|karigar)\b|" + _hi("तनख्वाह|तनखा|वेतन|मजदूरी|मज़दूरी|पगार|हेल्पर"),
            re.I,
        ),
    ),
    (
        "stock",
        re.compile(
            r"\b(?:stock|maal|mal|saman|samaan|doodh|dudh|milk|sabzi|sabji|atta|aata|cheeni"
            r"|chini|sugar|chai\s*patti|tea|oil|tel|dal|rice|chawal|besan|maida|paneer|bread"
            r"|eggs?|ande|anda|vegetables?|fruits?|supplies|groceries|kirana)\b|"
            + _hi(
                r"दूध|सब्ज़ी|सब्जी|माल|सामान|आटा|चीनी|चायपत्ती|चाय\s+पत्ती|तेल|दाल|चावल|बेसन"
                r"|मैदा|पनीर|अंडे|अंडा|फल"
            ),
            re.I,
        ),
    ),
    (
        "bills",
        re.compile(
            r"\b(?:bills?|bijli|electricity|light|current|water|pani|paani|gas|cylinder|phone"
            r"|recharge|internet|wifi|broadband)\b|" + _hi("बिजली|बिल|पानी|गैस|सिलेंडर|रिचार्ज"),
            re.I,
        ),
    ),
)
# Words that say how, when or that it was paid; what is left is the owner's note ("doodh").
FILLER = re.compile(
    r"\b(?:kharch[aei]?|kharach[aei]?|expenses?|spent|spend|paid|pay|diya|diye|di|bhara|bhare"
    r"|chukaya|chukaye|ka|ki|ke|ko|ne|me|mein|on|for|the|a|an|of|to|in|by|with|via|rs|inr"
    r"|rupees?|rupaye|rupay|rupiya|bucks|se|cash|nakad|naqad|upi|gpay|google\s*pay|phone\s*pe"
    r"|phonepe|paytm|bhim|online|qr|today|aaj|yesterday|kal|i|we|hai|tha|hua|hue|hogaya"
    r"|ho\s+gaya|gaya|aur|maine|mene|main|mai|hum|ham|kiya|kiye|kar|par|pe|note|add|write|likh\s+do|likho"
    r"|likhna|likh|daalo|daal|jodo)\b|"
    + _hi(
        r"खर्च[ाेी]?|दिया|दिए|दिये|दी|भरा|भरे|चुकाया|चुकाए|का|की|के|को|ने|में|से|पर|पे|रुपये|रुपए"
        r"|रु|नकद|कैश|यूपीआई|ऑनलाइन|आज|कल|है|था|हुआ|हुए|गया|और|मैंने|मैं|हमने|हम|किया|किए|किये|कर"
        r"|लिख\s+दो|लिखना|लिखो|लिख|जोड़ो|डालो"
    )
    + r"|[₹/\-.,:;!?।]",
    re.I,
)


class ChatExpense(BaseModel):
    said: str
    amount: str
    category: Category
    note: str
    method: Method
    yesterday: bool


def expense_words(text: str) -> ChatExpense | None:
    """An expense said in the chat or by voice, or None (not one, unclear, or a "don't")."""
    said = unicodedata.normalize("NFC", text).translate(DEVANAGARI_DIGITS).strip()
    said = said.rstrip(" .!।")
    if (
        not said
        or len(said) > 160
        or "?" in said  # a question about money is the coach's to answer
        or not (CUE.search(said) or WEAK_CUE.search(said))
        or NEGATION.search(said)
        or MADE.search(said)
        or MONEY_IN.search(said)
        or SOMEONE_ELSE.search(said)
        or FUTURE.search(said)
        or NOT_MONEY.search(said)
    ):
        return None
    amounts = [m.group(1) for m in AMOUNT.finditer(said)]
    if len(amounts) != 1:
        return None  # none, or two numbers ("2 kg doodh 120"): the coach asks
    category = next((name for name, words in CATEGORY_WORDS if words.search(said)), "other")
    if not CUE.search(said) and category == "other":
        return None  # "gave 500", "paid 500" with nothing it was for: not clearly an expense
    rest = AMOUNT.sub(" ", said)
    note = " ".join(FILLER.sub(" ", rest).split())
    return ChatExpense(
        said=said,
        amount=amounts[0],
        category=category,  # type: ignore[arg-type]
        note=clean_note(note),
        method="upi" if UPI.search(said) else "cash",
        yesterday=bool(YESTERDAY.search(said)),
    )


CATEGORY_EN = {
    "stock": "stock purchase",
    "rent": "rent",
    "wages": "wages",
    "transport": "transport",
    "bills": "bills",
    "other": "other",
}
CATEGORY_HI = {
    "stock": "माल ख़रीद",
    "rent": "किराया",
    "wages": "तनख्वाह",
    "transport": "आना-जाना",
    "bills": "बिल",
    "other": "दूसरा",
}


def chat_reply(expense: Expense, currency: str, hindi: bool, yesterday: bool) -> str:
    amount = money_text(expense.amount, currency)
    if hindi:
        what = (
            f"{expense.note} ({CATEGORY_HI[expense.category]})"
            if expense.note
            else (CATEGORY_HI[expense.category])
        )
        how = "यूपीआई से" if expense.method == "upi" else "नकद"
        when = "कल" if yesterday else "आज"
        return (
            f"{when} का खर्चा लिख लिया: {amount}, {what}, {how}। "
            "बदलना या हटाना हो तो बढ़ाएँ → दिन बंद करें में देखें।"
        )
    what = (
        f"{expense.note} ({CATEGORY_EN[expense.category]})"
        if expense.note
        else (CATEGORY_EN[expense.category])
    )
    how = "by UPI" if expense.method == "upi" else "in cash"
    when = "yesterday" if yesterday else "today"
    return (
        f"Noted {when}'s expense: {amount}, {what}, paid {how}. "
        "Change or delete it in Grow → Close the day."
    )
