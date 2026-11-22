"""Pure builders for ENA submissions: XML, manifests, flatfiles and author formatting.

Nothing here talks to ENA or the database; files are only written to local (temp) dirs.
"""

import gzip
import logging
import os
import random
import string
import tempfile
import traceback
from collections import defaultdict
from dataclasses import Field, fields, is_dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any, ClassVar, Protocol

import pytz
import xmltodict
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqFeature import FeatureLocation, Reference, SeqFeature
from Bio.SeqRecord import SeqRecord
from unidecode import unidecode

from .config import Config, EnaOrganismDetails, ManifestFieldDetails
from .ena_types import (
    DEFAULT_EMBL_PROPERTY_FIELDS,
    Action,
    Actions,
    AssemblyChromosomeListFile,
    AssemblyManifest,
    Hold,
    MoleculeType,
    ProjectSet,
    RawReadsManifest,
    Submission,
    XmlAttribute,
    XmlNone,
)

if TYPE_CHECKING:
    from .submission_db_helper import SubmissionTableEntry

logger = logging.getLogger(__name__)


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


def get_alias(prefix: str, random_alias=False, set_alias_suffix: str | None = None) -> XmlAttribute:
    """
    The alias uniquely identifies project and sample submissions.
    ENA blocks duplicates, so each submission needs a unique alias.

    Loculus-accession aliases should be unique, but for testing, I add a timestamp
    to allow multiple submissions of the same sample.
    For assembly revisions, the alias must match the original, so I set a suffix for testing.
    """
    if set_alias_suffix:
        return XmlAttribute(f"{prefix}:{set_alias_suffix}")
    if random_alias:
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


def reformat_authors_from_loculus_to_embl_style(authors: str) -> str | None:
    """This function reformats the Loculus authors string to the format expected by ENA
    Loculus format: `Doe, John A.; Roe, Jane Britt C.`
    EMBL expected: `Doe J.A., Roe J.B.C.;`

    EMBL spec: "The names are listed surname first followed by a blank
      followed by initial(s) with stops.
      Occasionally the initials may not be known,
      in which case the surname alone will be listed.
      The author names are separated by commas
      and terminated by a semicolon; they are not split between lines."
    See section "3.4.10.6: The RA Line" here: https://raw.githubusercontent.com/enasequence/read_docs/c4bd306c82710844128cdf43003a0167837dc442/submit/fileprep/flatfile_user_manual.txt

    We also convert hyphenated names to initials, e.g. "Smith, John-Doe" becomes "Smith J.-D."
    """
    authors_list = [author for author in authors.split(";") if author]
    ena_authors = []
    for author in authors_list:
        last_names, first_names = author.split(",")[0].strip(), author.split(",")[1].strip()
        initials = "-".join(
            [
                "".join(name[0] + "." for name in hyphen_name.split() if name)
                for hyphen_name in first_names.split("-")
                if hyphen_name.strip()
            ]
        )
        ena_authors.append(f"{last_names} {initials}".strip())
    ascii_authors = authors_to_ascii(", ".join(ena_authors))
    if not ascii_authors:
        return None
    return ascii_authors + ";"


def get_revision_dict():
    return Submission(actions=Actions(action=[Action(modify="")]))


def get_sample_xml(sample_set, revision: bool = False) -> dict[str, str]:
    submission_set = get_revision_dict() if revision else get_submission_dict()
    return {
        "SUBMISSION": dataclass_to_xml(submission_set, root_name="SUBMISSION"),
        "SAMPLE": dataclass_to_xml(sample_set, root_name="SAMPLE_SET"),
    }


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


def get_authors(authors: str) -> str | None:
    try:
        formatted_authors = reformat_authors_from_loculus_to_embl_style(authors)
        logger.debug("Reformatted authors")
    except Exception as err:
        msg = f"Was unable to format authors as ENA expects: {authors}"
        logger.error(msg)
        raise ValueError(msg) from err
    return formatted_authors


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
    unaligned_nucleotide_sequences: dict[str, str | None],
    dir: str | None,
):
    collection_date = metadata.get(DEFAULT_EMBL_PROPERTY_FIELDS.collection_date_property, "Unknown")
    authors = get_authors(metadata.get(DEFAULT_EMBL_PROPERTY_FIELDS.authors_property) or "")
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
        if authors:
            # BioPython's EMBL writer automatically adds a terminating semicolon,
            # so we need to strip it from our formatted authors string to avoid duplication
            authors = authors.removesuffix(";")
            reference.authors = authors
        sequence = SeqRecord(
            seq=Seq(sequence_str),
            id=f"{accession}_{seq_name}" if multi_segment else accession,
            annotations={
                # Biopython's EMBL writer reads this specific key to fill in the ID line's
                # molecule-type token - it is not an INSDC qualifier (that's "mol_type" below).
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
                "mol_type": str(organism_metadata.molecule_type),
                "organism": organism,
                "geo_loc_name": country,
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
    manifest: AssemblyManifest | RawReadsManifest, is_broker: bool = False, dir: str | None = None
) -> str:
    """
    Creates a temp manifest file:
    https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html#manifest-files
    """
    if isinstance(manifest, AssemblyManifest) and not manifest.fasta and not manifest.flatfile:
        msg = "Either fasta or flatfile must be provided"
        raise ValueError(msg)
    if isinstance(manifest, RawReadsManifest) and not manifest.fastq:
        msg = "Fastq files must be provided"
        raise ValueError(msg)

    if dir:
        os.makedirs(dir, exist_ok=True)
        filename = os.path.join(dir, "manifest.tsv")
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".tsv") as temp:
            filename = temp.name

    with open(filename, "w", encoding="utf-8") as f:
        for field in fields(manifest):
            value = getattr(manifest, field.name)
            if value is None:
                continue
            if isinstance(value, list):
                f.writelines(f"{field.name.upper()}\t{val}\n" for val in value)
                continue
            if field.name in {"authors", "address"} and not is_broker:
                msg = f"Cannot set {field.name} field for non broker"
                logger.error(msg)
                raise ValueError(msg)
            f.write(f"{field.name.upper()}\t{value}\n")

    return filename


def resolve_manifest_field(
    field_details: ManifestFieldDetails, metadata: dict[str, Any]
) -> str | None:
    """Resolve an assembly manifest field's value from Loculus metadata per
    config.assembly_manifest_fields_mapping, falling back to field_details.default if the
    mapped Loculus fields are absent or empty."""
    values = [metadata.get(loculus_field) for loculus_field in field_details.loculus_fields]

    if field_details.function == "reformat_authors":
        value = get_authors(values[0] or "")
    else:
        value = ", ".join(str(v) for v in values if v) or None

    if value is not None:
        return value
    return field_details.default


def resolve_required_manifest_field(
    field_details: ManifestFieldDetails, metadata: dict[str, Any]
) -> str:
    """Like resolve_manifest_field, but for required fields."""
    value = resolve_manifest_field(field_details, metadata)
    if value is None:
        msg = (
            "Manifest field resolved to None despite being required: "
            f"loculus_fields={field_details.loculus_fields}, no default configured."
        )
        raise ValueError(msg)
    return value


def manifest_fields_diff(
    assembly_manifest_fields_mapping: dict[str, ManifestFieldDetails],
    submission_row: "SubmissionTableEntry",
    last_version_entry: "SubmissionTableEntry",
) -> dict[str, str]:
    differing_fields = {}
    for field, mapping in assembly_manifest_fields_mapping.items():
        try:
            last_value = resolve_manifest_field(mapping, last_version_entry.seq_metadata)
            new_value = resolve_manifest_field(mapping, submission_row.seq_metadata)
        except Exception as e:
            logger.error(
                f"Error resolving manifest field {field} for comparison: {e}. "
                f"Traceback: {traceback.format_exc()}"
            )
            differing_fields[field] = f"Error resolving field: {e}"
            continue
        if last_value != new_value:
            differing_fields[field] = f"Last: {last_value}, New: {new_value}, "
    return differing_fields


def linked_accession_diff(
    config: Config,
    submission_row: "SubmissionTableEntry",
    previous_sample_accession: str,
    previous_study_accession: str,
) -> dict[str, str]:
    """If the submitter provided a biosampleAccession/bioprojectAccession (e.g. because reads
    are linked to an already-existing sample/project), check it still matches the accession
    used for the previous version."""
    previous_accessions = {
        config.loculus_accession_fields.biosample: previous_sample_accession,
        config.loculus_accession_fields.bioproject: previous_study_accession,
    }
    differing_fields = {}
    for field, previous_accession in previous_accessions.items():
        new_accession = submission_row.seq_metadata.get(field)
        if new_accession and new_accession != previous_accession:
            differing_fields[field] = f"Last: {previous_accession}, New: {new_accession}"
    return differing_fields
