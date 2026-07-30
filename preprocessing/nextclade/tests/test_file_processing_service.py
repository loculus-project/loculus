# ruff: noqa: S101

from unittest.mock import MagicMock, patch

import requests

from loculus_preprocessing.datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    FileCategory,
    FileIdAndNameAndReadUrl,
)
from loculus_preprocessing.external_services import FileProcessingService

SERVICE_URL = "http://file-processing.example"


def make_response(status_code: int, json_data: dict) -> MagicMock:
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    if status_code >= 400:  # noqa: PLR2004
        mock.raise_for_status.side_effect = requests.exceptions.HTTPError(response=mock)
    return mock


def make_files() -> dict[FileCategory, list[FileIdAndNameAndReadUrl]]:
    return {
        FileCategory.RAW_READS: [
            FileIdAndNameAndReadUrl(fileId="id-1", name="reads.fastq", url="http://example/id-1")
        ],
        FileCategory.ANNOTATIONS: [
            FileIdAndNameAndReadUrl(fileId="id-2", name="annotations.gff", url=None)
        ],
    }


def test_process_files_without_configured_url_returns_error_without_request() -> None:
    service = FileProcessingService(file_processing_service_url=None)

    with patch("loculus_preprocessing.external_services.requests.post") as mock_post:
        errors = service.process_files(make_files(), "accession.1")

    mock_post.assert_not_called()
    assert len(errors) == 1
    assert "File processing service URL is not configured." in errors[0].message
    assert errors[0].unprocessedFields == (
        AnnotationSource("reads.fastq, annotations.gff", AnnotationSourceType.FILE),
    )


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_sends_expected_request(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(200, {"errors": []})
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    service.process_files(make_files(), "accession.1")

    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == f"{SERVICE_URL}/process-files"
    assert kwargs["timeout"] == service.timeout_seconds
    assert kwargs["json"] == {
        "files": {
            "rawReads": [{"fileId": "id-1", "name": "reads.fastq", "url": "http://example/id-1"}],
            "annotations": [{"fileId": "id-2", "name": "annotations.gff", "url": None}],
        },
        "accessionVersion": "accession.1",
    }


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_uses_configured_timeout(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(200, {"errors": []})
    service = FileProcessingService(file_processing_service_url=SERVICE_URL, timeout_seconds=45)

    service.process_files(make_files(), "accession.1")

    _, kwargs = mock_post.call_args
    assert kwargs["timeout"] == 45  # noqa: PLR2004


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_success_returns_no_annotations(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(200, {"errors": []})
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors = service.process_files(make_files(), "accession.1")

    assert errors == []


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_maps_response_errors(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(
        200,
        {
            "errors": [{"fileNames": ["reads.fastq"], "message": "invalid checksum"}],
        },
    )
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors = service.process_files(make_files(), "accession.1")

    assert len(errors) == 1
    assert errors[0].message == "invalid checksum"
    assert errors[0].unprocessedFields == (
        AnnotationSource("reads.fastq", AnnotationSourceType.FILE),
    )


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_handles_missing_error_keys(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(200, {})
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors = service.process_files(make_files(), "accession.1")

    assert errors == []


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_http_error_returns_internal_error(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(500, {"detail": "boom"})
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors = service.process_files(make_files(), "accession.1")

    assert len(errors) == 1
    assert "occurred while processing files" in errors[0].message


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_network_error_returns_internal_error(mock_post: MagicMock) -> None:
    mock_post.side_effect = requests.exceptions.ConnectionError("connection refused")
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors = service.process_files(make_files(), "accession.1")

    assert len(errors) == 1
    assert "connection refused" in errors[0].message
    assert errors[0].unprocessedFields == (
        AnnotationSource("reads.fastq, annotations.gff", AnnotationSourceType.FILE),
    )
