import unittest

from factory_methods import ProcessedEntryFactory, UnprocessedEntryFactory

from loculus_preprocessing.config import get_config
from loculus_preprocessing.datatypes import (
    ProcessedEntry,
    ProcessingAnnotation,
)
from loculus_preprocessing.prepro import process_all

test_config_file = "tests/test_config.yaml"

test_cases = [
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "missing_required_fields",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": None,
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": None,
                "other_date": None,
                "is_lab_host_bool": None,
                "required_collection_date": None,
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
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "missing_one_required_field",
                "name_required": "name",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": None,
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
                "required_collection_date": None,
                "concatenated_string": "LOC_1.1",
            },
            metadata_errors=[
                (
                    "required_collection_date",
                    "Metadata field required_collection_date is required.",
                ),
            ],
        ),
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "invalid_option",
                "continent": "Afrika",
                "name_required": "name",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": None,
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
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
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "collection_date_in_future",
                "collection_date": "2088-12-01",
                "name_required": "name",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": "2088-12-01",
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
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
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "invalid_collection_date",
                "collection_date": "01-02-2024",
                "name_required": "name",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": None,
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
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
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "invalid_timestamp",
                "sequenced_timestamp": " 2022-11-01Europe",
                "name_required": "name",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": None,
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
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
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "date_only_year",
                "collection_date": "2023",
                "name_required": "name",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": "2023-01-01",
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
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
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "date_no_day",
                "collection_date": "2023-12",
                "name_required": "name",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": "2023-12-01",
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
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
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "invalid_int",
                "age_int": "asdf",
                "name_required": "name",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": None,
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
                "required_collection_date": "2022-11-01",
                "concatenated_string": "LOC_8.1/2022-11-01",
            },
            metadata_errors=[
                ("age_int", "Invalid int value: asdf for field age_int."),
            ],
        ),
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "invalid_float",
                "percentage_float": "asdf",
                "name_required": "name",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": None,
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
                "required_collection_date": "2022-11-01",
                "concatenated_string": "LOC_9.1/2022-11-01",
            },
            metadata_errors=[
                ("percentage_float", "Invalid float value: asdf for field percentage_float."),
            ],
        ),
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "invalid_date",
                "name_required": "name",
                "other_date": "01-02-2024",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": None,
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
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
    },
    {
        "input": UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict={
                "submissionId": "invalid_boolean",
                "name_required": "name",
                "is_lab_host_bool": "maybe",
                "required_collection_date": "2022-11-01",
            }
        ),
        "expected_output": ProcessedEntryFactory.create_processed_entry(
            metadata_dict={
                "continent": None,
                "collection_date": None,
                "sequenced_timestamp": None,
                "age_int": None,
                "percentage_float": None,
                "name_required": "name",
                "other_date": None,
                "is_lab_host_bool": None,
                "required_collection_date": "2022-11-01",
                "concatenated_string": "LOC_11.1/2022-11-01",
            },
            metadata_errors=[
                ("is_lab_host_bool", "Invalid boolean value: maybe for field is_lab_host_bool."),
            ],
        ),
    },
]


def sort_annotations(annotations: list[ProcessingAnnotation]):
    return sorted(annotations, key=lambda x: (x.source[0].name, x.message))


class PreprocessingTests(unittest.TestCase):
    def test_process_all(self) -> None:
        config = get_config(test_config_file)
        for test_case in test_cases:
            dataset_dir = "temp"  # This is not used as we do not align sequences
            result: list[ProcessedEntry] = process_all([test_case["input"]], dataset_dir, config)
            submission_id = test_case["input"].data.metadata["submissionId"]
            processed_entry = result[0]
            if (
                processed_entry.accession != test_case["expected_output"].accession
                or processed_entry.version != test_case["expected_output"].version
            ):
                message = (
                    f"{submission_id}: processed entry accessionVersion {processed_entry.accession}"
                    f".{processed_entry.version} does not match expected output "
                    f"{test_case["expected_output"].accession}.{test_case["expected_output"].version}."
                )
                raise AssertionError(message)
            if processed_entry.data != test_case["expected_output"].data:
                message = (
                    f"{submission_id}: processed metadata {processed_entry.data} does not"
                    f" match expected output {test_case["expected_output"].data}."
                )
                raise AssertionError(message)
            if sort_annotations(processed_entry.errors) != sort_annotations(
                test_case["expected_output"].errors
            ):
                message = (
                    f"{submission_id}: processed errors: {processed_entry.errors} does not "
                    f"match expected output: {test_case["expected_output"].errors}."
                )
                raise AssertionError(message)
            if sort_annotations(processed_entry.warnings) != sort_annotations(
                test_case["expected_output"].warnings
            ):
                message = (
                    f"{submission_id}: processed warnings {processed_entry.warnings} does not"
                    f" match expected output {test_case["expected_output"].warnings}."
                )
                raise AssertionError(message)


if __name__ == "__main__":
    unittest.main()
