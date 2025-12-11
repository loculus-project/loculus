from __future__ import annotations

from silo_import.decompressor import transform_record


def test_transform_null_values() -> None:
    input_data = {
        "metadata": {"key": "id1", "col": "A"},
        "alignedNucleotideSequences": {"segment1": None},
        "unalignedNucleotideSequences": {"segment1": None},
        "alignedAminoAcidSequences": {"gene1": None},
        "nucleotideInsertions": {"segment1": []},
        "aminoAcidInsertions": {"gene1": []},
    }

    result = transform_record(input_data)

    assert result.get("key") == "id1"
    assert result.get("col") == "A"
    assert result.get("segment1") is None
    assert result.get("gene1") is None
    assert result.get("unaligned_segment1") is None


def test_transform_with_data() -> None:
    input_data = {
        "metadata": {"key": "id2", "col": "B"},
        "alignedNucleotideSequences": {"segment1": "A"},
        "unalignedNucleotideSequences": {"segment1": "C"},
        "alignedAminoAcidSequences": {"gene1": "Y"},
        "nucleotideInsertions": {"segment1": ["123", "456"]},
        "aminoAcidInsertions": {"gene1": ["1", "2"]},
    }

    result = transform_record(input_data)

    assert result.get("key") == "id2"
    assert result.get("col") == "B"
    assert result.get("unaligned_segment1") == "C"

    segment1 = result.get("segment1")
    assert segment1 is not None
    assert segment1.get("sequence") == "A"
    assert segment1.get("insertions") == ["123", "456"]

    gene1 = result.get("gene1")
    assert gene1 is not None
    assert gene1.get("sequence") == "Y"
    assert gene1.get("insertions") == ["1", "2"]
