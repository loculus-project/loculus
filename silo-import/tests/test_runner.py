from __future__ import annotations

import time
from pathlib import Path

import pytest

from silo_import import lineage
from silo_import.config import ImporterConfig
from silo_import.paths import ImporterPaths
from silo_import.runner import ImporterRunner

from .helpers import MockHttpResponse, ack_on_success, compress_ndjson, make_mock_download_func, read_ndjson_file


def test_runner_successful_cycle(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions={"1.0.0": "http://lineage"},
        hard_refresh_interval=1,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    records = [{"metadata": {"pipelineVersion": "1.0.0"}, "payload": 1}]
    body = compress_ndjson(records)
    responses = [
        MockHttpResponse(
            status=200,
            headers={"ETag": "W/\"123\"", "x-total-records": str(len(records))},
            body=body,
        )
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    from silo_import.download_manager import DownloadManager

    monkeypatch.setattr(lineage, "_download_lineage_file", lambda url, path: path.write_text("lineage: data"))

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)
    ack_thread = ack_on_success(paths)
    runner.run_once()
    ack_thread.join(timeout=1)
    assert not ack_thread.is_alive()

    assert not paths.run_silo.exists()
    assert not paths.silo_done.exists()

    records_out = read_ndjson_file(paths.silo_input_data_path)
    assert records_out == records
    assert runner.current_etag == "W/\"123\""
    assert runner.last_hard_refresh > 0
    assert paths.lineage_definition_file.read_text(encoding="utf-8") == "lineage: data"

    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1
    assert not (input_dirs[0] / "processing").exists()

    assert not responses_list


def test_runner_skips_on_not_modified(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions=None,
        hard_refresh_interval=1000,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    responses = [MockHttpResponse(status=304, headers={})]
    mock_download, responses_list = make_mock_download_func(responses)

    from silo_import.download_manager import DownloadManager

    runner = ImporterRunner(config, paths)
    runner.current_etag = "W/\"old\""
    runner.last_hard_refresh = time.time()  # Mark as recently refreshed
    runner.download_manager = DownloadManager(download_func=mock_download)
    runner.run_once()

    assert not paths.run_silo.exists()
    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert runner.current_etag == "W/\"old\""
    assert not responses_list


def test_runner_skips_on_hash_match_updates_etag(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions={"1.0.0": "http://lineage"},
        hard_refresh_interval=1,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    records = [{"metadata": {"pipelineVersion": "1.0.0"}, "value": 1}]
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(status=200, headers={"ETag": "W/\"111\"", "x-total-records": "1"}, body=body),
        MockHttpResponse(status=200, headers={"ETag": "W/\"222\"", "x-total-records": "1"}, body=body),
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    from silo_import.download_manager import DownloadManager

    monkeypatch.setattr(lineage, "_download_lineage_file", lambda url, path: path.write_text("lineage: data"))

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)
    ack_thread = ack_on_success(paths)
    runner.run_once()
    ack_thread.join(timeout=1)
    assert runner.current_etag == "W/\"111\""

    runner.run_once()
    assert runner.current_etag == "W/\"222\""
    dirs_after = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(dirs_after) == 1
    assert not responses_list


def test_runner_cleans_up_on_record_mismatch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions=None,
        hard_refresh_interval=1,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    records = [{"metadata": {}, "value": 1}]
    body = compress_ndjson(records)
    responses = [
        MockHttpResponse(status=200, headers={"ETag": "W/\"999\"", "x-total-records": "5"}, body=body)
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    from silo_import.download_manager import DownloadManager

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)
    runner.run_once()

    assert not paths.run_silo.exists()
    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert not responses_list


def test_runner_cleans_up_on_decompress_failure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions=None,
        hard_refresh_interval=1,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    responses = [
        MockHttpResponse(status=200, headers={"ETag": "W/\"bad\"", "x-total-records": "1"}, body=b"not-zstd"),
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    from silo_import.download_manager import DownloadManager

    runner = ImporterRunner(config, paths)
    runner.current_etag = "W/\"old\""
    runner.download_manager = DownloadManager(download_func=mock_download)

    runner.run_once()

    assert not paths.run_silo.exists()
    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert runner.current_etag == "0"
    assert not responses_list
