import logging
import os
import subprocess  # noqa: S404
from pathlib import Path
from typing import cast

from raw_reads_processing.config import Config
from raw_reads_processing.datatypes import Annotation, DeaconSummary, FileName
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure

logger = logging.getLogger(__name__)

DEACON_INDEX_PATH = os.environ.get("DEACON_INDEX_PATH", "/data/deacon.idx")


def prepare_deacon_index() -> None:
    if not Path(DEACON_INDEX_PATH).is_file():
        raise RuntimeError(
            f"Deacon index not found at '{DEACON_INDEX_PATH}'. Please ensure the deacon index is mounted at the correct path."
        )


def start_deacon_server() -> subprocess.Popen:
    args = [
        "deacon",
        "server",
        "start",
    ]
    logger.debug("Starting Deacon server")

    return subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # noqa: S603


def stop_deacon_server(proc: subprocess.Popen) -> None:
    args = ["deacon", "--use-server", "server", "stop"]
    logger.debug("Stopping Deacon server")

    subprocess.run(  # noqa: S603
        args,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        logger.warning("Failed to stop Deacon server gracefully, sending SIGKILL")
        proc.kill()
        proc.wait()


def run_deacon_filter(
    file_name_to_path: dict[FileName, Path], data_dir: str, config: Config
) -> DeaconSummary:
    summary_json_path = Path(data_dir) / "summary.json"
    args = [
        "deacon",
        "--use-server",
        "filter",
        "--summary",
        summary_json_path,
        "-a",
        str(config.deacon_a),
        "-r",
        str(config.deacon_r),
        DEACON_INDEX_PATH,
        *file_name_to_path.values(),
    ]
    logger.debug(
        f"Running Deacon filter on '{', '.join(str(f) for f in file_name_to_path.keys())}': {args}"
    )

    try:
        subprocess.run(  # noqa: S603
            args,
            check=True,
            capture_output=True,
            text=True,
            timeout=config.deacon_filter_timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        message = (
            f"Validation of files '{','.join(str(f) for f in file_name_to_path.values())}' "
            f"timed out after {config.deacon_filter_timeout_seconds} seconds."
        )
        logger.error(message)
        raise ProcessingFailure(message) from None
    except subprocess.CalledProcessError as error:
        # TODO: send a slack notification to alert the team that deacon is failing
        message = f"Deacon filter failed with exit code {error.returncode}. stdout: {error.stdout}, stderr: {error.stderr}"
        logger.error(message)
        raise RuntimeError(message) from error
    return DeaconSummary.from_json(summary_json_path)


# TODO: Add a link to the documentation for removing host reads
DEACON_ERROR_PROMPT = (
    "We cannot accept files with a high proportion of human reads, as they may contain "
    "sensitive human genetic information. Please remove host reads from your data and resubmit."
    "Please see our documentation for more information on how to remove host reads from your data."
)


def deacon_message() -> str:
    intro = "Our QC pipeline identified reads that map to the human genome. "
    prompt = DEACON_ERROR_PROMPT
    return intro + prompt


def log_deacon_summary(deacon_summary: DeaconSummary, config: Config) -> None:
    reads_ok = deacon_summary.seqs_out_proportion <= cast(
        float, config.deacon_max_host_reads_proportion
    )
    bp_ok = deacon_summary.bp_out <= cast(int, config.deacon_max_host_bp)
    status = "passed" if reads_ok and bp_ok else "failed"

    logger.info(
        f"Deacon filter {status} in {deacon_summary.time:.2f}s: "
        f"reads {deacon_summary.seqs_out}/{deacon_summary.seqs_in} "
        f"({deacon_summary.seqs_out_proportion:.2%}, "
        f"threshold {config.deacon_max_host_reads_proportion:.2%}) "
        f"[{'OK' if reads_ok else 'EXCEEDED'}], "
        f"bp {deacon_summary.bp_out}/{deacon_summary.bp_in} "
        f"({deacon_summary.bp_out_proportion:.2%}, "
        f"threshold {config.deacon_max_host_bp} bp) "
        f"[{'OK' if bp_ok else 'EXCEEDED'}] mapped to the human genome."
    )


def validate_with_deacon(files: dict[FileName, Path], data_dir: str, config: Config):
    deacon_summary = run_deacon_filter(
        files,
        data_dir=data_dir,
        config=config,
    )
    log_deacon_summary(deacon_summary, config)

    if deacon_summary.seqs_out_proportion > cast(
        float, config.deacon_max_host_reads_proportion
    ) or deacon_summary.bp_out > cast(int, config.deacon_max_host_bp):
        raise InvalidSubmission(
            Annotation(
                fileNames=list(files.keys()),
                message=deacon_message(),
            )
        )
