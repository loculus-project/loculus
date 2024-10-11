import unittest

from factory_methods import ProcessedEntryFactory, TestCase, UnprocessedEntryFactory

from loculus_preprocessing.config import Config, get_config
from loculus_preprocessing.datatypes import (
    ProcessedEntry,
    ProcessingAnnotation,
)
from loculus_preprocessing.prepro import process_all
from loculus_preprocessing.processing_functions import valid_authors, format_authors

test_config_file = "tests/test_config.yaml"


def get_test_cases(config: Config) -> list[TestCase]:
    factory_custom = ProcessedEntryFactory(all_metadata_fields=list(config.processing_spec.keys()))
    return [
        TestCase(
            name="missing_required_fields",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "missing_required_fields",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "concatenated_string": "LOC_0.1",
                },
                metadata_errors=[
                    ("name_required", "Metadata field name_required is required."),
                    (
                        "required_collection_date",
                        "Metadata field required_collection_date is required.",
                    ),
                ],
            ),
        ),
        TestCase(
            name="missing_one_required_field",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "missing_one_required_field",
                    "name_required": "name",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "name_required": "name",
                    "concatenated_string": "LOC_1.1",
                },
                metadata_errors=[
                    (
                        "required_collection_date",
                        "Metadata field required_collection_date is required.",
                    ),
                ],
            ),
        ),
        TestCase(
            name="invalid_option",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "invalid_option",
                    "continent": "Afrika",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "Afrika/LOC_2.1/2022-11-01",
                },
                metadata_errors=[
                    (
                        "continent",
                        "Metadata field continent:'Afrika' - not in list of accepted options.",
                    ),
                ],
            ),
        ),
        TestCase(
            name="collection_date_in_future",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "collection_date_in_future",
                    "collection_date": "2088-12-01",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "collection_date": "2088-12-01",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "LOC_3.1/2022-11-01",
                },
                metadata_errors=[
                    (
                        "collection_date",
                        "Metadata field collection_date:'2088-12-01' is in the future.",
                    ),
                ],
            ),
        ),
        TestCase(
            name="invalid_collection_date",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "invalid_collection_date",
                    "collection_date": "01-02-2024",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "LOC_4.1/2022-11-01",
                },
                metadata_errors=[
                    (
                        "collection_date",
                        "Metadata field collection_date: Date format is not recognized.",
                    ),
                ],
            ),
        ),
        TestCase(
            name="invalid_timestamp",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "invalid_timestamp",
                    "sequenced_timestamp": " 2022-11-01Europe",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "LOC_5.1/2022-11-01",
                },
                metadata_errors=[
                    (
                        "sequenced_timestamp",
                        "Timestamp is  2022-11-01Europe which is not in parseable YYYY-MM-DD. Parsing error: Unknown string format:  2022-11-01Europe",
                    ),
                ],
            ),
        ),
        TestCase(
            name="date_only_year",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "date_only_year",
                    "collection_date": "2023",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "collection_date": "2023-01-01",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "LOC_6.1/2022-11-01",
                },
                metadata_errors=[],
                metadata_warnings=[
                    (
                        "collection_date",
                        "Metadata field collection_date:'2023' - Month and day are missing. Assuming January 1st.",
                    ),
                ],
            ),
        ),
        TestCase(
            name="date_no_day",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "date_no_day",
                    "collection_date": "2023-12",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "collection_date": "2023-12-01",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "LOC_7.1/2022-11-01",
                },
                metadata_errors=[],
                metadata_warnings=[
                    (
                        "collection_date",
                        "Metadata field collection_date:'2023-12' - Day is missing. Assuming the 1st.",
                    ),
                ],
            ),
        ),
        TestCase(
            name="invalid_int",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "invalid_int",
                    "age_int": "asdf",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "LOC_8.1/2022-11-01",
                },
                metadata_errors=[
                    ("age_int", "Invalid int value: asdf for field age_int."),
                ],
            ),
        ),
        TestCase(
            name="invalid_float",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "invalid_float",
                    "percentage_float": "asdf",
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "LOC_9.1/2022-11-01",
                },
                metadata_errors=[
                    ("percentage_float", "Invalid float value: asdf for field percentage_float."),
                ],
            ),
        ),
        TestCase(
            name="invalid_date",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "invalid_date",
                    "name_required": "name",
                    "other_date": "01-02-2024",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "LOC_10.1/2022-11-01",
                },
                metadata_errors=[
                    (
                        "other_date",
                        "Date is 01-02-2024 which is not in the required format YYYY-MM-DD. Parsing error: time data '01-02-2024' does not match format '%Y-%m-%d'",
                    ),
                ],
            ),
        ),
        TestCase(
            name="invalid_boolean",
            input=UnprocessedEntryFactory.create_unprocessed_entry(
                metadata_dict={
                    "submissionId": "invalid_boolean",
                    "name_required": "name",
                    "is_lab_host_bool": "maybe",
                    "required_collection_date": "2022-11-01",
                }
            ),
            expected_output=factory_custom.create_processed_entry(
                metadata_dict={
                    "name_required": "name",
                    "required_collection_date": "2022-11-01",
                    "concatenated_string": "LOC_11.1/2022-11-01",
                },
                metadata_errors=[
                    (
                        "is_lab_host_bool",
                        "Invalid boolean value: maybe for field is_lab_host_bool.",
                    ),
                ],
            ),
        ),
    ]


def sort_annotations(annotations: list[ProcessingAnnotation]):
    return sorted(annotations, key=lambda x: (x.source[0].name, x.message))


accepted_authors = {
    "Xi, L.; Yu, X.;": "Xi, L.; Yu, X.;",
    "Xi,L;Yu,X.;": "Xi, L.; Yu, X.;",
    "Xi,;Yu,X.;": "Xi, ; Yu, X.;",
    "Xi, ;Yu,X.;": "Xi, ; Yu, X.;",
    "Xi,;": "Xi, ;",
    "Smith, Anna Maria; Perez, Jose X.;": "Smith, Anna Maria; Perez, Jose X.;",
    "Smith,Anna Maria;Perez,Jose X;": "Smith, Anna Maria; Perez, Jose X.;",
}
not_accepted_authors = [
    ";",
    ",;",
    ",X.;Yu,X.",
    ",;Yu,X.",
    "Anna Maria Smith; Jose X. Perez",
    "Smith, Anna Maria",
    "Anna Maria Smith;",
    "Smith9, Anna;",
]


class PreprocessingTests(unittest.TestCase):
    def test_valid_authors(self) -> None:
        for author in accepted_authors:
            if valid_authors(author) is not True:
                msg = f"{author} should be accepted but is not."
                raise AssertionError(msg)
        for author in not_accepted_authors:
            if valid_authors(author) is not False:
                msg = f"{author} should not be accepted but is."
                raise AssertionError(msg)

    def format_authors(self) -> None:
        for author, formatted_author in accepted_authors.items():
            if format_authors(author) != formatted_author:
                msg = (
                    f"{author} is not formatted: {format_authors(author)} "
                    f"as expected: {formatted_author}."
                )
                raise AssertionError(msg)

    def test_process_all(self) -> None:
        config: Config = get_config(test_config_file)
        test_cases = get_test_cases(config=config)
        for test_case in test_cases:
            dataset_dir = "temp"  # This is not used as we do not align sequences
            result: list[ProcessedEntry] = process_all([test_case.input], dataset_dir, config)
            processed_entry = result[0]
            if (
                processed_entry.accession != test_case.expected_output.accession
                or processed_entry.version != test_case.expected_output.version
            ):
                message = (
                    f"{test_case.name}: processed entry accessionVersion {processed_entry.accession}"
                    f".{processed_entry.version} does not match expected output "
                    f"{test_case.expected_output.accession}.{test_case.expected_output.version}."
                )
                raise AssertionError(message)
            if processed_entry.data != test_case.expected_output.data:
                message = (
                    f"{test_case.name}: processed metadata {processed_entry.data} does not"
                    f" match expected output {test_case.expected_output.data}."
                )
                raise AssertionError(message)
            if sort_annotations(processed_entry.errors) != sort_annotations(
                test_case.expected_output.errors
            ):
                message = (
                    f"{test_case.name}: processed errors: {processed_entry.errors} does not "
                    f"match expected output: {test_case.expected_output.errors}."
                )
                raise AssertionError(message)
            if sort_annotations(processed_entry.warnings) != sort_annotations(
                test_case.expected_output.warnings
            ):
                message = (
                    f"{test_case.name}: processed warnings {processed_entry.warnings} does not"
                    f" match expected output {test_case.expected_output.warnings}."
                )
                raise AssertionError(message)


if __name__ == "__main__":
    unittest.main()
