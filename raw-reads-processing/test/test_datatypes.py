# ruff: noqa: S101

import pytest

from raw_reads_processing.datatypes import (
    Annotation,
    ValidationResult,
    sanitize_for_json,
)
from raw_reads_processing.errors import ProcessingFailure


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("plain ascii", "plain ascii"),
        ("Grüße", "Grüße"),
        ("", ""),
        ("notes\x00more", "notes<NUL>more"),
        ("\x00", "<NUL>"),
        ("a\udcffb", "a�b"),
    ],
)
def test_sanitize_for_json(raw, expected):
    assert sanitize_for_json(raw) == expected


def test_annotation_sanitizes_message_and_file_names():
    annotation = Annotation(fileNames=["reads\x00.fastq.gz"], message="bad line: \x00")

    assert annotation.fileNames == ["reads<NUL>.fastq.gz"]
    assert annotation.message == "bad line: <NUL>"


def test_serialized_validation_result_carries_nothing_postgres_rejects():
    """Postgres refuses \\u0000 and lone surrogates inside jsonb, and the
    backend writes a whole batch of processed data in one transaction.
    """
    result = ValidationResult(
        errors=[Annotation(fileNames=["a\x00.fq.gz"], message="x\x00y\udcffz")]
    )

    serialized = result.model_dump_json()

    assert "\\u0000" not in serialized
    assert "\\ud" not in serialized


def test_processing_failure_sanitizes_its_message():
    """Preprocessing turns this message into an annotation of its own, so it
    reaches Postgres on the same path as a validation message.
    """
    failure = ProcessingFailure("Error downloading 'reads\x00.fq.gz' from S3")

    assert str(failure) == "Error downloading 'reads<NUL>.fq.gz' from S3"
