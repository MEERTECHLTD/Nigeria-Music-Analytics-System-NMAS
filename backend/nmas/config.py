from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = BASE_DIR / "data" / "nmas_delivery.db"
DEFAULT_EXPORT_ROOT = BASE_DIR / "data" / "exports"
DEFAULT_RAW_ROOT = BASE_DIR / "data" / "raw_payloads"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "NMAS NBS Delivery Platform"
    env: str = "development"
    debug: bool = True
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    database_url: str = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"
    export_root: str = DEFAULT_EXPORT_ROOT.as_posix()
    raw_payload_root: str = DEFAULT_RAW_ROOT.as_posix()

    chartmetric_base_url: str = "https://api.chartmetric.com"
    chartmetric_token_url: str = "https://api.chartmetric.com/api/token"
    chartmetric_auth_mode: str = "static"
    chartmetric_access_token: str | None = None
    chartmetric_refresh_token: str | None = None
    chartmetric_client_id: str | None = None
    chartmetric_client_secret: str | None = None
    chartmetric_timeout_seconds: int = 30
    chartmetric_throttle_seconds: float = 1.0
    chartmetric_max_retries: int = 3
    chartmetric_backoff_seconds: float = 2.0
    chartmetric_verify_ssl: bool = True

    log_level: str = "INFO"

    @field_validator("debug", mode="before")
    @classmethod
    def coerce_debug(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"1", "true", "yes", "on", "debug", "development"}:
            return True
        if text in {"0", "false", "no", "off", "release", "production"}:
            return False
        return bool(value)

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def export_root_path(self) -> Path:
        path = Path(self.export_root)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def raw_payload_root_path(self) -> Path:
        path = Path(self.raw_payload_root)
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()
