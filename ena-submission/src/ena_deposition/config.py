import logging
from dataclasses import dataclass, field
from typing import Any

import yaml


@dataclass
class Config:
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
    github_url: str
    github_test_url: str
    slack_hook: str
    slack_token: str
    slack_channel_id: str
    metadata_mapping: dict[str, dict[str, list[str]]]
    metadata_mapping_mandatory_field_defaults: dict[str, str]
    manifest_fields_mapping: dict[str, dict[str, str]]
    ingest_pipeline_submission_group: str
    ena_deposition_host: str
    ena_deposition_port: int
    submit_to_ena_prod: bool = False
    is_broker: bool = False
    allowed_submission_hosts: list[str] = field(default_factory=lambda: ["https://backend.pathoplexus.org"])
    min_between_github_requests: int | None = 2
    time_between_iterations: int | None = 10
    min_between_ena_checks: int | None = 5
    log_level: str = "DEBUG"
    ena_checklist: str | None = None
    set_alias_suffix: str | None = None  # Add to test revisions in dev


def secure_ena_connection(config: Config):
    """Modify passed-in config object"""
    submit_to_ena_prod = config.submit_to_ena_prod
    if submit_to_ena_prod and (config.backend_url not in config.allowed_submission_hosts):
        logging.warning("WARNING: backend_url not in allowed_hosts")
        submit_to_ena_prod = False
    submit_to_ena_dev = not submit_to_ena_prod

    if submit_to_ena_dev:
        config.test = True
        logging.info("Submitting to ENA dev environment")
        config.ena_submission_url = "https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit"
        if not config.github_test_url:
            config.github_url = "https://pathoplexus.github.io/ena-submission/test/approved_ena_submission_list.json"
        else:
            config.github_url = config.github_test_url
        config.ena_reports_service_url = "https://wwwdev.ebi.ac.uk/ena/submit/report"

    if submit_to_ena_prod:
        config.test = False
        logging.warning("WARNING: Submitting to ENA production")
        config.ena_submission_url = "https://www.ebi.ac.uk/ena/submit/drop-box/submit"
        config.github_url = "https://pathoplexus.github.io/ena-submission/approved/approved_ena_submission_list.json"
        config.ena_reports_service_url = "https://www.ebi.ac.uk/ena/submit/report"


def get_config(config_file: str) -> Config:
    with open("config/defaults.yaml", encoding="utf-8") as f:
        defaults = yaml.safe_load(f)
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
    for key, value in defaults.items():
        if key not in full_config:
            full_config[key] = value
    relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
    config = Config(**relevant_config)
    secure_ena_connection(config)
    return config
