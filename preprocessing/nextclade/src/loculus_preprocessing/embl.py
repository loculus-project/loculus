"""Build EMBL features from a Nextclade annotation."""

import logging
from dataclasses import dataclass

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

from loculus_preprocessing.datatypes import ProcessedMetadata, SubmissionData

from .config import Config
from .nextclade_annotation import (
    GffAttributes,
    NextcladeAnnotation,
    NextcladeCds,
    NextcladeGene,
    NextcladeSegment,
)

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
    cds_qualifiers: tuple[str, ...] = ()
    gene_qualifiers: tuple[str, ...] = ()


# EMBL allowed qualifiers constant
EMBL_ANNOTATIONS = EmblAnnotations(
    cds_qualifiers=(
        "allele",
        "artificial_location",
        "circular_RNA",
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
        # "transl_table",  # nextclade uses the standard transl_table 1
        "translation",
    ),
    gene_qualifiers=(
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
    ),
)


EMBL_TO_NEXTCLADE_ATTRIBUTES = {
    "note": "Note",
}


def _build_qualifiers(
    attributes: GffAttributes,
    allowed_qualifiers: tuple[str, ...],
) -> dict[str, list[str]]:
    """Return allowed EMBL qualifiers in deterministic order."""
    qualifiers = {}

    for qualifier in allowed_qualifiers:
        if qualifier in attributes:
            qualifiers[qualifier] = attributes[qualifier]
        elif (source := EMBL_TO_NEXTCLADE_ATTRIBUTES.get(qualifier)) and source in attributes:
            qualifiers[qualifier] = attributes[source]

    return qualifiers


def _build_gene_feature(gene: NextcladeGene) -> SeqFeature:
    qualifiers = _build_qualifiers(gene.attributes, EMBL_ANNOTATIONS.gene_qualifiers)
    # The annotation carries strand and truncation only on a CDS's segments, so a gene takes
    # both from its CDSes: INSDC marks a gene holding a truncated CDS partial too.
    strand = None
    start, end = gene.range.begin, gene.range.end
    if gene.cdses:
        segments = gene.cdses[0].segments
        strand = -1 if segments[0].strand == "-" else 1
        lower = segments[0].truncation.five_prime > 0
        upper = segments[-1].truncation.three_prime > 0
        if strand == -1:
            lower, upper = upper, lower
        start = BeforePosition(start) if lower else start
        end = AfterPosition(end) if upper else end
    # In FeatureLocation start and end are zero based, exclusive end.
    # thus an embl entry of 123..150 (one based counting) becomes a location of [122:150]
    return SeqFeature(
        FeatureLocation(start=start, end=end, strand=strand),
        type="gene",
        qualifiers=qualifiers,
    )


def _cds_location(segments: list[NextcladeSegment]) -> FeatureLocation | CompoundLocation:
    # Only the outer segments can run past the sequence; a splice junction is a known boundary.
    five_truncated = segments[0].truncation.five_prime > 0
    three_truncated = segments[-1].truncation.three_prime > 0
    last = len(segments) - 1
    locations = []
    for index, segment in enumerate(segments):
        strand = -1 if segment.strand == "-" else +1
        # INSDC marks the coordinate, not the protein end: on the minus strand 5' is upper.
        lower, upper = five_truncated and index == 0, three_truncated and index == last
        if strand == -1:
            lower, upper = upper, lower
        locations.append(
            FeatureLocation(
                BeforePosition(segment.range.begin) if lower else segment.range.begin,
                AfterPosition(segment.range.end) if upper else segment.range.end,
                strand=strand,
            )
        )
    return locations[0] if len(locations) == 1 else CompoundLocation(locations)


def _translate_cds(
    sequence_str: str,
    location: FeatureLocation | CompoundLocation,
    codon_start: int,
) -> str:
    # location.extract reverse-complements minus-strand (sub-)locations before concatenating,
    # so this is correct for both single- and multi-segment, plus- and minus-strand CDSes.
    extracted = location.extract(Seq(sequence_str))
    # codon_start is the 1-indexed offset of the first complete codon, so drop the leading
    # codon_start - 1 bases that precede it before translating.
    extracted = extracted[codon_start - 1 :]
    # A trailing partial codon (e.g. a CDS truncated at the sequence's 3' end) can't be
    # translated; trim it explicitly rather than relying on Biopython's warn-and-drop default.
    extracted = extracted[: len(extracted) - len(extracted) % 3]
    translation = str(extracted.translate())
    # The INSDC /translation qualifier excludes the terminal stop codon.
    return translation.removesuffix("*")


def _build_cds_feature(cds: NextcladeCds, sequence_str: str) -> SeqFeature:
    segments = cds.segments
    location = _cds_location(segments)
    # codon_start (phase in nextclade) defines the offset at which the first complete codon of a
    # coding feature can be found, relative to the first base of that feature, in nextclade this
    # is 0-indexed, in EMBL it is 1 indexed. nextclade puts `phase` on each segment, not on the
    # cds itself; only the first segment's phase is relevant, since EMBL's codon_start only
    # applies to the first base of a (possibly joined) feature.
    codon_start = segments[0].phase + 1
    # Copied GFF attributes are lists, codon_start is a count, translation is one string.
    qualifiers: dict[str, list[str] | int | str] = {
        **_build_qualifiers(cds.attributes, EMBL_ANNOTATIONS.cds_qualifiers),
        "codon_start": codon_start,
        "translation": _translate_cds(sequence_str, location, codon_start),
    }
    return SeqFeature(
        location=location,
        type="CDS",
        qualifiers=qualifiers,
    )


def get_seq_features(annotation: NextcladeAnnotation, sequence_str: str) -> list[SeqFeature]:
    """One gene feature per gene, each followed by its CDS features.

    Qualifiers are those allowed by https://www.ebi.ac.uk/ena/WebFeat/ and
    https://www.insdc.org/submitting-standards/feature-table/. Locations stay 0-based with an
    exclusive end here; Biopython's EMBL writer renders them as 1-based inclusive ranges.
    """
    feature_list = []
    for gene in annotation.genes:
        feature_list.append(_build_gene_feature(gene))
        for cds in gene.cdses:
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
                "molecule_type": str(molecule_type),
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
        annotation = annotation_object.get(seq_name) if annotation_object else None
        if annotation:
            for feature in get_seq_features(annotation, sequence_str):
                sequence.features.append(feature)

        embl_content.append(sequence.format("embl"))

    # Multi-segment sequences have no empty lines between segments
    return "".join(embl_content)
