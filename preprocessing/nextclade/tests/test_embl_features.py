# ruff: noqa: S101
"""Unit tests for translating a Nextclade annotation into EMBL features.

The fixtures mirror the real shape of Nextclade's per-sequence `annotation`; see the
module docstring of `loculus_preprocessing.embl` for the contract they stand in for.
"""

import warnings

from Bio import BiopythonWarning
from Bio.Seq import Seq

from loculus_preprocessing.embl import get_seq_features
from loculus_preprocessing.nextclade_annotation import NextcladeAnnotation


def _annotation(segments, *, cds_attributes=None, gene_range=None):
    """Validate the fixture the way the pipeline validates Nextclade's own JSON."""
    segment_list = list(segments)
    begin = min(s["range"]["begin"] for s in segment_list)
    end = max(s["range"]["end"] for s in segment_list)
    return NextcladeAnnotation.model_validate({
        "genes": [
            {
                "name": "G",
                "range": gene_range or {"begin": begin, "end": end},
                "attributes": {"Note": ["a gene"]},
                "cdses": [
                    {
                        "name": "G",
                        "segments": segment_list,
                        "attributes": {"gene": ["G"], **(cds_attributes or {})},
                    }
                ],
            }
        ]
    })


def _segment(begin, end, strand="+", phase=0, truncation=None):
    return {
        "range": {"begin": begin, "end": end},
        "strand": strand,
        "phase": phase,
        "truncation": truncation or "none",
    }


def _only_cds(features):
    (cds,) = [f for f in features if f.type == "CDS"]
    return cds


def test_codon_start_comes_from_phase_not_the_gff_attribute():
    """RSV datasets carry a `codon_start` GFF attribute; ours must come from `phase`.

    The two disagree here on purpose: the attribute is already 1-based, `phase` is not.
    """
    phase = 2
    sequence = "GG" + "ATG" + "GCT" + "TAA"
    annotation = _annotation(
        [_segment(0, len(sequence), phase=phase)],
        cds_attributes={"codon_start": ["1"]},
    )

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["codon_start"] == phase + 1
    assert cds.qualifiers["translation"] == "MA"


def test_minus_strand_cds_is_reverse_complemented():
    protein_coding = Seq("ATG" + "GCT" * 4 + "TGA")
    sequence = str(protein_coding.reverse_complement())
    annotation = _annotation([_segment(0, len(sequence), strand="-")])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MAAAA"


def test_spliced_cds_translates_joined_nucleotides():
    """Segment boundaries fall mid-codon, so nucleotides are joined before translating."""
    sequence = "AT" + "GGCTTGA"  # ATG GCT TGA across a junction after 2 nt
    annotation = _annotation([_segment(0, 2), _segment(2, 9)])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MA"


def test_minus_strand_spliced_cds_keeps_nextclades_segment_order():
    """Segments arrive 5'->3', which on the minus strand is descending coordinates."""
    exon_1, exon_2 = "ATGAAAG", "CTGCTTAA"  # together: M K A A stop, junction mid-codon
    spacer = "GGGGG"
    sequence = (
        spacer
        + str(Seq(exon_2).reverse_complement())
        + spacer
        + str(Seq(exon_1).reverse_complement())
        + spacer
    )
    exon_2_begin = len(spacer)
    exon_1_begin = len(spacer) + len(exon_2) + len(spacer)
    annotation = _annotation(
        [
            _segment(exon_1_begin, exon_1_begin + len(exon_1), strand="-"),
            _segment(exon_2_begin, exon_2_begin + len(exon_2), strand="-"),
        ]
    )

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MKAA"


def test_cds_spanning_the_origin_keeps_listed_segment_order():
    """On a circular genome the listed order is not ascending coordinates, and still wins."""
    coding = "ATGAAAGCTGCTTAA"  # M K A A stop
    filler = "GGGGGGGGGG"
    sequence = coding[11:] + filler + coding[:11]
    annotation = _annotation(
        [_segment(len(sequence) - 11, len(sequence)), _segment(0, 4)],
        gene_range={"begin": 0, "end": len(sequence)},
    )

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MKAA"
    assert [(int(part.start), int(part.end)) for part in cds.location.parts] == [
        (len(sequence) - 11, len(sequence)),
        (0, 4),
    ]


def test_truncated_cds_is_marked_partial():
    """INSDC marks an unknown boundary with < or >; a partial genome truncates CDSes."""
    sequence = "ATGGCTTAA"
    annotation = _annotation([_segment(0, len(sequence), truncation={"fivePrime": 30})])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert str(cds.location.start) == "<0"
    assert str(cds.location.end) == "9"


def test_three_prime_truncation_marks_the_upper_coordinate():
    sequence = "ATGGCTTAA"
    annotation = _annotation([_segment(0, len(sequence), truncation={"threePrime": 30})])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert str(cds.location.start) == "0"
    assert str(cds.location.end) == ">9"


def test_truncation_at_both_ends_marks_both_coordinates():
    sequence = "ATGGCTTAA"
    annotation = _annotation([_segment(0, len(sequence), truncation={"both": [30, 60]})])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert str(cds.location.start) == "<0"
    assert str(cds.location.end) == ">9"


def test_truncation_marks_the_upper_coordinate_on_the_minus_strand():
    """The 5' end of a minus-strand feature is its upper coordinate, so it takes the >."""
    sequence = "ATGGCTTAA"
    annotation = _annotation([_segment(0, len(sequence), strand="-", truncation={"fivePrime": 30})])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert str(cds.location.start) == "0"
    assert str(cds.location.end) == ">9"


def test_only_the_outer_segments_of_a_spliced_cds_are_marked_partial():
    """A junction between segments is a known boundary, however truncated the CDS is."""
    sequence = "AT" + "GGCTTGA"
    annotation = _annotation(
        [
            _segment(0, 2, truncation={"fivePrime": 30}),
            _segment(2, 9, truncation={"threePrime": 30}),
        ]
    )

    cds = _only_cds(get_seq_features(annotation, sequence))
    first, second = cds.location.parts

    assert (str(first.start), str(first.end)) == ("<0", "2")
    assert (str(second.start), str(second.end)) == ("2", ">9")


def test_gene_takes_its_strand_from_its_cdses():
    """Nextclade reports no strand on a gene, so an unstranded gene would read as plus."""
    protein_coding = Seq("ATG" + "GCT" + "TAA")
    sequence = str(protein_coding.reverse_complement())
    annotation = _annotation([_segment(0, len(sequence), strand="-")])

    features = get_seq_features(annotation, sequence)
    gene = next(f for f in features if f.type == "gene")

    assert gene.location.strand == -1
    assert gene.location.strand == _only_cds(features).location.strand


def test_complete_cds_has_no_partial_markers():
    sequence = "ATGGCTTAA"
    annotation = _annotation([_segment(0, len(sequence))])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert str(cds.location.start) == "0"
    assert str(cds.location.end) == "9"


def test_translation_excludes_terminal_stop():
    """INSDC /translation does not include the terminal stop codon."""
    sequence = "ATG" + "GCT" + "TAA"
    annotation = _annotation([_segment(0, len(sequence))])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MA"


def test_trailing_partial_codon_is_trimmed_rather_than_warned_about():
    """BioPython would translate a dangling codon and warn; the trim pre-empts that."""
    sequence = "ATGGCTTA"  # 8 nt: two whole codons plus a dangling "TA"
    annotation = _annotation([_segment(0, len(sequence))])

    with warnings.catch_warnings():
        warnings.simplefilter("error", BiopythonWarning)
        cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MA"


def test_qualifiers_are_copied_as_lists_and_renamed():
    """BioPython's qualifier convention is list-valued, and GFF attributes already are.

    `Note` is admitted because it maps to `note`, which is the legal EMBL name.
    """
    sequence = "ATG" + "GCT" + "TAA"
    annotation = _annotation([_segment(0, len(sequence))])

    features = get_seq_features(annotation, sequence)

    gene = next(f for f in features if f.type == "gene")
    assert gene.qualifiers["note"] == ["a gene"]
    assert "Note" not in gene.qualifiers
    assert _only_cds(features).qualifiers["gene"] == ["G"]
