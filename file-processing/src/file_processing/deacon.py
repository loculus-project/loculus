import logging
import subprocess  # noqa: S404
from pathlib import Path
from typing import cast
from typing_extensions import Literal

import requests
from file_processing.config import Config
from file_processing.datatypes import Annotation, DeaconSummary, FileCategory

logger = logging.getLogger(__name__)

DEACON_INDEX_PATH = "deacon.idx"


def fetch_default_deacon_index() -> None:
    args = ["deacon", "index", "fetch", "--output", DEACON_INDEX_PATH, "panhuman-1"]
    logger.debug(f"Fetching default deacon panhuman-1 index: {args}")

    exit_code = subprocess.run(args, check=False).returncode  # noqa: S603
    if exit_code != 0:
        message = f"Deacon fetch failed with exit code {exit_code}"
        logger.error(message)
        raise RuntimeError(message)


def download_deacon_index(config):
    if config.deacon_index_url:
        url = config.deacon_index_url
    else:
        fetch_default_deacon_index()
        return

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        Path(DEACON_INDEX_PATH).parent.mkdir(parents=True, exist_ok=True)
        Path(DEACON_INDEX_PATH).write_bytes(response.content)
    except requests.exceptions.RequestException as e:
        msg = f"Failed to download deacon index: {e}"
        logger.error(msg)
        raise RuntimeError(msg) from e

    logger.info(f"Deacon index downloaded successfully and saved to '{DEACON_INDEX_PATH}'")


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


def run_deacon_filter(input_files: list[str], data_dir: str, config: Config) -> DeaconSummary:
    summary_json_path = Path(data_dir) / "summary.json"
    args = [
        "deacon",
        "--use-server",
        "filter",
        "--summary",
        summary_json_path,
        "--a",
        config.deacon_a,
        "--r",
        config.deacon_r,
        DEACON_INDEX_PATH,
        *input_files,
    ]
    logger.debug(f"Running Deacon filter on '{', '.join(input_files)}': {args}")

    exit_code = subprocess.run(  # noqa: S603
        args, check=False, stdout=subprocess.DEVNULL
    ).returncode
    if exit_code != 0:
        message = f"Deacon filter failed with exit code {exit_code}"
        logger.error(message)
        raise Exception(message)
    return DeaconSummary.from_json(summary_json_path)


# TODO: Add links to deacon with correct parameters and index
DEACON_ERROR_PROMPT = (
    "We cannot accept files with a high proportion of host reads, as they may contain "
    "sensitive human genetic information. Please remove host reads from your data and resubmit."
)
DEACON_WARNING_PROMPT = (
    "Please review your submission and ensure that it does not contain "
    "sensitive human genetic information."
)


def deacon_message(
    files, numbers, maximum, type: Literal["base pairs", "reads"], error: bool
) -> str:
    return (
        f"Our QC pipeline identified {type} that map to the human genome. "
        if error
        else f"Our QC pipeline identified a small number of {type} that map to the human genome. "
        f"File(s): '{', '.join(file.name for file in files)}' "
        f"had {type} which mapped to the human genome, with a proportion of {numbers}, "
        f"the maximum allowed proportion is {maximum}. "
        f"{DEACON_ERROR_PROMPT}"
        if error
        else f"{DEACON_WARNING_PROMPT}"
    )


def process_deacon_run(
    deacon_summary: DeaconSummary, files: list, config: Config
) -> tuple[list[Annotation], list[Annotation]]:
    if deacon_summary.seqs_out_proportion > cast(float, config.deacon_max_host_reads_proportion):
        message = deacon_message(
            files,
            f"{deacon_summary.seqs_out_proportion} ({deacon_summary.seqs_out}/ {deacon_summary.seqs_in})",
            config.deacon_max_host_reads_proportion,
            "reads",
            True,
        )
        return [Annotation(fileId=None, fileCategory=FileCategory.RAW_READS, message=message)], []
    if deacon_summary.bp_out_proportion > cast(float, config.deacon_max_host_bp_proportion):
        message = deacon_message(
            files,
            f"{deacon_summary.bp_out_proportion} ({deacon_summary.bp_out}/ {deacon_summary.bp_in})",
            config.deacon_max_host_bp_proportion,
            "base pairs",
            True,
        )
        return [Annotation(fileId=None, fileCategory=FileCategory.RAW_READS, message=message)], []
    warnings: list[Annotation] = []
    if (
        0
        < deacon_summary.seqs_out_proportion
        <= cast(float, config.deacon_max_host_reads_proportion)
    ):
        message = deacon_message(
            files,
            f"{deacon_summary.seqs_out_proportion} ({deacon_summary.seqs_out}/ {deacon_summary.seqs_in})",
            config.deacon_max_host_reads_proportion,
            "reads",
            False,
        )
        warnings.append(
            Annotation(fileId=None, fileCategory=FileCategory.RAW_READS, message=message)
        )
    if 0 < deacon_summary.bp_out_proportion <= cast(float, config.deacon_max_host_bp_proportion):
        message = deacon_message(
            files,
            f"{deacon_summary.bp_out_proportion} ({deacon_summary.bp_out}/ {deacon_summary.bp_in})",
            config.deacon_max_host_bp_proportion,
            "base pairs",
            False,
        )
        warnings.append(
            Annotation(fileId=None, fileCategory=FileCategory.RAW_READS, message=message)
        )
    return [], warnings
