from pathlib import Path

import yaml
from pydantic import BaseModel


class Config(BaseModel):
    log_level: str
    backend_request_timeout_seconds: int
    file_service_host: str | None = None
    file_service_port: int | None = None
    deacon_index_url: str | None = None

    deacon_max_host_reads_proportion: float
    deacon_max_host_bp: int  # maximum number of host base pairs allowed in a sample before it is flagged as contaminated

    # deacon parameters
    deacon_a: int = 2  # absolute number of k-mers in a read that need to map to index to be flagged
    deacon_r: float = 0.05  # relative proportion of k-mers in a read that need to map to index


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
