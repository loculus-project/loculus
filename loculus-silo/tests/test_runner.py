# ruff: noqa: S101
from __future__ import annotations

import time
from pathlib import Path
from typing import Final
from unittest.mock import patch

import pytest
from helpers import (
    MockHttpResponse,
    compress_ndjson,
    make_mock_download_func,
    mock_records,
    mock_records_with_hierarchical_filters,
    mock_transformed_records,
    read_ndjson_file,
)
from silo_import import lineage
from silo_import.config import HierarchicalServiceUrl, ImporterConfig, MetadataField
from silo_import.download_manager import DownloadManager
from silo_import.paths import ImporterPaths
from silo_import.runner import ImporterRunner


def make_config(
    tmp_path: Path,
    lineage_definitions: dict[str, dict[int, str]] | None = None,
    hard_refresh_interval: int = 1,
    hierarchical_filters: dict[MetadataField, HierarchicalServiceUrl] | None = None,
) -> ImporterConfig:
    return ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions=lineage_definitions,
        hard_refresh_interval=hard_refresh_interval,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
        silo_binary=tmp_path / "silo",
        preprocessing_config=tmp_path / "config.yaml",
        hierarchical_filters=hierarchical_filters,
    )


def make_paths(tmp_path: Path) -> ImporterPaths:
    silo_binary = tmp_path / "silo"
    preprocessing_config = tmp_path / "config.yaml"
    return ImporterPaths.from_root(tmp_path, silo_binary, preprocessing_config)


def test_runner_successful_cycle(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    config = make_config(tmp_path, lineage_definitions={"test": {1: "http://lineage"}})
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)
    responses = [
        MockHttpResponse(
            status=200,
            headers={"ETag": 'W/"123"', "x-total-records": str(len(records))},
            body=body,
        )
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    monkeypatch.setattr(
        lineage,
        "_download_lineage_file",
        lambda url, path: path.write_text("lineage: data"),  # noqa: ARG005
    )

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    records_out = read_ndjson_file(paths.silo_input_data_path)
    assert records_out == mock_transformed_records()
    assert runner.current_etag == 'W/"123"'
    assert runner.last_hard_refresh > 0
    lineage_definition_file = paths.input_dir / "test.yaml"
    assert lineage_definition_file.read_text(encoding="utf-8") == "lineage: data"

    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1
    assert not (input_dirs[0] / "processing").exists()

    assert not responses_list


def test_runner_skips_on_not_modified(tmp_path: Path) -> None:
    config = make_config(tmp_path, hard_refresh_interval=1000)
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    responses = [MockHttpResponse(status=304, headers={})]
    mock_download, responses_list = make_mock_download_func(responses)

    runner = ImporterRunner(config, paths)
    runner.current_etag = 'W/"old"'
    runner.last_hard_refresh = time.time()  # Mark as recently refreshed
    runner.download_manager = DownloadManager(download_func=mock_download)
    runner.run_once()

    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert runner.current_etag == 'W/"old"'
    assert not responses_list


def test_runner_skips_on_hash_match_updates_etag(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = make_config(tmp_path, lineage_definitions={"test": {1: "http://lineage"}})
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"111"', "x-total-records": "3"}, body=body
        ),
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"222"', "x-total-records": "3"}, body=body
        ),
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    monkeypatch.setattr(
        lineage,
        "_download_lineage_file",
        lambda url, path: path.write_text("lineage: data"),  # noqa: ARG005
    )

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()
        assert runner.current_etag == 'W/"111"'

        runner.run_once()
        assert runner.current_etag == 'W/"222"'

    dirs_after = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(dirs_after) == 1
    assert not responses_list


def test_runner_cleans_up_on_record_mismatch(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)
    responses = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"999"', "x-total-records": "5"}, body=body)
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    runner = ImporterRunner(config, paths)
    runner.current_etag = "old_etag"
    runner.download_manager = DownloadManager(download_func=mock_download)
    runner.run_once()

    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert not responses_list
    assert runner.current_etag == "old_etag"


def test_runner_cleans_up_on_decompress_failure(
    tmp_path: Path,
) -> None:
    config = make_config(tmp_path, hard_refresh_interval=1000)
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    responses = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"bad"', "x-total-records": "1"}, body=b"not-zstd"
        ),
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    runner = ImporterRunner(config, paths)
    runner.current_etag = 'W/"old"'
    runner.download_manager = DownloadManager(download_func=mock_download)

    runner.run_once()

    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert runner.current_etag == 'W/"old"'
    assert not responses_list


HOST_TAXON_NAME: Final = "hostTaxonId"


@pytest.fixture
def host_taxon_setup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[ImporterConfig, ImporterPaths, list[tuple[str, list[str]]]]:
    config = make_config(
        tmp_path,
        hierarchical_filters={HOST_TAXON_NAME: "http://taxonomy:5000"},
        hard_refresh_interval=1000,
    )
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    fake_response = type(
        "Resp",
        (),
        {
            "status_code": 200,
            "text": "lineage: host\n",
            "raise_for_status": lambda _: None,
        },
    )()

    post_calls: list[tuple[str, list[str]]] = []

    def fake_post(url: str, taxa: list[str], prune: bool = False):  # noqa: ARG001
        post_calls.append((url, list(taxa)))
        return fake_response

    monkeypatch.setattr(lineage, "_post_silo_lineage", fake_post)

    return config, paths, post_calls


def test_runner_writes_hierarchical_filter_yaml(
    host_taxon_setup: tuple[ImporterConfig, ImporterPaths, list[tuple[str, list[str]]]],
) -> None:
    config, paths, post_calls = host_taxon_setup

    records = mock_records_with_hierarchical_filters(["9606", "10090", "9606"], HOST_TAXON_NAME)
    body = compress_ndjson(records)
    responses = [
        MockHttpResponse(
            status=200,
            headers={"ETag": 'W/"hf"', "x-total-records": str(len(records))},
            body=body,
        )
    ]
    mock_download, _ = make_mock_download_func(responses)

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    host_taxon_yaml = paths.input_dir / f"{HOST_TAXON_NAME}.yaml"
    assert host_taxon_yaml.read_text(encoding="utf-8") == "lineage: host\n"
    assert len(post_calls) == 1
    assert post_calls[0][0] == "http://taxonomy:5000/silo-lineage"
    assert post_calls[0][1] == ["10090", "9606"]
    assert runner.hierarchical_filter_values == {HOST_TAXON_NAME: {"9606", "10090"}}


def test_runner_skips_filter_refetch_when_taxa_unchanged(
    host_taxon_setup: tuple[ImporterConfig, ImporterPaths, list[tuple[str, list[str]]]],
) -> None:
    config, paths, post_calls = host_taxon_setup

    records = mock_records_with_hierarchical_filters(["9606", "10090", "9606"], HOST_TAXON_NAME)
    body = compress_ndjson(records)
    responses = [
        MockHttpResponse(
            status=200,
            headers={"ETag": 'W/"first"', "x-total-records": str(len(records))},
            body=body,
        ),
        MockHttpResponse(
            status=200,
            headers={"ETag": 'W/"second"', "x-total-records": str(len(records))},
            body=body,
        ),
    ]
    mock_download, _ = make_mock_download_func(responses)

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()
        runner.run_once()

    # Second run sees identical taxa → no second POST
    assert len(post_calls) == 1
