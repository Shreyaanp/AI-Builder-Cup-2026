"""The owner's chosen app language, pinned for the coach (voice and text).

The app sends its single language preference (src/i18n/locales.ts) with every coach turn and
voice socket. Without it the Live model guessed the language from the audio and drifted (Hindi
was answered in Bhojpuri), so the coach always replies in the chosen language unless the owner
explicitly asks to change it (set_reply_language).
"""

from __future__ import annotations

from typing import NamedTuple


class ReplyLanguage(NamedTuple):
    locale: str
    """App locale (src/i18n/locales.ts)."""
    code: str
    """BCP 47 tag with region, as speech services expect it."""
    name: str
    """English name of the language, for the model's instruction."""
    live: bool
    """The Live model accepts this tag as SpeechConfig.language_code."""


# The 15 app locales. Malay and Filipino are not Live speech languages: the instruction pins them.
LANGUAGES: dict[str, ReplyLanguage] = {
    language.locale: language
    for language in (
        ReplyLanguage("en", "en-US", "English", True),
        ReplyLanguage("zh-Hans", "cmn-CN", "Mandarin Chinese (Simplified)", True),
        ReplyLanguage("ms", "ms-MY", "Malay", False),
        ReplyLanguage("ta", "ta-IN", "Tamil", True),
        ReplyLanguage("ja", "ja-JP", "Japanese", True),
        ReplyLanguage("ko", "ko-KR", "Korean", True),
        ReplyLanguage("id", "id-ID", "Indonesian", True),
        ReplyLanguage("th", "th-TH", "Thai", True),
        ReplyLanguage("vi", "vi-VN", "Vietnamese", True),
        ReplyLanguage("fil", "fil-PH", "Filipino", False),
        ReplyLanguage("hi", "hi-IN", "Hindi", True),
        ReplyLanguage("bn", "bn-IN", "Bengali", True),
        ReplyLanguage("te", "te-IN", "Telugu", True),
        ReplyLanguage("mr", "mr-IN", "Marathi", True),
        ReplyLanguage("kn", "kn-IN", "Kannada", True),
    )
}
# Other spellings of the same languages: browser tags, legacy codes, the regional codes above
# and English names (a model may pass "Hindi" for hi).
ALIASES = {
    "zh": "zh-Hans",
    "cmn": "zh-Hans",
    "in": "id",
    "tl": "fil",
    **{language.code.lower(): language.locale for language in LANGUAGES.values()},
    **{language.name.split()[0].lower(): language.locale for language in LANGUAGES.values()},
}
DEFAULT = LANGUAGES["en"]


def find_language(tag: str | None) -> ReplyLanguage | None:
    """The supported language for a BCP 47 tag (hi, hi-IN, ta-in, zh-Hans…), or None."""
    raw = (tag or "").strip()[:35]
    if raw in LANGUAGES:
        return LANGUAGES[raw]
    lower = raw.lower()
    for key in (lower, lower.split("-")[0]):
        if key in ALIASES:
            return LANGUAGES[ALIASES[key]]
        if key in LANGUAGES:
            return LANGUAGES[key]
    return None


def reply_language(tag: str | None) -> ReplyLanguage:
    """The supported language for a tag; English when it is missing or not one of the 15."""
    return find_language(tag) or DEFAULT


def language_rule(language: ReplyLanguage) -> str:
    """The instruction that keeps every reply in the owner's chosen language."""
    name, code = language.name, language.code
    script = SCRIPTS.get(language.locale)
    written = f" Write it in {script}." if script else ""
    # Live eval, 17 Oct: a Hindi onboarding asked "kya aap abhi apni dukan par hain?".
    roman = f" Use {script}, never in Roman letters (no romanized {name})." if script else ""
    if note := NOT_INSTEAD.get(language.locale):
        written += f" Use {note}."
    return (
        f"Reply language: Always speak and write in {name} ({code}).{written} Reply COMPLETELY in"
        f" {name}: every sentence and every word you can say in {name}, never a mix. If the owner"
        f" mixes languages (e.g. Hinglish), understand it and still reply only in {name};"
        " names of shops, places and"
        " dishes stay as said. Never switch to another language or dialect (e.g. "
        "Bhojpuri, Maithili, Urdu) unless the owner explicitly asks to change language; then "
        "call set_reply_language with that language and reply in it from then on." + roman
    )


# The script each language is written in, so a short tag ("hi") never comes back in another
# script (Hindi in Urdu script, or romanised Hinglish).
SCRIPTS = {
    "zh-Hans": "Simplified Chinese characters",
    "ta": "Tamil script",
    "ja": "Japanese script",
    "ko": "Hangul",
    "th": "Thai script",
    "hi": "Devanagari script",
    "bn": "Bengali script",
    "te": "Telugu script",
    "mr": "Devanagari script",
    "kn": "Kannada script",
}
# Dialects and neighbours a model drifts to when it only sees the tag.
NOT_INSTEAD = {
    "hi": "standard Hindi, not Urdu, Bhojpuri, Maithili or romanised Hinglish",
    "mr": "standard Marathi, not Hindi",
    # Singapore's official languages (task-SG-LANGUAGES-E2E).
    "zh-Hans": "Mandarin in Simplified Chinese, not Cantonese, Hokkien or Traditional characters",
    "ms": "standard Malay (Bahasa Melayu, as written in Singapore and Malaysia), not Indonesian "
    "or English",
    "ta": "standard Tamil, not romanised Tamil, Malayalam or English",
}


def written_language(tag: str | None) -> str:
    """The language a one-shot prompt (translation, Ask, recap, playbook…) must write in, named
    in full: 'Hindi (hi-IN), in Devanagari script; standard Hindi, not Urdu, …'."""
    language = reply_language(tag)
    parts = [f"{language.name} ({language.code})"]
    if script := SCRIPTS.get(language.locale):
        parts.append(f"in {script}")
    text = ", ".join(parts)
    if note := NOT_INSTEAD.get(language.locale):
        text += f"; {note}"
    return text
