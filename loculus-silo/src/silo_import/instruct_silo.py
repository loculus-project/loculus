from __future__ import annotations

import logging
import subprocess  # ruff:ignore[suspicious-subprocess-import]
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


class SiloRunner:
    def __init__(self, silo_binary: Path, preprocessing_config: Path) -> None:
        self._silo_binary = silo_binary
        self._preprocessing_config = preprocessing_config

    def run_preprocessing(
        self, timeout_seconds: int, changes: Path | None = None, total_records: int | None = None
    ) -> None:
        logger.info("Starting SILO preprocessing")
        command = [sys.executable, "-m", "silo_import.preprocess", str(self._preprocessing_config)]
        if changes:
            command += [str(changes), str(total_records)]
        try:  # ruff:ignore[too-many-statements-in-try-clause]
            result = subprocess.run(  # ruff:ignore[subprocess-without-shell-equals-true]
                command,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                check=False,
            )
            if result.returncode != 0:
                logger.error("SILO preprocessing stderr: %s", result.stderr)
                logger.error("SILO preprocessing stdout: %s", result.stdout)
                msg = f"SILO preprocessing failed with exit code {result.returncode}"
                raise RuntimeError(msg)
            logger.info("SILO preprocessing completed successfully")
        except subprocess.TimeoutExpired as e:
            msg = f"SILO preprocessing timed out after {timeout_seconds}s"
            raise TimeoutError(msg) from e
