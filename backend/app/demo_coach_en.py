"""An English shop's question typed in Hindi or Hinglish, read as the English question it asks.

The owner chose English, so the coach answers in English, but it still understands "आज कितनी
बिक्री हुई?" or "doodh kitna bacha hai?": the question is asked again in the English words the
demo coach answers ("How much did I sell today?", "How much Milk is in stock?"). Change requests
("समोसा ख़त्म हो गया") are read before this, by the owner's-words handlers.
"""

import re

from .demo_item_names import HINDI_ITEMS, item_named_in

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
# Hinglish names of common items (the Hindi script names are in HINDI_ITEMS).
HINGLISH_ITEMS = {
    "doodh": "Milk",
    "dudh": "Milk",
    "cheeni": "Sugar",
    "chini": "Sugar",
    "chai patti": "Tea dust",
    "chai ki patti": "Tea dust",
    "aata": "Atta",
    "chawal": "Rice",
    "anda": "Eggs",
    "ande": "Eggs",
    "makhan": "Butter",
    "pyaz": "Onions",
    "pyaaz": "Onions",
    "aloo": "Potatoes",
    "tamatar": "Tomatoes",
    "namak": "Salt",
    "dahi": "Curd",
    "gud": "Jaggery",
}
_ENGLISH_NAMES = sorted(HINDI_ITEMS, key=len, reverse=True)
_HINGLISH_NAMES = sorted(HINGLISH_ITEMS, key=len, reverse=True)

# What was asked, first match wins (the same order as hindi_reply). Hindi script and Hinglish
# words only: an English question keeps the English path it always had.
ASKED = (
    (
        r"सबसे\s+\S*यादा\s+(?:\S+\s+)?बिक|बेस्ट\s*सेलर|टॉप\s*सेलर"
        r"|\bsabse\s+(?:zyada|jyada|jada|ziada|jyaada|zyaada)\b",
        "best",
    ),
    (r"आज|बिक्री|कमाई|बिका|बिकी|\b(?:aaj|bikri|bikree|kamai|bika|biki)\b", "sales"),
    (
        r"स्टॉक|बचा|बची|बचे|उपलब्ध|\b(?:bacha|bachi|bache|kitna\s+hai|kitni\s+hai)\b",
        "stock",
    ),
    (r"कीमत|दाम|भाव|\b(?:daam|dam|keemat|kimat|bhav|bhaav)\b", "price"),
    (r"कल|तैयार|बनाऊ|बनाना|\b(?:kal|banau|banaun|banaoon|banana|taiyar|taiyari)\b", "tomorrow"),
    (r"समय|खुल|बंद|\b(?:samay|khul\w*|timing|band)\b", "hours"),
    (r"ग्राहक|सवाल|संदेश|\b(?:grahak\w*|sawal|savaal|sandesh)\b", "customers"),
)
# A Hinglish question names its kind with a question word ("kya", "kitna"), so a word like
# "kal" in an English sentence is not read as one.
HINGLISH_QUESTION = re.compile(
    r"\b(?:kya|kitna|kitni|kitne|kaun|kaunsa|kaunse|kab|kaise|batao|bataiye|hai|hain|hui|hua)\b"
)


def item_in(question: str) -> str | None:
    """The saved English name of the item a Hindi, Hinglish or English question names."""
    said = item_named_in(question)
    if said:
        return said
    words = question.casefold()
    for names, mapping in ((_ENGLISH_NAMES, None), (_HINGLISH_NAMES, HINGLISH_ITEMS)):
        for name in names:
            if re.search(rf"(?<!\w){re.escape(name.casefold())}(?!\w)", words):
                return mapping[name] if mapping else name
    return None


def in_english(question: str) -> str | None:
    """The English question a Hindi or Hinglish question asks, or None (an English question,
    or one this demo does not answer)."""
    words = question.casefold()
    if not DEVANAGARI.search(question) and not HINGLISH_QUESTION.search(words):
        return None
    kind = next((kind for pattern, kind in ASKED if re.search(pattern, words)), None)
    item = item_in(question)
    if kind == "best":
        return "What are my best sellers?"
    if kind == "sales":
        return "How much did I sell today?"
    if kind == "stock":
        return f"How much {item} is in stock?" if item else "What is in stock?"
    if kind == "price":
        return f"What is the price of {item}?" if item else "What are my prices?"
    if kind == "tomorrow":
        return (
            f"What should I prep tomorrow for {item}?" if item else "What should I prep tomorrow?"
        )
    if kind == "hours":
        return "What are my opening hours?"
    if kind == "customers":
        return "What did customers ask?"
    return None
