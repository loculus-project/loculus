# ruff: noqa: S101

from unittest.mock import MagicMock, patch

import pytest
from test_metadata_processing_functions import make_response

from loculus_preprocessing import processing_functions
from loculus_preprocessing.config import get_config
from loculus_preprocessing.datatypes import UnprocessedData, UnprocessedEntry
from loculus_preprocessing.prepro import process_all

HOST_PROCESSING_CONFIG = "tests/host_processing_config.yaml"


@pytest.fixture(autouse=True)
def clear_taxonomy_caches():
    processing_functions.taxonomy_cache.clear()


def make_entry(metadata: dict, group_id: int) -> UnprocessedEntry:
    return UnprocessedEntry(
        accessionVersion="LOC_01.1",
        data=UnprocessedData(
            submitter="test_submitter",
            submissionId="test_submission_id",
            submittedAt="2026-01-01",
            group_id=group_id,
            metadata=metadata,
            unalignedNucleotideSequences={},
        ),
    )


def taxonomy_service_mock(url: str, **kwargs):
    """Dispatch mock responses based on taxonomy service URL."""
    if "scientific_name=" in url:
        return make_response(
            200,
            [{"tax_id": 7159, "scientific_name": "Aedes aegypti", "depth": 28}],
        )
    if "find_common_name=true" in url:
        return make_response(200, {"common_name": "yellow fever mosquito"})
    if "/taxa/" in url:
        return make_response(200, {"tax_id": 7159, "scientific_name": "Aedes aegypti"})
    return make_response(404, {"detail": "not found"})


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_host_processing_direct_submission(mock_get: MagicMock) -> None:
    mock_get.side_effect = taxonomy_service_mock
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)
    assert config.processing_order[0] == "hostTaxonId"

    entry = make_entry(
        metadata={"hostIdentifier": "Aedes aegypti"},
        group_id=config.insdc_ingest_group_id + 1,  # direct submission — not INSDC
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] == 7159
    assert metadata["hostNameScientific"] == "Aedes aegypti"
    assert metadata["hostNameCommon"] == "yellow fever mosquito"
    assert result[0].processed_entry.errors == []

    # All three fields should have hit the taxonomy service
    assert mock_get.call_count == 3


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_host_processing_insdc(mock_get: MagicMock) -> None:
    mock_get.side_effect = taxonomy_service_mock
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)

    entry = make_entry(
        metadata={
            "hostNameScientific": "Aedes aegypti",
            "hostTaxonId": "7159",
        },
        group_id=config.insdc_ingest_group_id,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] == 7159
    assert metadata["hostNameScientific"] == "Aedes aegypti"
    assert metadata["hostNameCommon"] == "yellow fever mosquito"
    assert result[0].processed_entry.errors == []

    # Three lookups, one cache hit: taxon_id, scientific name (cached), common name
    assert mock_get.call_count == 2


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_host_processing_invalid_hostname(mock_get: MagicMock) -> None:
    """When hostNameScientific is not found in the taxonomy, hostTaxonId is None,
    which causes hostNameScientific and hostNameCommon to also fail."""
    mock_get.return_value = make_response(404, {"detail": "not found"})
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)

    entry = make_entry(
        metadata={"hostNameScientific": "not a real species"},
        group_id=config.insdc_ingest_group_id,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] is None
    assert metadata["hostNameScientific"] is None
    assert metadata["hostNameCommon"] is None

    # Only check for hostNameScientific should hit the taxonomy service
    assert mock_get.call_count == 1
    assert len(result[0].processed_entry.warnings) == 1
    assert result[0].processed_entry.errors == []


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_host_processing_invalid_identifier_direct_submission(mock_get: MagicMock) -> None:
    """When a direct submitter provides an invalid hostIdentifier, validation fails with an error."""
    mock_get.return_value = make_response(404, {"detail": "not found"})
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)

    entry = make_entry(
        metadata={"hostIdentifier": "not a real species"},
        group_id=config.insdc_ingest_group_id + 1,  # direct submission — not INSDC
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] is None
    assert metadata["hostNameScientific"] is None
    assert metadata["hostNameCommon"] is None

    assert mock_get.call_count == 1
    assert len(result[0].processed_entry.errors) == 1
    assert result[0].processed_entry.warnings == []
