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
        errors, warnings = service.process_files(make_files())

    mock_post.assert_not_called()
    assert warnings == []
    assert len(errors) == 1
    assert "File processing service URL is not configured." in errors[0].message
    assert errors[0].unprocessedFields == (
        AnnotationSource("reads.fastq, annotations.gff", AnnotationSourceType.FILE),
    )


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_sends_expected_request(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(200, {"errors": [], "warnings": []})
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    service.process_files(make_files())

    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == f"{SERVICE_URL}/process-files"
    assert kwargs["timeout"] == 10  # noqa: PLR2004
    assert kwargs["json"] == {
        "raw_reads": [{"fileId": "id-1", "name": "reads.fastq", "url": "http://example/id-1"}],
        "annotations": [{"fileId": "id-2", "name": "annotations.gff", "url": None}],
    }


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_success_returns_no_annotations(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(200, {"errors": [], "warnings": []})
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors, warnings = service.process_files(make_files())

    assert errors == []
    assert warnings == []


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_maps_response_errors_and_warnings(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(
        200,
        {
            "errors": [{"fileName": "reads.fastq", "message": "invalid checksum"}],
            "warnings": [{"fileName": "annotations.gff", "message": "unexpected extension"}],
        },
    )
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors, warnings = service.process_files(make_files())

    assert len(errors) == 1
    assert errors[0].message == "invalid checksum"
    assert errors[0].unprocessedFields == (
        AnnotationSource("reads.fastq", AnnotationSourceType.FILE),
    )

    assert len(warnings) == 1
    assert warnings[0].message == "unexpected extension"
    assert warnings[0].unprocessedFields == (
        AnnotationSource("annotations.gff", AnnotationSourceType.FILE),
    )


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_handles_missing_error_and_warning_keys(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(200, {})
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors, warnings = service.process_files(make_files())

    assert errors == []
    assert warnings == []


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_http_error_returns_internal_error(mock_post: MagicMock) -> None:
    mock_post.return_value = make_response(500, {"detail": "boom"})
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors, warnings = service.process_files(make_files())

    assert warnings == []
    assert len(errors) == 1
    assert "occurred while processing files" in errors[0].message


@patch("loculus_preprocessing.external_services.requests.post")
def test_process_files_network_error_returns_internal_error(mock_post: MagicMock) -> None:
    mock_post.side_effect = requests.exceptions.ConnectionError("connection refused")
    service = FileProcessingService(file_processing_service_url=SERVICE_URL)

    errors, warnings = service.process_files(make_files())

    assert warnings == []
    assert len(errors) == 1
    assert "connection refused" in errors[0].message
    assert errors[0].unprocessedFields == (
        AnnotationSource("reads.fastq, annotations.gff", AnnotationSourceType.FILE),
    )
