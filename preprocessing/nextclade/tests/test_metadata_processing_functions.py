# ruff: noqa: S101
import pytest
from dataclasses import dataclass, field
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
                    "Metadata field `name_required` is required.",
                ),
                ProcessingAnnotationHelper(
                    ["ncbi_required_collection_date"],
                    ["required_collection_date"],
                    "Metadata field `required_collection_date` is required. Please provide input metadata field(s): `ncbi_required_collection_date`",
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
                    "Metadata field `required_collection_date` is required. Please provide input metadata field(s): `ncbi_required_collection_date`",
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
                "submittedAt": ts_from_ymd(2022, 12, 15),
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
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2021-01-02 TO 2021-06-30]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeLower",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-01-02"
    ), "dateRangeLower: lucene range should return lower bound."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2021 TO 2021-06-30]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeLower",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-01-01"
    ), "dateRangeLower: lucene range should return lower bound of leading year."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2021-01-01 TO 2021-06-30]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-06-30"
    ), "dateRangeUpper: lucene range should return upper bound."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2021-01-01 TO 2021]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-12-31"
    ), "dateRangeUpper: lucene range should return upper bound of final date."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2021-05-01 TO 2021-06-30]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-05/2021-06"
    ), "dateRangeString: lucene range should be returned in ISO format (compressed to month range)."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2021 TO 2021-06]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-01/2021-06"
    ), "dateRangeString: lucene range should be returned in ISO format (compressed to month range)."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021-03-05/2021-06-30"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeLower",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-03-05"
    ), "dateRangeLower: ISO range should return lower bound."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021/2021-06-30"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeLower",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-01-01"
    ), "dateRangeLower: ISO range should return lower bound of leading date."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021-01-01/2021-06-12"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-06-12"
    ), "dateRangeUpper: ISO range should return upper bound."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2021-01-01/2021-06"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2021-06-30"
    ), "dateRangeUpper: ISO range should return upper bound of trailing date."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2020-01/2021-06-30"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        ).datum
        == "2020-01/2021-06"
    ), "dateRangeString: ISO range should be returned compressed to month range."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "20-01-2020/2021-06-30"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        )
        .errors[0]
        .message
        == "Metadata field field_name: Detected date range but could not parse date: 20-01-2020/2021-06-30."
    ), "Invalid date range format errors."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "2022-01-01/2021-06-30"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2022, 1, 1),
            },
        )
        .errors[0]
        .message
        == "Metadata field field_name:'2022-01-01/2021-06-30' is an invalid date range. Lower bound: 2022-01-01 00:00:00+00:00 is after upper bound: 2021-06-30 00:00:00+00:00."
    ), "Invalid date range format errors."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2021-01-01 TO 2021-12-31]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2022, 6, 15),
            },
        ).datum
        == "2021"
    ), "Years are compressed in dateRangeString."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2021-01-01 TO 2022-12-31]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2024, 6, 15),
            },
        ).datum
        == "2021/2022"
    ), "Multiple years are compressed in dateRangeString."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2024-02-01 TO 2024-02-29]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeString",
                "submittedAt": ts_from_ymd(2024, 6, 15),
            },
        ).datum
        == "2024-02"
    ), "Months are compressed in dateRangeString (also for leap years)."
    assert (
        ProcessingFunctions.parse_date_into_range(
            {"date": "[2021-01-01 TO 2021-12-31]"},
            "field_name",
            ["field_name"],
            {
                "fieldType": "dateRangeUpper",
                "submittedAt": ts_from_ymd(2021, 6, 15),
            },
        ).datum
        == "2021-06-15"
    ), "dateRangeUpper: lucene range upper bound should be tightened by submittedAt."


@dataclass
class ConcatenateCase:
    name: str
    input_data: InputMetadata
    input_fields: list[str]
    concatenate_args: FunctionArgs
    expected: str


_CONCATENATE_CASES = [
    ConcatenateCase(
        name="date_range_converted_to_lucene",
        input_data={"date": "2021-01-01/2021-12-31", "country": "USA"},
        input_fields=["date", "country"],
        concatenate_args={
            "ACCESSION_VERSION": "version.1",
            "order": ["date", "country"],
            "type": ["dateRangeString", "string"],
        },
        expected="2021-01-01_TO_2021-12-31/USA",
    ),
    ConcatenateCase(
        name="empty_int_field_skipped",
        input_data={"someInt": "", "geoLocCountry": "", "sampleCollectionDate": "2025"},
        input_fields=["geoLocCountry", "sampleCollectionDate"],
        concatenate_args={
            "ACCESSION_VERSION": "version.1",
            "order": ["someInt", "geoLocCountry", "ACCESSION_VERSION", "sampleCollectionDate"],
            "type": ["integer", "string", "ACCESSION_VERSION", "date"],
        },
        expected="version.1/2025-01-01",
    ),
    ConcatenateCase(
        name="present_int_field_and_empty_string_field_with_no_fallback",
        input_data={"someInt": "0", "geoLocCountry": "", "sampleCollectionDate": "2025"},
        input_fields=["geoLocCountry", "sampleCollectionDate"],
        concatenate_args={
            "ACCESSION_VERSION": "version.1",
            "order": ["someInt", "geoLocCountry", "ACCESSION_VERSION", "sampleCollectionDate"],
            "type": ["integer", "string", "ACCESSION_VERSION", "date"],
        },
        expected="0//version.1/2025-01-01",
    ),
    ConcatenateCase(
        name="empty_string_field_uses_fallback_value",
        input_data={"someInt": "0", "geoLocCountry": "", "sampleCollectionDate": "2025"},
        input_fields=["geoLocCountry", "sampleCollectionDate"],
        concatenate_args={
            "ACCESSION_VERSION": "version.1",
            "order": ["someInt", "geoLocCountry", "ACCESSION_VERSION", "sampleCollectionDate"],
            "type": ["integer", "string", "ACCESSION_VERSION", "date"],
            "fallback_value": "unknown",
        },
        expected="0/unknown/version.1/2025-01-01",
    ),
    ConcatenateCase(
        name="accession_version_omitted_from_order",
        input_data={"someInt": "0", "geoLocCountry": "", "sampleCollectionDate": "2025"},
        input_fields=["geoLocCountry", "sampleCollectionDate"],
        concatenate_args={
            "ACCESSION_VERSION": "version.1",
            "order": ["someInt", "geoLocCountry", "sampleCollectionDate"],
            "type": ["integer", "string", "date"],
            "fallback_value": "unknown",
        },
        expected="0/unknown/2025-01-01",
    ),
    ConcatenateCase(
        name="null_date_field_uses_fallback_value",
        input_data={"someInt": "0", "geoLocCountry": "", "sampleCollectionDate": None},
        input_fields=["geoLocCountry", "sampleCollectionDate"],
        concatenate_args={
            "ACCESSION_VERSION": "version.1",
            "order": ["someInt", "geoLocCountry", "ACCESSION_VERSION", "sampleCollectionDate"],
            "type": ["integer", "string", "ACCESSION_VERSION", "date"],
            "fallback_value": "unknown",
        },
        expected="0/unknown/version.1/unknown",
    ),
]


@pytest.mark.parametrize("case", _CONCATENATE_CASES, ids=lambda c: c.name)
def test_concatenate(case: ConcatenateCase) -> None:
    result = ProcessingFunctions.concatenate(
        input_data=case.input_data,
        output_field="displayName",
        input_fields=case.input_fields,
        args=case.concatenate_args,
    )
    assert result.datum == case.expected


_DISPLAY_NAME_REGEX = r"^[^\/][^/]*/[^/]+/(?P<identifier>[^/]+)/\d{4}(?:-\d{2}){0,2}$"
_DISPLAY_NAME_OUTPUT_FIELD = "displayName"
_DISPLAY_NAME_INPUT_FIELDS = [
    "nextclade.clade",
    "geoLocCountry",
    "specimenCollectorSampleId",
    "submissionId",
    "sampleCollectionDate",
]
_DISPLAY_NAME_BASE_ARGS: FunctionArgs = {
    "ACCESSION_VERSION": "version.1",
    "is_insdc_ingest_group": False,
    "order": ["nextclade.clade", "geoLocCountry", "IDENTIFIER", "sampleCollectionDate"],
    "type": ["string", "string", "IDENTIFIER", "string"],
    "regex_pattern": _DISPLAY_NAME_REGEX,
}
_DISPLAY_NAME_INSDC_ARGS: FunctionArgs = {**_DISPLAY_NAME_BASE_ARGS, "is_insdc_ingest_group": True}
_DISPLAY_NAME_PREFIX_ARGS: FunctionArgs = {
    **_DISPLAY_NAME_BASE_ARGS,
    "order": ["ARG:prefix", "geoLocCountry", "IDENTIFIER", "sampleCollectionDate"],
    "type": ["ARG:prefix", "string", "IDENTIFIER", "string"],
    "prefix": "hYF",
}
_UNPARSEABLE_IDENTIFIER_WARNING = (
    "specimencollectorSampleId 'hDENV1/myExtractedSample/2025' and submissionId "
    "'hDENV1/myExtractedSample/2025' could not be parsed, using ACCESSION_VERSION in displayName instead"
)


@dataclass
class DisplayNameCase:
    name: str
    specimen_collector_id: str | None
    submission_id: str
    geo_loc_country: str
    extra_args: FunctionArgs = field(default_factory=dict)
    expected_regular: str = ""
    expected_insdc: str = ""
    expected_prefix: str = ""
    warning_regular: str | None = None
    warning_insdc: str | None = None
    warning_prefix: str | None = None


_DISPLAY_NAME_CASES = [
    DisplayNameCase(
        name="no_specimen_collector_id",
        specimen_collector_id=None,
        submission_id="mySample",
        geo_loc_country="Switzerland",
        expected_regular="DENV-1/Switzerland/mySample/2025",
        expected_insdc="DENV-1/Switzerland/mySample/2025",
        expected_prefix="hYF/Switzerland/mySample/2025",
    ),
    DisplayNameCase(
        name="specimen_collector_id_plain",
        specimen_collector_id="myCollectorSample",
        submission_id="mySample",
        geo_loc_country="Switzerland",
        expected_regular="DENV-1/Switzerland/myCollectorSample/2025",
        expected_insdc="DENV-1/Switzerland/myCollectorSample/2025",
        expected_prefix="hYF/Switzerland/myCollectorSample/2025",
    ),
    DisplayNameCase(
        name="specimen_collector_id_matches_regex_extracts_identifier",
        specimen_collector_id="hDENV1/Germany/myExtractedSample/2025",
        submission_id="mySample",
        geo_loc_country="Switzerland",
        expected_regular="DENV-1/Switzerland/myExtractedSample/2025",
        expected_insdc="DENV-1/Switzerland/mySample/2025",  # INSDC skips regex extraction
        expected_prefix="hYF/Switzerland/myExtractedSample/2025",
    ),
    DisplayNameCase(
        name="specimen_collector_id_no_regex_match_falls_back_to_submission_id",
        specimen_collector_id="hDENV1/myExtractedSample/2025",
        submission_id="mySample",
        geo_loc_country="Switzerland",
        expected_regular="DENV-1/Switzerland/mySample/2025",
        expected_insdc="DENV-1/Switzerland/mySample/2025",
        expected_prefix="hYF/Switzerland/mySample/2025",
    ),
    DisplayNameCase(
        name="both_ids_unparseable_empty_country_uses_accession_version",
        specimen_collector_id="hDENV1/myExtractedSample/2025",
        submission_id="hDENV1/myExtractedSample/2025",
        geo_loc_country="",
        expected_regular="DENV-1/unknown/version.1/2025",
        expected_insdc="DENV-1/unknown/version.1/2025",
        expected_prefix="hYF/unknown/version.1/2025",
        warning_regular=_UNPARSEABLE_IDENTIFIER_WARNING,
        warning_prefix=_UNPARSEABLE_IDENTIFIER_WARNING,
    ),
    DisplayNameCase(
        name="fallback_value_replaces_unknown_country_when_ids_unparseable",
        specimen_collector_id="hDENV1/myExtractedSample/2025",
        submission_id="hDENV1/myExtractedSample/2025",
        geo_loc_country="",
        extra_args={"fallback_value": "another_fallback"},
        expected_regular="DENV-1/another_fallback/version.1/2025",
        expected_insdc="DENV-1/another_fallback/version.1/2025",
        expected_prefix="hYF/another_fallback/version.1/2025",
        warning_regular=_UNPARSEABLE_IDENTIFIER_WARNING,
        warning_prefix=_UNPARSEABLE_IDENTIFIER_WARNING,
    ),
]


def _assert_display_name_warnings(warnings: list, expected_message: str | None) -> None:
    if expected_message is None:
        assert len(warnings) == 0
    else:
        assert len(warnings) == 1
        assert warnings[0].message == expected_message


@pytest.mark.parametrize("case", _DISPLAY_NAME_CASES, ids=lambda c: c.name)
def test_display_name_construction(case: DisplayNameCase) -> None:
    input_data: InputMetadata = {
        "nextclade.clade": "DENV-1",
        "geoLocCountry": case.geo_loc_country,
        "sampleCollectionDate": "2025",
        "submissionId": case.submission_id,
        "specimenCollectorSampleId": case.specimen_collector_id,
    }

    res = ProcessingFunctions.build_display_name(
        input_data, _DISPLAY_NAME_OUTPUT_FIELD, _DISPLAY_NAME_INPUT_FIELDS,
        _DISPLAY_NAME_BASE_ARGS | case.extra_args,
    )
    res_insdc = ProcessingFunctions.build_display_name(
        input_data, _DISPLAY_NAME_OUTPUT_FIELD, _DISPLAY_NAME_INPUT_FIELDS,
        _DISPLAY_NAME_INSDC_ARGS | case.extra_args,
    )
    res_prefix = ProcessingFunctions.build_display_name(
        input_data, _DISPLAY_NAME_OUTPUT_FIELD, _DISPLAY_NAME_INPUT_FIELDS,
        _DISPLAY_NAME_PREFIX_ARGS | case.extra_args,
    )

    assert res.datum == case.expected_regular
    assert res_insdc.datum == case.expected_insdc
    assert res_prefix.datum == case.expected_prefix

    _assert_display_name_warnings(res.warnings, case.warning_regular)
    _assert_display_name_warnings(res_insdc.warnings, case.warning_insdc)
    _assert_display_name_warnings(res_prefix.warnings, case.warning_prefix)


if __name__ == "__main__":
    pytest.main()
