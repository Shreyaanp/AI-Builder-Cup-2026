import os
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: Literal["local", "test", "production"] = "local"
    coach_mode: Literal["offline", "gemini"] = "offline"
    auth_mode: Literal["local", "firebase"] = "local"
    session_database_url: str = "sqlite+aiosqlite:///./data/sessions.sqlite3"
    session_backend: Literal["sqlite", "firestore"] = "sqlite"
    firestore_database: str = "(default)"
    firestore_namespace: str = Field(default="ogoogle_ai_v1", pattern=r"^ogoogle_ai_[a-zA-Z0-9_]+$")
    frontend_dist: str = ""
    release_commit: str = "local"
    firebase_web_api_key: str = ""
    firebase_web_app_id: str = ""
    firebase_auth_domain: str = ""
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
        if self.session_backend == "firestore" and not self.google_cloud_project:
            raise ValueError("Firestore requires an explicit project.")
        if self.coach_mode == "gemini" and not (
            self.google_api_key.get_secret_value()
            and self.google_text_model
            and self.google_live_model
        ):
            raise ValueError("Gemini mode requires a server key and explicit text/live model IDs.")
        if self.app_env == "production":
            if self.auth_mode != "firebase" or not self.google_cloud_project:
                raise ValueError("Production requires Firebase identity and an explicit project.")
            if self.session_backend != "firestore":
                raise ValueError("Production requires the durable Firestore session adapter.")
            if not all(
                (self.firebase_web_api_key, self.firebase_web_app_id, self.firebase_auth_domain)
            ):
                raise ValueError("Production requires dedicated Firebase browser configuration.")
            if os.getenv("FIRESTORE_EMULATOR_HOST") or os.getenv("FIREBASE_AUTH_EMULATOR_HOST"):
                raise ValueError("Production cannot use local identity or database emulators.")
            if not self.allowed_origins or any(
                not url.startswith("https://") for url in self.allowed_origins
            ):
                raise ValueError("Production requires explicit HTTPS origins.")
        return self
