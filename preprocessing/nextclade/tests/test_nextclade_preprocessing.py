# ruff: noqa: S101


from dataclasses import dataclass
from typing import Literal

import pytest
from Bio import SeqIO
from factory_methods import (
    ProcessedAlignment,
    ProcessedEntryFactory,
    ProcessingAnnotationTestCase,
    ProcessingTestCase,
    UnprocessedEntryFactory,
    ts_from_ymd,
    verify_processed_entry,
)

from loculus_preprocessing.config import Config, get_config
from loculus_preprocessing.datatypes import (
    ProcessedEntry,
    ProcessedMetadataValue,
    UnprocessedData,
    UnprocessedEntry,
)
from loculus_preprocessing.prepro import process_all
from loculus_preprocessing.processing_functions import (
    format_frameshift,
    format_stop_codon,
)

# Config file used for testing
SINGLE_SEGMENT_CONFIG = "tests/single_segment_config.yaml"
MULTI_SEGMENT_CONFIG = "tests/multi_segment_config.yaml"

EBOLA_SUDAN_DATASET = "tests/ebola-sudan-test-dataset"
EBOLA_ZAIRE_DATASET = "tests/ebola-zaire-test-dataset"

CONFIGS = {
    "single": SINGLE_SEGMENT_CONFIG,
    "multi": MULTI_SEGMENT_CONFIG,
}


def get_consensus_sequence(
    type: Literal["single"] | Literal["ebola-sudan"] | Literal["ebola-zaire"],
) -> str:
    if type in {"single", "ebola-sudan"}:
        record = next(SeqIO.parse(EBOLA_SUDAN_DATASET + "/reference.fasta", "fasta"))
    elif type == "ebola-zaire":
        record = next(SeqIO.parse(EBOLA_ZAIRE_DATASET + "/reference.fasta", "fasta"))
    return str(record.seq)


def get_sequence_with_mutation(
    type: Literal["single"] | Literal["ebola-sudan"] | Literal["ebola-zaire"],
) -> str:
    record = next(SeqIO.parse(type, "fasta"))
    if type in {"single", "ebola-sudan"}:
        pos = 458 + 3  # start of second AA in NP gene, convert G to A (AA D to N)
    elif type == "ebola-zaire":
        pos = 10345 + 3  # start of second AA in VP24 gene, convert G to A (AA A to T)
    return str(record.seq[: pos - 1]) + "A" + str(record.seq[pos:])


def get_sequence_with_deletion(
    type: Literal["single"] | Literal["ebola-sudan"] | Literal["ebola-zaire"],
) -> str:
    record = next(SeqIO.parse(type, "fasta"))
    if type in {"single", "ebola-sudan"}:
        pos = 2674 - 6  # start of second last AA in NP gene, remove H
    elif type == "ebola-zaire":
        pos = 11100 - 6  # start of second last AA in VP24 gene, remove I
    return str(record.seq[: pos - 1]) + str(record.seq[pos + 2 :])


def get_sequence_with_insertion(
    type: Literal["single"] | Literal["ebola-sudan"] | Literal["ebola-zaire"],
) -> str:
    record = next(SeqIO.parse(type, "fasta"))
    if type in {"single", "ebola-sudan"}:
        pos = 2674 - 3  # start of last AA in NP gene
    elif type == "ebola-zaire":
        pos = 11100 - 3  # start of last AA in VP24 gene
    return str(record.seq[: pos - 1]) + "GAC" + str(record.seq[pos - 1 :])  # insert D AA


def get_invalid_sequence():
    return "ATGCGTACGTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGC"  # Invalid sequence for testing


@dataclass
class Case:
    name: str
    metadata: dict[str, str | None]
    processed_alignment: ProcessedAlignment
    expected_metadata: dict[str, ProcessedMetadataValue]
    expected_errors: list[ProcessingAnnotationTestCase] | None = None
    expected_warnings: list[ProcessingAnnotationTestCase] | None = None
    accession_id: str = "000999"

    def create_test_case(self, factory_custom: ProcessedEntryFactory) -> ProcessingTestCase:
        unprocessed_entry = UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict=self.metadata,
            accession_id=self.accession_id,
        )
        expected_output = factory_custom.create_processed_entry(
            metadata_dict=self.expected_metadata,
            accession=unprocessed_entry.accessionVersion.split(".")[0],
            metadata_errors=self.expected_errors or [],
            metadata_warnings=self.expected_warnings or [],
            processed_alignment=self.processed_alignment,
        )
        return ProcessingTestCase(
            name=self.name, input=unprocessed_entry, expected_output=expected_output
        )


test_case_definitions = []


@pytest.fixture(scope="function")
def factory_custom(request):
    config_key = getattr(request, "param", "single")
    config_val = CONFIGS[config_key]
    config = get_config(config_val)
    return ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys())), config


def process_single_entry(
    test_case: ProcessingTestCase, config: Config, dataset_dir: str = "temp"
) -> ProcessedEntry:
    result = process_all([test_case.input], dataset_dir, config)
    return result[0]


@pytest.mark.parametrize("test_case_def", test_case_definitions, ids=lambda tc: tc.name)
def test_preprocessing(test_case_def: Case, factory_custom: ProcessedEntryFactory):
    config = get_config(SINGLE_SEGMENT_CONFIG)
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config)
    verify_processed_entry(processed_entry, test_case.expected_output, test_case.name)


def test_preprocessing_with_single_sequences():
    sequence_name = "entry with one mutation"
    sequence = get_consensus_sequence("single")
    sequence = sequence[0] + "A" + sequence[2:]
    sequence_entry_data = UnprocessedEntry(
        accessionVersion=f"LOC_01.1",
        data=UnprocessedData(
            submitter="test_submitter",
            submittedAt=ts_from_ymd(2021, 12, 15),
            metadata={
                "ncbi_required_collection_date": "2024-01-01",
            },
            unalignedNucleotideSequences={"main": sequence},
        ),
    )

    config = get_config(SINGLE_SEGMENT_CONFIG)
    result = process_all([sequence_entry_data], EBOLA_SUDAN_DATASET, config)
    processed_entry = result[0]

    assert processed_entry.errors == []
    assert processed_entry.warnings == []
    assert processed_entry.data.unalignedNucleotideSequences == {"main": sequence}
    assert processed_entry.data.alignedNucleotideSequences == {"main": sequence}
    assert processed_entry.data.nucleotideInsertions == {"main": []}
    assert set(processed_entry.data.alignedAminoAcidSequences.keys()) == {
        "NPEbolaSudan",
        "VP35EbolaSudan",
    }
    assert processed_entry.data.aminoAcidInsertions == {}


def test_format_frameshift():
    # Test case 1: Empty input
    assert not format_frameshift("[]")

    # Test case 2: Single frameshift
    input_single = '[{"cdsName": "GPC", "nucRel": {"begin": 5, "end": 20}, "nucAbs": [{"begin": 97, "end": 112}], "codon": {"begin": 2, "end": 7}, "gapsLeading": {"begin": 1, "end": 2}, "gapsTrailing": {"begin": 7, "end": 8}}]'  # noqa: E501
    expected_single = "GPC:3-7(nt:98-112)"
    assert format_frameshift(input_single) == expected_single

    # Test case 3: Multiple frameshifts
    input_multiple = '[{"cdsName": "GPC", "nucRel": {"begin": 5, "end": 20}, "nucAbs": [{"begin": 97, "end": 112}], "codon": {"begin": 2, "end": 7}, "gapsLeading": {"begin": 1, "end": 2}, "gapsTrailing": {"begin": 7, "end": 8}}, {"cdsName": "NP", "nucRel": {"begin": 10, "end": 15}, "nucAbs": [{"begin": 200, "end": 205}], "codon": {"begin": 3, "end": 5}, "gapsLeading": {"begin": 2, "end": 3}, "gapsTrailing": {"begin": 5, "end": 6}}]'  # noqa: E501
    expected_multiple = "GPC:3-7(nt:98-112),NP:4-5(nt:201-205)"
    assert format_frameshift(input_multiple) == expected_multiple

    # Test case 4: Single nucleotide frameshift
    input_single_nuc = '[{"cdsName": "L", "nucRel": {"begin": 30, "end": 31}, "nucAbs": [{"begin": 500, "end": 501}], "codon": {"begin": 10, "end": 11}, "gapsLeading": {"begin": 9, "end": 10}, "gapsTrailing": {"begin": 11, "end": 12}}]'  # noqa: E501
    expected_single_nuc = "L:11(nt:501)"
    assert format_frameshift(input_single_nuc) == expected_single_nuc


def test_format_stop_codon():
    # Test case 1: Empty input
    assert not format_stop_codon("[]")

    # Test case 2: Single stop codon
    input_single = '[{"cdsName": "GPC", "codon": 123}]'
    expected_single = "GPC:124"
    assert format_stop_codon(input_single) == expected_single

    # Test case 3: Multiple stop codons
    input_multiple = '[{"cdsName": "GPC", "codon": 123}, {"cdsName": "NP", "codon": 456}]'
    expected_multiple = "GPC:124,NP:457"
    assert format_stop_codon(input_multiple) == expected_multiple

    # Test case 4: Stop codon at position 0
    input_zero = '[{"cdsName": "L", "codon": 0}]'
    expected_zero = "L:1"
    assert format_stop_codon(input_zero) == expected_zero


if __name__ == "__main__":
    pytest.main()
