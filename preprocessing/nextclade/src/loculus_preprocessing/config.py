import argparse
import copy
import dataclasses
import logging
import os
from dataclasses import dataclass
from enum import StrEnum
from types import UnionType
from typing import Any, get_args

import yaml

from loculus_preprocessing.datatypes import MoleculeType, Topology

logger = logging.getLogger(__name__)

# Dataclass types for which we can generate CLI arguments
CLI_TYPES = [str, int, float, bool]


@dataclass
class EmblInfoMetadataPropertyNames:
    country_property: str = "geoLocCountry"
    admin_level_properties: list[str] = dataclasses.field(
        default_factory=lambda: ["geoLocAdmin1", "geoLocAdmin2", "geoLocCity", "geoLocSite"]
    )
    collection_date_property: str = "sampleCollectionDate"
    authors_property: str = "authors"


class AlignmentRequirement(StrEnum):
    # Determines whether ALL or ANY segments that a user provides must align.
    # ANY: warn if some segments fail and some segments align
    # ALL: error if any segment fails even if some segments align
    ANY = "ANY"
    ALL = "ALL"


@dataclass
class Config:
    config_file: str | None = None
    log_level: str = "DEBUG"
    keep_tmp_dir: bool = False
    batch_size: int = 5
    pipeline_version: int = 1

    backend_host: str = ""  # base API URL and organism - populated in get_config if left empty
    keycloak_host: str = "http://127.0.0.1:8083"
    keycloak_user: str = "preprocessing_pipeline"
    keycloak_password: str = "preprocessing_pipeline"  # noqa: S105
    keycloak_token_path: str = "realms/loculus/protocol/openid-connect/token"  # noqa: S105

    organism: str = "mpox"
    genes: list[str] = dataclasses.field(default_factory=list)
    nucleotideSequences: list[str] = dataclasses.field(default_factory=lambda: ["main"])  # noqa: N815
    processing_spec: dict[str, dict[str, Any]] = dataclasses.field(default_factory=dict)
    multi_segment: bool = False

    alignment_requirement: AlignmentRequirement = AlignmentRequirement.ALL
    nextclade_dataset_name: str | None = None
    nextclade_dataset_name_map: dict[str, str] | None = None
    nextclade_dataset_tag: str | None = None
    nextclade_dataset_tag_map: dict[str, str] | None = None
    nextclade_dataset_server: str = "https://data.clades.nextstrain.org/v3"
    nextclade_dataset_server_map: dict[str, str] | None = None

    require_nextclade_sort_match: bool = False
    minimizer_url: str | None = None
    accepted_dataset_matches: list[str] = dataclasses.field(default_factory=list)
    create_embl_file: bool = False
    scientific_name: str = "Orthonairovirus haemorrhagiae"
    molecule_type: MoleculeType = MoleculeType.GENOMIC_RNA
    topology: Topology = Topology.LINEAR
    db_name: str = "Loculus"
    # The 'embl' section of the config contains metadata property names for the EMBL file
    embl: EmblInfoMetadataPropertyNames = dataclasses.field(
        default_factory=EmblInfoMetadataPropertyNames
    )


def load_config_from_yaml(config_file: str, config: Config | None = None) -> Config:
    config = Config() if config is None else copy.deepcopy(config)
    with open(config_file, encoding="utf-8") as file:
        yaml_config = yaml.safe_load(file)
        logger.debug(f"Loaded config from {config_file}: {yaml_config}")
    for key, value in yaml_config.items():
        if value is not None and hasattr(config, key):
            attr = getattr(config, key)
            if isinstance(attr, StrEnum):
                try:
                    enum_value = type(attr)(value)
                except ValueError as e:
                    msg = f"Invalid value '{value}' for enum {type(attr).__name__}"
                    raise ValueError(msg) from e
                setattr(config, key, enum_value)
                continue
            setattr(config, key, value)
            if key == "embl_info" and isinstance(value, dict):
                for embl_key, embl_value in value.items():
                    if hasattr(config.embl, embl_key) and embl_value is not None:
                        setattr(config.embl, embl_key, embl_value)
    return config


def base_type(field_type: Any) -> type:
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
        if field_type is bool:
            parser.add_argument(f"--{field_name}", action=argparse.BooleanOptionalAction)
        else:
            parser.add_argument(f"--{field_name}", type=field_type)
    return parser


def get_config(config_file: str | None = None, ignore_args: bool = False) -> Config:
    """
    Config precedence: Direct function args > CLI args > ENV variables > config file > default

    args:
        config_file: Path to YAML config file - only used by tests
    """

    # Set just log level this early from env, so we can debug log during config loading
    env_log_level = os.environ.get("PREPROCESSING_LOG_LEVEL")
    if env_log_level:
        logging.basicConfig(level=env_log_level)

    if not ignore_args:
        parser = generate_argparse_from_dataclass(Config)
        args = parser.parse_args()
    else:
        args = argparse.Namespace()

    # Use first config file present in order of precedence
    config_file_path = (
        config_file or args.config_file or os.environ.get("PREPROCESSING_CONFIG_FILE")
    )

    # Start with lowest precedence config, then overwrite with higher precedence
    config = load_config_from_yaml(config_file_path) if config_file_path else Config()

    # Use environment variables if available
    for key in config.__dict__:
        env_var = f"PREPROCESSING_{key.upper()}"
        if env_var in os.environ:
            setattr(config, key, os.environ[env_var])

    # Overwrite config with CLI args
    for key, value in args.__dict__.items():
        if value is not None:
            setattr(config, key, value)

    if not config.backend_host:  # Set here so we can use organism
        config.backend_host = f"http://127.0.0.1:8079/{config.organism}"

    if len(config.nucleotideSequences) > 1:
        config.multi_segment = True

    return config
