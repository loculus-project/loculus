# ruff: noqa: S101

import gzip
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from deacon import Index
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
        max_input_file_bytes=1_000_000,
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


@pytest.fixture(scope="session")
def deacon_filter():
    """Filter against the real bindings and the checked-in fixture index, instead of
    mocking, so these tests exercise the actual threshold/warning boundary logic
    end-to-end. Session-scoped because the index is loaded once per process, which is
    exactly how the service uses it.

    Index created with `deacon index build test/fixtures/test_small_1.fastq -k 31 -w 15 -o deacon.idx`
    """
    return deacon_module.DeaconFilter(
        Index(str(FIXTURES_DIR / "deacon.idx")), _config()
    )


def test_median_read_length_plain_fastq(tmp_path):
    reads = tmp_path / "reads.fastq"
    _write_fastq(reads, [_random_read(100), _random_read(200), _random_read(150)])
    assert deacon_module.median_read_length(reads, "reads.fastq") == pytest.approx(
        150.0
    )


def test_median_read_length_gzipped_fastq(tmp_path):
    config = _config()
    reads = tmp_path / "reads.fastq.gz"
    _write_fastq(tmp_path / "plain.fastq", [_random_read(80), _random_read(100)])
    reads.write_bytes(gzip.compress((tmp_path / "plain.fastq").read_bytes()))
    assert deacon_module.median_read_length(reads, "reads.fastq.gz") == pytest.approx(
        90.0
    )
    assert deacon_module._deacon_a_for_reads({"boundary.fastq": reads}, config) == 2


def test_deacon_a_for_reads_switches_on_short_reads(tmp_path):
    config = _config()
    short = tmp_path / "short.fastq"
    _write_fastq(short, [_random_read(75)] * 5)
    long = tmp_path / "long.fastq"
    _write_fastq(long, [_random_read(100)] * 5)

    assert deacon_module._deacon_a_for_reads({"short.fastq": short}, config) == 1
    assert deacon_module._deacon_a_for_reads({"long.fastq": long}, config) == 2
    # min() over mates: a short R2 still triggers short-read params
    assert (
        deacon_module._deacon_a_for_reads(
            {"long.fastq": long, "short.fastq": short}, config
        )
        == 1
    )


def test_deacon_a_for_reads_raises_when_read_length_cannot_be_parsed(tmp_path):
    config = _config()
    empty = tmp_path / "empty.fastq"
    empty.write_text("")

    with pytest.raises(InvalidSubmission) as exc_info:
        deacon_module._deacon_a_for_reads({"empty.fastq": empty}, config)
    assert exc_info.value.error.fileNames == ["empty.fastq"]
    assert "Failed to determine median read length" in exc_info.value.error.message


@pytest.mark.usefixtures("mock_downstream")
def test_host_reads_above_threshold_is_an_error(tmp_path, deacon_filter):
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
        process_files.validate_raw_reads_submission(_config(), deacon_filter, files)
    assert deacon_module.DEACON_ERROR_PROMPT in exc_info.value.error.message


@pytest.mark.usefixtures("mock_downstream")
def test_host_reads_at_or_below_threshold_passes(tmp_path, deacon_filter):
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
    result = process_files.validate_raw_reads_submission(
        _config(), deacon_filter, files
    )
    assert result is None  # no error raised


class _CountingIndex:
    """Stands in for deacon.Index, recording how many filters overlap."""

    def __init__(self):
        self._lock = threading.Lock()
        self.in_flight = 0
        self.max_in_flight = 0

    def filter(self, *args, **kwargs):
        with self._lock:
            self.in_flight += 1
            self.max_in_flight = max(self.max_in_flight, self.in_flight)
        time.sleep(0.05)
        with self._lock:
            self.in_flight -= 1
        return {
            "time": 0.0,
            "seqs_in": 1,
            "seqs_out": 0,
            "seqs_out_proportion": 0.0,
            "bp_in": 1,
            "bp_out": 0,
            "bp_out_proportion": 0.0,
        }


def test_concurrent_filters_are_capped_at_the_configured_limit(tmp_path):
    # The FastAPI threadpool has ~40 slots; without this cap each of them could start
    # its own deacon_threads worth of filter threads.
    config = _config().model_copy(update={"deacon_max_concurrent_filters": 2})
    index = _CountingIndex()
    deacon_filter = deacon_module.DeaconFilter(index, config)
    reads = tmp_path / "reads.fastq"
    _write_fastq(reads, [_random_read(150)])
    files = {"reads.fastq": reads}

    with ThreadPoolExecutor(max_workers=8) as pool:
        for future in [pool.submit(deacon_filter.run, files, config) for _ in range(8)]:
            future.result()

    assert index.max_in_flight == 2
