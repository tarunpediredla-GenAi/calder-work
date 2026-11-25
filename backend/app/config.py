from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = (
        "postgresql+asyncpg://calder:calder_local_dev_only@localhost:5432/calder_works"
    )
    gemini_api_key: str = ""
    gemini_model: str = "gemini-4-hydrogen"
    github_token: str = ""
    github_api_base: str = "https://api.github.com"
    calder_sandbox_image: str = "calder-works-sandbox:latest"
    calder_sandbox_timeout_seconds: int = 90
    calder_max_auto_corrections: int = 2
    workspace_root: str = "/tmp/calder-workspaces"


settings = Settings()
