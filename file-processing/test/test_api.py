# ruff: noqa: S101
import pytest
from fastapi.testclient import TestClient

from file_processing import api
from file_processing.config import Config
from file_processing.datatypes import Annotation, FileCategory
from file_processing.errors import InvalidSubmission, ProcessingFailure

VALID_PAYLOAD = {
    "files": {
        "rawReads": [
            {
                "fileId": "1",
                "name": "reads.fastq",
                "url": "http://example.com/reads.fastq",
            }
        ]
    },
    "accessionVersion": "LOC_0001.1",
}


@pytest.fixture
def client():
    api.init_app(
        Config(
            log_level="INFO",
            s3_request_timeout_seconds=10,
            read_validation_timeout_seconds=10,
        )
    )
    return TestClient(api.app)


def test_successful_submission_returns_empty_validation_result(client, monkeypatch):
    monkeypatch.setattr(api, "process_submitted_files", lambda **kwargs: None)

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == 200
    assert response.json() == {"errors": []}


def test_invalid_submission_is_returned_as_validation_result(client, monkeypatch):
    error = Annotation(
        fileNames=["reads.fastq"],
        fileCategory=FileCategory.RAW_READS,
        message="File is not in accepted format.",
    )

    def fake_process_submitted_files(**kwargs):
        raise InvalidSubmission(error=error)

    monkeypatch.setattr(api, "process_submitted_files", fake_process_submitted_files)

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == 200
    assert response.json() == {"errors": [error.model_dump(mode="json")]}


def test_processing_failure_is_returned_as_internal_server_error(client, monkeypatch):
    def fake_process_submitted_files(**kwargs):
        raise ProcessingFailure("readtools jar not found")

    monkeypatch.setattr(api, "process_submitted_files", fake_process_submitted_files)

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == 500
    assert response.json() == {"detail": "readtools jar not found"}
