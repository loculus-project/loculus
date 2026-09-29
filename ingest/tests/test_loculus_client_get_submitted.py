import importlib.util
import io
import json
from pathlib import Path
from unittest import mock

import pytest
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

# as the backend sends them: status is not the last key
ENTRIES = [
    {
        "accession": "LOC_1",
        "version": 1,
        "status": "APPROVED_FOR_RELEASE",
        "submittedMetadata": {"hash": "a"},
    },
    {"accession": "LOC_1", "version": 2, "status": "PROCESSED", "submittedMetadata": {"hash": "b"}},
    {"accession": "LOC_2", "version": 1, "status": "RECEIVED", "submittedMetadata": {"hash": "é"}},
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
    records)"""
    responses = iter(metadata_responses)

    def make_request(method, url, config, params=None, stream=False, **kwargs):
        assert url.endswith("/get-submitted-metadata")
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
    # status moves to the end of each entry, where the files always had it
    expected = [
        {k: v for k, v in e.items() if k != "status"} | {"status": e["status"]} for e in ENTRIES
    ]
    lines = output.read_text().splitlines()
    assert [list(json.loads(line)) for line in lines] == [list(e) for e in expected]
    assert [json.loads(line) for line in lines] == expected
    assert list(tmp_path.iterdir()) == [output]


def test_get_submitted_rejects_entries_without_status(tmp_path):
    output = tmp_path / "previous_submissions.ndjson"
    without_status = [{k: v for k, v in e.items() if k != "status"} for e in ENTRIES]
    attempts = loculus_client.SUBMITTED_RETRY_MAX_ATTEMPTS
    with (
        mock.patch.object(loculus_client, "make_request", backend([without_status] * attempts)),
        mock.patch.object(loculus_client, "sleep"),
        pytest.raises(requests.ConnectionError, match="without status"),
    ):
        loculus_client.get_submitted(CONFIG, str(output), ["hash"])
    assert list(tmp_path.iterdir()) == []


def test_get_submitted_retries_an_old_backend_pod(tmp_path):
    output = tmp_path / "previous_submissions.ndjson"
    without_status = [{k: v for k, v in e.items() if k != "status"} for e in ENTRIES]
    with (
        mock.patch.object(loculus_client, "make_request", backend([without_status, ENTRIES])),
        mock.patch.object(loculus_client, "sleep") as sleep,
    ):
        loculus_client.get_submitted(CONFIG, str(output), ["hash"])
    sleep.assert_called_once()
    assert len(output.read_text().splitlines()) == len(ENTRIES)


def test_get_submitted_without_output_returns_the_entries():
    with mock.patch.object(loculus_client, "make_request", backend([ENTRIES])):
        assert loculus_client.get_submitted(CONFIG, None) == ENTRIES


def stream(entries: list[dict], then: Exception | bytes | None = None) -> requests.Response:
    """A get-submitted-metadata response announcing len(ENTRIES) records that yields the lines of
    entries, then raises then (an exception) or yields it (a partial line)"""
    r = response(b"", total_records=len(ENTRIES))

    def iter_lines(chunk_size):
        for e in entries:
            yield json.dumps(e).encode()
        if isinstance(then, Exception):
            raise then
        if then is not None:
            yield then

    r.iter_lines = iter_lines
    return r


def http_error(status: int) -> requests.HTTPError:
    r = requests.Response()
    r.status_code = status
    return requests.HTTPError(f"{status}", response=r)


def failing_backend(outcomes: list):
    """make_request that returns (a response) or raises (an exception) the next outcome per call"""
    calls = iter(outcomes)

    def make_request(method, url, config, params=None, stream=False, **kwargs):
        outcome = next(calls)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    return make_request


def test_get_submitted_retries_a_rollout_from_scratch(tmp_path):
    output = tmp_path / "previous_submissions.ndjson"
    outcomes = [
        stream(ENTRIES[:1], then=requests.exceptions.ChunkedEncodingError("connection broken")),
        http_error(502),
        stream(ENTRIES[:2], then=b'{"accession": "LOC_2", "ver'),  # cut mid-line
        requests.ConnectionError("connection refused"),
        stream(ENTRIES),
    ]
    with (
        mock.patch.object(loculus_client, "make_request", failing_backend(outcomes)),
        mock.patch.object(loculus_client, "sleep") as sleep,
    ):
        loculus_client.get_submitted(CONFIG, str(output), ["hash"])
    assert [c.args[0] for c in sleep.call_args_list] == [10, 20, 40, 80]
    lines = output.read_text().splitlines()
    assert [(e["accession"], e["version"]) for e in map(json.loads, lines)] == [
        (e["accession"], e["version"]) for e in ENTRIES
    ]
    assert list(tmp_path.iterdir()) == [output]


def test_get_submitted_gives_up_after_the_last_attempt(tmp_path):
    output = tmp_path / "previous_submissions.ndjson"
    attempts = loculus_client.SUBMITTED_RETRY_MAX_ATTEMPTS
    outcomes = [stream(ENTRIES[:1], then=b"{")] + [http_error(503)] * (attempts - 1)
    with (
        mock.patch.object(loculus_client, "make_request", failing_backend(outcomes)),
        mock.patch.object(loculus_client, "sleep") as sleep,
        pytest.raises(requests.ConnectionError, match=f"failed {attempts} times, last: status 503"),
    ):
        loculus_client.get_submitted(CONFIG, str(output), ["hash"])
    delays = [c.args[0] for c in sleep.call_args_list]
    assert len(delays) == attempts - 1
    assert max(delays) == loculus_client.SUBMITTED_RETRY_MAX_DELAY_SECONDS
    assert list(tmp_path.iterdir()) == []


def test_get_submitted_does_not_retry_a_client_error(tmp_path):
    output = tmp_path / "previous_submissions.ndjson"
    with (
        mock.patch.object(loculus_client, "make_request", failing_backend([http_error(403)])),
        mock.patch.object(loculus_client, "sleep") as sleep,
        pytest.raises(requests.HTTPError),
    ):
        loculus_client.get_submitted(CONFIG, str(output), ["hash"])
    sleep.assert_not_called()


def test_get_submitted_without_output_retries_too():
    outcomes = [http_error(502), stream(ENTRIES)]
    with (
        mock.patch.object(loculus_client, "make_request", failing_backend(outcomes)),
        mock.patch.object(loculus_client, "sleep"),
    ):
        assert loculus_client.get_submitted(CONFIG, None) == ENTRIES
