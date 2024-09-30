import pandas as pd
from preprocessing import UnprocessedEntry, UnprocessedMetadata
from preprocessing.nextclade.src.loculus_preprocessing import process_all

test_metadata_file = "preprocessing/nextclade/tests/test_metadata.tsv"

def read_in_test_metadata(file: str) -> pd.DataFrame:
    df = pd.read_csv(file, sep="\t", dtype=str, keep_default_na=False)
    metadata_list: list[dict[str, str]] = df.to_dict(orient="records")
    unprocessed = []
    for pos, metadata in enumerate(metadata_list):
        unprocessed_entry = UnprocessedEntry(
            accessionVersion=("LOC_" + pos + ".1"),
            data=UnprocessedMetadata(
                submitter="test_submitter", metadata=metadata, unalignedNucleotideSequences=""
            ),
        )
        unprocessed.append(unprocessed_entry)
    return unprocessed

def test_process_all():
    unprocessed = read_in_test_metadata(test_metadata_file)
    process_all(unprocessed, dataset_dir, config)
