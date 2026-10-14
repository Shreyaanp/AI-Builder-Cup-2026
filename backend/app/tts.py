"""Natural spoken replies with Google Cloud Text-to-Speech.

The browser's built-in voices sound robotic and differ per phone. This turns a coach reply into
audio with the best Google voice for its language. Voices are discovered once from the API
(Chirp 3 HD, then Neural2, WaveNet, Standard), so no voice names are hard-coded. Offline mode
reports "unavailable" and the app falls back to the phone's own voice.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from typing import Any

import anyio
import structlog

from .settings import Settings

log = structlog.get_logger()

MAX_CHARS = 1_200
CACHE_ITEMS = 128
# App locale → Cloud TTS language code (Singapore English uses en-US voices for quality).
LOCALE_LANGUAGE = {
    "en": "en-US",
    "zh-Hans": "cmn-CN",
    "ms": "ms-MY",
    "ta": "ta-IN",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "id": "id-ID",
    "th": "th-TH",
    "vi": "vi-VN",
    "fil": "fil-PH",
    "hi": "hi-IN",
}
# Script detection wins over the app language: replies follow the owner's language.
SCRIPTS = [
    (re.compile(r"[぀-ヿ]"), "ja-JP"),
    (re.compile(r"[가-힯]"), "ko-KR"),
    (re.compile(r"[一-鿿]"), "cmn-CN"),
    (re.compile(r"[฀-๿]"), "th-TH"),
    (re.compile(r"[஀-௿]"), "ta-IN"),
    (re.compile(r"[ऀ-ॿ]"), "hi-IN"),
]
TIERS = ("Chirp3-HD", "Chirp-HD", "Neural2", "Wavenet", "Standard")


def language_for(text: str, locale: str) -> str:
    for pattern, language in SCRIPTS:
        if pattern.search(text):
            return language
    return LOCALE_LANGUAGE.get(locale, "en-US")


def best_voice(voices: list[tuple[str, list[str]]], language: str) -> str | None:
    """Pick the highest-quality voice for a language from (name, language_codes) pairs."""
    candidates = [name for name, codes in voices if language in codes]
    for tier in TIERS:
        tiered = sorted(name for name in candidates if f"-{tier}-" in name)
        if tiered:
            return tiered[0]
    return sorted(candidates)[0] if candidates else None


def speakable(text: str) -> str:
    """Strip markdown-ish symbols and bracketed asides so they aren't read aloud."""
    text = re.sub(r"[*_`#>|]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_CHARS]


class Speech:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: Any = None
        self._voices: list[tuple[str, list[str]]] | None = None
        self._cache: OrderedDict[tuple[str, str], bytes] = OrderedDict()

    @property
    def enabled(self) -> bool:
        return self.settings.coach_mode == "gemini" and self.settings.gemini_backend == "vertex"

    def _client_sync(self) -> Any:
        if self._client is None:
            from google.cloud import texttospeech

            self._client = texttospeech.TextToSpeechClient()
        return self._client

    def _voices_sync(self) -> list[tuple[str, list[str]]]:
        if self._voices is None:
            response = self._client_sync().list_voices()
            self._voices = [(v.name, list(v.language_codes)) for v in response.voices]
        return self._voices

    def _synthesize_sync(self, text: str, language: str) -> bytes:
        from google.cloud import texttospeech

        name = best_voice(self._voices_sync(), language)
        voice = texttospeech.VoiceSelectionParams(language_code=language, name=name or "")
        response = self._client_sync().synthesize_speech(
            input=texttospeech.SynthesisInput(text=text),
            voice=voice,
            audio_config=texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=1.0
            ),
        )
        return bytes(response.audio_content)

    async def speak(self, text: str, locale: str) -> bytes | None:
        """MP3 audio, or None when unavailable (the app then uses the phone's voice)."""
        if not self.enabled:
            return None
        clean = speakable(text)
        if not clean:
            return None
        language = language_for(clean, locale)
        key = (language, clean)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        try:
            audio = await anyio.to_thread.run_sync(self._synthesize_sync, clean, language)
        except Exception:
            # Never log the reply text; the caller falls back to on-device speech.
            log.warning("tts_failed", language=language)
            return None
        self._cache[key] = audio
        if len(self._cache) > CACHE_ITEMS:
            self._cache.popitem(last=False)
        return audio
