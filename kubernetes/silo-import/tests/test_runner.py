from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Optional

import pytest

from silo_import import lineage
from silo_import.config import ImporterConfig
from silo_import.file_io import read_text, write_text
from silo_import.http_client import HttpClient, HttpResponse
from silo_import.paths import ImporterPaths
from silo_import.runner import ImporterRunner

from .helpers import CurlResponse, compress_ndjson, read_ndjson_file


class MockHttpClient:
    """Mock HTTP client for testing."""

    def __init__(self, responses: list[CurlResponse]) -> None:
        self.responses = responses

    def get(
        self,
        url: str,
        output_path: Path,
        header_path: Path,
        etag: Optional[str] = None,
    ) -> HttpResponse:
        if not self.responses:
            raise AssertionError("No fake HTTP responses remaining")
        response = self.responses.pop(0)

        # Write header file
        header_lines = [f"HTTP/1.1 {response.status} {'OK' if response.status == 200 else 'Not Modified'}"]
        for key, value in (response.headers or {}).items():
            header_lines.append(f"{key}: {value}")
        header_lines.append("")
        header_path.write_text("\n".join(header_lines), encoding="utf-8")

        # Write body file
        output_path.write_bytes(response.body or b"")

        # Parse headers for response
        headers = {k.lower(): v for k, v in (response.headers or {}).items()}

        return HttpResponse(status_code=response.status, headers=headers, body_path=output_path)


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
    responses = [
        CurlResponse(
            status=200,
            headers={"ETag": "W/\"123\"", "x-total-records": str(len(records))},
            body=body,
        )
    ]
    mock_client = MockHttpClient(responses)

    # Monkeypatch DownloadManager to use mock client
    from silo_import.download_manager import DownloadManager

    monkeypatch.setattr(lineage, "_download_lineage_file", lambda url, path: path.write_text("lineage: data"))

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(http_client=mock_client)
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

    assert not mock_client.responses


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

    responses = [CurlResponse(status=304, headers={})]
    mock_client = MockHttpClient(responses)

    from silo_import.download_manager import DownloadManager

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(http_client=mock_client)
    runner.run_once()

    assert not paths.run_sentinel.exists()
    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert read_text(paths.current_etag_file) == "W/\"old\""
    assert not mock_client.responses


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
        CurlResponse(status=200, headers={"ETag": "W/\"111\"", "x-total-records": "1"}, body=body),
        CurlResponse(status=200, headers={"ETag": "W/\"222\"", "x-total-records": "1"}, body=body),
    ]
    mock_client = MockHttpClient(responses)

    from silo_import.download_manager import DownloadManager

    monkeypatch.setattr(lineage, "_download_lineage_file", lambda url, path: path.write_text("lineage: data"))

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(http_client=mock_client)
    ack_thread = _ack_on_success(paths)
    runner.run_once()
    ack_thread.join(timeout=1)
    assert read_text(paths.current_etag_file) == "W/\"111\""

    runner.run_once()
    assert read_text(paths.current_etag_file) == "W/\"222\""
    dirs_after = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(dirs_after) == 1
    assert not mock_client.responses


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
        CurlResponse(status=200, headers={"ETag": "W/\"999\"", "x-total-records": "5"}, body=body)
    ]
    mock_client = MockHttpClient(responses)

    from silo_import.download_manager import DownloadManager

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(http_client=mock_client)
    runner.run_once()

    assert not paths.run_sentinel.exists()
    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert not mock_client.responses


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
        CurlResponse(status=200, headers={"ETag": "W/\"bad\"", "x-total-records": "1"}, body=b"not-zstd"),
    ]
    mock_client = MockHttpClient(responses)

    from silo_import.download_manager import DownloadManager

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(http_client=mock_client)
    write_text(paths.current_etag_file, "W/\"old\"")

    runner.run_once()

    assert not paths.run_sentinel.exists()
    assert not [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert read_text(paths.current_etag_file) == "0"
    assert not mock_client.responses
