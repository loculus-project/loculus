import argparse
import copy
import dataclasses
import logging
import os
from dataclasses import dataclass
from types import UnionType
from typing import Any, get_args

import yaml

logger = logging.getLogger(__name__)

# Dataclass types for which we can generate CLI arguments
CLI_TYPES = [str, int, float, bool]


@dataclass
class Config:
    backend_host: str = "http://127.0.0.1:8079"
    keycloak_host: str = "http://172.0.0.1:8083"
    keycloak_user: str = "dummy_preprocessing_pipeline"
    keycloak_password: str = "dummy_preprocessing_pipeline"
    keycloak_token_path: str = "realms/loculus/protocol/openid-connect/token"
    nextclade_dataset_name: str = "nextstrain/mpox/all-clades"
    nextclade_dataset_version: str = "2024-01-16--20-31-02Z"
    config_file: str | None = None
    log_level: str = "DEBUG"
    genes: dict[str, int] = dataclasses.field(default_factory=dict)
    keep_tmp_dir: bool = False
    reference_length: int = 197209
    batch_size: int = 5
    processing_spec: dict[str, dict[str, Any]] = dataclasses.field(default_factory=dict)


def load_config_from_yaml(config_file: str, config: Config) -> Config:
    config = copy.deepcopy(config)
    with open(config_file) as file:
        yaml_config = yaml.safe_load(file)
        logging.debug(f"Loaded config from {config_file}: {yaml_config}")
    for key, value in yaml_config.items():
        if value is not None and hasattr(config, key):
            setattr(config, key, value)
    return config


def base_type(field_type: type) -> type:
    """Pull the non-None type from a Union, e.g. `str | None` -> `str`"""
    if type(field_type) is UnionType:
        return next(t for t in get_args(field_type) if t is not type(None))
    return field_type


def kebab(s: str) -> str:
    """Convert snake_case to kebab-case"""
    return s.replace("_", "-")


def generate_argparse_from_dataclass(config_cls: type[Config]) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Command-line arguments for Config class")
    for field in dataclasses.fields(config_cls):
        field_name = kebab(field.name)
        field_type = base_type(field.type)
        if field_type not in CLI_TYPES:
            continue
        if field_type is bool:  # Special case for boolean flags
            parser.add_argument(f"--{field_name}", action="store_true")
            parser.add_argument(
                f"--no-{field_name}", dest=field_name.replace("-", "_"), action="store_false"
            )
        else:
            parser.add_argument(f"--{field_name}", type=field_type)
    return parser


def get_config() -> Config:
    # Config precedence: CLI args > ENV variables > config file > default

    env_log_level = os.environ.get("PREPROCESSING_LOG_LEVEL")
    if env_log_level:
        logging.basicConfig(level=env_log_level)

    parser = generate_argparse_from_dataclass(Config)
    args = parser.parse_args()

    # Load default config
    config = Config()

    # Overwrite config with config in config_file
    if args.config_file:
        config = load_config_from_yaml(args.config_file, config)

    # Use environment variables if available
    for key in config.__dict__:
        env_var = f"PREPROCESSING_{key.upper()}"
        if env_var in os.environ:
            setattr(config, key, os.environ[env_var])

    # Overwrite config with CLI args
    for key, value in args.__dict__.items():
        if value is not None:
            setattr(config, key, value)

    return config
