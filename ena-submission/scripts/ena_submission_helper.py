import gzip
import json
import logging
import os
import re
import subprocess
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import requests
import xmltodict
from ena_types import (
    AssemblyChromosomeListFile,
    AssemblyManifest,
    ProjectSet,
    SampleSetType,
    XmlAttribute,
)
from requests.auth import HTTPBasicAuth

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class ENAConfig:
    ena_submission_username: str
    ena_submission_password: str
    ena_submission_url: str
    ena_reports_service_url: str


def get_ena_config(
    ena_submission_username_default: str,
    ena_submission_password_default: str,
    ena_submission_url_default: str,
    ena_reports_service_url_default: str,
) -> ENAConfig:
    ena_submission_username = os.getenv("ENA_USERNAME")
    if not ena_submission_username:
        ena_submission_username = ena_submission_username_default

    ena_submission_password = os.getenv("ENA_PASSWORD")
    if not ena_submission_password:
        ena_submission_password = ena_submission_password_default

    ena_submission_url = ena_submission_url_default
    ena_reports_service_url = ena_reports_service_url_default

    db_params = {
        "ena_submission_username": ena_submission_username,
        "ena_submission_password": ena_submission_password,
        "ena_submission_url": ena_submission_url,
        "ena_reports_service_url": ena_reports_service_url,
    }

    return ENAConfig(**db_params)


@dataclass
class CreationResults:
    errors: list[str]
    warnings: list[str]
    results: dict[str, str] | None = None


def recursive_defaultdict():
    return defaultdict(recursive_defaultdict)


def dataclass_to_dict(dataclass_instance):
    """
    Converts a dataclass instance to a dictionary, handling nested dataclasses.
    """
    if not hasattr(dataclass_instance, "__dataclass_fields__"):
        return dataclass_instance
    result = {}
    for field in dataclass_instance.__dataclass_fields__:
        value = getattr(dataclass_instance, field)
        is_xml_attribute = isinstance(value, XmlAttribute)
        if value is None:
            continue
        if isinstance(value, list):
            result[field.upper()] = [dataclass_to_dict(item) for item in value]
        elif is_xml_attribute:
            attribute_field = "@" + field
            result[attribute_field] = value
        else:
            result[field.upper()] = dataclass_to_dict(value)
    return result


def dataclass_to_xml(dataclass_instance, root_name="root"):
    dataclass_dict = dataclass_to_dict(dataclass_instance)
    return xmltodict.unparse({root_name: dataclass_dict}, pretty=True)


def get_submission_dict():
    submission = recursive_defaultdict()
    submission["SUBMISSION"]["ACTIONS"]["ACTION"]["ADD"] = None
    return submission


def create_ena_project(config: ENAConfig, project_set: ProjectSet) -> CreationResults:
    """
    The project creation request should be equivalent to 
    curl -u {params.ena_submission_username}:{params.ena_submission_password} \
        -F "SUBMISSION=@{submission.xml}" \
        -F "PROJECT=@{project.xml}" \
        {params.ena_submission_url} \
    > {output}
    """
    errors = []
    warnings = []

    def get_project_xml(project_set):
        submission_set = get_submission_dict()
        return {
            "SUBMISSION": xmltodict.unparse(submission_set, pretty=True),
            "PROJECT": dataclass_to_xml(project_set, root_name="PROJECT_SET"),
        }

    xml = get_project_xml(project_set)
    try:
        response = post_webin(config, xml)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        error_message = (
            f"Request failed with status:{response.status_code}. Message: {e}. "
            f"Response: {response.text}."
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResults(results=None, errors=errors, warnings=warnings)
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
        error_message = f"Response is in unexpected format: {e}. " f"Response: {response.text}."
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResults(results=None, errors=errors, warnings=warnings)
    project_results = {
        "bioproject_accession": parsed_response["RECEIPT"]["PROJECT"]["@accession"],
        "ena_submission_accession": parsed_response["RECEIPT"]["SUBMISSION"]["@accession"],
    }
    return CreationResults(results=project_results, errors=errors, warnings=warnings)


def create_ena_sample(config: ENAConfig, sample_set: SampleSetType) -> CreationResults:
    """
    The sample creation request should be equivalent to 
    curl -u {params.ena_submission_username}:{params.ena_submission_password} \
       -F "SUBMISSION=@submission.xml" \
       -F "SAMPLE=@{sample.xml}" \
       {params.ena_submission_url} \
       > {output}
    """
    errors = []
    warnings = []

    def get_sample_xml(sample_set):
        submission_set = get_submission_dict()
        files = {
            "SUBMISSION": xmltodict.unparse(submission_set, pretty=True),
            "SAMPLE": dataclass_to_xml(sample_set, root_name="SAMPLE_SET"),
        }
        return files

    xml = get_sample_xml(sample_set)
    try:
        response = post_webin(config, xml)
        response.raise_for_status()
    except requests.exceptions.RequestException:
        error_message = (
            f"Request failed with status:{response.status_code}. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResults(results=None, errors=errors, warnings=warnings)
    try:
        parsed_response = xmltodict.parse(response.text)
        valid = (
            parsed_response["RECEIPT"]["@success"] == "true"
            and parsed_response["RECEIPT"]["SAMPLE"]["@accession"]
            and parsed_response["RECEIPT"]["SAMPLE"]["EXT_ID"]["@type"] == "biosample"
            and parsed_response["RECEIPT"]["SAMPLE"]["EXT_ID"]["@accession"]
            and parsed_response["RECEIPT"]["SUBMISSION"]["@accession"]
        )
        if not valid:
            raise requests.exceptions.RequestException
    except:
        error_message = (
            f"Response is in unexpected format. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResults(results=None, errors=errors, warnings=warnings)
    sample_results = {
        "ena_sample_accession": parsed_response["RECEIPT"]["SAMPLE"]["@accession"],
        "biosample_accession": parsed_response["RECEIPT"]["SAMPLE"]["EXT_ID"]["@accession"],
        "ena_submission_accession": parsed_response["RECEIPT"]["SUBMISSION"]["@accession"],
    }
    return CreationResults(results=sample_results, errors=errors, warnings=warnings)


def post_webin(config: ENAConfig, xml: dict[str, Any]) -> requests.Response:
    return requests.post(
        config.ena_submission_url,
        auth=HTTPBasicAuth(config.ena_submission_username, config.ena_submission_password),
        files=xml,
        timeout=10,  # wait a full 10 seconds for a response incase slow
    )


def create_chromosome_list(list_object: AssemblyChromosomeListFile) -> str:
    """
    Creates a temp file chromosome list:
    https://ena-docs.readthedocs.io/en/latest/submit/fileprep/assembly.html#chromosome-list-file
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".gz") as temp:
        filename = temp.name

    with gzip.GzipFile(filename, "wb") as gz:
        for entry in list_object.chromosomes:
            gz.write(
                f"{entry.object_name}\t{entry.chromosome_name}\t{entry.topology!s}-{entry.chromosome_type!s}\n".encode()
            )

    return filename


def create_fasta(
    unaligned_sequences: dict[str, str], chromosome_list: AssemblyChromosomeListFile
) -> str:
    """
    Creates a temp fasta file:
    https://ena-docs.readthedocs.io/en/latest/submit/fileprep/assembly.html#fasta-file
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".fasta.gz") as temp:
        filename = temp.name

    with gzip.GzipFile(filename, "wb") as gz:
        if len(unaligned_sequences.keys()) == 1:
            entry = chromosome_list.chromosomes[0]
            gz.write(f">{entry.object_name}\n".encode())
            gz.write(f"{unaligned_sequences["main"]}\n".encode())
        else:
            for entry in chromosome_list.chromosomes:
                gz.write(f">{entry.object_name}\n".encode())
                gz.write(f"{unaligned_sequences[entry.chromosome_name]}\n".encode())

    return filename


def create_manifest(manifest: AssemblyManifest) -> str:
    """
    Creates a temp manifest file:
    https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html#manifest-files
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".tsv") as temp:
        filename = temp.name
    with open(filename, "w") as f:
        f.write(f"STUDY\t{manifest.study}\n")
        f.write(f"SAMPLE\t{manifest.sample}\n")
        f.write(
            f"ASSEMBLYNAME\t{manifest.assemblyname}\n"
        )  # This is the alias that needs to be unique
        f.write(f"ASSEMBLY_TYPE\t{manifest.assembly_type!s}\n")
        f.write(f"COVERAGE\t{manifest.coverage}\n")
        f.write(f"PROGRAM\t{manifest.program}\n")
        f.write(f"PLATFORM\t{manifest.platform}\n")
        f.write(f"FASTA\t{manifest.fasta}\n")
        f.write(f"CHROMOSOME_LIST\t{manifest.chromosome_list}\n")
        if manifest.description:
            f.write(f"DESCRIPTION\t{manifest.description}\n")
        if manifest.moleculetype:
            f.write(f"MOLECULETYPE\t{manifest.moleculetype!s}\n")

    return filename


def post_webin_cli(
    config: ENAConfig, manifest_filename, center_name=None, test=True
) -> subprocess.CompletedProcess:
    subprocess_args = [
        "java",
        "-jar",
        "webin-cli.jar",
        "-username",
        config.ena_submission_username,
        "-password",
        config.ena_submission_password,
        "-context",
        "genome",
        "-manifest",
        manifest_filename,
        "-submit",
    ]
    subprocess_args.append("-test") if test else None
    if center_name:
        subprocess_args.extend(["-centername", center_name])
    return subprocess.run(
        subprocess_args,
        capture_output=True,
        text=True,
        check=False,
    )


def create_ena_assembly(
    config: ENAConfig, manifest_filename: str, center_name=None, test=True
) -> CreationResults:
    """
    This is equivalent to running:
    webin-cli -username {params.ena_submission_username} -password {params.ena_submission_password}
        -context genome -manifest {manifest_file} -submit
    test=True, adds the `-test` flag which means submissions will use the ENA dev endpoint.
    """
    errors = []
    warnings = []
    response = post_webin_cli(config, manifest_filename, center_name=center_name, test=test)
    logger.info(response.stdout)
    if response.returncode != 0:
        error_message = (
            f"Request failed with status:{response.returncode}. "
            f"Stdout: {response.stdout}, Stderr: {response.stderr}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResults(results=None, errors=errors, warnings=warnings)

    lines = response.stdout.splitlines()
    erz_accession = None
    for line in lines:
        if "The following analysis accession was assigned to the submission:" in line:
            match = re.search(r"ERZ\d+", line)
            if match:
                erz_accession = match.group(0)
                break
    if not erz_accession:
        error_message = (
            f"Response is in unexpected format. "
            f"Stdout: {response.stdout}, Stderr: {response.stderr}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResults(results=None, errors=errors, warnings=warnings)
    assembly_results = {
        "erz_accession": erz_accession,
    }
    return CreationResults(results=assembly_results, errors=errors, warnings=warnings)


def check_ena(config: ENAConfig, erz_accession: str, segment_order: list[str]) -> CreationResults:
    """
    This is equivalent to running:
    curl -X 'GET' \
    '{config.ena_reports_service_url}/analysis-process/{erz_accession}?format=json&max-results=100' \
    -H 'accept: */*' \
    -H 'Authorization: Basic KEY'
    """
    url = f"{config.ena_reports_service_url}/analysis-process/{erz_accession}?format=json&max-results=100"

    errors = []
    warnings = []
    assembly_results = {}
    try:
        response = requests.get(
            url,
            auth=HTTPBasicAuth(config.ena_submission_username, config.ena_submission_password),
            timeout=10,  # wait a full 10 seconds for a response incase slow
        )
        response.raise_for_status()
    except requests.exceptions.RequestException:
        error_message = (
            f"ENA check failed with status:{response.status_code}. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResults(results=None, errors=errors, warnings=warnings)
    if response.text == "[]":
        # For some minutes the response will be empty, requests to
        # f"{config.ena_reports_service_url}/analysis-files/{erz_accession}?format=json"
        # should still succeed
        return CreationResults(results=None, errors=errors, warnings=warnings)
    try:
        parsed_response = json.loads(response.text)
        entry = parsed_response[0]["report"]
        if entry["processingError"]:
            raise requests.exceptions.RequestException
        if entry["processingStatus"] == "COMPLETED":
            acc_list = entry["acc"].split(",")
            acc_dict = {a.split(":")[0]: a.split(":")[-1] for a in acc_list}
            if "genome" not in acc_dict:
                logger.error("Unexpected response format: genome not in acc_dict")
                raise requests.exceptions.RequestException
            gca_accession = acc_dict["genome"]
            if "chromosomes" not in acc_dict:
                logger.error("Unexpected response format: chromosome not in acc_dict")
                raise requests.exceptions.RequestException
            insdc_accession_range = acc_dict["chromosomes"]
            if len(segment_order) == 1 and len(insdc_accession_range.split("-")) == 0:
                assembly_results["insdc_accession"] = insdc_accession_range
            else:
                insdc_accession_start_int = int(insdc_accession_range.split("-")[0][2:])
                insdc_accession_end_int = int(insdc_accession_range.split("-")[-1][2:])
                if insdc_accession_end_int - insdc_accession_start_int != len(segment_order) - 1:
                    logger.error(
                        "Unexpected response format: chromosome does not have expected number of segments"
                    )
                    raise requests.exceptions.RequestException
                assembly_results.extend(
                    {
                        "insdc_accession_" + segment_order[i]: "OZ"
                        + str(insdc_accession_start_int + i)
                        for i in range(len(segment_order))
                    }
                )
        else:
            return CreationResults(results=None, errors=errors, warnings=warnings)
    except:
        error_message = (
            f"ENA Check returned errors or is in unexpected format. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResults(results=None, errors=errors, warnings=warnings)
    assembly_results.extend(
        {
            "erz_accession": erz_accession,
            "gca_accession": gca_accession,
        }
    )
    return CreationResults(results=assembly_results, errors=errors, warnings=warnings)
