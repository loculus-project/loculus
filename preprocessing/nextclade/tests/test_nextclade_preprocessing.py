# ruff: noqa: S101


from pathlib import Path
from typing import Literal

import pytest
from Bio import SeqIO
from Bio.Seq import Seq
from factory_methods import (
    Case,
    ProcessedAlignment,
    ProcessedEntryFactory,
    ProcessingAnnotationHelper,
    ProcessingTestCase,
    build_processing_annotations,
    ts_from_ymd,
    verify_processed_entry,
)

from loculus_preprocessing.config import AlignmentRequirement, Config, get_config
from loculus_preprocessing.datatypes import (
    AnnotationSourceType,
    SegmentClassificationMethod,
    SubmissionData,
    UnprocessedData,
    UnprocessedEntry,
)
from loculus_preprocessing.embl import create_flatfile, reformat_authors_from_loculus_to_embl_style
from loculus_preprocessing.prepro import process_all
from loculus_preprocessing.processing_functions import (
    format_frameshift,
    format_stop_codon,
    process_mutations_from_clade_founder,
    process_phenotype_values,
)

# Config file used for testing
SINGLE_SEGMENT_CONFIG = "tests/single_segment_config.yaml"
MULTI_SEGMENT_CONFIG = "tests/multi_segment_config.yaml"
MULTI_SEGMENT_CONFIG_UNALIGNED = "tests/multi_segment_config_unaligned.yaml"
MULTI_REFERENCE_CONFIG = "tests/multi_reference_config.yaml"
MULTI_SEGMENT_MULTI_REFERENCE_CONFIG = "tests/multi_segment_multi_reference.yaml"
EMBL_METADATA = "tests/embl_required_metadata.yaml"

EBOLA_SUDAN_DATASET = "tests/ebola-dataset/ebola-sudan"
EBOLA_ZAIRE_DATASET = "tests/ebola-dataset/ebola-zaire"
MULTI_EBOLA_DATASET = "tests/ebola-multipath-dataset"
CCHF_DATASET = "tests/cchfv"

SINGLE_SEGMENT_EMBL = "tests/flatfiles/single_segment.embl"
MUTATIONS_FROM_FOUNDER_CLADE = "tests/mutationsFromFounderClade.json"


def consensus_sequence(
    type: Literal["single"]
    | Literal["ebola-sudan"]
    | Literal["ebola-zaire"]
    | Literal["cchf-L"]
    | Literal["cchf-S-1and6"]
    | Literal["cchf-S-2to5"],
) -> str:
    match type:
        case "single":
            dataset_path = EBOLA_SUDAN_DATASET + "/main"
        case "ebola-sudan":
            dataset_path = EBOLA_SUDAN_DATASET + "/main"
        case "ebola-zaire":
            dataset_path = EBOLA_ZAIRE_DATASET + "/main"
        case "cchf-L":
            dataset_path = CCHF_DATASET + "/L"
        case "cchf-S-1and6":
            dataset_path = CCHF_DATASET + "/S-1and6"
        case "cchf-S-2to5":
            dataset_path = CCHF_DATASET + "/S-2to5"
    return str(
        next(
            SeqIO.parse(
                dataset_path + "/reference.fasta",
                "fasta",
            )
        ).seq
    )


def sequence_with_mutation(
    type: Literal["single"] | Literal["ebola-sudan"] | Literal["ebola-zaire"],
) -> str:
    seq = consensus_sequence(type)
    if type in {"single", "ebola-sudan"}:
        pos = 458 + 3  # start of second AA in NP gene, convert G to A (AA D to N)
    elif type == "ebola-zaire":
        pos = 10345 + 3  # start of second AA in VP24 gene, convert G to A (AA A to T)
    return str(seq[: pos - 1]) + "A" + str(seq[pos:])


def ebola_sudan_aa(nuc: str, gene: Literal["VP35", "NP"]) -> str:
    match gene:
        case "NP":
            return str(Seq(nuc[(458 - 1) : 2674]).translate(to_stop=False))
        case "VP35":
            return str(Seq(nuc[(3138 - 1) : 4127]).translate(to_stop=False))
        case _:
            msg = f"Unknown gene: {gene}"
            raise ValueError(msg)


def ebola_zaire_aa(nuc: str, gene: Literal["VP24", "L"]) -> str:
    match gene:
        case "VP24":
            return str(Seq(nuc[(10345 - 1) : 11100]).translate(to_stop=False))
        case "L":
            return str(Seq(nuc[(11581 - 1) : 18219]).translate(to_stop=False))
        case _:
            msg = f"Unknown gene: {gene}"
            raise ValueError(msg)


def cchf_s_aa(nuc: str, subtype: Literal["1and6", "2to5"]) -> str:
    match subtype:
        case "1and6":
            return str(Seq(nuc[(55 - 1) : 1503]).translate(to_stop=False))
        case "2to5":
            return str(Seq(nuc[(56 - 1) : 1504]).translate(to_stop=False))
        case _:
            msg = f"Unknown subtype: {subtype}"
            raise ValueError(msg)


def cchf_l_aa(nuc: str) -> str:
    return str(Seq(nuc[(77 - 1) : 11914]).translate(to_stop=False))


def sequence_with_deletion(
    type: Literal["single"] | Literal["ebola-sudan"] | Literal["ebola-zaire"],
    aligned: bool = False,
) -> str:
    record = consensus_sequence(type)
    if type in {"single", "ebola-sudan"}:
        pos = 2674 - 6  # start of second last AA in NP gene, remove H
    elif type == "ebola-zaire":
        pos = 11100 - 6  # start of second last AA in VP24 gene, remove I
    if aligned:
        # If aligned, we need to remove the last two nucleotides of the codon
        return str(record[:pos]) + "---" + str(record[pos + 3 :])
    return str(record[:pos]) + str(record[pos + 3 :])


def sequence_with_insertion(
    type: Literal["single"] | Literal["ebola-sudan"] | Literal["ebola-zaire"],
) -> str:
    record = consensus_sequence(type)
    if type in {"single", "ebola-sudan"}:
        pos = 2674 - 3  # start of last AA in NP gene
    elif type == "ebola-zaire":
        pos = 11100 - 3  # start of last AA in VP24 gene
    return str(record[:pos]) + "GAC" + str(record[pos:])  # insert D AA


def invalid_sequence() -> str:
    return "ATGCGTACGTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGC"  # Invalid sequence for testing


single_segment_case_definitions = [
    Case(
        name="with mutation",
        input_metadata={},
        input_sequence={"fastaHeader": sequence_with_mutation("single")},
        accession_id="1",
        expected_metadata={
            "completeness": 1.0,
            "totalInsertedNucs": 0,
            "totalSnps": 1,
            "totalDeletedNucs": 0,
            "length": len(consensus_sequence("single")),
            "nonExistentField": "None",
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": sequence_with_mutation("single")},
            alignedNucleotideSequences={"main": sequence_with_mutation("single")},
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "NPEbolaSudan": ebola_sudan_aa(sequence_with_mutation("single"), "NP"),
                "VP35EbolaSudan": ebola_sudan_aa(sequence_with_mutation("single"), "VP35"),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"main": "fastaHeader"},
        ),
    ),
    Case(
        name="with insertion",
        input_metadata={},
        input_sequence={"fastaHeader": sequence_with_insertion("single")},
        accession_id="1",
        expected_metadata={
            "completeness": 1.0,
            "totalInsertedNucs": 3,
            "totalSnps": 0,
            "totalDeletedNucs": 0,
            "length": len(sequence_with_insertion("single")),
            "nonExistentField": "None",
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": sequence_with_insertion("single")},
            alignedNucleotideSequences={"main": consensus_sequence("single")},
            nucleotideInsertions={"main": ["2671:GAC"]},
            alignedAminoAcidSequences={
                "NPEbolaSudan": ebola_sudan_aa(consensus_sequence("single"), "NP"),
                "VP35EbolaSudan": ebola_sudan_aa(consensus_sequence("single"), "VP35"),
            },
            aminoAcidInsertions={"NPEbolaSudan": ["738:D"]},
            sequenceNameToFastaId={"main": "fastaHeader"},
        ),
    ),
    Case(
        name="with deletion",
        input_metadata={},
        input_sequence={"fastaHeader": sequence_with_deletion("single")},
        accession_id="1",
        expected_metadata={
            "completeness": 1.0,
            "totalInsertedNucs": 0,
            "totalSnps": 0,
            "totalDeletedNucs": 3,
            "length": len(consensus_sequence("single")) - 3,
            "nonExistentField": "None",
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": sequence_with_deletion("single")},
            alignedNucleotideSequences={"main": sequence_with_deletion("single", aligned=True)},
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "NPEbolaSudan": ebola_sudan_aa(
                    sequence_with_deletion("single", aligned=True), "NP"
                ),
                "VP35EbolaSudan": ebola_sudan_aa(
                    sequence_with_deletion("single", aligned=True), "VP35"
                ),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"main": "fastaHeader"},
        ),
    ),
]

single_segment_failed_case_definitions = [
    Case(
        name="with failed alignment",
        input_metadata={},
        input_sequence={"fastaHeader": invalid_sequence()},
        accession_id="1",
        expected_metadata={
            "completeness": None,
            "totalInsertedNucs": None,
            "totalSnps": None,
            "totalDeletedNucs": None,
            "length": len(invalid_sequence()),
            "nonExistentField": None,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["main"],
                    ["main"],
                    "Nucleotide sequence failed to align",
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                ),
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": invalid_sequence()},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={"main": "fastaHeader"},
        ),
    ),
]

single_segment_failed_with_require_sort_case_definitions = [
    Case(
        name="with failed alignment",
        input_metadata={},
        input_sequence={"fastaHeader": invalid_sequence()},
        accession_id="1",
        expected_metadata={
            "completeness": None,
            "totalInsertedNucs": None,
            "totalSnps": None,
            "totalDeletedNucs": None,
            "length": len(invalid_sequence()),
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["main"],
                    ["main"],
                    "Nucleotide sequence failed to align",
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                ),
            ]
        ),
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence does not appear to match reference, per `nextclade sort`. "
                    "Double check you are submitting to the correct organism.",
                ),
            ]
        ),
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": invalid_sequence()},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={"main": "fastaHeader"},
        ),
    ),
    Case(
        name="with better alignment",
        input_metadata={},
        input_sequence={"fastaHeader": consensus_sequence("ebola-zaire")},
        accession_id="1",
        expected_metadata={
            "completeness": None,
            "totalInsertedNucs": None,
            "totalSnps": None,
            "totalDeletedNucs": None,
            "length": len(consensus_sequence("ebola-zaire")),
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["main"],
                    ["main"],
                    "Nucleotide sequence failed to align",
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                ),
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence best matches ebola-zaire, a different organism than the one "
                    "you are submitting to: ebola-sudan-test. It is therefore not possible "
                    "to release. Contact the administrator if you think this message is an error.",
                ),
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"main": consensus_sequence("ebola-zaire")},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={"main": "fastaHeader"},
        ),
    ),
]

multi_segment_case_definitions = [
    Case(
        name="with mutation",
        input_metadata={},
        input_sequence={
            "fastaHeader1": sequence_with_mutation("ebola-sudan"),
            "fastaHeader2": sequence_with_mutation("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": 0,
            "totalSnps_ebola-sudan": 1,
            "totalDeletedNucs_ebola-sudan": 0,
            "length_ebola-sudan": len(consensus_sequence("ebola-sudan")),
            "totalInsertedNucs_ebola-zaire": 0,
            "totalSnps_ebola-zaire": 1,
            "totalDeletedNucs_ebola-zaire": 0,
            "length_ebola-zaire": len(consensus_sequence("ebola-zaire")),
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-sudan": sequence_with_mutation("ebola-sudan"),
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            alignedNucleotideSequences={
                "ebola-sudan": sequence_with_mutation("ebola-sudan"),
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "NPEbolaSudan": ebola_sudan_aa(sequence_with_mutation("single"), "NP"),
                "VP35EbolaSudan": ebola_sudan_aa(sequence_with_mutation("single"), "VP35"),
                "VP24EbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "VP24"),
                "LEbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "L"),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={
                "ebola-sudan": "fastaHeader1",
                "ebola-zaire": "fastaHeader2",
            },
        ),
    ),
    Case(
        name="with insertion",
        input_metadata={},
        input_sequence={
            "fastaHeader1": sequence_with_insertion("ebola-sudan"),
            "fastaHeader2": sequence_with_insertion("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": 3,
            "totalSnps_ebola-sudan": 0,
            "totalDeletedNucs_ebola-sudan": 0,
            "length_ebola-sudan": len(sequence_with_insertion("ebola-sudan")),
            "totalInsertedNucs_ebola-zaire": 3,
            "totalSnps_ebola-zaire": 0,
            "totalDeletedNucs_ebola-zaire": 0,
            "length_ebola-zaire": len(sequence_with_insertion("ebola-zaire")),
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-sudan": sequence_with_insertion("ebola-sudan"),
                "ebola-zaire": sequence_with_insertion("ebola-zaire"),
            },
            alignedNucleotideSequences={
                "ebola-sudan": consensus_sequence("ebola-sudan"),
                "ebola-zaire": consensus_sequence("ebola-zaire"),
            },
            nucleotideInsertions={
                "ebola-sudan": ["2671:GAC"],
                "ebola-zaire": ["11097:GAC"],
            },
            alignedAminoAcidSequences={
                "NPEbolaSudan": ebola_sudan_aa(consensus_sequence("single"), "NP"),
                "VP35EbolaSudan": ebola_sudan_aa(consensus_sequence("single"), "VP35"),
                "VP24EbolaZaire": ebola_zaire_aa(consensus_sequence("ebola-zaire"), "VP24"),
                "LEbolaZaire": ebola_zaire_aa(consensus_sequence("ebola-zaire"), "L"),
            },
            aminoAcidInsertions={
                "NPEbolaSudan": ["738:D"],
                "VP24EbolaZaire": ["251:D"],
            },
            sequenceNameToFastaId={
                "ebola-sudan": "fastaHeader1",
                "ebola-zaire": "fastaHeader2",
            },
        ),
    ),
    Case(
        name="with deletion",
        input_metadata={},
        input_sequence={
            "fastaHeader1": sequence_with_deletion("ebola-sudan"),
            "fastaHeader2": sequence_with_deletion("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": 0,
            "totalSnps_ebola-sudan": 0,
            "totalDeletedNucs_ebola-sudan": 3,
            "length_ebola-sudan": len(sequence_with_deletion("ebola-sudan")),
            "totalInsertedNucs_ebola-zaire": 0,
            "totalSnps_ebola-zaire": 0,
            "totalDeletedNucs_ebola-zaire": 3,
            "length_ebola-zaire": len(sequence_with_deletion("ebola-zaire")),
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-sudan": sequence_with_deletion("ebola-sudan"),
                "ebola-zaire": sequence_with_deletion("ebola-zaire"),
            },
            alignedNucleotideSequences={
                "ebola-sudan": sequence_with_deletion("ebola-sudan", aligned=True),
                "ebola-zaire": sequence_with_deletion("ebola-zaire", aligned=True),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "NPEbolaSudan": ebola_sudan_aa(
                    sequence_with_deletion("ebola-sudan", aligned=True),
                    "NP",
                ),
                "VP35EbolaSudan": ebola_sudan_aa(
                    sequence_with_deletion("ebola-sudan", aligned=True), "VP35"
                ),
                "VP24EbolaZaire": ebola_zaire_aa(
                    sequence_with_deletion("ebola-zaire", aligned=True),
                    "VP24",
                ),
                "LEbolaZaire": ebola_zaire_aa(
                    sequence_with_deletion("ebola-zaire", aligned=True), "L"
                ),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={
                "ebola-sudan": "fastaHeader1",
                "ebola-zaire": "fastaHeader2",
            },
        ),
    ),
    Case(
        name="with one succeeded and one not uploaded",
        input_metadata={},
        input_sequence={
            "fastaHeader2": sequence_with_mutation("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": 0,
            "totalSnps_ebola-zaire": 1,
            "totalDeletedNucs_ebola-zaire": 0,
            "length_ebola-zaire": len(consensus_sequence("ebola-zaire")),
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            alignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "VP24EbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "VP24"),
                "LEbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "L"),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"ebola-zaire": "fastaHeader2"},
        ),
    ),
]

multi_segment_case_definitions_all_requirement_align_classification = [
    Case(
        name="with one failed alignment, one not uploaded",
        input_metadata={},
        input_sequence={"fastaHeader1": invalid_sequence()},
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": None,
            "totalSnps_ebola-zaire": None,
            "totalDeletedNucs_ebola-zaire": None,
            "length_ebola-zaire": 0,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence with fasta id fastaHeader1 does not match any reference for "
                    "organism: multi-ebola-test per `nextclade align`. "
                    "Double check you are submitting to the correct organism."
                )
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={},
        ),
    ),
    Case(
        name="with one failed alignment, one succeeded",
        input_metadata={},
        input_sequence={
            "fastaHeader1": invalid_sequence(),
            "fastaHeader2": sequence_with_mutation("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": 0,
            "totalSnps_ebola-zaire": 1,
            "totalDeletedNucs_ebola-zaire": 0,
            "length_ebola-zaire": len(consensus_sequence("ebola-zaire")),
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence with fasta id fastaHeader1 does not match any reference for "
                    "organism: multi-ebola-test per `nextclade align`. "
                    "Double check you are submitting to the correct organism."
                )
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            alignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "VP24EbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "VP24"),
                "LEbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "L"),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"ebola-zaire": "fastaHeader2"},
        ),
    ),
]

multi_segment_case_definitions_all_requirement_sort_classification = [
    Case(
        name="with one failed alignment, one not uploaded",
        input_metadata={},
        input_sequence={"fastaHeader1": invalid_sequence()},
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": None,
            "totalSnps_ebola-zaire": None,
            "totalDeletedNucs_ebola-zaire": None,
            "length_ebola-zaire": 0,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence with fasta id fastaHeader1 does not match any reference"
                    " for organism: multi-ebola-test per `nextclade sort`. "
                    "Double check you are submitting to the correct organism.",
                )
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={},
        ),
    ),
    Case(
        name="with one failed alignment, one succeeded",
        input_metadata={},
        input_sequence={
            "fastaHeader1": invalid_sequence(),
            "fastaHeader2": sequence_with_mutation("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": 0,
            "totalSnps_ebola-zaire": 1,
            "totalDeletedNucs_ebola-zaire": 0,
            "length_ebola-zaire": len(consensus_sequence("ebola-zaire")),
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence with fasta id fastaHeader1 does not match any reference "
                    "for organism: multi-ebola-test per `nextclade sort`. "
                    "Double check you are submitting to the correct organism."
                )
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            alignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "VP24EbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "VP24"),
                "LEbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "L"),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"ebola-zaire": "fastaHeader2"},
        ),
    ),
]

multi_segment_case_definitions_any_requirement_sort_classification = [
    Case(
        name="with one failed alignment, one not uploaded",
        input_metadata={},
        input_sequence={"fastaHeader1": invalid_sequence()},
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": None,
            "totalSnps_ebola-zaire": None,
            "totalDeletedNucs_ebola-zaire": None,
            "length_ebola-zaire": 0,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "No sequence data could be classified - "
                    "check you are submitting to the correct organism.",
                )
            ]
        ),
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence with fasta id fastaHeader1 does not match any reference "
                    "for organism: multi-ebola-test per `nextclade sort`. "
                    "Double check you are submitting to the correct organism.",
                )
            ]
        ),
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={},
        ),
    ),
    Case(
        name="with one failed alignment, one succeeded",
        input_metadata={},
        input_sequence={
            "fastaHeader1": invalid_sequence(),
            "fastaHeader2": sequence_with_mutation("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": 0,
            "totalSnps_ebola-zaire": 1,
            "totalDeletedNucs_ebola-zaire": 0,
            "length_ebola-zaire": len(consensus_sequence("ebola-zaire")),
        },
        expected_errors=[],
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence with fasta id fastaHeader1 does not match any reference"
                    " for organism: multi-ebola-test per `nextclade sort`. "
                    "Double check you are submitting to the correct organism.",
                )
            ]
        ),
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            alignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "VP24EbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "VP24"),
                "LEbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "L"),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"ebola-zaire": "fastaHeader2"},
        ),
    ),
]

multi_segment_case_definitions_any_requirement_align_classification = [
    Case(
        name="with one failed alignment, one not uploaded",
        input_metadata={},
        input_sequence={"fastaHeader1": invalid_sequence()},
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": None,
            "totalSnps_ebola-zaire": None,
            "totalDeletedNucs_ebola-zaire": None,
            "length_ebola-zaire": 0,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "No sequence data could be classified - "
                    "check you are submitting to the correct organism.",
                )
            ]
        ),
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence with fasta id fastaHeader1 does not match any reference for "
                    "organism: multi-ebola-test per `nextclade align`. "
                    "Double check you are submitting to the correct organism.",
                )
            ]
        ),
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={},
        ),
    ),
    Case(
        name="with one failed alignment, one succeeded",
        input_metadata={},
        input_sequence={
            "fastaHeader1": invalid_sequence(),
            "fastaHeader2": sequence_with_mutation("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": 0,
            "totalSnps_ebola-zaire": 1,
            "totalDeletedNucs_ebola-zaire": 0,
            "length_ebola-zaire": len(consensus_sequence("ebola-zaire")),
        },
        expected_errors=[],
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Sequence with fasta id fastaHeader1 does not match any reference for "
                    "organism: multi-ebola-test per `nextclade align`. "
                    "Double check you are submitting to the correct organism.",
                )
            ]
        ),
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            alignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "VP24EbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "VP24"),
                "LEbolaZaire": ebola_zaire_aa(sequence_with_mutation("ebola-zaire"), "L"),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"ebola-zaire": "fastaHeader2"},
        ),
    ),
]


segment_validation_tests_single_segment = [
    Case(
        name="do not accept multiple segments for single segment",
        input_metadata={},
        input_sequence={
            "fastaHeader1": sequence_with_mutation("single"),
            "fastaHeader2": sequence_with_mutation("single"),
        },
        accession_id="2",
        expected_metadata={"length": 0},
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Multiple sequences: ['fastaHeader1', 'fastaHeader2'] found in the"
                    " input data, but organism: ebola-sudan-test is single-segmented. "
                    "Please check that your metadata and sequences are annotated correctly."
                    "Each metadata entry should have a single corresponding fasta sequence "
                    "entry with the same submissionId.",
                ),
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={},
        ),
    ),
]

segment_validation_tests_multi_segments = [
    Case(
        name="don't allow duplicated of the same segment",
        input_metadata={},
        input_sequence={
            "ebola-sudan": sequence_with_mutation("ebola-sudan"),
            "duplicate_ebola-sudan": sequence_with_mutation("ebola-sudan"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_ebola-sudan": None,
            "totalSnps_ebola-sudan": None,
            "totalDeletedNucs_ebola-sudan": None,
            "length_ebola-sudan": 0,
            "totalInsertedNucs_ebola-zaire": None,
            "totalSnps_ebola-zaire": None,
            "totalDeletedNucs_ebola-zaire": None,
            "length_ebola-zaire": 0,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Multiple sequences (with fasta ids: ebola-sudan, duplicate_ebola-sudan) "
                    "align to ebola-sudan - only one entry is allowed.",
                ),
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
        ),
    ),
]

multi_segment_case_definitions_none_requirement = [
    Case(
        name="accept any prefix for multi-segment",
        input_metadata={},
        input_sequence={
            "prefix_ebola-sudan": sequence_with_mutation("ebola-sudan"),
            "other_prefix_ebola-zaire": sequence_with_mutation("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "length_ebola-sudan": len(consensus_sequence("ebola-sudan")),
            "length_ebola-zaire": len(consensus_sequence("ebola-zaire")),
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-sudan": sequence_with_mutation("ebola-sudan"),
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={
                "ebola-sudan": "prefix_ebola-sudan",
                "ebola-zaire": "other_prefix_ebola-zaire",
            },
        ),
    ),
    Case(
        name="don't allow multiple segments with the same name",
        input_metadata={},
        input_sequence={
            "ebola-sudan": invalid_sequence(),
            "duplicate_ebola-sudan": invalid_sequence(),
        },
        accession_id="1",
        expected_metadata={
            "length_ebola-sudan": 0,
            "length_ebola-zaire": 0,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Found multiple sequences with the same segment name: ebola-sudan. "
                    "Each metadata entry can have multiple corresponding fasta sequence "
                    "entries with format <submissionId>_<segmentName>.",
                )
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={},
        ),
    ),
    Case(
        name="don't allow unknown segments",
        input_metadata={},
        input_sequence={
            "ebola-sudan": sequence_with_mutation("ebola-sudan"),
            "unknown_segment": invalid_sequence(),
        },
        accession_id="2",
        expected_metadata={
            "length_ebola-sudan": len(consensus_sequence("ebola-sudan")),
            "length_ebola-zaire": 0,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Found sequences in the input data with segments that are not in the config: "
                    "unknown_segment. Each metadata entry can have multiple corresponding fasta "
                    "sequence entries with format <submissionId>_<segmentName> valid segments are: "
                    "ebola-sudan, ebola-zaire.",
                )
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={"ebola-sudan": sequence_with_mutation("ebola-sudan")},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={"ebola-sudan": "ebola-sudan"},
        ),
    ),
]


def process_single_entry(
    test_case: ProcessingTestCase, config: Config, dataset_dir: str = "temp"
) -> SubmissionData:
    result = process_all([test_case.input], dataset_dir, config)
    return result[0]


@pytest.mark.parametrize(
    "test_case_def",
    single_segment_case_definitions
    + segment_validation_tests_single_segment
    + single_segment_failed_case_definitions,
    ids=lambda tc: f"single segment {tc.name}",
)
def test_preprocessing_single_segment(test_case_def: Case):
    config = get_config(SINGLE_SEGMENT_CONFIG, ignore_args=True)
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config, EBOLA_SUDAN_DATASET)
    verify_processed_entry(
        processed_entry.processed_entry, test_case.expected_output, test_case.name
    )


@pytest.mark.parametrize(
    "test_case_def",
    single_segment_case_definitions
    + segment_validation_tests_single_segment
    + single_segment_failed_with_require_sort_case_definitions,
    ids=lambda tc: f"single segment with require_nextclade_sort_match {tc.name}",
)
def test_preprocessing_single_segment_with_require_nextclade_sort_match(test_case_def: Case):
    config = get_config(SINGLE_SEGMENT_CONFIG, ignore_args=True)
    config.require_nextclade_sort_match = True
    config.minimizer_url = "TEST"  # will use minimizer in EBOLA_SUDAN_DATASET
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config, EBOLA_SUDAN_DATASET)
    verify_processed_entry(
        processed_entry.processed_entry, test_case.expected_output, test_case.name
    )


@pytest.mark.parametrize(
    "test_case_def",
    multi_segment_case_definitions
    + segment_validation_tests_multi_segments
    + multi_segment_case_definitions_all_requirement_sort_classification,
    ids=lambda tc: f"multi segment, segment classification with sort {tc.name}",
)
def test_preprocessing_multi_segment_all_requirement_sort_classification(test_case_def: Case):
    config = get_config(MULTI_SEGMENT_CONFIG, ignore_args=True)
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config, MULTI_EBOLA_DATASET)
    verify_processed_entry(
        processed_entry.processed_entry, test_case.expected_output, test_case.name
    )


@pytest.mark.parametrize(
    "test_case_def",
    multi_segment_case_definitions
    + segment_validation_tests_multi_segments
    + multi_segment_case_definitions_all_requirement_align_classification,
    ids=lambda tc: f"multi segment, segment classification with align {tc.name}",
)
def test_preprocessing_multi_segment_all_requirement_align_classification(test_case_def: Case):
    config = get_config(MULTI_SEGMENT_CONFIG, ignore_args=True)
    config.segment_classification_method = SegmentClassificationMethod.ALIGN
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config, MULTI_EBOLA_DATASET)
    verify_processed_entry(
        processed_entry.processed_entry, test_case.expected_output, test_case.name
    )


@pytest.mark.parametrize(
    "test_case_def",
    multi_segment_case_definitions
    + segment_validation_tests_multi_segments
    + multi_segment_case_definitions_any_requirement_sort_classification,
    ids=lambda tc: f"multi segment, segment classification with sort {tc.name}",
)
def test_preprocessing_multi_segment_any_requirement_sort_classification(test_case_def: Case):
    config = get_config(MULTI_SEGMENT_CONFIG, ignore_args=True)
    config.alignment_requirement = AlignmentRequirement.ANY
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config, MULTI_EBOLA_DATASET)
    verify_processed_entry(
        processed_entry.processed_entry, test_case.expected_output, test_case.name
    )


@pytest.mark.parametrize(
    "test_case_def",
    multi_segment_case_definitions
    + segment_validation_tests_multi_segments
    + multi_segment_case_definitions_any_requirement_align_classification,
    ids=lambda tc: f"multi segment, segment classification with align {tc.name}",
)
def test_preprocessing_multi_segment_any_requirement_align_classification(test_case_def: Case):
    config = get_config(MULTI_SEGMENT_CONFIG, ignore_args=True)
    config.alignment_requirement = AlignmentRequirement.ANY
    config.segment_classification_method = SegmentClassificationMethod.ALIGN
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config, MULTI_EBOLA_DATASET)
    verify_processed_entry(
        processed_entry.processed_entry, test_case.expected_output, test_case.name
    )


@pytest.mark.parametrize(
    "test_case_def",
    multi_segment_case_definitions_none_requirement,
    ids=lambda tc: f"multi segment not aligned {tc.name}",
)
def test_preprocessing_multi_segment_none_requirement(test_case_def: Case):
    config = get_config(MULTI_SEGMENT_CONFIG_UNALIGNED, ignore_args=True)
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config)
    verify_processed_entry(
        processed_entry.processed_entry, test_case.expected_output, test_case.name
    )


def test_preprocessing_without_metadata() -> None:
    config = get_config(MULTI_SEGMENT_CONFIG, ignore_args=True)
    sequence_entry_data = UnprocessedEntry(
        accessionVersion="LOC_01.1",
        data=UnprocessedData(
            group_id=2,
            submitter="test_submitter",
            submittedAt=ts_from_ymd(2021, 12, 15),
            metadata={},
            unalignedNucleotideSequences={
                "ebola-sudan": sequence_with_mutation("ebola-sudan"),
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
        ),
    )

    config.processing_spec = {}

    result = process_all([sequence_entry_data], MULTI_EBOLA_DATASET, config)
    processed_entry = result[0].processed_entry

    assert processed_entry.errors == []
    assert processed_entry.warnings == []
    assert processed_entry.data.metadata == {}


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


def test_process_phenotype_values():
    assert process_phenotype_values("[]", {"name": "NAI"}).datum is None
    assert (
        process_phenotype_values(
            '[{"name": "NAI","cds": "NA","value": 0.0}, {"name": "Other","cds": "NA","value": 1.0}]',
            {"name": "NAI"},
        ).datum
        == "0.0"
    )
    assert (
        process_phenotype_values(
            '[{"name": "NAI","cds": "NA","value": None}, {"name": "Other","cds": "NA","value": 1.0}]',
            {"name": "NAI"},
        ).datum
        is None
    )
    assert process_phenotype_values('[{"name": "NAI","cds": "NA","value": 0.0}]', {}).datum is None
    invalid = process_phenotype_values("Malformed JSON", {"name": "NAI"})
    assert invalid.datum is None
    assert "Was unable to process phenotype values" in invalid.errors[0].message


def test_reformat_authors_from_loculus_to_embl_style():
    authors = "Xi,L.;Smith, Anna Maria; Perez Gonzalez, Anthony J.;Doe,;von Doe, John"
    result = reformat_authors_from_loculus_to_embl_style(authors)
    desired_result = "Xi L., Smith A.M., Perez Gonzalez A.J., Doe, von Doe J."
    assert result == desired_result

    extended_latin_authors = "Pérez, José; Bailley, François; Møller, Anäis; Wałęsa, Lech"
    result_extended = reformat_authors_from_loculus_to_embl_style(extended_latin_authors)
    desired_result_extended = "Perez J., Bailley F., Moller A., Walesa L."
    assert result_extended == desired_result_extended


def test_process_clade_founder_values():
    json_string = Path(MUTATIONS_FROM_FOUNDER_CLADE).read_text(encoding="utf-8")
    assert (
        process_mutations_from_clade_founder(json_string, {}).datum
        == "HA1:N63K HA1:F79V HA1:S144N HA1:N158D HA1:I160K HA1:T328A"
    )


def test_create_flatfile():
    config = get_config(SINGLE_SEGMENT_CONFIG, ignore_args=True)
    embl_fields = get_config(EMBL_METADATA, ignore_args=True).processing_spec
    config.processing_spec.update(embl_fields)
    config.create_embl_file = True
    sequence_entry_data = UnprocessedEntry(
        accessionVersion="LOC_01.1",
        data=UnprocessedData(
            submitter="test_submitter",
            group_id=2,
            submittedAt=ts_from_ymd(2021, 12, 15),
            metadata={
                "sampleCollectionDate": "2024-01-01",
                "geoLocCountry": "Netherlands",
                "geoLocAdmin1": "North Holland",
                "geoLocCity": "Amsterdam",
                "authors": "Smith, Doe A;",
            },
            unalignedNucleotideSequences={"main": sequence_with_mutation("single")},
        ),
    )

    result = process_all([sequence_entry_data], EBOLA_SUDAN_DATASET, config)

    embl_str = create_flatfile(config, result[0])
    expected_embl = Path(SINGLE_SEGMENT_EMBL).read_text(encoding="utf-8")
    assert embl_str == expected_embl


multi_reference_cases = [
    Case(
        name="with only one reference uploaded",
        input_metadata={},
        input_sequence={
            "ebola-zaire": sequence_with_mutation("ebola-zaire"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs": 0,
            "totalSnps": 1,
            "length": len(consensus_sequence("ebola-zaire")),
            "subtype": "ebola-zaire",
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            alignedNucleotideSequences={
                "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "VP24EbolaZaire-ebola-zaire": ebola_zaire_aa(
                    sequence_with_mutation("ebola-zaire"), "VP24"
                ),
                "LEbolaZaire-ebola-zaire": ebola_zaire_aa(
                    sequence_with_mutation("ebola-zaire"), "L"
                ),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"ebola-zaire": "ebola-zaire"},
        ),
    ),
    Case(
        name="with both references uploaded should fail",
        input_metadata={},
        input_sequence={
            "ebola-zaire": sequence_with_mutation("ebola-zaire"),
            "ebola-sudan": sequence_with_mutation("ebola-sudan"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs": None,
            "totalSnps": None,
            "length": 0,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Multiple sequences (with fasta ids: ebola-zaire, ebola-sudan) align to main"
                    " - only one entry is allowed.",
                ),
                ProcessingAnnotationHelper(
                    ["ASSIGNED_REFERENCE"],
                    ["subtype"],
                    "Metadata field subtype is required.",
                ),
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={},
        ),
    ),
]


@pytest.mark.parametrize(
    "test_case_def",
    multi_reference_cases,
    ids=lambda tc: f"single segment, multi reference {tc.name}",
)
def test_preprocessing_multi_reference(test_case_def: Case):
    config = get_config(MULTI_REFERENCE_CONFIG, ignore_args=True)
    config.alignment_requirement = AlignmentRequirement.ANY
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config, MULTI_EBOLA_DATASET)
    verify_processed_entry(
        processed_entry.processed_entry, test_case.expected_output, test_case.name
    )


multi_segment_multi_reference_cases = [
    Case(
        name="with only one reference of one segment uploaded",
        input_metadata={},
        input_sequence={
            "seg1": consensus_sequence("cchf-S-1and6"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_S": 0,
            "totalSnps_S": 0,
            "length_S": len(consensus_sequence("cchf-S-1and6")),
            "subtype_S": "1and6",
            "totalInsertedNucs_L": None,
            "totalSnps_L": None,
            "length_L": 0,
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "S-1and6": consensus_sequence("cchf-S-1and6"),
            },
            alignedNucleotideSequences={
                "S-1and6": consensus_sequence("cchf-S-1and6"),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "NP-1and6": cchf_s_aa(consensus_sequence("cchf-S-1and6"), "1and6"),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"S-1and6": "seg1"},
        ),
    ),
    Case(
        name="with one reference of each segment uploaded",
        input_metadata={},
        input_sequence={
            "seg1": consensus_sequence("cchf-S-1and6"),
            "seg2": consensus_sequence("cchf-L"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_S": 0,
            "totalSnps_S": 0,
            "length_S": len(consensus_sequence("cchf-S-1and6")),
            "length_L": len(consensus_sequence("cchf-L")),
            "subtype_S": "1and6",
            "totalInsertedNucs_L": 0,
            "totalSnps_L": 0,
        },
        expected_errors=[],
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={
                "S-1and6": consensus_sequence("cchf-S-1and6"),
                "L": consensus_sequence("cchf-L"),
            },
            alignedNucleotideSequences={
                "S-1and6": consensus_sequence("cchf-S-1and6"),
                "L": consensus_sequence("cchf-L"),
            },
            nucleotideInsertions={},
            alignedAminoAcidSequences={
                "NP-1and6": cchf_s_aa(consensus_sequence("cchf-S-1and6"), "1and6"),
                "RdRp": cchf_l_aa(consensus_sequence("cchf-L")),
            },
            aminoAcidInsertions={},
            sequenceNameToFastaId={"S-1and6": "seg1", "L": "seg2"},
        ),
    ),
    Case(
        name="with multiple references of same segment uploaded should fail",
        input_metadata={},
        input_sequence={
            "seg1": consensus_sequence("cchf-S-1and6"),
            "seg2": consensus_sequence("cchf-S-2to5"),
        },
        accession_id="1",
        expected_metadata={
            "totalInsertedNucs_S": None,
            "totalSnps_S": None,
            "length_S": 0,
            "totalInsertedNucs_L": None,
            "totalSnps_L": None,
            "length_L": 0,
            "subtype_S": None,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper.sequence_annotation_helper(
                    "Multiple sequences (with fasta ids: seg1, seg2) align to S"
                    " - only one entry is allowed.",
                ),
                ProcessingAnnotationHelper(
                    ["ASSIGNED_REFERENCE"],
                    ["subtype_S"],
                    "Metadata field subtype_S is required.",
                ),
            ]
        ),
        expected_warnings=[],
        expected_processed_alignment=ProcessedAlignment(
            unalignedNucleotideSequences={},
            alignedNucleotideSequences={},
            nucleotideInsertions={},
            alignedAminoAcidSequences={},
            aminoAcidInsertions={},
            sequenceNameToFastaId={},
        ),
    ),
]


@pytest.mark.parametrize(
    "test_case_def",
    multi_segment_multi_reference_cases,
    ids=lambda tc: f"multi segment, multi reference {tc.name}",
)
def test_preprocessing_multi_segment_multi_reference(test_case_def: Case):
    config = get_config(MULTI_SEGMENT_MULTI_REFERENCE_CONFIG, ignore_args=True)
    config.alignment_requirement = AlignmentRequirement.ANY
    print(config.nextclade_sequence_and_datasets)
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config, CCHF_DATASET)
    verify_processed_entry(
        processed_entry.processed_entry, test_case.expected_output, test_case.name
    )


if __name__ == "__main__":
    pytest.main()
