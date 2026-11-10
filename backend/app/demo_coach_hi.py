"""The public demo coach's answers to a Hindi question, in Hindi, from the seeded records (OB-248).

This offline demo has no translation model, so each answer is written here, with the same facts as
the English replies and the item names the screens use.
"""

import re
from datetime import date
from typing import Any, cast

from .app_guide import next_line_hi
from .demo_coach_en import item_in
from .demo_coach_words import FALLBACK_HI
from .demo_item_names import HINDI_ITEMS, HINDI_UNITS, hindi_item, item_named_in

# "मेरा दूध कम हो रहा है", "मेरी चीनी कम हो रही है" or the tour's "मेरा आटा ख़त्म हो रहा है": the
# words between are the item.
LOW_HI = re.compile(r"मेर[ाी]\s+(?P<item>[^।?]{1,40}?)\s+(?:कम|ख़?त्म)\s+हो\s+रह[ाी]")
HINDI_BEST_SELLERS = re.compile(r"सबसे\s+\S*यादा\s+(?:\S+\s+)?बिक|बेस्ट\s*सेलर|टॉप\s*सेलर")


# A Hindi shop asking in English or Hinglish ("what sold today?", "kal kya banau?") still gets
# its answer in Hindi: the words below add the Hindi cue that hindi_reply reads.
ENGLISH_CUES = (
    (r"\b(?:today|sales?|sold|earn\w*|revenue|takings|aaj|bikri|bika|kamai)\b", "आज बिक्री"),
    (r"\b(?:stock|left|remaining|available|bacha|bachi|khatam|khatm)\b", "स्टॉक"),
    (r"\b(?:price|cost|rate|daam|dam|keemat|kimat|bhav)\b", "कीमत"),
    (r"\b(?:order|reorder|supplier\w*|buy|mangao|mangana|kharid\w*)\b", "ऑर्डर"),
    (r"\b(?:tomorrow|prep|kal|banau|banaun|banana)\b", "कल"),
    (r"\b(?:hours?|open|opening|close[ds]?|timing|samay|khula|band)\b", "समय"),
    (r"\b(?:customers?|messages?|questions?|inquir\w*|grahak\w*|sawal)\b", "ग्राहक"),
    (
        r"\b(?:best ?sellers?|top ?sellers?|most sold|(?:sells?|sold) (?:the )?most|sabse "
        r"(?:zyada|jyada|jada|ziada))\b",
        "बेस्ट सेलर",
    ),
    (r"^(?:hello|hi|hey|namaste|namaskar)\b", "नमस्ते"),
)


def in_hindi(question: str) -> str:
    """The question with the Hindi cues of its English or Hinglish words added, item names
    too ("milk" → दूध), so the answer names the same item."""
    words = question.casefold()
    cues = [cue for pattern, cue in ENGLISH_CUES if re.search(pattern, words)]
    # The item by its English or Hinglish name ("milk", "doodh" → दूध).
    item = item_in(question)
    if item and item in HINDI_ITEMS:
        cues.append(HINDI_ITEMS[item])
    return " ".join([question, *cues])


def _stock_hi(item: dict[str, Any]) -> str:
    name = hindi_item(item["name"])
    if item.get("stock") is None:
        return f"{name} की बिक्री चालू है, इसका स्टॉक गिना नहीं जाता।"
    unit = str(item.get("unit") or "")
    return f"{name} का स्टॉक {item['stock']:g} {HINDI_UNITS.get(unit, unit)} है।"


def hindi_reply(
    ctx: Any,
    question: str,
    business: dict[str, Any],
    inventory: list[Any],
    history: list[Any],
    inquiries: list[Any],
    today: date,
    named: dict[str, Any] | None,
    product: dict[str, Any],
) -> str:
    from . import supply_chain
    from .coordinator import shop_currency
    from .forecast import weekday_average
    from .money import to_major

    store, uid, bid = ctx.store, ctx.uid, ctx.business_id
    fields = business["fields"]
    words = question.casefold()
    # This offline demo has no translation model. Keep its answers in the language of a
    # Devanagari question, with the same seeded facts used by the English replies.
    low = LOW_HI.search(words)
    if low:
        # Find suppliers did the work when it could; this is what no demo supplier sells.
        return (
            f"डेमो के सप्लायरों के पास {low['item']} नहीं मिला। दूध या चीनी जैसी कोई चीज़ लिखकर "
            "देखें। " + next_line_hi("suppliers")
        )
    if HINDI_BEST_SELLERS.search(question):
        from .coordinator import get_insights

        top = get_insights().get("top_sellers") or []
        if not top:
            return "डेमो दुकान में पिछले 7 दिनों की कोई बिक्री अभी सेव नहीं है।"
        names = ", ".join(f"{hindi_item(row['item'])} ({row['quantity']:g} बिके)" for row in top[:3])
        return f"पिछले 7 दिनों में डेमो के सबसे ज़्यादा बिकने वाले आइटम: {names}। " + next_line_hi("insights")
    if "गूगल" in words or "google" in words:
        return (
            "डेमो में Google पर आने का अभ्यास करें: यह सिर्फ़ दिखावा है, Google को कुछ नहीं भेजा "
            f"जाता। {next_line_hi('google')}"
        )
    said = item_named_in(question)
    saved = named or next((item for item in inventory if item["name"] == said), None)
    # No name in the question: what the shop buys and counts, not the first on the menu.
    counted = next(
        (i for i in inventory if i.get("source") == "bought" and i.get("stock") is not None),
        product,
    )
    if any(term in words for term in ("आज", "बिक्री", "कमाई")):
        rows = [row for row in history if row["date"] == today.isoformat()]
        sold = sum(row["quantity"] for row in rows)
        revenue = sum(row.get("revenue", row.get("amount", 0)) for row in rows)
        # Saved in paise: ₹20, never ₹2000 (OB-264).
        rupees = to_major(int(revenue), shop_currency(business))
        return f"आज डेमो में {sold:g} चीज़ें बिकीं और बिक्री ₹{rupees:,.0f} रही।"
    if any(term in words for term in ("स्टॉक", "बचा", "उपलब्ध", "खत्म", "ख़त्म", "कम")):
        if said and not saved:
            return f"डेमो दुकान में {hindi_item(said)} का स्टॉक दर्ज नहीं है।"
        return "डेमो में " + _stock_hi(saved or counted)
    if any(term in words for term in ("कीमत", "दाम", "भाव")):
        if said and not saved:
            return f"{hindi_item(said)} डेमो दुकान के मेन्यू में नहीं है।"
        priced = saved or product
        rupees = to_major(cast(int, priced.get("price", 0)), shop_currency(business))
        return f"डेमो में {hindi_item(str(priced['name']))} की कीमत ₹{rupees:g} है।"
    if any(term in words for term in ("ऑर्डर", "सप्लायर", "मंगाऊँ", "खरीद")):
        if (
            not said
            and not saved
            and re.fullmatch(r"\s*ऑर्डर\s*(?:करो|कीजिए|कर\s+दो)?\s*[।?!]?\s*", words)
        ):
            return "कौन सी चीज़ का ऑर्डर करना है? उसका नाम बताइए, जैसे “दूध का ऑर्डर”।"
        if said and not saved:
            return f"डेमो दुकान में {hindi_item(said)} का स्टॉक दर्ज नहीं है।"
        orders = supply_chain.orders(store, uid, bid)
        po = next((order for order in orders if order.get("supplier")), None)
        supplier = po["supplier"]["name"] if po else "डेमो सप्लायर"
        return f"डेमो सप्लायर {supplier} है। {_stock_hi(saved or counted)}"
    if any(term in words for term in ("कल", "तैयार", "बनाऊँ")):
        tomorrow = today.fromordinal(today.toordinal() + 1)
        usual = [row for row in weekday_average(history, today) if row.date == tomorrow]
        picked = [row for row in usual if not saved or row.item == saved["name"]]
        top = sorted(picked, key=lambda row: -row.quantity)[:3]
        if not top:
            return "कल की तैयारी के लिए डेमो में अभी पिछली बिक्री नहीं है।"
        units = {item["name"]: str(item.get("unit") or "") for item in inventory}
        plan = ", ".join(
            f"{hindi_item(row.item)} {row.quantity:g} "
            f"{HINDI_UNITS.get(units.get(row.item, ''), units.get(row.item, ''))}".rstrip()
            for row in top
        )
        return f"कल की तैयारी: {plan} (पिछली बिक्री का औसत)।"
    if any(term in words for term in ("समय", "खुला", "खुलती", "बंद")):
        return f"डेमो दुकान का समय {fields.get('hours', 'दिया नहीं गया')} है।"
    if any(term in words for term in ("ग्राहक", "सवाल", "जवाब", "संदेश")):
        return f"डेमो दुकान में {len(inquiries)} ग्राहक सवाल हैं।"
    if "नमस्ते" in words:
        return "नमस्ते! मैं आज की बिक्री, कल की तैयारी या स्टॉक के बारे में बता सकती हूँ। क्या जानना है?"
    # Unsure: one short question in Hindi, with examples to tap (S2-9).
    return FALLBACK_HI
