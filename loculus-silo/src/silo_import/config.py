from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


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

    @classmethod
    def from_env(cls) -> ImporterConfig:
        env = os.environ
        backend_base_url = env.get("BACKEND_BASE_URL")
        if not backend_base_url:
            msg = "BACKEND_BASE_URL environment variable is required"
            raise RuntimeError(msg)

        lineage_definitions = cls._load_lineage_definitions(
            env.get("LINEAGE_DEFINITIONS_FILE", "/app/lineage_definitions.json")
        )

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
        )

    @staticmethod
    def _load_lineage_definitions(path: str) -> dict[str, dict[int, str]] | None:
        """Read the lineage-definition URL map (system -> pipeline version -> URL)
        that the config-adapter wrote from the DB instance config. The adapter
        always writes the file (possibly `{}`); a missing or empty file means no
        lineage systems for this organism.
        """
        if not path or not os.path.exists(path):
            return None
        raw = Path(path).read_text(encoding="utf-8").strip()
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            msg = f"{path} must be valid JSON"
            raise RuntimeError(msg) from exc
        if not data:
            return None
        lineage_definitions: dict[str, dict[int, str]] = {}
        for key, value in data.items():
            if not isinstance(value, dict):
                msg = f"Each entry in {path} must map version -> URL; got {value!r}"
                raise TypeError(msg)
            lineage_definitions[key] = {int(k): v for k, v in value.items()}
        return lineage_definitions

    @property
    def released_data_endpoint(self) -> str:
        return f"{self.backend_base_url}/get-released-data?compression=zstd"
