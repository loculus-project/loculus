from __future__ import annotations

import threading
import time
from pathlib import Path

import pytest

from silo_import.file_io import write_text
from silo_import.instruct_silo import SiloInstructor


def test_silo_roundtrip(tmp_path: Path) -> None:
    run_file = tmp_path / "run"
    done_file = tmp_path / "done"
    silo = SiloInstructor(run_file, done_file)

    silo.request_run("abc")
    assert run_file.exists()

    def complete() -> None:
        # Wait briefly so the waiter has time to start
        time.sleep(0.1)
        write_text(done_file, "run_id=abc\nstatus=success\n")

    thread = threading.Thread(target=complete)
    thread.start()
    silo.wait_for_completion("abc", timeout_seconds=5)
    thread.join()


def test_silo_timeout(tmp_path: Path) -> None:
    run_file = tmp_path / "run"
    done_file = tmp_path / "done"
    silo = SiloInstructor(run_file, done_file)
    silo.request_run("xyz")
    with pytest.raises(TimeoutError):
        silo.wait_for_completion("xyz", timeout_seconds=0)
