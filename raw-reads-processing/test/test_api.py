import gzip
from unittest.mock import Mock

import pytest
from conftest import assert_storable
from fastapi.testclient import TestClient

from raw_reads_processing import api, process_files
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


@pytest.mark.parametrize(
    ("raised", "status", "expected"),
    [
        (
            lambda: InvalidSubmission(
                error=Annotation(fileNames=["reads\x00.fq.gz"], message="line \x00 1")
            ),
            200,
            "reads<NUL>.fq.gz",
        ),
        (
            lambda: ProcessingFailure("Could not download 'reads\x00.fq.gz'"),
            500,
            "reads<NUL>.fq.gz",
        ),
    ],
)
def test_null_bytes_never_reach_the_response_body(
    client, monkeypatch, raised, status, expected
):
    def fail(**kwargs):
        raise raised()

    monkeypatch.setattr(api, "validate_raw_reads_submission", fail)

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == status
    assert "\\u0000" not in response.text
    assert expected in response.text


@pytest.mark.usefixtures("readtools_jar")
def test_null_byte_in_a_submitted_file_survives_the_whole_service(
    client, monkeypatch, tmp_path
):
    """HTTP in, real readtools, HTTP out - the trigger from the issue."""
    gz_path = tmp_path / "reads.fastq.gz"
    with gzip.open(gz_path, "wb") as f:
        f.write(b"notes\x00more\n")

    monkeypatch.setattr(
        process_files,
        "download_file",
        lambda config, file, save_path: save_path.write_bytes(gz_path.read_bytes()),
    )

    response = client.post("/process-files", json=VALID_PAYLOAD)

    assert response.status_code == 200
    assert_storable(response.text)
    message = response.json()["errors"][0]["message"]
    assert "readtools" in message  # the jar really ran
    assert "notes<NUL>more" in message
