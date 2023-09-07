from dataclasses import dataclass, field
import os
import tempfile
from typing import List, Optional
from Bio import SeqIO

import argparse
import dataclasses
import requests
import json

parser = argparse.ArgumentParser()
parser.add_argument(
    "--backend-host",
    type=str,
    default="127.0.0.1",
    help="Host address of the Pathoplexus backend",
)
args = parser.parse_args()
host = "http://{}:8079".format(args.backend_host)

GENES = [
    "ORF1a",
    "ORF1b",
    "S",
    "ORF3a",
    "E",
    "M",
    "ORF6",
    "ORF7a",
    "ORF7b",
    "ORF8",
    "N",
    "ORF9b",
]


@dataclass
class InputData:
    metadata: dict
    unalignedNucleotideSequences: str


@dataclass
class AnnotationSource:
    field: str
    type: str

@dataclass
class ProcessingAnnotation:
    source: AnnotationSource
    message: str

@dataclass
class OutputData:
    metadata: dict
    unalignedNucleotideSequences: str
    alignedNucleotideSequences: str
    alignedTranslations: dict[str, str]

@dataclass
class InputSequence:
    sequenceId: int
    data: InputData


@dataclass
class OutputSequence:
    sequenceId: int
    data: OutputData
    errors: Optional[List[ProcessingAnnotation]] = field(default_factory=list)
    warnings: Optional[List[ProcessingAnnotation]] = field(default_factory=list)


def fetch_unprocessed_sequences(n: int) -> List[InputSequence]:
    url = host + "/extract-unprocessed-data"
    params = {"numberOfSequences": n}
    response = requests.post(url, data=params)
    if not response.ok:
        raise Exception(
            "Fetching unprocessed data failed. Status code: {}".format(
                response.status_code
            ),
            response.text,
        )
    return parse_ndjson(response.text)


def parse_ndjson(ndjson_data: str) -> List[InputSequence]:
    json_strings = ndjson_data.split("\n")
    entries = []
    for json_str in json_strings:
        if json_str:
            json_object = json.loads(json_str)
            entries.append(
                InputSequence(
                    json_object["sequenceId"], InputData(json_object["data"]["nucleotideSequences"]["main"])
                )
            )
    return entries


def process(
    unprocessed: List[InputSequence], dataset_dir: str
) -> List[OutputSequence]:
    # Create tmpdir with system call
    with tempfile.TemporaryDirectory() as result_dir:
        # Write sequences to file
        input_file = result_dir + "/input.fasta"
        with open(input_file, "w") as f:
            for sequence in unprocessed:
                f.write(f">{sequence.sequenceId}\n")
                f.write(f"{(sequence.data).unalignedNucleotideSequences}\n")
        # Prep nextclade run
        command = (
            "nextclade run "
            + f"--output-all {result_dir} "
            + f"--input-dataset {dataset_dir} "
            + f"-- {input_file}"
        )
        print("Running command: {}".format(command))
        exit_code = os.system(command)
        if exit_code != 0:
            raise Exception(
                "nextclade failed with exit code {}".format(exit_code)
            )

        processed = {
            unprocessed_sequence.sequenceId: {
                "unalignedNuc": unprocessed_sequence.data.unalignedNucleotideSequences,
                "alignedNuc": "",
                "alignedTranslations": {},
                "lineage": "",
            }
            for unprocessed_sequence in unprocessed
        }

        with open(result_dir + "/nextclade.aligned.fasta", "r") as alignedNucs:
            aligned_nuc = SeqIO.parse(alignedNucs, "fasta")
            for aligned_sequence in aligned_nuc:
                sequence_id = int(aligned_sequence.id)
                processed[sequence_id]["alignedNuc"] = str(aligned_sequence.seq)
        
        # TODO: Translations

        # More QC can be lifted from here
        with open(result_dir + "/nextclade.json") as nextclade_json:
            for result in json.load(nextclade_json)["results"]:
                id = int(result["seqName"])
                processed[id].update(
                    {
                        "lineage": result["customNodeAttributes"][
                            "Nextclade_pango"
                        ]
                    }
                )

        # Parse results
        # Put results in OutputSequence objects
        processed = [
            OutputSequence(
                sequence_id,
                OutputData(
                    processed[sequence_id]["unalignedNuc"],
                    processed[sequence_id]["alignedNuc"],
                    {},
                    processed[sequence_id]["lineage"],
                ),
            )
            for sequence_id in processed
        ]

    return processed


def submit_processed_sequences(processed: List[OutputSequence]):
    json_strings = [
        json.dumps(dataclasses.asdict(sequence)) for sequence in processed
    ]
    ndjson_string = "\n".join(json_strings)
    url = host + "/submit-processed-data"
    headers = {"Content-Type": "application/x-ndjson"}
    response = requests.post(url, data=ndjson_string, headers=headers)
    if not response.ok:
        raise Exception(
            "Submitting processed data failed. Status code: {}".format(
                response.status_code
            ),
            response.text,
        )


def main():
    # Make tempdir for Nextclade dataset
    with tempfile.TemporaryDirectory() as dataset_dir:
        # Download Nextclade dataset
        dataset_download_command = (
            "nextclade dataset get "
            + "--name sars-cov-2 "
            + f"--output-dir {dataset_dir}"
        )
        print(f"Downloading Nextclade dataset: {dataset_download_command}")
        if os.system(dataset_download_command) != 0:
            raise Exception("Dataset download failed")
        total_processed = 0
        while True:
            unprocessed = fetch_unprocessed_sequences(20)
            if len(unprocessed) == 0:
                # Later on there would be a sleep here, for now we just break
                break
            # Process the sequences, get result as dictionary
            processed = process(unprocessed, dataset_dir)
            # Submit the result
            submit_processed_sequences(processed)
            total_processed += len(processed)
            print("Processed {} sequences".format(len(processed)))
        print("Total processed sequences: {}".format(total_processed))


if __name__ == "__main__":
    main()
