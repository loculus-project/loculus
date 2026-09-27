from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from .auth import DEFAULT_CLIENT_ID, KeycloakCredentials

MetadataField = str
HierarchicalServiceUrl = str


@dataclass(frozen=True)
class ImporterConfig:
    backend_base_url: str
    lineage_definitions: dict[str, dict[int, str]] | None
    hard_refresh_interval: int
    poll_interval: int
    silo_run_timeout: int
    root_dir: Path
    silo_binary: Path
    preprocessing_config: Path
    hierarchical_filters: dict[MetadataField, HierarchicalServiceUrl] | None = None
    keycloak: KeycloakCredentials | None = None

    @classmethod
    def from_env(cls) -> ImporterConfig:
        env = os.environ
        backend_base_url = env.get("BACKEND_BASE_URL")
        if not backend_base_url:
            msg = "BACKEND_BASE_URL environment variable is required"
            raise RuntimeError(msg)

        lineage_definitions_raw = env.get("LINEAGE_DEFINITIONS")
        lineage_definitions: dict[str, dict[int, str]] | None = None
        if lineage_definitions_raw:
            try:  # ruff:ignore[too-many-statements-in-try-clause]
                data = json.loads(lineage_definitions_raw)
                lineage_definitions = {}
                for key, value in data.items():
                    if isinstance(value, dict):
                        lineage_definitions[key] = {int(k): v for k, v in value.items()}
                    else:
                        msg = (
                            f"Each item in LINEAGE_DEFINITIONS must be a dictionary, "
                            f"received: {lineage_definitions_raw}"
                        )
                        raise TypeError(msg)

            except json.JSONDecodeError as exc:
                msg = "LINEAGE_DEFINITIONS must be valid JSON"
                raise RuntimeError(msg) from exc
            except TypeError as exc:
                raise RuntimeError(str(exc)) from exc

        hierarchical_filters = _parse_hierarchical_filters(env.get("HIERARCHICAL_FILTERS"))

        hard_refresh_interval = int(env.get("HARD_REFRESH_INTERVAL", "3600"))
        poll_interval = int(env.get("SILO_IMPORT_POLL_INTERVAL_SECONDS", "30"))
        silo_run_timeout = int(env.get("SILO_RUN_TIMEOUT_SECONDS", "3600"))
        root_raw = env.get("ROOT_DIR")
        root_dir = Path(root_raw).resolve() if root_raw else Path("/")
        silo_binary = Path(env.get("PATH_TO_SILO_BINARY", "/usr/local/bin/silo"))
        preprocessing_config = Path(
            env.get("PREPROCESSING_CONFIG", "/app/preprocessing_config.yaml")
        )

        return cls(
            backend_base_url=backend_base_url.rstrip("/"),
            lineage_definitions=lineage_definitions,
            hard_refresh_interval=hard_refresh_interval,
            poll_interval=poll_interval,
            silo_run_timeout=silo_run_timeout,
            root_dir=root_dir,
            silo_binary=silo_binary,
            preprocessing_config=preprocessing_config,
            hierarchical_filters=hierarchical_filters,
            keycloak=_parse_keycloak_credentials(env),
        )

    @property
    def released_data_endpoint(self) -> str:
        return f"{self.backend_base_url}/get-released-data?compression=zstd"


def _parse_keycloak_credentials(env: Mapping[str, str]) -> KeycloakCredentials | None:
    """
    Read the credentials the importer uses on instances that require a login.

    All three are needed or none: a partially configured importer would silently fall back to
    anonymous requests and only fail once the backend rejects them.
    """
    token_url = env.get("KEYCLOAK_TOKEN_URL")
    username = env.get("KEYCLOAK_USER")
    password = env.get("KEYCLOAK_PASSWORD")

    if not any([token_url, username, password]):
        return None
    if not all([token_url, username, password]):
        msg = "KEYCLOAK_TOKEN_URL, KEYCLOAK_USER and KEYCLOAK_PASSWORD must be set together"
        raise RuntimeError(msg)

    return KeycloakCredentials(
        token_url=str(token_url),
        username=str(username),
        password=str(password),
        client_id=env.get("KEYCLOAK_CLIENT_ID", DEFAULT_CLIENT_ID),
    )


def _parse_hierarchical_filters(
    raw: str | None,
) -> dict[MetadataField, HierarchicalServiceUrl] | None:
    if not raw:
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        msg = "HIERARCHICAL_FILTERS must be valid JSON"
        raise RuntimeError(msg) from exc

    if not isinstance(data, dict):
        msg = f"HIERARCHICAL_FILTERS must be a JSON object, got: {raw}"
        raise TypeError(msg)

    return data or None
