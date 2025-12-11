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

    expected = {
        "key": "id1",
        "col": "A",
        "segment1": None,
        "gene1": None,
        "unaligned_segment1": None,
    }
    assert result == expected


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

    expected = {
        "key": "id2",
        "col": "B",
        "segment1": {
            "sequence": "A",
            "insertions": ["123", "456"],
        },
        "gene1": {
            "sequence": "Y",
            "insertions": ["1", "2"],
        },
        "unaligned_segment1": "C",
    }
    assert result == expected
