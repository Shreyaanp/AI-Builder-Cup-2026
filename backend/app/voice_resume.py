"""Live voice sends its context once (OB-181): the provider's session-resumption handle per
conversation, so the next mic press, a rotation or "talk again" resumes the provider's session
instead of sending the coach instruction and history again."""

import time
from dataclasses import dataclass

# A handle is used while this fresh; past it the conversation starts a fresh session.
RESUME_HANDLE_SECONDS = 600
RESUME_HANDLES_KEPT = 2_000


@dataclass
class ResumeHandle:
    handle: str
    language: str
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

    def get(self, uid: str, sid: str, language: str) -> str | None:
        item = self.items.get((uid, sid))
        if not item or item.expires < time.monotonic() or item.language != language:
            # A changed app language needs a fresh session (the language is pinned at setup).
            self.items.pop((uid, sid), None)
            return None
        return item.handle

    def put(self, uid: str, sid: str, language: str, handle: str) -> None:
        self.items.pop((uid, sid), None)
        self.items[(uid, sid)] = ResumeHandle(handle, language, time.monotonic() + self.seconds)
        while len(self.items) > self.kept:
            self.items.pop(next(iter(self.items)))

    def drop(self, uid: str, sid: str) -> None:
        self.items.pop((uid, sid), None)
