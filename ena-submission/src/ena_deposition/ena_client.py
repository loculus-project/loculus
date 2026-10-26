"""Client for ENA: Webin HTTP API, reports service and the webin-cli subprocess.

Also parses ENA's responses into CreationResults.
"""

import glob
import json
import logging
import re
import subprocess  # noqa: S404
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final, Literal

import requests
import xmltodict
from bs4 import BeautifulSoup
from requests.auth import HTTPBasicAuth
from tenacity import (
    RetryCallState,
    Retrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_fixed,
)

from .config import Config, EnaOrganismDetails, EnaResultField
from .ena_builders import get_project_xml, get_sample_xml
from .ena_types import ProjectSet, SampleSetType

logger = logging.getLogger(__name__)


@dataclass
class CreationResult:
    errors: list[str]
    warnings: list[str]
    result: dict[str, str | Sequence[str]] | None = None


def create_ena_project(config: Config, project_set: ProjectSet) -> CreationResult:
    """
    The project creation request should be equivalent to
    curl -u {params.ena_submission_username}:{params.ena_submission_password} \\
        -F "SUBMISSION=@{submission.xml}" \\
        -F "PROJECT=@{project.xml}" \\
        {params.ena_submission_url} \\
    > {output}
    """
    errors = []
    warnings: list[str] = []

    xml = get_project_xml(project_set)
    logger.debug(f"Posting Project creation XML to ENA with alias {project_set.project[0].alias}")
    try:
        # Actual HTTP request to ENA happens here
        response = post_webin_with_retry(config, xml)
    except requests.exceptions.RequestException as e:
        error_message = f"Request failed with exception: {e}."
        logger.error(error_message)
        errors.append(error_message)
        return CreationResult(errors=errors, warnings=warnings)

    if not response.ok:
        error_message = (
            f"Request failed with status:{response.status_code}. Response: {response.text}."
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(errors=errors, warnings=warnings)
    try:
        parsed_response = xmltodict.parse(response.text)
        valid = (
            parsed_response["RECEIPT"]["@success"] == "true"
            and parsed_response["RECEIPT"]["PROJECT"]["@accession"]
            and parsed_response["RECEIPT"]["SUBMISSION"]["@accession"]
        )
        if not valid:
            raise requests.exceptions.RequestException
    except Exception as e:
        error_message = f"Response is in unexpected format: {e}. Response: {response.text}."
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(errors=errors, warnings=warnings)
    project_results = {
        EnaResultField.BIOPROJECT: parsed_response["RECEIPT"]["PROJECT"]["@accession"],
        "ena_submission_accession": parsed_response["RECEIPT"]["SUBMISSION"]["@accession"],
    }
    return CreationResult(result=project_results, errors=errors, warnings=warnings)


def create_ena_sample(
    config: Config, sample_set: SampleSetType, revision: bool = False
) -> CreationResult:
    """
    The sample creation request should be equivalent to
    curl -u {params.ena_submission_username}:{params.ena_submission_password} \\
       -F "SUBMISSION=@submission.xml" \\
       -F "SAMPLE=@{sample.xml}" \\
       {params.ena_submission_url} \\
       > {output}
    """
    errors = []
    warnings: list[str] = []

    xml = get_sample_xml(sample_set, revision=revision)
    logger.debug(f"Posting Sample creation XML to ENA with alias {sample_set.sample[0].alias}")
    try:
        response = post_webin_with_retry(config, xml)
    except requests.exceptions.RequestException as e:
        error_message = f"Request failed with exception: {e}."
        logger.error(error_message)
        errors.append(error_message)
        return CreationResult(errors=errors, warnings=warnings)

    if not response.ok:
        error_message = (
            f"Request failed with status:{response.status_code}. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(errors=errors, warnings=warnings)
    try:
        parsed_response = xmltodict.parse(response.text)
        valid = (
            parsed_response["RECEIPT"]["@success"] == "true"
            and parsed_response["RECEIPT"]["SAMPLE"]["@accession"]
            and parsed_response["RECEIPT"]["SAMPLE"]["EXT_ID"]["@type"] == "biosample"
            and parsed_response["RECEIPT"]["SAMPLE"]["EXT_ID"]["@accession"]
            and "@accession" in parsed_response["RECEIPT"]["SUBMISSION"]
        )
        if not valid:
            # normal value error
            msg = f"XML response not as expected, response: {response.text}"
            raise ValueError(msg)
    except Exception:
        error_message = (
            f"Response is in unexpected format. Request: {response.request}, "
            f"Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(errors=errors, warnings=warnings)
    sample_results = {
        "ena_sample_accession": parsed_response["RECEIPT"]["SAMPLE"]["@accession"],
        EnaResultField.BIOSAMPLE: parsed_response["RECEIPT"]["SAMPLE"]["EXT_ID"]["@accession"],
        "ena_submission_accession": parsed_response["RECEIPT"]["SUBMISSION"]["@accession"],
    }
    return CreationResult(result=sample_results, errors=errors, warnings=warnings)


def log_before_retry(retry_state: RetryCallState):
    attempt_num = retry_state.attempt_number
    logger.info(f"Request timed out. Retrying attempt {attempt_num}...")


def post_webin_with_retry(config: Config, xml: dict[str, Any]) -> requests.Response:
    def _do_post():
        # The only change is removing response.raise_for_status()
        return requests.post(
            config.ena_submission_url,
            auth=HTTPBasicAuth(config.ena_submission_username, config.ena_submission_password),
            files=xml,
            timeout=config.ena_http_timeout_seconds,
        )

    retryer = Retrying(
        stop=stop_after_attempt(config.ena_http_post_retry_attempts),
        wait=wait_fixed(2),
        retry=retry_if_exception_type(requests.exceptions.Timeout),
        reraise=True,
        before_sleep=log_before_retry,
    )

    return retryer(_do_post)


def ena_http_get_with_retry(config: Config, url: str) -> requests.Response:
    def _do_get():
        return requests.get(
            url,
            auth=HTTPBasicAuth(config.ena_submission_username, config.ena_submission_password),
            timeout=config.ena_http_timeout_seconds,
        )

    retryer = Retrying(
        stop=stop_after_attempt(config.ena_http_get_retry_attempts),
        wait=wait_fixed(2),
        retry=retry_if_exception_type(requests.exceptions.Timeout),
        reraise=True,
        before_sleep=log_before_retry,
    )

    return retryer(_do_get)


def post_webin_cli(
    config: Config,
    manifest_filename,
    tmpdir: tempfile.TemporaryDirectory,
    center_name=None,
    context: Literal["genome", "reads"] = "genome",
) -> subprocess.CompletedProcess:
    logger.debug(
        f"Posting manifest {manifest_filename} to ENA Webin CLI with test={config.test} and "
        f"center_name={center_name}"
    )
    subprocess_args_with_emtpy_strings: Final[list[str]] = [
        "ena-webin-cli",
        f"-username={config.ena_submission_username}",
        f"-centername={center_name}" if center_name else "",
        "-submit",
        f"-context={context}",
        f"-manifest={manifest_filename}",
        f"-outputdir={tmpdir.name}",
        "-test" if config.test else "",
        f"-password={config.ena_submission_password}",
    ]
    # Remove empty strings from the list
    subprocess_args = [arg for arg in subprocess_args_with_emtpy_strings if arg]
    redacted_args = [
        arg if not arg.startswith("-password") else "-password=<REDACTED>"
        for arg in subprocess_args
    ]
    logger.info(f"Invoking webin-cli with args: {redacted_args}")
    # config.ena_submission_password and config.ena_submission_username can be used for injection
    # however we don't spawn a shell (shell=False) and trust webin-cli to handle the arguments
    # safely.

    return subprocess.run(  # noqa: S603
        subprocess_args,
        capture_output=True,
        text=True,
        check=False,
        shell=False,
        timeout=config.ena_webin_cli_timeout_seconds,
    )


_WEBIN_CLI_ACCESSION_MARKER = "The following {kind} accession was assigned to the submission:"


def _extract_accessions(
    stdout: str,
    patterns: dict[str, tuple[str, str]],
) -> dict[str, str | Sequence[str]] | None:
    """
    Extract accessions from Webin CLI output.

    patterns maps output keys to (kind, regex), where `kind` is the noun Webin CLI uses in
    its "The following {kind} accession was assigned to the submission:" marker line, e.g.
    "analysis", "experiment", "run".
    """
    result: dict[str, str | Sequence[str]] = {}

    for line in stdout.splitlines():
        for key, (kind, regex) in patterns.items():
            if _WEBIN_CLI_ACCESSION_MARKER.format(kind=kind) not in line:
                continue

            match = re.search(regex, line)
            if match:
                accession = match.group(0)
                result[key] = accession
                logger.info(
                    "Webin CLI succeeded and returned %s: %s",
                    key,
                    accession,
                )

    return result if len(result) == len(patterns) else None


def _run_webin_cli_submission(
    config: Config,
    manifest_filename: str,
    center_name: str | None,
    context: Literal["genome", "reads"],
    patterns: dict[str, tuple[str, str]],
) -> CreationResult:
    """
    Runs `ena-webin-cli -submit` for the given context and manifest, extracting the
    accession(s) named in `patterns` (see `_extract_accessions`) from stdout on success.

    On failure - a non-zero exit code, or a zero exit code without all expected
    accessions - logs the manifest and webin-cli log files and returns the errors instead.

    config.test=True, adds the `-test` flag which means submissions will use the ENA dev endpoint.
    """
    # create a tmp dir for output files
    # use normal python stuff for that

    output_tmpdir = tempfile.TemporaryDirectory()

    try:
        response = post_webin_cli(
            config,
            manifest_filename,
            tmpdir=output_tmpdir,
            center_name=center_name,
            context=context,
        )
    except subprocess.TimeoutExpired as e:
        # timeout logs may include sensitive info, so redact them
        msg = f"webin-cli timed out after {e.timeout}s"
        return CreationResult(errors=[msg], warnings=[])
    except Exception as e:
        msg = f"Error occurred while running webin-cli: {type(e).__name__}"
        logger.error(msg)
        return CreationResult(errors=[msg], warnings=[])

    if response.returncode == 0:
        if accessions := _extract_accessions(response.stdout, patterns):
            # Happy path: webin-cli succeeded and returned the expected accession(s)
            return CreationResult(result=accessions, errors=[], warnings=[])
        missing_accessions = " or ".join(f"{kind} accession" for kind in patterns)
        error_message = f"Webin CLI command succeeded but did not return {missing_accessions}. "
    else:
        error_message = f"Webin CLI command failed with status: {response.returncode}. "

    error_message += f"Stdout: {response.stdout}, Stderr: {response.stderr}"
    logger.error(error_message)

    try:
        manifest_contents = Path(manifest_filename).read_text(encoding="utf-8")
        logger.info(f"manifest.tsv contents:\n{manifest_contents}")
    except Exception as e:
        logger.warning(f"Reading manifest from {manifest_filename} failed: {e}")

    for file_path in glob.glob(f"{output_tmpdir.name}/**", recursive=True, include_hidden=True):
        logger.info(f"Attempting to print webin-cli log file: {file_path}")
        try:
            contents = Path(file_path).read_text(encoding="utf-8")
            logger.info(f"webin-cli log file {file_path} contents:\n{contents}")
        except Exception as e:
            logger.warning(f"Reading webin-cli log file {file_path} failed: {e}")
    return CreationResult(errors=[error_message], warnings=[])


def create_ena_assembly(config: Config, manifest_filename: str, center_name=None) -> CreationResult:
    """
    This is equivalent to running:
    ena-webin-cli -username {params.ena_submission_username} \\
        -password {params.ena_submission_password} -context genome \\
        -manifest {manifest_file} -submit
    config.test=True, adds the `-test` flag which means submissions will use the ENA dev endpoint.
    """
    return _run_webin_cli_submission(
        config,
        manifest_filename,
        center_name,
        context="genome",
        patterns={"erz_accession": ("analysis", r"ERZ\d+")},
    )


def create_ena_raw_reads(
    config: Config, manifest_filename: str, center_name=None
) -> CreationResult:
    """
    This is equivalent to running:
    ena-webin-cli -submit \\
        -context reads \\
        -manifest manifest.tsv \\
        -username Webin-XXXXX \\
        -password YYYYYY
    config.test=True, adds the `-test` flag which means submissions will use the ENA dev endpoint.
    """
    return _run_webin_cli_submission(
        config,
        manifest_filename,
        center_name,
        context="reads",
        patterns={
            EnaResultField.EXPERIMENT: ("experiment", r"ERX\d+"),
            EnaResultField.RUN: ("run", r"ERR\d+"),
        },
    )


def get_ena_analysis_process(
    config: Config, erz_accession: str, segment_order: list[str], organism: EnaOrganismDetails
) -> CreationResult:
    """
    Query ENA webin endpoint to get analysis outcomes: assembly (GCA) and nucleotide accessions
    Weird name "process" instead of "processing_result" is to match the ENA API.
    This is equivalent to running:
    curl -X 'GET' \\
    '{config.ena_reports_service_url}/analysis-process/{erz_accession}?format=json\\
&max-results=100' \\
    -H 'accept: */*' \\
    -H 'Authorization: Basic USERNAME PASSWORD'
    """
    url: Final = (
        config.ena_reports_service_url
        + "/analysis-process/"
        + erz_accession
        + "?format=json&max-results=100"
    )

    errors = []
    warnings: list[str] = []
    assembly_results = {"segment_order": segment_order, "erz_accession": erz_accession}
    logger.debug(f"Getting ENA analysis process for ERZ accession: {erz_accession}")
    try:
        response: requests.Response = ena_http_get_with_retry(config, url)
    except requests.exceptions.RequestException as e:
        error_message = f"Request failed with exception: {e}."
        logger.error(error_message)
        errors.append(error_message)
        return CreationResult(errors=errors, warnings=warnings)
    if not response.ok:
        req = response.request
        headers = req.headers
        headers["Authorization"] = "Basic <REDACTED>"  # Redact sensitive info
        text = response.text
        error_message = (
            f"Getting ENA processing results & accessions failed with status code: "
            f"{response.status_code}. "
            f"Request: method={req.method}, url={req.url}, headers={headers}. "
        )
        if response.headers.get("Content-Type", "").startswith("text/html"):
            soup = BeautifulSoup(text, "html.parser")
            title = (
                soup.title.string if soup.title else soup.h1.string if soup.h1 else "No title found"
            )
            error_message += f"Response was HTML with title: {title}"
        logger.error(error_message)
        errors.append(error_message)
        logger.debug(f"First 1000 characters of ENA API response text: {response.text[:1000]}")
        return CreationResult(errors=errors, warnings=warnings)
    if response.text == "[]":
        # For some minutes the response will be empty, requests to
        # f"{config.ena_reports_service_url}/analysis-files/{erz_accession}?format=json"
        # should still succeed
        return CreationResult(errors=errors, warnings=warnings)
    try:  # noqa: PLW0717
        parsed_response = json.loads(response.text)
        entry = parsed_response[0]["report"]
        if entry["processingError"]:
            raise requests.exceptions.RequestException
        if entry["processingStatus"] == "COMPLETED":
            acc_list = entry["acc"].split(",")
            acc_dict = {a.split(":")[0]: a.split(":")[-1] for a in acc_list}
            gca_accession = acc_dict.get("genome")
            if gca_accession:
                assembly_results.update(
                    {
                        EnaResultField.GCA: gca_accession,
                    }
                )
            insdc_accession_range = acc_dict.get("chromosomes")
            if insdc_accession_range:
                chromosome_accessions_dict = get_chromsome_accessions(
                    insdc_accession_range, segment_order, organism.is_multi_segment()
                )
                assembly_results.update(chromosome_accessions_dict)
        else:
            return CreationResult(errors=errors, warnings=warnings)
    except Exception:
        error_message = (
            f"ENA Check returned errors or is in unexpected format. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(errors=errors, warnings=warnings)
    return CreationResult(result=assembly_results, errors=errors, warnings=warnings)


def get_chromsome_accessions(
    insdc_accession_range: str, segment_order: list[str], is_multi_segment: bool
) -> dict[str, str]:
    """
    ENA doesn't actually give us the version, we assume it's 1.
    ### Example inputs
    insdc_accession_range: "OZ189935-OZ189936"
    segment_order: ["segment1", "segment2"]
    ### Example output
    {
        "insdc_accession_segment1": "OZ189935",
        "insdc_accession_full_segment1": "OZ189935.1",
        "insdc_accession_segment2": "OZ189936",
        "insdc_accession_full_segment2": "OZ189936.1",
    }
    """
    try:  # noqa: PLW0717
        start, end = insdc_accession_range.split("-")
        start_letters = start[:2]
        end_letters = end[:2]

        if start_letters != end_letters:
            msg = "Prefixes in the accession range do not match"
            raise ValueError(msg)

        num_digits = len(start) - 2
        start_num = int(start[2:])
        end_num = int(end[2:])

        if end_num - start_num != len(segment_order) - 1:
            logger.error(
                f"Unexpected response format: chromosome does not have expected number "
                f"of segments. Expected {len(segment_order)} segments, "
                f"got {end_num - start_num + 1}. "
                f"For insdc_accession_range: {insdc_accession_range} and "
                f"segment_order: {segment_order}"
            )
            msg = "Unexpected number of segments"
            raise ValueError(msg)

        if not is_multi_segment:
            accession = f"{start_letters}{start_num:0{num_digits}d}"
            return {
                EnaResultField.INSDC_ACCESSION_PREFIX: accession,
                EnaResultField.INSDC_ACCESSION_FULL_PREFIX: f"{accession}.1",
            }
        results = {}
        for i, segment in enumerate(segment_order):
            accession = f"{start_letters}{(start_num + i):0{num_digits}d}"
            results[f"{EnaResultField.INSDC_ACCESSION_PREFIX}_{segment}"] = accession
            results[f"{EnaResultField.INSDC_ACCESSION_FULL_PREFIX}_{segment}"] = f"{accession}.1"
        return results

    # Don't handle the Value error here, let it propagate
    except ValueError as ve:
        raise ve
    except Exception as e:
        logger.error(
            f"Error processing chromosome accessions: {e!s}. "
            f"For insdc_accession_range: {insdc_accession_range} and segment_order: {segment_order}"
        )
        msg = "Failed to process chromosome accessions"
        raise ValueError(msg) from e


def accession_exists(
    accession: str,
    config: Config,
) -> bool:
    """Make request to ENA to check if an accession exists
    Returns True if accession exists, False otherwise.
    """
    url = f"https://www.ebi.ac.uk/ena/browser/api/summary/{accession}"
    try:
        response = ena_http_get_with_retry(config, url)
        return int(response.json()["total"]) > 0
    except Exception as e:
        logger.error(f"Error checking if accession exists: {e!s}")
        return False
