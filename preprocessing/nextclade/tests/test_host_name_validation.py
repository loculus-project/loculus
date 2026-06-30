# ruff: noqa: S101

from unittest.mock import MagicMock, patch

import pytest

from loculus_preprocessing import processing_functions
from loculus_preprocessing.config import get_config
from loculus_preprocessing.datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    UnprocessedData,
    UnprocessedEntry,
)
from loculus_preprocessing.prepro import process_all
from loculus_preprocessing.processing_functions import ProcessingFunctions

HOST_PROCESSING_CONFIG = "tests/host_processing_config.yaml"


@pytest.fixture(autouse=True)
def clear_taxonomy_caches():
    processing_functions.taxonomy_cache.clear()


def make_response(status_code, json_data):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    return mock


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


@patch.object(processing_functions.taxonomy_cache, "session")
def test_host_processing_tax_id(mock_session: MagicMock) -> None:
    mock_session.get.side_effect = taxonomy_service_mock
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)
    assert config.processing_order[0] == "hostTaxonId"

    entry = make_entry(
        metadata={"host": "7159"},
        group_id=config.insdc_ingest_group_id + 1,
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


@patch.object(processing_functions.taxonomy_cache, "session")
def test_host_processing_sci_name(mock_session: MagicMock) -> None:
    mock_session.get.side_effect = taxonomy_service_mock
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)
    assert config.processing_order[0] == "hostTaxonId"

    entry = make_entry(
        metadata={"host": "Aedes aegypti"},
        group_id=config.insdc_ingest_group_id,
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


@patch.object(processing_functions.taxonomy_cache, "session")
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
        group_id=config.insdc_ingest_group_id,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] is None
    assert metadata["hostNameScientific"] is None
    assert metadata["hostNameCommon"] is None
    assert result[0].processed_entry.errors == []

    # No host field exists so taxonomy service never gets called
    assert mock_session.get.call_count == 0


@patch.object(processing_functions.taxonomy_cache, "session")
def test_host_processing_invalid_host_insdc(mock_session: MagicMock) -> None:
    """For an INSDC-ingested sequence with an invalid host, the derived host
    fields (hostTaxonId, hostNameScientific, hostNameCommon) should all be
    None, and a warning should be added explaining that host validation failed.
    """
    mock_session.get.return_value = make_response(404, {"detail": "not found"})
    config = get_config(HOST_PROCESSING_CONFIG, ignore_args=True)

    entry = make_entry(
        metadata={"host": "not a real species"},
        group_id=config.insdc_ingest_group_id,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] is None
    assert metadata["hostNameScientific"] is None
    assert metadata["hostNameCommon"] is None

    assert mock_session.get.call_count == 1
    assert result[0].processed_entry.errors == []
    assert len(result[0].processed_entry.warnings) == 1
    assert "Host validation for" in result[0].processed_entry.warnings[0].message


@patch.object(processing_functions.taxonomy_cache, "session")
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
        group_id=config.insdc_ingest_group_id + 1,
    )

    result = process_all([entry], "temp", config)
    metadata = result[0].processed_entry.data.metadata

    assert metadata["hostTaxonId"] is None
    assert metadata["hostNameScientific"] is None
    assert metadata["hostNameCommon"] is None

    assert mock_session.get.call_count == 1
    assert result[0].processed_entry.warnings == []
    assert len(result[0].processed_entry.errors) == 1
    assert "Host validation for" in result[0].processed_entry.errors[0].message


@patch.object(processing_functions.taxonomy_cache, "session")
def test_call_function_converts_raw_errors_to_annotations(mock_session: MagicMock) -> None:
    """call_function must convert RawProcessingResult string errors into ProcessingAnnotations
    with correct message and field linkage."""
    mock_session.get.return_value = make_response(404, {"detail": "not found"})

    input_fields = ["host"]
    output_field = "hostTaxonId"
    args = {"taxonomy_service_url": "http://localhost:5000", "is_insdc_ingest_group": False}

    result = ProcessingFunctions.call_function(
        "resolve_host_taxon_id",
        args=args,
        input_data={"host": "not a real species"},
        output_field=output_field,
        input_fields=input_fields,
    )

    assert result.datum is None
    assert result.warnings == []
    assert len(result.errors) == 1

    annotation = result.errors[0]
    assert "Host validation for" in annotation.message
    assert annotation.processedFields == (
        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA),
    )
    assert annotation.unprocessedFields == (
        AnnotationSource(name="host", type=AnnotationSourceType.METADATA),
    )
