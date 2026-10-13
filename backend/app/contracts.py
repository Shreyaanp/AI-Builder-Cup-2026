from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CoachTurn(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    language: Literal["en", "hi"] = "en"
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
    kind: Literal["text", "audio_end", "close", "ping"]
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
