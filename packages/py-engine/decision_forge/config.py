import os
from pathlib import Path
from pydantic_settings import BaseSettings


def _default_db() -> str:
    return str(Path(os.path.expanduser("~")) / "DecisionForge" / "forecasts.db")


class Settings(BaseSettings):
    port: int = 8765
    gemini_api_key: str | None = None
    db_path: str = _default_db()

    class Config:
        env_prefix = "DECISION_FORGE_"


settings = Settings()
