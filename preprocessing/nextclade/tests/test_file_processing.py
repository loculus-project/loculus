# ruff: noqa: S101

from unittest.mock import MagicMock

import pytest

from loculus_preprocessing import file_processing_functions, prepro
from loculus_preprocessing.config import Config
from loculus_preprocessing.datatypes import (
    DeaconSummary,
    FileCategory,
    FileIdAndNameAndReadUrl,
)
from loculus_preprocessing.file_processing_functions import (
    process_submitted_files,
    validate_raw_reads_submission,
)

MAX_HOST_PROPORTION = 0.05


@pytest.fixture
def config() -> Config:
    return Config()


@pytest.fixture
def mock_deacon(monkeypatch):
    """Mock the deacon index file download and deacon filter calls.

    Returns a setter so each test can choose the reported host-read proportion (default 0.0).
    """
    monkeypatch.setattr(
        file_processing_functions, "download_file", lambda config, url, save_path: None
    )

    def set_removed_proportion(removed_proportion: float = 0.0) -> None:
        monkeypatch.setattr(
            file_processing_functions,
            "run_deacon_filter",
            lambda index, input_file, summary_json: deacon_summary(removed_proportion),
        )

    set_removed_proportion(0.0)
    return set_removed_proportion


def deacon_summary(removed_proportion: float) -> DeaconSummary:
    """Build a DeaconSummary reporting the given proportion of removed host reads."""
    seqs_in = 100
    seqs_removed = round(seqs_in * removed_proportion)
    return DeaconSummary(
        time=0.0,
        seqs_in=seqs_in,
        seqs_out=seqs_in - seqs_removed,
        seqs_removed=seqs_removed,
        seqs_removed_proportion=removed_proportion,
    )


def fastq_file(
    file_id: str, name: str, url: str | None = "https://example.test/reads"
) -> FileIdAndNameAndReadUrl:
    return FileIdAndNameAndReadUrl(fileId=file_id, name=name, url=url)


def test_fetch_deacon_idx_only_when_raw_reads_enabled(config, monkeypatch):
    class _ExitLoop(Exception):  # noqa: N818
        """Attaches to `fetch_unprocessed_sequences` to exit run()'s
        processing loop after startup.
        """

    fetch_index_mock = MagicMock(return_value=True)
    monkeypatch.setattr(prepro, "run_deacon_fetch", fetch_index_mock)
    monkeypatch.setattr(prepro, "fetch_unprocessed_sequences", MagicMock(side_effect=_ExitLoop))

    # RAW_READS not enabled for this organism -> the index must not be fetched.
    with pytest.raises(_ExitLoop):
        prepro.run(config)
    fetch_index_mock.assert_not_called()

    # RAW_READS enabled -> the index is fetched once, into the dataset dir.
    config.submission_file_categories = [FileCategory.RAW_READS]
    with pytest.raises(_ExitLoop):
        prepro.run(config)
    fetch_index_mock.assert_called_once()
    (index_path,) = fetch_index_mock.call_args.args
    assert index_path.endswith(prepro.DEACON_INDEX)


def test_process_submitted_files_runs_raw_reads_check(config, tmp_path, monkeypatch):
    validate_mock = MagicMock(return_value=([], []))
    monkeypatch.setattr(file_processing_functions, "validate_raw_reads_submission", validate_mock)

    files = [fastq_file("f1", "reads.fastq")]
    errors, warnings = process_submitted_files(
        config, str(tmp_path), {FileCategory.RAW_READS: files}
    )

    validate_mock.assert_called_once_with(config, str(tmp_path), files, 0.05)
    assert errors == []
    assert warnings == []


def test_process_submitted_files_skips_empty_category(config, tmp_path, monkeypatch):
    # The backend sends an empty list for file categories without files
    monkeypatch.setattr(
        file_processing_functions,
        "validate_raw_reads_submission",
        lambda *a: pytest.fail("empty category must not be validated"),
    )
    file_mapping = {FileCategory.RAW_READS: []}
    errors, warnings = process_submitted_files(config, str(tmp_path), file_mapping)
    assert errors == []
    assert warnings == []


def test_process_submitted_files_reports_unsupported_category(config, tmp_path):
    file_mapping = {FileCategory.ANNOTATIONS: [fastq_file("f1", "notes.txt")]}
    errors, _ = process_submitted_files(config, str(tmp_path), file_mapping)
    assert len(errors) == 1
    assert "not supported by preprocessing" in errors[0].message


@pytest.mark.usefixtures("mock_deacon")
def test_single_valid_fastq_passes(config, tmp_path):
    files = [fastq_file("f1", "reads.fastq")]
    errors, warnings = validate_raw_reads_submission(
        config, str(tmp_path), files, MAX_HOST_PROPORTION
    )
    assert errors == []
    assert warnings == []


@pytest.mark.usefixtures("mock_deacon")
def test_paired_valid_fastq_passes(config, tmp_path):
    files = [fastq_file("f1", "reads_R1.fastq"), fastq_file("f2", "reads_R2.fastq.gz")]
    errors, warnings = validate_raw_reads_submission(
        config, str(tmp_path), files, MAX_HOST_PROPORTION
    )
    assert errors == []
    assert warnings == []


@pytest.mark.usefixtures("mock_deacon")
def test_too_many_files_reports_error(config, tmp_path):
    files = [
        fastq_file("f1", "r1.fastq"),
        fastq_file("f2", "r2.fastq"),
        fastq_file("f3", "r3.fastq"),
    ]
    errors, _ = validate_raw_reads_submission(config, str(tmp_path), files, MAX_HOST_PROPORTION)
    assert len(errors) == 1
    assert "Received 3" in errors[0].message


@pytest.mark.usefixtures("mock_deacon")
def test_unrecognized_extension_reports_error(config, tmp_path):
    files = [fastq_file("f1", "reads.txt")]
    errors, _ = validate_raw_reads_submission(config, str(tmp_path), files, MAX_HOST_PROPORTION)
    assert len(errors) == 1
    assert "unrecognized extension" in errors[0].message


def test_host_contamination_within_threshold(config, tmp_path, mock_deacon):
    mock_deacon(0.01)
    files = [fastq_file("f1", "reads.fastq")]
    errors, _ = validate_raw_reads_submission(config, str(tmp_path), files, MAX_HOST_PROPORTION)
    assert errors == []


def test_host_contamination_exceeds_threshold(config, tmp_path, mock_deacon):
    mock_deacon(0.9)
    files = [fastq_file("f1", "reads.fastq")]
    errors, _ = validate_raw_reads_submission(config, str(tmp_path), files, MAX_HOST_PROPORTION)
    assert len(errors) == 1
    assert "host reads proportion" in errors[0].message


def test_missing_url_reports_error_and_skips_deacon(config, tmp_path, monkeypatch):
    def fail_if_called(*args, **kwargs):
        msg = "deacon must not run when the file URL is missing"
        raise AssertionError(msg)

    monkeypatch.setattr(file_processing_functions, "run_deacon_filter", fail_if_called)
    files = [fastq_file("f1", "reads.fastq", url=None)]
    errors, _ = validate_raw_reads_submission(config, str(tmp_path), files, MAX_HOST_PROPORTION)
    assert len(errors) == 1
    assert "no URL for file" in errors[0].message
