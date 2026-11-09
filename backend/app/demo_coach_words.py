"""The owner's own words in the offline /demo coach (OB-261, OB-262, OB-264, S2-9).

Hindi, Hinglish and two-in-one sentences ("Chai is 20 rupees now, samosa sold out") become one
review card; a sold-out statement never becomes a purchase. "What should I do first?" is
answered from the shop's own list and the time of day, tomorrow's note and the app language are
set by chat, and anything unclear gets one short question in the owner's language. Model-free,
like demo_coach.py, so the public demo never calls a paid model.
"""

from __future__ import annotations

import math
import re
import unicodedata
from datetime import datetime, timedelta
from typing import Any

from .app_guide import next_line, next_line_hi
from .contracts import StreamEvent
from .demo_food_words import singular
from .demo_item_names import HINDI_UNITS, hindi_item
from .latin_names import strength
from .numbers import read_number

HINDI = re.compile(r"[ऀ-ॿ]")
DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
# Parts of one message: "Chai is 20 rupees now, samosa sold out", "चाय अब 20 की है और समोसे ख़त्म".
CLAUSES = re.compile(
    r"\s*(?:(?<!\d),|,(?!\d)|[;।\n]|\.(?!\d)|(?<!\S)(?:and|aur|but|also|और|तथा|पर)(?!\S))\s*", re.I
)

# English and Hinglish (romanised Hindi is the normal case, not an edge case).
NAME = r"[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,3}?"
LEAD = r"(?:(?:please|pls|aaj|today|ab|now|mark|change|set|make|my|the|our|apna|mera)\s+)*"
SOLD = (
    r"(?:sold\s*out|out\s+of\s+stock|finished|over|khatam|khatm|khattam|khalas|khallas"
    r"|nahin?\s+(?:hai|bacha|bache)|bik\s+gay[aie])"
)
SOLD_TAIL = (
    r"(?:\s*(?:hogaya|hogya|hogaye|hogye|hogayi|hogyi)"
    r"|\s+(?:ho|hai|hain|gaya|gya|gaye|gye|gayi|gyi|gai|for\s+today|today|aaj|now|ab|already|ji))*"
)
SOLD_OUT = re.compile(
    rf"{LEAD}(?P<name>{NAME})\s+(?:(?:is|are|as|ab|aaj|today|now|all|sab|pura|poora)\s+)*"
    rf"{SOLD}{SOLD_TAIL}",
    re.I,
)
RUN_OUT = re.compile(
    rf"(?:(?:i|we)(?:'ve|\s+have)?\s+)?(?:run|ran)\s+out\s+of\s+(?:the\s+|my\s+|our\s+)?"
    rf"(?P<name>{NAME})(?:\s+(?:today|now))?",
    re.I,
)
BACK = re.compile(
    rf"{LEAD}(?P<name>{NAME})\s+(?:(?:is|are|as)\s+)?(?:back\s+in\s+stock|available\s+again"
    r"|wapas\s+aa\s+gay[aie]|phir\s+se\s+(?:hai|aa\s+gay[aie]))",
    re.I,
)
MONEY = (
    r"(?:rs\.?\s*|₹\s*|inr\s*)?(?P<price>\d+(?:[.,]\d+)*)"
    r"(?:\s*(?:/-|rupees?|rupaye|rupaiye|rupay|rs\.?|inr))?"
)
PRICE = re.compile(
    rf"{LEAD}(?:price\s+of\s+)?(?P<name>{NAME})(?:'s)?"
    r"(?:\s+(?:price|ka\s+price|ki\s+price|ka\s+daam|ka\s+dam|ki\s+kimat|ki\s+keemat|is|are"
    r"|ab|now|to|hai|at|costs?|=))*"
    rf"\s*{MONEY}(?:\s+(?:now|ab|ka|ki|ke|hai|ho\s+gaya|ho\s+gayi|kar\s+do|karo|each|only))*",
    re.I,
)
# A bare "samosa 20" may be a sales count: a new price needs a price word.
PRICE_CUE = re.compile(
    r"\b(?:now|ab|price|daam|dam|kimat|keemat|rupees?|rupaye|rupaiye|rupay|rs|inr|to|costs?)\b"
    r"|\d\s+(?:ka|ki|ke)\b|\b(?:is|are)\s+\d|₹|/-",
    re.I,
)
# Hindi, matched without the nukta (ख़त्म and खत्म are one word to the owner).
HI_NAME = r"[ऀ-ॿ]+(?:\s+[ऀ-ॿ]+){0,3}?"
HI_LEAD = r"(?:(?:आज|अब|मेरा|मेरी|मेरे)\s+)*"
HI_SOLD = r"(?:खत्म|खतम|समाप्त|सोल्ड\s*आउट|नहीं\s+है|नहीं\s+बचा|नहीं\s+बचे|नहीं\s+बची|बिक\s+ग(?:य[ाेी]|ई|ए))"
HI_SOLD_OUT = re.compile(
    rf"{HI_LEAD}(?P<name>{HI_NAME})\s+(?:(?:आज|अब|सब|पूरा|पूरे)\s+)*{HI_SOLD}"
    r"(?:\s+(?:हो|गया|गए|गये|गयी|गई|है|हैं|चुका|चुके|चुकी|आज|अब))*"
)
HI_BACK = re.compile(rf"{HI_LEAD}(?P<name>{HI_NAME})\s+(?:फिर\s+से|वापस)\s+(?:है|हैं|आ\s+गय[ाेी])")
HI_PRICE = re.compile(
    rf"{HI_LEAD}(?P<name>{HI_NAME})(?:\s+(?:की|का|के))?(?:\s+(?:कीमत|दाम|भाव|रेट))?"
    r"(?:\s+(?:अब|अभी|से))*\s*(?:₹\s*|रु\.?\s*)?(?P<price>\d+(?:[.,]\d+)*)"
    r"(?:\s*(?:रुपये|रुपए|रुपया|रूपये|रु\.?|/-))?"
    r"(?:\s+(?:की|का|के|है|हैं|हो|गई|गयी|गया|कर|दो|दें|करो|अब))*"
)
HI_PRICE_CUE = re.compile(r"अब|कीमत|दाम|भाव|रेट|रुपय|रुपए|रूपय|रु|₹|/-")
# "No samosa today" says sold out with a "no" that is not a "don't".
NO_MORE = re.compile(rf"no(?:\s+more)?\s+(?P<name>{NAME})(?:\s+(?:today|left|aaj))?")
# A question or a "not" is never a change ("kya samosa khatam hai", "samosa not sold out").
ASKED = re.compile(
    r"^(?:what|how|why|can|could|should|is|are|do|does|did|will|would|kya|kaise|क्या|कैसे)\b",
    re.I,
)
NEGATION = re.compile(
    r"\b(?:not|no|never|don't|dont|doesn't|isn't|aren't|won't|can't|cannot|mat|na)\b"
    r"|(?<!\S)(?:मत|ना)(?!\S)|नहीं\s+(?:हुआ|हुए|हुई)",
    re.I,
)

# "What should I do first today?" (OB-264), in English, Hinglish and Hindi.
FIRST = re.compile(
    r"(?:so\s+|ok\s+)?what\s+(?:should|shall|do|must|can)\s+i\s+do"
    r"(?:\s+(?:first|now|next|today|this\s+morning))*"
    r"|what(?:'s|\s+is)\s+(?:first|next)(?:\s+today)?"
    r"|what\s+needs\s+(?:me|my\s+attention)(?:\s+(?:today|now))?"
    r"|where\s+(?:do|should)\s+i\s+start(?:\s+today)?"
    r"|what\s+to\s+do\s+(?:first|today|now)(?:\s+today)?"
    r"|(?:aaj\s+)?(?:sabse\s+)?(?:pehle|pahle\s+)?\s*kya\s+kar(?:na\s+hai|u|un|oon|oo|en)"
    r"(?:\s+(?:aaj|pehle|abhi))*",
    re.I,
)
FIRST_HI = re.compile(
    r"(?:आज\s+)?(?:सबसे\s+)?(?:पहले\s+)?(?:मुझे\s+)?क्या\s+"
    r"(?:करना\s+है|करूँ|करूं|करू|करें|करना\s+चाहिए)(?:\s+(?:आज|पहले|अभी))*"
)
# "How much did I sell today?" is sales, never Close the day (OB-264).
SALES_TODAY = re.compile(
    r"how\s+much\s+(?:did|have)\s+(?:i|we)\s+(?:sell|sold|make|made|earn|earned)(?:\s+today)?"
    r"|(?:what\s+(?:are|were|is)\s+)?(?:my\s+)?(?:sales|takings)\s+(?:today|so\s+far)"
    r"|today'?s\s+(?:sales|takings)|how\s+(?:did|have)\s+(?:i|we)\s+do(?:ne)?\s+today"
    r"|how\s+(?:is|was)\s+(?:business|sales)\s+today|how\s+did\s+today\s+go"
    r"|aaj\s+(?:kitna|kitni)\s+(?:becha|bika|biki|bikri|kamai)(?:\s+hu[ai])?"
    r"|aaj\s+ki\s+(?:bikri|kamai)(?:\s+kitni)?(?:\s+hai)?",
    re.I,
)
CLOSE_DAY = re.compile(
    r"(?:let'?s\s+|i\s+want\s+to\s+|help\s+me\s+)?close\s+(?:the|my|today'?s)\s+day"
    r"|day\s*end|end\s+(?:of\s+)?(?:the\s+)?day|aaj\s+ka\s+hisaa?b|din\s+band\s+karo",
    re.I,
)
# "Change language to Hindi", "Hindi mein bolo", "हिंदी में जवाब दो" (S2-9).
LANGUAGE = re.compile(
    r"(?:please\s+)?(?:change|switch|set|make)\s+(?:the\s+|my\s+)?(?:app\s+)?(?:language\s+)?"
    r"(?:to|in(?:to)?)\s+(?P<a>[a-z]+)(?:\s+language)?(?:\s+please)?"
    r"|(?:please\s+)?(?:reply|talk|speak|answer|write)\s+(?:to\s+me\s+)?in\s+(?P<b>[a-z]+)"
    r"(?:\s+please)?|(?P<c>[a-z]+)\s+(?:mein|me|mai|main)\s+(?:bolo|baat\s+karo|jawab\s+do|likho)",
    re.I,
)
LANGUAGE_HI = re.compile(
    r"(?P<a>\S+)\s+में\s+(?:जवाब\s+दो|जवाब\s+दें|बात\s+करो|बात\s+करें|बोलो|लिखो)"
    r"|भाषा\s+(?P<b>\S+)\s+(?:करो|कर\s+दो|करें|बदलो)"
)
HINDI_LANGUAGE_NAMES = {
    "हिंदी": "hi",
    "हिन्दी": "hi",
    "अंग्रेजी": "en",
    "इंग्लिश": "en",
    "तमिल": "ta",
    "तेलुगु": "te",
    "मराठी": "mr",
    "बांग्ला": "bn",
    "बंगाली": "bn",
    "कन्नड": "kn",
}
NATIVE = {
    "en": ("English", "अंग्रेज़ी"),
    "hi": ("Hindi (हिंदी)", "हिंदी"),
    "ta": ("Tamil (தமிழ்)", "तमिल"),
    "te": ("Telugu (తెలుగు)", "तेलुगु"),
    "mr": ("Marathi (मराठी)", "मराठी"),
    "bn": ("Bengali (বাংলা)", "बांग्ला"),
    "kn": ("Kannada (ಕನ್ನಡ)", "कन्नड़"),
}
# The buttons under "what first?": the screen each job opens, in the owner's language.
JOB_LABELS = {
    "messages": ("Customer messages", "ग्राहकों के संदेश"),
    "plan": ("How much to make", "कितना बनाना है"),
    "supply": ("Buy stock", "माल मँगाएँ"),
    "close_day": ("Close the day", "दिन बंद करें"),
}
FALLBACK_HI = (
    "माफ़ कीजिए, मैं ठीक से समझ नहीं पाई। आप क्या करना चाहते हैं: कीमत बदलनी है, कुछ ख़त्म दिखाना है, या कुछ और?"
)
# Tappable examples under a Hindi question; each one has a deterministic demo answer.
SUGGESTIONS_HI = (
    "समोसा ख़त्म हो गया",
    "मसाला चाय अब 25 रुपये की है",
    "आज सबसे पहले क्या करूँ?",
    "कल क्या तैयारी करूँ?",
    "कल सुबह दूध मँगाना याद दिलाना",
)


def bare(text: str) -> str:
    """One line, lower case, Devanagari digits as 0-9 and no nukta, without the closing
    punctuation: what the patterns above read."""
    text = unicodedata.normalize("NFD", text.replace("’", "'")).replace("़", "")
    text = unicodedata.normalize("NFC", text).translate(DEVANAGARI_DIGITS).casefold()
    return re.sub(r"[\s.!?।]+$", "", " ".join(text.split()))


def speaks_hindi(question: str) -> bool:
    """Reply in Hindi for a Devanagari message, or anything typed while the app is in Hindi."""
    from .agent import ui_language

    return bool(HINDI.search(question)) or ui_language.get() == "hi"


def _now(fields: dict[str, Any]) -> datetime:
    """The shop's local time (tests set it)."""
    from .rescue import local_now

    return local_now(fields)


def _reply(text: str, suggestions: tuple[str, ...] | list[str] | None = None) -> StreamEvent:
    data: dict[str, object] | None = {"suggestions": list(suggestions)} if suggestions else None
    return StreamEvent(kind="reply", text=text, data=data)


def _offer(target: str, hindi: bool, business_id: str | None) -> StreamEvent:
    """A button that opens a screen when tapped (never by itself)."""
    label = JOB_LABELS[target][1 if hindi else 0]
    return StreamEvent(
        kind="action",
        data={"target": target, "label": label, "business_id": business_id, "offer": True},
    )


def _shop(ctx: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    context = ctx.store.context(ctx.uid, ctx.business_id)
    return context["business"]["fields"], context["inventory"]


# --- Sold out and new prices --------------------------------------------------------------------


def _clause(text: str, currency: str | None = None) -> tuple[str, str, float | None] | None:
    """(kind, the item as said, new price) for one part of a message, or None. The price is
    read by the shared number reader ("1,000" is a thousand; "1,5" in a rupee shop is not
    guessed, so the coach asks instead of changing the price)."""
    if HINDI.search(text):
        for pattern, kind in ((HI_SOLD_OUT, "sold"), (HI_BACK, "back"), (HI_PRICE, "price")):
            found = pattern.fullmatch(text)
            if found and (kind != "price" or HI_PRICE_CUE.search(text)):
                return _said(kind, found, currency)
        return None
    for pattern, kind in (
        (SOLD_OUT, "sold"),
        (RUN_OUT, "sold"),
        (BACK, "back"),
        (PRICE, "price"),
    ):
        found = pattern.fullmatch(text)
        if found and (kind != "price" or PRICE_CUE.search(text)):
            return _said(kind, found, currency)
    return None


def _said(
    kind: str, found: re.Match[str], currency: str | None
) -> tuple[str, str, float | None] | None:
    if kind != "price":
        return kind, found["name"], None
    price = read_number(found["price"], currency)
    return (kind, found["name"], price) if price is not None else None


def _words(name: str) -> list[str]:
    return [singular(word) for word in bare(name).split()]


def _hindi_forms(name: str) -> set[str]:
    """A Hindi item as it is said: "समोसा", and "समोसे" for more than one."""
    said = bare(hindi_item(name))
    return {said, said[:-1] + "े"} if said.endswith("ा") else {said}


def menu_item(
    said: str, inventory: list[dict[str, Any]], sold: dict[str, float], guess: bool = True
) -> dict[str, Any] | None:
    """The saved item the owner means: its own name, its Hindi name, or the last word of one
    ("chai" is the shop's best-selling chai, "Masala chai"). Without `guess`, a word two items
    end in means neither: the live coach asks which one."""
    words = _words(said)
    text = bare(said)
    # Hinglish plurals end in -e ("samose" for "samosa").
    plural = [*words[:-1], words[-1][:-1] + "a"] if words and words[-1].endswith("e") else words
    for item in inventory:
        if (
            words == _words(item["name"])
            or plural == _words(item["name"])
            or text in _hindi_forms(item["name"])
        ):
            return item
    if len(words) != 1:
        return None
    tails = [
        item
        for item in inventory
        if _words(item["name"])[-1] == words[0]
        or any(form.split()[-1] == text for form in _hindi_forms(item["name"]))
    ]
    if not guess and len(tails) > 1:
        return None
    return max(tails, key=lambda item: sold.get(item["name"], 0), default=None)


def _money(amount: float) -> str:
    return f"₹{amount:g}"


Change = tuple[str, dict[str, Any], float | None]
# Rupees in the words the coach's own table (agent.CURRENCY_WORDS) does not list.
RUPEE_WORDS = r"rupaye|rupaiye|rupay|रुपये|रुपए|रुपया|रूपये|रु"
RUPEE_SHOPS = {"INR", "LKR", "NPR", "PKR"}


def _another_currency(text: str, currency: str | None) -> bool:
    """ "Kopi is 20 rupees now" in a Singapore shop: never converted or guessed."""
    from .agent import CURRENCY_WORDS

    table = {**CURRENCY_WORDS, RUPEE_WORDS: RUPEE_SHOPS}
    return bool(currency) and any(
        currency not in codes and re.search(rf"(?<!\w)(?:{words})(?!\w)", text, re.I)
        for words, codes in table.items()
    )


def read_changes(
    question: str,
    inventory: list[dict[str, Any]],
    sold: dict[str, float],
    currency: str | None,
    guess: bool = True,
) -> list[Change] | None:
    """Every change one message says, as (kind, saved item, new price); None unless all of it
    is understood, so a change is never half-made."""
    text = bare(question)
    if no_more := NO_MORE.fullmatch(text):
        text = f"{no_more['name']} sold out"
    if "?" in question or ASKED.match(text) or NEGATION.search(text):
        return None
    if _another_currency(text, currency):
        return None
    clauses = [part for part in CLAUSES.split(text) if part]
    if not clauses or len(clauses) > 4:
        return None
    said: list[Change] = []
    bare_items: list[dict[str, Any]] = []
    for clause in clauses:
        found = _clause(clause, currency)
        item = menu_item(found[1], inventory, sold, guess) if found else None
        if not found and (just_named := menu_item(clause, inventory, sold, guess)):
            bare_items.append(just_named)  # "samosa aur bun maska khatam": one verb, two items
            continue
        if not found or not item:
            return None
        if found[0] != "price":
            said.extend((found[0], earlier, None) for earlier in bare_items)
            bare_items = []
        said.append((found[0], item, found[2]))
    return None if bare_items else said


def live_changes(question: str, ctx: Any) -> list[dict[str, Any]] | None:
    """The same sentences for the real coach: propose_products items, or None to let the model
    read it. Never a guess between two chais, and something the shop buys is the model's to ask."""
    from .coordinator import shop_currency
    from .product_source import source_of

    context = ctx.store.context(ctx.uid, ctx.business_id)
    category = str(context["business"]["fields"].get("category") or "")
    currency = shop_currency(context["business"])
    said = read_changes(question, context["inventory"], {}, currency, guess=False)
    if not said or any(
        kind == "sold" and source_of(item, category) == "bought" for kind, item, _ in said
    ):
        return None
    items: dict[str, dict[str, object]] = {}
    for kind, item, price in said:
        entry = items.setdefault(item["name"], {"name": item["name"]})
        if kind == "price":
            entry["price"] = price
        else:
            entry["available"] = kind == "back"
    return list(items.values())


def owner_changes(ctx: Any, question: str) -> list[StreamEvent] | None:
    """Sold out, back or a new price for saved items, one or several in one message, as one
    review card. A sold-out statement never drafts a purchase (OB-261): an item the shop buys
    gets one short question instead."""
    from .coordinator import ProductInput, shop_currency
    from .demo_coach import DEMO_NOTE, DEMO_NOTE_HI, _priced, _teach
    from .money import to_major
    from .product_source import source_of

    context = ctx.store.context(ctx.uid, ctx.business_id)
    fields, inventory = context["business"]["fields"], context["inventory"]
    currency = shop_currency(context["business"])
    sold: dict[str, float] = {}
    for row in ctx.store.sales_history(ctx.uid, ctx.business_id):
        sold[row["item"]] = sold.get(row["item"], 0) + float(row["quantity"])
    said = read_changes(question, inventory, sold, currency)
    if not said:
        return None
    hindi = speaks_hindi(question)
    category = str(fields.get("category") or "")
    bought = next(
        (
            item
            for kind, item, _ in said
            if kind == "sold" and source_of(item, category) == "bought"
        ),
        None,
    )
    if bought:
        name = bought["name"]
        if hindi:
            return [
                _reply(
                    f"{hindi_item(name)} आप ख़रीदते हैं, बनाते नहीं। क्या मैं इसके सप्लायर ढूँढूँ?",
                    [f"{hindi_item(name)} के सप्लायर ढूँढो"],
                )
            ]
        return [
            _reply(
                f"{name} is something you buy, not make. Shall I find suppliers for it?",
                [f"Find suppliers for {name}"],
            )
        ]
    changes: dict[str, ProductInput] = {}
    lines_hi: list[str] = []
    same_en: list[str] = []
    same_hi: list[str] = []
    for kind, item, price in said:
        name, hi = item["name"], hindi_item(item["name"])
        old = to_major(int(item.get("price") or 0), currency)
        change = changes.get(name) or ProductInput(
            name=name, unit=item["unit"], available=item.get("available") is not False
        )
        if kind == "price" and price is not None:
            if not 0 < price <= 100_000:
                return None
            if price == old:
                same_en.append(f"The demo price for {name} is {_money(old)}. Nothing changes.")
                same_hi.append(f"डेमो में {hi} की कीमत पहले से {_money(old)} है।")
                continue
            change.price = price
            lines_hi.append(f"{hi} {_money(old)} → {_money(price)}")
        else:
            available = kind == "back"
            if (item.get("available") is not False) == available:
                state = "available" if available else "sold out"
                same_en.append(f"{name} is already {state} on your demo menu.")
                same_hi.append(
                    f"{hi} पहले से उपलब्ध है।" if available else f"{hi} पहले से ख़त्म दिखाया गया है।"
                )
                continue
            change.available = available
            lines_hi.append(f"{hi} फिर से उपलब्ध" if available else f"{hi} आज के लिए ख़त्म")
        changes[name] = change
    feature = "price_change" if all(kind == "price" for kind, _, _ in said) else "sold_out"
    if any(kind == "price" for kind, _, _ in said) and same_hi and hindi:
        same_hi.append("कोई नया दाम हो तो बताएँ।")
    events = _priced(ctx, list(changes.values())) if changes else None
    if hindi:
        lead = (
            f"मैंने यह आपके जाँचने के लिए तैयार किया है: {'; '.join(lines_hi)}। स्क्रीन पर पक्का "
            f"करें। {DEMO_NOTE_HI} "
            if events
            else ""
        )
        text_hi = f"{lead}{' '.join(same_hi)} {next_line_hi(feature)}".replace("  ", " ")
        return [*(events or [])[:-1], _reply(text_hi.strip())]
    if events:
        last = events[-1]
        if same_en:
            note = (last.text or "").replace(f" {DEMO_NOTE}", f" {' '.join(same_en)} {DEMO_NOTE}")
            events[-1] = last.model_copy(update={"text": note})
        return _teach(events, feature)
    if not same_en:
        return None
    return [_reply(f"{' '.join(same_en)} {next_line(feature)}")]


# --- What first, today's sales and closing the day ----------------------------------------------


def _units(unit: str, count: float) -> str:
    """ "88 cups", "1 cup"; weights and volumes stay as they are ("12 kg")."""
    if count == 1 or unit in {"kg", "g", "ml", "l", "item", "items"} or unit.endswith("s"):
        return unit
    return f"{unit}es" if unit.endswith(("ch", "sh", "x")) else f"{unit}s"


def _when(day: Any, today: Any, hindi: bool) -> str:
    days = (day - today).days
    if hindi:
        return "आज" if days <= 0 else "कल" if days == 1 else f"{days} दिन में"
    if days <= 0:
        return "today"
    return "tomorrow" if days == 1 else f"on {day:%a}, {day:%b} {day.day}"


async def _forecast(ctx: Any, today: Any, inventory: list[dict[str, Any]]) -> Any:
    """Today's forecast, trained through yesterday, as the Today page reads it (shop_today)."""
    from . import coordinator
    from .demo_context import services
    from .forecast import ForecastService
    from .settings import Settings

    service = services.get().get("forecaster") or coordinator.forecaster
    if service is None:
        service = ForecastService(Settings(_env_file=None))  # type: ignore[call-arg]
    rows = ctx.store.sales_history(ctx.uid, ctx.business_id)
    return await service.forecast(
        [row for row in rows if row["date"] < today.isoformat()],
        today - timedelta(days=1),
        inventory,
    )


async def first_jobs(ctx: Any, question: str) -> list[StreamEvent] | None:
    """What to do first, from the same facts as the Today page's "needs you now" and the time of
    day: in the morning the waiting customer, low stock and prep; near closing, close the day.
    Each job has a button that opens it (OB-264)."""
    text = bare(question)
    if not (FIRST.fullmatch(text) or FIRST_HI.fullmatch(text)):
        return None
    from .owner_promise import promise_for
    from .rescue import buffer_for, closing
    from .shop_today import low_stock

    hindi = speaks_hindi(question)
    fields, inventory = _shop(ctx)
    now = _now(fields)
    today = now.date()
    closes = closing(fields, now)
    evening = now >= closes - timedelta(hours=1) if closes else now.hour >= 19
    jobs: list[tuple[str | None, str, str]] = []  # (screen, English, Hindi)
    waiting = [
        inquiry
        for inquiry in ctx.store.inquiries(ctx.uid, ctx.business_id)
        if not any(message.author == "owner" for message in inquiry.messages)
    ]
    reply_job: tuple[str | None, str, str] | None = None
    if waiting:
        name = waiting[0].name or "A customer"
        more_en = f" and {len(waiting) - 1} more" if len(waiting) > 1 else ""
        more_hi = f" और {len(waiting) - 1} और लोग" if len(waiting) > 1 else ""
        reply_job = (
            "messages",
            f"{name}{more_en} {'are' if more_en else 'is'} waiting for a reply.",
            f"{name}{more_hi} आपके जवाब का इंतज़ार कर रहे हैं।",
        )
    if evening:
        jobs.append(
            (
                "close_day",
                "Close the day: photograph today's sales book and check the totals.",
                "दिन बंद करें: आज की बिक्री की कॉपी की फ़ोटो लें और जोड़ जाँचें।",
            )
        )
        if reply_job:
            jobs.append(reply_job)
    else:
        promise = promise_for(ctx.store, ctx.business_id, today)
        if promise:
            target = {"order": "supply", "make": "plan"}.get(promise.kind)
            jobs.append(
                (target, f"You wrote down: “{promise.text}”.", f"आपने लिखा था: “{promise.text}”।")
            )
        if reply_job:
            jobs.append(reply_job)
        forecast = await _forecast(ctx, today, inventory)
        category = str(fields.get("category") or "")
        from .supply_coming import arrivals_by_item

        arrivals = arrivals_by_item(ctx.store, ctx.uid, ctx.business_id, inventory)
        for low in low_stock(inventory, forecast, today, category, arrivals):
            hi, unit = (
                hindi_item(low.name),
                next((str(p.get("unit") or "") for p in inventory if p["name"] == low.name), ""),
            )
            if low.source == "made":
                jobs.append(
                    (
                        "plan",
                        f"Only {low.stock:g} {low.name} left: make more.",
                        f"{hi} सिर्फ़ {low.stock:g} बचे हैं: और बनाएँ।",
                    )
                )
            elif low.runs_out:
                jobs.append(
                    (
                        "supply",
                        f"{low.name} runs out {_when(low.runs_out, today, False)}: reorder.",
                        f"{hi}: {_when(low.runs_out, today, True)} तक ख़त्म, फिर से मँगाएँ।",
                    )
                )
            else:
                jobs.append(
                    (
                        "supply",
                        f"Only {low.stock:g} {unit} {low.name} left: reorder.",
                        f"{hi} सिर्फ़ {low.stock:g} {HINDI_UNITS.get(unit, unit)} बचा है: फिर से मँगाएँ।",
                    )
                )
        prep = sorted(
            (p for p in forecast.predictions if p.date == today), key=lambda p: -p.quantity
        )
        if prep and prep[0].quantity >= 1:
            top = prep[0]
            count = math.ceil(top.quantity + buffer_for(top, forecast.method))
            jobs.append(
                (
                    "plan",
                    f"Prep about {count} {_units(top.unit, count)} of {top.item} today.",
                    f"आज लगभग {count} {HINDI_UNITS.get(top.unit, top.unit)} "
                    f"{hindi_item(top.item)} बनाएँ।",
                )
            )
    jobs = jobs[:3]
    if not jobs:
        jobs = [
            (
                "plan",
                "Nothing needs you right now. A good moment to check how much to make.",
                "अभी कुछ ज़रूरी नहीं है। चाहें तो देख लें कि कितना बनाना है।",
            )
        ]
    targets = list(dict.fromkeys(target for target, _, _ in jobs if target))
    buttons = [_offer(target, hindi, ctx.business_id) for target in targets]
    if hindi:
        first, *rest = (line for _, _, line in jobs)
        then = f" फिर: {' '.join(rest)}" if rest else ""
        tap = " किसी काम पर टैप करके उसे खोलें।" if buttons else ""
        text_hi = f"आज के ज़रूरी काम। सबसे पहले: {first}{then}{tap} {next_line_hi('today')}"
        return [_reply(text_hi), *buttons]
    first, *rest = (line for _, line, _ in jobs)
    hello = "Good evening" if evening else "Good morning" if now.hour < 12 else "Good afternoon"
    then = f" Then: {' '.join(rest)}" if rest else ""
    tap = " Tap a job to open it." if buttons else ""
    # The answer first, then its buttons.
    text = f"{hello}. First today: {first}{then}{tap} {next_line('today')}"
    return [_reply(text), *buttons]


def sales_today(ctx: Any, question: str) -> list[StreamEvent] | None:
    """Today's sales so far, and yesterday's, from the saved records: never Close the day."""
    text = bare(question)
    hindi_asked = HINDI.search(question)
    if not SALES_TODAY.fullmatch(text) or hindi_asked:
        return None
    from .coordinator import shop_currency
    from .money import to_major

    context = ctx.store.context(ctx.uid, ctx.business_id)
    currency = shop_currency(context["business"])
    today = _now(context["business"]["fields"]).date()
    rows = ctx.store.sales_history(ctx.uid, ctx.business_id)

    def day(when: Any) -> tuple[float, float]:
        found = [row for row in rows if row["date"] == when.isoformat()]
        money = sum(int(row.get("revenue", row.get("amount", 0)) or 0) for row in found)
        return sum(row["quantity"] for row in found), to_major(money, currency)

    sold, money = day(today)
    before, before_money = day(today - timedelta(days=1))
    if speaks_hindi(question):
        now_hi = (
            f"आज अब तक डेमो में {sold:g} चीज़ें बिकीं, ₹{money:,.0f} की।"
            if sold
            else "आज की डेमो बिक्री अभी सेव नहीं हुई है।"
        )
        text_hi = f"{now_hi} कल: {before:g} चीज़ें, ₹{before_money:,.0f}। {next_line_hi('insights')}"
        return [_reply(text_hi)]
    now_en = (
        f"Today's demo sales so far: {sold:g} items for ₹{money:,.0f}."
        if sold
        else "Today's demo sales are not saved yet; they are added when you close the day."
    )
    return [
        _reply(
            f"{now_en} Yesterday: {before:g} items for ₹{before_money:,.0f}. "
            + next_line("insights")
        )
    ]


def close_day(ctx: Any, question: str) -> list[StreamEvent] | None:
    """ "Close the day" by chat: what it does and a button that opens it (S2-9)."""
    if not CLOSE_DAY.fullmatch(bare(question)):
        return None
    from .app_guide import BY_ID
    from .demo_coach import DEMO_NOTE, DEMO_NOTE_HI

    feature = BY_ID["close_day"]
    hindi = speaks_hindi(question)
    text = (
        f"{feature.what_hi} {next_line_hi('close_day')} {DEMO_NOTE_HI}"
        if hindi
        else f"{feature.title}: {feature.what} {next_line('close_day')} {DEMO_NOTE}"
    )
    return [_offer("close_day", hindi, ctx.business_id), _reply(text)]


# --- Tomorrow's note and the app language -------------------------------------------------------


def tomorrow_note(ctx: Any, question: str) -> list[StreamEvent] | None:
    """ "Remind me to order milk tomorrow": written down, at the top of Coach tomorrow morning,
    as the close screen's note does (S2-9)."""
    from .instant import promise_words, save_promise

    what = promise_words(" ".join(question.split()).rstrip(" .!।"))
    if not what:
        return None
    promise = save_promise(ctx, what)
    if speaks_hindi(question):
        return [
            _reply(
                f"कल सुबह के लिए लिख लिया: “{promise.text}”। यह कल सुबह कोच में सबसे ऊपर दिखेगा। "
                + next_line_hi("promise")
            )
        ]
    return [
        _reply(
            f"Written down for tomorrow morning: “{promise.text}”. It will be at the top of Coach "
            "tomorrow. " + next_line("promise")
        )
    ]


def app_language(question: str) -> list[StreamEvent] | None:
    """ "Change language to Hindi": the app and the coach switch, as the You screen's picker does
    (the real coach's set_reply_language). The confirmation is in the language it was asked in."""
    from .reply_language import find_language

    text = bare(question)
    found = LANGUAGE.fullmatch(text) or LANGUAGE_HI.fullmatch(text)
    if not found:
        return None
    said = next(value for value in found.groupdict().values() if value)
    chosen = find_language(HINDI_LANGUAGE_NAMES.get(said, said))
    if not chosen:
        return None
    english, hindi_name = NATIVE.get(chosen.locale, (chosen.name, chosen.name))
    switch = StreamEvent(kind="action", data={"target": "language", "language": chosen.locale})
    if speaks_hindi(question):
        return [
            switch,
            _reply(
                f"ठीक है, अब ऐप और कोच {hindi_name} में हैं। ग्राहकों को जवाब उनकी अपनी भाषा में "
                "जाते हैं। आप किस भाषा में बात करें, यह कभी भी बदल सकते हैं। "
                + next_line_hi("reply_language")
            ),
        ]
    return [
        switch,
        _reply(
            f"Done: the app language is now {english}, for you and the coach. Customer replies "
            "still follow each customer's own language. " + next_line("reply_language")
        ),
    ]


# --- "Reply to Priya: yes we have samosa" (OB-303) ----------------------------------------------

REPLY_TO = re.compile(
    r"^(?:please\s+)?(?:reply|answer|tell|message|write)\s+(?:back\s+)?(?:to\s+)?(?P<name>[a-z]+)"
    r"\s*(?P<sep>[:,\-]\s*|\s+that\s+|\s+)(?P<text>.+)$"
)
REPLY_TO_HI = re.compile(
    r"^(?P<name>\S+)\s+(?:को|ko)\s+(?:जवाब|जवाब\s+में|reply|jawab|bolo|batao|likho|बोलो|बताओ|लिखो)"
    r"(?:\s+(?:दो|दें|दीजिए|करो|do|de|karo|kar\s+do))?\s*(?P<sep>[:,\-]\s*|\s+(?:कि|ki)\s+|\s+)"
    r"(?P<text>.+)$"
)
# "Don't" only when it is about the reply itself, said right after the verb ("Priya ko reply mat
# karo", "reply to Priya don't send"). After "ki" or a colon the words are the reply: "Priya ko
# bolo ki nahi, samosa khatam hai" is a real "no" for Priya.
DONT = re.compile(
    r"^(?:mat|मत)(?!\w)|^(?:nahi|nahin|na|नहीं|ना)(?:\s+(?:karo|karna|kare|karein|dena|do|bhejo|"
    r"करो|करना|करें|देना|दो|भेजो)(?!\w)|$)|^(?:don't|dont|do not)\s+(?:send|reply|answer|message|"
    r"tell|write|do)(?!\w)|^(?:not|never ?mind|cancel)(?!\w)"
)


def same_name(name: str, said: str) -> bool:
    name, said = name.casefold(), said.casefold()
    if not name or not said:
        return False
    return name == said or bool(strength(name, said) or strength(said, name))


def which_customer(waiting: list[str], hindi: bool) -> StreamEvent:
    """Asked when the name said is nobody's (or more than one customer's): which customer."""
    names = ", ".join(dict.fromkeys(n for n in waiting if n))
    if hindi:
        return _reply("किस ग्राहक को जवाब देना है?" + (f" जवाब का इंतज़ार: {names}।" if names else ""))
    return _reply("Which customer?" + (f" Waiting for a reply: {names}." if names else ""))


def customer_reply(ctx: Any, question: str) -> list[StreamEvent] | None:
    """A reply the owner dictates to a waiting customer, prepared as the same reply card the real
    coach's prepare_customer_reply makes: it is sent only when the owner taps Send."""
    text = " ".join(question.replace("’", "'").split())
    found = REPLY_TO.fullmatch(text.casefold()) or REPLY_TO_HI.fullmatch(text.casefold())
    if not found or not ctx.business_id:
        return None
    words = text[found.start("text") :].strip()
    # After a colon, comma, "that" or "ki" the words are quoted: "nahi" there is the reply.
    quoted = bool(found.group("sep").strip())
    if not words or (not quoted and DONT.search(words.casefold())):
        return None
    hindi = speaks_hindi(question)
    said = found.group("name")
    threads = [
        t for t in ctx.store.inquiries(ctx.uid, ctx.business_id) if not t.done and not t.blocked
    ]
    # The name as written, or the same name in another script read in Latin letters ("प्रिया"
    # is Priya). A name that matches nobody never goes to whoever happens to be waiting.
    named = [t for t in threads if same_name((t.name or "").split(" ")[0], said)]
    if len(named) != 1:
        # "Reply to customers" is a question about the app, not a dictated reply: only words
        # after a colon or "ki", or a name in Devanagari, are clearly meant for someone.
        if not quoted and not HINDI.search(said):
            return None
        waiting = [
            (t.name or "").split(" ")[0][:30]
            for t in threads
            if t.messages and t.messages[-1].author == "customer"
        ]
        return [which_customer(waiting, hindi)]
    thread = named[0]
    first = (thread.name or "customer").split(" ")[0][:30]
    reply = words[0].upper() + words[1:]
    if not re.search(r"[.!?।]$", reply):
        reply += "।" if HINDI.search(reply) else "."
    last = thread.messages[-1].text if thread.messages else thread.message
    card = StreamEvent(
        kind="action",
        data={
            "target": "reply",
            "label": f"{first} को जवाब दें" if hindi else f"Reply to {first}",
            "business_id": ctx.business_id,
            "thread_id": thread.id,
            "question": last[:200],
            "text": reply[:500],
        },
    )
    if hindi:
        return [
            card,
            _reply(
                f"{first} के लिए जवाब तैयार है। जाँच लें, बदलना हो तो बदलें, फिर भेजें दबाएँ। "
                "यह अपने-आप नहीं जाता। " + next_line_hi("messages")
            ),
        ]
    return [
        card,
        _reply(
            f"Your reply to {first} is ready. Check it, change it if you like, then tap Send. "
            "Nothing goes until you do. " + next_line("messages")
        ),
    ]


# --- One short question when unsure -------------------------------------------------------------


def unsure(ctx: Any, question: str) -> list[StreamEvent]:
    """One short question in the owner's language instead of a guessed card or a list (S2-9):
    about the item the message names when it names one, else what they would like to do."""
    from .demo_coach import FALLBACK, SUGGESTIONS

    hindi = speaks_hindi(question)
    _, inventory = _shop(ctx)
    text = bare(question)
    named = next(
        (
            item
            for item in sorted(inventory, key=lambda item: -len(item["name"]))
            if re.search(rf"(?<!\w){re.escape(bare(item['name']))}", text)
            or any(form in text for form in _hindi_forms(item["name"]) if HINDI.search(form))
        ),
        None,
    )
    hours = re.search(r"\b(?:clos\w*|open\w*)\b", text) and re.search(r"\d", text)
    if hindi:
        if named:
            hi = hindi_item(named["name"])
            ask = f"{hi} के लिए क्या बदलूँ: कीमत, या आज के लिए ख़त्म?"
        else:
            ask = FALLBACK_HI
        return [_reply(ask, SUGGESTIONS_HI)]
    if hours:
        ask = "Which time should I set for every open day, like “Close at 10pm”?"
    elif named:
        ask = f"What should change for {named['name']}: its price, or sold out for today?"
    else:
        ask = FALLBACK
    return [_reply(ask, SUGGESTIONS)]
