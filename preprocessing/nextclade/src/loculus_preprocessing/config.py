import argparse
import logging
import os
from enum import StrEnum
from types import UnionType
from typing import Any, get_args

import yaml
from pydantic import BaseModel, Field, model_validator

from loculus_preprocessing.datatypes import (
    FunctionArgs,
    FunctionInputs,
    FunctionName,
    MoleculeType,
    SegmentClassificationMethod,
    Topology,
)

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


class ProcessingSpec(BaseModel):
    inputs: FunctionInputs
    function: FunctionName = "identity"
    required: bool = False
    args: FunctionArgs | None = None


class AlignmentRequirement(StrEnum):
    # Determines whether ALL or ANY segments that a user provides must align.
    # ANY: warn if some segments fail and some segments align
    # ALL: error if any segment fails even if some segments align
    # NONE: do not align any segments, just process them as-is
    # - set if no nextclade dataset is provided
    ANY = "ANY"
    ALL = "ALL"
    NONE = "NONE"


type SegmentName = str
# name of the processed nucleotide sequence, as expected by the backend and LAPIS
type SequenceName = str


class Reference(BaseModel):
    referenceName: str = "singleReference"  # noqa: N815
    nextclade_dataset_name: str | None = None
    nextclade_dataset_tag: str | None = None
    nextclade_dataset_server: str | None = None
    accepted_dataset_matches: list[str] = Field(default_factory=list)
    genes: list[str] = Field(default_factory=list)


class Segment(BaseModel):
    name: SegmentName = "main"
    references: list[Reference] = Field(default_factory=list)


class NextcladeSequenceAndDataset(BaseModel):
    name: SequenceName = "main"
    referenceName: str = "singleReference"  # noqa: N815
    segment: SegmentName = "main"
    nextclade_dataset_name: str | None = None
    nextclade_dataset_tag: str | None = None
    nextclade_dataset_server: str | None = None
    # Names of diamond or nextclade sort entries that are acceptable matches for this dataset
    accepted_dataset_matches: list[str] = Field(default_factory=list)
    gene_suffix: str | None = None
    # Names of genes in the Nextclade dataset; when concatenated with gene_suffix
    # this must match the gene names expected by the backend and LAPIS
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
    segments: list[Segment] = Field(default_factory=list)
    processing_spec: dict[str, ProcessingSpec] = Field(default_factory=dict)

    alignment_requirement: AlignmentRequirement = AlignmentRequirement.ALL
    segment_classification_method: SegmentClassificationMethod = SegmentClassificationMethod.ALIGN
    nextclade_dataset_server: str = "https://data.clades.nextstrain.org/v3"

    require_nextclade_sort_match: bool = False
    minimizer_url: str | None = None
    diamond_dmnd_url: str | None = None

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
        if not self.segments:
            self.alignment_requirement = AlignmentRequirement.NONE
        for segment in self.segments:
            if not segment.references or not any(
                ds.nextclade_dataset_name for ds in segment.references
            ):
                self.alignment_requirement = AlignmentRequirement.NONE

        if not self.backend_host:  # Set here so we can use organism
            self.backend_host = f"http://127.0.0.1:8079/{self.organism}"

        return self

    @property
    def multi_segment(self) -> bool:
        return len(self.segments) > 1

    @property
    def nextclade_sequence_and_datasets(self) -> list[NextcladeSequenceAndDataset]:
        def build_ds(
            reference: Reference | None, segment_name: str, multi_reference: bool
        ) -> NextcladeSequenceAndDataset:
            base = reference.model_dump() if reference else {}
            ds = NextcladeSequenceAndDataset(
                **base,
                segment=segment_name,
            )
            if ds.nextclade_dataset_server is None:
                ds.nextclade_dataset_server = self.nextclade_dataset_server
            ds.name = set_sequence_name(multi_reference, self.multi_segment, ds)
            ds.gene_suffix = ds.referenceName if multi_reference else None
            return ds

        datasets: list[NextcladeSequenceAndDataset] = []

        for segment in self.segments:
            multi_reference = len(segment.references) > 1
            references: list[Reference] | list[None] = segment.references or [None]
            datasets.extend(build_ds(ref, segment.name, multi_reference) for ref in references)

        return datasets

    @property
    def multi_datasets(self) -> bool:
        return len(self.nextclade_sequence_and_datasets) > 1

    def get_dataset_by_name(self, name: str) -> NextcladeSequenceAndDataset:
        datasets = [ds for ds in self.nextclade_sequence_and_datasets if ds.name == name]
        if len(datasets) == 0:
            msg = f"No dataset found with name: {name}"
            raise ValueError(msg)
        if len(datasets) > 1:
            raise Exception
        return datasets[0]


def set_sequence_name(
    multi_reference: bool, multi_segment: bool, ds: NextcladeSequenceAndDataset
) -> str:
    match (multi_reference, multi_segment):
        case (False, _):
            return ds.segment
        case (True, True):
            return f"{ds.segment}-{ds.referenceName}"
        case (True, False):
            return ds.referenceName
        case _:
            msg = "Internal Error - unreachable code reached"
            raise AssertionError(msg)


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
    if config_file_path:
        with open(config_file_path, encoding="utf-8") as file:
            yaml_config = yaml.safe_load(file)
            logger.debug(f"Loaded config from {config_file_path}: {yaml_config}")
        config = Config(**yaml_config)
    else:
        config = Config()
    # Use environment variables if available
    env_overrides = {}
    for key in Config.model_fields:
        env_var = f"PREPROCESSING_{key.upper()}"
        if env_var in os.environ:
            env_overrides[key] = os.environ[env_var]

    if env_overrides:
        config = Config(**{**config.model_dump(), **env_overrides})

    # Overwrite config with CLI args
    cli_overrides = {
        k: v for k, v in args.__dict__.items() if v is not None and k in Config.model_fields
    }
    if cli_overrides:
        config = Config(**{**config.model_dump(), **cli_overrides})
    return config
