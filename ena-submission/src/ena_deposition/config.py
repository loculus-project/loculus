import logging
import os
from dataclasses import dataclass, field
from typing import Any

import dotenv
import yaml

logger = logging.getLogger(__name__)


@dataclass
class Config:
    """Configuration for the ENA submission process.
    See config/defaults.yaml for default values."""

    test: bool
    organisms: dict[str, dict[str, Any]]
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str
    db_username: str
    db_password: str
    db_url: str
    db_name: str
    unique_project_suffix: str
    ena_submission_url: str
    ena_submission_password: str
    ena_submission_username: str
    ena_reports_service_url: str
    approved_list_url: str
    approved_list_test_url: str
    suppressed_list_url: str
    suppressed_list_test_url: str
    slack_hook: str
    slack_token: str
    slack_channel_id: str
    # Map from Biosample key to dict that defines:
    # - which Loculus field(s) to use as input
    # - (optional) function: currently only "match" supported
    # - (optional) args: list of regexes that match against values
    # - (optional) units: units added to sample attribute
    # - (optional) default: default value if field not in input data
    metadata_mapping: dict[str, dict[str, str | list[str]]]
    """
    manifest_fields_mapping:
      authors:
        loculus_fields: [authors]
        function: reformat_authors
      program:
        loculus_fields: [consensusSequenceSoftwareName, consensusSequenceSoftwareVersion]
        default: "Unknown"
      ... etc ...
    """
    manifest_fields_mapping: dict[str, dict[str, str | list[str]]]
    ingest_pipeline_submission_group: str
    ena_deposition_host: str
    ena_deposition_port: int
    ena_http_timeout_seconds: int = 60
    ena_public_search_timeout_seconds: int = 120
    ncbi_public_search_timeout_seconds: int = 120
    ena_http_get_retry_attempts: int = 3
    # By default, don't retry HTTP post requests to ENA
    ena_http_post_retry_attempts: int = 1
    submit_to_ena_prod: bool = False
    is_broker: bool = False
    allowed_submission_hosts: list[str] = field(
        default_factory=lambda: ["https://backend.pathoplexus.org"]
    )
    min_between_github_requests: int = 2
    time_between_iterations: int = 10
    min_between_publicness_checks: int = 12 * 60  # 12 hours
    min_between_ena_checks: int = 5
    log_level: str = "DEBUG"
    ena_checklist: str | None = None
    set_alias_suffix: str | None = None  # Add to test revisions in dev


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
