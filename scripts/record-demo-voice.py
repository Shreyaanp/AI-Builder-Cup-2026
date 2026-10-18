"""Record the demo tour's fixed lines once, with the voice the signed-in app speaks in.

The public demo is read-only, so it cannot call the live /tts route. Instead each fixed tour line
is pre-recorded with the same Google Cloud TTS voice (Chirp 3 HD "Achernar", picked by the
backend's own best_voice) and saved as a small mono mp3 under public/audio/demo/<lang>/<key>.mp3.

Run from the repo root with the backend environment and gcloud application-default credentials
(gcloud auth application-default login):

    backend/.venv/Scripts/python scripts/record-demo-voice.py [--force]

Safe to re-run: a line is only re-recorded when its text changed (or with --force).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.tts import LOCALE_LANGUAGE, best_voice  # noqa: E402

PROJECT = "ichiropractic"
VOICE = "Achernar"
OUT = ROOT / "public" / "audio" / "demo"
MANIFEST = OUT / "manifest.json"
MAX_BYTES = 60_000


def read_lines() -> dict[str, list[dict[str, str]]]:
    node = shutil.which("node")
    if not node:
        sys.exit("node is required to read the tour lines")
    result = subprocess.run(
        [node, str(ROOT / "scripts" / "demo-lines.mjs")],
        cwd=ROOT,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout.decode("utf-8"))


def shrink(raw: bytes, bitrate: str) -> bytes:
    """Mono 24 kHz mp3: speech stays clear and each line stays well under the size cap."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("ffmpeg is required to encode the recordings")
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp, "in.mp3"), Path(tmp, "out.mp3")
        src.write_bytes(raw)
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "24000",
             "-b:a", bitrate, "-map_metadata", "-1", str(dst)],
            check=True,
        )
        return dst.read_bytes()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--force", action="store_true", help="re-record every line")
    force = parser.parse_args().force

    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", PROJECT)
    from google.api_core.client_options import ClientOptions
    from google.cloud import texttospeech

    client = texttospeech.TextToSpeechClient(client_options=ClientOptions(quota_project_id=PROJECT))
    voices = [
        (v.name, list(v.language_codes), v.ssml_gender.name)
        for v in client.list_voices().voices
    ]
    manifest = json.loads(MANIFEST.read_text("utf-8")) if MANIFEST.exists() else {}

    for locale, lines in read_lines().items():
        language = LOCALE_LANGUAGE[locale]
        name = best_voice(voices, language, VOICE)
        print(f"{locale}: voice {name}")
        for line in lines:
            ident = f"{locale}/{line['key']}"
            target = OUT / locale / f"{line['key']}.mp3"
            digest = hashlib.sha256(f"{name}|{line['text']}".encode()).hexdigest()[:16]
            if not force and target.exists() and manifest.get(ident) == digest:
                print(f"  {ident}: up to date")
                continue
            response = client.synthesize_speech(
                input=texttospeech.SynthesisInput(text=line["text"]),
                voice=texttospeech.VoiceSelectionParams(language_code=language, name=name or ""),
                audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3),
            )
            audio = shrink(bytes(response.audio_content), "32k")
            if len(audio) > MAX_BYTES:
                audio = shrink(bytes(response.audio_content), "24k")
            if len(audio) > MAX_BYTES:
                sys.exit(f"{ident} is {len(audio)} bytes; shorten the line (cap {MAX_BYTES})")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(audio)
            manifest[ident] = digest
            print(f"  {ident}: {len(audio)} bytes")

    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n", "utf-8")


if __name__ == "__main__":
    main()
