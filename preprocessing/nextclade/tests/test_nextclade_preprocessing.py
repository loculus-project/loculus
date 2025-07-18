# ruff: noqa: S101


from dataclasses import dataclass
from typing import Literal

import pytest
from Bio import SeqIO
from Bio.Seq import Seq
from factory_methods import (
    ProcessedAlignment,
    ProcessedEntryFactory,
    ProcessingAnnotationTestCase,
    ProcessingTestCase,
    UnprocessedEntryFactory,
    verify_processed_entry,
)

from loculus_preprocessing.config import Config, get_config
from loculus_preprocessing.datatypes import (
    AnnotationSourceType,
    ProcessedEntry,
    ProcessedMetadataValue,
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
    seq = get_consensus_sequence(type)
    if type in {"single", "ebola-sudan"}:
        pos = 458 + 3  # start of second AA in NP gene, convert G to A (AA D to N)
    elif type == "ebola-zaire":
        pos = 10345 + 3  # start of second AA in VP24 gene, convert G to A (AA A to T)
    return str(seq[: pos - 1]) + "A" + str(seq[pos:])


def get_ebola_sudan_aa(nuc: str, gene: Literal["VP35", "NP"], with_deletion: bool = False) -> str:
    if gene == "NP":
        return str(Seq(nuc[(458 - 1) : 2674]).translate(to_stop=False))
    start = 3138 if not with_deletion else 3135
    stop = 4127 if not with_deletion else 4124
    return str(Seq(nuc[(start - 1) : stop]).translate(to_stop=False))


def get_ebola_zaire_aa(nuc: str, gene: Literal["VP24", "L"]) -> str:
    if gene == "VP24":
        return str(Seq(nuc[(10345 - 1) : 11100]).translate())
    return str(Seq(nuc[(11581 - 1) : 18219]).translate())


def get_sequence_with_deletion(
    type: Literal["single"] | Literal["ebola-sudan"] | Literal["ebola-zaire"],
    aligned: bool = False,
) -> str:
    record = get_consensus_sequence(type)
    if type in {"single", "ebola-sudan"}:
        pos = 2674 - 6  # start of second last AA in NP gene, remove H
    elif type == "ebola-zaire":
        pos = 11100 - 6  # start of second last AA in VP24 gene, remove I
    if aligned:
        # If aligned, we need to remove the last two nucleotides of the codon
        return str(record[:pos]) + "---" + str(record[pos + 3 :])
    return str(record[:pos]) + str(record[pos + 3 :])


def get_sequence_with_insertion(
    type: Literal["single"] | Literal["ebola-sudan"] | Literal["ebola-zaire"],
) -> str:
    record = get_consensus_sequence(type)
    if type in {"single", "ebola-sudan"}:
        pos = 2674 - 3  # start of last AA in NP gene
    elif type == "ebola-zaire":
        pos = 11100 - 3  # start of last AA in VP24 gene
    return str(record[:pos]) + "GAC" + str(record[pos:])  # insert D AA


def get_invalid_sequence():
    return "ATGCGTACGTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGC"  # Invalid sequence for testing


@dataclass
class Case:
    name: str
    input_metadata: dict[str, str | None]
    input_sequence: dict[str, str | None]
    processed_alignment: ProcessedAlignment
    expected_metadata: dict[str, ProcessedMetadataValue]
    expected_errors: list[ProcessingAnnotationTestCase] | None = None
    expected_warnings: list[ProcessingAnnotationTestCase] | None = None
    accession_id: str = "000999"

    def create_test_case(self, factory_custom: ProcessedEntryFactory) -> ProcessingTestCase:
        unprocessed_entry = UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict=self.input_metadata,
            accession_id=self.accession_id,
            sequences=self.input_sequence,
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


test_case_definitions = [
    Case(
        name="single segment with mutation",
        input_metadata={},
        input_sequence={"main": get_sequence_with_mutation("single")},
        accession_id="1",
        expected_metadata={
            "completeness": 1.0,
            "totalInsertedNucs": 0,
            "totalSnps": 1,
            "totalDeletedNucs": 0,
            "length": len(get_consensus_sequence("single")),
        },
        expected_errors=[],
        expected_warnings=[],
        processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": get_sequence_with_mutation("single")},
            alignedNucleotideSequences={"main": get_sequence_with_mutation("single")},
            nucleotideInsertions={"main": []},
            alignedAminoAcidSequences={
                "NPEbolaSudan": get_ebola_sudan_aa(get_sequence_with_mutation("single"), "NP"),
                "VP35EbolaSudan": get_ebola_sudan_aa(get_sequence_with_mutation("single"), "VP35"),
            },
            aminoAcidInsertions={},
        ),
    ),
    Case(
        name="single segment with insertion",
        input_metadata={},
        input_sequence={"main": get_sequence_with_insertion("single")},
        accession_id="1",
        expected_metadata={
            "completeness": 1.0,
            "totalInsertedNucs": 3,
            "totalSnps": 0,
            "totalDeletedNucs": 0,
            "length": len(get_sequence_with_insertion("single")),
        },
        expected_errors=[],
        expected_warnings=[],
        processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": get_sequence_with_insertion("single")},
            alignedNucleotideSequences={"main": get_consensus_sequence("single")},
            nucleotideInsertions={"main": ["2671:GAC"]},
            alignedAminoAcidSequences={
                "NPEbolaSudan": get_ebola_sudan_aa(get_consensus_sequence("single"), "NP"),
                "VP35EbolaSudan": get_ebola_sudan_aa(get_consensus_sequence("single"), "VP35"),
            },
            aminoAcidInsertions={"NPEbolaSudan": ["738:D"]},
        ),
    ),
    Case(
        name="single segment with deletion",
        input_metadata={},
        input_sequence={"main": get_sequence_with_deletion("single")},
        accession_id="1",
        expected_metadata={
            "completeness": 1.0,
            "totalInsertedNucs": 0,
            "totalSnps": 0,
            "totalDeletedNucs": 3,
            "length": len(get_consensus_sequence("single")) - 3,
        },
        expected_errors=[],
        expected_warnings=[],
        processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": get_sequence_with_deletion("single")},
            alignedNucleotideSequences={"main": get_sequence_with_deletion("single", aligned=True)},
            nucleotideInsertions={"main": []},
            alignedAminoAcidSequences={
                "NPEbolaSudan": get_ebola_sudan_aa(
                    get_sequence_with_deletion("single", aligned=True), "NP", with_deletion=True
                ),
                "VP35EbolaSudan": get_ebola_sudan_aa(
                    get_sequence_with_deletion("single"), "VP35", with_deletion=True
                ),
            },
            aminoAcidInsertions={},
        ),
    ),
    Case(
        name="single segment with failed alignment",
        input_metadata={},
        input_sequence={"main": get_invalid_sequence()},
        accession_id="1",
        expected_metadata={
            "completeness": None,
            "totalInsertedNucs": None,
            "totalSnps": None,
            "totalDeletedNucs": None,
            "length": 53,
        },
        expected_errors=[
            ProcessingAnnotationTestCase(
                ["alignment"],
                ["alignment"],
                "No segment aligned.",
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
            ),
            ProcessingAnnotationTestCase(
                ["main"],
                ["main"],
                "Nucleotide sequence failed to align",
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
            ),
        ],
        expected_warnings=[],
        processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": get_invalid_sequence()},
            alignedNucleotideSequences={"main": None},
            nucleotideInsertions={"main": []},
            alignedAminoAcidSequences={
                "NPEbolaSudan": None,
                "VP35EbolaSudan": None,
            },
            aminoAcidInsertions={},
        ),
    ),
]


@pytest.fixture(scope="module")
def factory_custom():
    config = get_config(SINGLE_SEGMENT_CONFIG)
    return ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))


def process_single_entry(
    test_case: ProcessingTestCase, config: Config, dataset_dir: str = "temp"
) -> ProcessedEntry:
    result = process_all([test_case.input], dataset_dir, config)
    return result[0]


@pytest.mark.parametrize("test_case_def", test_case_definitions, ids=lambda tc: tc.name)
def test_preprocessing(test_case_def: Case, factory_custom: ProcessedEntryFactory):
    config = get_config(SINGLE_SEGMENT_CONFIG)
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config, EBOLA_SUDAN_DATASET)
    verify_processed_entry(processed_entry, test_case.expected_output, test_case.name)


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
