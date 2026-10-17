"""Words of any script, for keyword search.

Python's ``\\w`` leaves out combining marks: the vowel signs and viramas of Devanagari, Tamil,
Kannada and the other Indic scripts. "पास में सस्ती चाय" split into "प", "स", "म", "सस", "त"…,
so Hindi keywords never matched. A word here is letters plus the marks that belong to them.
"""

from __future__ import annotations

import re
import sys
import unicodedata


def _mark_ranges() -> str:
    """A regex character class body for every combining mark (Mn, Mc) and ZWNJ/ZWJ."""
    ranges: list[tuple[int, int]] = []
    for code in range(sys.maxunicode + 1):
        if unicodedata.category(chr(code)) in ("Mn", "Mc") or code in (0x200C, 0x200D):
            if ranges and ranges[-1][1] == code - 1:
                ranges[-1] = (ranges[-1][0], code)
            else:
                ranges.append((code, code))
    return "".join(f"\\U{a:08x}-\\U{b:08x}" for a, b in ranges)


WORD = re.compile(f"[^\\W\\d_](?:[^\\W\\d_]|[{_mark_ranges()}])*")


def words(text: str) -> list[str]:
    """The words of a text, in order: 'पास में सस्ती चाय' → ['पास', 'में', 'सस्ती', 'चाय']."""
    return WORD.findall(text)
