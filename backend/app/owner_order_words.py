"""What an owner says to order stock, in English, Hinglish and Hindi (OB-268).

"Reorder milk", "milk order karo", "20 litre doodh mangao", "दूध मँगाना है". Language only: the
public demo (demo_order_words.py) and the coach's own tools (supply_offline.py) each act on it, so
both understand the same sentences. A "don't" is read here too: nothing is ever ordered on one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .demo_coach_words import bare, without_polite_na
from .demo_item_names import HINDI_ITEMS, item_named_in
from .sourcing import SYNONYMS

# Hinglish names of what shops buy, as the saved names the demo's tables use.
HINGLISH_SUPPLIES = {
    "doodh": "Milk",
    "dudh": "Milk",
    "cheeni": "Sugar",
    "chini": "Sugar",
    "chai patti": "Tea dust",
    "chaipatti": "Tea dust",
    "चायपत्ती": "Tea dust",
    "dahi": "Curd",
    "makhan": "Butter",
    "aloo": "Potatoes",
    "pyaz": "Onions",
    "pyaaz": "Onions",
    "chawal": "Rice",
    "namak": "Salt",
    "gud": "Jaggery",
    "anda": "Eggs",
    "ande": "Eggs",
}
_ENGLISH_SUPPLIES = {name.casefold(): name for name in HINDI_ITEMS}
_SYNONYMS = {word for words in SYNONYMS.values() for word in words}

UNIT = (
    r"kgs?|kilos?|g|gms?|grams?|litres?|liters?|ltrs?|l|ml|packs?|packets?|dozens?"
    r"|लीटर|किलो|ग्राम|पैकेट|पैक|दर्जन"
)
# Named groups repeat by position: an amount can come before or after the item.
AMOUNT = r"(?:(?P<q{n}>\d+(?:\.\d+)?)\s*(?P<u{n}>" + UNIT + r")?\s+)?"
AFTER_ITEM = r"(?:\s+(?P<q2>\d+(?:\.\d+)?)\s*(?P<u2>" + UNIT + r")?)?"
LATIN_ITEM = r"(?P<item>[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2}?)"
HINDI_ITEM = r"(?P<item>[ऀ-ॿ]+(?:\s+[ऀ-ॿ]+){0,2}?)"
POLITE = r"(?:\s+(?:please|pls|now|today|tomorrow|for\s+tomorrow|again|abhi|aaj|kal|ji|bhai))*"
POLITE_HI = r"(?:\s+(?:अभी|आज|कल|जी|भाई))*"
# "Reorder milk": the word itself asks for an order, of whatever the owner names.
REORDER = re.compile(
    r"(?:(?:please|pls|hi|hello|ok|okay)\s+)*(?:(?:can|could|will|would)\s+you\s+(?:please\s+)?)?"
    r"re-?order\s+(?:more\s+|some\s+)?"
    + AMOUNT.format(n=1)
    + r"(?:of\s+)?(?:my\s+|the\s+)?"
    + LATIN_ITEM
    + AFTER_ITEM
    + POLITE
)
# "Order milk", "I need more milk": only of something known to be bought, or "order status" and
# "I need help" would be orders.
ORDER = re.compile(
    r"(?:(?:please|pls|hi|hello|ok|okay)\s+)*(?:(?:can|could|will|would)\s+you\s+(?:please\s+)?)?"
    r"(?:(?:i|we)\s+)?(?:order|buy|get\s+me|need)\s+(?:more\s+|some\s+)?"
    + AMOUNT.format(n=1)
    + r"(?:of\s+)?(?:my\s+|the\s+)?"
    + LATIN_ITEM
    + AFTER_ITEM
    + POLITE
)
HINGLISH_VERB = (
    r"(?:(?:ka|ki|ke)\s+)?order\s+(?:karo|kar\s*do|kijiye|karna(?:\s+hai)?|karni(?:\s+hai)?|de\s+do"
    r"|laga\s+do|lagao)"
    r"|ma?ng[wv]?a+(?:o|\s*do|iye|ye|na(?:\s+hai)?|ni(?:\s+hai)?|\s+lo|\s+dena)"
    r"|chahiye|lana\s+hai|le\s+aao|kharidna\s+hai"
)
HINGLISH = re.compile(
    AMOUNT.format(n=1)
    + r"(?:mera\s+|meri\s+|my\s+|thoda\s+|aur\s+)?"
    + LATIN_ITEM
    + AFTER_ITEM
    + rf"(?:\s+(?:phir\s+se|dobara))?\s+(?:{HINGLISH_VERB}){POLITE}"
)
# After bare() and the chandrabindu is read as an anusvara: मँगाना and मंगाना are one word.
HINDI_VERB = (
    r"(?:(?:का|की|के)\s+)?[ऑआ]र्डर\s+(?:करो|कर\s+दो|करें|कीजिए|करना(?:\s+है)?|करनी(?:\s+है)?"
    r"|दे\s+दो|लगाओ|लगा\s+दो)"
    r"|मंग(?:वा|ा)(?:ओ|ना(?:\s+है)?|नी(?:\s+है)?|इए|एं|\s+दो|\s+दें|\s+दीजिए|\s+लो|\s+देना)"
    r"|चाहिए|चाहिये|लाना\s+है|खरीदना\s+है"
)
HINDI = re.compile(
    AMOUNT.format(n=1)
    + r"(?:(?:मेरा|मेरी|मुझे|थोड़ा|और)\s+)*"
    + HINDI_ITEM
    + AFTER_ITEM
    + rf"(?:\s+(?:फिर\s+से|दोबारा))?\s+(?:{HINDI_VERB}){POLITE_HI}"
)
# A "don't" about the order ("na" only before the verb: a closing "na" is already gone, as it
# means please). Removed before reading, so "milk order mat karo" reads as an order
# the owner does not want, not as an order for something called "mat".
DONT_WORDS = re.compile(
    r"\b(?:don'?t|do\s+not|never|mat|nahi|nahin|na)\b\s*|(?<!\S)(?:मत|नहीं|ना)(?!\S)\s*"
)


@dataclass(frozen=True)
class OrderAsk:
    item: str
    """As said, or the saved English name of a Hindi or Hinglish word ("doodh" is Milk)."""
    quantity: float | None
    unit: str
    declined: bool
    """The owner said not to ("milk order mat karo"): nothing is ordered."""
    outright: bool
    """"Reorder" was said, so an item nobody knows is still an order."""
    needs_known_supply: bool
    """"Chahiye" and "need" only order something the shop buys, never "samosa chahiye"."""


def known_supply(said: str) -> str | None:
    """The saved name of something shops buy, if this is one. Hindi first, so "दूध ब्रेड" stays
    itself, then Hinglish, then English."""
    word = said.casefold().strip()
    if alias := HINGLISH_SUPPLIES.get(word):
        return alias
    if named := item_named_in(said):
        return named
    if word in _ENGLISH_SUPPLIES:
        return _ENGLISH_SUPPLIES[word]
    return said.strip() if word in _SYNONYMS else None


def order_asked(question: str) -> OrderAsk | None:
    """The order this sentence asks for, or None when it asks for none."""
    text = without_polite_na(bare(question)).replace("ँ", "ं")
    without_dont = DONT_WORDS.sub("", text).strip()
    declined = without_dont != text
    found = None
    outright = False
    for pattern in (REORDER, ORDER, HINGLISH, HINDI):
        found = pattern.fullmatch(without_dont)
        if found:
            outright = pattern is REORDER
            break
    if not found:
        return None
    said = found["item"].strip()
    known = known_supply(said)
    if not outright and known is None and not (found.re is HINGLISH or found.re is HINDI):
        return None
    quantity = found["q1"] or found["q2"]
    verb = without_dont[found.end("item") :]
    return OrderAsk(
        item=known or said,
        quantity=float(quantity) if quantity else None,
        unit=(found["u1"] or found["u2"] or "").strip(),
        declined=declined,
        outright=outright,
        needs_known_supply=found.re is ORDER or bool(re.search(r"chahiye|चाहि", verb)),
    )
