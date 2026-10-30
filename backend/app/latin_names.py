"""Find a shop or item by typing its name in English letters, whatever script it is written in
(OB-170, #528): 'चिंकू जिया' is found by 'chinku jiya', 'முருகன் கடை' by 'murugan kadai'.

Names are read in Latin letters by anyascii (ISC licence, a pure table lookup: no model, no
network). The reading is computed when a name is first matched and kept in memory, so every shop
already saved is covered without rewriting stored data.

People spell a name the way it sounds, so the comparison forgives what they cannot know from
the script: capitals and accents, long vowels ("aa", "ee"), aspiration ("chh", "kh", "sh"), the
silent vowel Indic scripts leave unwritten ("sharma" for "srma"), voicing Tamil does not mark
("murugan" for "murukn") and one slip in a longer word. It only applies when the name or the
typed word is in another script: English names keep the exact word match they had, and accented
Latin names ('Café') only lose their accents. Under three letters a typed word never matches.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

from anyascii import anyascii

MIN_LETTERS = 3
# Scripts written without spaces between words: a typed word may start anywhere in the name.
UNSPACED = re.compile(r"[฀-໿က-႟ក-៿぀-ヿ㐀-鿿]")
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
def loose(word: str) -> str:
    """One Latin word as it sounds, so spellings of the same sound meet."""
    w = word.replace("ph", "f").replace("w", "v").replace("q", "k").replace("x", "ks")
    w = re.sub(r"([bcdgjklmnprstvz])h", r"\1", w)  # aspiration: chh, kh, sh, th, dh
    w = w.replace("ee", "i").replace("oo", "u")
    w = re.sub(r"([aeiou])v", r"\1o", w)  # Thai and Lao vowel letters: khaw = khao
    w = re.sub(r"([aeiou])y", r"\1i", w)  # aroy = aroi
    w = re.sub(r"m(?=[bcdfgjklnpqrstvz])", "n", w)  # anusvara before a consonant: cimku = cinku
    w = re.sub(r"(.)\1+", r"\1", w)  # long vowels and doubled letters
    return w.translate(str.maketrans("gdb", "ktp"))  # voicing (Tamil writes k for g)


@lru_cache(maxsize=16384)
def skeleton(word: str) -> str:
    """Its consonants, keeping the first letter: 'sarma' and 'srma' are both 'srm'."""
    rest = "".join(c for c in word[1:] if c not in VOWELS)
    return re.sub(r"(.)\1+", r"\1", word[:1] + rest)


def distance(a: str, b: str) -> int:
    """Letters changed, added or dropped to turn `a` into `b`."""
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x != y)))
        previous = current
    return previous[-1]


def one_slip(typed: str, word: str, unspaced: bool) -> bool:
    """Whether `typed` is `word` give or take one letter. A slip counts on a whole word only
    ('bread' never finds 'pradeep'); in an unspaced name, on any stretch of the same length."""
    if not unspaced:
        return distance(typed, word) <= 1
    return any(distance(typed, word[:size]) <= 1 for size in range(len(typed) - 1, len(typed) + 2))


@lru_cache(maxsize=16384)
def name_words(name: str) -> tuple[str, ...]:
    """The loose words a typed word may start: each word, or each position when unspaced."""
    words = [loose(w) for w in latin(name).split()]
    if UNSPACED.search(name):
        joined = "".join(words)
        return tuple(joined[i:] for i in range(len(joined)))
    return tuple(words)


def sounds_like(typed: str, name: str) -> bool:
    """Whether one typed word names a word of `name` once both are read in Latin letters.

    'chinku' and 'jiya' each name 'चिंकू जिया'; 'chin' does too (people type the start of a name).
    """
    if plain(typed) and plain(name):
        return False
    if not (other_script(typed) or other_script(name)):
        # Accents only: 'cafe' finds 'Café', with no spelling slack ('cake' does not).
        typed_latin = "".join(latin(typed).split())
        return len(typed_latin) >= MIN_LETTERS and any(
            w.startswith(typed_latin) for w in latin(name).split()
        )
    word = loose("".join(latin(typed).split()))
    if len(word) < MIN_LETTERS:
        return False
    bones = skeleton(word)
    unspaced = bool(UNSPACED.search(name))
    for candidate in name_words(name):
        if candidate.startswith(word):
            return True
        if len(word) >= 4 and one_slip(word, candidate, unspaced):
            return True
        # The unwritten Indic vowel: a whole word's consonants, never a part ('sharma' = 'srma').
        if len(bones) >= MIN_LETTERS and not unspaced and skeleton(candidate) == bones:
            return True
    return False


def names_any(words: list[str], *names: str) -> bool:
    """Whether any typed word names any of these names (a shop's, its items')."""
    return any(sounds_like(word, name) for word in words if word for name in names if name)
