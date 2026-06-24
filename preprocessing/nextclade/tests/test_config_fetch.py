"""Tests for fetching the pipeline config from the Loculus backend.

The backend stores an opaque, pipeline-owned config file per (organism, pipeline
version) and serves the organism's metadata field list. The pipeline combines
them: the config file provides datasets/alignment/EMBL and any non-identity
processing specs, while every remaining metadata field gets an identity copy.
"""

import pytest

from loculus_preprocessing.config import (
    build_identity_processing_specs,
    fetch_config_from_backend,
)


def test_build_identity_specs_single_segment():
    specs = build_identity_processing_specs(
        [{"name": "country", "type": "string"}, {"name": "date", "type": "date"}],
        segment_names=[],
    )
    assert specs == {
        "country": {"function": "identity", "inputs": {"input": "country"}},
        "date": {"function": "identity", "inputs": {"input": "date"}},
    }


def test_build_identity_specs_expands_per_segment():
    specs = build_identity_processing_specs(
        [
            {"name": "country", "type": "string"},
            {"name": "coverage", "type": "float", "perSegment": True},
        ],
        segment_names=["L", "M"],
    )
    assert set(specs) == {"country", "coverage_L", "coverage_M"}
    assert specs["coverage_L"] == {"function": "identity", "inputs": {"input": "coverage_L"}}


class _FakeResponse:
    def __init__(self, status_code: int, *, text: str = "", payload: object = None):
        self.status_code = status_code
        self.text = text
        self._payload = payload

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self):
        return self._payload


@pytest.fixture
def patched_backend(monkeypatch):
    """Patch requests.get so the two endpoints return canned responses."""

    config_yaml = (
        "batch_size: 50\n"
        "segments:\n"
        "  - name: L\n"
        "  - name: M\n"
        "processing_spec:\n"
        "  date:\n"
        "    function: parse_date\n"
        "    inputs: {date: date}\n"
    )
    metadata_payload = {
        "config": {
            "schema": {
                "metadata": [
                    {"name": "date", "type": "date"},
                    {"name": "coverage", "type": "float", "perSegment": True},
                    {"name": "country", "type": "string"},
                ]
            }
        }
    }

    def fake_get(url, timeout=None):
        if url.endswith("/preprocessing/1"):
            return _FakeResponse(200, text=config_yaml)
        if url.endswith("/organisms/ebola-sudan"):
            return _FakeResponse(200, payload=metadata_payload)
        raise AssertionError(f"unexpected URL {url}")

    monkeypatch.setattr("loculus_preprocessing.config.requests.get", fake_get)


def test_fetch_merges_config_file_and_identity_defaults(patched_backend):
    config_dict = fetch_config_from_backend("http://backend:8079/ebola-sudan", "ebola-sudan", 1)

    # The explicit config-file values survive.
    assert config_dict["batch_size"] == 50
    assert config_dict["organism"] == "ebola-sudan"

    spec = config_dict["processing_spec"]
    # Per-segment field is expanded over the segments declared in the file.
    assert "coverage_L" in spec and "coverage_M" in spec
    # A plain field gets an identity default.
    assert spec["country"] == {"function": "identity", "inputs": {"input": "country"}}
    # The config file's explicit spec wins over the identity default.
    assert spec["date"]["function"] == "parse_date"


def test_fetch_handles_missing_config_file(monkeypatch):
    metadata_payload = {"config": {"schema": {"metadata": [{"name": "country", "type": "string"}]}}}

    def fake_get(url, timeout=None):
        if url.endswith("/preprocessing/1"):
            return _FakeResponse(404)
        return _FakeResponse(200, payload=metadata_payload)

    monkeypatch.setattr("loculus_preprocessing.config.requests.get", fake_get)

    config_dict = fetch_config_from_backend("http://backend:8079/mpox", "mpox", 1)
    # Still derives identity specs from metadata even with no config file.
    assert config_dict["processing_spec"] == {
        "country": {"function": "identity", "inputs": {"input": "country"}}
    }
    assert config_dict["organism"] == "mpox"


def test_fetch_raises_on_backend_error(monkeypatch):
    monkeypatch.setattr(
        "loculus_preprocessing.config.requests.get",
        lambda url, timeout=None: _FakeResponse(500),
    )
    with pytest.raises(RuntimeError):
        fetch_config_from_backend("http://backend:8079/mpox", "mpox", 1)
