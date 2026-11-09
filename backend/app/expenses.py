"""Expenses and cash in hand: what the shop paid out today, and what should be in the drawer.

One endpoint writes an expense, whether the owner typed it on the close screen or said it in the
chat ("doodh 300 ka kharcha", "paid rent 5000"): both call `add_expense`. Each shop-local day is
one small document (`money_day`) holding that day's expenses and its cash figures, so a day reads
in one get and an old shop with no document simply has no expenses (nothing to migrate).

Cash in hand = opening cash + cash sales - expenses paid in cash. The opening cash is the owner's
figure for the day, else yesterday's counted cash, else the usual float the owner set once.
Sales split into cash and UPI only when the owner says how much came by UPI; without it every sale
counts as cash (total-only is allowed). A deleted expense is kept, marked deleted, so Undo brings
it back exactly. Everything is erased with the shop.
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
    cash_spent: int
    expected: int
    counted: int | None
    difference: int | None


class MoneyDay(BaseModel):
    date: date
    currency: str
    expenses: list[Expense]
    spent: int
    sales: int | None
    left: int | None
    cash: Cash


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
    upi = data.get("upi_sales")
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
            cash_spent=cash_spent,
            expected=expected,
            counted=counted,
            difference=counted - expected if counted is not None else None,
        ),
    )


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
        logged = repository.feature_docs.get(ORDER_KIND, f"{bid}:{body.order_id}")
        if logged:
            found = repository.feature_docs.get(
                DAY_KIND, _key(bid, date.fromisoformat(logged["day"]))
            )
            for entry in (found or {}).get("expenses", []):
                if entry["id"] == logged["id"] and not entry.get("deleted"):
                    return Expense.model_validate(entry)
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


async def _summary(
    request: Request, uid: str, business_id: str, fields: dict[str, Any], day: date
) -> MoneyDay:
    service = store(request)
    sales = await anyio.to_thread.run_sync(service.sales_history, uid, business_id)
    return await anyio.to_thread.run_sync(summary, service, business_id, fields, day, sales)


@router.get("/{business_id}/money/week", response_model=MoneyWeek)
async def read_week(business_id: str, request: Request, end: date | None = None) -> MoneyWeek:
    uid, fields = await _shop(request, business_id, write=False)
    service = store(request)
    sales = await anyio.to_thread.run_sync(service.sales_history, uid, business_id)
    return await anyio.to_thread.run_sync(
        week, service, business_id, fields, end or shop_day(fields), sales
    )


@router.get("/{business_id}/money", response_model=MoneyDay)
async def read_day(business_id: str, request: Request, day: date | None = None) -> MoneyDay:
    """One day's expenses, sales, what is left and the cash in hand (today by default)."""
    uid, fields = await _shop(request, business_id, write=False)
    return await _summary(request, uid, business_id, fields, day or shop_day(fields))


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


def _hi(words: str) -> str:
    """Whole Devanagari words: a regex word edge falls inside them (at vowel signs), so
    spaces mark the edges instead."""
    return rf"(?<!\S)(?:{words})(?!\S)"


# Saying it is an expense: kharcha, spent, paid, diya, bhara (a bill), खर्च, दिया, भरा…
CUE = re.compile(
    r"\b(?:kharch[aei]?|kharach[aei]?|expenses?|spent|spend|paid)\b|" + _hi("खर्च[ाेी]?"),
    re.I,
)
# "Gave", "pay", "filled": an expense only with what it was for ("kiraya 5000 diya"), never
# alone ("bun maska 10 aur bana diye" is what the owner made, OB-310).
WEAK_CUE = re.compile(
    r"\b(?:pay|diya|diye|di|bhara|bhare|chukaya|chukaye)\b|"
    + _hi("दिया|दिए|दिये|दी|भरा|भरे|चुकाया|चुकाए"),
    re.I,
)
# Making or selling something is never an expense: "10 more bana diye", "बना दिए", "made 20".
MADE = re.compile(
    r"\b(?:bana|banaa|banaya|banaye|banai|bane|made|make|making|sold|bik|bike|biki)\b|"
    + _hi("बना|बनाए|बनाये|बनाया|बनाई|बने|बिक|बिके|बिकी|बिका"),
    re.I,
)
NEGATION = re.compile(
    r"\b(?:don'?t|do\s+not|did\s+not|didn'?t|not|never|no|mat|nahi|nahin|nai|na)\b|"
    + _hi("मत|नहीं|नही|ना"),
    re.I,
)
UPI = re.compile(
    r"\b(?:upi|gpay|google\s*pay|phone\s*pe|phonepe|paytm|bhim|online|qr)\b|" + _hi("यूपीआई|ऑनलाइन"),
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
    r"|ho\s+gaya|gaya|aur|maine|mene|kiya|kiye|kar|par|pe|note|add|write|likh\s+do|likho"
    r"|likhna|likh|daalo|daal|jodo)\b|"
    + _hi(
        r"खर्च[ाेी]?|दिया|दिए|दिये|दी|भरा|भरे|चुकाया|चुकाए|का|की|के|को|ने|में|से|पर|पे|रुपये|रुपए"
        r"|रु|नकद|कैश|यूपीआई|ऑनलाइन|आज|कल|है|था|हुआ|हुए|गया|और|मैंने|मैं|हमने|किया|किए|किये|कर"
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
    ):
        return None
    amounts = [m.group(1) for m in AMOUNT.finditer(said)]
    if len(amounts) != 1:
        return None  # none, or two numbers ("2 kg doodh 120"): the coach asks
    category = next((name for name, words in CATEGORY_WORDS if words.search(said)), "other")
    if not CUE.search(said) and category == "other":
        return None  # "gave 500" with nothing it was for: not clearly an expense
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
