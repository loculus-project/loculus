from dataclasses import dataclass
from typing import List

import argparse
import dataclasses
import requests
import json
import random

parser = argparse.ArgumentParser()
parser.add_argument("--backend-host", type=str, default="127.0.0.1",
                    help="Host address of the Pathoplexus backend")
args = parser.parse_args()
host = "http://{}:8079".format(args.backend_host)


@dataclass
class Sequence:
    sequenceId: int
    data: dict


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
            entries.append(Sequence(json_object["sequenceId"], json_object["data"]))
    return entries


def process(unprocessed: List[Sequence]) -> List[Sequence]:
    with open("mock-sequences.json", "r") as f:
        mock_sequences = json.load(f)
    possible_lineages = ["A.1", "A.1.1", "A.2"]

    processed = []
    for sequence in unprocessed:
        processed.append(Sequence(
            sequence.sequenceId,
            {**sequence.data, **mock_sequences, "lineage": random.choice(possible_lineages)}
        ))

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
    while True:
        unprocessed = fetch_unprocessed_sequences(5)
        if len(unprocessed) == 0:
            break
        processed = process(unprocessed)
        submit_processed_sequences(processed)
        total_processed += len(processed)
    print("Total processed sequences: {}".format(total_processed))


if __name__ == "__main__":
    main()
