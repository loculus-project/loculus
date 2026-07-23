# ruff: noqa: S101

import random
import shutil
import time
from pathlib import Path

import pytest
from file_processing import deacon as deacon_module
from file_processing import functions
from file_processing.config import Config
from file_processing.datatypes import FileIdAndNameAndReadUrl
from file_processing.functions import validate_raw_reads_submission

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _parse_fastq_records(path: Path) -> list[tuple[str, str]]:
    lines = path.read_text().splitlines()
    return [(lines[i + 1], lines[i + 3]) for i in range(0, len(lines), 4)]


RANDOM_READ_SEED = 0


def _random_read(rng: random.Random, length: int = 150) -> tuple[str, str]:
    # Random ACGT sequences have a negligible chance of containing a 31-mer
    # (deacon.idx's k) present in test_small_1.fastq, so they reliably act as
    # "non-host" reads. Callers must pass an rng seeded with RANDOM_READ_SEED
    # so this stays true and reproducible across runs.
    return "".join(rng.choices("ACGT", k=length)), "I" * length


def _write_fastq(path: Path, records: list[tuple[str, str]]) -> None:
    lines = []
    for i, (seq, qual) in enumerate(records):
        lines += [f"@read{i}", seq, "+", qual]
    path.write_text("\n".join(lines) + "\n")


@pytest.fixture
def config() -> Config:
    return Config(
        log_level="INFO",
        backend_request_timeout_seconds=10,
        deacon_max_host_reads_proportion=0.05,
        deacon_max_host_bp=1000,
    )


def _file(name: str, url: str) -> FileIdAndNameAndReadUrl:
    return FileIdAndNameAndReadUrl(fileId="f1", name=name, url=url)


@pytest.fixture
def mock_downstream(monkeypatch):
    """Stub out file download by treating `url` as a local fixture path, and skip
    readtools (already covered by test_file_validation.py) so these tests only
    exercise the deacon host-content threshold logic in validate_raw_reads_submission.
    """
    monkeypatch.setattr(
        functions,
        "download_file",
        lambda config, url, save_path: save_path.write_bytes(Path(url).read_bytes()),
    )
    monkeypatch.setattr(functions, "run_validation", lambda local_files, tmp_dir: None)


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


@pytest.mark.usefixtures("mock_downstream")
def test_only_fastq_files_are_allowed(config):
    files = [_file("R1.bam", url="https://example.test/reads")]
    result = validate_raw_reads_submission(config, files)
    assert "File is not in accepted format: FASTQ" in result.errors[0].message


@pytest.mark.usefixtures("mock_downstream", "deacon_index")
def test_host_reads_above_threshold_is_an_error(config, tmp_path):
    # 3/4 reads (75%) are reused verbatim from test_small_1.fastq, so they hit
    # deacon.idx; config's deacon_max_host_reads_proportion is 0.05, so 75% > 5%.
    host_reads = _parse_fastq_records(FIXTURES_DIR / "test_small_1.fastq")[:3]
    rng = random.Random(RANDOM_READ_SEED)
    non_host_read = _random_read(rng)
    reads = tmp_path / "reads.fastq"
    _write_fastq(reads, [*host_reads, non_host_read])
    files = [_file("reads.fastq", url=str(reads))]
    result = validate_raw_reads_submission(config, files)
    assert not result.warnings
    assert len(result.errors) == 1
    assert "map to the human genome" in result.errors[0].message


@pytest.mark.usefixtures("mock_downstream", "deacon_index")
def test_host_reads_at_or_below_threshold_is_a_warning(config, tmp_path):
    # 1/20 reads (5%) is reused verbatim from test_small_1.fastq, so it hits
    # deacon.idx; config's deacon_max_host_reads_proportion is 0.05, so this
    # lands exactly at the threshold: not > 0.05, so it's a warning, not an error.
    host_reads = _parse_fastq_records(FIXTURES_DIR / "test_small_1.fastq")[:1]
    rng = random.Random(RANDOM_READ_SEED)
    non_host_reads = [_random_read(rng) for _ in range(19)]
    reads = tmp_path / "reads.fastq"
    _write_fastq(reads, [*host_reads, *non_host_reads])
    files = [_file("reads.fastq", url=str(reads))]
    result = validate_raw_reads_submission(config, files)
    assert not result.errors
    assert any(
        "reads" in warning.message and "map to the human genome" in warning.message
        for warning in result.warnings
    )
