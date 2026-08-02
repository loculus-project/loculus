# ruff: file-ignore[assert]

import json
import threading
from unittest.mock import MagicMock, patch

import pytest

from loculus_preprocessing.backend import (
    parse_ndjson,
    renew_processing_lease,
    submit_processed_sequences,
)
from loculus_preprocessing.config import AlignmentRequirement, get_config
from loculus_preprocessing.datatypes import UnprocessedAfterNextclade
from loculus_preprocessing.prepro import (
    process_all,
    processing_lease_heartbeat,
    processing_lease_renewal_interval,
)

NO_ALIGNMENT_CONFIG = "tests/no_alignment_config.yaml"
PROCESSING_ATTEMPT_ID = "12345678-1234-5678-1234-567812345678"


def claim_line() -> dict:
    return {
        "accession": "LOC_01",
        "version": 1,
        "processingAttemptId": PROCESSING_ATTEMPT_ID,
        "leaseUntil": 4_102_444_800,
        "submitter": "test_submitter",
        "groupId": 2,
        "submittedAt": "1767225600",
        "submissionId": "test_submission_id",
        "data": {
            "metadata": {},
            "unalignedNucleotideSequences": {},
            "files": None,
        },
    }


def aligned_data() -> UnprocessedAfterNextclade:
    return UnprocessedAfterNextclade(
        inputMetadata={
            "group_id": "2",
            "submitter": "test_submitter",
            "submittedAt": "1767225600",
            "submissionId": "test_submission_id",
        },
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
    entry = parse_ndjson(json.dumps(claim_line()))[0]
    assert entry.processingAttemptId == PROCESSING_ATTEMPT_ID
    assert entry.leaseUntil == claim_line()["leaseUntil"]

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


def test_renew_processing_lease_calls_batch_endpoint() -> None:
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    response = MagicMock(ok=True)

    with (
        patch("loculus_preprocessing.backend.get_jwt", return_value="token"),
        patch("loculus_preprocessing.backend.requests.post", return_value=response) as post,
    ):
        renew_processing_lease(PROCESSING_ATTEMPT_ID, config)

    assert post.call_args.args[0].endswith("/renew-processing-lease")
    assert post.call_args.kwargs["params"] == {
        "pipelineVersion": str(config.pipeline_version),
        "processingAttemptId": PROCESSING_ATTEMPT_ID,
    }


def test_processing_lease_renewal_interval_is_early_and_bounded() -> None:
    with patch("loculus_preprocessing.prepro.time.time", return_value=100):
        assert processing_lease_renewal_interval(130) == pytest.approx(10)
        assert processing_lease_renewal_interval(1_000) == pytest.approx(60)
        assert processing_lease_renewal_interval(99) == pytest.approx(0.1)


def test_processing_lease_heartbeat_renews_and_stops_on_error() -> None:
    entry = parse_ndjson(json.dumps(claim_line()))[0]
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    renewed = threading.Event()
    error_message = "processing failed"

    with (
        patch(
            "loculus_preprocessing.prepro.processing_lease_renewal_interval",
            return_value=0.01,
        ),
        patch(
            "loculus_preprocessing.prepro.renew_processing_lease",
            side_effect=lambda *_: renewed.set(),
        ) as renew,
        pytest.raises(RuntimeError, match=error_message),
        processing_lease_heartbeat([entry], config),
    ):
        assert renewed.wait(timeout=1)
        raise RuntimeError(error_message)

    renew.assert_called_with(PROCESSING_ATTEMPT_ID, config)


def test_processing_attempt_id_survives_aligned_processing() -> None:
    entry = parse_ndjson(json.dumps(claim_line()))[0]
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    config.alignment_requirement = AlignmentRequirement.ALL

    with patch(
        "loculus_preprocessing.prepro.enrich_with_nextclade",
        return_value={entry.accessionVersion: aligned_data()},
    ):
        processed_entry = process_all([entry], "unused", config)[0].processed_entry

    assert processed_entry.processingAttemptId == PROCESSING_ATTEMPT_ID


def test_processing_attempt_id_survives_per_entry_processing_error() -> None:
    entry = parse_ndjson(json.dumps(claim_line()))[0]
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)

    with patch(
        "loculus_preprocessing.prepro.process_single_unaligned",
        side_effect=RuntimeError("processing failed"),
    ):
        processed_entry = process_all([entry], "unused", config)[0].processed_entry

    assert processed_entry.processingAttemptId == PROCESSING_ATTEMPT_ID
    assert processed_entry.errors


def test_processing_attempt_id_survives_aligned_processing_error() -> None:
    entry = parse_ndjson(json.dumps(claim_line()))[0]
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    config.alignment_requirement = AlignmentRequirement.ALL

    with (
        patch(
            "loculus_preprocessing.prepro.enrich_with_nextclade",
            return_value={entry.accessionVersion: aligned_data()},
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
def test_missing_claim_lease_field_is_rejected(field: str) -> None:
    line = claim_line()
    del line[field]

    with pytest.raises(KeyError, match=field):
        parse_ndjson(json.dumps(line))
