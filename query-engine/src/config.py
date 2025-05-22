"""Configuration settings for the query engine"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings"""
    
    # Database settings
    database_host: str = "localhost"
    database_port: int = 5432
    database_name: str = "loculus"
    database_user: str = "postgres"
    database_password: str = ""
    database_schema: str = "public"
    
    # Pool settings
    database_pool_min_size: int = 5
    database_pool_max_size: int = 20
    
    # Application settings
    log_level: str = "INFO"
    
    # Configuration file for reference genomes and compression
    config_file: str = "config/query-engine-config.yaml"
    
    @property
    def database_url(self) -> str:
        """Construct the database URL"""
        password_part = f":{self.database_password}" if self.database_password else ""
        return (
            f"postgresql+asyncpg://{self.database_user}{password_part}"
            f"@{self.database_host}:{self.database_port}/{self.database_name}"
        )
    
    class Config:
        env_file = ".env"
        env_prefix = "QUERY_ENGINE_"


settings = Settings()