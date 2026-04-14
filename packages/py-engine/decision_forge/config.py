from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    port: int = 8765
    anthropic_api_key: str | None = None

    class Config:
        env_prefix = "DECISION_FORGE_"

settings = Settings()
