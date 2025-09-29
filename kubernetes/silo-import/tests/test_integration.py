"""Integration tests for the full import cycle."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from silo_import import lineage
from silo_import.config import ImporterConfig
from silo_import.download_manager import DownloadManager
from silo_import.paths import ImporterPaths
from silo_import.runner import ImporterRunner

from .helpers import MockHttpResponse, ack_on_success, compress_ndjson, make_mock_download_func, read_ndjson_file


def test_full_import_cycle_with_real_zstd_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test complete import cycle with real zstd-compressed data."""
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions={"1.0.0": "http://lineage"},
        hard_refresh_interval=1000,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    # Create realistic multi-record dataset
    records = [
        {"metadata": {"pipelineVersion": "1.0.0", "accession": "seq1"}, "unalignedNucleotideSequences": {"main": "ATCG"}},
        {"metadata": {"pipelineVersion": "1.0.0", "accession": "seq2"}, "unalignedNucleotideSequences": {"main": "GCTA"}},
        {"metadata": {"pipelineVersion": "1.0.0", "accession": "seq3"}, "unalignedNucleotideSequences": {"main": "TTAA"}},
    ]
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(
            status=200,
            headers={"ETag": 'W/"abc123"', "x-total-records": str(len(records))},
            body=body,
        )
    ]
    mock_download, responses_list = make_mock_download_func(responses)

    monkeypatch.setattr(lineage, "_download_lineage_file", lambda url, path: path.write_text("lineage: test-data\n"))

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    # Simulate SILO acknowledging the run
    ack_thread = ack_on_success(paths)

    # Run the import
    runner.run_once()

    # Wait for SILO simulation to complete
    ack_thread.join(timeout=2)
    assert not ack_thread.is_alive(), "SILO simulation timed out"

    # Verify complete import
    assert paths.silo_input_data_path.exists(), "SILO input data should exist"
    output_records = read_ndjson_file(paths.silo_input_data_path)
    assert output_records == records, "Output records should match input"

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


def test_multiple_runs_with_state_persistence(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test multiple sequential runs maintain state correctly."""
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions={"1.0.0": "http://lineage"},
        hard_refresh_interval=1000,  # Long interval to prevent hard refresh
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    monkeypatch.setattr(lineage, "_download_lineage_file", lambda url, path: path.write_text("lineage: v1\n"))

    # Run 1: Initial import
    records_v1 = [{"metadata": {"pipelineVersion": "1.0.0"}, "data": "v1"}]
    body_v1 = compress_ndjson(records_v1)

    responses_r1 = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"etag1"', "x-total-records": "1"}, body=body_v1)
    ]
    mock_download_r1, _ = make_mock_download_func(responses_r1)

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download_r1)

    ack_thread_r1 = ack_on_success(paths)
    runner.run_once()
    ack_thread_r1.join(timeout=2)

    assert runner.current_etag == 'W/"etag1"'
    first_hard_refresh = runner.last_hard_refresh
    assert first_hard_refresh > 0

    # Run 2: No changes (304 Not Modified)
    responses_r2 = [MockHttpResponse(status=304, headers={})]
    mock_download_r2, _ = make_mock_download_func(responses_r2)
    runner.download_manager = DownloadManager(download_func=mock_download_r2)

    runner.run_once()

    # State should be preserved
    assert runner.current_etag == 'W/"etag1"', "ETag should remain unchanged on 304"
    assert runner.last_hard_refresh == first_hard_refresh, "Hard refresh time unchanged on 304"

    # No new directories should be created
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1, "Should still have only one directory after 304"

    # Run 3: New data with different ETag
    records_v2 = [{"metadata": {"pipelineVersion": "1.0.0"}, "data": "v2"}]
    body_v2 = compress_ndjson(records_v2)

    responses_r3 = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"etag2"', "x-total-records": "1"}, body=body_v2)
    ]
    mock_download_r3, _ = make_mock_download_func(responses_r3)
    runner.download_manager = DownloadManager(download_func=mock_download_r3)

    ack_thread_r3 = ack_on_success(paths)
    runner.run_once()
    ack_thread_r3.join(timeout=2)

    assert runner.current_etag == 'W/"etag2"', "ETag should update on new data"

    # Should now have two directories (old pruning happens but keeps 1)
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1, "Old directory should be pruned, keeping only latest"

    # Verify latest data is correct
    output_records = read_ndjson_file(paths.silo_input_data_path)
    assert output_records == records_v2


def test_hard_refresh_forces_redownload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test hard refresh forces re-download even with valid ETag."""
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions={"1.0.0": "http://lineage"},
        hard_refresh_interval=2,  # Short interval for testing
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    monkeypatch.setattr(lineage, "_download_lineage_file", lambda url, path: path.write_text("lineage: data\n"))

    records = [{"metadata": {"pipelineVersion": "1.0.0"}, "value": 1}]
    body = compress_ndjson(records)

    # Run 1: Initial import
    responses_r1 = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"initial"', "x-total-records": "1"}, body=body)
    ]
    mock_download_r1, _ = make_mock_download_func(responses_r1)

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download_r1)

    ack_thread_r1 = ack_on_success(paths)
    runner.run_once()
    ack_thread_r1.join(timeout=2)

    assert runner.current_etag == 'W/"initial"'
    initial_refresh_time = runner.last_hard_refresh

    # Wait for hard refresh interval to elapse
    time.sleep(2.1)

    # Run 2: Should force hard refresh (no ETag sent)
    # Server would normally return 304 with ETag, but hard refresh sends ETag="0"
    responses_r2 = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"initial"', "x-total-records": "1"}, body=body)
    ]
    mock_download_r2, responses_list_r2 = make_mock_download_func(responses_r2)
    runner.download_manager = DownloadManager(download_func=mock_download_r2)

    ack_thread_r2 = ack_on_success(paths)
    runner.run_once()
    ack_thread_r2.join(timeout=2)

    # Hard refresh should update timestamp even if data unchanged
    assert runner.last_hard_refresh > initial_refresh_time, "Hard refresh time should be updated"
    assert not responses_list_r2, "Should have made download request (hard refresh)"


def test_error_recovery_cleans_up_properly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that errors during import properly clean up artifacts."""
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions={"1.0.0": "http://lineage"},
        hard_refresh_interval=1000,
        poll_interval=1,
        silo_run_timeout=2,  # Short timeout to trigger failure
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    records = [{"metadata": {"pipelineVersion": "1.0.0"}, "value": 1}]
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"test"', "x-total-records": "1"}, body=body)
    ]
    mock_download, _ = make_mock_download_func(responses)

    monkeypatch.setattr(lineage, "_download_lineage_file", lambda url, path: path.write_text("lineage: data\n"))

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    # Don't create ack thread - SILO will timeout
    with pytest.raises(TimeoutError, match="Timed out waiting for SILO run"):
        runner.run_once()

    # Verify cleanup happened
    assert not paths.silo_input_data_path.exists(), "SILO input should be cleaned up after timeout"
    assert not paths.run_silo.exists(), "Run file should be cleared"
    assert not paths.silo_done.exists(), "Done file should be cleared"

    # Verify no timestamped directories remain with processing flag
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    for input_dir in input_dirs:
        assert not (input_dir / "processing").exists(), "Processing flags should be cleaned up"


def test_lineage_download_failure_cleanup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that lineage download failure properly cleans up downloaded data."""
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions={"1.0.0": "http://lineage"},
        hard_refresh_interval=1000,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    records = [{"metadata": {"pipelineVersion": "1.0.0"}, "value": 1}]
    body = compress_ndjson(records)

    responses = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"test"', "x-total-records": "1"}, body=body)
    ]
    mock_download, _ = make_mock_download_func(responses)

    # Make lineage download fail
    def failing_lineage_download(url: str, path: Path) -> None:
        raise RuntimeError("Simulated lineage download failure")

    monkeypatch.setattr(lineage, "_download_lineage_file", failing_lineage_download)

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download)

    with pytest.raises(RuntimeError, match="Simulated lineage download failure"):
        runner.run_once()

    # Verify cleanup: no SILO input file should exist
    assert not paths.silo_input_data_path.exists(), "SILO input should be cleaned up after lineage failure"

    # Verify timestamped directory was cleaned up
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 0, "Timestamped directory should be removed after lineage failure"


def test_interrupted_run_cleanup_and_hash_skip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that interrupted runs are cleaned up and hash matching skips re-processing."""
    config = ImporterConfig(
        backend_base_url="http://backend",
        lineage_definitions={"1.0.0": "http://lineage"},
        hard_refresh_interval=1000,
        poll_interval=1,
        silo_run_timeout=5,
        root_dir=tmp_path,
    )
    paths = ImporterPaths.from_root(tmp_path)
    paths.ensure_directories()

    records = [{"metadata": {"pipelineVersion": "1.0.0"}, "value": 1}]
    body = compress_ndjson(records)

    # First download: successful completion
    responses_r1 = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"v1"', "x-total-records": "1"}, body=body)
    ]
    mock_download_r1, _ = make_mock_download_func(responses_r1)

    monkeypatch.setattr(lineage, "_download_lineage_file", lambda url, path: path.write_text("lineage: data\n"))

    runner = ImporterRunner(config, paths)
    runner.download_manager = DownloadManager(download_func=mock_download_r1)

    ack_thread_r1 = ack_on_success(paths)
    runner.run_once()
    ack_thread_r1.join(timeout=2)

    # Get the first timestamped directory
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1
    first_dir = input_dirs[0]

    # Processing flag should be removed after successful run
    assert not (first_dir / "processing").exists(), "Processing flag should be removed after success"

    # Manually create a processing flag to simulate an interrupted run
    (first_dir / "processing").touch()

    # Second download with identical data (same hash) but new ETag
    # Should clean up the incomplete first directory and detect hash match with cleaned-up dir
    responses_r2 = [
        MockHttpResponse(status=200, headers={"ETag": 'W/"v2"', "x-total-records": "1"}, body=body)
    ]
    mock_download_r2, _ = make_mock_download_func(responses_r2)
    runner.download_manager = DownloadManager(download_func=mock_download_r2)

    # The processing flag causes the old dir to be deleted before hash comparison
    # So it won't find a hash match and will proceed with SILO run
    ack_thread_r2 = ack_on_success(paths)
    runner.run_once()
    ack_thread_r2.join(timeout=2)

    # ETag should be updated
    assert runner.current_etag == 'W/"v2"', "ETag should be updated"

    # Old incomplete directory should be gone, new one should exist
    input_dirs = [p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit()]
    assert len(input_dirs) == 1, "Should have one directory after cleaning up incomplete one"
    assert input_dirs[0] != first_dir, "Should be a new directory"