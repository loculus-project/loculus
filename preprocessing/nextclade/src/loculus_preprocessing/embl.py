import logging
from dataclasses import dataclass, field
from typing import Any

from Bio.Seq import Seq
from Bio.SeqFeature import CompoundLocation, FeatureLocation, Reference, SeqFeature
from Bio.SeqRecord import SeqRecord
from unidecode import unidecode

from loculus_preprocessing.datatypes import ProcessedMetadata, SubmissionData

from .config import Config

logger = logging.getLogger(__name__)


def get_country(metadata: ProcessedMetadata, config: Config) -> str:
    country: str = str(metadata.get(config.embl.country_property, "Unknown"))
    admin_levels = config.embl.admin_level_properties
    admin: str = ", ".join([metadata.get(level) for level in admin_levels if metadata.get(level)])  # type: ignore
    return f"{country}: {admin}" if admin else country


def get_description(
    accession: str,
    version: int,
    db_name: str,
    metadata: ProcessedMetadata,
    segment: str | None,
) -> str:
    description = f"{db_name} accession: {accession}.{version}, "
    if segment:
        insdc_accession = metadata.get(f"insdcAccessionFull_{segment}")
    else:
        insdc_accession = metadata.get("insdcAccessionFull")
    if insdc_accession:
        description += f"INSDC accession: {insdc_accession}, "
    if metadata.get("gisaidIsolateId"):
        gisaid_accession = metadata.get("gisaidIsolateId")
        description += f"GISAID accession: {gisaid_accession}, "
    return description.strip(", ")


def reformat_authors_from_loculus_to_embl_style(authors: str) -> str:
    """This function reformats the Loculus authors string to the ascii-format expected by ENA
    Loculus format: `Doe, John A.; Roe, Jane Britt C.`
    EMBL expected: `Doe J.A., Roe J.B.C.;`

    See section "3.4.10.6: The RA Line" here: https://raw.githubusercontent.com/enasequence/read_docs/c4bd306c82710844128cdf43003a0167837dc442/submit/fileprep/flatfile_user_manual.txt
    Note if the initials are not known the surname alone will be listed.

    This function does not add a semicolon as the Bio package adds a semicolon when creating
    a SeqRecord."""
    authors_list = [author for author in authors.split(";") if author]
    ena_authors = []
    for author in authors_list:
        last_names, first_names = author.split(",")[0].strip(), author.split(",")[1].strip()
        initials = "".join([name[0] + "." for name in first_names.split() if name])
        ena_authors.append(f"{last_names} {initials}".strip())
    return authors_to_ascii(", ".join(ena_authors))


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


def get_authors(authors: str) -> str:
    try:
        return reformat_authors_from_loculus_to_embl_style(authors)
    except Exception as err:
        msg = f"Was unable to format authors: {authors} as ENA expects"
        raise ValueError(msg) from err


@dataclass(frozen=True)
class EmblAnnotations:
    cds_qualifiers: list[str] = field(default_factory=list)
    gene_qualifiers: list[str] = field(default_factory=list)


# EMBL allowed qualifiers constant
EMBL_ANNOTATIONS = EmblAnnotations(
    cds_qualifiers=[
        "allele",
        "artificial_location",
        "circular_RNA",
        "codon_start",
        # "db_xref",  # protein accession of reference
        "EC_number",
        "exception",
        "experiment",
        "function",
        "gene",
        "gene_synonym",
        "inference",
        # "locus_tag",  # must be pre-registered with ENA
        # "old_locus_tag",
        "map",
        "note",
        "number",
        "operon",
        "product",
        "protein_id",
        "pseudo",
        "pseudogene",
        "ribosomal_slippage",
        "standard_name",
        "trans_splicing",
        "transl_except",
        "transl_table",
        "translation",
    ],
    gene_qualifiers=[
        "allele",
        # "db_xref",
        "experiment",
        "function",
        "gene",
        "gene_synonym",
        "inference",
        # "locus_tag",
        # "old_locus_tag",
        "map",
        "note",
        "operon",
        "product",
        "pseudo",
        "pseudogene",
        "standard_name",
        "trans_splicing",
    ],
)


# Map from nextclade attribute names to EMBL attribute names
NEXTCLADE_TO_EMBL_ATTRIBUTES = {
    # "Dbxref": "db_xref", - # protein accession of reference
    "Note": "note",
    "phase": "codon_start",
}


def _build_qualifiers(attributes: dict[str, Any], allowed_qualifiers: list[str]) -> dict[str, Any]:
    """Filters `attributes` down to the qualifiers EMBL allows, renaming any that have a
    different name in EMBL (e.g. nextclade's `phase` becomes EMBL's `codon_start`)."""
    attributes_map = {qualifier: qualifier for qualifier in allowed_qualifiers}
    attributes_map.update(NEXTCLADE_TO_EMBL_ATTRIBUTES)
    qualifiers = {
        new_key: attributes[old_key]
        for old_key, new_key in attributes_map.items()
        if old_key in attributes
    }
    if "codon_start" in qualifiers and "phase" not in attributes:
        # A raw codon_start not derived from nextclade's phase has unknown indexing (EMBL's
        # codon_start is 1-indexed, phase is 0-indexed) - drop it.
        del qualifiers["codon_start"]
    return qualifiers


def _build_gene_feature(gene: dict[str, Any]) -> SeqFeature:
    gene_range = gene.get("range")
    if not gene_range or "begin" not in gene_range or "end" not in gene_range:
        msg = f"Gene range is missing or incomplete: {gene_range}"
        raise ValueError(msg)
    qualifiers = _build_qualifiers(gene.get("attributes", {}), EMBL_ANNOTATIONS.gene_qualifiers)
    # In FeatureLocation start and end are zero based, exclusive end.
    # thus an embl entry of 123..150 (one based counting) becomes a location of [122:150]
    return SeqFeature(
        FeatureLocation(start=gene_range["begin"], end=gene_range["end"]),
        type="gene",
        qualifiers=qualifiers,
    )


def _cds_location(segments: list[dict[str, Any]]) -> FeatureLocation | CompoundLocation:
    strands = [-1 if segment.get("strand") == "-" else +1 for segment in segments]
    locations = [
        FeatureLocation(start=segment["range"]["begin"], end=segment["range"]["end"], strand=strand)
        for segment, strand in zip(segments, strands, strict=False)
    ]
    return locations[0] if len(locations) == 1 else CompoundLocation(locations)


def _translate_cds(sequence_str: str, location: FeatureLocation | CompoundLocation) -> str:
    # location.extract reverse-complements minus-strand (sub-)locations before concatenating,
    # so this is correct for both single- and multi-segment, plus- and minus-strand CDSes.
    translation = str(location.extract(Seq(sequence_str)).translate())
    # The INSDC /translation qualifier excludes the terminal stop codon.
    return translation.removesuffix("*")


def _build_cds_feature(cds: dict[str, Any], sequence_str: str) -> SeqFeature:
    segments = cds.get("segments", [])
    location = _cds_location(segments)
    qualifiers = _build_qualifiers(cds.get("attributes", {}), EMBL_ANNOTATIONS.cds_qualifiers)
    # codon_start and phase define the offset at which the first complete codon of a coding
    # feature can be found, relative to the first base of that feature.
    # Phase is 0-indexed, codon_start is 1 indexed
    qualifiers["codon_start"] = qualifiers.get("codon_start", 0) + 1
    qualifiers["translation"] = _translate_cds(sequence_str, location)
    return SeqFeature(
        location=location,
        type="CDS",
        qualifiers=qualifiers,
    )


def get_seq_features(annotation_object: dict[str, Any], sequence_str: str) -> list[SeqFeature]:
    """
    Takes a dictionary object with the following structure:
    {
        "genes": [
            {
            "range": {"begin": ..., "end": ...},
            "attributes": {"gene": ..., ...},
            "cdses": [
                {"segments": [{"range": {"begin": 1, "end": 10}, "strand": "+", "frame": ...}],
                "attributes": {"gene": ..., ...},
                "gffFeatureType": ...,
                },...]
        },..]
    }
    Creates a list of gene and CDS SeqFeature using:
    - https://www.ebi.ac.uk/ena/WebFeat/
    - https://www.insdc.org/submitting-standards/feature-table/
    Converts ranges from index-0 to index-1 and makes the ranges [] have an inclusive start and
    inclusive end (the default in nextclade is exclusive end)
    """
    feature_list = []
    for gene in annotation_object.get("genes", []):
        feature_list.append(_build_gene_feature(gene))
        for cds in gene.get("cdses", []):
            feature_list.append(_build_cds_feature(cds, sequence_str))
    return feature_list


def create_flatfile(  # noqa: PLR0914
    config: Config, submission_data: SubmissionData
) -> str:
    metadata = submission_data.processed_entry.data.metadata
    unaligned_nuc_seq = submission_data.processed_entry.data.unalignedNucleotideSequences
    annotation_object = submission_data.annotations
    accession = submission_data.processed_entry.accession
    version = submission_data.processed_entry.version

    collection_date = metadata.get(config.embl.collection_date_property, "Unknown")
    authors = get_authors(str(metadata.get(config.embl.authors_property) or ""))
    country = get_country(metadata, config)
    organism = config.scientific_name
    molecule_type = config.molecule_type
    topology = config.topology

    embl_content = []

    for seq_name, sequence_str in unaligned_nuc_seq.items():
        if not sequence_str:
            continue
        reference = Reference()
        segment = seq_name if config.multi_segment else None
        description = get_description(accession, version, config.db_name, metadata, segment)
        reference.authors = authors
        sequence = SeqRecord(
            Seq(sequence_str),
            id=f"{accession}_{seq_name}" if config.multi_segment else accession,
            annotations={
                # Biopython's EMBL writer reads this specific key to fill in the ID line's
                # molecule-type token - it is not an INSDC qualifier (that's "mol_type" below).
                "molecule_type": molecule_type.seq_io_value,
                "organism": organism,
                "topology": topology,
                "references": [reference],  # type: ignore[dict-item]
            },
            description=description,
        )

        source_feature = SeqFeature(
            FeatureLocation(start=0, end=len(sequence_str)),
            type="source",
            qualifiers={
                "mol_type": str(molecule_type),
                "organism": organism,
                "geo_loc_name": country,
                "collection_date": collection_date,
            },
        )
        sequence.features.append(source_feature)
        if annotation_object and annotation_object.get(seq_name, None):
            seq_feature_list = get_seq_features(annotation_object[seq_name], sequence_str)
            for feature in seq_feature_list:
                sequence.features.append(feature)

        embl_content.append(sequence.format("embl"))

    # Multi-segment sequences have no empty lines between segments
    return "".join(embl_content)
