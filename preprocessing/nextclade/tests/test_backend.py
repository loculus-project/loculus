# ruff: noqa: S101

import json

import pytest

from loculus_preprocessing.backend import parse_ndjson
from loculus_preprocessing.config import get_config
from loculus_preprocessing.datatypes import (
    FileCategory,
    FileIdAndNameAndReadUrl,
    ProcessingContext,
    UnprocessedEntry,
)

NO_ALIGNMENT_CONFIG = "tests/no_alignment_config.yaml"


def test_parse_ndjson() -> None:
    lines = [
        {
            "accession": "LOC_01",
            "version": 2,
            "processingAttemptId": "12345678-1234-5678-1234-567812345678",
            "leaseUntil": 4_102_444_800,
            "submitter": "test_submitter",
            "groupId": "3",
            "submittedAt": 1767225600,
            "submissionId": "submission_01",
            "data": {
                "metadata": {"country": "Côte\N{NO-BREAK SPACE}d'Ivoire", "host": None},
                "unalignedNucleotideSequences": {"main": "NNACGTnn", "other": None},
                "files": {
                    "rawReads": [{"fileId": "file_01", "name": "reads.fastq", "url": "http://x"}],
                    "annotations": [{"fileId": "file_02", "name": "annotation.gff"}],
                },
            },
        },
        {
            "accession": "LOC_02",
            "version": 1,
            "processingAttemptId": "87654321-4321-8765-4321-876543218765",
            "leaseUntil": 4_102_444_801,
            "submitter": "test_submitter",
            "groupId": 4,
            "submittedAt": "1767225601",
            "submissionId": "submission_02",
            "data": {"metadata": {}, "unalignedNucleotideSequences": {}},
        },
    ]
    ndjson = "\n".join(json.dumps(line, ensure_ascii=False) for line in lines) + "\n\n  \n"
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)

    entries = parse_ndjson(ndjson, config)

    assert entries == [
        UnprocessedEntry(
            context=ProcessingContext(
                accession_version="LOC_01.2",
                submission_id="submission_01",
                group_id=3,
                insdc_ingest_group_id=config.insdc_ingest_group_id,
                submitted_at="1767225600",
                processing_attempt_id="12345678-1234-5678-1234-567812345678",
                lease_until=4_102_444_800,
            ),
            metadata={"country": "Côte d'Ivoire", "host": None},
            unalignedNucleotideSequences={"main": "ACGT", "other": None},
            files={
                FileCategory.RAW_READS: [
                    FileIdAndNameAndReadUrl(fileId="file_01", name="reads.fastq", url="http://x")
                ],
                FileCategory.ANNOTATIONS: [
                    FileIdAndNameAndReadUrl(fileId="file_02", name="annotation.gff")
                ],
            },
        ),
        UnprocessedEntry(
            context=ProcessingContext(
                accession_version="LOC_02.1",
                submission_id="submission_02",
                group_id=4,
                insdc_ingest_group_id=config.insdc_ingest_group_id,
                submitted_at="1767225601",
                processing_attempt_id="87654321-4321-8765-4321-876543218765",
                lease_until=4_102_444_801,
            ),
            metadata={},
            unalignedNucleotideSequences={},
            files=None,
        ),
    ]


def test_parse_ndjson_empty() -> None:
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    assert parse_ndjson("", config) == []


def test_parse_ndjson_rejects_invalid_json() -> None:
    config = get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)
    with pytest.raises(ValueError, match="Failed to parse JSON"):
        parse_ndjson("{not json", config)
