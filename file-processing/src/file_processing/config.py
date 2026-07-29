from pathlib import Path

import yaml
from pydantic import BaseModel


class Config(BaseModel):
    log_level: str
    s3_request_timeout_seconds: int
    read_validation_timeout_seconds: int
    file_service_host: str | None = None
    file_service_port: int | None = None


def get_config(config_file: str | Path) -> Config:
    with open("config/defaults.yaml", encoding="utf-8") as f:
        defaults = yaml.safe_load(f)
    with open(config_file, encoding="utf-8") as f:
        full_config = yaml.safe_load(f)
    for key, value in defaults.items():
        if key not in full_config:
            full_config[key] = value
    relevant_config = {key: full_config.get(key) for key in Config.__annotations__}

    return Config(**relevant_config)
