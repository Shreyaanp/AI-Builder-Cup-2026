"""Conservative product vocabulary: unknown keywords are discarded, never saved as free text.

Extend this catalogue deliberately. It is also the offline exact-cluster fallback; a model
must never be allowed to turn a person's name or address into a persisted cluster label.
"""

import re

from .sourcing import SYNONYMS

TERMS = {
    **SYNONYMS,
    "cake": ("cake", "cakes"),
    "croissant": ("croissant", "croissants"),
    "sourdough": ("sourdough",),
    "bubble tea": ("bubble tea", "boba", "pearl milk tea"),
    "oat milk coffee": ("oat milk coffee", "oat latte"),
    "bread": ("bread", "breads"),
    "flower": ("flower", "flowers", "bouquet", "bouquets"),
    "sandwich": ("sandwich", "sandwiches"),
    "noodle": ("noodle", "noodles"),
    "breakfast": ("breakfast",),
}
EGGLESS = ("eggless", "egg-free", "egg free", "without egg", "बिना अंडे")


def normalise(keywords: list[str]) -> list[str]:
    text = " ".join(keywords).casefold()
    # Reject contact/address-like tokens before matching even known product substrings.
    text = re.sub(r"\S*(?:\d|@|https?://)\S*", " ", text)
    eggless = any(term in text for term in EGGLESS)
    found = [
        key
        for key, names in TERMS.items()
        if any(re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", text) for name in names)
    ]
    if "bubble tea" in found:
        found = [key for key in found if key != "tea"]
    if "oat milk coffee" in found:
        found = [key for key in found if key not in {"milk", "coffee"}]
    if eggless:
        found = [key for key in found if key != "eggs"]
    return [(key + "|eggless" if eggless and key == "cake" else key) for key in found][:4]


def inferred_category(terms: list[str]) -> str:
    if any(term.split("|")[0] in {"cake", "croissant", "sourdough", "bread"} for term in terms):
        return "bakery"
    if any(term in {"coffee", "tea", "bubble tea", "oat milk coffee"} for term in terms):
        return "coffee"
    return ""
