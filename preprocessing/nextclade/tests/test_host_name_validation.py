# ruff: noqa: S101

from unittest.mock import MagicMock, patch

import pytest
import requests
from factory_methods import UnprocessedEntryFactory

from loculus_preprocessing import external_services
from loculus_preprocessing.config import Config, get_config
from loculus_preprocessing.datatypes import UnprocessedEntry
from loculus_preprocessing.prepro import process_all

HOST_PROCESSING_CONFIG = "tests/host_processing_config.yaml"


@pytest.fixture(autouse=True)
def clear_taxonomy_caches():
    external_services.taxonomy_cache.clear()


def make_response(status_code, json_data):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    return mock


def make_entry(metadata: dict, config: Config, *, insdc_ingest: bool) -> UnprocessedEntry:
    """An entry with no sequences, submitted either by the INSDC ingest group or directly."""
    insdc_ingest_group_id = config.insdc_ingest_group_id
    return UnprocessedEntryFactory.create_unprocessed_entry(
        metadata_dict=metadata,
        accession_id="01",
        sequences={},
        group_id=insdc_ingest_group_id if insdc_ingest else insdc_ingest_group_id + 1,
        insdc_ingest_group_id=insdc_ingest_group_id,
    )


def taxonomy_service_mock(url: str, **kwargs):
    """Dispatch mock responses based on taxonomy service URL."""
    if "scientific_name=" in url:
        return make_response(
            200,
            [{"tax_id": 7159, "scientific_name": "Aedes aegypti", "depth": 28}],
        )
    if "find_common_name=true" in url:
        return make_response(
            200, {"tax_id": 7159, "common_name": "yellow fever mosquito", "depth": 28}
        )
    if "/taxa/" in url:
        return make_response(200, {"tax_id": 7159, "scientific_name": "Aedes aegypti", "depth": 28})
    return make_response(404, {"detail": "not found"})


@patch.object(external_services.taxonomy_cache, "session")
def test_host_processing_tax_id(mock_session: MagicMock) -> None:
    mock_session.get.side_effect = taxonomy_service_mock
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)
    assert config.processing_order[0] == "hostTaxonId"

    entry = make_entry(
        metadata={"host": "7159"},
        config=config,
        insdc_ingest=False,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] == "7159"
    assert metadata["hostNameScientific"] == "Aedes aegypti"
    assert metadata["hostNameCommon"] == "yellow fever mosquito"
    assert result[0].processed_entry.errors == []

    # Two distinct taxonomy-service URLs are fetched, one hit in taxonomy_cache:
    #   1. resolve_host_taxon_id   -> GET /taxa/7159
    #   2. scientific_name_from_id -> GET /taxa/7159 -> Cached
    #   3. common_name_from_id     -> GET /taxa/7159?find_common_name=true
    assert mock_session.get.call_count == 2


@patch.object(external_services.taxonomy_cache, "session")
def test_host_processing_sci_name(mock_session: MagicMock) -> None:
    mock_session.get.side_effect = taxonomy_service_mock
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)
    assert config.processing_order[0] == "hostTaxonId"

    entry = make_entry(
        metadata={"host": "Aedes aegypti"},
        config=config,
        insdc_ingest=True,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] == "7159"
    assert metadata["hostNameScientific"] == "Aedes aegypti"
    assert metadata["hostNameCommon"] == "yellow fever mosquito"
    assert result[0].processed_entry.errors == []

    # Three distinct taxonomy-service URLs are fetched, so no hits in taxonomy_cache:
    #   1. resolve_host_taxon_id   -> GET /taxa?scientific_name=Aedes+aegypti
    #   2. scientific_name_from_id -> GET /taxa/7159
    #   3. common_name_from_id     -> GET /taxa/7159?find_common_name=true
    assert mock_session.get.call_count == 3


@patch.object(external_services.taxonomy_cache, "session")
def test_host_processing_legacy(mock_session: MagicMock) -> None:
    """Preprocessing used to use the hostTaxonId and hostNameScientific
    fields for host validation. We have since switched to using one
    unified host field. This tests guards against unwanted regressions
    of this behaviour.
    """
    mock_session.get.side_effect = taxonomy_service_mock
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)

    entry = make_entry(
        metadata={
            "hostNameScientific": "Aedes aegypti",
            "hostNameCommon": "yellow fever mosquito",
            "hostTaxonId": "7159",
        },
        config=config,
        insdc_ingest=True,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] is None
    assert metadata["hostNameScientific"] is None
    assert metadata["hostNameCommon"] is None
    assert result[0].processed_entry.errors == []

    # No host field exists so taxonomy service never gets called
    assert mock_session.get.call_count == 0


@patch.object(external_services.taxonomy_cache, "session")
def test_host_processing_invalid_host_insdc(mock_session: MagicMock) -> None:
    """For an INSDC-ingested sequence with an invalid host, the derived host
    fields (hostTaxonId, hostNameScientific, hostNameCommon) should all be
    None, and a warning should be added explaining that host validation failed.
    """
    mock_session.get.return_value = make_response(404, {"detail": "not found"})
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)

    entry = make_entry(
        metadata={"host": "not a real species"},
        config=config,
        insdc_ingest=True,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] is None
    assert metadata["hostNameScientific"] is None
    assert metadata["hostNameCommon"] is None

    assert mock_session.get.call_count == 1
    assert result[0].processed_entry.errors == []
    assert len(result[0].processed_entry.warnings) == 1
    assert "is not a recognized host" in result[0].processed_entry.warnings[0].message


@patch.object(external_services.taxonomy_cache, "session")
def test_host_processing_invalid_host_direct(mock_session: MagicMock) -> None:
    """When a direct submitter provides an invalid host, the derived host
    fields (hostTaxonId, hostNameScientific, hostNameCommon) should all be
    None, and an error (not a warning) should be added explaining that host
    validation failed.
    """
    mock_session.get.return_value = make_response(404, {"detail": "not found"})
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)

    entry = make_entry(
        metadata={"host": "not a real species"},
        config=config,
        insdc_ingest=False,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] is None
    assert metadata["hostNameScientific"] is None
    assert metadata["hostNameCommon"] is None

    assert mock_session.get.call_count == 1
    assert result[0].processed_entry.warnings == []
    assert len(result[0].processed_entry.errors) == 1
    assert "is not a recognized host" in result[0].processed_entry.errors[0].message


@patch.object(external_services.taxonomy_cache, "session")
def test_host_processing_ambiguous_sci_name(mock_session: MagicMock) -> None:
    """When multiple taxa share a scientific name, the most generic one is selected
    and a warning lists the alternatives.
    """
    culex_genus = {
        "tax_id": 7174,
        "scientific_name": "Culex",
        "common_name": "mosquitos",
        "depth": 26,
    }
    culex_subgenus = {**culex_genus, "tax_id": 53527, "parent_id": 7174, "depth": 27}

    def mock(url: str, **kwargs):
        if "scientific_name=" in url:
            return make_response(200, [culex_subgenus, culex_genus])
        if "/taxa/7174" in url:
            return make_response(200, culex_genus)
        return make_response(404, {"detail": "not found"})

    mock_session.get.side_effect = mock
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)

    entry = make_entry(
        metadata={"host": "Culex"},
        config=config,
        insdc_ingest=False,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] == "7174"
    assert metadata["hostNameScientific"] == "Culex"
    assert metadata["hostNameCommon"] == "mosquitos"
    assert result[0].processed_entry.errors == []
    warnings = [warning.message for warning in result[0].processed_entry.warnings]
    assert any("'Culex' matches 2 taxa (53527, 7174)" in warning for warning in warnings), warnings


def invalid_json_response():
    mock = make_response(200, None)
    mock.json.side_effect = requests.exceptions.JSONDecodeError("Expecting value", "", 0)
    return mock


@pytest.mark.parametrize(
    ("side_effect", "expected_message"),
    [
        (
            requests.exceptions.ConnectionError("connection refused"),
            "Network error while contacting taxonomy service.",
        ),
        (
            lambda url, **kwargs: make_response(500, {"detail": "server error"}),
            "Taxonomy service returned unexpected status 500.",
        ),
        (
            lambda url, **kwargs: invalid_json_response(),
            "Taxonomy service returned an unexpected response.",
        ),
    ],
    ids=["request_exception", "unexpected_status", "invalid_json"],
)
@patch.object(external_services.taxonomy_cache, "session")
def test_host_processing_taxonomy_service_failure(
    mock_session: MagicMock, side_effect, expected_message: str
) -> None:
    mock_session.get.side_effect = side_effect
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)

    entry = make_entry(
        metadata={"host": "7159"},
        config=config,
        insdc_ingest=False,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] is None
    error_messages = [error.message for error in result[0].processed_entry.errors]
    assert any(
        message.startswith("Internal Error.") and expected_message in message
        for message in error_messages
    ), error_messages
