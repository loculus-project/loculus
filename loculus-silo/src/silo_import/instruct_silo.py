from __future__ import annotations

import logging
import subprocess  # noqa: S404
from pathlib import Path

logger = logging.getLogger(__name__)


class SiloRunner:
    def __init__(self, silo_binary: Path, preprocessing_config: Path) -> None:
        self._silo_binary = silo_binary
        self._preprocessing_config = preprocessing_config

    def run_preprocessing(self, timeout_seconds: int) -> None:
        logger.info("Starting SILO preprocessing")
        try:
            result = subprocess.run(  # noqa: S603
                [str(self._silo_binary), "preprocessing"],
                env={"SILO_PREPROCESSING_CONFIG": str(self._preprocessing_config)},
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

    def run_append(self, append_file: Path, silo_directory: Path, timeout_seconds: int) -> None:
        logger.info("Starting SILO append from %s into %s", append_file, silo_directory)
        try:
            result = subprocess.run(  # noqa: S603
                [
                    str(self._silo_binary),
                    "append",
                    "--append-file",
                    str(append_file),
                    "--silo-directory",
                    str(silo_directory),
                ],
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                env={},
                check=False,
            )
            if result.returncode != 0:
                logger.error("SILO append stderr: %s", result.stderr)
                msg = f"SILO append failed with exit code {result.returncode}"
                raise RuntimeError(msg)
            logger.info("SILO append completed successfully")
        except subprocess.TimeoutExpired as e:
            msg = f"SILO append timed out after {timeout_seconds}s"
            raise TimeoutError(msg) from e
