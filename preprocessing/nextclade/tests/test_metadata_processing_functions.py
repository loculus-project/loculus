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

from loculus_preprocessing.config import Config, get_config
from loculus_preprocessing.datatypes import (
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
        expected_metadata={"name_required": "name", "concatenated_string": "LOC_1.1"},
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
                        "'^EPI_ISL_(?P<id>[0-9]+)$' or does not contain a capture group 'id'."
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


@pytest.fixture(scope="module")
def config():
    return get_config(NO_ALIGNMENT_CONFIG, ignore_args=True)


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


def test_preprocessing_without_consensus_sequences(config: Config) -> None:
    sequence_name = "entry without sequences"
    sequence_entry_data = UnprocessedEntry(
        accessionVersion="LOC_01.1",
        data=UnprocessedData(
            submitter="test_submitter",
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


if __name__ == "__main__":
    pytest.main()
