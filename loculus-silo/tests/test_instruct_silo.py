from __future__ import annotations

import subprocess  # noqa: S404
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from silo_import.instruct_silo import SiloRunner


def test_silo_runner_success(tmp_path: Path) -> None:
    silo_binary = tmp_path / "silo"
    preprocessing_config = tmp_path / "config.yaml"
    runner = SiloRunner(silo_binary, preprocessing_config)

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stderr="")
        runner.run_preprocessing(timeout_seconds=60)
        mock_run.assert_called_once()


def test_silo_runner_failure(tmp_path: Path) -> None:
    silo_binary = tmp_path / "silo"
    preprocessing_config = tmp_path / "config.yaml"
    runner = SiloRunner(silo_binary, preprocessing_config)

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=1, stderr="error")
        with pytest.raises(RuntimeError, match="failed with exit code 1"):
            runner.run_preprocessing(timeout_seconds=60)


def test_silo_runner_timeout(tmp_path: Path) -> None:
    silo_binary = tmp_path / "silo"
    preprocessing_config = tmp_path / "config.yaml"
    runner = SiloRunner(silo_binary, preprocessing_config)

    with patch("subprocess.run") as mock_run:
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="silo", timeout=60)
        with pytest.raises(TimeoutError, match="timed out"):
            runner.run_preprocessing(timeout_seconds=60)


def test_silo_runner_append_success(tmp_path: Path) -> None:
    silo_binary = tmp_path / "silo"
    preprocessing_config = tmp_path / "config.yaml"
    runner = SiloRunner(silo_binary, preprocessing_config)

    append_file = tmp_path / "data.ndjson.zst"
    silo_directory = tmp_path / "output"

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stderr="")
        runner.run_append(append_file, silo_directory, timeout_seconds=60)
        mock_run.assert_called_once()
        call_args = mock_run.call_args
        cmd = call_args[0][0]
        assert cmd == [
            str(silo_binary),
            "append",
            "--appendFile",
            str(append_file),
            "--siloDirectory",
            str(silo_directory),
        ]


def test_silo_runner_append_failure(tmp_path: Path) -> None:
    silo_binary = tmp_path / "silo"
    preprocessing_config = tmp_path / "config.yaml"
    runner = SiloRunner(silo_binary, preprocessing_config)

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=1, stderr="append error")
        with pytest.raises(RuntimeError, match="SILO append failed"):
            runner.run_append(tmp_path / "data", tmp_path / "out", timeout_seconds=60)


def test_silo_runner_append_timeout(tmp_path: Path) -> None:
    silo_binary = tmp_path / "silo"
    preprocessing_config = tmp_path / "config.yaml"
    runner = SiloRunner(silo_binary, preprocessing_config)

    with patch("subprocess.run") as mock_run:
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="silo", timeout=60)
        with pytest.raises(TimeoutError, match="timed out"):
            runner.run_append(tmp_path / "data", tmp_path / "out", timeout_seconds=60)
