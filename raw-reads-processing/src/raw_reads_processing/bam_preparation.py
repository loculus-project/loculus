import logging
import subprocess  # noqa: S404
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from Bio.SeqIO.FastaIO import SimpleFastaParser

from raw_reads_processing.datatypes import Annotation, FileName
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure

logger = logging.getLogger(__name__)

_ALTERNATIVE_ALIGNMENT_FLAGS = "0x900"
_SYSTEM_ERROR_MESSAGES = (
    "permission denied",
    "no space left on device",
    "input/output error",
    "read-only file system",
    "too many open files",
    "cannot allocate memory",
    "out of memory",
    "couldn't allocate",
    "failed to allocate",
    "no such file or directory",
    "could not be opened for reading",
    "error writing",
    "failed to write",
    "could not write",
    "error closing output",
    "error closing singleton",
    "error closing r1",
    "error closing r2",
    "error closing stdout",
    "failed to open output",
    "for writing",
    "for output",
    "failed to flush output",
    "failed to create temporary file",
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


def _check_samtools_result(
    file_name: FileName, command: str, returncode: int, stderr: str
) -> None:
    if returncode == 0:
        return
    logger.error("samtools %s failed (%s): %s", command, returncode, stderr)
    if returncode < 0 or any(
        reason in stderr.lower() for reason in _SYSTEM_ERROR_MESSAGES
    ):
        raise ProcessingFailure(
            f"Could not prepare BAM file '{file_name}': samtools {command} failed."
        )
    raise _invalid_bam(
        file_name,
        "could not be read completely by samtools. Please check that the file "
        "is valid and has not been truncated, then upload it again.",
    )


def _run_samtools(args: list[str], file_name: FileName, deadline: float) -> str:
    result = subprocess.run(  # noqa: S603
        ["samtools", *args],
        check=False,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=_remaining_time(deadline),
    )
    _check_samtools_result(file_name, args[0], result.returncode, result.stderr)
    return result.stdout


def _extract_fasta(
    file_name: FileName,
    bam_path: Path,
    directory: Path,
    fasta_paths: tuple[Path, Path, Path, Path],
    deadline: float,
) -> None:
    first, second, singleton, unpaired = fasta_paths
    collate_args = [
        "samtools",
        "collate",
        "-u",
        "-O",
        "-T",
        str(directory / "collate"),
        str(bam_path),
    ]
    fasta_args = [
        "samtools",
        "fasta",
        "-n",
        "-F",
        _ALTERNATIVE_ALIGNMENT_FLAGS,
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
    # Logs go to disk, so neither process can fill an unread stderr pipe.
    with (
        (directory / "collate.log").open("w+b") as collate_log,
        (directory / "fasta.log").open("w+b") as fasta_log,
    ):
        collate = subprocess.Popen(  # noqa: S603
            collate_args, stdout=subprocess.PIPE, stderr=collate_log
        )
        fasta = None
        try:
            try:
                fasta = subprocess.Popen(  # noqa: S603
                    fasta_args,
                    stdin=collate.stdout,
                    stdout=subprocess.DEVNULL,
                    stderr=fasta_log,
                )
            finally:
                # Only the child should hold this descriptor. Otherwise an early
                # fasta failure can leave collate blocked on a full pipe forever.
                if collate.stdout is not None:
                    collate.stdout.close()
            fasta.wait(timeout=_remaining_time(deadline))
            collate.wait(timeout=_remaining_time(deadline))
        finally:
            for process in (fasta, collate):
                if process is not None and process.poll() is None:
                    process.kill()
                if process is not None:
                    process.wait()

        # Check both exits: fasta can successfully consume a partial stream
        # even though collate failed while decoding the original BAM.
        for process, command, log in (
            (fasta, "fasta", fasta_log),
            (collate, "collate", collate_log),
        ):
            log.seek(max(0, log.tell() - 8192))
            _check_samtools_result(
                file_name,
                command,
                process.returncode,
                log.read().decode("utf-8", errors="replace"),
            )


def _fasta_read_count(path: Path, file_name: FileName, deadline: float) -> int:
    count = 0
    with path.open(encoding="utf-8") as handle:
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
        directory = Path(tempfile.mkdtemp(prefix="bam-reads-", dir=data_dir))
        # Check EOF. -u permits unaligned BAMs without reference headers.
        _run_samtools(["quickcheck", "-u", str(bam_path)], file_name, deadline)
        primary_args = ["view", "-c", "-F", _ALTERNATIVE_ALIGNMENT_FLAGS]
        hard_clipped_count = int(
            _run_samtools(
                [*primary_args, "-e", "hclen > 0", str(bam_path)],
                file_name,
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
        primary_count = int(
            _run_samtools([*primary_args, str(bam_path)], file_name, deadline).strip()
        )
        if primary_count == 0:
            raise _invalid_bam(
                file_name, "contains no primary reads to check for human contamination."
            )
        paths = tuple(
            directory / name
            for name in (
                "first.fasta",
                "second.fasta",
                "singletons.fasta",
                "unpaired.fasta",
            )
        )
        _extract_fasta(file_name, bam_path, directory, paths, deadline)
        counts = tuple(_fasta_read_count(path, file_name, deadline) for path in paths)
        if counts[0] != counts[1] or sum(counts) != primary_count:
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
