"""Render a processed sequence and its Nextclade annotation as an EMBL flatfile.

What we take from Nextclade, and what we derive ourselves
---------------------------------------------------------
Nextclade owns *where things are on this sequence*; this module owns *what INSDC
requires*. The annotation object is Nextclade's per-sequence `annotation` field, and the
contract we rely on is:

- **Coordinates are 0-based and half-open**, like Python slices, and BioPython's
  `FeatureLocation` uses the same convention, so ranges pass through untouched. EMBL's
  1-based inclusive form is produced by BioPython at format time, not here.
- **Coordinates are in query space.** Nextclade projects the reference annotation onto
  each submitted sequence, so `sequence_str` can be sliced with them directly; a deletion
  in the query shifts every downstream feature.
- **A CDS's segments are listed in transcription order (5'->3'), not genomic order.**
  On the minus strand that runs from the highest coordinate downwards. Each segment is
  therefore reverse-complemented on its own and the order preserved -- reverse-
  complementing the joined sequence instead would splice the CDS back to front.
- **All segments of one CDS share a strand**; Nextclade rejects mixed-strand CDSes.
- **`phase` is 0-based** and accounts for 5' truncation, so the first transcribed
  segment's phase is what INSDC's 1-based `/codon_start` is derived from. Note this is
  Nextclade's own computed phase -- it ignores the GFF3 `phase` column.
- **Every `attributes` value is a `list[str]`**, because GFF3 attributes are multi-valued.
  Qualifiers stay lists (BioPython's convention); `DERIVED_QUALIFIERS` names the two we
  compute instead of copying.
- **`truncation`** is `"none"` or `{"fivePrime": n}` / `{"threePrime": n}` /
  `{"both": [n, m]}`, and drives the `<`/`>` partial markers.
- **A CDS crossing the origin of a circular genome** arrives pre-split into segments; on
  the plus strand, keeping their order is all that is needed (but see below).

Translations are computed here rather than taken from Nextclade's `cds_translation`
output, because that output is aligned to the reference: insertions are stripped into
`aminoAcidInsertions`, so it describes the alignment rather than the submitted sequence.

Where the contract can break
----------------------------
The ordering invariant is the fragile one: it is really an assumption about the dataset's
GFF row order, which Nextclade (3.23.0) passes through unchecked, so a coordinate-sorted
GFF silently yields back-to-front segments for a minus-strand multi-segment CDS. The same
root cause makes minus-strand origin-crossing CDSes wrong, since the wrap parts are ordered
by ascending coordinate whatever the strand. Both are upstream bugs, not defended against
here, and both also corrupt `alignedAminoAcidSequences` -- fixing this file alone would not
be enough. Nothing honours a non-standard genetic code: every translation uses the standard
table.
"""

import logging
from collections.abc import Iterable, Mapping, Sequence
from typing import Literal, NamedTuple, Required, TypedDict

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

logger = logging.getLogger(__name__)

# GFF3 attributes are multi-valued, so Nextclade reports every value as a list.
GffAttributes = Mapping[str, list[str]]

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
class NextcladeRange(TypedDict):
    begin: int
    end: int


class NextcladeTruncation(TypedDict, total=False):
    fivePrime: int
    threePrime: int
    both: list[int]


class NextcladeSegment(TypedDict):
    # Nextclade always emits all four; defaulting any of them would silently mistranslate.
    range: NextcladeRange
    strand: Literal["+", "-"]
    phase: int
    truncation: Literal["none"] | NextcladeTruncation


class NextcladeCds(TypedDict, total=False):
    segments: Required[list[NextcladeSegment]]
    attributes: GffAttributes


class NextcladeGene(TypedDict, total=False):
    range: Required[NextcladeRange]
    cdses: list[NextcladeCds]
    attributes: GffAttributes


class NextcladeAnnotation(TypedDict, total=False):
    genes: list[NextcladeGene]


class Truncation(NamedTuple):
    """Nucleotides missing from a segment at each end."""

    five_prime: int
    three_prime: int


# Qualifiers derived from the annotation's structure, never copied from its GFF attributes:
# the GFF's own codon_start is already 1-based, while ours comes from a 0-based phase.
DERIVED_QUALIFIERS = frozenset({"codon_start", "translation"})

# GFF attribute names that differ from the EMBL qualifier they become.
GFF_TO_EMBL_QUALIFIER = {"Note": "note"}


def is_minus_strand(segments: Sequence[NextcladeSegment]) -> bool:
    """All segments of a CDS share a strand, so the first answers for the whole CDS."""
    return segments[0]["strand"] == "-"


def get_embl_qualifiers(attributes: GffAttributes, allowed: Iterable[str]) -> dict[str, list[str]]:
    """Copy the GFF attributes that are legal EMBL qualifiers, renaming where they differ.

    Renaming happens before the check, so an attribute is admitted on the strength of the
    EMBL name it maps to -- `Note` is legal because `note` is. Iterating `allowed` rather
    than the attributes keeps the qualifier order stable across datasets.
    """
    renamed = {GFF_TO_EMBL_QUALIFIER.get(name, name): values for name, values in attributes.items()}
    return {
        name: renamed[name]
        for name in allowed
        if name in renamed and name not in DERIVED_QUALIFIERS
    }


def get_codon_start(segments: Sequence[NextcladeSegment]) -> int:
    """EMBL /codon_start: 1-based offset of the first complete codon within the feature.

    Segments are in transcription order, so the first listed one is the 5' end.
    """
    return segments[0]["phase"] + 1


def get_coding_nucleotides(segments: Sequence[NextcladeSegment], sequence_str: str) -> Seq:
    """The CDS's own nucleotides, read 5' to 3'.

    Segments arrive in transcription order, so each is reverse-complemented on its own and
    the order kept; reverse-complementing the joined sequence would splice it back to front.
    """
    parts = [Seq(sequence_str[s["range"]["begin"] : s["range"]["end"]]) for s in segments]
    if is_minus_strand(segments):
        parts = [part.reverse_complement() for part in parts]
    return Seq("").join(parts)


def get_translation(coding_nucleotides: Seq, codon_start: int) -> str:
    """EMBL /translation: whole codons from the first complete one, no terminal stop."""
    in_frame = coding_nucleotides[codon_start - 1 :]
    # BioPython warns on a trailing partial codon, and promises to make it an error.
    whole_codons = in_frame[: len(in_frame) // 3 * 3]
    return str(whole_codons.translate()).removesuffix("*")


def get_gene_feature(gene: NextcladeGene) -> SeqFeature:
    gene_range = gene["range"]
    # The JSON annotation carries a strand only on a CDS's segments, so a gene takes the
    # strand of its CDSes -- the same way Nextclade derives it for its own GFF and TBL output.
    cdses = gene.get("cdses", [])
    strand = (-1 if is_minus_strand(cdses[0]["segments"]) else 1) if cdses else None
    return SeqFeature(
        FeatureLocation(gene_range["begin"], gene_range["end"], strand=strand),
        type="gene",
        qualifiers=get_embl_qualifiers(
            gene.get("attributes", {}), EMBL_ANNOTATIONS["gene_qualifiers"]
        ),
    )


def get_truncation(segment: NextcladeSegment) -> Truncation:
    """How much of this segment the sequence does not show."""
    truncation = segment["truncation"]
    if not isinstance(truncation, Mapping):
        return Truncation(0, 0)
    if "both" in truncation:
        five_prime, three_prime = truncation["both"]
        return Truncation(int(five_prime), int(three_prime))
    return Truncation(int(truncation.get("fivePrime", 0)), int(truncation.get("threePrime", 0)))


def with_partial_boundaries(
    location: FeatureLocation, *, five_prime_truncated: bool, three_prime_truncated: bool
) -> FeatureLocation:
    """Flag the ends where the feature runs past what the sequence shows.

    INSDC marks an unknown boundary by the coordinate it lies at rather than by which end
    of the protein it is, so on the minus strand the 5' end is the upper coordinate.
    """
    lower_unknown, upper_unknown = (
        (three_prime_truncated, five_prime_truncated)
        if location.strand == -1
        else (five_prime_truncated, three_prime_truncated)
    )
    return FeatureLocation(
        BeforePosition(location.start) if lower_unknown else location.start,
        AfterPosition(location.end) if upper_unknown else location.end,
        strand=location.strand,
    )


def get_cds_feature(cds: NextcladeCds, sequence_str: str) -> SeqFeature:
    """One EMBL `CDS` feature, spanning several segments when the CDS is spliced."""
    segments = cds["segments"]
    strand = -1 if is_minus_strand(segments) else 1
    # First segment in transcription order carries any 5' truncation, the last any 3'.
    five_prime_truncated = get_truncation(segments[0]).five_prime > 0
    three_prime_truncated = get_truncation(segments[-1]).three_prime > 0
    last = len(segments) - 1
    locations = [
        with_partial_boundaries(
            FeatureLocation(segment["range"]["begin"], segment["range"]["end"], strand=strand),
            five_prime_truncated=five_prime_truncated and index == 0,
            three_prime_truncated=three_prime_truncated and index == last,
        )
        for index, segment in enumerate(segments)
    ]

    codon_start = get_codon_start(segments)
    coding_nucleotides = get_coding_nucleotides(segments, sequence_str)
    return SeqFeature(
        location=locations[0] if len(locations) == 1 else CompoundLocation(locations),
        type="CDS",
        qualifiers={
            **get_embl_qualifiers(cds.get("attributes", {}), EMBL_ANNOTATIONS["cds_qualifiers"]),
            "codon_start": codon_start,
            "translation": get_translation(coding_nucleotides, codon_start),
        },
    )


def get_seq_features(annotation: NextcladeAnnotation, sequence_str: str) -> list[SeqFeature]:
    """Convert one sequence's Nextclade annotation into EMBL gene and CDS features."""
    features: list[SeqFeature] = []
    for gene in annotation.get("genes", []):
        features.append(get_gene_feature(gene))
        features.extend(get_cds_feature(cds, sequence_str) for cds in gene.get("cdses", []))
    return features


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
