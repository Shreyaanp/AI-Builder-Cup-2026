"""One-tap reply drafts for the owner, in the customer's language (OB-303).

Under a customer's question the owner sees two or three short replies. A tap only fills the
reply box; the owner edits and sends. Every fact in a draft comes from the shop's own data: an
item's name, price and sold-out state, the hours, the location and the payment methods. A
sold-out item is never offered as available, and no price or item is ever made up.

Every shop, demo or real, gets the deterministic templates below and nothing else: no model
wording can reach a suggestion, so no draft says something the shop's data does not. Model
drafts wait for a stricter filter than a list of bad words (OB-326).
"""

from __future__ import annotations

import re
import unicodedata
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field

from .demo_item_names import HINDI_UNITS, hindi_item, item_named_in
from .latin_names import latin, other_script, strength
from .region import money_text
from .reply_copy import (
    BACK_SOON,
    CLOSED_TODAY,
    CLOSED_TOMORROW,
    COPY,
    HOW_MANY,
    INSTEAD,
    MORE,
    OPEN_HOURS,
    OPEN_TOMORROW,
    PAY_WITH,
    PAYMENT_NAMES,
    PAYMENT_NAMES_HI,
    SOLD_OUT,
    THANKS,
    WHERE_WE_ARE,
    YES_COME,
    YES_COME_OPEN,
    YES_PRICE,
)
from .reply_language import LANGUAGES
from .shop_time import shop_timezone


class ReplySuggestions(BaseModel):
    language: str
    """App locale of the customer's message (src/i18n/locales.ts)."""
    replies: list[str] = Field(default_factory=list, max_length=3)
    mode: Literal["template"] = "template"


# --- The customer's language ---------------------------------------------------------------------

# The same rules as src/features/inquiries/messageLanguage.ts: the script first, then a few
# telling words for languages written in Latin letters. English when nothing else is clear.
SCRIPTS: tuple[tuple[str, str], ...] = (
    ("hi", r"[ऀ-ॿ]"),
    ("bn", r"[ঀ-৿]"),
    ("ta", r"[஀-௿]"),
    ("te", r"[ఀ-౿]"),
    ("kn", r"[ಀ-೿]"),
    ("th", r"[฀-๿]"),
    ("ko", r"[가-힯ᄀ-ᇿ]"),
    ("ja", r"[ぁ-ヿ]"),
    ("zh-Hans", r"[一-鿿]"),
)
# Marathi is written in Devanagari too; these words are Marathi, not Hindi.
MARATHI = re.compile(r"(?:आहे|आहेत|मिळेल|आहात|नाही का|हवे|हवा|पाहिजे)")
VIETNAMESE = re.compile(r"[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]")
LATIN_WORDS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("fil", re.compile(r"\b(?:po|meron|mayroon|magkano|ba kayo|salamat|bukas po|pwede)\b")),
    ("id", re.compile(r"\b(?:apakah|bisa|tidak|berapa harganya|terima kasih|kak|buka jam)\b")),
    (
        "ms",
        re.compile(
            r"\b(?:boleh|ada tak|tak|berapa|terima kasih|kedai|pukul berapa|ada|hari ini|nak|"
            r"esok|roti canai)\b"
        ),
    ),
    # Tamil in Roman letters ("samosa irukka?").
    ("ta", re.compile(r"\b(?:irukka|irukku|irukkaa|kidaikkuma|kidaikum|evvalavu|vilai|naalai)\b")),
    # Hinglish: the customer types Hindi in Roman letters; the drafts answer in Hindi.
    ("hi", re.compile(r"\b(?:kya|hai|milega|milegi|chahiye|kitne ka|kitna|bhaiya|aap|kab)\b")),
)


def customer_language(text: str) -> str:
    """The app locale a message is written in, by its script and a few telling words."""
    plain = unicodedata.normalize("NFC", text or "").casefold()
    for locale, script in SCRIPTS:
        if re.search(script, plain):
            if locale == "hi" and MARATHI.search(plain):
                return "mr"
            return locale
    if VIETNAMESE.search(plain):
        return "vi"
    return next((locale for locale, words in LATIN_WORDS if words.search(plain)), "en")


# --- What the question is about ------------------------------------------------------------------

HOURS = re.compile(
    r"\b(?:open|close|closing|hours|timing|time|when)\b|खुल|बंद|समय|कब|营业|几点|buka|tutup|jam|"
    r"waktu|営業|何時|영업|몇 시|เปิด|ปิด|mở cửa|giờ|bukas|sarado|oras|திற|நேர|తెరు|ಸಮಯ|ತೆರೆ|খোল|সময়"
)
WHERE = re.compile(
    r"\b(?:where|address|location|directions)\b|कहाँ|कहां|पता|地址|在哪|lokasi|alamat|di mana|"
    r"どこ|場所|어디|위치|ที่ไหน|ở đâu|địa chỉ|saan|எங்கே|ఎక్కడ|ಎಲ್ಲಿ|কোথায়|कुठे"
)
PAY = re.compile(
    r"\b(?:pay|payment|upi|card|cash|paynow|gpay)\b|भुगतान|पेमेंट|付款|bayar|pembayaran|支払|결제|"
    r"ชำระ|thanh toán|bayad|கட்டண|చెల్లింపు|ಪಾವತಿ|পেমেন্ট"
)


def _words(text: str) -> set[str]:
    return {w.rstrip("s") for w in re.findall(r"\w+", text) if len(w) >= 4}


# Item names in the scripts of the app's other locales, for the demo shops' items: a Tamil
# customer writes "சமோசா", a Malay one "teh halia". Hindi names are in demo_item_names.py.
LOCAL_ITEMS: dict[str, dict[str, str]] = {
    "ta": {
        "Masala chai": "மசாலா டீ",
        "Ginger chai": "இஞ்சி டீ",
        "Bun maska": "பன் மஸ்கா",
        "Samosa": "சமோசா",
        "Tea dust": "டீ தூள்",
        "Ragi biscuit": "ராகி பிஸ்கட்",
        "Filter coffee": "ஃபில்டர் காபி",
        "Masala dosa": "மசாலா தோசை",
        "Vegetable puff": "வெஜ் பஃப்",
        "Milk bread": "பால் ரொட்டி",
        "Coconut bun": "தேங்காய் பன்",
        "Curd rice": "தயிர் சாதம்",
        "Lemon rice": "எலுமிச்சை சாதம்",
        "Jasmine string": "மல்லிகைச் சரம்",
    },
    "ms": {
        "Masala chai": "teh masala",
        "Ginger chai": "teh halia",
        "Tea dust": "serbuk teh",
        "Ragi biscuit": "biskut ragi",
        "Filter coffee": "kopi tapis",
        "Coconut bun": "roti kelapa",
        "Milk bread": "roti susu",
        "Butter croissant": "croissant mentega",
        "Vegetable puff": "karipap sayur",
    },
}
DASHES = re.compile(r"[\s\-‐‑–—_/]+")


def _plain(text: str) -> str:
    """Casefolded, NFC, with hyphens and runs of spaces as one space: "ragi-biscuit" is
    "ragi biscuit"."""
    return DASHES.sub(" ", unicodedata.normalize("NFC", text).casefold()).strip()


def names_of(product: dict[str, Any]) -> set[str]:
    """Every way the app writes an item's name: as saved, in Hindi, Tamil and Malay."""
    name = product["name"]
    names = {
        name,
        hindi_item(name),
        *(table[name] for table in LOCAL_ITEMS.values() if name in table),
    }
    return {_plain(n) for n in names if n.strip()}


def _contains(text: str, name: str) -> bool:
    """Whether plain `text` has the plain `name` as whole words (scripts without spaces as is)."""
    if name.isascii():
        return re.search(rf"(?<![a-z0-9]){re.escape(name)}(?:e?s)?(?![a-z0-9])", text) is not None
    return name in text


SCRIPT_WORD = re.compile(r"[^\s\d.,!?।:;()'\"‘’“”\-–—]+")


def _sounds(text: str, name: str) -> bool:
    """Whether every word of an English name is written in another script in the text, read in
    Latin letters ("रागी बिस्कुट" is "Ragi biscuit")."""
    if not name.isascii():
        return False
    spoken = [w for w in SCRIPT_WORD.findall(text) if other_script(w)]
    words = [w for w in latin(name).split() if len(w) >= 3]
    return bool(spoken and words) and all(any(strength(w, s) for s in spoken) for w in words)


def names_in(text: str, product: dict[str, Any]) -> bool:
    """Whether a message names this item, in any script the app writes it in."""
    plain = _plain(text)
    return any(_contains(plain, n) for n in names_of(product)) or _sounds(plain, product["name"])


def named_product(products: list[dict[str, Any]], question: str) -> dict[str, Any] | None:
    """The shop item the question names: the whole name in any of its scripts or a distinctive
    word of it. The longest name wins, so "masala chai" is not "chai"."""
    text = _plain(question)
    ordered = sorted(products, key=lambda p: -len(p["name"]))
    for product in ordered:
        if names_in(text, product):
            return product
    hindi = item_named_in(question)
    if hindi:
        found = next((p for p in ordered if p["name"].casefold() == hindi.casefold()), None)
        if found:
            return found
    said = _words(text)
    return next((p for p in ordered if _words(p["name"].casefold()) & said), None)


# --- The templates -------------------------------------------------------------------------------

TOMORROW = re.compile(
    # Not Filipino "bukas": it also means "open".
    r"\b(?:tomorrow|kal|besok|esok|naalai)\b|कल|उद्या|நாளை|రేపు|ನಾಳೆ|কাল|明天|明日|내일|"
    r"พรุ่งนี้|ngày mai"
)
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def shop_days(shop: dict[str, Any], now: datetime | None = None) -> tuple[date, date]:
    """Today and tomorrow in the shop's own timezone."""
    try:
        zone = shop_timezone(str(shop.get("timezone") or "UTC"))
    except (ValueError, KeyError):
        zone = UTC
    today = (now or datetime.now(UTC)).astimezone(zone).date()
    return today, today + timedelta(days=1)


def day_hours(shop: dict[str, Any], day: date) -> tuple[bool, str]:
    """Whether the shop is closed that day (the owner's "Closed today" or a closed weekday) and
    its hours then: the weekday's own entry when there is one, else the everyday hours."""
    closed = shop.get("closed_on") == day.isoformat()
    entry = next(
        (e for e in shop.get("weekly_hours") or [] if e.get("day") == DAYS[day.weekday()]), None
    )
    if entry:
        if entry.get("closed"):
            return True, ""
        return closed, f"{entry['open']}–{entry['close']}"
    return closed, str(shop.get("hours") or "").strip()


def _price(product: dict[str, Any], currency: str, language: str) -> str:
    price = money_text(int(product.get("price") or 0), currency)
    unit = str(product.get("unit") or "")
    if language == "en" and unit and unit != "item":
        return f"{price} per {unit}"
    if language == "hi" and unit in HINDI_UNITS:
        return f"{price} प्रति {HINDI_UNITS[unit]}"
    return price


def _name(product: dict[str, Any], language: str) -> str:
    if language in ("hi", "mr"):
        return hindi_item(product["name"])
    return LOCAL_ITEMS.get(language, {}).get(product["name"], product["name"])


def template_replies(
    shop: dict[str, Any], question: str, language: str, now: datetime | None = None
) -> list[str]:
    """Up to three drafts from fixed sentences and the shop's facts only. On a day the shop is
    closed nothing says it is open or that an item is available today."""
    copy = COPY.get(language, COPY["en"])
    currency = str(shop.get("currency") or "")
    today, tomorrow = shop_days(shop, now)
    closed, hours = day_hours(shop, today)
    closed_next, hours_next = day_hours(shop, tomorrow)
    location = str(shop.get("location") or "").strip()
    products = [p for p in shop.get("products", []) if p.get("name")]
    text = unicodedata.normalize("NFC", question).casefold()
    later = bool(TOMORROW.search(text))
    drafts: list[str] = []
    if later:
        if closed_next:
            drafts.append(copy[CLOSED_TOMORROW])
        elif hours_next:
            drafts.append(copy[OPEN_TOMORROW].format(hours=hours_next))
    if closed:
        drafts.append(copy[CLOSED_TODAY])
    product = named_product(products, question)
    if product and product.get("available", True):
        # Stock the shop buys (tea dust) is never offered to a customer as if it sold it.
        if product.get("source") == "bought":
            product = None
        elif not closed and not later:
            values = {
                "item": _name(product, language),
                "price": _price(product, currency, language),
            }
            drafts += [copy[YES_PRICE].format(**values)]
            drafts += [copy[YES_COME_OPEN if hours else YES_COME].format(**values, hours=hours)]
            drafts += [copy[HOW_MANY].format(**values)]
    elif product:
        item = _name(product, language)
        drafts.append(copy[SOLD_OUT].format(item=item))
        # Something else the shop makes and has today, from the same part of the menu.
        other = next(
            (
                p
                for p in products
                if p is not product
                and p.get("available", True)
                and p.get("source") != "bought"
                and p.get("category", "") == product.get("category", "")
            ),
            None,
        )
        if other and not closed:
            drafts.append(
                copy[INSTEAD].format(
                    item=item, other=_name(other, language), price=_price(other, currency, language)
                )
            )
        drafts.append(copy[BACK_SOON].format(item=item))
    if PAY.search(text):
        names = PAYMENT_NAMES_HI if language == "hi" else PAYMENT_NAMES
        methods = [names.get(m, m) for m in (shop.get("facts") or {}).get("payment_methods", [])]
        if methods:
            drafts.append(copy[PAY_WITH].format(methods=", ".join(methods)))
    if WHERE.search(text) and location:
        drafts.append(copy[WHERE_WE_ARE].format(location=location))
    if (HOURS.search(text) or not product) and not later:
        if not closed and hours:
            drafts.append(copy[OPEN_HOURS].format(hours=hours))
        elif closed and hours_next and not closed_next:
            drafts.append(copy[OPEN_TOMORROW].format(hours=hours_next))
    drafts += [copy[THANKS], copy[MORE]]
    unique = list(dict.fromkeys(drafts))
    return unique[:3]


def templates(shop: dict[str, Any], question: str, now: datetime | None = None) -> ReplySuggestions:
    """The fixed-sentence drafts, in the customer's language: the only drafts the owner sees."""
    language = customer_language(question)
    if language not in LANGUAGES:
        language = "en"
    return ReplySuggestions(
        language=language, replies=template_replies(shop, question, language, now), mode="template"
    )
