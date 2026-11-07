"""Find a shop or item by typing its name in English letters, whatever script it is written in
(OB-170, #528): 'चिंकू जिया' is found by 'chinku jiya', 'முருகன் கடை' by 'murugan kadai'.

Names are read in Latin letters by anyascii (ISC licence, a pure table lookup: no model, no
network). The reading is computed when a name is first matched and kept in memory, so every shop
already saved is covered without rewriting stored data.

People spell a name the way it sounds, so the comparison forgives what they cannot know from
the script: capitals and accents, long vowels ("aa", "ee"), aspiration ("chh", "kh", "sh"), the
silent vowel Indic scripts leave unwritten ("sharma" for "srma"), voicing Tamil and Thai do not
mark ("murugan" for "murukn") and one slip in a longer word. It only applies when the name or the
typed word is in another script: English names keep the exact word match they had, and accented
Latin names ('Café') only lose their accents.

Common English words must not find unrelated names ('sugar' is not 'होटल सागर', 'milk' is not
'मिलन'), so the slack grows with the typed word: three letters name a whole word, four may start
one or differ by a vowel or an unwritten 'a', five may also slip one letter. In Thai, Chinese or
Japanese, written without spaces, a word under five letters must be (nearly) the whole name.
A match by sound ranks below a real spelling (see `spelled`).
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

from anyascii import anyascii

MIN_LETTERS = 3
# Scripts written without spaces between words: a typed word may start anywhere in the name.
UNSPACED = re.compile(r"[฀-໿က-႟ក-៿぀-ヿ㐀-鿿]")
# Scripts with one letter for a voiced and a voiceless sound (Tamil k/g, Thai k/g).
UNVOICED = re.compile(r"[஀-௿฀-໿]")
VOWELS = "aeiouy"


def plain(text: str) -> bool:
    """English letters only: the existing exact match is the right one."""
    return text.isascii()


@lru_cache(maxsize=16384)
def other_script(text: str) -> bool:
    """Letters of a script other than Latin (Devanagari, Tamil, Thai...); accents do not count."""
    return any(
        c.isalpha() and not c.isascii() and "LATIN" not in unicodedata.name(c, "") for c in text
    )


@lru_cache(maxsize=16384)
def latin(text: str) -> str:
    """The name in lowercase Latin words: 'चिंकू जिया' -> 'cimku jiya', 'Café Zoë' -> 'cafe zoe'."""
    return " ".join(re.findall(r"[a-z0-9]+", anyascii(text).casefold()))


@lru_cache(maxsize=16384)
def loose(word: str, unvoiced: bool = False) -> str:
    """One Latin word as it sounds, so spellings of the same sound meet."""
    w = word.replace("ph", "f").replace("w", "v").replace("q", "k").replace("x", "ks")
    w = re.sub(r"([bcdgjklmnprstvz])h", r"\1", w)  # aspiration: chh, kh, sh, th, dh
    w = w.replace("ee", "i").replace("oo", "u")
    w = re.sub(r"([aeiou])v", r"\1o", w)  # Thai and Lao vowel letters: khaw = khao
    w = re.sub(r"([aeiou])y", r"\1i", w)  # aroy = aroi
    w = re.sub(r"m(?=[bcdgjkpt])", "n", w)  # anusvara before a stop: cimku = cinku
    w = re.sub(r"(.)\1+", r"\1", w)  # long vowels and doubled letters
    # Voicing, only where the script does not mark it: Tamil writes k for g ('murukn'), but
    # Hindi keeps b and p apart ('bread' is not 'पराठा').
    return w.translate(str.maketrans("gdb", "ktp")) if unvoiced else w


@lru_cache(maxsize=16384)
def unwritten(word: str) -> str:
    """Without the 'a' Indic scripts leave unwritten after a consonant: 'sarma' and 'srma' are
    both 'srm'. Other vowels stay, so 'sugar' ('sugr') is not 'सागर' ('sgr')."""
    return word[:1] + word[1:].replace("a", "")


def distance(a: str, b: str) -> int:
    """Letters changed, added or dropped to turn `a` into `b` (2 once it is more than one)."""
    if abs(len(a) - len(b)) > 1:
        return 2
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x != y)))
        previous = current
    return previous[-1]


def vowel_slip(typed: str, word: str) -> bool:
    """Whether the two differ by one vowel only, the letter scripts render least alike
    ('aroi' for 'อร่อย', read 'oroi'); 'milk' is not 'मिलन' ('miln')."""
    if len(typed) != len(word):
        return False
    slips = [(x, y) for x, y in zip(typed, word, strict=True) if x != y]
    return len(slips) == 1 and slips[0][0] in VOWELS and slips[0][1] in VOWELS


def close(typed: str, word: str) -> bool:
    """Whether a typed word names one word of a name. Its letters as it sounds set the slack:
    'chaat' is 'cat', three letters, so it never slips to 'चाय' ('cai')."""
    letters = len(typed)
    if word == typed:
        return True
    if letters < 4:
        return False  # 'hot' never finds 'होटल', 'dal' never 'थाली'
    if word.startswith(typed) or vowel_slip(typed, word):
        return True
    bones = unwritten(typed)
    if len(bones) >= MIN_LETTERS and bones == unwritten(word) and len(word) >= 0.6 * len(typed):
        return True
    return letters >= 5 and distance(typed, word) <= 1


def close_unspaced(typed: str, joined: str) -> bool:
    """The same for a name written without spaces, where a word may start anywhere. A short
    word must be (nearly) the whole name: 'man' is in 'ร้านข้าวมันไก่' only by chance."""
    if len(typed) < 5:
        return len(joined) <= len(typed) + 1 and (
            joined.startswith(typed) or vowel_slip(typed, joined)
        )
    sizes = range(len(typed) - 1, len(typed) + 2)
    # One slip leaves the first or second letter within the stretch's first two: skip the rest.
    return any(
        joined[i:].startswith(typed) or any(distance(typed, joined[i : i + n]) <= 1 for n in sizes)
        for i in range(len(joined))
        if typed[0] in joined[i : i + 2] or typed[1] in joined[i : i + 2]
    )


@lru_cache(maxsize=16384)
def reading(text: str, unvoiced: bool) -> tuple[tuple[str, ...], tuple[str, ...], bool]:
    """A name's Latin words, the same words as they sound, and whether it is written unspaced."""
    words = tuple(latin(text).split())
    return words, tuple(loose(w, unvoiced) for w in words), bool(UNSPACED.search(text))


@lru_cache(maxsize=65536)
def strength(typed: str, name: str) -> int:
    """How one typed word (or phrase) names `name`: 2 spelled as its Latin reading, 1 by sound
    only, 0 not at all. Cached: the same words meet the same names on every Ask."""
    if plain(typed) and plain(name):
        return 0
    typed_latin = "".join(latin(typed).split())
    if len(typed_latin) < MIN_LETTERS:
        return 0
    unvoiced = bool(UNVOICED.search(name) or UNVOICED.search(typed))
    words, sounds, unspaced = reading(name, unvoiced)
    if not (other_script(typed) or other_script(name)):
        # Accents only: 'cafe' finds 'Café', with no spelling slack ('cake' does not).
        return 2 if any(w.startswith(typed_latin) for w in words) else 0
    if spelled(typed_latin, words, unspaced):
        return 2
    if plain(typed):
        # English spelling: a hard c is a k ('coffee' = 'कॉफी', read 'kophi'). Readings of other
        # scripts write c only for 'ch' ('चाय' is 'cay').
        typed_latin = re.sub(r"c(?![hiey])", "k", typed_latin)
    word = loose(typed_latin, unvoiced)
    if len(word) < 2:
        return 0
    if unspaced:
        return int(close_unspaced(word, "".join(sounds)))
    return int(any(close(word, candidate) for candidate in sounds))


def spelled(typed: str, words: tuple[str, ...], unspaced: bool) -> bool:
    """Whether the typed word is the Latin reading of a word of the name, or starts it with four
    letters or more (five unspaced): 'dosa' spells 'डोसा'; 'samosa' only sounds like 'smosa'."""
    if unspaced:
        joined = "".join(words)
        return joined == typed or (len(typed) >= 5 and joined.startswith(typed))
    return any(w == typed or (len(typed) >= 4 and w.startswith(typed)) for w in words)


def sounds_like(typed: str, name: str) -> bool:
    """Whether one typed word names a word of `name` once both are read in Latin letters.

    'chinku' and 'jiya' each name 'चिंकू जिया', and so do 'Chinkoo' and 'cheenku'.
    """
    return strength(typed, name) > 0


def phrases(words: list[str]) -> list[str]:
    """Each typed word, and all of them together: 'khao man' is one stretch of 'ร้านข้าวมันไก่'."""
    words = [w for w in words if w]
    return [*words, " ".join(words)] if len(words) > 1 else words


def names_any(words: list[str], *names: str) -> bool:
    """Whether any typed word names any of these names (a shop's, its items'), even by sound."""
    return any(strength(w, name) for w in phrases(words) for name in names if name)


def spelled_any(words: list[str], *names: str) -> bool:
    """Whether any typed word spells any of these names in Latin letters (ranks as a real match)."""
    return any(strength(w, name) == 2 for w in phrases(words) for name in names if name)
