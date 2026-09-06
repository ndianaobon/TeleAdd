from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolved relative to this file (not the process cwd) so `.env` at the repo root loads
# regardless of where uvicorn/celery is launched from. Docker still injects real env vars,
# which pydantic-settings prefers over the file either way.
_REPO_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ROOT_ENV, env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    app_name: str = "Telegram Member Migrator"
    api_prefix: str = "/api/v1"
    frontend_origin: str = "http://localhost:5173"

    database_url: str = "postgresql+asyncpg://tmm:tmm@localhost:5432/tmm"
    redis_url: str = "redis://localhost:6379/0"

    secret_key: SecretStr = Field(default=SecretStr("change-me-in-production"))
    session_encryption_key: SecretStr = Field(default=SecretStr(""), description="Fernet key for Telegram session encryption")
    access_token_ttl_minutes: int = 60 * 12
    cookie_secure: bool = False
    cookie_name: str = "tmm_session"

    telegram_api_id: int | None = None
    telegram_api_hash: SecretStr | None = None
    telegram_device_model: str = "Telegram Member Migrator"
    telegram_app_version: str = "1.0"

    invite_cooldown_seconds: int = 8
    max_flood_wait_seconds: int = 3600

    @field_validator("session_encryption_key", mode="before")
    @classmethod
    def _require_key_in_prod(cls, v, info):
        return v or ""

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production:
        if settings.secret_key.get_secret_value() == "change-me-in-production":
            raise RuntimeError("SECRET_KEY must be set in production")
        if not settings.session_encryption_key.get_secret_value():
            raise RuntimeError("SESSION_ENCRYPTION_KEY must be set in production")
    return settings
