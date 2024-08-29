import logging
import os
from collections import defaultdict
from dataclasses import dataclass

import requests
import xmltodict
from ena_types import ProjectSet, SampleSetType, XmlAttribute
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


def get_ena_config(
    ena_submission_username_default: str,
    ena_submission_password_default: str,
    ena_submission_url_default: str,
):
    ena_submission_username = os.getenv("ENA_USERNAME")
    if not ena_submission_username:
        ena_submission_username = ena_submission_username_default

    ena_submission_password = os.getenv("ENA_PASSWORD")
    if not ena_submission_password:
        ena_submission_password = ena_submission_password_default

    ena_submission_url = ena_submission_url_default

    db_params = {
        "ena_submission_username": ena_submission_username,
        "ena_submission_password": ena_submission_password,
        "ena_submission_url": ena_submission_url,
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
        response = post_webin(xml, config)
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
        response = post_webin(xml, config)
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
    project_results = {
        "sra_run_accession": parsed_response["RECEIPT"]["SAMPLE"]["@accession"],
        "biosample_accession": parsed_response["RECEIPT"]["SAMPLE"]["EXT_ID"]["@accession"],
        "ena_submission_accession": parsed_response["RECEIPT"]["SUBMISSION"]["@accession"],
    }
    return CreationResults(results=project_results, errors=errors, warnings=warnings)


def post_webin(xml, config: ENAConfig):
    return requests.post(
        config.ena_submission_url,
        auth=HTTPBasicAuth(config.ena_submission_username, config.ena_submission_password),
        files=xml,
        timeout=10,  # wait a full 10 seconds for a response incase slow
    )
