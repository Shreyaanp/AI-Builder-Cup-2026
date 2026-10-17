"""Live check (paid, not CI): Hindi new-shop onboardings over the app's own voice socket.

Runs the real app (uvicorn, in this process) with the Gemini Live coach and plays an owner through
`/api/v1/voice?new_shop=true&lang=hi` exactly like the phone does: the opening line, typed turns,
one spoken clip (Cloud Text-to-Speech, 16 kHz PCM paced in real time like the microphone), the
GPS pin and the photo as the app's own draft frames and notes. Optionally the socket is killed
mid-onboarding and the app reconnects with the same session_id (resume).

Per conversation it checks: no drop (the socket never closes on its own and no error event), no
repeated question (the coach never asks for a field the draft already has or the owner skipped),
no menu/price question, the shop live (public) once name + kind + place are known, and the time
from each owner turn to the coach's first audio.

  GOOGLE_CLOUD_PROJECT=... uv run python -m scripts.onboarding_live_check [--runs 1-5] [--out f]
Uses the caller's gcloud application-default credentials. SMOKE_LIVE_MODEL (gemini-3.8-live),
SMOKE_LIVE_LOCATION (us-central1).
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import re
import socket
import statistics
import sys
import tempfile
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import httpx
import uvicorn
import websockets
from google.adk.sessions import InMemorySessionService

from app.auth import COOKIE
from app.main import create_app
from app.settings import Settings

ORIGIN = "http://127.0.0.1:3200"
START = "नमस्ते! मैं एक नई दुकान खोलना चाहता हूँ।"
PHOTO_SKIPPED = "दुकान की फ़ोटो मैं बाद में जोड़ूँगा। अगली बात पूछिए।"
TURN_SECONDS = 45
QUIET_SECONDS = 3.0

# What a coach question is about (Hindi first, English and Hinglish too).
ASKS: dict[str, re.Pattern[str]] = {
    "name": re.compile(r"नाम|name|कहलाती|क्या कहते", re.I),
    "category": re.compile(
        r"क्या बेच|क्या मिलता|क्या बिकता|किस (?:चीज़|चीज|तरह)|कैसी दुकान|किस प्रकार|"
        r"क्या काम|sell|kya bech",
        re.I,
    ),
    # Not every "जगह": "बैठने की जगह" (seating) is no question about the place.
    "location": re.compile(
        r"कहाँ|कहां|पता|लोकेशन|किस जगह|कौन सी जगह|दुकान पर (?:ही )?(?:मौजूद )?(?:हैं|हो)|"
        r"where|location",
        re.I,
    ),
    "hours": re.compile(r"कब (?:से|तक)?\s*खुल|कितने बजे|खुलने|बंद होती|समय|घंटे|टाइम|hours|timing", re.I),
    "photo": re.compile(r"फ़ोटो|फोटो|तस्वीर|photo", re.I),
}
MENU = re.compile(
    r"मेन्यू|मेनू|मेन्यु|दाम|कीमत|रेट|कितने (?:का|की|के)|menu|price|भुगतान|पेमेंट|"
    r"डिलीवरी|हलाल|payment|delivery|halal",
    re.I,
)


@dataclass
class Turn:
    kind: str  # text | audio | pin | photo | drop
    text: str = ""
    lat: float = 0.0
    lng: float = 0.0


@dataclass
class Result:
    name: str
    turns: list[dict[str, Any]] = field(default_factory=list)
    drops: list[str] = field(default_factory=list)
    repeats: list[str] = field(default_factory=list)
    menu: list[str] = field(default_factory=list)
    first_audio_ms: list[float] = field(default_factory=list)
    spoken_first_audio_ms: list[float] = field(default_factory=list)
    live_after: str = ""
    live_ok: bool = False
    public: bool = False
    rotations: int = 0
    ended: bool = False
    draft: dict[str, Any] = field(default_factory=dict)

    def ok(self) -> bool:
        return not self.drops and not self.repeats and not self.menu and self.live_ok


def t(text: str) -> Turn:
    return Turn("text", text)


# Ten onboardings: one sentence with everything, piece by piece, a correction, "pata nahi",
# "baad mein", the GPS pin, a photo, Hinglish, and one long conversation (16 owner turns).
CONVERSATIONS: list[tuple[str, list[Turn]]] = [
    (
        "one sentence, hours skipped, photo later",
        [
            t("लक्ष्मी टी स्टॉल, चाय और समोसा, इंदिरानगर मेट्रो के पास।"),
            Turn("audio", "पता नहीं, अभी तय नहीं है।"),
            t("बाद में।"),
        ],
    ),
    (
        "piece by piece, GPS pin, hours per day",
        [
            t("मेरी दुकान का नाम शर्मा स्वीट्स है।"),
            t("हम मिठाई और नमकीन बेचते हैं।"),
            t("हाँ, मैं अभी दुकान पर ही हूँ।"),
            Turn("pin", "लाजपत नगर के पास", 28.5677, 77.2433),
            Turn("audio", "सुबह आठ बजे से रात दस बजे तक, सोमवार बंद।"),
            Turn("photo", "शर्मा स्वीट्स"),
        ],
    ),
    (
        "a correction replaces the name",
        [
            t("गुप्ता किराना, राशन का सामान, करोल बाग में।"),
            t("नहीं, नाम गुप्ता जनरल स्टोर है।"),
            Turn("audio", "सुबह सात से रात नौ बजे तक।"),
            t(PHOTO_SKIPPED),
        ],
    ),
    (
        "Hinglish owner, answer stays Hindi",
        [
            t("Hello, mera shop ka naam Patel Mobile Repair hai."),
            t("Hum mobile repair aur accessories bechte hain, Andheri station ke paas."),
            Turn("audio", "सुबह दस से रात आठ बजे तक।"),
            t("baad mein"),
        ],
    ),
    (
        "kind first, then the name",
        [
            t("मैं सब्ज़ी और फल बेचता हूँ, मालवीय नगर मार्केट में।"),
            t("दुकान का नाम हरी भरी सब्ज़ी है।"),
            Turn("audio", "पता नहीं।"),
            t("बाद में।"),
        ],
    ),
    (
        "GPS pin first, everything else after",
        [
            t("हाँ, मैं अभी दुकान पर हूँ।"),
            Turn("pin", "कोरमंगला के पास", 12.9352, 77.6245),
            t("नाम है कावेरी टिफ़िन सेंटर, इडली डोसा और फ़िल्टर कॉफ़ी।"),
            Turn("audio", "सुबह छह से दोपहर दो बजे तक, रविवार बंद।"),
            Turn("photo", "कावेरी टिफ़िन सेंटर"),
        ],
    ),
    (
        "a tailor, hours by voice",
        [
            t("मेरा काम सिलाई का है, दुकान का नाम रानी टेलर्स।"),
            t("सदर बाज़ार, गली नंबर चार में।"),
            Turn("audio", "सुबह ग्यारह से शाम सात बजे तक।"),
            t("बाद में।"),
        ],
    ),
    (
        "the owner asks a question in between",
        [
            t("नाम है बाबा चाट भंडार।"),
            t("यह ऑनलाइन दिखने में कितना समय लगेगा?"),
            t("चाट, गोलगप्पे और टिक्की, चांदनी चौक में।"),
            Turn("audio", "शाम चार से रात दस बजे तक।"),
            t("बाद में।"),
        ],
    ),
    (
        "a pharmacy, everything skipped that can be",
        [
            t("जनता मेडिकल स्टोर, दवाइयाँ, सेक्टर पंद्रह नोएडा।"),
            Turn("audio", "पता नहीं।"),
            t("बाद में।"),
        ],
    ),
    (
        "a long conversation (16 owner turns)",
        [
            t("नमस्ते जी।"),
            t("मेरी एक छोटी सी चाय की दुकान है।"),
            t("नाम? अम्मा की चाय।"),
            t("रुकिए, नाम अम्मा टी पॉइंट रखिए।"),
            t("हम चाय, बिस्कुट और मैगी बेचते हैं।"),
            t("यह सब फ्री है ना?"),
            t("ठीक है।"),
            t("दुकान जयनगर फोर्थ ब्लॉक में है।"),
            t("बस स्टॉप के बिल्कुल सामने।"),
            Turn("audio", "सुबह पाँच बजे से।"),
            t("रात ग्यारह बजे तक, हर दिन।"),
            t("अच्छा।"),
            t("फ़ोटो बाद में भेजूँगा।"),
            t("और कुछ चाहिए?"),
            t("धन्यवाद।"),
            t("ठीक है, बाद में बात करते हैं।"),
        ],
    ),
    (
        "the socket drops mid-onboarding and the app reconnects (resume)",
        [
            t("सिंह हार्डवेयर, बिजली और प्लंबिंग का सामान, राजौरी गार्डन में।"),
            Turn("drop"),
            t("सुबह नौ से रात आठ बजे तक।"),
            t("बाद में।"),
        ],
    ),
]


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def spoken_clip(text: str) -> bytes:
    from google.cloud import texttospeech

    response = texttospeech.TextToSpeechClient().synthesize_speech(
        input=texttospeech.SynthesisInput(text=text),
        voice=texttospeech.VoiceSelectionParams(language_code="hi-IN"),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16, sample_rate_hertz=16000
        ),
    )
    return response.audio_content[44:]  # raw PCM16, like the app's microphone


def questions(reply: str) -> list[str]:
    """The question sentences of a reply (what the coach asked this turn)."""
    parts = re.split(r"(?<=[?।!.])\s+", reply)
    return [part for part in parts if "?" in part]


def asked_fields(reply: str) -> set[str]:
    return {key for q in questions(reply) for key, pattern in ASKS.items() if pattern.search(q)}


def filled(draft: dict[str, Any]) -> set[str]:
    business = draft.get("business") or {}
    done = {key for key in ("name", "category") if (business.get(key) or "").strip()}
    if (business.get("location") or "").strip() or business.get("lat") is not None:
        done.add("location")
    if (business.get("hours") or "").strip() or business.get("weekly_hours"):
        done.add("hours")
    if draft.get("photo"):
        done.add("photo")
    return done | set(draft.get("skipped") or [])


def merge(current: str, piece: str) -> str:
    """The app's mergeTranscript: a final transcript repeats the partial ones."""
    if not current.strip() or piece.strip().startswith(current.strip()):
        return piece
    if current.strip().endswith(piece.strip()):
        return current
    return current + piece


class Owner:
    """One owner's phone: its cookie, its socket, an open microphone (room silence, or the
    owner's words while speaking) and the shop card (the draft) it shows."""

    def __init__(self, base: str, result: Result) -> None:
        self.base = base
        self.http = httpx.Client(base_url=base, timeout=30)
        self.http.get("/api/v1/bootstrap")
        version = self.http.get("/api/v1/me").json()["legal_version"]
        self.http.post("/api/v1/consent", json={"version": version, "terms": True, "privacy": True})
        self.result = result
        self.draft: dict[str, Any] = {"business": None, "products": []}
        self.session: str | None = None
        self.ws: Any = None
        self.expected_close = False
        self.sending = asyncio.Lock()
        self.speech: list[bytes] = []
        self.speech_end = 0.0
        self.mic_task: asyncio.Task[None] | None = None

    async def connect(self) -> None:
        url = self.base.replace("http", "ws") + "/api/v1/voice?new_shop=true&lang=hi"
        if self.session:
            url += f"&session_id={self.session}"
        cookie = self.http.cookies.get(COOKIE)
        self.ws = await websockets.connect(
            url,
            origin=ORIGIN,  # type: ignore[arg-type]
            additional_headers={"Cookie": f"{COOKIE}={cookie}"},
            max_size=None,
        )
        await self.ws.send(json.dumps({"kind": "new_shop", "draft": self.draft}))
        while True:
            event = json.loads(await asyncio.wait_for(self.ws.recv(), 20))
            if event["kind"] == "error":
                raise RuntimeError(f"socket refused: {event}")
            self.take(event)
            if event["kind"] == "ready":
                self.session = event.get("session_id") or self.session
                break
        self.mic_task = asyncio.create_task(self.mic())

    async def disconnect(self, code: int = 1000, reason: str = "") -> None:
        self.expected_close = True
        if self.mic_task:
            self.mic_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self.mic_task
        await self.ws.close(code=code, reason=reason)
        self.expected_close = False

    async def send(self, frame: str | bytes) -> None:
        async with self.sending:
            await self.ws.send(frame)

    async def mic(self) -> None:
        """The open microphone, 100 ms frames in real time: the owner's words when speaking,
        room silence otherwise (the phone never stops streaming in a conversation)."""
        silence = b"\0" * 3200
        while True:
            frame = self.speech.pop(0) if self.speech else silence
            if frame is not silence and not self.speech:
                self.speech_end = time.monotonic() + 0.1
            with contextlib.suppress(websockets.ConnectionClosed):
                await self.send(frame)
            await asyncio.sleep(0.1)

    def take(self, event: dict[str, Any]) -> None:
        if event["kind"] == "draft" and event.get("data"):
            server = event["data"]
            mine = self.draft.get("business") or {}
            theirs = server.get("business") or {}
            merged = {**mine, **{k: v for k, v in theirs.items() if v not in (None, "", [])}}
            self.draft = {**self.draft, **server, "business": merged or None}

    async def turn(self, frames: list[str], spoken: bytes = b"") -> dict[str, Any]:
        """One owner turn; reads until the coach has answered it. A tool call can end its own
        model turn before the spoken answer, so a turn without any speech yet waits on."""
        said, events, started = "", [], time.monotonic()
        first_audio: float | None = None
        spoke = False
        self.speech_end = 0.0
        if spoken:
            self.speech = [spoken[i : i + 3200] for i in range(0, len(spoken), 3200)]
        for frame in frames:
            await self.send(frame)
        deadline = time.monotonic() + TURN_SECONDS
        try:
            while True:
                left = deadline - time.monotonic()
                if left <= 0:
                    if not spoke:
                        self.result.drops.append(f"no answer within {TURN_SECONDS}s")
                    break
                try:
                    # Once the coach has spoken, the turn is over when it goes quiet: a tool
                    # step's turn_complete can come mid-speech and the last one late, so neither
                    # ends the turn (the rest would be read as the next turn's answer).
                    wait = min(left, QUIET_SECONDS) if spoke else left
                    message = await asyncio.wait_for(self.ws.recv(), wait)
                except TimeoutError:
                    if not spoke:
                        self.result.drops.append(f"no answer within {TURN_SECONDS}s")
                    break
                if spoke:
                    # A long spoken reply is still this turn while it keeps coming.
                    deadline = max(deadline, time.monotonic() + QUIET_SECONDS)
                if isinstance(message, bytes):
                    # The coach's voice; while the owner still speaks it is the previous turn.
                    if first_audio is None and (not spoken or self.speech_end):
                        first_audio = time.monotonic()
                    spoke = True
                    continue
                event = json.loads(message)
                events.append(event["kind"])
                if event["kind"] == "error":
                    self.result.drops.append(f"error event {event.get('code')}")
                    break
                if event["kind"] == "output_transcript":
                    said = merge(said, event.get("text") or "")
                    spoke = True
                self.take(event)
                if event["kind"] == "turn_complete" and not spoke:
                    # A tool turn: the spoken answer follows (give it a short while).
                    deadline = min(deadline, time.monotonic() + 15)
        except websockets.ConnectionClosed as closed:
            if closed.rcvd and closed.rcvd.reason == "ENDED":
                # The owner asked to stop ("baad mein baat karte hain"): a goodbye, not a drop.
                self.result.ended = True
            elif not self.expected_close:
                self.result.drops.append(f"socket closed: {closed.rcvd}")
        if first_audio is not None:
            if spoken:
                self.result.spoken_first_audio_ms.append((first_audio - self.speech_end) * 1000)
            else:
                self.result.first_audio_ms.append((first_audio - started) * 1000)
        return {"said": said.strip(), "events": events}


async def run(base: str, name: str, turns: list[Turn]) -> Result:
    result = Result(name)
    owner = Owner(base, result)
    await owner.connect()
    log: list[dict[str, Any]] = []

    async def say(frames: list[str], shown: str, spoken: bytes = b"") -> None:
        before = filled(owner.draft)
        outcome = await owner.turn(frames, spoken)
        reply = outcome["said"]
        asked = asked_fields(reply)
        now = filled(owner.draft)
        # A question about something the card already showed BEFORE this turn is a repeat.
        repeated = sorted(asked & before)
        if repeated:
            result.repeats.append(f"{shown!r} -> asked again {repeated}: {reply}")
        # The same question word for word right after the owner answered it (the owner hears it
        # twice). Asking again what is still open (after a correction, a pin) is fine.
        previous = [row["coach"] for row in log if row["coach"]][-1:]
        same = set(questions(reply)) & set(questions(previous[0])) if previous else set()
        about = asked_fields(" ".join(same))
        if same and (about & now or not about):
            result.repeats.append(f"{shown!r} -> the same question again: {reply}")
        # The same question twice in one reply ("…फोटो खींच सकते हैं?आप … फोटो खींच सकते हैं?").
        parts = [p.strip() for p in re.split(r"[?？]", reply) if len(p.strip()) > 12]
        if any(a.endswith(b) or b.endswith(a) for i, a in enumerate(parts) for b in parts[i + 1 :]):
            result.repeats.append(f"{shown!r} -> asked twice in one reply: {reply}")
        if MENU.search(" ".join(questions(reply))):
            result.menu.append(reply)
        live = bool(owner.draft.get("live_id"))
        if live and not result.live_after:
            result.live_after = ",".join(sorted(now & {"name", "category", "location"}))
        log.append({"owner": shown, "coach": reply, "asked": sorted(asked), "live": live})
        print(f"    owner: {shown}\n    coach: {reply}\n    events: {outcome['events'][:40]}")

    await say([json.dumps({"kind": "text", "text": START})], START)
    for step in turns:
        if result.ended:
            break
        if step.kind == "drop":
            await owner.disconnect(4000, "Connection interrupted")
            await asyncio.sleep(1)
            await owner.connect()  # the same session_id: it must continue, silently
            log.append({"owner": "(network drop, reconnect)", "coach": "", "asked": []})
            continue
        if step.kind == "text":
            await say([json.dumps({"kind": "text", "text": step.text})], step.text)
        elif step.kind == "audio":
            await say([], f"(spoken) {step.text}", spoken_clip(step.text))
        elif step.kind == "pin":
            business = owner.draft.get("business") or {
                "name": "",
                "category": "",
                "location": "",
                "hours": "",
                "phone": "",
            }
            business = {**business, "lat": step.lat, "lng": step.lng, "pin_source": "device"}
            owner.draft = {**owner.draft, "business": business}
            note = f"मैंने अपनी जगह साझा की: {step.text}। अगला सवाल पूछिए।"
            frames: list[str] = [
                json.dumps({"kind": "new_shop", "draft": owner.draft}),
                json.dumps({"kind": "text", "text": note}),
            ]
            await say(frames, f"(GPS pin) {note}")
        elif step.kind == "photo":
            owner.draft = {**owner.draft, "photo": True}
            note = f"मैंने एक फ़ोटो जोड़ी। आपने पढ़ा: {step.text}। अगला सवाल पूछिए।"
            frames = [
                json.dumps({"kind": "new_shop", "draft": owner.draft}),
                json.dumps({"kind": "text", "text": note}),
            ]
            await say(frames, f"(photo) {note}")
    with_place = {"name", "category", "location"} <= filled(owner.draft)
    result.live_ok = with_place == bool(owner.draft.get("live_id"))
    shops = owner.http.get("/api/v1/businesses").json()
    result.public = bool(shops and shops[0].get("public"))
    result.live_ok = result.live_ok and (result.public or not with_place) and len(shops) <= 1
    result.draft = owner.draft
    result.turns = log
    await owner.disconnect()
    owner.http.close()
    return result


def report(results: list[Result]) -> str:
    lines = ["# Onboarding v2 live check (Hindi, gemini Live, voice socket)", ""]
    text_ms = [ms for r in results for ms in r.first_audio_ms]
    spoken_ms = [ms for r in results for ms in r.spoken_first_audio_ms]
    passed = sum(r.ok() for r in results)
    lines.append(f"Conversations: {len(results)}, passed: {passed}")
    lines.append(f"Drops: {sum(len(r.drops) for r in results)}")
    lines.append(f"Repeated questions: {sum(len(r.repeats) for r in results)}")
    lines.append(f"Menu/price/payment questions: {sum(len(r.menu) for r in results)}")
    if text_ms:
        lines.append(
            f"First audio after a typed turn: p50 {statistics.median(text_ms):.0f} ms, "
            f"max {max(text_ms):.0f} ms (n={len(text_ms)})"
        )
    if spoken_ms:
        lines.append(
            f"First audio after the owner stops speaking: p50 {statistics.median(spoken_ms):.0f}"
            f" ms, max {max(spoken_ms):.0f} ms (n={len(spoken_ms)})"
        )
    for r in results:
        lines += ["", f"## {r.name}: {'PASS' if r.ok() else 'FAIL'}"]
        lines.append(
            f"live after: {r.live_after or '-'}; public: {r.public}; drops: {r.drops or 'none'}"
            + ("; ended by the owner" if r.ended else "")
        )
        for item in r.repeats + r.menu:
            lines.append(f"- problem: {item}")
        business = (r.draft.get("business") or {}) if r.draft else {}
        lines.append(
            "draft: "
            + json.dumps(
                {
                    k: business.get(k)
                    for k in ("name", "category", "location", "hours", "lat", "lng")
                }
                | {"weekly_hours": business.get("weekly_hours")}
                | {"skipped": r.draft.get("skipped"), "photo": r.draft.get("photo")},
                ensure_ascii=False,
            )
        )
        for row in r.turns:
            lines.append(f"- owner: {row['owner']}")
            if row["coach"]:
                lines.append(f"  coach: {row['coach']}")
    return "\n".join(lines) + "\n"


def pick(spec: str) -> list[int]:
    chosen: list[int] = []
    for part in spec.split(","):
        low, _, high = part.partition("-")
        chosen += list(range(int(low), int(high or low) + 1))
    return chosen


async def check(port: int, chosen: list[int]) -> list[Result]:
    results = []
    for index in chosen:
        name, turns = CONVERSATIONS[index - 1]
        print(f"--- {index}. {name}", flush=True)
        try:
            result = await run(f"http://127.0.0.1:{port}", f"{index}. {name}", turns)
        except Exception as error:  # a failed run is a result, not a crash
            result = Result(f"{index}. {name}", drops=[f"run failed: {error!r}"])
        print(
            f"    {'PASS' if result.ok() else 'FAIL'} drops={result.drops} "
            f"repeats={len(result.repeats)} menu={len(result.menu)} "
            f"live_after={result.live_after} first_audio={result.first_audio_ms} "
            f"spoken={result.spoken_first_audio_ms}",
            flush=True,
        )
        results.append(result)
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", default=f"1-{len(CONVERSATIONS)}")
    parser.add_argument("--out", default="")
    parser.add_argument("--json", default="", help="also save the results (for --report)")
    parser.add_argument("--report", nargs="*", help="merge saved results into one report")
    args = parser.parse_args()
    if args.report:
        merged = [
            Result(**item)
            for path in args.report
            for item in json.loads(Path(path).read_text("utf-8"))
        ]
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        print(report(merged), end="")
        return 0
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
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
            auth_mode="local",
            session_backend="sqlite",
            merchant_backend="sqlite",
            moderation_mode="fixture",
            media_bucket="",
            merchant_database=str(Path(folder) / "merchant.sqlite3"),
            recall_path=str(Path(folder) / "recall"),
        )
        port = free_port()
        server = uvicorn.Server(
            uvicorn.Config(
                create_app(settings, InMemorySessionService()),
                host="127.0.0.1",
                port=port,
                log_level="warning",
            )
        )
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        while not server.started:
            time.sleep(0.1)
        try:
            results = asyncio.run(check(port, pick(args.runs)))
        finally:
            server.should_exit = True
            thread.join(10)
    text = report(results)
    if args.json:
        Path(args.json).write_text(
            json.dumps([asdict(r) for r in results], ensure_ascii=False, indent=1), "utf-8"
        )
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    print(text)
    return 0 if all(r.ok() for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
