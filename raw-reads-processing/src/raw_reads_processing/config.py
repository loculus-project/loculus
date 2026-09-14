from pathlib import Path

import yaml
from pydantic import BaseModel


class Config(BaseModel):
    log_level: str
    s3_request_timeout_seconds: int
    read_validation_timeout_seconds: int
    # deacon runs in-process, so a released-GIL filter call cannot be interrupted the
    # way a subprocess could be killed on timeout; input size is what bounds its runtime.
    max_input_file_bytes: int
    file_service_host: str | None = None
    file_service_port: int | None = None

    deacon_max_host_reads_proportion: float
    deacon_max_host_bp: int  # maximum number of host base pairs allowed in a sample before it is flagged as contaminated

    # deacon parameters
    deacon_a: int = (
        2  # absolute number of k-mers in a read that need to map to index to be flagged
    )
    deacon_a_short_reads: int = (
        1  # absolute k-mer threshold used instead of deacon_a for short-read libraries
    )
    short_reads_threshold: int = (
        90  # mean read length (bp) below which short-read deacon params are used
    )
    deacon_r: float = (
        0.05  # relative proportion of k-mers in a read that need to map to index
    )
    deacon_threads: int = 4  # worker threads within a single deacon filter call
    deacon_max_concurrent_filters: int = 2  # filter calls allowed to run at once


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
