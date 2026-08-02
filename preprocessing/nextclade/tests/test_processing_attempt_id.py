# ruff: noqa: S101

import json
from unittest.mock import MagicMock, patch

import pytest

from loculus_preprocessing.backend import parse_ndjson, submit_processed_sequences
from loculus_preprocessing.config import AlignmentRequirement, get_config
from loculus_preprocessing.datatypes import UnprocessedAfterNextclade, UnprocessedEntry
from loculus_preprocessing.prepro import process_all

NO_ALIGNMENT_CONFIG = "tests/no_alignment_config.yaml"
PROCESSING_ATTEMPT_ID = "12345678-1234-5678-1234-567812345678"
LEASE_UNTIL = 4_102_444_800


def claim_line() -> dict:
    return {
        "accession": "LOC_01",
        "version": 1,
        "processingAttemptId": PROCESSING_ATTEMPT_ID,
        "leaseUntil": LEASE_UNTIL,
        "submitter": "test_submitter",
        "groupId": 2,
        "submittedAt": "1767225600",
        "submissionId": "test_submission_id",
        "data": {"metadata": {}, "unalignedNucleotideSequences": {}, "files": None},
    }


def parse_claim() -> UnprocessedEntry:
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    return parse_ndjson(json.dumps(claim_line()), config)[0]


def aligned_data(entry: UnprocessedEntry) -> UnprocessedAfterNextclade:
    return UnprocessedAfterNextclade(
        metadata={},
        context=entry.context,
        files=None,
        nextcladeMetadata={},
        unalignedNucleotideSequences={},
        alignedNucleotideSequences={},
        nucleotideInsertions={},
        alignedAminoAcidSequences={},
        aminoAcidInsertions={},
        sequenceNameToFastaId={},
        errors=[],
        warnings=[],
    )


def test_processing_attempt_id_survives_parse_process_and_submission() -> None:
    entry = parse_claim()
    assert entry.context.processing_attempt_id == PROCESSING_ATTEMPT_ID
    assert entry.context.lease_until == LEASE_UNTIL

    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    processed_entry = process_all([entry], "unused", config)[0].processed_entry
    assert processed_entry.processingAttemptId == PROCESSING_ATTEMPT_ID

    response = MagicMock(ok=True, headers={})
    with (
        patch("loculus_preprocessing.backend.get_jwt", return_value="token"),
        patch("loculus_preprocessing.backend.requests.post", return_value=response) as post,
    ):
        submit_processed_sequences([processed_entry], "unused", config)

    submitted_line = json.loads(post.call_args.kwargs["data"])
    assert submitted_line["processingAttemptId"] == PROCESSING_ATTEMPT_ID


def test_processing_attempt_id_survives_aligned_processing() -> None:
    entry = parse_claim()
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    config.alignment_requirement = AlignmentRequirement.ALL

    with patch(
        "loculus_preprocessing.prepro.enrich_with_nextclade",
        return_value={entry.context.accession_version: aligned_data(entry)},
    ):
        processed_entry = process_all([entry], "unused", config)[0].processed_entry

    assert processed_entry.processingAttemptId == PROCESSING_ATTEMPT_ID


def test_processing_attempt_id_survives_per_entry_processing_error() -> None:
    entry = parse_claim()
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)

    with patch(
        "loculus_preprocessing.prepro.process_single_unaligned",
        side_effect=RuntimeError("processing failed"),
    ):
        processed_entry = process_all([entry], "unused", config)[0].processed_entry

    assert processed_entry.processingAttemptId == PROCESSING_ATTEMPT_ID
    assert processed_entry.errors


def test_processing_attempt_id_survives_aligned_processing_error() -> None:
    entry = parse_claim()
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    config.alignment_requirement = AlignmentRequirement.ALL

    with (
        patch(
            "loculus_preprocessing.prepro.enrich_with_nextclade",
            return_value={entry.context.accession_version: aligned_data(entry)},
        ),
        patch(
            "loculus_preprocessing.prepro.process_single",
            side_effect=RuntimeError("processing failed"),
        ),
    ):
        processed_entry = process_all([entry], "unused", config)[0].processed_entry

    assert processed_entry.processingAttemptId == PROCESSING_ATTEMPT_ID
    assert processed_entry.errors


@pytest.mark.parametrize("field", ["processingAttemptId", "leaseUntil"])
def test_missing_claim_field_is_rejected(field: str) -> None:
    line = claim_line()
    del line[field]
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)

    with pytest.raises(KeyError, match=field):
        parse_ndjson(json.dumps(line), config)
