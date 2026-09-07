# ruff: noqa: S101
import threading

import pytest

from raw_reads_processing import process_files as process_files_module
from raw_reads_processing.config import Config
from raw_reads_processing.datatypes import FileIdAndNameAndReadUrl
from raw_reads_processing.errors import ProcessingFailure
from raw_reads_processing.process_files import download_files


@pytest.fixture
def config():
    return Config(
        log_level="INFO",
        s3_request_timeout_seconds=10,
        read_validation_timeout_seconds=10,
        deacon_filter_timeout_seconds=10,
        deacon_max_host_reads_proportion=0.05,
        deacon_max_host_bp=1000,
    )


def paired_files() -> list[FileIdAndNameAndReadUrl]:
    return [
        FileIdAndNameAndReadUrl(
            fileId=f"file-{mate}",
            name=f"reads_{mate}.fastq.gz",
            url=f"http://example/{mate}",
        )
        for mate in (1, 2)
    ]


def test_both_mates_are_downloaded_at_the_same_time(config, monkeypatch, tmp_path):
    files = paired_files()
    # Each download waits for the other, so a sequential implementation would time out
    barrier = threading.Barrier(len(files), timeout=10)

    def fake_download(config, file, save_path):
        barrier.wait()
        save_path.write_bytes(b"")

    monkeypatch.setattr(process_files_module, "download_file", fake_download)

    local_files = download_files(config, files, tmp_path)

    assert local_files == {file.name: tmp_path / file.fileId for file in files}
    assert all(path.exists() for path in local_files.values())


def test_a_failing_download_propagates(config, monkeypatch, tmp_path):
    def fake_download(config, file, save_path):
        if file.fileId == "file-2":
            raise ProcessingFailure(f"Error downloading file '{file.name}' from S3")
        save_path.write_bytes(b"")

    monkeypatch.setattr(process_files_module, "download_file", fake_download)

    with pytest.raises(ProcessingFailure, match="reads_2.fastq.gz"):
        download_files(config, paired_files(), tmp_path)


def test_single_end_submission_downloads_one_file(config, monkeypatch, tmp_path):
    monkeypatch.setattr(
        process_files_module,
        "download_file",
        lambda config, file, save_path: save_path.write_bytes(b""),
    )
    files = paired_files()[:1]

    local_files = download_files(config, files, tmp_path)

    assert local_files == {files[0].name: tmp_path / files[0].fileId}
