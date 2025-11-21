import argparse
import dataclasses
import logging
import os
from dataclasses import dataclass
from types import UnionType
from typing import Any, get_args

import yaml

from loculus_preprocessing.datatypes import (
    AlignmentRequirement,
    EmblInfoMetadataPropertyNames,
    MoleculeType,
    Topology,
)

logger = logging.getLogger(__name__)

# Dataclass types for which we can generate CLI arguments
CLI_TYPES = [str, int, float, bool]


@dataclass
class RawConfig:
    config_file: str | None = None
    log_level: str = "DEBUG"
    keep_tmp_dir: bool = False
    batch_size: int = 5
    pipeline_version: int = 1
    backend_request_timeout_seconds: int = 30

    backend_host: str = ""  # base API URL and organism - populated in get_config if left empty
    keycloak_host: str = "http://127.0.0.1:8083"
    keycloak_user: str = "preprocessing_pipeline"
    keycloak_password: str = "preprocessing_pipeline"  # noqa: S105
    keycloak_token_path: str = "realms/loculus/protocol/openid-connect/token"  # noqa: S105
    organism: str = "mpox"
    genes: list[str] = dataclasses.field(default_factory=list)
    nucleotideSequences: list[str] = dataclasses.field(default_factory=lambda: ["main"])  # noqa: N815
    processing_spec: dict[str, dict[str, Any]] = dataclasses.field(default_factory=dict)

    alignment_requirement: str = "ALL"
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
    molecule_type: str = "genomic RNA"
    topology: str = "linear"
    db_name: str = "Loculus"
    # The 'embl' section of the config contains metadata property names for the EMBL file
    embl: EmblInfoMetadataPropertyNames = dataclasses.field(
        default_factory=EmblInfoMetadataPropertyNames
    )


@dataclass
class Config:
    log_level: str
    keep_tmp_dir: bool
    batch_size: int
    pipeline_version: int
    backend_request_timeout_seconds: int
    backend_host: str
    keycloak_host: str
    keycloak_user: str
    keycloak_password: str
    keycloak_token_path: str
    organism: str
    genes: list[str]
    nucleotideSequences: list[str]
    processing_spec: dict[str, dict[str, Any]]
    alignment_requirement: AlignmentRequirement
    accepted_dataset_matches: list[str]
    nextclade_dataset_name: str | None
    nextclade_dataset_name_map: dict[str, str] | None
    nextclade_dataset_tag: str | None
    nextclade_dataset_tag_map: dict[str, str] | None
    nextclade_dataset_server: str
    nextclade_dataset_server_map: dict[str, str] | None
    require_nextclade_sort_match: bool
    minimizer_url: str | None
    create_embl_file: bool
    scientific_name: str
    molecule_type: MoleculeType
    topology: Topology
    db_name: str
    embl: EmblInfoMetadataPropertyNames
    multi_segment: bool


def load_config_from_yaml(config_file: str) -> RawConfig:
    with open(config_file, encoding="utf-8") as file:
        yaml_config = yaml.safe_load(file)
        logger.debug(f"Loaded config from {config_file}: {yaml_config}")
    config = RawConfig()
    for key, value in yaml_config.items():
        setattr(config, key, value)
    if isinstance(yaml_config.get("embl"), dict):
        config.embl = EmblInfoMetadataPropertyNames(**yaml_config["embl"])
    return config


def base_type(field_type: Any) -> type:
    """Pull the non-None type from a Union, e.g. `str | None` -> `str`"""
    if type(field_type) is UnionType:
        return next(t for t in get_args(field_type) if t is not type(None))
    return field_type


def kebab(s: str) -> str:
    """Convert snake_case to kebab-case"""
    return s.replace("_", "-")


def generate_argparse_from_dataclass(config_cls: type[RawConfig]) -> argparse.ArgumentParser:
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


def load_raw_config(config_file: str | None, ignore_args: bool = False) -> RawConfig:
    # Set just log level this early from env, so we can debug log during config loading
    env_log_level = os.environ.get("PREPROCESSING_LOG_LEVEL")
    if env_log_level:
        logging.basicConfig(level=env_log_level)

    if not ignore_args:
        parser = generate_argparse_from_dataclass(RawConfig)
        args = parser.parse_args()
    else:
        args = argparse.Namespace()

    config_file_path = (
        config_file
        or getattr(args, "config_file", None)
        or os.environ.get("PREPROCESSING_CONFIG_FILE")
    )

    if config_file_path is None:
        msg = "No config file specified via argument or PREPROCESSING_CONFIG_FILE"
        raise ValueError(msg)
    raw = load_config_from_yaml(config_file_path)

    for key in raw.__dataclass_fields__:
        env_var = f"PREPROCESSING_{key.upper()}"
        if env_var in os.environ:
            setattr(raw, key, os.environ[env_var])

    for key, value in vars(args).items():
        if value is not None and hasattr(raw, key):
            setattr(raw, key, value)

    return raw


def build_runtime_config(raw: RawConfig) -> Config:
    """Anything that's business logic rather than simple loading goes here"""
    backend_host = raw.backend_host or f"http://127.0.0.1:8079/{raw.organism}"

    multi_segment = len(raw.nucleotideSequences) > 1

    return Config(
        log_level=raw.log_level,
        keep_tmp_dir=raw.keep_tmp_dir,
        batch_size=raw.batch_size,
        pipeline_version=raw.pipeline_version,
        backend_request_timeout_seconds=raw.backend_request_timeout_seconds,
        backend_host=backend_host,
        keycloak_host=raw.keycloak_host,
        keycloak_user=raw.keycloak_user,
        keycloak_password=raw.keycloak_password,
        keycloak_token_path=raw.keycloak_token_path,
        organism=raw.organism,
        genes=raw.genes,
        nucleotideSequences=raw.nucleotideSequences,
        processing_spec=raw.processing_spec,
        alignment_requirement=AlignmentRequirement(raw.alignment_requirement),
        accepted_dataset_matches=raw.accepted_dataset_matches,
        nextclade_dataset_name=raw.nextclade_dataset_name,
        nextclade_dataset_name_map=raw.nextclade_dataset_name_map,
        nextclade_dataset_tag=raw.nextclade_dataset_tag,
        nextclade_dataset_tag_map=raw.nextclade_dataset_tag_map,
        nextclade_dataset_server=raw.nextclade_dataset_server,
        nextclade_dataset_server_map=raw.nextclade_dataset_server_map,
        require_nextclade_sort_match=raw.require_nextclade_sort_match,
        minimizer_url=raw.minimizer_url,
        create_embl_file=raw.create_embl_file,
        scientific_name=raw.scientific_name,
        molecule_type=MoleculeType(raw.molecule_type),
        topology=Topology(raw.topology),
        db_name=raw.db_name,
        embl=raw.embl,
        multi_segment=multi_segment,
    )


def get_config(config_file: str | None = None, ignore_args: bool = False) -> Config:
    """
    Config precedence: Direct function args > CLI args > ENV variables > config file > default

    args:
        config_file: Path to YAML config file - only used by tests
    """

    raw = load_raw_config(config_file, ignore_args)
    return build_runtime_config(raw)
