import gzip
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

import pytest
from Bio import bgzf
from Bio.SeqIO.FastaIO import SimpleFastaParser
from conftest import missing_dependency
from xopen import xopen

from raw_reads_processing import bam_preparation
from raw_reads_processing.bam_preparation import prepare_bam_for_deacon
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure
from raw_reads_processing.file_format_validation import (
    FileFormat,
    validate_with_readtools,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def samtools(request):
    executable = shutil.which("samtools")
    if executable is None:
        missing_dependency(request, "samtools binary not found on PATH")
    return executable


def _record(name, flag, sequence="AACCGGTT", cigar="8M", position=1, quality="*"):
    reference = "*" if flag & 4 else "ref"
    position = 0 if flag & 4 else position
    cigar = "*" if flag & 4 else cigar
    return f"{name}\t{flag}\t{reference}\t{position}\t0\t{cigar}\t*\t0\t0\t{sequence}\t{quality}"


def _bam(tmp_path: Path, samtools: str, records: list[str]) -> Path:
    sam = tmp_path / "input.sam"
    sam.write_bytes(
        (
            "@HD\tVN:1.6\n@SQ\tSN:ref\tLN:1000\n"
            + "".join(record + "\n" for record in records)
        ).encode("utf-8", errors="surrogateescape")
    )
    bam = tmp_path / "input.bam"
    subprocess.run(
        [samtools, "view", "-b", "-o", str(bam), str(sam)],
        check=True,
        capture_output=True,
    )
    return bam


def _fasta(path: Path) -> dict[str, str]:
    with xopen(path, "rt", threads=0) as handle:
        return dict(SimpleFastaParser(handle))


def test_complete_primary_reads_are_preserved_and_grouped(tmp_path, samtools):
    bam = _bam(
        tmp_path,
        samtools,
        [
            _record("pair", 65),
            _record("unpaired", 4, "ACACACAC"),
            _record("unmapped-pair", 77, "AAAACCCC"),
            _record("singleton-first", 73, "TATATATA"),
            _record("qcfail", 516, "CCCCAAAA"),
            _record("duplicate", 1028, "GGGGTTTT"),
            _record("soft-clipped", 0, "CCAATTGG", "2S6M"),
            _record("singleton-second", 137, "AGAGAGAG"),
            _record("pair", 145, "AAGGCCAT", position=20),
            _record("unmapped-pair", 141, "GGGGAAAA"),
            _record("pair", 321),
            _record("pair", 2113, "CCGGTT", "2H6M"),
        ],
    )
    original = bam.read_bytes()
    prepared = prepare_bam_for_deacon("upload.bam", bam, tmp_path, 30)

    assert prepared.original_file_name == "upload.bam"
    assert prepared.read_count == 10
    assert sum(batch.read_count for batch in prepared.batches) == 10
    paired = next(batch for batch in prepared.batches if len(batch.paths) == 2)
    first, second = map(_fasta, paired.paths)
    assert first == {"pair": "AACCGGTT", "unmapped-pair": "AAAACCCC"}
    assert second == {"pair": "ATGGCCTT", "unmapped-pair": "GGGGAAAA"}
    assert list(first) == list(second)
    assert paired.read_count == 4
    singles = {
        name: sequence
        for batch in prepared.batches
        if len(batch.paths) == 1
        for name, sequence in _fasta(batch.paths[0]).items()
    }
    assert singles == {
        "singleton-first": "TATATATA",
        "singleton-second": "AGAGAGAG",
        "unpaired": "ACACACAC",
        "qcfail": "CCCCAAAA",
        "duplicate": "GGGGTTTT",
        "soft-clipped": "CCAATTGG",
    }
    assert bam.read_bytes() == original
    assert all(
        path.is_relative_to(tmp_path) and path.read_bytes().startswith(b"\x1f\x8b")
        for batch in prepared.batches
        for path in batch.paths
    )


@pytest.mark.parametrize(
    "records,message",
    [
        ([_record("clipped", 0, "CCGGTT", "2H6M")], "hard-clipped primary reads"),
        ([_record("same", 4), _record("same", 4)], "without losing primary reads"),
        ([_record("missing", 4, "*")], "without a sequence"),
        ([_record("bad\udcff", 4)], "not valid UTF-8"),
    ],
)
def test_incomplete_primary_sequences_are_rejected(
    tmp_path, samtools, records, message
):
    bam = _bam(tmp_path, samtools, records)
    with pytest.raises(InvalidSubmission) as error:
        prepare_bam_for_deacon("reads.bam", bam, tmp_path, 30)
    assert message in error.value.error.message
    assert error.value.error.fileNames == ["reads.bam"]


@pytest.mark.usefixtures("readtools_jar")
@pytest.mark.parametrize("corruption", ["compression", "record"])
def test_corruption_after_readtools_sample_cannot_pass(tmp_path, samtools, corruption):
    bam = _bam(
        tmp_path,
        samtools,
        [_record(f"read{i}", 4, "A" * 150, quality="I" * 150) for i in range(110_000)],
    )
    if corruption == "compression":
        contents = bytearray(bam.read_bytes())
        offset = 0
        blocks = []
        while offset < len(contents):
            blocks.append(offset)
            offset += int.from_bytes(contents[offset + 16 : offset + 18], "little") + 1
        contents[blocks[-3] + 20] ^= 0xFF
        bam.write_bytes(contents)
        expected = InvalidSubmission
    else:
        contents = bytearray(gzip.decompress(bam.read_bytes()))
        # l_seq lies 16 bytes before QNAME in the BAM record core.
        struct.pack_into("<i", contents, contents.rindex(b"read109999\0") - 16, -1)
        with bgzf.BgzfWriter(str(bam), "wb") as handle:
            handle.write(contents)
        assert gzip.decompress(bam.read_bytes()) == contents
        expected = ProcessingFailure
    subprocess.run(
        [samtools, "quickcheck", "-u", str(bam)], check=True, capture_output=True
    )
    validate_with_readtools({"corrupt.bam": bam}, FileFormat.BAM)
    with pytest.raises(expected):
        prepare_bam_for_deacon("corrupt.bam", bam, tmp_path, 30)


def test_missing_eof_marker_is_rejected_before_samtools(tmp_path, monkeypatch):
    valid = FIXTURES_DIR / "valid.bam"
    assert bam_preparation._check_eof_marker("valid.bam", valid) is None
    bam = tmp_path / "truncated.bam"
    bam.write_bytes(valid.read_bytes()[:-28])
    monkeypatch.setattr(
        bam_preparation.subprocess,
        "run",
        lambda *args, **kwargs: pytest.fail("samtools must not run"),
    )
    with pytest.raises(InvalidSubmission, match="end-of-file marker"):
        prepare_bam_for_deacon("truncated.bam", bam, tmp_path, 30)


@pytest.mark.parametrize("stderr", ["", "invalid BAM", "no space left on device"])
def test_samtools_failure_classification_ignores_stderr(tmp_path, stderr):
    bam = tmp_path / "input.bam"
    bam.write_bytes(gzip.compress(b"BAM\x01"))
    deadline = time.monotonic() + 5
    with pytest.raises(ProcessingFailure):
        bam_preparation._check_samtools_result(
            "reads.bam", bam, "view", 1, stderr, deadline
        )
    bam.write_bytes(bam.read_bytes()[:-8])
    with pytest.raises(InvalidSubmission, match="corrupt or truncated"):
        bam_preparation._check_samtools_result(
            "reads.bam", bam, "view", 1, stderr, deadline
        )


@pytest.mark.parametrize("failure", ["producer", "consumer", "timeout"])
def test_extraction_failure_reaps_all_processes(tmp_path, monkeypatch, failure):
    original_popen = subprocess.Popen
    processes = []

    def popen(args, **kwargs):
        if failure == "timeout":
            script = "import time\ntime.sleep(30)"
        elif args[1] == "view":
            script = (
                "import sys\nsys.stderr.write('corrupt BAM')\nsys.exit(1)"
                if failure == "producer"
                else "import sys\nwhile True: sys.stdout.buffer.write(b'A' * 65536)"
            )
        elif args[1] == "collate":
            script = "import sys\nwhile data := sys.stdin.buffer.read(65536): sys.stdout.buffer.write(data)"
        else:
            script = (
                "import sys\nsys.stdin.buffer.read()"
                if failure == "producer"
                else "import sys\nsys.stderr.write('invalid BAM')\nsys.exit(1)"
            )
        process = original_popen([sys.executable, "-c", script], **kwargs)
        processes.append(process)
        return process

    monkeypatch.setattr(bam_preparation.subprocess, "Popen", popen)
    paths = tuple(tmp_path / name for name in ("1.fa", "2.fa", "s.fa", "0.fa"))
    bam = tmp_path / "input.bam"
    bam.write_bytes(gzip.compress(b"BAM\x01"))
    expected = subprocess.TimeoutExpired if failure == "timeout" else ProcessingFailure
    with pytest.raises(expected):
        bam_preparation._extract_fasta(
            "reads.bam",
            bam,
            tmp_path,
            paths,
            time.monotonic() + (0.2 if failure == "timeout" else 5),
        )
    assert len(processes) == 3
    assert all(process.poll() is not None for process in processes)
