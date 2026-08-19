# ruff: noqa: S101

import shutil
import subprocess
import time
from pathlib import Path

import pytest
from raw_reads_processing import deacon as deacon_module, process_files
from raw_reads_processing.config import Config
from raw_reads_processing.datatypes import (
    FileIdAndNameAndReadUrl,
    RequestWithFiles,
)
from raw_reads_processing.errors import InvalidSubmission


def _config() -> Config:
    return Config(
        log_level="DEBUG",
        s3_request_timeout_seconds=10,
        read_validation_timeout_seconds=10,
        deacon_filter_timeout_seconds=10,
        deacon_max_host_reads_proportion=0.05,
        deacon_max_host_bp=1000,
    )


FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _parse_fastq_records(path: Path) -> list[tuple[str, str]]:
    lines = path.read_text().splitlines()
    return [(lines[i + 1], lines[i + 3]) for i in range(0, len(lines), 4)]


def _random_read(length: int = 150) -> tuple[str, str]:
    return "A" * length, "I" * length


def _write_fastq(path: Path, records: list[tuple[str, str]]) -> None:
    lines = []
    for i, (seq, qual) in enumerate(records):
        lines += [f"@read{i}", seq, "+", qual]
    path.write_text("\n".join(lines) + "\n")


def _file(name: str, url: str) -> FileIdAndNameAndReadUrl:
    return FileIdAndNameAndReadUrl(fileId="f1", name=name, url=url)


@pytest.fixture
def mock_downstream(monkeypatch):
    """Stub out file download by treating `url` as a local fixture path, and skip
    readtools (already covered by test_file_validation.py) so these tests only
    exercise the deacon host-content threshold logic in validate_raw_reads_submission.
    """
    monkeypatch.setattr(
        process_files,
        "download_file",
        lambda config, file, save_path: save_path.write_bytes(
            Path(file.url).read_bytes()
        ),
    )
    monkeypatch.setattr(process_files, "validate_with_readtools", lambda *a, **k: None)


@pytest.fixture
def deacon_server():
    """Run validate_raw_reads_submission's deacon step against the real deacon
    binary and the checked-in fixture index, instead of mocking it, so these
    tests exercise the actual threshold/warning boundary logic end-to-end.
    """
    if shutil.which("deacon") is None:
        pytest.skip("deacon binary not found on PATH")
    proc = deacon_module.start_deacon_server()
    time.sleep(1)  # give the server a moment to start listening
    try:
        yield
    finally:
        deacon_module.stop_deacon_server(proc)


@pytest.fixture
def deacon_index(monkeypatch, deacon_server):
    # Index created with `deacon index build test/fixtures/test_small_1.fastq -k 31 -w 15 -o deacon.idx`
    monkeypatch.setattr(
        deacon_module, "DEACON_INDEX_PATH", str(FIXTURES_DIR / "deacon.idx")
    )


@pytest.mark.usefixtures("mock_downstream", "deacon_index")
def test_host_reads_above_threshold_is_an_error(tmp_path):
    # 3/4 reads (75%) are reused verbatim from test_small_1.fastq, so they hit
    # deacon.idx; config's deacon_max_host_reads_proportion is 0.05, so 75% > 5%.
    host_reads = _parse_fastq_records(FIXTURES_DIR / "test_small_1.fastq")[:3]
    non_host_read = _random_read()
    reads = tmp_path / "reads.fastq"
    _write_fastq(reads, [*host_reads, non_host_read])
    files = RequestWithFiles(
        accessionVersion="accession.1",
        files=[_file("reads.fastq", url=str(reads))],
    )
    with pytest.raises(InvalidSubmission) as exc_info:
        process_files.validate_raw_reads_submission(_config(), files)
    assert deacon_module.DEACON_ERROR_PROMPT in exc_info.value.error.message


@pytest.mark.usefixtures("mock_downstream", "deacon_index")
def test_host_reads_at_or_below_threshold_passes(tmp_path):
    # 1/20 reads (5%) is reused verbatim from test_small_1.fastq, so it hits
    # deacon.idx; config's deacon_max_host_reads_proportion is 0.05, so this
    # lands exactly at the threshold: not > 0.05, so no error should be raised.
    host_reads = _parse_fastq_records(FIXTURES_DIR / "test_small_1.fastq")[:1]
    non_host_reads = [_random_read() for _ in range(19)]
    reads = tmp_path / "reads.fastq"
    _write_fastq(reads, [*host_reads, *non_host_reads])
    files = RequestWithFiles(
        accessionVersion="accession.1",
        files=[_file("reads.fastq", url=str(reads))],
    )
    result = process_files.validate_raw_reads_submission(_config(), files)
    assert result is None  # no error raised


def test_run_deacon_filter_restarts_pod_on_deacon_failure(tmp_path, monkeypatch):
    # A failing `deacon --use-server filter` call means the persistent deacon server is
    # presumably dead, so run_deacon_filter should exit the process rather than return an
    # error, letting Kubernetes restart the pod and start a fresh server.
    exit_codes = []
    monkeypatch.setattr(deacon_module.os, "_exit", exit_codes.append)

    def raise_called_process_error(*args, **kwargs):
        raise subprocess.CalledProcessError(1, "deacon", output="", stderr="server unreachable")

    monkeypatch.setattr(deacon_module.subprocess, "run", raise_called_process_error)

    deacon_module.run_deacon_filter(
        {"reads.fastq": tmp_path / "reads.fastq"}, str(tmp_path), _config()
    )

    assert exit_codes == [1]
