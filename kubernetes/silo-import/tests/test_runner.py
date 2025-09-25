from __future__ import annotations

import threading
import time
from pathlib import Path

import pytest

from silo_import.config import ImporterConfig
from silo_import import downloader, lineage
from silo_import.paths import ImporterPaths
from silo_import.runner import ImporterRunner
from silo_import.utils import read_text, write_text

from .helpers import (
    FakeGetResponse,
    FakeHttpClient,
    FakeStreamResponse,
    compress_ndjson,
    make_client_factory,
    read_ndjson_file,
)


def _ack_on_success(paths: ImporterPaths, timeout: float = 5.0) -> threading.Thread:
    def _worker() -> None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if paths.run_sentinel.exists():
                content = paths.run_sentinel.read_text(encoding="utf-8").strip()
                if content:
                    _, run_id = content.split("=", 1)
                    paths.run_sentinel.unlink(missing_ok=True)
                    write_text(paths.done_sentinel, f"run_id={run_id}\nstatus=success\n")
                    return
            time.sleep(0.01)
        raise AssertionError("Timed out waiting for run sentinel")

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    return thread


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
    release_response = FakeStreamResponse(
        status_code=200,
        headers={"etag": "W/\"123\"", "x-total-records": str(len(records))},
        body=body,
    )
    lineage_response = FakeGetResponse(text="lineage: data")

    clients: list[FakeHttpClient] = [
        FakeHttpClient(stream_responses=[release_response]),
        FakeHttpClient(get_responses=[lineage_response]),
    ]
    factory = make_client_factory(clients)
    monkeypatch.setattr(downloader, "_create_http_client", factory)
    monkeypatch.setattr(lineage, "_create_http_client", factory)

    runner = ImporterRunner(config, paths)

    ack_thread = _ack_on_success(paths)
    runner.run_once()
    ack_thread.join(timeout=1)
    assert not ack_thread.is_alive()

    assert not paths.run_sentinel.exists()
    assert not paths.done_sentinel.exists()

    records_out = read_ndjson_file(paths.silo_input_data_path)
    assert records_out == records
    assert read_text(paths.current_etag_file) == "W/\"123\""
    assert read_text(paths.last_hard_refresh_file) != "0"
    assert paths.lineage_definition_file.read_text(encoding="utf-8") == "lineage: data"

    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1
    assert not (input_dirs[0] / "processing").exists()

    assert not clients  # all fake clients were consumed


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
    write_text(paths.current_etag_file, "W/\"old\"")
    write_text(paths.last_hard_refresh_file, str(int(time.time())))

    clients: list[FakeHttpClient] = [
        FakeHttpClient(stream_responses=[FakeStreamResponse(status_code=304)]),
    ]
    factory = make_client_factory(clients)
    monkeypatch.setattr(downloader, "_create_http_client", factory)

    runner = ImporterRunner(config, paths)
    runner.run_once()

    assert not paths.run_sentinel.exists()
    # No new timestamped directories should be present, but metadata files remain.
    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert read_text(paths.current_etag_file) == "W/\"old\""
    assert not clients


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

    release1 = FakeStreamResponse(
        headers={"etag": "W/\"111\"", "x-total-records": "1"},
        body=body,
    )
    lineage_response = FakeGetResponse(text="lineage: data")
    release2 = FakeStreamResponse(
        headers={"etag": "W/\"222\"", "x-total-records": "1"},
        body=body,
    )

    clients: list[FakeHttpClient] = [
        FakeHttpClient(stream_responses=[release1]),
        FakeHttpClient(get_responses=[lineage_response]),
        FakeHttpClient(stream_responses=[release2]),
    ]
    factory = make_client_factory(clients)
    monkeypatch.setattr(downloader, "_create_http_client", factory)
    monkeypatch.setattr(lineage, "_create_http_client", factory)

    runner = ImporterRunner(config, paths)

    ack_thread = _ack_on_success(paths)
    runner.run_once()
    ack_thread.join(timeout=1)
    assert not ack_thread.is_alive()

    first_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(first_dirs) == 1
    assert read_text(paths.current_etag_file) == "W/\"111\""

    runner.run_once()  # Second run should skip due to hash match

    assert read_text(paths.current_etag_file) == "W/\"222\""
    dirs_after = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(dirs_after) == 1
    assert dirs_after[0] == first_dirs[0]
    assert not paths.run_sentinel.exists()
    assert not clients


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
    release = FakeStreamResponse(
        headers={"etag": "W/\"999\"", "x-total-records": "5"},
        body=body,
    )

    clients: list[FakeHttpClient] = [FakeHttpClient(stream_responses=[release])]
    factory = make_client_factory(clients)
    monkeypatch.setattr(downloader, "_create_http_client", factory)

    runner = ImporterRunner(config, paths)
    runner.run_once()

    assert not paths.run_sentinel.exists()
    assert not list(paths.input_dir.iterdir())
    assert not clients
