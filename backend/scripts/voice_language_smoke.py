"""Live smoke: the voice coach answers a Hindi owner in Hindi (not Bhojpuri). Paid, not CI.

Runs the app's own Live runner and run config against the real Live model, twice, each a new
voice session like a mic press:
  1. a spoken Hindi clip (made with Cloud Text-to-Speech, 16 kHz PCM like the app's microphone);
  2. a Bhojpuri-flavoured typed turn, the case that drifted: the reply must still be Hindi.
The reply transcript must be Devanagari, with no common Bhojpuri forms.

  GOOGLE_CLOUD_PROJECT=... uv run python -m scripts.voice_language_smoke
Uses the caller's gcloud application-default credentials. Optional: SMOKE_LANGUAGE (hi).
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
import tempfile
from pathlib import Path

from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.agent import ui_language
from app.auth import Principal
from app.coordinator import MerchantContext, current
from app.merchant import MerchantStore
from app.reply_language import reply_language
from app.settings import Settings
from app.streaming import CoachRuntime
from app.voice import live_run_config

SPOKEN = "नमस्ते। मेरी चाय की दुकान है। एक कप मसाला चाय पंद्रह रुपये की है। आज क्या करना चाहिए?"
# Bhojpuri forms (hamaar, baa, baani, raua, kaise ba): the model drifted into these before.
TYPED = "हमार दुकान में चाय बा, पंद्रह रुपया के। रउआ बताईं, आज का करीं?"
# Whole words only: Python's \b splits Devanagari at vowel signs ("बा" inside "बारे").
BHOJPURI = re.compile(r"(?<!\S)(?:हमार|रउआ|रउरा|बानी|बा|कइसे|करीं|बाटे|बाड़े?)(?=[\s,।?!]|$)")
DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LETTERS = re.compile(r"[^\W\d_]")


def spoken_clip(text: str, code: str) -> bytes:
    from google.cloud import texttospeech

    response = texttospeech.TextToSpeechClient().synthesize_speech(
        input=texttospeech.SynthesisInput(text=text),
        voice=texttospeech.VoiceSelectionParams(language_code=code),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16, sample_rate_hertz=16000
        ),
    )
    return response.audio_content[44:]  # drop the WAV header: raw PCM16 like the app sends


async def live_turn(
    runtime: CoachRuntime, principal: Principal, *, audio: bytes = b"", text: str = ""
) -> tuple[str, str]:
    """One voice session: what the model heard and what it said (transcripts)."""
    language = reply_language(os.getenv("SMOKE_LANGUAGE", "hi"))
    ui_language.set(language.locale)
    sid = await runtime.session(principal, None, None)
    queue = LiveRequestQueue()
    if audio:
        for start in range(0, len(audio), 3200):  # 100 ms frames
            queue.send_realtime(
                types.Blob(data=audio[start : start + 3200], mime_type="audio/pcm;rate=16000")
            )
        queue.send_realtime(types.Blob(data=b"\0" * 32000, mime_type="audio/pcm;rate=16000"))
        queue.send_audio_stream_end()
    else:
        queue.send_content(types.Content(role="user", parts=[types.Part(text=text)]))
    heard, said, said_final = "", "", ""
    events = runtime.live_runner.run_live(
        user_id=principal.uid,
        session_id=sid,
        live_request_queue=queue,
        run_config=live_run_config(runtime.settings, language, new_shop=False),
    )
    try:
        async with asyncio.timeout(90):
            async for event in events:
                if event.error_code:
                    raise RuntimeError(f"Live error {event.error_code}: {event.error_message}")
                if event.input_transcription and event.input_transcription.text:
                    heard += event.input_transcription.text
                spoken = event.output_transcription
                if spoken and spoken.text:
                    if spoken.finished:
                        said_final = spoken.text
                    else:
                        said += spoken.text
                if event.turn_complete and (said or said_final):
                    break
    finally:
        queue.close()
        await events.aclose()
    return heard.strip(), (said_final or said).strip()


def check(name: str, reply: str) -> bool:
    letters = LETTERS.findall(reply)
    share = sum(bool(DEVANAGARI.match(c)) for c in letters) / max(len(letters), 1)
    bhojpuri = BHOJPURI.findall(reply)
    ok = bool(reply) and share >= 0.8 and not bhojpuri
    print(f"{name}: {'PASS' if ok else 'FAIL'} devanagari={share:.0%} bhojpuri={bhojpuri}")
    return ok


async def main() -> int:
    settings = Settings(
        _env_file=None,
        app_env="test",
        v1_enabled=True,
        coach_mode="gemini",
        gemini_backend="vertex",
        google_cloud_project=os.environ["GOOGLE_CLOUD_PROJECT"],
        google_text_model=os.getenv("SMOKE_TEXT_MODEL", "gemini-3.5-flash"),
        google_live_model=os.getenv("SMOKE_LIVE_MODEL", "gemini-3.8-live"),
        google_live_location=os.getenv("SMOKE_LIVE_LOCATION", "us-central1"),
    )
    runtime = CoachRuntime(settings, InMemorySessionService())
    principal = Principal(uid="voice-language-smoke", source="local")
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
        store = MerchantStore(str(Path(folder) / "smoke.sqlite3"))
        current.set(MerchantContext(store, principal.uid, None, []))
        results = []
        code = reply_language(os.getenv("SMOKE_LANGUAGE", "hi")).code
        heard, said = await live_turn(runtime, principal, audio=spoken_clip(SPOKEN, code))
        print(f"[spoken] heard: {heard}\n[spoken] reply: {said}")
        results.append(check("spoken Hindi clip", said))
        heard, said = await live_turn(runtime, principal, text=TYPED)
        print(f"[typed] sent:  {TYPED}\n[typed] reply: {said}")
        results.append(check("Bhojpuri-flavoured turn", said))
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
