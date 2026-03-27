from unittest.mock import MagicMock, patch

# ruff: noqa: S101
import pytest
from factory_methods import (
    Case,
    ProcessedEntryFactory,
    ProcessingAnnotationHelper,
    ProcessingTestCase,
    build_processing_annotations,
    ts_from_ymd,
    verify_processed_entry,
)

from loculus_preprocessing.config import Config, get_config, get_processing_order
from loculus_preprocessing.datatypes import (
    FunctionArgs,
    InputMetadata,
    ProcessedEntry,
    UnprocessedData,
    UnprocessedEntry,
)
from loculus_preprocessing.prepro import process_all
from loculus_preprocessing.processing_functions import (
    ProcessingFunctions,
    format_authors,
    valid_authors,
)

# Config file used for testing
NO_ALIGNMENT_CONFIG = "tests/no_alignment_config.yaml"
METADATA_DEPENDENCY_CONFIG = "tests/metadata_dependency.yaml"


test_case_definitions = [
    Case(
        name="missing_required_fields",
        input_metadata={"submissionId": "missing_required_fields"},
        accession_id="0",
        expected_metadata={"concatenated_string": "LOC_0.1"},
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["name_required"],
                    ["name_required"],
                    "Metadata field name_required is required.",
                ),
                ProcessingAnnotationHelper(
                    ["ncbi_required_collection_date"],
                    ["required_collection_date"],
                    "Metadata field required_collection_date is required.",
                ),
            ]
        ),
    ),
    Case(
        name="missing_one_required_field",
        input_metadata={"submissionId": "missing_one_required_field", "name_required": "name"},
        accession_id="1",
        expected_metadata={
            "name_required": "name",
            "concatenated_string": "LOC_1.1",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["ncbi_required_collection_date"],
                    ["required_collection_date"],
                    "Metadata field required_collection_date is required.",
                ),
            ]
        ),
    ),
    Case(
        name="insdc_ingest group can submit without required fields",
        input_metadata={"submissionId": "missing_one_required_field", "name_required": "name"},
        accession_id="21",
        expected_metadata={
            "name_required": "name",
            "concatenated_string": "LOC_21.1",
            "required_collection_date": None,
        },
        group_id=1,
    ),
    Case(
        name="invalid_option",
        input_metadata={
            "submissionId": "invalid_option",
            "continent": "Afrika",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="2",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "Afrika/LOC_2.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["continent"],
                    ["continent"],
                    "Metadata field continent:'Afrika' - not in list of accepted options.",
                ),
            ]
        ),
    ),
    Case(
        name="collection_date_in_future",
        input_metadata={
            "submissionId": "collection_date_in_future",
            "collection_date": "2088-12-01",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="3",
        expected_metadata={
            "collection_date": "2088-12-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_3.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["collection_date"],
                    ["collection_date"],
                    "Metadata field collection_date:'2088-12-01' is in the future.",
                ),
            ]
        ),
    ),
    Case(
        name="invalid_collection_date",
        input_metadata={
            "submissionId": "invalid_collection_date",
            "collection_date": "01-02-2024",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="4",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_4.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["collection_date"],
                    ["collection_date"],
                    "Metadata field collection_date: Date format is not recognized.",
                ),
            ]
        ),
    ),
    Case(
        name="invalid_timestamp",
        input_metadata={
            "submissionId": "invalid_timestamp",
            "sequenced_timestamp": " 2022-11-01Europe",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="5",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_5.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["sequenced_timestamp"],
                    ["sequenced_timestamp"],
                    (
                        "Timestamp is  2022-11-01Europe which is not in parseable YYYY-MM-DD. "
                        "Parsing error: Unknown string format:  2022-11-01Europe"
                    ),
                ),
            ]
        ),
    ),
    Case(
        name="date_only_year",
        input_metadata={
            "submissionId": "date_only_year",
            "collection_date": "2023",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="6",
        expected_metadata={
            "collection_date": "2023-01-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_6.1/2022-11-01",
        },
        expected_errors=[],
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["collection_date"],
                    ["collection_date"],
                    (
                        "Metadata field collection_date:'2023' - Month and day are missing. "
                        "Assuming January 1st."
                    ),
                ),
            ]
        ),
    ),
    Case(
        name="regex_match",
        input_metadata={
            "submissionId": "date_only_year",
            "collection_date": "2023-01-01",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "regex_field": "EPI_ISL_123456",
        },
        accession_id="6",
        expected_metadata={
            "collection_date": "2023-01-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_6.1/2022-11-01",
            "regex_field": "EPI_ISL_123456",
            "extracted_regex_field": "123456",
        },
        expected_errors=[],
        expected_warnings=[],
    ),
    Case(
        name="regex_empty_capture_group",
        input_metadata={
            "submissionId": "date_only_year",
            "collection_date": "2023-01-01",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "regex_field": "EPI_ISL_",
        },
        accession_id="6",
        expected_metadata={
            "collection_date": "2023-01-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_6.1/2022-11-01",
            "regex_field": None,
            "extracted_regex_field": None,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["regex_field"],
                    ["regex_field"],
                    (
                        "The value 'EPI_ISL_' does not match the expected regex pattern: "
                        "'^EPI_ISL_[0-9]+$'."
                    ),
                )
            ]
        ),
        expected_warnings=[],
    ),
    Case(
        name="regex_match",
        input_metadata={
            "submissionId": "date_only_year",
            "collection_date": "2023-01-01",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "regex_field": "EPIISL_123456",
        },
        accession_id="6",
        expected_metadata={
            "collection_date": "2023-01-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_6.1/2022-11-01",
            "regex_field": None,
            "extracted_regex_field": None,
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["regex_field"],
                    ["regex_field"],
                    (
                        "The value 'EPIISL_123456' does not match the expected regex pattern: "
                        "'^EPI_ISL_[0-9]+$'."
                    ),
                ),
                ProcessingAnnotationHelper(
                    ["regex_field"],
                    ["extracted_regex_field"],
                    (
                        "The value 'EPIISL_123456' does not match the expected regex pattern: "
                        "'^EPI_ISL_(?P<id>[0-9]+)?$'."
                    ),
                ),
            ]
        ),
        expected_warnings=[],
    ),
    Case(
        name="date_no_day",
        input_metadata={
            "submissionId": "date_no_day",
            "collection_date": "2023-12",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="7",
        expected_metadata={
            "collection_date": "2023-12-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_7.1/2022-11-01",
        },
        expected_errors=[],
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["collection_date"],
                    ["collection_date"],
                    "Metadata field collection_date:'2023-12' - Day is missing. Assuming the 1st.",
                ),
            ]
        ),
    ),
    Case(
        name="invalid_int",
        input_metadata={
            "submissionId": "invalid_int",
            "age_int": "asdf",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="8",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_8.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["age_int"], ["age_int"], "Invalid int value: asdf for field age_int."
                ),
            ]
        ),
    ),
    Case(
        name="invalid_float",
        input_metadata={
            "submissionId": "invalid_float",
            "percentage_float": "asdf",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="9",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_9.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["percentage_float"],
                    ["percentage_float"],
                    "Invalid float value: asdf for field percentage_float.",
                ),
            ]
        ),
    ),
    Case(
        name="invalid_date",
        input_metadata={
            "submissionId": "invalid_date",
            "name_required": "name",
            "other_date": "01-02-2024",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="10",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_10.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["other_date"],
                    ["other_date"],
                    (
                        "Date is 01-02-2024 which is not in the required format YYYY-MM-DD. "
                        "Parsing error: time data '01-02-2024' does not match format '%Y-%m-%d'"
                    ),
                ),
            ]
        ),
    ),
    Case(
        name="invalid_boolean",
        input_metadata={
            "submissionId": "invalid_boolean",
            "name_required": "name",
            "is_lab_host_bool": "maybe",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="11",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_11.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["is_lab_host_bool"],
                    ["is_lab_host_bool"],
                    "Invalid boolean value: maybe for field is_lab_host_bool.",
                ),
            ]
        ),
    ),
    Case(
        name="warn_potential_author_error",
        input_metadata={
            "submissionId": "warn_potential_author_error",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "authors": "Anna Smith, Cameron Tucker",
        },
        accession_id="12",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_12.1/2022-11-01",
            "authors": "Anna Smith, Cameron Tucker",
        },
        expected_errors=[],
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["authors"],
                    ["authors"],
                    (
                        "The authors list might not be using the Loculus "
                        "format. Please ensure that authors are separated by semi-colons. Each "
                        "author's name should be in the format 'last name, first name;'. Last name(s) "
                        "is mandatory, a comma is mandatory to separate first names/initials from last "
                        "name. Only ASCII alphabetical characters A-Z are allowed. For example: "
                        "'Smith, Anna; Perez, Tom J.; Xu, X.L.;' or 'Xu,;' if the first name is "
                        "unknown."
                    ),
                ),
            ]
        ),
    ),
    Case(
        name="non_latin_characters_authors",
        input_metadata={
            "submissionId": "non_latin_characters_authors",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "authors": "Pérez, José; Bailley, François; 汉",
        },
        accession_id="13",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_13.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["authors"],
                    ["authors"],
                    "Unsupported non-Latin character encountered: 汉 (U+6C49).",
                ),
            ]
        ),
    ),
    Case(
        name="diacritics_in_authors",
        input_metadata={
            "submissionId": "diacritics_in_authors",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "authors": "Pérez, José; Bailley, François; Møller, Anäis; Wałęsa, Lech",
        },
        accession_id="13",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_13.1/2022-11-01",
            "authors": "Pérez, José; Bailley, François; Møller, Anäis; Wałęsa, Lech",
        },
        expected_errors=[],
        expected_warnings=[],
    ),
    Case(
        name="nan_float",
        input_metadata={
            "submissionId": "nan_float",
            "percentage_float": "NaN",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="14",
        expected_metadata={
            "percentage_float": None,
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_14.1/2022-11-01",
        },
        expected_errors=[],
    ),
    Case(
        name="infinity_float",
        input_metadata={
            "submissionId": "infinity_float",
            "percentage_float": "Infinity",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
        },
        accession_id="15",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_15.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["percentage_float"],
                    ["percentage_float"],
                    "Invalid float value: Infinity for field percentage_float.",
                ),
            ]
        ),
    ),
    Case(
        name="and_in_authors",
        input_metadata={
            "submissionId": "and_in_authors",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "authors": "Smith, Anna; Perez, Tom J. and Xu X.L.",
        },
        accession_id="16",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_16.1/2022-11-01",
            "authors": "Smith, Anna; Perez, Tom J. and Xu X. L.",
        },
        expected_errors=[],
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["authors"],
                    ["authors"],
                    (
                        "Authors list contains 'and'. "
                        "This may indicate a misformatted authors list. Authors should always be "
                        "separated by semi-colons only e.g. `Smith, Anna; Perez, Tom J.; Xu, X.L.`."
                    ),
                ),
            ]
        ),
    ),
    Case(
        name="trailing_dots_in_authors",
        input_metadata={
            "submissionId": "trailing_dots_in_authors",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "authors": (
                "Smith, John II; Doe, A.B.C.; Lee, J D; Smith, Anna; Perez, Tom J.; Xu, X.L.; "
                "SMITH, AMY; Smith, AD; Black, W. C. IV; Dantas, Pedro HLF; Diclaro, J.W.II; "
                "Ramirez, II II; Xu, X.L"
            ),
        },
        accession_id="16",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_16.1/2022-11-01",
            "authors": (
                "Smith, John II; Doe, A. B. C.; Lee, J. D.; Smith, Anna; Perez, Tom J.; "
                "Xu, X. L.; SMITH, AMY; Smith, A. D.; Black, W. C. IV; Dantas, Pedro H. L. F.; "
                "Diclaro, J. W. II; Ramirez, I. I. II; Xu, X. L."
            ),
        },
        expected_errors=[],
        expected_warnings=[],
    ),
    Case(
        name="invalid_author_names_listed",
        input_metadata={
            "submissionId": "invalid_author_names_listed",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "authors": "Smith, Anna; Invalid Name; BadFormat123; Perez, Tom J.; 12345; NoComma",
        },
        accession_id="17",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_17.1/2022-11-01",
        },
        expected_errors=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["authors"],
                    ["authors"],
                    (
                        "Invalid name(s): 'Invalid Name'; 'BadFormat123'; '12345' ... and 1 others. "
                        "Please ensure that authors are separated by semi-colons. Each author's name "
                        "should be in the format 'last name, first name;'. Last name(s) is mandatory, "
                        "a comma is mandatory to separate first names/initials from last name. "
                        "Only ASCII alphabetical characters A-Z are allowed. For example: "
                        "'Smith, Anna; Perez, Tom J.; Xu, X.L.;' or 'Xu,;' if the first name is "
                        "unknown."
                    ),
                ),
            ]
        ),
    ),
    Case(
        name="strip_spaces_in_metadata",
        input_metadata={
            "submissionId": "strip_spaces_in_metadata",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "authors": " Smith, John II; Doe, A.B.C. \t",
            "regex_field": "\n EPI_ISL_123456 \n",
        },
        accession_id="16",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_16.1/2022-11-01",
            "authors": "Smith, John II; Doe, A. B. C.",
            "regex_field": "EPI_ISL_123456",
            "extracted_regex_field": "123456",
        },
        expected_errors=[],
        expected_warnings=[],
    ),
]

accepted_authors = {
    "Xi, L.; Yu, X.;": "Xi, L.; Yu, X.",
    "Xi,L;Yu,X.;": "Xi, L.; Yu, X.",
    "Xi,;Yu,X.;": "Xi, ; Yu, X.",
    "Xi, ;Yu,X.;": "Xi, ; Yu, X.",
    "Xi, ;Yu,X.": "Xi, ; Yu, X.",
    "Xi,;": "Xi,",
    "Xi,": "Xi,",
    "Smith, Anna Maria; Perez, Jose X.;": "Smith, Anna Maria; Perez, Jose X.",
    "Smith,Anna Maria;Perez,Jose X;": "Smith, Anna Maria; Perez, Jose X.",
    "de souza, a.": "de souza, A.",
    "McGregor, Ewan": "McGregor, Ewan",
    "'t Hooft, Gerard": "'t Hooft, Gerard",
    "Tandoc, A. 3rd": "Tandoc, A. 3rd",
}
not_accepted_authors = [
    ";",
    ",;",
    " ,;",
    ",X.;Yu,X.",
    ",;Yu,X.",
    "Anna Maria Smith; Jose X. Perez",
    "Anna Maria Smith;",
    "Anna Maria Smith",
    "Smith9, Anna;",
    "Anna Smith, Cameron Tucker, and Jose Perez",
    "Count4th, EwanMcGregor, Count4th",
]

test_metadata_dependency_test_definitions = [
    Case(
        name="metadata_dependency",
        input_metadata={
            "submissionId": "metadata_dependency",
            "name_required": "name",
            "ncbi_required_collection_date": "2022-11-01",
            "continent": "Asia",
            "A": "2022",
        },
        accession_id="18",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "Asia/LOC_18.1/2022-11-01",
            "continent": "Asia",
            "A": "2022-01-01",
            "depends_on_A": "Asia/LOC_18.1/2022-01-01",
        },
        expected_errors=[],
        expected_warnings=build_processing_annotations(
            [
                ProcessingAnnotationHelper(
                    ["A"],
                    ["A"],
                    ("Metadata field A:'2022' - Month and day are missing. Assuming January 1st."),
                ),
            ]
        ),
    ),
]


@pytest.fixture(scope="module")
def config():
    return get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)


@pytest.fixture(scope="module")
def config_dependency(config: Config):
    # Add metadata dependency to config, recompute processing order
    dependency_fields = get_config(METADATA_DEPENDENCY_CONFIG, ignore_args=True).processing_spec
    config.processing_spec.update(dependency_fields)
    config.processing_order = get_processing_order(config)
    return config


@pytest.fixture(scope="module")
def factory_custom(config):
    return ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))


def process_single_entry(
    test_case: ProcessingTestCase, config: Config, dataset_dir: str = "temp"
) -> ProcessedEntry:
    result = process_all([test_case.input], dataset_dir, config)
    return result[0].processed_entry


@pytest.mark.parametrize("test_case_def", test_case_definitions, ids=lambda tc: tc.name)
def test_preprocessing(test_case_def: Case, config: Config, factory_custom: ProcessedEntryFactory):
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config)
    verify_processed_entry(processed_entry, test_case.expected_output, test_case.name)


@pytest.mark.parametrize(
    "test_case_def",
    test_metadata_dependency_test_definitions,
    ids=lambda tc: f"metadata fields with dependencies use processed fields {tc.name}",
)
def test_preprocessing_metadata_dependencies(test_case_def: Case, config_dependency: Config):
    factory_custom = ProcessedEntryFactory(
        all_metadata_fields=list(config_dependency.processing_spec.keys())
    )
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config_dependency)
    verify_processed_entry(processed_entry, test_case.expected_output, test_case.name)

    wrong_order = tuple(
        ["depends_on_A"] + [i for i in config_dependency.processing_order if i != "depends_on_A"]
    )
    config_dependency.processing_order = wrong_order
    processed_entry = process_single_entry(test_case, config_dependency)
    assert processed_entry.data.metadata != test_case.expected_output.data.metadata


def test_preprocessing_without_consensus_sequences(config: Config) -> None:
    sequence_name = "entry without sequences"
    sequence_entry_data = UnprocessedEntry(
        accessionVersion="LOC_01.1",
        data=UnprocessedData(
            submitter="test_submitter",
            submissionId="test_submission_id",
            group_id=2,
            submittedAt=ts_from_ymd(2021, 12, 15),
            metadata={
                "ncbi_required_collection_date": "2024-01-01",
                "name_required": sequence_name,
            },
            unalignedNucleotideSequences={},
        ),
    )

    result = process_all([sequence_entry_data], "temp_dataset_dir", config)
    processed_entry = result[0].processed_entry

    assert processed_entry.errors == []
    assert processed_entry.warnings == []
    assert processed_entry.data.metadata["name_required"] == sequence_name
    assert processed_entry.data.unalignedNucleotideSequences == {}
    assert processed_entry.data.alignedNucleotideSequences == {}
    assert processed_entry.data.nucleotideInsertions == {}
    assert processed_entry.data.alignedAminoAcidSequences == {}
    assert processed_entry.data.aminoAcidInsertions == {}


def test_valid_authors() -> None:
    for author in accepted_authors:
        if valid_authors(author) is not True:
            msg = f"{author} should be accepted but is not."
            raise AssertionError(msg)
    for author in not_accepted_authors:
        if valid_authors(author) is not False:
            msg = f"{author} should not be accepted but is."
            raise AssertionError(msg)


def test_format_authors() -> None:
    for author, formatted_author in accepted_authors.items():
        if format_authors(author) != formatted_author:
            print(format_authors(author))
            msg = (
                f"{author} is not formatted: '{format_authors(author)}' "
                f"as expected: '{formatted_author}'"
            )
            raise AssertionError(msg)


def test_parse_date_into_range() -> None:
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021-12"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2021, 12, 15),
            },
        ).datum
        == "2021-12"
    ), "dateRangeString: 2021-12 should be returned as is."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021-12"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeLower",
                "submittedAt": ts_from_ymd(2021, 12, 15),
            },
        ).datum
        == "2021-12-01"
    ), "dateRangeLower: 2021-12 should be returned as 2021-12-01."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021-12"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2022, 12, 15),
            },
        ).datum
        == "2021-12-31"
    ), "dateRangeUpper: 2021-12 should be returned as 2021-12-31."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021-12"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2021, 12, 15),
            },
        ).datum
        == "2021-12-15"
    ), "dateRangeUpper: 2021-12 should be returned as submittedAt time: 2021-12-15."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021-02"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2021, 3, 15),
            },
        ).datum
        == "2021-02-28"
    ), "dateRangeUpper: 2021-02 should be returned as 2021-02-28."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2021, 12, 15),
            },
        ).datum
        == "2021-12-15"
    ), "dateRangeUpper: 2021 should be returned as 2021-12-15."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2022, 1, 15),
            },
        ).datum
        == "2021-12-31"
    ), "dateRangeUpper: 2021 should be returned as 2021-12-31."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021-12", "releaseDate": "2021-12-15"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2021, 12, 16),
            },
        ).datum
        == "2021-12-15"
    ), "dateRangeUpper: 2021-12 with releaseDate 2021-12-15 should be returned as 2021-12-15."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "", "releaseDate": "2021-12-15"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2021, 12, 16),
            },
        ).datum
        == "2021-12-15"
    ), "dateRangeUpper: empty date with releaseDate 2021-12-15 should be returned as 2021-12-15."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": ""},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2021, 12, 16),
            },
        ).datum
        is None
    ), "dateRangeString: empty date should be returned as None."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "not.date"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2021, 12, 16),
            },
        ).datum
        is None
    ), "dateRangeString: invalid date should be returned as None."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "", "releaseDate": "2021-12-15"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeLower",
                "submittedAt": ts_from_ymd(2021, 12, 16),
            },
        ).datum
        is None
    ), "dateRangeLower: empty date should be returned as None."


def test_concatenate() -> None:
    input_data: InputMetadata = {
        "someInt": "",
        "geoLocCountry": "",
        "sampleCollectionDate": "2025",
    }
    output_field: str = "displayName"
    input_fields: list[str] = ["geoLocCountry", "sampleCollectionDate"]
    args: FunctionArgs = {
        "ACCESSION_VERSION": "version.1",
        "order": ["someInt", "geoLocCountry", "ACCESSION_VERSION", "sampleCollectionDate"],
        "type": ["integer", "string", "ACCESSION_VERSION", "date"],
    }
    args_no_accession_version: FunctionArgs = {
        "ACCESSION_VERSION": "version.1",
        "order": ["someInt", "geoLocCountry", "sampleCollectionDate"],
        "type": ["integer", "string", "date"],
        "fallback_value": "unknown",
    }

    res_no_fallback_no_int = ProcessingFunctions.concatenate(
        input_data,
        output_field,
        input_fields,
        args,
    )

    input_data["someInt"] = "0"
    res_no_fallback = ProcessingFunctions.concatenate(
        input_data,
        output_field,
        input_fields,
        args,
    )

    args["fallback_value"] = "unknown"
    res_fallback = ProcessingFunctions.concatenate(
        input_data,
        output_field,
        input_fields,
        args,
    )

    res_fallback_no_accession_version = ProcessingFunctions.concatenate(
        input_data,
        output_field,
        input_fields,
        args_no_accession_version,
    )

    input_data["sampleCollectionDate"] = None
    res_fallback_explicit_null = ProcessingFunctions.concatenate(
        input_data,
        output_field,
        input_fields,
        args,
    )

    assert res_no_fallback_no_int.datum == "version.1/2025-01-01"
    assert res_no_fallback.datum == "0//version.1/2025-01-01"
    assert res_fallback.datum == "0/unknown/version.1/2025-01-01"
    assert res_fallback_no_accession_version.datum == "0/unknown/2025-01-01"
    assert res_fallback_explicit_null.datum == "0/unknown/version.1/unknown"


def test_display_name_construction() -> None:
    submission_id = "mySample"
    submission_id_formatted = "hDENV1/Germany/myExtractedSample/2025"
    submission_id_formatted_unexpected = "hDENV1/myExtractedSample/2025"
    input_data: InputMetadata = {
        "nextclade.clade": "DENV-1",
        "geoLocCountry": "Switzerland",
        "sampleCollectionDate": "2025",
        "submissionId": submission_id,
    }
    output_field: str = "displayName"

    def input_fields():
        return [
            "nextclade.clade",
            "geoLocCountry",
            "specimenCollectorSampleId",
            "submissionId",
            "sampleCollectionDate",
        ]

    def args():
        return {
            "ACCESSION_VERSION": "version.1",
            "is_insdc_ingest_group": False,
            "order": ["nextclade.clade", "geoLocCountry", "IDENTIFIER", "sampleCollectionDate"],
            "type": ["string", "string", "IDENTIFIER", "string"],
            "regex_pattern": r"^[^\/][^/]*/[^/]+/(?P<identifier>[^/]+)/\d{4}(?:-\d{2}){0,2}$",
        }

    def args_with_prefix():
        return {
            "ACCESSION_VERSION": "version.1",
            "is_insdc_ingest_group": False,
            "order": ["ARG:prefix", "geoLocCountry", "IDENTIFIER", "sampleCollectionDate"],
            "type": ["ARG:prefix", "string", "IDENTIFIER", "string"],
            "prefix": "hYF",
            "regex_pattern": r"^[^\/][^/]*/[^/]+/(?P<identifier>[^/]+)/\d{4}(?:-\d{2}){0,2}$",
        }

    def args_insdc():
        return {
            "ACCESSION_VERSION": "version.1",
            "is_insdc_ingest_group": True,
            "order": ["nextclade.clade", "geoLocCountry", "IDENTIFIER", "sampleCollectionDate"],
            "type": ["string", "string", "IDENTIFIER", "string"],
            "regex_pattern": r"^[^\/][^/]*/[^/]+/(?P<identifier>[^/]+)/\d{4}(?:-\d{2}){0,2}$",
        }

    res = ProcessingFunctions.build_display_name(input_data, output_field, input_fields(), args())
    res_insdc = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_insdc()
    )
    res_prefix = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_with_prefix()
    )
    assert res.datum == "DENV-1/Switzerland/mySample/2025"
    assert res_insdc.datum == "DENV-1/Switzerland/mySample/2025"
    assert res_prefix.datum == "hYF/Switzerland/mySample/2025"

    input_data["specimenCollectorSampleId"] = "myCollectorSample"
    res = ProcessingFunctions.build_display_name(input_data, output_field, input_fields(), args())
    res_insdc = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_insdc()
    )
    res_prefix = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_with_prefix()
    )
    assert res.datum == "DENV-1/Switzerland/myCollectorSample/2025"
    assert res_insdc.datum == "DENV-1/Switzerland/myCollectorSample/2025"
    assert res_prefix.datum == "hYF/Switzerland/myCollectorSample/2025"

    input_data["specimenCollectorSampleId"] = submission_id_formatted
    res = ProcessingFunctions.build_display_name(input_data, output_field, input_fields(), args())
    res_insdc = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_insdc()
    )
    res_prefix = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_with_prefix()
    )
    assert res.datum == "DENV-1/Switzerland/myExtractedSample/2025"
    assert res_insdc.datum == "DENV-1/Switzerland/version.1/2025"
    assert res_prefix.datum == "hYF/Switzerland/myExtractedSample/2025"

    input_data["specimenCollectorSampleId"] = submission_id_formatted_unexpected
    res = ProcessingFunctions.build_display_name(input_data, output_field, input_fields(), args())
    res_insdc = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_insdc()
    )
    res_prefix = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_with_prefix()
    )
    assert res.datum == "DENV-1/Switzerland/version.1/2025"
    assert res_insdc.datum == "DENV-1/Switzerland/version.1/2025"
    assert res_prefix.datum == "hYF/Switzerland/version.1/2025"

    input_data["specimenCollectorSampleId"] = submission_id_formatted_unexpected
    input_data["geoLocCountry"] = ""
    res = ProcessingFunctions.build_display_name(input_data, output_field, input_fields(), args())
    res_insdc = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_insdc()
    )
    res_prefix = ProcessingFunctions.build_display_name(
        input_data, output_field, input_fields(), args_with_prefix()
    )
    assert res.datum == "DENV-1/unknown/version.1/2025"
    assert len(res.warnings) == 1
    assert (
        res.warnings[0].message
        == "identifier string 'hDENV1/myExtractedSample/2025' could not be parsed, using ACCESSION_VERSION in displayName instead"
    )
    assert res_insdc.datum == "DENV-1/unknown/version.1/2025"
    assert len(res_insdc.warnings) == 0
    assert res_prefix.datum == "hYF/unknown/version.1/2025"
    assert len(res_prefix.warnings) == 1
    assert (
        res_prefix.warnings[0].message
        == "identifier string 'hDENV1/myExtractedSample/2025' could not be parsed, using ACCESSION_VERSION in displayName instead"
    )

    input_data["specimenCollectorSampleId"] = submission_id_formatted_unexpected
    res = ProcessingFunctions.build_display_name(
        input_data,
        output_field,
        input_fields(),
        {"fallback_value": "another_fallback"} | args(),  # type: ignore
    )
    res_insdc = ProcessingFunctions.build_display_name(
        input_data,
        output_field,
        input_fields(),
        {"fallback_value": "another_fallback"} | args_insdc(),  # type: ignore
    )
    res_prefix = ProcessingFunctions.build_display_name(
        input_data,
        output_field,
        input_fields(),
        {"fallback_value": "another_fallback"} | args_with_prefix(),  # type: ignore
    )
    assert res.datum == "DENV-1/another_fallback/version.1/2025"
    assert len(res.warnings) == 1
    assert (
        res.warnings[0].message
        == "identifier string 'hDENV1/myExtractedSample/2025' could not be parsed, using ACCESSION_VERSION in displayName instead"
    )
    assert res_insdc.datum == "DENV-1/another_fallback/version.1/2025"
    assert len(res_insdc.warnings) == 0
    assert res_prefix.datum == "hYF/another_fallback/version.1/2025"
    assert len(res_prefix.warnings) == 1
    assert (
        res_prefix.warnings[0].message
        == "identifier string 'hDENV1/myExtractedSample/2025' could not be parsed, using ACCESSION_VERSION in displayName instead"
    )


def make_response(status_code, json_data):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    return mock


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_validate_hostname_success(mock_get: MagicMock):
    mock_get.return_value = make_response(
        200,
        [
            {
                "tax_id": 7174,
                "scientific_name": "Culex",
                "depth": 26,
            },
            {
                "tax_id": 53527,
                "scientific_name": "Culex",
                "depth": 27,
            },
        ],
    )

    res = ProcessingFunctions.validate_hostname(
        input_data={"hostNameScientific": "Culex"},
        output_field="hostTaxonId",
        input_fields=["hostNameScientific"],
        args={"taxonomy_service_host": "http://localhost", "taxonomy_service_port": 5000},
    )

    assert res.datum == 53527
    assert res.warnings == []
    assert res.errors == []
    mock_get.assert_called_once_with("http://localhost:5000/taxa?scientific_name=Culex")


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_validate_hostname_not_found(mock_get):
    mock_get.return_value = make_response(404, {"detail": "not found"})

    res = ProcessingFunctions.validate_hostname(
        input_data={"hostNameScientific": "des aegypti"},
        output_field="hostTaxonId",
        input_fields=["hostNameScientific"],
        args={"taxonomy_service_host": "http://localhost", "taxonomy_service_port": 5000},
    )

    assert res.datum is None
    assert len(res.errors) == 1


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_validate_hostname_insdc(mock_get):
    res = ProcessingFunctions.validate_hostname(
        input_data={"hostNameScientific": "Culex", "ncbiHostTaxId": "53527"},
        output_field="hostTaxonId",
        input_fields=["hostNameScientific"],
        args={
            "taxonomy_service_host": "http://localhost",
            "taxonomy_service_port": 5000,
            "is_insdc_ingest_group": True,
        },
    )

    assert res.datum == "53527"
    assert res.warnings == []
    assert res.errors == []
    mock_get.assert_not_called()


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_sci_name_from_id_insdc(mock_get):
    res = ProcessingFunctions.scientific_name_from_id(
        input_data={"hostNameScientific": "Aedes aegypti", "hostTaxonId": "7159"},
        output_field="hostNameScientific",
        input_fields=["hostNameScientific", "hostTaxonId"],
        args={
            "taxonomy_service_host": "http://localhost",
            "taxonomy_service_port": 5000,
            "is_insdc_ingest_group": True,
        },
    )

    assert res.datum == "Aedes aegypti"
    assert res.warnings == []
    assert res.errors == []
    mock_get.assert_not_called()


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_sci_name_from_id_success(mock_get):
    mock_get.return_value = make_response(200, {"scientific_name": "Aedes aegypti"})

    res = ProcessingFunctions.scientific_name_from_id(
        input_data={"hostTaxonId": "7159"},
        output_field="hostScientificName",
        input_fields=["hostTaxonId"],
        args={"taxonomy_service_host": "http://localhost", "taxonomy_service_port": 5000},
    )

    assert res.datum == "Aedes aegypti"
    assert res.warnings == []
    assert res.errors == []
    mock_get.assert_called_once_with("http://localhost:5000/taxa/7159")


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_sci_name_from_id_not_found(mock_get):
    mock_get.return_value = make_response(404, {"detail": "not found"})

    res = ProcessingFunctions.scientific_name_from_id(
        input_data={"hostTaxonId": "-1"},
        output_field="hostScientificName",
        input_fields=["hostTaxonId"],
        args={"taxonomy_service_host": "http://localhost", "taxonomy_service_port": 5000},
    )

    assert res.datum is None
    assert len(res.errors) == 1
    mock_get.assert_called_once_with("http://localhost:5000/taxa/-1")


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_common_name_from_id_success(mock_get):
    mock_get.return_value = make_response(200, {"common_name": "yellow fever mosquito"})

    res = ProcessingFunctions.common_name_from_id(
        input_data={"hostTaxonId": "7159"},
        output_field="hostScientificName",
        input_fields=["hostTaxonId"],
        args={"taxonomy_service_host": "http://localhost", "taxonomy_service_port": 5000},
    )

    assert res.datum == "yellow fever mosquito"
    assert res.warnings == []
    assert res.errors == []
    mock_get.assert_called_once_with("http://localhost:5000/taxa/7159?find_common_name=true")


@patch("loculus_preprocessing.processing_functions.requests.get")
def test_common_name_from_id_not_found(mock_get):
    mock_get.return_value = make_response(404, {"detail": "not found"})

    res = ProcessingFunctions.common_name_from_id(
        input_data={"hostTaxonId": "134896438906397"},
        output_field="hostScientificName",
        input_fields=["hostTaxonId"],
        args={"taxonomy_service_host": "http://localhost", "taxonomy_service_port": 5000},
    )

    assert res.datum is None
    assert len(res.errors) == 1
    mock_get.assert_called_once_with(
        "http://localhost:5000/taxa/134896438906397?find_common_name=true"
    )


if __name__ == "__main__":
    pytest.main()
