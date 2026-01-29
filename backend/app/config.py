from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from pathlib import Path


class Settings(BaseSettings):
    # Use SQLite by default, but allow override via env var
    database_url: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{Path.home() / 'AppData' / 'Local' / 'astrophotography_db' / 'database.db' if os.name == 'nt' else Path.home() / '.config' / 'astrophotography_db' / 'database.db'}"
    )
    telescopius_api_url: str = "https://telescopius.com/api"
    telescopius_api_key: str = ""

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
