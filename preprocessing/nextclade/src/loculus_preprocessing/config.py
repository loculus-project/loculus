import copy
import dataclasses
import logging
from dataclasses import dataclass

import yaml

logger = logging.getLogger(__name__)


@dataclass
class Config:
    backend_host: str = "http://127.0.0.1:8079"
    keycloak_host: str = "http://172.0.0.1:8083"
    keycloak_user: str = "dummy_preprocessing_pipeline"
    keycloak_password: str = "dummy_preprocessing_pipeline"
    keycloak_token_path: str = "realms/loculusRealm/protocol/openid-connect/token"
    nextclade_dataset_name: str = "nextstrain/mpox/all-clades"
    nextclade_dataset_version: str = "2024-01-16--20-31-02Z"
    config_file: str | None = None
    log_level: str = "DEBUG"
    genes: dict[str, int] = dataclasses.field(default_factory=dict)
    keep_tmp_dir: bool = False
    reference_length: int = 197209
    batch_size: int = 5


def load_config_from_yaml(config_file: str, config: Config) -> Config:
    config = copy.deepcopy(config)
    with open(config_file, "r") as file:
        yaml_config = yaml.safe_load(file)
        logging.debug(f"Loaded config from {config_file}: {yaml_config}")
    for key, value in yaml_config.items():
        if hasattr(config, key):
            setattr(config, key, value)
    return config
