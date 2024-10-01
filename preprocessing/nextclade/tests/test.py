import unittest

import pandas as pd

from loculus_preprocessing.config import get_config
from loculus_preprocessing.datatypes import ProcessedEntry, UnprocessedData, UnprocessedEntry
from loculus_preprocessing.prepro import process_all

test_metadata_file = "tests/test_metadata.tsv"
test_config_file = "tests/test_config.yaml"

def read_in_test_metadata(file: str) -> pd.DataFrame:
    df = pd.read_csv(file, sep="\t", dtype=str, keep_default_na=False)
    metadata_list: list[dict[str, str]] = df.to_dict(orient="records")
    unprocessed = []
    for pos, metadata in enumerate(metadata_list):
        unprocessed_entry = UnprocessedEntry(
            accessionVersion=("LOC_" + str(pos) + ".1"),
            data=UnprocessedData(
                submitter="test_submitter", metadata=metadata, unalignedNucleotideSequences={"main": ""}
            ),
        )
        unprocessed.append(unprocessed_entry)
    return unprocessed

def map_accession_to_submissionId(test_metadata_file: str):
    df = pd.read_csv(test_metadata_file, sep="\t", dtype=str, keep_default_na=False)
    metadata_list: list[dict[str, str]] = df.to_dict(orient="records")
    map = {}
    for pos, metadata in enumerate(metadata_list):
        map[("LOC_" + str(pos) + ".1")] = metadata["submissionId"]


class PreprocessingTests(unittest.TestCase):
    def test_process_all(self):
        unprocessed = read_in_test_metadata(test_metadata_file)
        map = map_accession_to_submissionId(test_metadata_file)
        config = get_config(test_config_file)
        dataset_dir = "temp"
        processed: list[ProcessedEntry] = process_all(unprocessed, dataset_dir, config)
        for entry in processed:
            print(entry.accession)
            print(entry.data.metadata)
            print(entry.errors)
            print(entry.warnings)
            print("\n")

if __name__ == "__main__":
    unittest.main()