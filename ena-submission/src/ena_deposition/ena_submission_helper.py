import glob
import gzip
import json
import logging
import os
import random
import re
import string
import subprocess  # noqa: S404
import tempfile
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import Field, asdict, dataclass, is_dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, ClassVar, Final, Literal, Protocol

import pytz
import requests
import xmltodict
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqFeature import FeatureLocation, Reference, SeqFeature
from Bio.SeqRecord import SeqRecord
from bs4 import BeautifulSoup
from psycopg2.pool import SimpleConnectionPool
from requests.auth import HTTPBasicAuth
from tenacity import (
    RetryCallState,
    Retrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_fixed,
)
from unidecode import unidecode

from ena_deposition.config import Config, EnaOrganismDetails

from .ena_types import (
    DEFAULT_EMBL_PROPERTY_FIELDS,
    Action,
    Actions,
    AssemblyChromosomeListFile,
    AssemblyManifest,
    Hold,
    MoleculeType,
    ProjectSet,
    SampleSetType,
    Submission,
    XmlAttribute,
    XmlNone,
)
from .submission_db_helper import (
    AssemblyTableEntry,
    ProjectTableEntry,
    SampleTableEntry,
    Status,
    TableName,
    add_to_assembly_table,
    add_to_project_table,
    add_to_sample_table,
    update_with_retry,
)

logger = logging.getLogger(__name__)


@dataclass
class CreationResult:
    errors: list[str]
    warnings: list[str]
    result: dict[str, str | Sequence[str]] | None = None


def recursive_defaultdict():
    return defaultdict(recursive_defaultdict)


class DataclassProtocol(Protocol):
    __dataclass_fields__: ClassVar[dict[str, Field[Any]]]


def assert_dataclass(obj: Any) -> None:
    """
    Asserts that the object is a dataclass instance.
    Raises TypeError if not.
    """
    if not is_dataclass(obj):
        msg = f"Expected a dataclass instance, got {type(obj).__name__}: {obj}."
        raise TypeError(msg)
    if isinstance(obj, type):
        # It's a dataclass class, not an instance - handle this case
        msg = f"Expected dataclass instance, got dataclass class: {obj}"
        raise TypeError(msg)


def dataclass_to_dict(dataclass_instance: DataclassProtocol) -> dict[str, Any]:
    """
    Converts a dataclass instance to a dictionary, handling nested dataclasses.
    """
    assert_dataclass(dataclass_instance)
    result: dict[str, Any] = {}
    for field_name in dataclass_instance.__dataclass_fields__:
        value = getattr(dataclass_instance, field_name)
        if isinstance(value, XmlNone):
            result[field_name.upper()] = None
            continue
        if value is None:
            continue
        if isinstance(value, list):
            res = []
            for item in value:
                res.append(dataclass_to_dict(item))
            result[field_name.upper()] = res
        elif isinstance(value, XmlAttribute):
            attribute_field = "@" + field_name
            result[attribute_field] = value
        elif isinstance(value, (str, int, float, bool)):
            result[field_name.upper()] = value
        elif is_dataclass(value) and not isinstance(value, type):
            result[field_name.upper()] = dataclass_to_dict(value)
        else:
            msg = (
                f"Unsupported type {type(value)} for field {field_name} in dataclass "
                f"{dataclass_instance.__class__.__name__} with value {value}."
            )
            logger.error(msg)
            raise TypeError(msg)
    return result


def dataclass_to_xml(dataclass_instance: DataclassProtocol, root_name="root") -> str:
    dataclass_dict = dataclass_to_dict(dataclass_instance)
    return xmltodict.unparse({root_name: dataclass_dict}, pretty=True)


def get_submission_dict(hold_until_date: str | None = None) -> Submission:
    if not hold_until_date:
        hold_until_date = datetime.now(tz=pytz.utc).strftime("%Y-%m-%d")
    return Submission(
        actions=Actions(action=[Action(add=""), Action(hold=Hold(XmlAttribute(hold_until_date)))])
    )


def get_project_xml(project_set: ProjectSet) -> dict[str, str]:
    submission_set = get_submission_dict()
    return {
        "SUBMISSION": dataclass_to_xml(submission_set, root_name="SUBMISSION"),
        "PROJECT": dataclass_to_xml(project_set, root_name="PROJECT_SET"),
    }


def get_alias(prefix: str, test=False, set_alias_suffix: str | None = None) -> XmlAttribute:
    """
    The alias uniquely identifies project and sample submissions.
    ENA blocks duplicates, so each submission needs a unique alias.

    Loculus-accession aliases should be unique, but for testing, I add a timestamp
    to allow multiple submissions of the same sample.
    For revisions, the alias must match the original, so I set a suffix for testing.
    """
    if set_alias_suffix:
        return XmlAttribute(f"{prefix}:{set_alias_suffix}")
    if test:
        entropy = "".join(random.choices(string.ascii_letters + string.digits, k=4))  # noqa: S311
        timestamp = datetime.now(tz=pytz.utc).strftime("%Y%m%d_%H%M%S")
        return XmlAttribute(f"{prefix}:{timestamp}_{entropy}")

    return XmlAttribute(prefix)


def authors_to_ascii(authors: str) -> str:
    """
    Converts authors string to ASCII, handling diacritics and non-ASCII characters.
    Raises ValueError if non-Latin characters are encountered.
    """
    authors_list = [author for author in authors.split(";") if author]
    formatted_author_list = []
    for author in authors_list:
        result = []
        for char in author:
            # If character is already ASCII, skip
            ascii_max_order = 128
            if ord(char) < ascii_max_order:
                result.append(char)
            else:
                latin_max_order = 591  # Latin Extended-A and Extended-B
                if not ord(char) <= latin_max_order:
                    error_msg = (
                        f"Unsupported (non-Latin) character encountered: {char} (U+{ord(char):04X})"
                    )
                    logger.error(error_msg)
                    raise ValueError(error_msg)
                result.append(unidecode(char))
        formatted_author_list.append("".join(result))
    return "; ".join(formatted_author_list)


def reformat_authors_from_loculus_to_embl_style(authors: str) -> str:
    """This function reformats the Loculus authors string to the format expected by ENA
    Loculus format: `Doe, John A.; Roe, Jane Britt C.`
    EMBL expected: `Doe J.A., Roe J.B.C.;`

    EMBL spec: "The names are listed surname first followed by a blank
      followed by initial(s) with stops.
      Occasionally the initials may not be known,
      in which case the surname alone will be listed.
      The author names are separated by commas
      and terminated by a semicolon; they are not split between lines."
    See section "3.4.10.6: The RA Line" here: https://raw.githubusercontent.com/enasequence/read_docs/c4bd306c82710844128cdf43003a0167837dc442/submit/fileprep/flatfile_user_manual.txt"""
    authors_list = [author for author in authors.split(";") if author]
    ena_authors = []
    for author in authors_list:
        last_names, first_names = author.split(",")[0].strip(), author.split(",")[1].strip()
        initials = "".join([name[0] + "." for name in first_names.split() if name])
        ena_authors.append(f"{last_names} {initials}".strip())
    return authors_to_ascii(", ".join(ena_authors)) + ";"


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
        "bioproject_accession": parsed_response["RECEIPT"]["PROJECT"]["@accession"],
        "ena_submission_accession": parsed_response["RECEIPT"]["SUBMISSION"]["@accession"],
    }
    return CreationResult(result=project_results, errors=errors, warnings=warnings)


def get_revision_dict():
    return Submission(actions=Actions(action=[Action(modify="")]))


def get_sample_xml(sample_set, revision: bool = False) -> dict[str, str]:
    submission_set = get_revision_dict() if revision else get_submission_dict()
    return {
        "SUBMISSION": dataclass_to_xml(submission_set, root_name="SUBMISSION"),
        "SAMPLE": dataclass_to_xml(sample_set, root_name="SAMPLE_SET"),
    }


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
        "biosample_accession": parsed_response["RECEIPT"]["SAMPLE"]["EXT_ID"]["@accession"],
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


def create_chromosome_list(list_object: AssemblyChromosomeListFile, dir: str | None = None) -> str:
    """
    Creates a temp file chromosome list:
    https://ena-docs.readthedocs.io/en/latest/submit/fileprep/assembly.html#chromosome-list-file
    """
    if dir:
        os.makedirs(dir, exist_ok=True)
        filename = os.path.join(dir, "chromosome_list.gz")
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".gz") as temp:
            filename = temp.name

    with gzip.GzipFile(filename, "wb") as gz:
        for entry in list_object.chromosomes:
            gz.write(
                f"{entry.object_name}\t{entry.chromosome_name}\t{entry.topology!s}-{entry.chromosome_type!s}\n".encode()
            )

    return filename


def get_description(config: Config, metadata: dict[str, str]) -> str:
    return (
        f"Original sequence submitted to {config.db_name} with accession: "
        f"{metadata['accession']}, version: {metadata['version']}"
    )


def get_authors(authors: str) -> str:
    try:
        authors = reformat_authors_from_loculus_to_embl_style(authors)
        logger.debug("Reformatted authors")
    except Exception as err:
        msg = f"Was unable to format authors: {authors} as ENA expects"
        logger.error(msg)
        raise ValueError(msg) from err
    return authors


def get_country(metadata: dict[str, str]) -> str:
    country = metadata.get(DEFAULT_EMBL_PROPERTY_FIELDS.country_property, "Unknown")
    admin = ", ".join(
        filter(None, map(metadata.get, DEFAULT_EMBL_PROPERTY_FIELDS.admin_level_properties))
    )
    return f"{country}: {admin}" if admin else country


def create_flatfile(
    config: Config,
    metadata: dict[str, Any],
    organism_metadata: EnaOrganismDetails,
    unaligned_nucleotide_sequences: dict[str, str],
    dir: str | None,
):
    collection_date = metadata.get(DEFAULT_EMBL_PROPERTY_FIELDS.collection_date_property, "Unknown")
    authors = get_authors(metadata.get(DEFAULT_EMBL_PROPERTY_FIELDS.authors_property) or "")
    # BioPython's EMBL writer automatically adds a terminating semicolon,
    # so we need to strip it from our formatted authors string to avoid duplication
    authors = authors.removesuffix(";")
    country = get_country(metadata)
    organism = organism_metadata.scientific_name
    accession = metadata["accession"]
    description = get_description(config, metadata)

    if dir:
        os.makedirs(dir, exist_ok=True)
        filename = os.path.join(dir, "sequences.embl")
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".embl") as temp:
            filename = temp.name

    seq_io_moleculetype = {
        MoleculeType.GENOMIC_DNA: "DNA",
        MoleculeType.GENOMIC_RNA: "RNA",
        MoleculeType.VIRAL_CRNA: "cRNA",
    }

    embl_content = []

    multi_segment = organism_metadata.is_multi_segment()

    for seq_name, sequence_str in unaligned_nucleotide_sequences.items():
        if not isinstance(sequence_str, str) or len(sequence_str) == 0:
            continue
        reference = Reference()
        reference.authors = authors
        sequence = SeqRecord(
            seq=Seq(sequence_str),
            id=f"{accession}_{seq_name}" if multi_segment else accession,
            annotations={
                "molecule_type": seq_io_moleculetype[organism_metadata.molecule_type],
                "organism": organism,
                "topology": organism_metadata.topology,
                "references": [reference],  # type: ignore
            },
            description=description,
        )

        source_feature = SeqFeature(
            FeatureLocation(start=0, end=len(sequence_str)),
            type="source",
            qualifiers={
                "molecule_type": str(organism_metadata.molecule_type),
                "organism": organism,
                "country": country,
                "collection_date": collection_date,
            },
        )
        sequence.features.append(source_feature)

        # This is really convoluted, will be fixed by using improvements
        # from annotations PR in the future
        with tempfile.NamedTemporaryFile(delete=False, suffix=".embl") as temp_seq_file:
            SeqIO.write(sequence, temp_seq_file.name, "embl")

        with open(temp_seq_file.name, encoding="utf-8") as temp_seq_file:  # type: ignore
            embl_content.append(temp_seq_file.read())

    final_content = "\n".join(embl_content)  # type: ignore

    gzip_filename = filename + ".gz"

    with gzip.open(gzip_filename, "wt", encoding="utf-8") as file:
        file.write(final_content)

    return gzip_filename


def create_manifest(
    manifest: AssemblyManifest, is_broker: bool = False, dir: str | None = None
) -> str:
    """
    Creates a temp manifest file:
    https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html#manifest-files
    """
    if dir:
        os.makedirs(dir, exist_ok=True)
        filename = os.path.join(dir, "manifest.tsv")
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".tsv") as temp:
            filename = temp.name
    if not manifest.fasta and not manifest.flatfile:
        msg = "Either fasta or flatfile must be provided"
        raise ValueError(msg)
    with open(filename, "w", encoding="utf-8") as f:
        f.write(f"STUDY\t{manifest.study}\n")
        f.write(f"SAMPLE\t{manifest.sample}\n")
        f.write(
            f"ASSEMBLYNAME\t{manifest.assemblyname}\n"
        )  # This is the alias that needs to be unique
        f.write(f"ASSEMBLY_TYPE\t{manifest.assembly_type!s}\n")
        f.write(f"COVERAGE\t{manifest.coverage}\n")
        f.write(f"PROGRAM\t{manifest.program}\n")
        f.write(f"PLATFORM\t{manifest.platform}\n")
        if manifest.flatfile:
            f.write(f"FLATFILE\t{manifest.flatfile}\n")
        if manifest.fasta:
            f.write(f"FASTA\t{manifest.fasta}\n")
        f.write(f"CHROMOSOME_LIST\t{manifest.chromosome_list}\n")
        if manifest.description:
            f.write(f"DESCRIPTION\t{manifest.description}\n")
        if manifest.moleculetype:
            f.write(f"MOLECULETYPE\t{manifest.moleculetype!s}\n")
        if manifest.run_ref:
            f.write(f"RUN_REF\t{manifest.run_ref}\n")
        if manifest.authors:
            if not is_broker:
                logger.error("Cannot set authors field for non broker")
                msg = "Cannot set authors field for non broker"
                raise ValueError(msg)
            f.write(f"AUTHORS\t{manifest.authors}\n")
        if manifest.address:
            if not is_broker:
                logger.error("Cannot set address field for non broker")
                msg = "Cannot set address field for non broker"
                raise ValueError(msg)
            f.write(f"ADDRESS\t{manifest.address}\n")

    return filename


def post_webin_cli(
    config: Config,
    manifest_filename,
    tmpdir: tempfile.TemporaryDirectory,
    center_name=None,
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
        "-context=genome",
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
    )


def create_ena_assembly(config: Config, manifest_filename: str, center_name=None) -> CreationResult:
    """
    This is equivalent to running:
    ena-webin-cli -username {params.ena_submission_username} \\
        -password {params.ena_submission_password} -context genome \\
        -manifest {manifest_file} -submit
    config.test=True, adds the `-test` flag which means submissions will use the ENA dev endpoint.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # create a tmp dir for output files
    # use normal python stuff for that

    output_tmpdir = tempfile.TemporaryDirectory()

    response = post_webin_cli(
        config, manifest_filename, tmpdir=output_tmpdir, center_name=center_name
    )

    # Happy path: webin-cli succeeded and returned ERZ accession
    if response.returncode == 0:
        for line in response.stdout.splitlines():
            if "The following analysis accession was assigned to the submission:" in line:
                match = re.search(r"ERZ\d+", line)
                if match:
                    erz_accession = match.group(0)
                    logger.info(f"Webin CLI succeeded and returned ERZ accession: {erz_accession}")
                    return CreationResult(
                        result={"erz_accession": erz_accession},
                        errors=errors,
                        warnings=warnings,
                    )

    # Handle the case where the webin-cli command fails or does not return ERZ accession
    if response.returncode != 0:
        error_message = f"Webin CLI command failed with status: {response.returncode}. "
    else:
        error_message = "Webin CLI command succeeded but did not return ERZ accession. "
    error_message += f"Stdout: {response.stdout}, Stderr: {response.stderr}"
    logger.error(error_message)
    errors.append(error_message)

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
    return CreationResult(errors=errors, warnings=warnings)


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
    try:
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
                        "gca_accession": gca_accession,
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
    try:
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
                "insdc_accession": accession,
                "insdc_accession_full": f"{accession}.1",
            }
        results = {}
        for i, segment in enumerate(segment_order):
            accession = f"{start_letters}{(start_num + i):0{num_digits}d}"
            results[f"insdc_accession_{segment}"] = accession
            results[f"insdc_accession_full_{segment}"] = f"{accession}.1"
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


def set_accession_does_not_exist_error(
    conditions: dict[str, str | dict[str, str]],
    accession: str,
    accession_type: Literal["BIOPROJECT"] | Literal["BIOSAMPLE"] | Literal["RUN_REF"],
    db_pool: SimpleConnectionPool,
):
    error_text = f"Accession {accession} of type {accession_type} does not exist in ENA."
    logger.error(error_text)

    succeeded: bool | int | None
    match accession_type:
        case "BIOSAMPLE":
            sample_table_entry = SampleTableEntry(
                **conditions,  # type: ignore
                status=Status.HAS_ERRORS,
                errors=[error_text],
                result={"ena_sample_accession": accession, "biosample_accession": accession},
            )
            succeeded = add_to_sample_table(db_pool, sample_table_entry)
        case "BIOPROJECT":
            project_table_entry = ProjectTableEntry(
                **conditions,  # type: ignore
                status=Status.HAS_ERRORS,
                errors=[error_text],
                result={"bioproject_accession": accession},
            )
            succeeded = add_to_project_table(db_pool, project_table_entry)
        case "RUN_REF":
            assembly_table_entry = AssemblyTableEntry(
                **conditions,  # type: ignore
                status=Status.HAS_ERRORS,
                errors=[error_text],
                result={},  # type: ignore
            )
            succeeded = add_to_assembly_table(db_pool, assembly_table_entry)

    if not succeeded:
        logger.warning(f"{accession_type} creation failed and DB update failed.")


def trigger_retry_if_exists(
    entries_with_errors: Iterable[Mapping[str, Any]],
    db_config: SimpleConnectionPool,
    table_name: TableName,
    retry_threshold_min: int,
    error_substring: str = "does not exist in ENA",
    last_retry: datetime | None = None,
) -> datetime | None:
    if (
        last_retry
        and datetime.now(tz=pytz.utc) - timedelta(minutes=retry_threshold_min) < last_retry
    ):
        return last_retry
    for entry in entries_with_errors:
        if error_substring not in str(entry.get("errors", "")):
            continue
        match table_name:
            case TableName.PROJECT_TABLE:
                primary_key = ProjectTableEntry(**entry).primary_key
            case TableName.SAMPLE_TABLE:
                primary_key = SampleTableEntry(**entry).primary_key
            case TableName.ASSEMBLY_TABLE:
                primary_key = AssemblyTableEntry(**entry).primary_key
            case _:
                logger.error(f"Unknown table name: {table_name}")
                continue

        logger.info(
            f"Retrying submission {primary_key} in {table_name} with error: '{entry.get('errors')}'"
        )

        update_values = {
            "status": Status.READY,
            "errors": None,
            "finished_at": None,
            "result": None,
        }
        try:
            update_with_retry(
                db_config=db_config,
                conditions=asdict(primary_key),
                update_values=update_values,
                table_name=table_name,
            )
            last_retry = datetime.now(tz=pytz.utc)
        except Exception as e:
            logger.error(f"Failed to update {table_name} entry for retry: {e!s}")
    return last_retry
