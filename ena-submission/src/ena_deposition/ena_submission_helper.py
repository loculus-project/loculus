import datetime
import glob
import gzip
import json
import logging
import os
import re
import subprocess  # noqa: S404
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Literal

import pytz
import requests
import xmltodict
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqFeature import CompoundLocation, FeatureLocation, Reference, SeqFeature
from Bio.SeqRecord import SeqRecord
from psycopg2.pool import SimpleConnectionPool
from requests.auth import HTTPBasicAuth

from ena_deposition.config import Config

from .ena_types import (
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
    ProjectTableEntry,
    SampleTableEntry,
    Status,
    add_to_project_table,
    add_to_sample_table,
)

logger = logging.getLogger(__name__)


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
class CreationResult:
    errors: list[str]
    warnings: list[str]
    result: dict[str, str] | None = None


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
        if isinstance(value, XmlNone):
            result[field.upper()] = None
            continue
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


def get_submission_dict(hold_until_date: str | None = None):
    if not hold_until_date:
        hold_until_date = datetime.datetime.now(tz=pytz.utc).strftime("%Y-%m-%d")
    return Submission(
        actions=Actions(action=[Action(add=""), Action(hold=Hold(XmlAttribute(hold_until_date)))])
    )


def get_project_xml(project_set):
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
        return XmlAttribute(f"{prefix}:{datetime.datetime.now(tz=pytz.utc)}")

    return XmlAttribute(prefix)


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
    return ", ".join(ena_authors) + ";"


def create_ena_project(config: ENAConfig, project_set: ProjectSet) -> CreationResult:
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

    try:
        xml = get_project_xml(project_set)
        response = post_webin(config, xml)
    except requests.exceptions.RequestException as e:
        error_message = f"Request failed with exception: {e}."
        logger.error(error_message)
        errors.append(error_message)
        return CreationResult(results=None, errors=errors, warnings=warnings)

    if not response.ok:
        error_message = (
            f"Request failed with status:{response.status_code}. Response: {response.text}."
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(result=None, errors=errors, warnings=warnings)
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
        return CreationResult(result=None, errors=errors, warnings=warnings)
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
    config: ENAConfig, sample_set: SampleSetType, revision: bool = False
) -> CreationResult:
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

    try:
        xml = get_sample_xml(sample_set, revision=revision)
        response = post_webin(config, xml)
    except requests.exceptions.RequestException as e:
        error_message = f"Request failed with exception: {e}."
        logger.error(error_message)
        errors.append(error_message)
        return CreationResult(results=None, errors=errors, warnings=warnings)

    if not response.ok:
        error_message = (
            f"Request failed with status:{response.status_code}. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(result=None, errors=errors, warnings=warnings)
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
            raise requests.exceptions.RequestException
    except:
        error_message = (
            f"Response is in unexpected format. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(result=None, errors=errors, warnings=warnings)
    sample_results = {
        "ena_sample_accession": parsed_response["RECEIPT"]["SAMPLE"]["@accession"],
        "biosample_accession": parsed_response["RECEIPT"]["SAMPLE"]["EXT_ID"]["@accession"],
        "ena_submission_accession": parsed_response["RECEIPT"]["SUBMISSION"]["@accession"],
    }
    return CreationResult(result=sample_results, errors=errors, warnings=warnings)


def post_webin(config: ENAConfig, xml: dict[str, Any]) -> requests.Response:
    return requests.post(
        config.ena_submission_url,
        auth=HTTPBasicAuth(config.ena_submission_username, config.ena_submission_password),
        files=xml,
        timeout=10,  # wait a full 10 seconds for a response in case slow
    )


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


def get_molecule_type(organism_metadata: dict[str, str]) -> MoleculeType:
    try:
        moleculetype = MoleculeType(organism_metadata.get("molecule_type"))
    except ValueError as err:
        msg = f"Invalid molecule type: {organism_metadata.get('molecule_type')}"
        logger.error(msg)
        raise ValueError(msg) from err
    return moleculetype


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
    country = metadata.get("geoLocCountry", "Unknown")
    admin_levels = ["geoLocAdmin1", "geoLocAdmin2"]
    admin = ", ".join([metadata.get(level) for level in admin_levels if metadata.get(level)])
    return f"{country}: {admin}" if admin else country


def get_seq_features(annotation_object: dict[str, Any], sequence_str: str) -> list[SeqFeature]:
    feature_list = []
    for gene in annotation_object.get("genes", []):
        gene_range = gene.get("range")
        attributes = gene.get("attributes", {})
        # TODO: add this to the config
        attribute_map = {
            "gene": "gene",
            "product": "product",
            "Dbxref": "db_xref",
            "Note": "note",
            "protein_id": "protein_id",
        }
        qualifiers = {
            new_key: attributes[old_key]
            for old_key, new_key in attribute_map.items()
            if old_key in attributes
        }
        qualifiers["translation"] = str(
            Seq(sequence_str[(gene_range["begin"]) : gene_range["end"]]).translate()
        )
        feature = SeqFeature(
            FeatureLocation(start=gene_range["begin"], end=gene_range["end"]),
            type=gene.get("gffFeatureType", "gene"),
            qualifiers=qualifiers,
        )
        feature_list.append(feature)
        for cds in gene.get("cdses", []):
            segments = cds.get("segments", [])
            ranges = [segment.get("range") for segment in segments]
            attributes_cds = cds.get("attributes", {})
            strands = [-1 if segment.get("strand") == "-" else +1 for segment in segments]
            locations = [
                FeatureLocation(start=r["begin"], end=r["end"], strand=s)
                for r, s in zip(ranges, strands, strict=False)
            ]
            compound_location = locations[0] if len(locations) == 1 else CompoundLocation(locations)
            qualifiers = {
                new_key: attributes_cds[old_key]
                for old_key, new_key in attribute_map.items()
                if old_key in attributes_cds
            }
            qualifiers["codon_start"] = cds.get("frame", 1)
            qualifiers["translation"] = "".join([str(Seq(
                    sequence_str[
                        (range["begin"]) : (
                            range["end"]
                        )
                    ]
                ).translate()) for range in ranges])
            feature = SeqFeature(
                location=compound_location,
                type=cds.get("gffFeatureType", "CDS"),
                qualifiers=qualifiers,
            )
            feature_list.append(feature)
    return feature_list


def create_flatfile(
    config: Config,
    metadata,
    organism_metadata,
    unaligned_nucleotide_sequences,
    dir,
    annotation_object: dict[str, Any] | None = None,
):
    collection_date = metadata.get("sampleCollectionDate", "Unknown")
    country = get_country(metadata)
    organism = organism_metadata.get("scientific_name", "Unknown")
    accession = metadata["accession"]
    description = get_description(config, metadata)
    authors = get_authors(metadata.get("authors", ""))
    moleculetype = get_molecule_type(organism_metadata)

    if dir:
        os.makedirs(dir, exist_ok=True)
        filename = os.path.join(dir, "sequences.embl")
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".embl") as temp:
            filename = temp.name

    seqIO_moleculetype = {
        MoleculeType.GENOMIC_DNA: "DNA",
        MoleculeType.GENOMIC_RNA: "RNA",
        MoleculeType.VIRAL_CRNA: "cRNA",
    }

    embl_content = []

    multi_segment = set(unaligned_nucleotide_sequences.keys()) != {"main"}

    for seq_name, sequence_str in unaligned_nucleotide_sequences.items():
        if not sequence_str:
            continue
        reference = Reference()
        reference.authors = authors
        sequence = SeqRecord(
            Seq(sequence_str),
            id=f"{accession}_{seq_name}" if multi_segment else accession,
            annotations={
                "molecule_type": seqIO_moleculetype[moleculetype],
                "organism": organism,
                "topology": organism_metadata.get("topology", "linear"),
                "references": [reference],
            },
            description=description,
        )

        source_feature = SeqFeature(
            FeatureLocation(start=0, end=len(sequence.seq)),
            type="source",
            qualifiers={
                "molecule_type": str(moleculetype),
                "organism": organism,
                "country": country,
                "collection_date": collection_date,
            },
        )
        sequence.features.append(source_feature)
        if annotation_object.get(seq_name, None):
            seq_feature_list = get_seq_features(annotation_object[seq_name], sequence_str)
            for feature in seq_feature_list:
                sequence.features.append(feature)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".embl") as temp_seq_file:
            SeqIO.write(sequence, temp_seq_file.name, "embl")

        with open(temp_seq_file.name, encoding="utf-8") as temp_seq_file:
            embl_content.append(temp_seq_file.read())

    final_content = "\n".join(embl_content)

    gzip_filename = filename + ".gz"

    with gzip.open(gzip_filename, "wt", encoding="utf-8") as file:
        file.write(final_content)

    return gzip_filename


def create_fasta(
    unaligned_sequences: dict[str, str],
    chromosome_list: AssemblyChromosomeListFile,
    dir: str | None = None,
) -> str:
    """
    Creates a temp fasta file:
    https://ena-docs.readthedocs.io/en/latest/submit/fileprep/assembly.html#fasta-file
    """
    if dir:
        os.makedirs(dir, exist_ok=True)
        filename = os.path.join(dir, "fasta.gz")
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".fasta.gz") as temp:
            filename = temp.name

    multi_segment = set(unaligned_sequences.keys()) != {"main"}

    with gzip.GzipFile(filename, "wb") as gz:
        if not multi_segment:
            entry = chromosome_list.chromosomes[0]
            gz.write(f">{entry.object_name}\n".encode())
            gz.write(f"{unaligned_sequences['main']}\n".encode())
        else:
            for entry in chromosome_list.chromosomes:
                gz.write(f">{entry.object_name}\n".encode())
                gz.write(f"{unaligned_sequences[entry.chromosome_name]}\n".encode())

    return filename


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
        raise ValueError("Either fasta or flatfile must be provided")
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
                logger.warning("Cannot set authors field for non broker")
            else:
                f.write(f"AUTHORS\t{manifest.authors}\n")
        if manifest.address:
            if not is_broker:
                logger.error("Cannot set address field for non broker")
            else:
                f.write(f"ADDRESS\t{manifest.address}\n")

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
    config: ENAConfig, manifest_filename: str, accession: str = "", center_name=None, test=True
) -> CreationResult:
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
        logger.error(error_message)
        validate_log_path = f"/tmp/genome/{accession}*/**/*"
        matching_files = [
            f for f in glob.glob(validate_log_path, recursive=True) if os.path.isfile(f)
        ]

        if not matching_files:
            logger.error(f"No files found in {validate_log_path}.")
        else:
            for file_path in matching_files:
                logger.info(f"Matching file found: {file_path}")
                try:
                    with open(file_path, "r") as file:
                        contents = file.read()
                        logger.info(f"Contents of the file:\n{contents}")
                except Exception as e:
                    logger.error(f"Error reading file {file_path}: {e}")
        errors.append(error_message)
        return CreationResult(result=None, errors=errors, warnings=warnings)

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
        return CreationResult(result=None, errors=errors, warnings=warnings)
    assembly_results = {
        "erz_accession": erz_accession,
    }
    return CreationResult(result=assembly_results, errors=errors, warnings=warnings)


def get_ena_analysis_process(
    config: ENAConfig, erz_accession: str, segment_order: list[str]
) -> CreationResult:
    """
    Weird name "process" instead of "processing_result" is to match the ENA API.
    This is equivalent to running:
    curl -X 'GET' \
    '{config.ena_reports_service_url}/analysis-process/{erz_accession}?format=json&max-results=100' \
    -H 'accept: */*' \
    -H 'Authorization: Basic KEY'
    """
    url = f"{config.ena_reports_service_url}/analysis-process/{erz_accession}?format=json&max-results=100"

    errors = []
    warnings = []
    assembly_results = {"segment_order": segment_order, "erz_accession": erz_accession}
    try:
        response = requests.get(
            url,
            auth=HTTPBasicAuth(config.ena_submission_username, config.ena_submission_password),
            timeout=10,  # wait a full 10 seconds for a response in case slow
        )
    except requests.exceptions.RequestException as e:
        error_message = f"Request failed with exception: {e}."
        logger.error(error_message)
        errors.append(error_message)
        return CreationResult(results=None, errors=errors, warnings=warnings)
    if not response.ok:
        error_message = (
            f"ENA check failed with status:{response.status_code}. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(result=None, errors=errors, warnings=warnings)
    if response.text == "[]":
        # For some minutes the response will be empty, requests to
        # f"{config.ena_reports_service_url}/analysis-files/{erz_accession}?format=json"
        # should still succeed
        return CreationResult(result=None, errors=errors, warnings=warnings)
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
                    insdc_accession_range, segment_order
                )
                assembly_results.update(chromosome_accessions_dict)
        else:
            return CreationResult(result=None, errors=errors, warnings=warnings)
    except:
        error_message = (
            f"ENA Check returned errors or is in unexpected format. "
            f"Request: {response.request}, Response: {response.text}"
        )
        logger.warning(error_message)
        errors.append(error_message)
        return CreationResult(result=None, errors=errors, warnings=warnings)
    return CreationResult(result=assembly_results, errors=errors, warnings=warnings)


# TODO: Also pass the full segment list from config so we can handle someone submitting
# a multi-segmented virus that has a main segment. This will require having one pipeline
# per organism, not one pipeline for all. Wider changes, thus.
def get_chromsome_accessions(
    insdc_accession_range: str, segment_order: list[str]
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
            raise ValueError("Prefixes in the accession range do not match")

        num_digits = len(start) - 2
        start_num = int(start[2:])
        end_num = int(end[2:])

        if end_num - start_num != len(segment_order) - 1:
            logger.error(
                "Unexpected response format: chromosome does not have expected number of segments"
            )
            raise ValueError("Unexpected number of segments")

        match segment_order:
            case ["main"]:
                accession = f"{start_letters}{start_num:0{num_digits}d}"
                return {
                    "insdc_accession": accession,
                    "insdc_accession_full": f"{accession}.1",
                }
            case _:
                results = {}
                for i, segment in enumerate(segment_order):
                    accession = f"{start_letters}{(start_num + i):0{num_digits}d}"
                    results[f"insdc_accession_{segment}"] = accession
                    results[f"insdc_accession_full_{segment}"] = f"{accession}.1"
                return results

    except Exception as e:
        logger.error(f"Error processing chromosome accessions: {str(e)}")
        raise ValueError("Failed to process chromosome accessions") from e


def set_error_if_accession_not_exists(
    conditions: dict[str, str],
    accession: str,
    accession_type: Literal["BIOPROJECT"] | Literal["BIOSAMPLE"],
    db_pool: SimpleConnectionPool,
) -> bool:
    """Make request to ENA to check if an accession exists"""
    url = f"https://www.ebi.ac.uk/ena/browser/api/summary/{accession}"
    response = requests.get(url, timeout=10)
    try:
        exists = int(response.json()["total"]) > 0
        if exists:
            return True
    except Exception as e:
        logger.error(f"Error checking if accession exists: {e!s}")

    error_text = f"Accession {accession} of type {accession_type} does not exist in ENA."
    logger.error(error_text)

    conditions.update({"status": Status.HAS_ERRORS, "errors": json.dumps([error_text])})

    if accession_type == "BIOSAMPLE":
        conditions.update(
            {"result": {"ena_sample_accession": accession, "biosample_accession": accession}}
        )
        sample_table_entry = SampleTableEntry(**conditions)
        succeeded = add_to_sample_table(db_pool, sample_table_entry)
    else:
        conditions.update({"result": {"bioproject_accession": accession}})
        project_table_entry = ProjectTableEntry(**conditions)
        succeeded = add_to_project_table(db_pool, project_table_entry)

    if not succeeded:
        logger.warning(f"{accession_type} creation failed and DB update failed.")
    return False
