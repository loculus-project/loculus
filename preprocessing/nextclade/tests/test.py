import json
import unittest

import pandas as pd

from loculus_preprocessing.config import get_config
from loculus_preprocessing.datatypes import ProcessedEntry, UnprocessedData, UnprocessedEntry
from loculus_preprocessing.prepro import process_all

test_metadata_file = "tests/test_metadata.tsv"
test_config_file = "tests/test_config.yaml"
expected_output_file = "tests/expected_output.json"

with open(expected_output_file, encoding="utf-8") as file:
    expected_output = json.load(file)


def read_in_test_metadata(file: str) -> list[UnprocessedEntry]:
    """
    This mocks fetch_unprocessed_sequences which sends a get request
    to the extract-unprocessed-data endpoint and returns a list of 
    UnprocessedEntry objects.
    """
    df = pd.read_csv(file, sep="\t", dtype=str, keep_default_na=False)
    metadata_list: list[dict[str, str]] = df.to_dict(orient="records")
    unprocessed = []
    for pos, metadata in enumerate(metadata_list):
        unprocessed_entry = UnprocessedEntry(
            accessionVersion=("LOC_" + str(pos) + ".1"),
            data=UnprocessedData(
                submitter="test_submitter",
                metadata=metadata,
                unalignedNucleotideSequences={"main": ""},
            ),
        )
        unprocessed.append(unprocessed_entry)
    return unprocessed


def map_accession_to_submission_id(test_metadata_file: str) -> dict[str, str]:
    df = pd.read_csv(test_metadata_file, sep="\t", dtype=str, keep_default_na=False)
    metadata_list: list[dict[str, str]] = df.to_dict(orient="records")
    map = {}
    for pos, metadata in enumerate(metadata_list):
        map[("LOC_" + str(pos))] = metadata["submissionId"]
    return map


class PreprocessingTests(unittest.TestCase):
    def test_process_all(self) -> None:
        unprocessed = read_in_test_metadata(test_metadata_file)
        map_accessions_to_submissions = map_accession_to_submission_id(test_metadata_file)
        config = get_config(test_config_file)
        processed: list[ProcessedEntry] = process_all(unprocessed, "temp", config)
        for entry in processed:
            submission_id = map_accessions_to_submissions[entry.accession]
            expected_output_entry = expected_output[submission_id]
            error_messages = {error.message for error in entry.errors}
            expected_error_messages = set(expected_output_entry["error_messages"])
            if error_messages != expected_error_messages:
                message = (
                    f"{submission_id}: Error messages: {error_messages} do not match expected "
                    f"error messages: {expected_error_messages}."
                )
                raise AssertionError(message)
            warning_messages = {warning.message for warning in entry.warnings}
            expected_warning_messages = set(expected_output_entry["warning_messages"])
            if warning_messages != expected_warning_messages:
                message = (
                    f"{submission_id}: Error messages: {warning_messages} do not match expected "
                    f"error messages: {expected_warning_messages}."
                )
                raise AssertionError(message)
            if entry.data.metadata != expected_output_entry["fields"]:
                message = (
                    f"{submission_id}: Data: {entry.data.metadata} does not match expected data: "
                    f"{expected_output_entry['fields']}."
                )
                raise AssertionError(message)


if __name__ == "__main__":
    unittest.main()
