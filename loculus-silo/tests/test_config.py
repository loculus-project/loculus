# ruff: noqa: S101
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from silo_import.config import (
    ImporterConfig,
)

HARD_REFRESH_INTERVAL = 10
SILO_IMPORT_POLL_INTERVAL_SECONDS = 5
SILO_RUN_TIMEOUT_SECONDS = 99


def test_config_from_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    backend_url = "http://example.com/base"
    # The config-adapter writes this file from the DB instance config; the
    # silo-importer reads it and downloads the actual lineage definitions itself.
    lineage_file = tmp_path / "lineage_definitions.json"
    lineage_file.write_text('{"test": {"1": "http://example.com/lineage.yaml"}}', encoding="utf-8")
    monkeypatch.setenv("BACKEND_BASE_URL", backend_url)
    monkeypatch.setenv("LINEAGE_DEFINITIONS_FILE", str(lineage_file))
    monkeypatch.setenv("HARD_REFRESH_INTERVAL", str(HARD_REFRESH_INTERVAL))
    monkeypatch.setenv("SILO_IMPORT_POLL_INTERVAL_SECONDS", str(SILO_IMPORT_POLL_INTERVAL_SECONDS))
    monkeypatch.setenv("SILO_RUN_TIMEOUT_SECONDS", str(SILO_RUN_TIMEOUT_SECONDS))
    monkeypatch.setenv("ROOT_DIR", str(tmp_path))

    config = ImporterConfig.from_env()

    assert config.backend_base_url == backend_url
    assert config.released_data_endpoint == f"{backend_url}/get-released-data?compression=zstd"
    assert config.lineage_definitions == {"test": {1: "http://example.com/lineage.yaml"}}
    assert config.hard_refresh_interval == HARD_REFRESH_INTERVAL
    assert config.poll_interval == SILO_IMPORT_POLL_INTERVAL_SECONDS
    assert config.silo_run_timeout == SILO_RUN_TIMEOUT_SECONDS
    assert config.root_dir == tmp_path
    assert config.hierarchical_filters is None


def test_config_lineage_definitions_absent_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BACKEND_BASE_URL", "http://example.com/base")
    monkeypatch.setenv("LINEAGE_DEFINITIONS_FILE", str(tmp_path / "missing.json"))
    assert ImporterConfig.from_env().lineage_definitions is None


def test_config_lineage_definitions_empty_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    lineage_file = tmp_path / "lineage_definitions.json"
    lineage_file.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("BACKEND_BASE_URL", "http://example.com/base")
    monkeypatch.setenv("LINEAGE_DEFINITIONS_FILE", str(lineage_file))
    assert ImporterConfig.from_env().lineage_definitions is None


def test_config_lineage_definitions_invalid_json(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    lineage_file = tmp_path / "lineage_definitions.json"
    lineage_file.write_text("{not json", encoding="utf-8")
    monkeypatch.setenv("BACKEND_BASE_URL", "http://example.com/base")
    monkeypatch.setenv("LINEAGE_DEFINITIONS_FILE", str(lineage_file))
    with pytest.raises(RuntimeError):
        ImporterConfig.from_env()


def test_config_missing_backend_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(os.environ.keys()):
        if key.startswith("BACKEND_BASE_URL"):
            monkeypatch.delenv(key, raising=False)
    with pytest.raises(RuntimeError):
        ImporterConfig.from_env()


def test_hierarchical_filters_parsed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BACKEND_BASE_URL", "http://example.com")
    monkeypatch.setenv(
        "HIERARCHICAL_FILTERS",
        json.dumps({"hostTaxon": "http://taxonomy:5000"}),
    )

    config = ImporterConfig.from_env()

    assert config.hierarchical_filters == {
        "hostTaxon": "http://taxonomy:5000",
    }


def test_hierarchical_filters_invalid_json(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BACKEND_BASE_URL", "http://example.com")
    monkeypatch.setenv("HIERARCHICAL_FILTERS", "not-json")

    with pytest.raises(RuntimeError, match="HIERARCHICAL_FILTERS must be valid JSON"):
        ImporterConfig.from_env()
