from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CoachTurn(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    # BCP 47 tag of the owner's UI language (e.g. en, hi, es-MX, pt-BR). The coach still replies
    # in whatever language the owner actually writes in.
    language: str = Field(default="en", pattern=r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$")
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    session_id: UUID | None = None
    business_id: UUID | None = None

    @field_validator("message")
    @classmethod
    def require_content(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Add a message before sending.")
        return cleaned


class VoiceControl(StrictModel):
    # client_error: the app reports why it gave up (mic blocked, audio failed), so the
    # failure is visible in server logs instead of a silent "Voice connection ended".
    kind: Literal["text", "audio_end", "close", "ping", "pong", "client_error"]
    text: str = Field(default="", max_length=2000)


class BusinessProposal(StrictModel):
    name: str = Field(min_length=1, max_length=180)
    category: str = Field(min_length=1, max_length=180)
    location: str = Field(min_length=1, max_length=180)


class StreamEvent(StrictModel):
    kind: Literal[
        "ready",
        "delta",
        "reply",
        "turn_complete",
        "error",
        "interrupted",
        "input_transcript",
        "output_transcript",
        "audio_format",
        "pong",
        "ping",
        "proposal",
        "workflow",
    ]
    session_id: str | None = None
    text: str | None = None
    code: str | None = None
    mode: Literal["offline", "gemini"] | None = None
    sample_rate: int | None = None
    data: dict[str, object] | None = None

    def payload(self) -> dict[str, object]:
        return self.model_dump(exclude_none=True)
