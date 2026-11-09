"""What an owner says when they want stock: "butter, 2 kg", "2 किलो मक्खन चाहिए", "makhan 2 kilo
mangao". One reader for the Buy stock box, the offline coach and the public demo, so a sentence
drafts the same order wherever it is said. It only reads: nothing here saves or drafts.

A "don't" never orders ("mat mangao", "नहीं चाहिए"); "no, only 5 litres" is a correction, so the
words after the "no" count.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from .demo_item_names import item_named_in
from .sourcing import canonical, matches

DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
NOT_HINDI = r"(?<![ऀ-ॿ])"
END_HINDI = r"(?![ऀ-ॿ])"


def _hindi(word: str) -> str:
    return f"{NOT_HINDI}(?:{word}){END_HINDI}"


# Every spelling of a unit, longest first in the pattern, to what the app saves.
UNIT_WORDS: dict[str, str] = {
    "kg": "kg",
    "kgs": "kg",
    "kilo": "kg",
    "kilos": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "किलो": "kg",
    "केजी": "kg",
    "g": "g",
    "gm": "g",
    "gms": "g",
    "gram": "g",
    "grams": "g",
    "ग्राम": "g",
    "l": "litre",
    "lt": "litre",
    "ltr": "litre",
    "litre": "litre",
    "litres": "litre",
    "liter": "litre",
    "liters": "litre",
    "लीटर": "litre",
    "लिटर": "litre",
    "ml": "ml",
    "मिली": "ml",
    "pack": "pack",
    "packs": "pack",
    "packet": "pack",
    "packets": "pack",
    "पैकेट": "pack",
    "पैक": "pack",
    "piece": "piece",
    "pieces": "piece",
    "pc": "piece",
    "pcs": "piece",
    "पीस": "piece",
    "dozen": "dozen",
    "dozens": "dozen",
    "darjan": "dozen",
    "दर्जन": "dozen",
    "box": "box",
    "boxes": "box",
    "डिब्बा": "box",
    "डिब्बे": "box",
    "bottle": "bottle",
    "bottles": "bottle",
    "बोतल": "bottle",
    "crate": "crate",
    "crates": "crate",
    "क्रेट": "crate",
    "bag": "bag",
    "bags": "bag",
    "बोरी": "bag",
}
_UNITS = "|".join(sorted(map(re.escape, UNIT_WORDS), key=len, reverse=True))
# Only before a unit: "do kilo" is two kilos, but "do" alone is an English word.
NUMBER_WORDS: dict[str, float] = {
    "half": 0.5,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "ten": 10,
    "twenty": 20,
    "aadha": 0.5,
    "adha": 0.5,
    "ek": 1,
    "dedh": 1.5,
    "do": 2,
    "dhai": 2.5,
    "teen": 3,
    "char": 4,
    "chaar": 4,
    "paanch": 5,
    "panch": 5,
    "chhe": 6,
    "saat": 7,
    "aath": 8,
    "das": 10,
    "bees": 20,
    "आधा": 0.5,
    "एक": 1,
    "डेढ़": 1.5,
    "दो": 2,
    "ढाई": 2.5,
    "तीन": 3,
    "चार": 4,
    "पाँच": 5,
    "पांच": 5,
    "छह": 6,
    "सात": 7,
    "आठ": 8,
    "दस": 10,
    "बीस": 20,
}
_NUMBER = (
    r"\d+,\d{1,2}(?![\d,])|\d+(?:,\d{2,3})*(?:\.\d+)?"
    r"|(?:"
    + "|".join(sorted(map(re.escape, NUMBER_WORDS), key=len, reverse=True))
    + r")(?=\s+(?:"
    + _UNITS
    + r")(?![^\W\d_]))"
)
AMOUNT = re.compile(
    rf"(?<![^\s,:(/-])(?P<number>{_NUMBER})\s*(?P<unit>{_UNITS})?(?![^\s,.;:।)!?])",
    re.I,
)

# "no, only 5 litres": what comes after the "no" is what is meant.
CORRECTION = re.compile(
    rf"(?:\b(?:no|nope|not|nahi|nahin)\b|{_hindi('नहीं|ना')})\s*[,:;.।-]+\s*", re.I
)
REFUSED = re.compile(
    r"\b(?:don'?t|do not|never|no need|not needed|stop ordering|cancel)\b"
    r"|\b(?:nahi|nahin|na)\s+(?:chahiye|mangana|mangao|mangwana|lana|karna)\b"
    r"|\bmat\b|\brehne\s+do\b|\bzaroorat\s+nahi\b|\bjarurat\s+nahi\b"
    rf"|{_hindi('मत')}|{_hindi('नहीं|न')}\s+(?:चाहिए|मँगा\S*|मंगा\S*|लाना|करना)"
    r"|(?:ज़रूरत|जरूरत)\s+नहीं|रहने\s+दो",
    re.I,
)
# Says the owner wants it. Whole words only; the name is what is left without them.
CUE_WORDS = (
    r"re-?order|order|buy|need|needs|want|restock|chahiye|chaiye|mangao|manga|mangwa|"
    r"mangwana|mangana"
)
# Filler that also goes with other requests ("dukaan ka naam ... karo"): never a cue by itself.
SOFT_WORDS = r"get|send|lao|la|karo|kar|do|dena|kijiye"
CUES = re.compile(
    rf"\b(?:{CUE_WORDS})\b|(?:चाहिए|मँगा\S*|मंगा\S*|मँगवा\S*|मंगवा\S*|लाओ|लाना|ऑर्डर)", re.I
)
FILLER = re.compile(
    r"\b(?:i|we|me|my|our|please|pls|some|more|only|just|of|the|a|an|mujhe|humein|hume|sirf|bas|"
    r"kewal|aur|thoda|ka|ki|ke|for|to|now|today|tomorrow|aaj|kal|also|bhi|"
    rf"{CUE_WORDS}|{SOFT_WORDS})\b"
    r"|"
    + _hindi(
        r"मुझे|हमें|मेरे|लिए|सिर्फ़|सिर्फ|केवल|बस|थोड़ा|और|का|की|के|भी|आज|कल|चाहिए|कर|करो|दो|दीजिए|"
        r"लाओ|लाना|ऑर्डर|मँगा\S*|मंगा\S*|मँगवा\S*|मंगवा\S*"
    ),
    re.I,
)
# Statements and questions that name an amount but are not asking for stock.
NOT_AN_ORDER = re.compile(
    r"\?|\b(?:sold|selling|left|remaining|received|came|arrived|price|costs?|rupees?|rs|inr|"
    r"naam|name|dukaan|shop|menu|timing|hours|"
    r"remind|note|number|how much|how many|supplier|suppliers|find|biki|bika|bike|becha|bacha|"
    r"bache|"
    r"kitna|kitne|yaad|mila|aaya|daam|rate)\b|₹"
    r"|बिक|बेच|बचा|बचे|बची|आया|आई|आए|मिला|दाम|कीमत|रुपय|रुपए|रूपय|कितन|याद|सप्लायर|सूचना|नंबर",
    re.I,
)
SPLIT = re.compile(rf"\band\b|&|\+|;|\baur\b|{_hindi('और')}|\n", re.I)
_LETTER = re.compile(r"[^\W\d_]")


@dataclass(frozen=True)
class OrderLine:
    item: str
    quantity: float | None = None
    unit: str = ""


@dataclass(frozen=True)
class OrderWords:
    lines: list[OrderLine] = field(default_factory=list)
    refused: bool = False
    # Reads as a request, not a remark: an order word, or an amount with its unit.
    asked: bool = False


def _number(text: str) -> float | None:
    word = text.casefold()
    if word in NUMBER_WORDS:
        return NUMBER_WORDS[word]
    # "1,000" and "1,00,000" group thousands; "1,5" (id, vi) is one and a half.
    grouped = re.fullmatch(r"\d{1,3}(?:,\d{2,3})+(?:\.\d+)?", text)
    if not grouped and "," in text and "." not in text:
        text = text.replace(",", ".")
    try:
        value = float(text.replace(",", ""))
    except ValueError:
        return None
    return value if 0 < value <= 100_000 else None


def _name(text: str) -> str:
    cleaned = FILLER.sub(" ", text)
    cleaned = " ".join(cleaned.replace(":", " ").split()).strip(" ,.;:!-–—।")
    return cleaned[:60] if _LETTER.search(cleaned) and len(cleaned.split()) <= 6 else ""


def _chunk(text: str) -> tuple[str, float | None, str]:
    """One item's words: its name, and the first amount in them (a pack size stays in the name)."""
    found = AMOUNT.search(text)
    if not found:
        return _name(text), None, ""
    number = _number(found.group("number"))
    if number is None:
        return "", None, ""
    rest = f"{text[: found.start()]} {text[found.end() :]}"
    return _name(rest), number, UNIT_WORDS.get((found.group("unit") or "").casefold(), "")


def _lines(text: str) -> list[OrderLine]:
    found: list[OrderLine] = []
    for clause in SPLIT.split(text):
        # A comma parts a name from its amount ("butter, 2 kg") or two items ("butter 2 kg, milk").
        waiting = ""
        for part in re.split(r",(?!\d)", clause):
            name, quantity, unit = _chunk(part)
            if quantity is not None and not name and waiting:
                found.append(OrderLine(waiting, quantity, unit))
                waiting = ""
            elif quantity is not None and name:
                if waiting:
                    found.append(OrderLine(waiting))
                    waiting = ""
                found.append(OrderLine(name, quantity, unit))
            elif name:
                if waiting:
                    found.append(OrderLine(waiting))
                waiting = name
        if waiting:
            found.append(OrderLine(waiting))
    return found


def read_order(text: str) -> OrderWords:
    """The items, amounts and units in what the owner said; nothing when they said not to."""
    said = unicodedata.normalize("NFC", text or "").translate(DEVANAGARI_DIGITS).strip()
    if not said:
        return OrderWords()
    if REFUSED.search(said):
        return OrderWords(refused=True)
    corrections = list(CORRECTION.finditer(said))
    if corrections:
        said = said[corrections[-1].end() :]
    # "2 crates (24 packets)": the brackets say more about the same amount.
    said = re.sub(r"\([^)]*\)", " ", said)
    lines = _lines(said)
    cue = bool(CUES.search(said))
    return OrderWords(
        lines=lines,
        asked=not NOT_AN_ORDER.search(said) and (cue or any(line.unit for line in lines)),
    )


def resolve_item(said: str, inventory: list[dict[str, Any]]) -> str:
    """The shop's own name for what was said ("दूध" is its Milk), else the plain name of it."""
    wanted = said.strip()
    hindi = item_named_in(wanted)
    english = hindi or (canonical(wanted) or "").capitalize() if len(wanted.split()) == 1 else ""
    for name in (wanted, english):
        if not name:
            continue
        exact = next((p["name"] for p in inventory if p["name"].casefold() == name.casefold()), "")
        loose = next((p["name"] for p in inventory if matches(p["name"], name)), "")
        if exact or loose:
            return exact or loose
    return english or wanted
