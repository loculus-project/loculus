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
    lineage_definitions: dict[str, dict[int, str]] | None = None,
    hard_refresh_interval: int = 1,
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

        # Force full preprocessing on second run to test hash matching
        runner.has_existing_silo_db = False
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


def test_runner_incremental_append_after_initial_full(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """After a full preprocessing run, the next cycle should use incremental append."""
    config = make_config(
        tmp_path, lineage_definitions={"test": {1: "http://lineage"}}, hard_refresh_interval=10000
    )
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)

    # First response: full data for initial preprocessing
    # Second response: incremental data for append
    incremental_records = [records[0]]  # Just one record for append
    incremental_body = compress_ndjson(incremental_records)

    responses = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"111"', "x-total-records": "3"}, body=body
        ),
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"222"', "x-total-records": "1"}, body=incremental_body
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

    # First run: should do full preprocessing
    with patch.object(runner.silo, "run_preprocessing") as mock_preprocess:
        runner.run_once()
        mock_preprocess.assert_called_once()

    assert runner.has_existing_silo_db is True
    assert runner.last_successful_import_time is not None
    assert runner.current_etag == 'W/"111"'

    # Second run: should do incremental append
    with patch.object(runner.silo, "run_append") as mock_append:
        runner.run_once()
        mock_append.assert_called_once()

    assert runner.current_etag == 'W/"222"'
    assert not responses_list


def test_runner_incremental_append_calls_update_lineage_definitions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Incremental append should also call update_lineage_definitions."""
    config = make_config(
        tmp_path, lineage_definitions={"test": {1: "http://lineage"}}, hard_refresh_interval=10000
    )
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)
    incremental_records = [records[0]]
    incremental_body = compress_ndjson(incremental_records)

    responses = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"111"', "x-total-records": "3"}, body=body
        ),
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"222"', "x-total-records": "1"}, body=incremental_body
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

    # First run: full preprocessing
    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    # Second run: incremental append - verify update_lineage_definitions is called
    with (
        patch.object(runner.silo, "run_append") as mock_append,
        patch("silo_import.runner.update_lineage_definitions") as mock_lineage,
    ):
        runner.run_once()
        mock_append.assert_called_once()
        mock_lineage.assert_called_once()

    assert not responses_list


def test_runner_append_fallback_to_full_on_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If incremental append fails, fall back to full preprocessing."""
    config = make_config(
        tmp_path, lineage_definitions={"test": {1: "http://lineage"}}, hard_refresh_interval=10000
    )
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)
    incremental_body = compress_ndjson([records[0]])

    responses = [
        # Initial full preprocessing
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"111"', "x-total-records": "3"}, body=body
        ),
        # Incremental download (will succeed but append will fail)
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"222"', "x-total-records": "1"}, body=incremental_body
        ),
        # Fallback full preprocessing
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"333"', "x-total-records": "3"}, body=body
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

    # First run: full preprocessing
    with patch.object(runner.silo, "run_preprocessing") as mock_preprocess:
        runner.run_once()
        mock_preprocess.assert_called_once()

    assert runner.has_existing_silo_db is True

    # Second run: append fails, should fall back to full preprocessing
    with (
        patch.object(runner.silo, "run_append", side_effect=RuntimeError("append failed")),
        patch.object(runner.silo, "run_preprocessing") as mock_preprocess,
    ):
        runner.run_once()
        mock_preprocess.assert_called_once()

    assert runner.current_etag == 'W/"333"'
    assert not responses_list


def test_runner_hard_refresh_forces_full_preprocessing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Hard refresh should always trigger full preprocessing even if SILO DB exists."""
    config = make_config(
        tmp_path, lineage_definitions={"test": {1: "http://lineage"}}, hard_refresh_interval=1
    )
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)
    # Use different data for second response to avoid hash match skip
    body_v2 = compress_ndjson(records[:2])

    responses = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"111"', "x-total-records": "3"}, body=body
        ),
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"222"', "x-total-records": "2"}, body=body_v2
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

    # First run: full preprocessing
    with patch.object(runner.silo, "run_preprocessing") as mock_preprocess:
        runner.run_once()
        mock_preprocess.assert_called_once()

    assert runner.has_existing_silo_db is True

    # Wait for hard refresh interval to expire
    time.sleep(1.5)

    # Second run: should do full preprocessing (not append) because hard refresh is due
    with (
        patch.object(runner.silo, "run_preprocessing") as mock_preprocess,
        patch.object(runner.silo, "run_append") as mock_append,
    ):
        runner.run_once()
        mock_preprocess.assert_called_once()
        mock_append.assert_not_called()

    assert not responses_list


def test_runner_incremental_skips_when_not_modified(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Incremental append should skip when backend returns 304 Not Modified."""
    config = make_config(
        tmp_path, lineage_definitions={"test": {1: "http://lineage"}}, hard_refresh_interval=10000
    )
    paths = make_paths(tmp_path)
    paths.ensure_directories()

    records = mock_records()
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(
            status=200, headers={"ETag": 'W/"111"', "x-total-records": "3"}, body=body
        ),
        # 304 Not Modified for incremental request
        MockHttpResponse(status=304, headers={}),
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    monkeypatch.setattr(
        lineage,
        "_download_lineage_file",
        lambda url, path: path.write_text("lineage: data"),  # noqa: ARG005
    )

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    # First run: full preprocessing
    with patch.object(runner.silo, "run_preprocessing"):
        runner.run_once()

    # Second run: no changes (304)
    with patch.object(runner.silo, "run_append") as mock_append:
        runner.run_once()
        mock_append.assert_not_called()

    # ETag should still be from the first run since 304 doesn't carry a new ETag
    assert runner.current_etag == 'W/"111"'
    assert not responses_list
