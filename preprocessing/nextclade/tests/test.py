import unittest
from unittest import mock

import pandas as pd
from loculus_preprocessing.prepro import process_all
from loculus_preprocessing.datatypes import UnprocessedEntry, UnprocessedData
from loculus_preprocessing.config import get_config

test_metadata_file = "tests/test_metadata.tsv"
test_config_file = "tests/config.yaml"

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

class PreprocessingTests(unittest.TestCase):
    def test_process_all(self):
        unprocessed = read_in_test_metadata(test_metadata_file)
        print(unprocessed)
        config = get_config()
        print(config)
        dataset_dir = "temp"
        processed = process_all(unprocessed, dataset_dir, config)
        

if __name__ == "__main__":
    unittest.main()
