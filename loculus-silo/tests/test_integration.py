"""Integration tests for the full import cycle."""

# ruff: noqa: S101
from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import patch

import pytest
from helpers import (
    MockHttpResponse,
    compress_ndjson,
    make_mock_download_func,
    mock_records,
    mock_transformed_records,
    read_ndjson_file,
)
from silo_import import lineage
from silo_import.config import ImporterConfig
from silo_import.download_manager import DownloadManager
from silo_import.paths import ImporterPaths
from silo_import.runner import ImporterRunner


def make_config(
    tmp_path: Path,
    lineage_definitions: dict[int, str] | None = None,
    hard_refresh_interval: int = 1000,
    silo_run_timeout: int = 5,
) -> ImporterConfig:
    return ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions=lineage_definitions,
        hard_refresh_interval=hard_refresh_interval,
        poll_interval=1,
        silo_run_timeout=silo_run_timeout,
        root_dir=tmp_path,
        silo_binary=tmp_path / "silo",
        preprocessing_config=tmp_path / "config.yaml",
    )


def make_paths(tmp_path: Path) -> ImporterPaths:
    silo_binary = tmp_path / "silo"
    preprocessing_config = tmp_path / "config.yaml"
    return ImporterPaths.from_root(tmp_path, silo_binary, preprocessing_config)


def test_full_import_cycle_with_real_zstd_data(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test complete import cycle with real zstd-compressed data."""
    config = make_config(tmp_path, lineage_definitions={1: "http://lineage"})
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(
            status=200,
            headers={"ETag": 'W/"abc123"', "x-total-records": str(len(records))},
            body=body,
        )
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    monkeypatch.setattr(
        lineage,
        "_download_lineage_file",
        lambda url, path: path.write_text("lineage: test-data\n"),  # noqa: ARG005
    )

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    # Verify complete import
    assert paths.silo_input_data_path.exists(), "SILO input data should exist"
    output_records = read_ndjson_file(paths.silo_input_data_path)
    assert output_records == mock_transformed_records(), (
        "Output records should match transformed format"
    )

    assert runner.current_etag == 'W/"abc123"', "ETag should be updated"
    assert runner.last_hard_refresh > 0, "Hard refresh timestamp should be set"

    # Verify lineage file was downloaded
    assert paths.lineage_definition_file.exists(), "Lineage file should exist"
    assert paths.lineage_definition_file.read_text() == "lineage: test-data\n"

    # Verify timestamped directory was created and processing flag removed
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1, "Should have exactly one timestamped directory"
    assert not (input_dirs[0] / "processing").exists(), "Processing flag should be removed"

    # Verify all HTTP responses were consumed
    assert not responses_list, "All mock responses should be consumed"


def test_multiple_runs_with_state_persistence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test multiple sequential runs maintain state correctly."""
    config = make_config(tmp_path, lineage_definitions={1: "http://lineage"})
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    monkeypatch.setattr(
        lineage,
        "_download_lineage_file",
        lambda url, path: path.write_text("lineage: v1\n"),  # noqa: ARG005
    )

    # Run 1: Initial import
    records_v1 = mock_records()[0]
    body_v1 = compress_ndjson([records_v1])

    responses_r1 = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"etag1"', "x-total-records": "1"}, body=body_v1
        )
    ]
    mock_download_r1, _ = make_mock_download_func(responses_r1)

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download_r1)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    assert runner.current_etag == 'W/"etag1"'
    first_hard_refresh = runner.last_hard_refresh
    assert first_hard_refresh > 0
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1
    first_dir = input_dirs[0]

    # Run 2: No changes (304 Not Modified)
    responses_r2 = [MockHttpResponse(status=304, headers={})]
    mock_download_r2, _ = make_mock_download_func(responses_r2)
    runner.download_manager = DownloadManager(download_func=mock_download_r2)

    runner.run_once()

    # State should be preserved
    assert runner.current_etag == 'W/"etag1"', "ETag should remain unchanged on 304"
    assert runner.last_hard_refresh == first_hard_refresh, "Hard refresh time unchanged on 304"

    # No new directories should be created
    new_input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(new_input_dirs) == 1, "Should still have only one directory after 304"
    assert new_input_dirs[0] == first_dir, "Should keep previous input directory after 304"

    # Run 3: New data with different ETag
    records_v2 = mock_records()[1]
    body_v2 = compress_ndjson([records_v2])

    responses_r3 = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"etag2"', "x-total-records": "1"}, body=body_v2
        )
    ]
    mock_download_r3, _ = make_mock_download_func(responses_r3)
    runner.download_manager = DownloadManager(download_func=mock_download_r3)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    assert runner.current_etag == 'W/"etag2"', "ETag should update on new data"

    # Should now have two directories (old pruning happens but keeps 1)
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1, "Old directory should be pruned, keeping only latest"

    # Verify latest data is correct
    output_records = read_ndjson_file(paths.silo_input_data_path)
    assert output_records == [mock_transformed_records()[1]]


def test_hard_refresh_forces_redownload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test hard refresh forces re-download even with valid ETag."""
    config = make_config(
        tmp_path, lineage_definitions={1: "http://lineage"}, hard_refresh_interval=2
    )
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    monkeypatch.setattr(
        lineage,
        "_download_lineage_file",
        lambda url, path: path.write_text("lineage: data\n"),  # noqa: ARG005
    )

    records = mock_records()
    body = compress_ndjson(records)

    # Run 1: Initial import
    responses_r1 = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"initial"', "x-total-records": "3"}, body=body
        )
    ]
    mock_download_r1, _ = make_mock_download_func(responses_r1)

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download_r1)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    assert runner.current_etag == 'W/"initial"'
    initial_refresh_time = runner.last_hard_refresh

    # Wait for hard refresh interval to elapse
    time.sleep(2.1)

    # Run 2: Should force hard refresh (no ETag sent)
    responses_r2 = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"initial"', "x-total-records": "3"}, body=body
        )
    ]
    mock_download_r2, responses_list_r2 = make_mock_download_func(responses_r2)
    runner.download_manager = DownloadManager(download_func=mock_download_r2)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    # Hard refresh should update timestamp even if data unchanged
    assert runner.last_hard_refresh > initial_refresh_time, "Hard refresh time should be updated"
    assert not responses_list_r2, "Should have made download request (hard refresh)"


def test_error_recovery_cleans_up_properly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that errors during import properly clean up artifacts."""
    config = make_config(tmp_path, lineage_definitions={1: "http://lineage"}, silo_run_timeout=2)
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"test"', "x-total-records": "3"}, body=body
        )
    ]
    mock_download, _ = make_mock_download_func(responses)

    monkeypatch.setattr(
        lineage,
        "_download_lineage_file",
        lambda url, path: path.write_text("lineage: data\n"),  # noqa: ARG005
    )

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    # Make SILO preprocessing raise TimeoutError
    with (
        patch.object(runner.silo, "run_preprocessing", side_effect=TimeoutError("timed out")),
        pytest.raises(TimeoutError, match="timed out"),
    ):
        runner.run_once()

    # Verify cleanup happened
    assert not paths.silo_input_data_path.exists(), "SILO input should be cleaned up after timeout"

    # Verify no timestamped directories remain with processing flag
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    for input_dir in input_dirs:
        assert not (input_dir / "processing").exists(), "Processing flags should be cleaned up"


def test_lineage_download_failure_cleanup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that lineage download failure properly cleans up downloaded data."""
    config = make_config(tmp_path, lineage_definitions={1: "http://lineage"})
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"test"', "x-total-records": "3"}, body=body
        )
    ]
    mock_download, _ = make_mock_download_func(responses)

    # Make lineage download fail
    def failing_lineage_download(url: str, path: Path) -> None:  # noqa: ARG001
        msg = "Simulated lineage download failure"
        raise RuntimeError(msg)

    monkeypatch.setattr(lineage, "_download_lineage_file", failing_lineage_download)

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    with pytest.raises(RuntimeError, match="Simulated lineage download failure"):
        runner.run_once()

    # Verify cleanup: no SILO input file should exist
    assert not paths.silo_input_data_path.exists(), (
        "SILO input should be cleaned up after lineage failure"
    )

    # Verify timestamped directory was cleaned up
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 0, "Timestamped directory should be removed after lineage failure"


def test_interrupted_run_cleanup_and_hash_skip(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that download directories are cleaned on startup and hash matching still works."""
    config = make_config(tmp_path, lineage_definitions={1: "http://lineage"})
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()[0]
    body = compress_ndjson([records])

    # First download: successful completion
    responses_r1 = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"v1"', "x-total-records": "1"}, body=body)
    ]
    mock_download_r1, _ = make_mock_download_func(responses_r1)

    monkeypatch.setattr(
        lineage,
        "_download_lineage_file",
        lambda url, path: path.write_text("lineage: data\n"),  # noqa: ARG005
    )

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download_r1)

    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    # Verify a timestamped directory was created
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1

    # Create a new runner (simulating restart) - this should clear all download directories
    runner2 = ImporterRunner(config, paths)

    # Download directories should be cleared on startup
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 0, "Download directories should be cleared on startup"

    # Second download with identical data (same hash) but new ETag
    responses_r2 = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"v2"', "x-total-records": "1"}, body=body)
    ]
    mock_download_r2, _ = make_mock_download_func(responses_r2)
    runner2.download_manager = DownloadManager(download_func=mock_download_r2)

    with patch.object(runner2.silo, "run_preprocessing"):
        runner2.run_once()

    # ETag should be updated
    assert runner2.current_etag == 'W/"v2"', "ETag should be updated"

    # New directory should exist (may have same timestamp if test runs fast)
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1, "Should have one directory after successful run"
