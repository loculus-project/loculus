import importlib.util
import io
import json
from pathlib import Path
from unittest import mock

import requests

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "loculus_client.py"
SPEC = importlib.util.spec_from_file_location("loculus_client", SCRIPT_PATH)
loculus_client = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(loculus_client)

CONFIG = loculus_client.Config(
    organism="sars-cov-2",
    backend_url="http://backend",
    keycloak_token_url="http://keycloak/token",  # noqa: S106
    keycloak_client_id="backend-client",
    username="insdc_ingest_user",
    password="secret",  # noqa: S106
    group_name="group",
    nucleotide_sequences=["main"],
    segmented=False,
    batch_chunk_size=1,
)

ENTRIES = [
    {"accession": "LOC_1", "version": 1, "submittedMetadata": {"hash": "a"}},
    {"accession": "LOC_1", "version": 2, "submittedMetadata": {"hash": "b"}},
    {"accession": "LOC_2", "version": 1, "submittedMetadata": {"hash": "é"}},
]
STATUSES = [
    {"accession": "LOC_1", "version": 1, "status": "APPROVED_FOR_RELEASE"},
    {"accession": "LOC_1", "version": 2, "status": "HAS_ERRORS"},
]


def response(body: bytes, total_records: int | None = None) -> requests.Response:
    r = requests.Response()
    r.status_code = 200
    r._content = body
    r._content_consumed = True
    r.raw = io.BytesIO()  # closed by the context manager
    if total_records is not None:
        r.headers["x-total-records"] = str(total_records)
    return r


def backend(metadata_responses: list[list[dict]]):
    """make_request for get-submitted-metadata (one response per call, announcing len(ENTRIES)
    records) and get-sequences"""
    responses = iter(metadata_responses)

    def make_request(method, url, config, params=None, stream=False, **kwargs):
        if url.endswith("/get-sequences"):
            return response(json.dumps({"sequenceEntries": STATUSES}).encode())
        assert stream
        lines = b"".join(json.dumps(e).encode() + b"\n" for e in next(responses))
        return response(lines, total_records=len(ENTRIES))

    return make_request


def test_get_submitted_writes_entries_with_status(tmp_path):
    output = tmp_path / "previous_submissions.ndjson"
    with (
        mock.patch.object(loculus_client, "make_request", backend([ENTRIES[:2], ENTRIES])),
        mock.patch.object(loculus_client, "sleep") as sleep,
    ):
        loculus_client.get_submitted(CONFIG, str(output), ["hash"])
    sleep.assert_called_once()  # the incomplete first stream is retried
    statuses = ["APPROVED_FOR_RELEASE", "HAS_ERRORS", "UNKNOWN"]
    expected = [{**e, "status": s} for e, s in zip(ENTRIES, statuses, strict=True)]
    assert [json.loads(line) for line in output.read_text().splitlines()] == expected
    assert list(tmp_path.iterdir()) == [output]


def test_get_submitted_without_output_returns_the_entries():
    with mock.patch.object(loculus_client, "make_request", backend([ENTRIES])):
        assert loculus_client.get_submitted(CONFIG, None) == ENTRIES
