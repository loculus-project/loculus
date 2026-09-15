# ruff: noqa: S101
"""Unit tests for translating a Nextclade annotation into EMBL features.

The fixtures mirror the real shape of Nextclade's per-sequence ``annotation`` object:
ranges are 0-based half-open and in *query* coordinates, and every GFF attribute value
is a ``list[str]`` (GFF3 attributes are multi-valued).
"""

import warnings

from Bio import BiopythonWarning
from Bio.Seq import Seq

from loculus_preprocessing.embl import get_seq_features


def _annotation(*, cds_attributes=None, segments, gene_range=None):
    segment_list = list(segments)
    begin = min(s["range"]["begin"] for s in segment_list)
    end = max(s["range"]["end"] for s in segment_list)
    return {
        "genes": [
            {
                "name": "G",
                "range": gene_range or {"begin": begin, "end": end},
                "attributes": {"note": ["a gene"]},
                "cdses": [
                    {
                        "name": "G",
                        "segments": segment_list,
                        "attributes": {"gene": ["G"], **(cds_attributes or {})},
                    }
                ],
            }
        ]
    }


def _segment(begin, end, strand="+", phase=0):
    return {"range": {"begin": begin, "end": end}, "strand": strand, "phase": phase}


def _only_cds(features):
    (cds,) = [f for f in features if f.type == "CDS"]
    return cds


def test_codon_start_from_gff_attribute_does_not_crash():
    """RSV datasets carry an explicit ``codon_start=1`` GFF attribute.

    Nextclade surfaces it as ``["1"]``; it is already 1-based and must not be incremented.
    """
    sequence = "ATG" + "AAA" * 5 + "TAA"
    annotation = _annotation(
        segments=[_segment(0, len(sequence))],
        cds_attributes={"codon_start": ["1"]},
    )

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["codon_start"] == 1


def test_minus_strand_cds_is_reverse_complemented():
    """A CDS on the minus strand must be translated from the reverse complement."""
    protein_coding = Seq("ATG" + "GCT" * 4 + "TGA")
    sequence = str(protein_coding.reverse_complement())
    annotation = _annotation(segments=[_segment(0, len(sequence), strand="-")])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MAAAA"


def test_spliced_cds_translates_joined_nucleotides():
    """Segment boundaries fall mid-codon, so nucleotides are joined before translating."""
    # "AT" + "GGCTTGA" -> ATG GCT TGA -> M A stop. Translating each segment alone gives junk.
    sequence = "AT" + "GGCTTGA"
    annotation = _annotation(segments=[_segment(0, 2), _segment(2, 9)])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MA"


def test_minus_strand_spliced_cds_keeps_nextclades_segment_order():
    """Nextclade lists segments in transcription order, not genomic order.

    On the minus strand that runs from the highest coordinate downwards, so each segment
    is reverse-complemented on its own and the listed order is preserved. Reverse-
    complementing the joined sequence instead would splice the CDS back to front.
    """
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
        segments=[
            _segment(exon_1_begin, exon_1_begin + len(exon_1), strand="-"),
            _segment(exon_2_begin, exon_2_begin + len(exon_2), strand="-"),
        ]
    )

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MKAA"


def test_cds_spanning_the_origin_of_a_circular_genome():
    """On a circular genome a CDS can run off the end and continue at position 1.

    Nextclade lists the two pieces in transcription order, so keeping that order is all
    that is needed; the EMBL location becomes a join() of the two.
    """
    coding = "ATGAAAGCTGCTTAA"  # M K A A stop
    filler = "GGGGGGGGGG"
    sequence = coding[11:] + filler + coding[:11]
    annotation = _annotation(
        segments=[
            _segment(len(sequence) - 11, len(sequence)),
            _segment(0, 4),
        ],
        gene_range={"begin": 0, "end": len(sequence)},
    )

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MKAA"
    assert [(int(part.start), int(part.end)) for part in cds.location.parts] == [
        (len(sequence) - 11, len(sequence)),
        (0, 4),
    ]


def test_translation_excludes_terminal_stop():
    """INSDC /translation does not include the terminal stop codon."""
    sequence = "ATG" + "GCT" + "TAA"
    annotation = _annotation(segments=[_segment(0, len(sequence))])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MA"


def test_partial_cds_does_not_translate_a_dangling_codon():
    """A truncated CDS is trimmed to whole codons rather than warning on a partial one."""
    sequence = "ATGGCTTA"  # 8 nt: two whole codons plus a dangling "TA"
    annotation = _annotation(segments=[_segment(0, len(sequence))])

    cds = _only_cds(get_seq_features(annotation, sequence))

    assert cds.qualifiers["translation"] == "MA"


def test_qualifiers_are_copied_as_lists():
    """BioPython's qualifier convention is list-valued, and GFF attributes already are."""
    sequence = "ATG" + "GCT" + "TAA"
    annotation = _annotation(segments=[_segment(0, len(sequence))])

    features = get_seq_features(annotation, sequence)

    gene = next(f for f in features if f.type == "gene")
    assert gene.qualifiers["note"] == ["a gene"]
    assert _only_cds(features).qualifiers["gene"] == ["G"]


def test_partial_codon_does_not_warn():
    """The dangling-codon trim exists to keep BioPython from warning on every CDS."""
    sequence = "ATGGCTTA"
    annotation = _annotation(segments=[_segment(0, len(sequence))])

    with warnings.catch_warnings():
        warnings.simplefilter("error", BiopythonWarning)
        get_seq_features(annotation, sequence)
