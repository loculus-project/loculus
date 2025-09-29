from __future__ import annotations

import logging
import time
from pathlib import Path

from .file_io import parse_key_value_file, write_text
from .filesystem import safe_remove

logger = logging.getLogger(__name__)


class SiloInstructor:
    def __init__(self, run_file: Path, done_file: Path) -> None:
        self._run_file = run_file
        self._done_file = done_file

    def request_run(self, run_id: str) -> None:
        if self._done_file.exists():
            safe_remove(self._done_file)
        temp_path = self._run_file.with_suffix(".tmp")
        write_text(temp_path, f"run_id={run_id}\n")
        temp_path.replace(self._run_file)
        logger.info("Requested SILO preprocessing run %s", run_id)

    def wait_for_completion(self, run_id: str, timeout_seconds: int) -> None:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if self._done_file.exists():
                data = parse_key_value_file(self._done_file)
                completed_run_id = data.get("run_id")
                status = data.get("status")
                message = data.get("message", "")
                safe_remove(self._done_file)
                if completed_run_id != run_id:
                    logger.warning(
                        "Ignoring completion for stale run %s (expected %s)",
                        completed_run_id,
                        run_id,
                    )
                    continue
                if status == "success":
                    logger.info("SILO preprocessing run %s completed successfully", run_id)
                    return
                raise RuntimeError(f"SILO preprocessing failed: {message or 'unknown error'}")
            time.sleep(1)
        raise TimeoutError(f"Timed out waiting for SILO run {run_id}")

    def clear_pending(self) -> None:
        if self._run_file.exists():
            safe_remove(self._run_file)
        if self._done_file.exists():
            safe_remove(self._done_file)
