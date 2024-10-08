from dataclasses import dataclass

import yaml


@dataclass
class Config:
    test: bool
    organisms: dict[dict[str, str]]
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
    slack_hook: str
    slack_token: str
    slack_channel_id: str
    metadata_mapping: dict[str, dict[str, list[str]]]
    metadata_mapping_mandatory_field_defaults: dict[str, str]
    min_between_github_requests: int | None = 2
    time_between_iterations: int | None = 10
    min_between_ena_checks: int | None = 5
    log_level: str = "DEBUG"


def get_config(config_file: str):
    with open("config/defaults.yaml") as f:
        defaults = yaml.safe_load(f)
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
    for key, value in defaults.items():
        if not key in full_config:
            full_config[key] = value
    relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
    return Config(**relevant_config)