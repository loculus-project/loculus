# ruff: noqa: S101
from dataclasses import dataclass

import pytest
from factory_methods import ProcessedEntryFactory, ProcessingTestCase, UnprocessedEntryFactory

from loculus_preprocessing.config import Config, get_config
from loculus_preprocessing.datatypes import ProcessedEntry, ProcessingAnnotation
from loculus_preprocessing.prepro import process_all
from loculus_preprocessing.processing_functions import (
    ProcessingFunctions,
    format_authors,
    format_frameshift,
    format_stop_codon,
    valid_authors,
)

# Config file used for testing
test_config_file = "tests/test_config.yaml"


@dataclass
class Case:
    name: str
    metadata: dict[str, str]
    expected_metadata: dict[str, str]
    expected_errors: list[tuple[str, str]]
    expected_warnings: list[tuple[str, str]] = None
    accession_id: str = "000999"

    def create_test_case(self, factory_custom: ProcessedEntryFactory) -> ProcessingTestCase:
        unprocessed_entry = UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict=self.metadata,
            accession_id=self.accession_id,
        )
        expected_output = factory_custom.create_processed_entry(
            metadata_dict=self.expected_metadata,
            accession=unprocessed_entry.accessionVersion.split(".")[0],
            metadata_errors=self.expected_errors,
            metadata_warnings=self.expected_warnings or [],
        )
        return ProcessingTestCase(
            name=self.name, input=unprocessed_entry, expected_output=expected_output
        )


test_case_definitions = [
    Case(
        name="missing_required_fields",
        metadata={"submissionId": "missing_required_fields"},
        accession_id="0",
        expected_metadata={"concatenated_string": "LOC_0.1"},
        expected_errors=[
            ("name_required", "Metadata field name_required is required."),
            (
                "required_collection_date",
                "Metadata field required_collection_date is required.",
            ),
        ],
    ),
    Case(
        name="missing_one_required_field",
        metadata={"submissionId": "missing_one_required_field", "name_required": "name"},
        accession_id="1",
        expected_metadata={"name_required": "name", "concatenated_string": "LOC_1.1"},
        expected_errors=[
            (
                "required_collection_date",
                "Metadata field required_collection_date is required.",
            ),
        ],
    ),
    Case(
        name="invalid_option",
        metadata={
            "submissionId": "invalid_option",
            "continent": "Afrika",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
        },
        accession_id="2",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "Afrika/LOC_2.1/2022-11-01",
        },
        expected_errors=[
            (
                "continent",
                "Metadata field continent:'Afrika' - not in list of accepted options.",
            ),
        ],
    ),
    Case(
        name="collection_date_in_future",
        metadata={
            "submissionId": "collection_date_in_future",
            "collection_date": "2088-12-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
        },
        accession_id="3",
        expected_metadata={
            "collection_date": "2088-12-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_3.1/2022-11-01",
        },
        expected_errors=[
            (
                "collection_date",
                "Metadata field collection_date:'2088-12-01' is in the future.",
            ),
        ],
    ),
    Case(
        name="invalid_collection_date",
        metadata={
            "submissionId": "invalid_collection_date",
            "collection_date": "01-02-2024",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
        },
        accession_id="4",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_4.1/2022-11-01",
        },
        expected_errors=[
            (
                "collection_date",
                "Metadata field collection_date: Date format is not recognized.",
            ),
        ],
    ),
    Case(
        name="invalid_timestamp",
        metadata={
            "submissionId": "invalid_timestamp",
            "sequenced_timestamp": " 2022-11-01Europe",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
        },
        accession_id="5",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_5.1/2022-11-01",
        },
        expected_errors=[
            (
                "sequenced_timestamp",
                (
                    "Timestamp is  2022-11-01Europe which is not in parseable YYYY-MM-DD. "
                    "Parsing error: Unknown string format:  2022-11-01Europe"
                ),
            ),
        ],
    ),
    Case(
        name="date_only_year",
        metadata={
            "submissionId": "date_only_year",
            "collection_date": "2023",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
        },
        accession_id="6",
        expected_metadata={
            "collection_date": "2023-01-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_6.1/2022-11-01",
        },
        expected_errors=[],
        expected_warnings=[
            (
                "collection_date",
                (
                    "Metadata field collection_date:'2023' - Month and day are missing. "
                    "Assuming January 1st."
                ),
            ),
        ],
    ),
    Case(
        name="date_no_day",
        metadata={
            "submissionId": "date_no_day",
            "collection_date": "2023-12",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
        },
        accession_id="7",
        expected_metadata={
            "collection_date": "2023-12-01",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_7.1/2022-11-01",
        },
        expected_errors=[],
        expected_warnings=[
            (
                "collection_date",
                "Metadata field collection_date:'2023-12' - Day is missing. Assuming the 1st.",
            ),
        ],
    ),
    Case(
        name="invalid_int",
        metadata={
            "submissionId": "invalid_int",
            "age_int": "asdf",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
        },
        accession_id="8",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_8.1/2022-11-01",
        },
        expected_errors=[
            ("age_int", "Invalid int value: asdf for field age_int."),
        ],
    ),
    Case(
        name="invalid_float",
        metadata={
            "submissionId": "invalid_float",
            "percentage_float": "asdf",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
        },
        accession_id="9",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_9.1/2022-11-01",
        },
        expected_errors=[
            ("percentage_float", "Invalid float value: asdf for field percentage_float."),
        ],
    ),
    Case(
        name="invalid_date",
        metadata={
            "submissionId": "invalid_date",
            "name_required": "name",
            "other_date": "01-02-2024",
            "required_collection_date": "2022-11-01",
        },
        accession_id="10",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_10.1/2022-11-01",
        },
        expected_errors=[
            (
                "other_date",
                (
                    "Date is 01-02-2024 which is not in the required format YYYY-MM-DD. "
                    "Parsing error: time data '01-02-2024' does not match format '%Y-%m-%d'"
                ),
            ),
        ],
    ),
    Case(
        name="invalid_boolean",
        metadata={
            "submissionId": "invalid_boolean",
            "name_required": "name",
            "is_lab_host_bool": "maybe",
            "required_collection_date": "2022-11-01",
        },
        accession_id="11",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_11.1/2022-11-01",
        },
        expected_errors=[
            ("is_lab_host_bool", "Invalid boolean value: maybe for field is_lab_host_bool."),
        ],
    ),
    Case(
        name="warn_potential_author_error",
        metadata={
            "submissionId": "warn_potential_author_error",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
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
        expected_warnings=[
            (
                "authors",
                "The authors list 'Anna Smith, Cameron Tucker' might not be using the Loculus format. Please ensure that authors are separated by semi-colons. Each author's name should be in the format 'last name, first name;'. Last name(s) is mandatory, a comma is mandatory to separate first names/initials from last name. Only ASCII alphabetical characters A-Z are allowed. For example: 'Smith, Anna; Perez, Tom J.; Xu, X.L.;' or 'Xu,;' if the first name is unknown.",
            ),
        ],
    ),
    Case(
        name="non_ascii_authors",
        metadata={
            "submissionId": "non_ascii_authors",
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "authors": "Møller, Anäis; Pérez, José",
        },
        accession_id="13",
        expected_metadata={
            "name_required": "name",
            "required_collection_date": "2022-11-01",
            "concatenated_string": "LOC_13.1/2022-11-01",
        },
        expected_errors=[
            (
                "authors",
                "The authors list 'Møller, Anäis; Pérez, José' contains non-ASCII characters. Please ensure that authors are separated by semi-colons. Each author's name should be in the format 'last name, first name;'. Last name(s) is mandatory, a comma is mandatory to separate first names/initials from last name. Only ASCII alphabetical characters A-Z are allowed. For example: 'Smith, Anna; Perez, Tom J.; Xu, X.L.;' or 'Xu,;' if the first name is unknown.",
            ),
        ],
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
}
not_accepted_authors = [
    ";",
    ",;",
    " ,;", ",X.;Yu,X.",
    ",;Yu,X.",
    "Anna Maria Smith; Jose X. Perez",
    "Anna Maria Smith;",
    "Anna Maria Smith",
    "Smith9, Anna;",
    "Anna Smith, Cameron Tucker, and Jose Perez",
]


@pytest.fixture(scope="module")
def config():
    return get_config(test_config_file)


@pytest.fixture(scope="module")
def factory_custom(config):
    return ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))


def sort_annotations(annotations: list[ProcessingAnnotation]) -> list[ProcessingAnnotation]:
    return sorted(annotations, key=lambda x: (x.source[0].name, x.message))


def process_single_entry(test_case: ProcessingTestCase, config: Config) -> ProcessedEntry:
    dataset_dir = "temp"  # This is not used as we do not align sequences
    result = process_all([test_case.input], dataset_dir, config)
    return result[0]


def verify_processed_entry(
    processed_entry: ProcessedEntry, expected_output: ProcessedEntry, test_name: str
):
    # Check accession and version
    assert (
        processed_entry.accession == expected_output.accession
        and processed_entry.version == expected_output.version
    ), (
        f"{test_name}: processed entry accessionVersion "
        f"{processed_entry.accession}.{processed_entry.version} "
        f"does not match expected output {expected_output.accession}.{expected_output.version}."
    )

    # Check metadata
    assert processed_entry.data.metadata == expected_output.data.metadata, (
        f"{test_name}: processed metadata {processed_entry.data.metadata} "
        f"does not match expected metadata {expected_output.data.metadata}."
    )

    # Check errors
    processed_errors = sort_annotations(processed_entry.errors)
    expected_errors = sort_annotations(expected_output.errors)
    assert processed_errors == expected_errors, (
        f"{test_name}: processed errors: {processed_errors}",
        f"does not match expected output: {expected_errors}.",
    )

    # Check warnings
    processed_warnings = sort_annotations(processed_entry.warnings)
    expected_warnings = sort_annotations(expected_output.warnings)
    assert processed_warnings == expected_warnings, (
        f"{test_name}: processed warnings {processed_warnings}"
        f"does not match expected output {expected_warnings}."
    )


@pytest.mark.parametrize("test_case_def", test_case_definitions, ids=lambda tc: tc.name)
def test_preprocessing(test_case_def: Case, config: Config, factory_custom: ProcessedEntryFactory):
    test_case = test_case_def.create_test_case(factory_custom)
    processed_entry = process_single_entry(test_case, config)
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


def test_parse_date_into_range():
    assert ProcessingFunctions.parse_date_into_range(
        {"date": "2021-12"}, "field_name", {"fieldType": "dateRangeString"}
    ), "2021-12"
    assert ProcessingFunctions.parse_date_into_range(
        {"date": "2021-12"}, "field_name", {"fieldType": "dateRangeLower"}
    ), "2021-12-01"
    assert ProcessingFunctions.parse_date_into_range(
        {"date": "2021-12"}, "field_name", {"fieldType": "dateRangeUpper"}
    ), "2021-12-31"
    assert ProcessingFunctions.parse_date_into_range(
        {"date": "2021-02"}, "field_name", {"fieldType": "dateRangeUpper"}
    ), "2021-02-28"
    assert ProcessingFunctions.parse_date_into_range(
        {"date": "2021"}, "field_name", {"fieldType": "dateRangeUpper"}
    ), "2021-12-31"
    assert ProcessingFunctions.parse_date_into_range(
        {"date": "2021-12", "releaseDate": "2021-12-15"},
        "field_name",
        {"fieldType": "dateRangeUpper"},
    ), "2021-12-15"


if __name__ == "__main__":
    pytest.main()
