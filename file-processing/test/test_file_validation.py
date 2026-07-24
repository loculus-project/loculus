# ruff: noqa: S101

import gzip
import os
from pathlib import Path

import pytest
from file_processing import file_validation
from file_processing.datatypes import Annotation
from file_processing.file_validation import (
    _mixed_mates,
    _parse_validation_error,
    run_validation,
)

VALID_SINGLE_END = """\
@seq1
ACGTACGTAC
+
IIIIIIIIII
@seq2
ACGTACGTAC
+
IIIIIIIIII
@seq3
ACGTACGTAC
+
IIIIIIIIII
"""

VALID_R1 = """\
@seq1/1
ACGTACGTAC
+
IIIIIIIIII
@seq2/1
ACGTACGTAC
+
IIIIIIIIII
"""

VALID_R2 = """\
@seq1/2
TGCATGCATG
+
IIIIIIIIII
@seq2/2
TGCATGCATG
+
IIIIIIIIII
"""

FASTA_STYLE_HEADER = """\
>seq1
ACGTACGTAC
+
IIIIIIIIII
"""

NON_IUPAC_BASE = """\
@seq1
ACGTAXGTAC
+
IIIIIIIIII
"""

LENGTH_MISMATCH = """\
@seq1
ACGTACGTAC
+
IIIII
"""

# Real interleaved FASTQ (e.g. as downloaded from SRA) gives both mates of a
# pair the *same* read name, with mate 1 and mate 2 adjacent in one file.
INTERLEAVED_SAME_NAME = """\
@read1
ACGTACGTAC
+
IIIIIIIIII
@read1
TGCATGCATG
+
IIIIIIIIII
@read2
ACGTACGTAC
+
IIIIIIIIII
@read2
TGCATGCATG
+
IIIIIIIIII
"""

# Illumina/CASAVA-style interleaved file: mates are distinguished by the
# "1:N:0:..." / "2:N:0:..." read-number field, so names are unique and
# readtools' own duplicate-name check does not catch it.
CASAVA_INTERLEAVED_SINGLE_FILE = """\
@M00001:1:000000000-A1B2C:1:1101:15000:1000 1:N:0:ACGTACGT
ACGTACGTAC
+
IIIIIIIIII
@M00001:1:000000000-A1B2C:1:1101:15000:1000 2:N:0:ACGTACGT
TGCATGCATG
+
IIIIIIIIII
@M00001:1:000000000-A1B2C:1:1101:15001:1000 1:N:0:ACGTACGT
ACGTACGTAC
+
IIIIIIIIII
@M00001:1:000000000-A1B2C:1:1101:15001:1000 2:N:0:ACGTACGT
TGCATGCATG
+
IIIIIIIIII
"""

# readtools' own pairing check only looks at the combined set of mate labels
# across both files, so two files that are each individually a mix of mate 1
# and mate 2 reads still pass its check as a valid paired submission.
BADLY_SPLIT_R1 = """\
@M1:1:FC:1:1:1:1 1:N:0:AC
ACGTACGTAC
+
IIIIIIIIII
@M1:1:FC:1:1:2:2 2:N:0:AC
TGCATGCATG
+
IIIIIIIIII
"""

BADLY_SPLIT_R2 = """\
@M1:1:FC:1:1:1:1 2:N:0:AC
TGCATGCATG
+
IIIIIIIIII
@M1:1:FC:1:1:2:2 1:N:0:AC
ACGTACGTAC
+
IIIIIIIIII
"""

# The trailing ":1" / ":2" here are Illumina X/Y tile coordinates, not mate
# markers, and must not be mistaken for one.
MACHINE_ID_HEADERS = """\
@A00953:544:HMTFHDSX3:2:1101:6768:1
ACGTACGTAC
+
IIIIIIIIII
@A00953:544:HMTFHDSX3:2:1101:6768:2
ACGTACGTAC
+
IIIIIIIIII
"""

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _find_jar() -> str | None:
    """Locate the readtools jar for integration tests.

    Set READTOOLS_JAR to point at a downloaded copy (see README) to run
    these; they're skipped otherwise since the jar isn't checked in.
    """
    env_jar = os.environ.get("READTOOLS_JAR")
    if env_jar and Path(env_jar).is_file():
        return env_jar
    repo_root = Path(__file__).parent.parent
    for candidate in (repo_root / "readtools.jar", Path("/opt/app/lib/readtools.jar")):
        if candidate.is_file():
            return str(candidate)
    return None


@pytest.fixture
def readtools_jar(monkeypatch):
    jar_path = _find_jar()
    if jar_path is None:
        pytest.skip(
            "readtools jar not found; set READTOOLS_JAR to its path to run this test"
        )
    monkeypatch.setattr(file_validation, "VALIDATION_JAR_PATH", jar_path)


def _write(tmp_path: Path, name: str, content: str) -> str:
    file_path = tmp_path / name
    file_path.write_text(content)
    return str(file_path)


@pytest.mark.usefixtures("readtools_jar")
def test_valid_single_end_fastq_passes(tmp_path):
    reads = _write(tmp_path, "reads.fastq", VALID_SINGLE_END)
    assert run_validation([reads], str(tmp_path)) is None


@pytest.mark.usefixtures("readtools_jar")
def test_valid_paired_end_fastq_passes(tmp_path):
    r1 = _write(tmp_path, "R1.fastq", VALID_R1)
    r2 = _write(tmp_path, "R2.fastq", VALID_R2)
    assert run_validation([r1, r2], str(tmp_path)) is None


@pytest.mark.usefixtures("readtools_jar")
def test_fasta_style_header_is_rejected(tmp_path):
    reads = _write(tmp_path, "bad_header.fastq", FASTA_STYLE_HEADER)
    result = run_validation([reads], str(tmp_path))
    assert isinstance(result, Annotation)
    assert "must start with @" in result.message


@pytest.mark.usefixtures("readtools_jar")
def test_non_iupac_base_is_rejected(tmp_path):
    reads = _write(tmp_path, "bad_base.fastq", NON_IUPAC_BASE)
    result = run_validation([reads], str(tmp_path))
    assert isinstance(result, Annotation)
    assert "IUPAC" in result.message


@pytest.mark.usefixtures("readtools_jar")
def test_length_mismatch_is_rejected(tmp_path):
    reads = _write(tmp_path, "bad_length.fastq", LENGTH_MISMATCH)
    result = run_validation([reads], str(tmp_path))
    assert isinstance(result, Annotation)
    assert "same length" in result.message


@pytest.mark.usefixtures("readtools_jar")
def test_interleaved_fastq_in_single_file_is_rejected(tmp_path):
    """readtools validates single-file FASTQ as unpaired, so two reads sharing
    a name (as mates do in an interleaved file) trip its duplicate-read-name
    check, even though the file itself is well-formed FASTQ.
    """
    reads = _write(tmp_path, "interleaved.fastq", INTERLEAVED_SAME_NAME)
    result = run_validation([reads], str(tmp_path))
    assert isinstance(result, Annotation)
    assert "Multiple" in result.message
    assert "occurrences of read name" in result.message


@pytest.mark.usefixtures("readtools_jar")
def test_deinterleaved_paired_reads_pass(tmp_path):
    """The same mate pairs as test_interleaved_fastq_in_single_file_is_rejected,
    but split into R1/R2 files as run_validation expects for paired-end input.
    """
    r1 = _write(
        tmp_path,
        "R1.fastq",
        "@read1\nACGTACGTAC\n+\nIIIIIIIIII\n@read2\nACGTACGTAC\n+\nIIIIIIIIII\n",
    )
    r2 = _write(
        tmp_path,
        "R2.fastq",
        "@read1\nTGCATGCATG\n+\nIIIIIIIIII\n@read2\nTGCATGCATG\n+\nIIIIIIIIII\n",
    )
    assert run_validation([r1, r2], str(tmp_path)) is None


@pytest.mark.usefixtures("readtools_jar")
def test_casava_style_interleaved_single_file_is_rejected(tmp_path):
    """readtools' single-file check only flags byte-identical read names, so
    an interleaved file using Illumina's "1:N:0:..." / "2:N:0:..." read-number
    convention (unique names) passes readtools but must still be rejected.
    """
    reads = _write(tmp_path, "interleaved_casava.fastq", CASAVA_INTERLEAVED_SINGLE_FILE)
    result = run_validation([reads], str(tmp_path))
    assert isinstance(result, Annotation)
    assert "multiple mates" in result.message
    assert "read numbers: 1, 2" in result.message


@pytest.mark.usefixtures("readtools_jar")
def test_two_files_each_individually_interleaved_is_rejected(tmp_path):
    """readtools' pairing check only checks that the combined set of mate
    labels across both files is small; it never checks that each file
    contains only one mate. Two files that are each a mix of mate 1 and
    mate 2 reads pass readtools as paired: true, so this must be caught here.
    """
    r1 = _write(tmp_path, "R1.fastq", BADLY_SPLIT_R1)
    r2 = _write(tmp_path, "R2.fastq", BADLY_SPLIT_R2)
    result = run_validation([r1, r2], str(tmp_path))
    assert isinstance(result, Annotation)
    assert "multiple mates" in result.message


@pytest.mark.usefixtures("readtools_jar")
def test_gzipped_fastq_is_recognized_and_passes(tmp_path):
    gz_path = tmp_path / "reads.fastq.gz"
    with gzip.open(gz_path, "wt") as f:
        f.write(VALID_SINGLE_END)
    assert run_validation([str(gz_path)], str(tmp_path)) is None


def test_machine_id_headers_are_not_mistaken_for_mate_suffixes(tmp_path):
    reads = _write(tmp_path, "reads.fastq", MACHINE_ID_HEADERS)
    assert _mixed_mates(reads) is None


def _write_bytes(tmp_path: Path, name: str, data: bytes) -> str:
    file_path = tmp_path / name
    file_path.write_bytes(data)
    return str(file_path)


@pytest.mark.usefixtures("readtools_jar")
def test_valid_bam_passes(tmp_path):
    bam = _write_bytes(tmp_path, "reads.bam", (FIXTURES_DIR / "valid.bam").read_bytes())
    assert run_validation([bam], str(tmp_path)) is None


@pytest.mark.usefixtures("readtools_jar")
def test_truncated_bam_is_rejected(tmp_path):
    truncated = (FIXTURES_DIR / "valid.bam").read_bytes()[:40]
    bam = _write_bytes(tmp_path, "truncated.bam", truncated)
    result = run_validation([bam], str(tmp_path))
    assert isinstance(result, Annotation)
    assert "FileTruncatedException" in result.message


def test_unsupported_extension_is_rejected_without_running_jar(tmp_path):
    reads = _write(tmp_path, "reads.txt", VALID_SINGLE_END)
    result = run_validation([reads], str(tmp_path))
    assert isinstance(result, Annotation)
    assert "unsupported formats" in result.message


def test_mixed_formats_are_rejected_without_running_jar(tmp_path):
    fastq = _write(tmp_path, "reads.fastq", VALID_SINGLE_END)
    bam = _write(tmp_path, "reads.bam", "not really a bam")
    result = run_validation([fastq, bam], str(tmp_path))
    assert isinstance(result, Annotation)
    assert "mixed or unsupported formats" in result.message


def test_parse_validation_error_extracts_detail_after_result_line(tmp_path):
    log = tmp_path / "out.log"
    log.write_text(
        "RESULT: INVALID\n  Sequence header must start with @: >seq1 at line 1 in fastq \n"
    )
    err = tmp_path / "out.err"
    err.write_text("")
    message = _parse_validation_error(log, err)
    assert message == "Sequence header must start with @: >seq1 at line 1 in fastq"


def test_parse_validation_error_handles_qualified_result_line(tmp_path):
    """BAM/CRAM structural errors append a qualifier to the RESULT line, e.g.
    "RESULT: INVALID (file structure / parse error)" instead of the plain
    "RESULT: INVALID" that FASTQ content errors use.
    """
    log = tmp_path / "out.log"
    log.write_text(
        "RESULT: INVALID (file structure / parse error)\n"
        "  htsjdk.samtools.FileTruncatedException: Premature end of file: data stream\n"
    )
    err = tmp_path / "out.err"
    err.write_text("INFO\tDeflaterFactory\tlibdeflate is available\n")
    message = _parse_validation_error(log, err)
    assert (
        message
        == "htsjdk.samtools.FileTruncatedException: Premature end of file: data stream"
    )


def test_parse_validation_error_falls_back_to_stderr(tmp_path):
    log = tmp_path / "out.log"
    log.write_text("some unrelated crash output\n")
    err = tmp_path / "out.err"
    err.write_text("Exception in thread main: OutOfMemoryError\n")
    message = _parse_validation_error(log, err)
    assert message == "Exception in thread main: OutOfMemoryError"


def test_parse_validation_error_generic_fallback(tmp_path):
    log = tmp_path / "out.log"
    log.write_text("")
    err = tmp_path / "out.err"
    err.write_text("")
    message = _parse_validation_error(log, err)
    assert message == "File validation failed"
