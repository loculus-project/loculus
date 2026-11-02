import gzip
import logging
import subprocess  # noqa: S404
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from Bio.SeqIO.FastaIO import SimpleFastaParser
from xopen import xopen

from raw_reads_processing.datatypes import Annotation, FileName
from raw_reads_processing.errors import (
    DECOMPRESSION_ERRORS,
    InvalidSubmission,
    ProcessingFailure,
)

logger = logging.getLogger(__name__)

_ALTERNATIVE_ALIGNMENT_FLAGS = "0x900"
_BGZF_EOF_BLOCK = bytes.fromhex(
    "1f8b08040000000000ff0600424302001b0003000000000000000000"
)


@dataclass(frozen=True)
class DeaconInputBatch:
    """read_count counts sequences, including both mates."""

    paths: tuple[Path, ...]
    read_count: int


@dataclass(frozen=True)
class PreparedBamReads:
    original_file_name: FileName
    batches: tuple[DeaconInputBatch, ...]
    read_count: int


def _invalid_bam(file_name: FileName, message: str) -> InvalidSubmission:
    return InvalidSubmission(
        Annotation(fileNames=[file_name], message=f"BAM file '{file_name}' {message}")
    )


def _remaining_time(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise subprocess.TimeoutExpired("samtools BAM preparation", 0)
    return remaining


def _check_eof_marker(file_name: FileName, bam_path: Path) -> None:
    with bam_path.open("rb") as handle:
        handle.seek(max(0, bam_path.stat().st_size - len(_BGZF_EOF_BLOCK)))
        if handle.read() != _BGZF_EOF_BLOCK:
            raise _invalid_bam(
                file_name,
                "is truncated: the BAM end-of-file marker is missing. "
                "Please upload the complete file.",
            )


def _check_bam_compression(
    file_name: FileName, bam_path: Path, deadline: float
) -> None:
    try:
        with gzip.open(bam_path, "rb") as handle:
            while handle.read(1024 * 1024):
                _remaining_time(deadline)
    except tuple(DECOMPRESSION_ERRORS) as error:
        raise _invalid_bam(
            file_name,
            "contains corrupt or truncated compressed data. Please upload it again.",
        ) from error


def _check_samtools_result(
    file_name: FileName,
    bam_path: Path,
    command: str,
    returncode: int,
    stderr: str,
    deadline: float,
) -> None:
    if returncode == 0:
        return
    logger.error("samtools %s failed (%s): %s", command, returncode, stderr)
    if returncode > 0:
        _check_bam_compression(file_name, bam_path, deadline)
    raise ProcessingFailure(
        f"Could not prepare BAM file '{file_name}': samtools {command} failed."
    )


def _run_samtools(
    args: list[str], file_name: FileName, bam_path: Path, deadline: float
) -> str:
    result = subprocess.run(  # noqa: S603
        ["samtools", *args],
        check=False,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=_remaining_time(deadline),
    )
    _check_samtools_result(
        file_name, bam_path, args[0], result.returncode, result.stderr, deadline
    )
    return result.stdout


def _extract_fasta(
    file_name: FileName,
    bam_path: Path,
    directory: Path,
    fasta_paths: tuple[Path, Path, Path, Path],
    deadline: float,
) -> None:
    first, second, singleton, unpaired = fasta_paths
    view_args = [
        "samtools",
        "view",
        "-u",
        "-F",
        _ALTERNATIVE_ALIGNMENT_FLAGS,
        "-e",
        "hclen == 0",
        str(bam_path),
    ]
    collate_args = [
        "samtools",
        "collate",
        "-u",
        "-O",
        "-T",
        str(directory / "collate"),
        "-",
    ]
    fasta_args = [
        "samtools",
        "fasta",
        "-n",
        "-F",
        _ALTERNATIVE_ALIGNMENT_FLAGS,
        "-c",
        "1",
        "-1",
        str(first),
        "-2",
        str(second),
        "-s",
        str(singleton),
        "-0",
        str(unpaired),
        "-",
    ]
    # Logs go to disk, so no process can fill an unread stderr pipe.
    with (
        (directory / "view.log").open("w+b") as view_log,
        (directory / "collate.log").open("w+b") as collate_log,
        (directory / "fasta.log").open("w+b") as fasta_log,
    ):
        view = subprocess.Popen(  # noqa: S603
            view_args, stdout=subprocess.PIPE, stderr=view_log
        )
        collate = fasta = None
        try:
            try:
                collate = subprocess.Popen(  # noqa: S603
                    collate_args,
                    stdin=view.stdout,
                    stdout=subprocess.PIPE,
                    stderr=collate_log,
                )
            finally:
                # Only the child should hold this descriptor. Otherwise an early
                # fasta failure can leave collate blocked on a full pipe forever.
                if view.stdout is not None:
                    view.stdout.close()
            try:
                fasta = subprocess.Popen(  # noqa: S603
                    fasta_args,
                    stdin=collate.stdout,
                    stdout=subprocess.DEVNULL,
                    stderr=fasta_log,
                )
            finally:
                if collate.stdout is not None:
                    collate.stdout.close()
            fasta.wait(timeout=_remaining_time(deadline))
            collate.wait(timeout=_remaining_time(deadline))
            view.wait(timeout=_remaining_time(deadline))
        finally:
            for process in (fasta, collate, view):
                if process is not None and process.poll() is None:
                    process.kill()
                if process is not None:
                    process.wait()

        # Check all exits: fasta can successfully consume a partial stream
        # even though view failed while decoding the original BAM.
        for process, command, log in (
            (fasta, "fasta", fasta_log),
            (collate, "collate", collate_log),
            (view, "view", view_log),
        ):
            log.seek(max(0, log.tell() - 8192))
            _check_samtools_result(
                file_name,
                bam_path,
                command,
                process.returncode,
                log.read().decode("utf-8", errors="replace"),
                deadline,
            )


def _fasta_read_count(path: Path, file_name: FileName, deadline: float) -> int:
    count = 0
    try:
        with xopen(path, "rt", encoding="utf-8", threads=0) as handle:
            for _, sequence in SimpleFastaParser(handle):
                if not sequence:
                    raise _invalid_bam(
                        file_name,
                        "contains a primary read without a sequence. Please submit "
                        "a BAM containing the complete primary read sequences.",
                    )
                count += 1
                if count % 1000 == 0:
                    _remaining_time(deadline)
    except UnicodeDecodeError as error:
        raise _invalid_bam(
            file_name,
            "contains a read name that is not valid UTF-8. "
            "Please submit a BAM with ASCII read names.",
        ) from error
    _remaining_time(deadline)
    return count


def prepare_bam_for_deacon(
    file_name: FileName,
    bam_path: Path,
    data_dir: Path,
    timeout_seconds: int,
) -> PreparedBamReads:
    """Extract and count primary reads. The caller cleans up data_dir."""
    deadline = time.monotonic() + timeout_seconds
    try:
        _check_eof_marker(file_name, bam_path)
        directory = Path(tempfile.mkdtemp(prefix="bam-reads-", dir=data_dir))
        primary_args = ["view", "-c", "-F", _ALTERNATIVE_ALIGNMENT_FLAGS]
        primary_count = int(
            _run_samtools(
                [*primary_args, str(bam_path)], file_name, bam_path, deadline
            ).strip()
        )
        if primary_count == 0:
            raise _invalid_bam(
                file_name, "contains no primary reads to check for human contamination."
            )
        paths = tuple(
            directory / name
            for name in (
                "first.fasta.gz",
                "second.fasta.gz",
                "singletons.fasta.gz",
                "unpaired.fasta.gz",
            )
        )
        _extract_fasta(file_name, bam_path, directory, paths, deadline)
        counts = tuple(_fasta_read_count(path, file_name, deadline) for path in paths)
        if counts[0] != counts[1] or sum(counts) != primary_count:
            hard_clipped_count = int(
                _run_samtools(
                    [*primary_args, "-e", "hclen > 0", str(bam_path)],
                    file_name,
                    bam_path,
                    deadline,
                ).strip()
            )
            if hard_clipped_count:
                raise _invalid_bam(
                    file_name,
                    "contains hard-clipped primary reads. Their complete sequences "
                    "cannot be checked for human contamination. Please submit FASTQ "
                    "or a BAM containing the complete primary read sequences.",
                )
            raise _invalid_bam(
                file_name,
                "could not be converted without losing primary reads. Multiple "
                "primary records may share the same read name and mate designation. "
                "Please submit FASTQ or a BAM with unique primary read names "
                "(one record per mate).",
            )
        batches = []
        if counts[0]:
            batches.append(DeaconInputBatch(paths[:2], counts[0] + counts[1]))
        batches.extend(
            DeaconInputBatch((path,), count)
            for path, count in zip(paths[2:], counts[2:], strict=True)
            if count
        )
        return PreparedBamReads(file_name, tuple(batches), primary_count)
    except subprocess.TimeoutExpired as error:
        raise ProcessingFailure(
            f"Preparation of BAM file '{file_name}' timed out after {timeout_seconds} seconds."
        ) from error
    except (OSError, ValueError) as error:
        raise ProcessingFailure(
            f"Could not prepare BAM file '{file_name}': {error}"
        ) from error
