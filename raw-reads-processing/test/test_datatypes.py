# ruff: noqa: S101

import pytest

from raw_reads_processing.datatypes import Annotation, sanitize_for_json
from raw_reads_processing.errors import ProcessingFailure


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", ""),
        ("plain ascii", "plain ascii"),
        ("Grüße", "Grüße"),
        ("emoji 😀 and BOM ﻿ pass through", "emoji 😀 and BOM ﻿ pass through"),
        ("control \x01 chars pass through", "control \x01 chars pass through"),
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


def test_processing_failure_sanitizes_its_message():
    failure = ProcessingFailure("Error downloading 'reads\x00.fq.gz' from S3")

    assert str(failure) == "Error downloading 'reads<NUL>.fq.gz' from S3"
