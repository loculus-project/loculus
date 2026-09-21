# ruff: noqa: S101
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from raw_reads_processing import api
from raw_reads_processing.config import Config
from raw_reads_processing.datatypes import Annotation
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure

VALID_PAYLOAD = {
    "files": [
        {
            "fileId": "1",
            "name": "reads.fastq.gz",
            "url": "http://example.com/reads.fastq.gz",
        }
    ],
    "accessionVersion": "LOC_0001.1",
}


@pytest.fixture
def client():
    api.init_app(
        Config(
            log_level="INFO",
            s3_request_timeout_seconds=10,
            read_validation_timeout_seconds=10,
            deacon_filter_timeout_seconds=10,
            deacon_max_host_reads_proportion=0.05,
            deacon_max_host_bp=1000,
        ),
        deacon_process=Mock(poll=Mock(return_value=None)),
    )
    return TestClient(api.app)


def test_successful_submission_returns_empty_validation_result(client, monkeypatch):
    monkeypatch.setattr(api, "validate_raw_reads_submission", lambda **kwargs: None)

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == 200
    assert response.json() == {"errors": []}


def test_invalid_submission_is_returned_as_validation_result(client, monkeypatch):
    error = Annotation(
        fileNames=["reads.fastq.gz"],
        message="File is not in accepted format.",
    )

    def fake_process_submitted_files(**kwargs):
        raise InvalidSubmission(error=error)

    monkeypatch.setattr(
        api, "validate_raw_reads_submission", fake_process_submitted_files
    )

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == 200
    assert response.json() == {"errors": [error.model_dump(mode="json")]}


def test_processing_failure_is_returned_as_internal_server_error(client, monkeypatch):
    def fake_process_submitted_files(**kwargs):
        raise ProcessingFailure("readtools jar not found")

    monkeypatch.setattr(
        api, "validate_raw_reads_submission", fake_process_submitted_files
    )

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == 500
    assert response.json() == {"detail": "readtools jar not found"}


def test_health_is_ok_while_deacon_process_is_alive(client):
    response = client.get("/health")

    assert response.status_code == 200


def test_health_is_unavailable_once_deacon_process_has_exited(client):
    api.app.state.deacon_process.poll.return_value = 1  # exit code of the dead process

    response = client.get("/health")

    assert response.status_code == 503


def test_null_byte_in_validation_error_is_not_serialized_into_the_response(
    client, monkeypatch
):
    """Postgres rejects \\u0000 inside jsonb, which rolls back the whole
    submit-processed-data batch, so it must never leave this service."""

    def fake_process_submitted_files(**kwargs):
        raise InvalidSubmission(
            error=Annotation(
                fileNames=["reads\x00.fastq.gz"],
                message="Sequence header must start with @: notes\x00more at line 1",
            )
        )

    monkeypatch.setattr(
        api, "validate_raw_reads_submission", fake_process_submitted_files
    )

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == 200
    assert "\\u0000" not in response.text
    assert "\\ud" not in response.text
    error = response.json()["errors"][0]
    assert error["fileNames"] == ["reads<NUL>.fastq.gz"]
    assert "notes<NUL>more" in error["message"]


def test_null_byte_in_processing_failure_detail_is_sanitized(client, monkeypatch):
    """Preprocessing turns a 500 detail into an annotation of its own, so it
    reaches Postgres on the same path as a validation message."""

    def fake_process_submitted_files(**kwargs):
        raise ProcessingFailure("Error downloading file 'reads\x00.fastq.gz' from S3")

    monkeypatch.setattr(
        api, "validate_raw_reads_submission", fake_process_submitted_files
    )

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == 500
    assert "\\u0000" not in response.text
    assert response.json()["detail"] == (
        "Error downloading file 'reads<NUL>.fastq.gz' from S3"
    )
