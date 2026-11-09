"""Live voice sends its context once (OB-181): the provider's session-resumption handle per
conversation, so the next mic press, a rotation or "talk again" resumes the provider's session
instead of sending the coach instruction and history again.

A resumed session knows only what happened inside earlier Live connections. So a handle is used
only while nothing else moved since it was saved: no typed turn on the text path (`changed`), no
draft sent by the app, and the same shop facts the coach instruction is built from (`facts`).
Anything else starts a fresh session with the instruction and history: never dearer than before.
"""

import hashlib
import time
from dataclasses import dataclass
from typing import Any

# A handle is used while this fresh; past it the conversation starts a fresh session.
RESUME_HANDLE_SECONDS = 600
RESUME_HANDLES_KEPT = 2_000


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


@dataclass
class ResumeHandle:
    handle: str
    language: str
    # Digest of the shop facts (snapshot, region, new-shop draft) when the handle was saved.
    facts: str
    expires: float


@dataclass
class Carried:
    text: str
    expires: float


class LiveHandles:
    """The provider's latest session-resumption handle per conversation (this instance only; a
    miss just starts a fresh session). Resuming sends neither the coach instruction nor the
    conversation history again: the provider still holds them."""

    def __init__(
        self, seconds: float = RESUME_HANDLE_SECONDS, kept: int = RESUME_HANDLES_KEPT
    ) -> None:
        self.seconds = seconds
        self.kept = kept
        self.items: dict[tuple[str, str], ResumeHandle] = {}
        # Bumped whenever the conversation moved outside Live (a typed turn, an app draft): a
        # handle from a connection that began before the bump is never saved.
        self.versions: dict[tuple[str, str], int] = {}
        # The owner's words a closed socket never answered: the next "talk again" hears them.
        self.carried: dict[tuple[str, str], Carried] = {}

    def _bounded(self, items: dict[tuple[str, str], Any]) -> None:
        while len(items) > self.kept:
            items.pop(next(iter(items)))

    def get(self, uid: str, sid: str, language: str, facts: str = "") -> str | None:
        item = self.items.get((uid, sid))
        if (
            not item
            or item.expires < time.monotonic()
            or item.language != language
            or item.facts != facts
        ):
            # A changed app language needs a fresh session (the language is pinned at setup);
            # changed shop facts need the instruction again.
            self.items.pop((uid, sid), None)
            return None
        return item.handle

    def version(self, uid: str, sid: str) -> int:
        return self.versions.get((uid, sid), 0)

    def put(
        self,
        uid: str,
        sid: str,
        language: str,
        handle: str,
        facts: str = "",
        since: int | None = None,
    ) -> bool:
        """Save the handle unless the conversation moved outside Live since `since`."""
        if since is not None and since != self.version(uid, sid):
            self.items.pop((uid, sid), None)
            return False
        self.items.pop((uid, sid), None)
        self.items[(uid, sid)] = ResumeHandle(
            handle, language, facts, time.monotonic() + self.seconds
        )
        self._bounded(self.items)
        return True

    def drop(self, uid: str, sid: str) -> None:
        self.items.pop((uid, sid), None)

    def changed(self, uid: str, sid: str) -> None:
        """The conversation moved outside Live (a typed turn, a draft from the app): the next
        connection starts fresh with the history, and spoken words left unanswered are dropped
        (the owner carried on by typing)."""
        key = (uid, sid)
        self.items.pop(key, None)
        self.carried.pop(key, None)
        self.versions[key] = self.versions.pop(key, 0) + 1
        self._bounded(self.versions)

    def carry(self, uid: str, sid: str, text: str) -> None:
        key = (uid, sid)
        self.carried.pop(key, None)
        self.carried[key] = Carried(text, time.monotonic() + self.seconds)
        self._bounded(self.carried)

    def take(self, uid: str, sid: str) -> str | None:
        item = self.carried.pop((uid, sid), None)
        return item.text if item and item.expires >= time.monotonic() else None


live_handles = LiveHandles()
