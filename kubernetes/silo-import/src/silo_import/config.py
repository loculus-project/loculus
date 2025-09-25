from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional


@dataclass(frozen=True)
class ImporterConfig:
    backend_base_url: str
    lineage_definitions: Optional[Dict[str, str]]
    hard_refresh_interval: int
    poll_interval: int
    silo_run_timeout: int
    root_dir: Path

    @classmethod
    def from_env(cls) -> "ImporterConfig":
        env = os.environ
        backend_base_url = env.get("BACKEND_BASE_URL")
        if not backend_base_url:
            raise RuntimeError("BACKEND_BASE_URL environment variable is required")

        lineage_definitions_raw = env.get("LINEAGE_DEFINITIONS")
        lineage_definitions: Optional[Dict[str, str]] = None
        if lineage_definitions_raw:
            try:
                lineage_definitions = json.loads(lineage_definitions_raw)
            except json.JSONDecodeError as exc:  # pragma: no cover - configuration error
                raise RuntimeError("LINEAGE_DEFINITIONS must be valid JSON") from exc

        hard_refresh_interval = int(env.get("HARD_REFRESH_INTERVAL", "3600"))
        poll_interval = int(env.get("SILO_IMPORT_POLL_INTERVAL_SECONDS", "30"))
        silo_run_timeout = int(env.get("SILO_RUN_TIMEOUT_SECONDS", "3600"))
        root_raw = env.get("ROOT_DIR")
        if root_raw:
            root_dir = Path(root_raw).resolve()
        else:
            root_dir = Path("/")

        return cls(
            backend_base_url=backend_base_url.rstrip("/"),
            lineage_definitions=lineage_definitions,
            hard_refresh_interval=hard_refresh_interval,
            poll_interval=poll_interval,
            silo_run_timeout=silo_run_timeout,
            root_dir=root_dir,
        )

    @property
    def released_data_endpoint(self) -> str:
        return f"{self.backend_base_url}/get-released-data?compression=zstd"
