import logging
from typing import Any
from unidecode import unidecode

from Bio.Seq import Seq
from Bio.SeqFeature import CompoundLocation, FeatureLocation, Reference, SeqFeature
from Bio.SeqRecord import SeqRecord

from loculus_preprocessing.datatypes import MoleculeType, ProcessedMetadata, SubmissionData

from .config import Config

logger = logging.getLogger(__name__)

# EMBL allowed qualifiers constant
EMBL_ANNOTATIONS: dict[str, list[str]] = {
    "cds_qualifiers": [
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
        "translation",
    ],
    "gene_qualifiers": [
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
        "pseudotype",
        "standard_name",
        "trans_splicing",
    ],
}


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


def get_seq_features(  # noqa: PLR0914
    annotation_object: dict[str, Any], sequence_str: str
) -> list[SeqFeature]:
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
    # Map from nextclade attribute names to EMBL attribute names
    attribute_map = {
        # "Dbxref": "db_xref", - # protein accession of reference
        "Note": "note",
        "phase": "codon_start",
    }
    feature_list = []
    for gene in annotation_object.get("genes", []):
        gene_qualifiers = EMBL_ANNOTATIONS.get("gene_qualifiers", [])
        gene_attributes_map = {qualifier: qualifier for qualifier in gene_qualifiers}
        gene_attributes_map.update(attribute_map)
        gene_range = gene.get("range")
        attributes = gene.get("attributes", {})
        qualifiers = {
            new_key: attributes[old_key]
            for old_key, new_key in gene_attributes_map.items()
            if old_key in attributes
        }
        # In FeatureLocation start and end are zero based, exclusive end.
        # thus an embl entry of 123..150 (one based counting) becomes a location of [122:150]
        feature = SeqFeature(
            FeatureLocation(start=gene_range["begin"], end=gene_range["end"]),
            type="gene",
            qualifiers=qualifiers,
        )
        feature_list.append(feature)
        for cds in gene.get("cdses", []):
            cds_qualifiers = EMBL_ANNOTATIONS.get("cds_qualifiers", [])
            cds_attributes_map = {qualifier: qualifier for qualifier in cds_qualifiers}
            cds_attributes_map.update(attribute_map)
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
                for old_key, new_key in cds_attributes_map.items()
                if old_key in attributes_cds
            }
            # codon_start and phase define the offset at which the first complete codon of a coding
            # feature can be found, relative to the first base of that feature.
            # Phase is 0-indexed, codon_start is 1 indexed
            qualifiers["codon_start"] = qualifiers.get("codon_start", 0) + 1
            qualifiers["translation"] = "".join(
                [
                    str(Seq(sequence_str[(range["begin"]) : (range["end"])]).translate())
                    for range in ranges
                ]
            )
            feature = SeqFeature(
                location=compound_location,
                type="CDS",
                qualifiers=qualifiers,
            )
            feature_list.append(feature)
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

    seqIO_moleculetype = {  # noqa: N806
        MoleculeType.GENOMIC_DNA: "DNA",
        MoleculeType.GENOMIC_RNA: "RNA",
        MoleculeType.VIRAL_CRNA: "cRNA",
    }

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
                "molecule_type": seqIO_moleculetype.get(molecule_type, "DNA"),
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
                "molecule_type": str(molecule_type),
                "organism": organism,
                "country": country,
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
