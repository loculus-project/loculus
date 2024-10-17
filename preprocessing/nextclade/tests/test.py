import unittest

from factory_methods import ProcessedEntryFactory, TestCase, UnprocessedEntryFactory

from loculus_preprocessing.config import Config, get_config
from loculus_preprocessing.datatypes import (
    ProcessedEntry,
    ProcessingAnnotation,
)
from loculus_preprocessing.prepro import process_all
from loculus_preprocessing.processing_functions import format_frameshift, format_stop_codon

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


class PreprocessingTests(unittest.TestCase):
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

    def test_format_frameshift(self):
        # Test case 1: Empty input
        self.assertEqual(format_frameshift("[]"), "")

        # Test case 2: Single frameshift
        input_single = '[{"cdsName": "GPC", "nucRel": {"begin": 5, "end": 20}, "nucAbs": [{"begin": 97, "end": 112}], "codon": {"begin": 2, "end": 7}, "gapsLeading": {"begin": 1, "end": 2}, "gapsTrailing": {"begin": 7, "end": 8}}]'
        expected_single = "GPC:3-7(nt:98-112)"
        self.assertEqual(format_frameshift(input_single), expected_single)

        # Test case 3: Multiple frameshifts
        input_multiple = '[{"cdsName": "GPC", "nucRel": {"begin": 5, "end": 20}, "nucAbs": [{"begin": 97, "end": 112}], "codon": {"begin": 2, "end": 7}, "gapsLeading": {"begin": 1, "end": 2}, "gapsTrailing": {"begin": 7, "end": 8}}, {"cdsName": "NP", "nucRel": {"begin": 10, "end": 15}, "nucAbs": [{"begin": 200, "end": 205}], "codon": {"begin": 3, "end": 5}, "gapsLeading": {"begin": 2, "end": 3}, "gapsTrailing": {"begin": 5, "end": 6}}]'
        expected_multiple = "GPC:3-7(nt:98-112),NP:4-5(nt:201-205)"
        self.assertEqual(format_frameshift(input_multiple), expected_multiple)

        # Test case 4: Single nucleotide frameshift
        input_single_nuc = '[{"cdsName": "L", "nucRel": {"begin": 30, "end": 31}, "nucAbs": [{"begin": 500, "end": 501}], "codon": {"begin": 10, "end": 11}, "gapsLeading": {"begin": 9, "end": 10}, "gapsTrailing": {"begin": 11, "end": 12}}]'
        expected_single_nuc = "L:11(nt:501)"
        self.assertEqual(format_frameshift(input_single_nuc), expected_single_nuc)

    def test_format_stop_codon(self):
        # Test case 1: Empty input
        self.assertEqual(format_stop_codon("[]"), "")

        # Test case 2: Single stop codon
        input_single = '[{"cdsName": "GPC", "codon": 123}]'
        expected_single = "GPC:124"
        self.assertEqual(format_stop_codon(input_single), expected_single)

        # Test case 3: Multiple stop codons
        input_multiple = '[{"cdsName": "GPC", "codon": 123}, {"cdsName": "NP", "codon": 456}]'
        expected_multiple = "GPC:124,NP:457"
        self.assertEqual(format_stop_codon(input_multiple), expected_multiple)

        # Test case 4: Stop codon at position 0
        input_zero = '[{"cdsName": "L", "codon": 0}]'
        expected_zero = "L:1"
        self.assertEqual(format_stop_codon(input_zero), expected_zero)


if __name__ == "__main__":
    unittest.main()
