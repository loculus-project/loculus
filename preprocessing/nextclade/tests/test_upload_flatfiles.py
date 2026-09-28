# ruff: noqa: S101

from collections.abc import Iterator
from unittest.mock import MagicMock, patch

import pytest

from loculus_preprocessing import prepro
from loculus_preprocessing.config import Config
from loculus_preprocessing.datatypes import (
    FileCategory,
    FileIdAndNameAndReadUrl,
    FileUploadInfo,
    ProcessedData,
    ProcessedEntry,
    SubmissionData,
)

EMBL_UPLOAD_ERROR = "Failed to create or upload EMBL file. Please contact your administrator."


def make_submission_data() -> SubmissionData:
    return SubmissionData(
        processed_entry=ProcessedEntry(
            accession="LOC_000001",
            version=1,
            data=ProcessedData(
                metadata={},
                files=None,
                unalignedNucleotideSequences={},
                alignedNucleotideSequences={},
                nucleotideInsertions={},
                alignedAminoAcidSequences={},
                aminoAcidInsertions={},
                sequenceNameToFastaId={},
            ),
        ),
        group_id=1,
    )


class FakeBackend:
    """Issues sequential file IDs like the backend and answers the presigned PUTs like S3,
    where the objects for `existing_serials` are already present."""

    def __init__(self, existing_serials: set[int], put_status_otherwise: int = 200) -> None:
        self.existing_serials = existing_serials
        self.put_status_otherwise = put_status_otherwise
        self.next_serial = 1
        self.requested_counts: list[int] = []
        self.put_urls: list[str] = []

    def request_upload(
        self, group_id: int, number_of_files: int, config: Config
    ) -> list[FileUploadInfo]:
        self.requested_counts.append(number_of_files)
        serials = range(self.next_serial, self.next_serial + number_of_files)
        self.next_serial += number_of_files
        return [
            FileUploadInfo(
                fileId=f"FILE_{serial}",
                url=f"https://s3.example/files/FILE_{serial}",
                headers={"If-None-Match": "*"},
            )
            for serial in serials
        ]

    def put(self, url: str, **kwargs) -> MagicMock:
        self.put_urls.append(url)
        serial = int(url.rsplit("_", 1)[1])
        response = MagicMock()
        response.status_code = 412 if serial in self.existing_serials else self.put_status_otherwise
        response.ok = response.status_code < 400  # noqa: PLR2004
        response.text = ""
        return response


@pytest.fixture
def fake_backend(request: pytest.FixtureRequest) -> Iterator[FakeBackend]:
    backend = FakeBackend(**request.param)
    with (
        patch.object(prepro, "create_flatfile", return_value="ID   LOC_000001\n//\n"),
        patch.object(prepro, "request_upload", side_effect=backend.request_upload),
        patch("loculus_preprocessing.backend.requests.put", side_effect=backend.put),
    ):
        yield backend


def uploaded_annotation_files(submission_data: SubmissionData) -> list[FileIdAndNameAndReadUrl]:
    files = submission_data.processed_entry.data.files or {}
    return files.get(FileCategory.ANNOTATIONS, [])


@pytest.mark.parametrize("fake_backend", [{"existing_serials": set()}], indirect=True)
def test_first_file_id_is_used_when_it_is_free(fake_backend: FakeBackend) -> None:
    submission_data = make_submission_data()

    prepro.upload_flatfiles([submission_data], Config())

    assert fake_backend.requested_counts == [1]
    assert submission_data.processed_entry.errors == []
    assert uploaded_annotation_files(submission_data) == [
        FileIdAndNameAndReadUrl(fileId="FILE_1", name="LOC_000001.1.embl")
    ]


@pytest.mark.parametrize("fake_backend", [{"existing_serials": {1}}], indirect=True)
def test_single_existing_file_id_is_skipped(fake_backend: FakeBackend) -> None:
    submission_data = make_submission_data()

    prepro.upload_flatfiles([submission_data], Config())

    assert fake_backend.requested_counts == [1, 2]
    assert submission_data.processed_entry.errors == []
    assert uploaded_annotation_files(submission_data) == [
        FileIdAndNameAndReadUrl(fileId="FILE_3", name="LOC_000001.1.embl")
    ]


@pytest.mark.parametrize(
    "fake_backend", [{"existing_serials": set(range(1, 31_860))}], indirect=True
)
def test_block_of_existing_file_ids_left_by_a_database_reset_is_skipped(
    fake_backend: FakeBackend,
) -> None:
    first, second = make_submission_data(), make_submission_data()

    prepro.upload_flatfiles([first, second], Config())

    assert fake_backend.requested_counts[:12] == [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 1024]
    assert max(fake_backend.requested_counts) == prepro.MAX_FILE_IDS_PER_REQUEST
    assert len(fake_backend.put_urls) < prepro.MAX_UPLOAD_ATTEMPTS + 1
    assert first.processed_entry.errors == []
    [first_file] = uploaded_annotation_files(first)
    assert int(first_file.fileId.removeprefix("FILE_")) >= 31_860
    # the next entry draws a free ID straight away
    assert fake_backend.requested_counts[-1] == 1
    assert second.processed_entry.errors == []
    [second_file] = uploaded_annotation_files(second)
    assert second_file.fileId == f"FILE_{fake_backend.next_serial - 1}"


@pytest.mark.parametrize(
    "fake_backend", [{"existing_serials": set(range(1, 1_000_000))}], indirect=True
)
def test_entry_gets_error_when_attempts_are_exhausted(fake_backend: FakeBackend) -> None:
    submission_data = make_submission_data()

    prepro.upload_flatfiles([submission_data], Config())

    assert len(fake_backend.put_urls) == prepro.MAX_UPLOAD_ATTEMPTS
    assert uploaded_annotation_files(submission_data) == []
    [error] = submission_data.processed_entry.errors
    assert error.message == EMBL_UPLOAD_ERROR


@pytest.mark.parametrize(
    "fake_backend", [{"existing_serials": set(), "put_status_otherwise": 500}], indirect=True
)
def test_other_upload_failures_are_not_retried(fake_backend: FakeBackend) -> None:
    submission_data = make_submission_data()

    prepro.upload_flatfiles([submission_data], Config())

    assert fake_backend.requested_counts == [1]
    assert uploaded_annotation_files(submission_data) == []
    [error] = submission_data.processed_entry.errors
    assert error.message == EMBL_UPLOAD_ERROR
