from __future__ import annotations

import logging
import subprocess  # noqa: S404
from pathlib import Path

logger = logging.getLogger(__name__)


class SiloRunner:
    """Execute SILO using subprocess."""

    def __init__(self, silo_binary: str = "silo") -> None:
        self._silo_binary = silo_binary

    def run_preprocessing(
        self,
        input_dir: Path,
        output_dir: Path,
        timeout_seconds: int,
    ) -> None:
        """
        Run SILO preprocessing directly using the SILO binary.

        Args:
            input_dir: Directory containing input data (data.ndjson.zst, etc.)
            output_dir: Directory where SILO will write preprocessed output
            timeout_seconds: Maximum time to wait for preprocessing to complete

        Raises:
            subprocess.TimeoutExpired: If preprocessing exceeds timeout
            subprocess.CalledProcessError: If SILO exits with non-zero status
        """
        cmd = [
            self._silo_binary,
            "preprocessing",
            f"--input-directory={input_dir}",
            f"--output-directory={output_dir}",
        ]

        logger.info("Starting SILO preprocessing: %s", " ".join(cmd))

        try:
            result = subprocess.run(  # noqa: S603
                cmd,
                check=True,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
            logger.info("SILO preprocessing completed successfully")
            if result.stdout:
                logger.debug("SILO stdout: %s", result.stdout)
            if result.stderr:
                logger.debug("SILO stderr: %s", result.stderr)

        except subprocess.TimeoutExpired as e:
            logger.error("SILO preprocessing timed out after %s seconds", timeout_seconds)
            if e.stdout:
                logger.error("SILO stdout: %s", e.stdout)
            if e.stderr:
                logger.error("SILO stderr: %s", e.stderr)
            raise

        except subprocess.CalledProcessError as e:
            logger.error("SILO preprocessing failed with exit code %s", e.returncode)
            if e.stdout:
                logger.error("SILO stdout: %s", e.stdout)
            if e.stderr:
                logger.error("SILO stderr: %s", e.stderr)
            raise
