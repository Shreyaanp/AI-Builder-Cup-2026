from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: Literal["local", "test", "production"] = "local"
    coach_mode: Literal["offline", "gemini"] = "offline"
    auth_mode: Literal["local", "firebase"] = "local"
    session_database_url: str = "sqlite+aiosqlite:///./data/sessions.sqlite3"
    session_signing_secret: SecretStr = SecretStr("")
    allowed_origins: list[str] = ["http://127.0.0.1:3200", "http://localhost:3200"]
    google_api_key: SecretStr = SecretStr("")
    google_text_model: str = ""
    google_live_model: str = ""
    google_cloud_project: str = ""
    max_turn_seconds: int = Field(default=30, ge=1, le=120)
    max_voice_seconds: int = Field(default=120, ge=1, le=600)
    max_active_runs: int = Field(default=8, ge=1, le=32)
    max_audio_bytes: int = Field(default=4_000_000, ge=32_768, le=20_000_000)

    @model_validator(mode="after")
    def reject_unsafe_configuration(self) -> "Settings":
        if self.coach_mode == "gemini" and not (
            self.google_api_key.get_secret_value()
            and self.google_text_model
            and self.google_live_model
        ):
            raise ValueError("Gemini mode requires a server key and explicit text/live model IDs.")
        if self.app_env == "production":
            if self.auth_mode != "firebase" or not self.google_cloud_project:
                raise ValueError("Production requires Firebase identity and an explicit project.")
            if "sqlite" in self.session_database_url or ":memory:" in self.session_database_url:
                raise ValueError("Production requires durable external session storage.")
            if len(self.session_signing_secret.get_secret_value()) < 32:
                raise ValueError(
                    "Production requires a stable signing secret of at least 32 chars."
                )
        return self
