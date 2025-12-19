import argparse
import logging
import os
from enum import StrEnum
from types import UnionType
from typing import Any, get_args

import yaml
from pydantic import BaseModel, Field, model_validator

from loculus_preprocessing.datatypes import MoleculeType, SegmentClassificationMethod, Topology

logger = logging.getLogger(__name__)

# Dataclass types for which we can generate CLI arguments
CLI_TYPES = [str, int, float, bool]


class EmblInfoMetadataPropertyNames(BaseModel):
    country_property: str = "geoLocCountry"
    admin_level_properties: list[str] = Field(
        default_factory=lambda: ["geoLocAdmin1", "geoLocAdmin2", "geoLocCity", "geoLocSite"]
    )
    collection_date_property: str = "sampleCollectionDate"
    authors_property: str = "authors"


class AlignmentRequirement(StrEnum):
    # Determines whether ALL or ANY segments that a user provides must align.
    # ANY: warn if some segments fail and some segments align
    # ALL: error if any segment fails even if some segments align
    # NONE: do not align any segments, just process them as-is
    # - set if no nextclade dataset is provided
    ANY = "ANY"
    ALL = "ALL"
    NONE = "NONE"


class NextcladeSequenceAndDataset(BaseModel):
    name: str = "main"
    nextclade_dataset_name: str | None = None
    nextclade_dataset_tag: str | None = None
    nextclade_dataset_server: str | None = None
    accepted_sort_matches: list[str] = Field(default_factory=list)
    gene_prefix: str | None = None
    genes: list[str] = Field(default_factory=list)


class Config(BaseModel):
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
    nextclade_sequence_and_datasets: list[NextcladeSequenceAndDataset] = Field(default_factory=list)
    processing_spec: dict[str, dict[str, Any]] = Field(default_factory=dict)

    alignment_requirement: AlignmentRequirement = AlignmentRequirement.ALL
    segment_classification_method: SegmentClassificationMethod = SegmentClassificationMethod.ALIGN
    nextclade_dataset_server: str = "https://data.clades.nextstrain.org/v3"

    require_nextclade_sort_match: bool = False
    minimizer_url: str | None = None

    create_embl_file: bool = False
    scientific_name: str = "Orthonairovirus haemorrhagiae"
    molecule_type: MoleculeType = MoleculeType.GENOMIC_RNA
    topology: Topology = Topology.LINEAR
    db_name: str = "Loculus"
    # The 'embl' section of the config contains metadata property names for the EMBL file
    embl: EmblInfoMetadataPropertyNames = Field(default_factory=EmblInfoMetadataPropertyNames)
    insdc_ingest_group_id: int = 1

    @model_validator(mode="after")
    def finalize(self):
        for ds in self.nextclade_sequence_and_datasets:
            if ds.nextclade_dataset_server is None:
                ds.nextclade_dataset_server = self.nextclade_dataset_server

        if not any(ds.nextclade_dataset_name for ds in self.nextclade_sequence_and_datasets):
            self.alignment_requirement = AlignmentRequirement.NONE

        if not self.backend_host:  # Set here so we can use organism
            self.backend_host = f"http://127.0.0.1:8079/{self.organism}"

        return self

    def multi_segment(self) -> bool:
        return len(self.nextclade_sequence_and_datasets) > 1


def load_config(config_file: str | None, args) -> Config:
    if config_file:
        with open(config_file, encoding="utf-8") as file:
            yaml_config = yaml.safe_load(file)
            logger.debug(f"Loaded config from {config_file}: {yaml_config}")
        config = Config(**yaml_config)
    else:
        config = Config()
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


def base_type(field_type: Any) -> type:
    """Pull the non-None type from a Union, e.g. `str | None` -> `str`"""
    if type(field_type) is UnionType:
        return next(t for t in get_args(field_type) if t is not type(None))
    return field_type


def kebab(s: str) -> str:
    """Convert snake_case to kebab-case"""
    return s.replace("_", "-")


def generate_argparse_from_model(config_cls: type[BaseModel]) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Command-line arguments for Config class")

    parser.add_argument("--config-file")

    for name, field in config_cls.model_fields.items():
        field_type = base_type(field.annotation)
        if field_type not in CLI_TYPES:
            continue

        arg_name = f"--{kebab(name)}"

        if field_type is bool:
            parser.add_argument(arg_name, action=argparse.BooleanOptionalAction)
        else:
            # no default here -> stays None if not provided
            parser.add_argument(arg_name, type=field_type)

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
        parser = generate_argparse_from_model(Config)
        args = parser.parse_args()
    else:
        args = argparse.Namespace()

    # Use first config file present in order of precedence
    config_file_path = (
        config_file or args.config_file or os.environ.get("PREPROCESSING_CONFIG_FILE")
    )

    # Start with lowest precedence config, then overwrite with higher precedence
    return load_config(config_file_path, args)
