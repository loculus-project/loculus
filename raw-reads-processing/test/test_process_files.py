# ruff: noqa: S101

import pytest
from raw_reads_processing import process_files
from raw_reads_processing.config import Config
from raw_reads_processing.datatypes import FileIdAndNameAndReadUrl
from raw_reads_processing.errors import InvalidSubmission


def _config(max_input_file_bytes: int) -> Config:
    return Config(
        log_level="DEBUG",
        s3_request_timeout_seconds=10,
        read_validation_timeout_seconds=10,
        max_input_file_bytes=max_input_file_bytes,
        deacon_max_host_reads_proportion=0.05,
        deacon_max_host_bp=1000,
    )


class _FakeResponse:
    def __init__(self, chunks: list[bytes]):
        self._chunks = chunks

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def raise_for_status(self) -> None:
        pass

    def iter_content(self, chunk_size: int):
        yield from self._chunks


@pytest.fixture
def four_chunks_of_ten_bytes(monkeypatch):
    monkeypatch.setattr(
        process_files.requests,
        "get",
        lambda *a, **k: _FakeResponse([b"x" * 10] * 4),
    )


@pytest.mark.usefixtures("four_chunks_of_ten_bytes")
def test_download_under_the_size_cap_is_kept(tmp_path):
    save_path = tmp_path / "reads.fastq"
    file = FileIdAndNameAndReadUrl(fileId="1", name="reads.fastq", url="http://s3/x")

    process_files.download_file(_config(40), file, save_path)

    assert save_path.stat().st_size == 40


@pytest.mark.usefixtures("four_chunks_of_ten_bytes")
def test_download_over_the_size_cap_is_rejected_before_it_completes(tmp_path):
    # The size cap is what bounds deacon's runtime now that an in-process filter call
    # cannot be killed on a timeout, so it has to stop mid-stream rather than after.
    save_path = tmp_path / "reads.fastq"
    file = FileIdAndNameAndReadUrl(fileId="1", name="reads.fastq", url="http://s3/x")

    with pytest.raises(InvalidSubmission) as exc_info:
        process_files.download_file(_config(25), file, save_path)

    assert "larger than the maximum accepted size" in exc_info.value.error.message
    assert save_path.stat().st_size < 40  # aborted, not written in full
