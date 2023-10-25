import argparse
import dataclasses
import json
import random
import requests
import time
from typing import List
from typing import Optional
from dataclasses import dataclass, field

parser = argparse.ArgumentParser()
parser.add_argument("--backend-host", type=str, default="127.0.0.1:8079",
                    help="Host address of the Pathoplexus backend")
parser.add_argument("--watch", action="store_true", help="Watch and keep running. Fetches new data every 10 seconds.")

args = parser.parse_args()
host = "http://{}".format(args.backend_host)
watch_mode = args.watch

@dataclass
class AnnotationSource:
    field: str
    type: str

@dataclass
class ProcessingAnnotation:
    source: AnnotationSource
    message: str

@dataclass
class Sequence:
    sequenceId: int
    version: int
    data: dict
    errors: Optional[List[ProcessingAnnotation]] =field(default_factory=list)
    warnings: Optional[List[ProcessingAnnotation]] = field(default_factory=list)


def fetch_unprocessed_sequences(n: int) -> List[Sequence]:
    url = host + "/extract-unprocessed-data"
    params = {"numberOfSequences": n}
    response = requests.post(url, data=params)
    if not response.ok:
        raise Exception("Fetching unprocessed data failed. Status code: {}".format(response.status_code), response.text)
    return parse_ndjson(response.text)


def parse_ndjson(ndjson_data: str) -> List[Sequence]:
    json_strings = ndjson_data.split("\n")
    entries = []
    for json_str in json_strings:
        if json_str:
            json_object = json.loads(json_str)
            entries.append(Sequence(json_object["sequenceId"],json_object["version"], json_object["data"]))
    return entries

def process(unprocessed: List[Sequence]) -> List[Sequence]:
    with open("mock-sequences.json", "r") as f:
        mock_sequences = json.load(f)
    possible_lineages = ["A.1", "A.1.1", "A.2"]

    processed = []
    for sequence in unprocessed:
        metadata = sequence.data.get("metadata", {})
        metadata["pangoLineage"] = random.choice(possible_lineages)

        updated_sequence = Sequence(
            sequence.sequenceId,
            sequence.version,
            {"metadata": metadata, **mock_sequences},
        )

        processed.append(updated_sequence)

    return processed

def submit_processed_sequences(processed: List[Sequence]):
    json_strings = [json.dumps(dataclasses.asdict(sequence)) for sequence in processed]
    ndjson_string = '\n'.join(json_strings)
    url = host + "/submit-processed-data"
    headers = {'Content-Type': 'application/x-ndjson'}
    response = requests.post(url, data=ndjson_string, headers=headers)
    if not response.ok:
        raise Exception("Submitting processed data failed. Status code: {}".format(response.status_code), response.text)

def main():
    total_processed = 0
    locally_processed = 0

    if watch_mode:
        print("Started in watch mode - waiting 10 seconds before fetching data.")
        time.sleep(10)

    while True:
        unprocessed = fetch_unprocessed_sequences(5)
        if len(unprocessed) == 0:
            if watch_mode:
                print("Processed {} sequences. Sleeping for 10 seconds.".format(locally_processed))
                time.sleep(10)
                locally_processed = 0
                continue
            else:
                break
        processed = process(unprocessed)
        submit_processed_sequences(processed)
        total_processed += len(processed)
        locally_processed += len(processed)
    print("Total processed sequences: {}".format(total_processed))


if __name__ == "__main__":
    main()
