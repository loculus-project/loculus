# ruff: noqa: S101

import pytest
from file_processing import functions
from file_processing.config import Config
from file_processing.datatypes import DeaconSummary, FileIdAndNameAndReadUrl
from file_processing.functions import validate_raw_reads_submission


@pytest.fixture
def config() -> Config:
    return Config(
        log_level="INFO",
        backend_request_timeout_seconds=10,
        deacon_max_host_reads_proportion=0.05,
        deacon_max_host_bp=1000,
    )


def _file(name: str) -> FileIdAndNameAndReadUrl:
    return FileIdAndNameAndReadUrl(
        fileId="f1", name=name, url="https://example.test/reads"
    )


@pytest.fixture
def mock_downstream(monkeypatch):
    """Stub out download, readtools validation, and deacon so these tests only
    exercise the per-format file-count limit in validate_raw_reads_submission.
    """
    monkeypatch.setattr(
        functions,
        "download_file",
        lambda config, url, save_path: save_path.write_bytes(b""),
    )
    monkeypatch.setattr(functions, "run_validation", lambda local_files, tmp_dir: None)
    monkeypatch.setattr(
        functions,
        "run_deacon_filter",
        lambda local_files, tmp_dir, config: DeaconSummary(
            time=0.0,
            seqs_in=1,
            seqs_out=1,
            seqs_out_proportion=0.0,
            bp_in=1,
            bp_out=0,
            bp_out_proportion=0.0,
        ),
    )


@pytest.mark.usefixtures("mock_downstream")
def test_only_fastq_files_are_allowed(config):
    files = [_file("R1.bam")]
    result = validate_raw_reads_submission(config, files)
    assert (
        "File format: BAM is not in the list of accepted formats"
        in result.errors[0].message
    )
