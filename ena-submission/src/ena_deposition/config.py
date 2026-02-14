import logging
import os
from dataclasses import field

import dotenv
import yaml
from pydantic import BaseModel

from ena_deposition.ena_types import MoleculeType, Topology

logger = logging.getLogger(__name__)


class MetadataMapping(BaseModel):
    # Map from Biosample key to dict that defines:
    # - which Loculus field(s) to use as input
    # - (optional) function: currently only "match" supported
    # - (optional) args: list of regexes that match against values
    # - (optional) units: units added to sample attribute
    # - (optional) default: default value if field not in input data
    loculus_fields: list[str]
    default: str | None = None
    function: str | None = None
    args: list[str] | None = None
    units: str | None = None


class ManifestFieldDetails(BaseModel):
    loculus_fields: list[str] = field(default_factory=list)
    function: str | None = None
    type: str | None = None
    default: str | int | None = None


class ExternalMetadataField(BaseModel):
    """Definition of an external metadata field to be uploaded to Loculus."""

    externalMetadataUpdater: str  # noqa: N815
    name: str
    type: str


class EnaOrganismDetails(BaseModel):
    """Details about an ENA organism from the config file."""

    molecule_type: MoleculeType
    scientific_name: str
    taxon_id: int
    organismName: str  # noqa: N815
    externalMetadata: list[ExternalMetadataField] = field(default_factory=list)  # noqa: N815
    topology: Topology = Topology.LINEAR
    segments: list[str]
    loculusOrganism: str | None = None  # noqa: N815
    referenceIdentifierField: str | None = None  # noqa: N815

    def is_multi_segment(self) -> bool:
        return len(self.segments) > 1


type EnaOrganismName = str


class Config(BaseModel):
    """Configuration for the ENA submission process.
    See config/defaults.yaml for default values."""

    # Details for connecting to the Loculus backend
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str

    # Details for connecting to the ENA submission state database
    db_username: str
    db_password: str
    db_url: str
    db_name: str

    # API host and port for ena-deposition service
    ena_deposition_host: str | None
    ena_deposition_port: int | None

    # ENA specific configuration is set in secure_ena_connection()
    test: bool
    ena_submission_url: str
    ena_submission_password: str
    ena_submission_username: str
    ena_reports_service_url: str
    submit_to_ena_prod: bool = False
    is_broker: bool = False
    allowed_submission_hosts: list[str] = field(
        default_factory=lambda: ["https://backend.pathoplexus.org"]
    )
    approved_list_url: str
    approved_list_test_url: str | None
    suppressed_list_url: str
    suppressed_list_test_url: str | None

    # Slack configuration must be provided via environment variables or config
    slack_hook: str | None
    slack_token: str | None
    slack_channel_id: str | None

    enaOrganisms: dict[EnaOrganismName, EnaOrganismDetails]  # noqa: N815
    unique_project_suffix: str
    metadata_mapping: dict[str, MetadataMapping]
    manifest_fields_mapping: dict[str, ManifestFieldDetails]
    ingest_pipeline_submission_group: int
    ena_checklist: str | None = None
    set_alias_suffix: str | None = None  # Add to test revisions in dev

    ena_http_timeout_seconds: int = 60
    backend_http_timeout_seconds: int = 3600
    ena_public_search_timeout_seconds: int = 120
    ncbi_public_search_timeout_seconds: int = 120
    ena_http_get_retry_attempts: int = 3
    # By default, don't retry HTTP post requests to ENA
    ena_http_post_retry_attempts: int = 1
    min_between_github_requests: int = 2
    time_between_iterations: int = 10
    min_between_publicness_checks: int = 12 * 60  # 12 hours
    min_between_ena_checks: int = 5
    log_level: str = "DEBUG"

    retry_threshold_min: int = 240
    slack_retry_threshold_min: int = 720
    submitting_time_threshold_min: int = 15
    waiting_threshold_hours: int = 48


def secure_ena_connection(config: Config):
    """Modify passed-in config object"""
    submit_to_ena_prod = config.submit_to_ena_prod
    if submit_to_ena_prod and (config.backend_url not in config.allowed_submission_hosts):
        logger.warning("WARNING: backend_url not in allowed_hosts")
        submit_to_ena_prod = False
    submit_to_ena_dev = not submit_to_ena_prod

    if submit_to_ena_dev:
        config.test = True
        logger.info("Submitting to ENA dev environment")
        config.ena_submission_url = "https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit"
        config.approved_list_url = (
            config.approved_list_test_url
            or "https://pathoplexus.github.io/ena-submission/test/approved_ena_submission_list.json"
        )
        config.suppressed_list_url = (
            config.suppressed_list_test_url
            or "https://pathoplexus.github.io/ena-submission/test/ppx-accessions-suppression-list.txt"
        )
        config.ena_reports_service_url = "https://wwwdev.ebi.ac.uk/ena/submit/report"

    if submit_to_ena_prod:
        config.test = False
        logger.warning("WARNING: Submitting to ENA production")
        config.ena_submission_url = "https://www.ebi.ac.uk/ena/submit/drop-box/submit"
        config.approved_list_url = "https://pathoplexus.github.io/ena-submission/approved/approved_ena_submission_list.json"
        config.ena_reports_service_url = "https://www.ebi.ac.uk/ena/submit/report"
        config.suppressed_list_url = "https://pathoplexus.github.io/ena-submission/suppressed/ppx-accessions-suppression-list.txt"


def get_config(config_file: str) -> Config:
    with open("config/defaults.yaml", encoding="utf-8") as f:
        defaults = yaml.safe_load(f)
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
    for key, value in defaults.items():
        if key not in full_config:
            full_config[key] = value
    relevant_config = {key: full_config.get(key) for key in Config.__annotations__}

    dotenv.load_dotenv()  # Load environment variables from .env file
    relevant_config["ena_submission_username"] = os.getenv(
        "ENA_USERNAME", relevant_config["ena_submission_username"]
    )
    relevant_config["ena_submission_password"] = os.getenv(
        "ENA_PASSWORD", relevant_config["ena_submission_password"]
    )
    relevant_config["db_url"] = os.getenv("DB_URL", relevant_config["db_url"])

    config = Config(**relevant_config)
    secure_ena_connection(config)
    return config
