"""DEMO PURPOSE ONLY: a shared, on-disk copy of Google Maps answers for the hackathon demo.

Owner decision (17 Oct 2026): once one customer has looked at an area, every later customer in
that area gets the stored answer and Google is not called again, so the demo stays inside a
small budget. Google Maps Platform terms allow long-term storage of place IDs only; storing
names, ratings, coordinates and photos is NOT allowed for a real product. So this cache:

- is off unless PLACES_DEMO_CACHE=true,
- stops serving and deletes itself after PLACES_DEMO_CACHE_UNTIL (end of judging),
- can be wiped at any time: `uv run python -m app.places_demo_cache purge`.

Remove it (or leave it off) before this becomes a real product. A daily call cap
(PLACES_DAILY_CAP) guards the budget whether or not the cache is on.
"""

import hashlib
import json
import shutil
import sys
import tempfile
import threading
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any


def default_dir() -> Path:
    return Path(tempfile.gettempdir()) / "chalkboard-places-demo-cache"


class PlacesDemoCache:
    def __init__(self, enabled: bool, directory: str = "", until: date | None = None):
        self.directory = Path(directory) if directory else default_dir()
        self.until = until
        self.enabled = enabled
        self.lock = threading.Lock()
        if self.enabled and self.expired():
            purge(self.directory)
            self.enabled = False

    def expired(self) -> bool:
        return self.until is not None and datetime.now(UTC).date() > self.until

    def active(self) -> bool:
        if self.enabled and self.expired():
            purge(self.directory)
            self.enabled = False
        return self.enabled

    def _path(self, kind: str, key: Any) -> Path:
        digest = hashlib.sha256(json.dumps(key, default=str).encode()).hexdigest()[:32]
        return self.directory / kind / digest

    def get(self, key: tuple[Any, ...]) -> Any | None:
        """The stored answer for this lookup, or None (never stored, or the cache is off)."""
        if not self.active():
            return None
        path = self._path("answers", key).with_suffix(".json")
        try:
            return json.loads(path.read_text(encoding="utf-8"))["value"]
        except (OSError, ValueError, KeyError):
            return None

    def put(self, key: tuple[Any, ...], value: Any) -> None:
        if not self.active() or value is None:
            return
        path = self._path("answers", key).with_suffix(".json")
        with self.lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"key": key, "value": value}, default=str), "utf-8")
            tmp.replace(path)

    def get_photo(self, name: str, width: int) -> tuple[bytes, str] | None:
        if not self.active():
            return None
        path = self._path("photos", [name, width])
        try:
            media_type = path.with_suffix(".type").read_text(encoding="ascii").strip()
            return path.with_suffix(".bin").read_bytes(), media_type
        except OSError:
            return None

    def put_photo(self, name: str, width: int, body: bytes, media_type: str) -> None:
        if not self.active():
            return
        path = self._path("photos", [name, width])
        with self.lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.with_suffix(".bin").write_bytes(body)
            path.with_suffix(".type").write_text(media_type, encoding="ascii")


class DailyCap:
    """At most `limit` paid Google Maps calls per UTC day on this instance; then the app falls
    back to our own shops (the same honest path as when Google is unavailable)."""

    def __init__(self, limit: int):
        self.limit = limit
        self.day = ""
        self.count = 0
        self.lock = threading.Lock()

    def take(self) -> bool:
        with self.lock:
            today = datetime.now(UTC).date().isoformat()
            if today != self.day:
                self.day, self.count = today, 0
            if self.count >= self.limit:
                return False
            self.count += 1
            return True


def purge(directory: Path | None = None) -> None:
    shutil.rmtree(directory or default_dir(), ignore_errors=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["purge"]:
        from .settings import Settings

        configured = Settings().places_demo_cache_dir
        target = Path(configured) if configured else default_dir()
        purge(target)
        print(f"Purged {target}")
    else:
        print("usage: python -m app.places_demo_cache purge")
