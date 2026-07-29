# ruff: noqa: S101

from pathlib import Path

import pytest
from file_processing import functions
from file_processing.config import Config
from file_processing.datatypes import (
    FileIdAndNameAndReadUrl,
)
from file_processing.functions import (
    _sanitize_file_name,
    validate_raw_reads_submission,
)


def _config() -> Config:
    return Config(
        log_level="DEBUG",
        s3_request_timeout_seconds=10,
        read_validation_timeout_seconds=10,
    )


@pytest.mark.parametrize(
    "name",
    [
        "../../etc/passwd.fastq",
        "..\\..\\windows\\system32\\evil.fastq",
        "/etc/passwd.fastq",
        "a/../../b.fastq",
    ],
)
def test_sanitize_file_name_strips_directory_components(name):
    sanitized, annotations = _sanitize_file_name(name)
    assert annotations is None
    assert sanitized is not None
    assert "/" not in sanitized
    assert "\\" not in sanitized
    assert ".." not in Path(sanitized).parts


@pytest.mark.parametrize("name", ["", ".", "..", "   "])
def test_sanitize_file_name_rejects_empty_or_dot_names(name):
    sanitized, annotations = _sanitize_file_name(name)
    assert annotations is not None


def test_validate_raw_reads_submission_download_stays_within_tmp_dir(monkeypatch):
    written_paths = []

    def fake_download_file(config, url, save_path):
        written_paths.append(save_path)
        save_path.write_text("@seq1\nACGT\n+\nIIII\n")

    monkeypatch.setattr(functions, "download_file", fake_download_file)
    monkeypatch.setattr(functions, "validate_with_readtools", lambda *a, **k: None)

    malicious_file = FileIdAndNameAndReadUrl(
        fileId="id1", name="../../../etc/passwd.fastq", url="http://example.com/f"
    )
    response = validate_raw_reads_submission(_config(), [malicious_file])

    assert response.errors == []
    assert len(written_paths) == 1
    assert ".." not in written_paths[0].parts
