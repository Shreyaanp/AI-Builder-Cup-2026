"""Live smoke: the voice coach answers a Malay owner in Malay. Paid, not CI (issue #77).

Malay has no Gemini Live speech language (PR #55), so the voice relies on the instruction alone.
Runs the app's own Live runner and run config against the real Live model, twice, each a new
voice session like a mic press (voice_language_smoke.live_turn):
  1. a spoken Malay clip (Cloud Text-to-Speech ms-MY, 16 kHz PCM like the app's microphone);
  2. a typed Malay turn.
The reply transcript must read as Malay: Malay function words, few English ones, and none of the
Indonesian forms (bisa, uang, karena, silakan) a model drifts into.

  GOOGLE_CLOUD_PROJECT=... uv run python -m scripts.malay_live_smoke
Uses the caller's gcloud application-default credentials.
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
import tempfile
from pathlib import Path

from google.adk.sessions import InMemorySessionService

from app.auth import Principal
from app.coordinator import MerchantContext, current
from app.merchant import MerchantStore
from app.settings import Settings
from app.streaming import CoachRuntime
from scripts.voice_language_smoke import live_turn, spoken_clip

SPOKEN = (
    "Selamat pagi. Saya ada kedai kopi di Tiong Bahru. Secawan kopi harganya satu dolar "
    "lapan puluh sen. Apa patut saya buat hari ini?"
)
TYPED = (
    "Kedai saya jual kopi dan roti bakar kaya. "
    "Bagaimana nak tarik lebih ramai pelanggan waktu petang?"
)
WORDS = re.compile(r"[a-z]+")
MALAY = {"yang", "dan", "untuk", "anda", "boleh", "ini", "itu", "dengan", "kedai", "lebih", "ada"}
ENGLISH = {"the", "and", "you", "your", "with", "for", "this", "that", "is", "are", "to"}
INDONESIAN = {"bisa", "uang", "karena", "silakan", "kamu", "nggak", "gimana", "banget"}


def check(name: str, reply: str) -> bool:
    words = WORDS.findall(reply.casefold())
    malay = sum(word in MALAY for word in words)
    english = sum(word in ENGLISH for word in words)
    indonesian = sorted({word for word in words if word in INDONESIAN})
    ok = bool(words) and malay >= 2 and english <= 1 and not indonesian
    print(
        f"{name}: {'PASS' if ok else 'FAIL'} malay={malay} english={english} "
        f"indonesian={indonesian}"
    )
    return ok


async def main() -> int:
    os.environ["SMOKE_LANGUAGE"] = "ms"
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
    principal = Principal(uid="malay-live-smoke", source="local")
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
        store = MerchantStore(str(Path(folder) / "smoke.sqlite3"))
        current.set(MerchantContext(store, principal.uid, None, []))
        results = []
        heard, said = await live_turn(runtime, principal, audio=spoken_clip(SPOKEN, "ms-MY"))
        print(f"[spoken] heard: {heard}\n[spoken] reply: {said}")
        results.append(check("spoken Malay clip", said))
        heard, said = await live_turn(runtime, principal, text=TYPED)
        print(f"[typed] sent:  {TYPED}\n[typed] reply: {said}")
        results.append(check("typed Malay turn", said))
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
