from __future__ import annotations

import os
from pathlib import Path

import pytest
from silo_import.config import ImporterConfig


def test_config_from_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    backend_url = "http://example.com/base"
    lineage_json = '{"1.0.0": "http://example.com/lineage.yaml"}'
    monkeypatch.setenv("BACKEND_BASE_URL", backend_url)
    monkeypatch.setenv("LINEAGE_DEFINITIONS", lineage_json)
    monkeypatch.setenv("HARD_REFRESH_INTERVAL", "10")
    monkeypatch.setenv("SILO_IMPORT_POLL_INTERVAL_SECONDS", "5")
    monkeypatch.setenv("SILO_RUN_TIMEOUT_SECONDS", "99")
    monkeypatch.setenv("ROOT_DIR", str(tmp_path))

    config = ImporterConfig.from_env()

    assert config.backend_base_url == backend_url
    assert config.released_data_endpoint == f"{backend_url}/get-released-data?compression=zstd"
    assert config.lineage_definitions == {"1.0.0": "http://example.com/lineage.yaml"}
    assert config.hard_refresh_interval == 10
    assert config.poll_interval == 5
    assert config.silo_run_timeout == 99
    assert config.root_dir == tmp_path


def test_config_missing_backend_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(os.environ.keys()):
        if key.startswith("BACKEND_BASE_URL"):
            monkeypatch.delenv(key, raising=False)
    with pytest.raises(RuntimeError):
        ImporterConfig.from_env()
