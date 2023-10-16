import argparse
import dataclasses
import json
import os
import tempfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import List, Literal, Optional

import requests
from Bio import SeqIO

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


IdVersion = str


@dataclass
class UnprocessedData:
    metadata: Mapping[str, str]
    unalignedNucleotideSequences: Mapping[str, str]


@dataclass
class UnprocessedEntry:
    idVersion: IdVersion  # {sequenceId}.{version}
    data: UnprocessedData


@dataclass
class ProcessedData:
    metadata: Mapping[str, str]
    unalignedNucleotideSequences: Mapping[str, str]
    alignedNucleotideSequences: Mapping[str, str]
    nucleotideInsertions: Mapping[str, str]
    alignedAminoAcidSequences: Mapping[str, str]
    aminoAcidInsertions: Mapping[str, str]


@dataclass
class AnnotationSource:
    field: str
    type: Literal["metadata", "nucleotideSequence"]


@dataclass
class ProcessingAnnotation:
    source: AnnotationSource
    message: str


@dataclass
class ProcessedEntry:
    sequenceId: int
    version: int
    data: ProcessedData
    errors: Optional[List[ProcessingAnnotation]] = field(default_factory=list)
    warnings: Optional[List[ProcessingAnnotation]] = field(default_factory=list)


NextcladeResult = Mapping[str, str]


def fetch_unprocessed_sequences(n: int) -> Sequence[UnprocessedEntry]:
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


def parse_ndjson(ndjson_data: str) -> Sequence[UnprocessedEntry]:
    entries = []
    for json_str in ndjson_data.split("\n"):
        if len(json_str) == 0:
            continue
        json_object = json.loads(json_str)
        unprocessed_data = UnprocessedData(
            metadata=json_object["data"]["metadata"],
            unalignedNucleotideSequences=json_object["data"][
                "unalignedNucleotideSequences"
            ],
        )
        entry = UnprocessedEntry(
            idVersion=f"{json_object['sequenceId']}.{json_object['version']}",
            data=unprocessed_data,
        )
        entries.append(entry)
    return entries


def run_nextclade(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str
) -> Mapping[IdVersion, NextcladeResult]:
    with tempfile.TemporaryDirectory() as result_dir:
        # TODO: Generalize for multiple segments (flu)
        input_file = result_dir + "/input.fasta"
        with open(input_file, "w") as f:
            for sequence in unprocessed:
                f.write(f">{sequence.idVersion}\n")
                f.write(f"{sequence.data.unalignedNucleotideSequences['main']}\n")
        command = (
            "nextclade run "
            + f"--output-all {result_dir} "
            + f"--input-dataset {dataset_dir} "
            + f"-- {input_file}"
        )
        exit_code = os.system(command)
        if exit_code != 0:
            raise Exception("nextclade failed with exit code {}".format(exit_code))
        processed = {
            unprocessed_sequence.idVersion: {
                "unalignedNuc": unprocessed_sequence.data.unalignedNucleotideSequences,
                "alignedNuc": "",
                "alignedTranslations": {},
                "metadata": unprocessed_sequence.data.metadata,
            }
            for unprocessed_sequence in unprocessed
        }

        with open(result_dir + "/nextclade.aligned.fasta", "r") as alignedNucs:
            aligned_nuc = SeqIO.parse(alignedNucs, "fasta")
            for aligned_sequence in aligned_nuc:
                sequence_id = aligned_sequence.id
                processed[sequence_id]["alignedNuc"] = str(aligned_sequence.seq)

        for gene in GENES:
            try:
                with open(
                    result_dir + f"/nextclade_gene_{gene}.translation.fasta", "r"
                ) as alignedTranslations:
                    aligned_translation = SeqIO.parse(alignedTranslations, "fasta")
                    for aligned_sequence in aligned_translation:
                        sequence_id = aligned_sequence.id
                        processed[sequence_id]["alignedTranslations"][gene] = str(
                            aligned_sequence.seq
                        )
            except FileNotFoundError:
                # TODO: Add warning to each sequence
                for id in processed.keys():
                    processed[id]["alignedTranslations"][gene] = ""
                print(f"Gene {gene} not found in Nextclade results")

        # TODO: More QC can be lifted from here
        with open(result_dir + "/nextclade.json") as nextclade_json:
            for result in json.load(nextclade_json)["results"]:
                id = result["seqName"]
                processed[id]["metadata"].update(
                    {
                        "nextcladePangoLineage": result["customNodeAttributes"][
                            "Nextclade_pango"
                        ]
                    }
                )
        return processed


def id_from_str(id_str: IdVersion) -> int:
    return int(id_str.split(".")[0])


def version_from_str(id_str: IdVersion) -> int:
    return int(id_str.split(".")[1])


def process(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str
) -> Sequence[ProcessedEntry]:
    nextclade_results = run_nextclade(unprocessed, dataset_dir)
    processed = [
        ProcessedEntry(
            sequenceId=id_from_str(sequence_id),
            version=version_from_str(sequence_id),
            data=ProcessedData(
                metadata=nextclade_results[sequence_id]["metadata"],
                unalignedNucleotideSequences=nextclade_results[sequence_id][
                    "unalignedNuc"
                ],
                alignedNucleotideSequences={
                    "main": nextclade_results[sequence_id]["alignedNuc"]
                },
                nucleotideInsertions={"main": []},
                alignedAminoAcidSequences=nextclade_results[sequence_id][
                    "alignedTranslations"
                ],
                aminoAcidInsertions={gene: [] for gene in GENES},
            ),
        )
        for sequence_id in nextclade_results.keys()
    ]

    return processed


def submit_processed_sequences(processed: Sequence[ProcessedEntry]):
    json_strings = [json.dumps(dataclasses.asdict(sequence)) for sequence in processed]
    ndjson_string = "\n".join(json_strings)
    url = host + "/submit-processed-data"
    headers = {"Content-Type": "application/x-ndjson"}
    response = requests.post(url, data=ndjson_string, headers=headers)
    if not response.ok:
        raise Exception(
            f"Submitting processed data failed. Status code: {response.status_code}\n"
            + f"Response: {response.text}\n"
            + f"Data sent in request: {ndjson_string}\n"
        )
    print(response.text)


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
            unprocessed = fetch_unprocessed_sequences(200)
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
