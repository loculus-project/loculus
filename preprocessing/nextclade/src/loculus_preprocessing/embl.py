import logging
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from Bio.Seq import Seq
from Bio.SeqFeature import (
    AfterPosition,
    BeforePosition,
    CompoundLocation,
    FeatureLocation,
    Reference,
    SeqFeature,
)
from Bio.SeqRecord import SeqRecord
from unidecode import unidecode

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


# Qualifiers this module derives from the annotation's structure rather than copying from
# its GFF attributes. codon_start especially must never be copied: the GFF attribute is
# already 1-based, whereas the value derived from Nextclade's 0-based `phase` is not.
DERIVED_QUALIFIERS = frozenset({"codon_start", "translation"})

# GFF attribute names that differ from the EMBL qualifier they become.
RENAMED_ATTRIBUTES = {"Note": "note"}


def is_minus_strand(segments: Sequence[Mapping[str, Any]]) -> bool:
    return bool(segments) and segments[0].get("strand") == "-"


def get_embl_qualifiers(
    attributes: Mapping[str, list[str]], allowed: Iterable[str]
) -> dict[str, list[str]]:
    """Copy the GFF attributes that are legal EMBL qualifiers, renaming where they differ.

    Values stay lists because that is BioPython's qualifier convention -- Nextclade
    reports every GFF attribute as a `list[str]`, since GFF3 attributes are multi-valued.
    """
    names = {name: name for name in allowed if name not in DERIVED_QUALIFIERS}
    names.update(RENAMED_ATTRIBUTES)
    return {
        embl_name: attributes[gff_name]
        for gff_name, embl_name in names.items()
        if gff_name in attributes
    }


def get_codon_start(segments: Sequence[Mapping[str, Any]]) -> int:
    """EMBL /codon_start: 1-based offset of the first complete codon within the feature.

    Nextclade reports `phase` (0-based) as a field on each segment, listing segments in
    transcription order, so the qualifier -- which describes the joined feature -- comes
    from the first of them.
    """
    if not segments:
        return 1
    return int(segments[0].get("phase", 0)) + 1


def get_coding_nucleotides(sequence_str: str, segments: Sequence[Mapping[str, Any]]) -> Seq:
    """The CDS's own nucleotides, read 5' to 3'.

    Nextclade lists segments in transcription order, which on the minus strand runs from
    the highest coordinate downwards. Each segment is therefore reverse-complemented on
    its own and the order is kept; reverse-complementing the joined sequence instead
    would undo that order and splice the CDS back to front.
    """
    parts = [sequence_str[s["range"]["begin"] : s["range"]["end"]] for s in segments]
    if is_minus_strand(segments):
        parts = [str(Seq(part).reverse_complement()) for part in parts]
    return Seq("".join(parts))


def get_translation(coding_nucleotides: Seq, codon_start: int) -> str:
    """EMBL /translation: whole codons from the first complete one, no terminal stop."""
    in_frame = coding_nucleotides[codon_start - 1 :]
    # A partial genome can end mid-codon; trimming avoids translating a dangling one.
    whole_codons = in_frame[: len(in_frame) - len(in_frame) % 3]
    return str(whole_codons.translate()).removesuffix("*")


def get_gene_feature(gene: Mapping[str, Any]) -> SeqFeature:
    """One EMBL `gene` feature.

    Nextclade ranges and BioPython locations are both 0-based with an exclusive end, so
    they pass through unchanged; BioPython converts to EMBL's 1-based inclusive form when
    it formats the flatfile.
    """
    gene_range = gene["range"]
    return SeqFeature(
        FeatureLocation(start=gene_range["begin"], end=gene_range["end"]),
        type="gene",
        qualifiers=get_embl_qualifiers(
            gene.get("attributes", {}), EMBL_ANNOTATIONS.get("gene_qualifiers", [])
        ),
    )


def get_truncation(segment: Mapping[str, Any]) -> tuple[int, int]:
    """How many nucleotides of this segment are missing at its 5' and 3' ends.

    Nextclade serialises `truncation` as the string "none" or as one of
    `{"fivePrime": n}`, `{"threePrime": n}`, `{"both": [n, m]}`.
    """
    truncation = segment.get("truncation")
    if not isinstance(truncation, Mapping):
        return (0, 0)
    if "both" in truncation:
        five, three = truncation["both"]
        return (int(five), int(three))
    return (int(truncation.get("fivePrime", 0)), int(truncation.get("threePrime", 0)))


def mark_partial(
    location: FeatureLocation, *, five_prime: bool, three_prime: bool
) -> FeatureLocation:
    """Flag the ends where the feature runs past what the sequence shows.

    INSDC marks an unknown boundary by the coordinate it lies at rather than by which end
    of the protein it is, so on the minus strand the 5' end is the upper coordinate.
    """
    lower_unknown, upper_unknown = (
        (three_prime, five_prime) if location.strand == -1 else (five_prime, three_prime)
    )
    return FeatureLocation(
        BeforePosition(location.start) if lower_unknown else location.start,
        AfterPosition(location.end) if upper_unknown else location.end,
        strand=location.strand,
    )


def get_cds_feature(cds: Mapping[str, Any], sequence_str: str) -> SeqFeature:
    """One EMBL `CDS` feature, spanning several segments when the CDS is spliced."""
    segments = cds.get("segments", [])
    strand = -1 if is_minus_strand(segments) else 1
    # Segments are in transcription order, so a truncated CDS is missing its start from
    # the first segment and its end from the last.
    five_prime = bool(segments) and get_truncation(segments[0])[0] > 0
    three_prime = bool(segments) and get_truncation(segments[-1])[1] > 0
    last = len(segments) - 1
    locations = [
        mark_partial(
            FeatureLocation(
                start=segment["range"]["begin"], end=segment["range"]["end"], strand=strand
            ),
            five_prime=five_prime and index == 0,
            three_prime=three_prime and index == last,
        )
        for index, segment in enumerate(segments)
    ]
    codon_start = get_codon_start(segments)
    return SeqFeature(
        location=locations[0] if len(locations) == 1 else CompoundLocation(locations),
        type="CDS",
        qualifiers={
            **get_embl_qualifiers(
                cds.get("attributes", {}), EMBL_ANNOTATIONS.get("cds_qualifiers", [])
            ),
            "codon_start": codon_start,
            "translation": get_translation(
                get_coding_nucleotides(sequence_str, segments), codon_start
            ),
        },
    )


def get_seq_features(annotation_object: Mapping[str, Any], sequence_str: str) -> list[SeqFeature]:
    """Convert one sequence's Nextclade annotation into EMBL gene and CDS features.

    `annotation_object` is Nextclade's per-sequence `annotation`, shaped as
    `{"genes": [{"range": ..., "attributes": ..., "cdses": [...]}, ...]}`. Its ranges are
    in the coordinates of `sequence_str` itself -- Nextclade projects the reference
    annotation onto each query -- so the sequence can be sliced with them directly.

    Qualifier vocabulary: https://www.ebi.ac.uk/ena/WebFeat/ and
    https://www.insdc.org/submitting-standards/feature-table/
    """
    return [
        feature
        for gene in annotation_object.get("genes", [])
        for feature in (
            get_gene_feature(gene),
            *(get_cds_feature(cds, sequence_str) for cds in gene.get("cdses", [])),
        )
    ]


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
